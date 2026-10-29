#!/usr/bin/env python3
"""Grooveville GPU worker — runs the heavy engines for the /api/gen gateway.

Run it on a machine with a GPU (or CPU for encode/transcribe):
    GEN_WORKER_TOKEN=<same secret as Cloudflare> python3 worker.py --port 8787
Then set GEN_WORKER_URL (public https URL of this server) and GEN_WORKER_TOKEN in Cloudflare.

Protocol (all requests carry  Authorization: Bearer GEN_WORKER_TOKEN):
  GET  /health                -> {"engines": {name: {"available": bool, "reason": str, "model": str}}, "worker": str, "gpu": str}
  POST /jobs                  -> body from the gateway: {id, engine, params, inputs:[{name,url}], upload, callback, deadlineSec}
  POST /jobs/<id>/cancel
Results are PUT to  upload + <file name>  and reported to  callback  with header x-gen-signature = HMAC-SHA256(token, body).
Only Python's standard library is needed for the worker itself; each engine needs its own model install (see README.md)."""
import hashlib, hmac, json, os, queue, shutil, subprocess, sys, tempfile, threading, time, traceback, urllib.request, urllib.error, urllib.parse, importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("GEN_WORKER_TOKEN", "")
NAME = os.environ.get("GEN_WORKER_NAME", "grooveville-gpu-1")
JOBS, Q, CANCEL = {}, queue.Queue(), set()

def gpu_name():
    try: return subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], capture_output=True, text=True, timeout=5).stdout.strip() or "none"
    except Exception: return "none"
def has(cmd): return shutil.which(cmd) is not None
def mod(name): return importlib.util.find_spec(name) is not None

def ffprobe_duration(path):
    try: return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, timeout=60).stdout.strip() or 0)
    except Exception: return 0.0
def run(cmd, job, timeout):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    t0 = time.time(); out = []
    while p.poll() is None:
        if job["id"] in CANCEL: p.kill(); raise RuntimeError("canceled")
        if time.time() - t0 > timeout: p.kill(); raise RuntimeError("timed out after %ds" % timeout)
        line = p.stdout.readline()
        if line: out.append(line)
    out.append(p.stdout.read() or "")
    if p.returncode != 0: raise RuntimeError("".join(out)[-600:] or "command failed")
    return "".join(out)

# ---------------- engines ----------------
# each: available() -> (bool, reason, model), run(job, workdir, inputs) -> list of output file paths (+ optional meta)
class Encode:
    model = "FFmpeg"
    def available(self): return (has("ffmpeg"), "" if has("ffmpeg") else "ffmpeg is not installed", self.model)
    def run(self, job, wd, inputs, prog):
        p = job.get("params") or {}; op = p.get("op", "mp3"); outs = []
        if op in ("mp3", "wav", "flac", "resample"):
            for f in inputs:
                base = os.path.splitext(os.path.basename(f))[0]
                if op == "mp3": o = os.path.join(wd, base + ".mp3"); args = ["-c:a", "libmp3lame", "-b:a", str(int(p.get("bitrate", 320))) + "k"]
                elif op == "flac": o = os.path.join(wd, base + ".flac"); args = ["-c:a", "flac"]
                else: o = os.path.join(wd, base + ".wav"); args = ["-c:a", "pcm_s24le"]
                sr = int(p.get("sampleRate", 0) or 0)
                run(["ffmpeg", "-v", "error", "-y", "-i", f] + (["-ar", str(sr)] if sr else []) + ["-ac", "2"] + args + [o], job, 900); outs.append(o)
        elif op == "concat":   # join video clips in order (re-encoded so mixed sources work)
            lst = os.path.join(wd, "list.txt"); open(lst, "w").write("".join("file '%s'\n" % f.replace("'", "'\\''") for f in inputs))
            o = os.path.join(wd, "assembled.mp4"); run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", o], job, 1800); outs.append(o)
        elif op == "mux":      # first input video + second input audio
            o = os.path.join(wd, "with-audio.mp4"); run(["ffmpeg", "-v", "error", "-y", "-i", inputs[0], "-i", inputs[1], "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", o], job, 1800); outs.append(o)
        else: raise RuntimeError("unknown op " + op)
        return outs

class Separate:   # Demucs v4 (pip install demucs). Code is MIT; confirm the weights' license for commercial use.
    model = "Demucs htdemucs"
    def available(self): ok = mod("demucs"); return (ok, "" if ok else "pip install demucs (and a CUDA build of torch)", self.model)
    def run(self, job, wd, inputs, prog):
        p = job.get("params") or {}; m = p.get("model", "htdemucs")
        run([sys.executable, "-m", "demucs", "-n", m, "-o", wd] + (["--two-stems", "vocals"] if int(p.get("stems", 4)) == 2 else []) + [inputs[0]], job, 1200)
        d = os.path.join(wd, m, os.path.splitext(os.path.basename(inputs[0]))[0])
        return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".wav")]

class Transcribe:  # Spotify Basic Pitch (pip install basic-pitch), Apache-2.0
    model = "Basic Pitch"
    def available(self): ok = has("basic-pitch"); return (ok, "" if ok else "pip install basic-pitch", self.model)
    def run(self, job, wd, inputs, prog):
        out = os.path.join(wd, "out"); os.makedirs(out); run(["basic-pitch", out, inputs[0]], job, 600)
        return [os.path.join(out, f) for f in os.listdir(out) if f.endswith(".mid")]

class Music:  # ACE-Step 1.5 REST server (uv run acestep-api), MIT. Set ACESTEP_URL (default http://127.0.0.1:8001)
    model = "ACE-Step 1.5"
    url = os.environ.get("ACESTEP_URL", "http://127.0.0.1:8001").rstrip("/")
    def available(self):
        try:
            with urllib.request.urlopen(self.url + "/health", timeout=4) as r: return (r.status == 200, "", self.model)
        except Exception as e: return (False, "ACE-Step API not reachable at %s (start it with: uv run acestep-api)" % self.url, self.model)
    def run(self, job, wd, inputs, prog):
        p = job.get("params") or {}
        body = {"caption": str(p.get("caption", ""))[:512], "lyrics": str(p.get("lyrics", ""))[:4096] or "[Instrumental]", "audio_duration": max(10, min(600, float(p.get("duration", 120)))),
                "batch_size": max(1, min(4, int(p.get("candidates", 1)))), "audio_format": "wav"}
        if p.get("bpm"): body["bpm"] = int(float(p["bpm"]))
        if p.get("key"): body["key_scale"] = str(p["key"]).replace("♯", "#").replace(" minor", " minor").replace(" major", " major")
        if p.get("task") in ("repaint", "cover") and inputs:
            body["task_type"] = p["task"]; body["src_audio_path"] = inputs[0]
            if p["task"] == "repaint": body["repainting_start"] = float(p.get("start", 0)); body["repainting_end"] = float(p.get("end", -1))
        req = urllib.request.Request(self.url + "/v1/music/generate", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
        jid = json.load(urllib.request.urlopen(req, timeout=60))["job_id"]
        t0 = time.time()
        while True:
            if job["id"] in CANCEL: raise RuntimeError("canceled")
            if time.time() - t0 > 900: raise RuntimeError("ACE-Step took too long")
            st = json.load(urllib.request.urlopen(self.url + "/v1/jobs/" + jid, timeout=30))
            if st.get("status") == "succeeded": break
            if st.get("status") == "failed": raise RuntimeError(str(st.get("error") or "ACE-Step failed"))
            prog(0.1 + min(0.8, (time.time() - t0) / max(30, float(st.get("eta_seconds") or 60))), "generating")
            time.sleep(2)
        outs = []
        for i, path in enumerate((st.get("result") or {}).get("audio_paths") or []):
            u = path if path.startswith("http") else self.url + (path if path.startswith("/v1/") else "/v1/audio?path=" + urllib.parse.quote(path))
            o = os.path.join(wd, "candidate-%d.wav" % (i + 1)); urllib.request.urlretrieve(u, o); outs.append(o)
        return outs

class Video:  # Wan 2.1 T2V 1.3B via diffusers, Apache-2.0 (~8 GB VRAM, about 4 minutes per 5 s clip on an RTX 4090)
    model = "Wan 2.1 T2V 1.3B (diffusers)"
    pipe = None
    def available(self):
        ok = mod("diffusers") and mod("torch")
        if ok:
            import torch; ok = torch.cuda.is_available()
            return (ok, "" if ok else "No CUDA GPU", self.model)
        return (False, "pip install diffusers transformers accelerate ftfy torch", self.model)
    def run(self, job, wd, inputs, prog):
        import torch
        from diffusers import WanPipeline
        from diffusers.utils import export_to_video
        p = job.get("params") or {}
        if Video.pipe is None:
            Video.pipe = WanPipeline.from_pretrained(os.environ.get("WAN_MODEL", "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"), torch_dtype=torch.bfloat16); Video.pipe.to("cuda")
        w, h = (832, 480) if p.get("aspect", "16:9") == "16:9" else (480, 832) if p.get("aspect") == "9:16" else (624, 624)
        prompt = str(p.get("prompt", ""))[:1500] + (" Camera: " + str(p["camera"])[:200] if p.get("camera") else "")
        frames = Video.pipe(prompt=prompt, negative_prompt=str(p.get("negative", "blurry, low quality, distorted, text, watermark")), height=h, width=w, num_frames=max(17, min(81, int(float(p.get("seconds", 5)) * 16) // 4 * 4 + 1)), guidance_scale=5.0).frames[0]
        o = os.path.join(wd, "clip.mp4"); export_to_video(frames, o, fps=16); return [o]

class Template:  # voice engines: run a command template the founder configures after installing RVC / DiffSinger
    def __init__(self, env, model): self.env, self.model = env, model
    def available(self):
        c = os.environ.get(self.env, ""); return (bool(c), "" if c else "Set %s to the installed command (see README.md)" % self.env, self.model)
    def run(self, job, wd, inputs, prog):
        p = job.get("params") or {}
        fill = {"input": inputs[0] if inputs else "", "inputs": " ".join(inputs), "outdir": wd, "voice": str(p.get("voiceId", "")), "pitch": str(int(p.get("pitch", 0))), "params": os.path.join(wd, "params.json")}
        json.dump(p, open(fill["params"], "w"))
        run(["bash", "-c", os.environ[self.env].format(**fill)], job, 10800)
        return [os.path.join(wd, f) for f in os.listdir(wd) if os.path.splitext(f)[1].lower() in (".wav", ".mp3", ".flac", ".pth", ".index", ".zip")]

ENGINES = {"encode": Encode(), "separate": Separate(), "transcribe": Transcribe(), "music": Music(), "video": Video(),
           "voice-train": Template("RVC_TRAIN_CMD", "RVC v2"), "voice-convert": Template("RVC_INFER_CMD", "RVC v2"), "voice-sing": Template("SING_CMD", "DiffSinger")}

# ---------------- job loop ----------------
def post(url, body):
    raw = json.dumps(body).encode(); sig = hmac.new(TOKEN.encode(), raw, hashlib.sha256).hexdigest()
    req = urllib.request.Request(url, data=raw, headers={"content-type": "application/json", "x-gen-signature": sig})
    try: urllib.request.urlopen(req, timeout=30).read()
    except Exception as e: print("callback failed:", e, file=sys.stderr)
def upload(base, path):
    name = os.path.basename(path).replace(" ", "_"); ct = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".mid": "audio/midi", ".mp4": "video/mp4", ".png": "image/png"}.get(os.path.splitext(name)[1].lower(), "application/octet-stream")
    with open(path, "rb") as f: data = f.read()
    req = urllib.request.Request(base + urllib.parse.quote(name), data=data, method="PUT", headers={"content-type": ct, "content-length": str(len(data))})
    urllib.request.urlopen(req, timeout=600).read(); return name
def work():
    while True:
        job = Q.get(); jid = job["id"]; t0 = time.time(); wd = tempfile.mkdtemp(prefix="gen-" + jid + "-")
        prog = lambda f, m="": post(job["callback"], {"id": jid, "status": "running", "progress": f, "message": m})
        try:
            if jid in CANCEL: raise RuntimeError("canceled")
            prog(0.02, "downloading inputs"); inputs = []
            for i, it in enumerate(job.get("inputs") or []):
                p = os.path.join(wd, "in-%d-%s" % (i, os.path.basename(it["name"]))); urllib.request.urlretrieve(it["url"], p); inputs.append(p)
            prog(0.08, "running " + job["engine"])
            outs = ENGINES[job["engine"]].run(job, wd, inputs, prog)
            prog(0.95, "uploading results"); res = []
            for o in outs:
                n = upload(job["upload"], o); res.append({"name": n, "duration": ffprobe_duration(o) if has("ffprobe") and os.path.splitext(o)[1].lower() in (".wav", ".mp3", ".flac", ".mp4") else 0})
            post(job["callback"], {"id": jid, "status": "succeeded", "outputs": res, "gpuSeconds": round(time.time() - t0, 1)})
        except Exception as e:
            canceled = str(e) == "canceled"; traceback.print_exc()
            post(job["callback"], {"id": jid, "status": "canceled" if canceled else "failed", "error": str(e)[-500:], "gpuSeconds": round(time.time() - t0, 1)})
        finally:
            JOBS.pop(jid, None); shutil.rmtree(wd, ignore_errors=True)

class H(BaseHTTPRequestHandler):
    def _auth(self): return TOKEN and hmac.compare_digest(self.headers.get("authorization", ""), "Bearer " + TOKEN)
    def _send(self, code, obj): b = json.dumps(obj).encode(); self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass
    def do_GET(self):
        if not self._auth(): return self._send(401, {"error": "unauthorized"})
        if self.path == "/health":
            eng = {}
            for k, e in ENGINES.items():
                try: ok, why, model = e.available()
                except Exception as ex: ok, why, model = False, str(ex)[:200], getattr(e, "model", "")
                eng[k] = {"available": bool(ok), "reason": why, "model": model}
            return self._send(200, {"engines": eng, "worker": NAME, "gpu": gpu_name(), "queue": Q.qsize()})
        self._send(404, {"error": "not found"})
    def do_POST(self):
        if not self._auth(): return self._send(401, {"error": "unauthorized"})
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0) or 0)) or b"{}")
        if self.path == "/jobs":
            if body.get("engine") not in ENGINES: return self._send(400, {"error": "unknown engine"})
            if not ENGINES[body["engine"]].available()[0]: return self._send(503, {"error": "engine not installed"})
            JOBS[body["id"]] = body; Q.put(body); return self._send(202, {"ok": True, "queued": Q.qsize()})
        if self.path.startswith("/jobs/") and self.path.endswith("/cancel"):
            CANCEL.add(self.path.split("/")[2]); return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

if __name__ == "__main__":
    import urllib.parse
    if not TOKEN: sys.exit("Set GEN_WORKER_TOKEN (the same value as in Cloudflare)")
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8787
    for _ in range(int(os.environ.get("GEN_WORKERS", "1"))): threading.Thread(target=work, daemon=True).start()
    print("Grooveville GPU worker on :%d" % port); ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
