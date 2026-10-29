/* Grooveville generation gateway (/api/gen/*)
   One front door for every heavy engine (music, voices, stems, MIDI, video, encoding). This Worker never runs a model itself:
   it checks who is asking, validates files, enforces budgets and limits, queues jobs, hands them to a GPU worker that the
   founder runs (see gpu-worker/), receives signed results, stores them in R2 and keeps job status.
   Secrets (Cloudflare build variables): GEN_WORKER_URL, GEN_WORKER_TOKEN. Limits: GEN_MONTHLY_LIMIT_USD (default 0 = paid GPU
   engines stay off until the founder sets a budget), GEN_GPU_USD_PER_HOUR (what your GPU host charges), GEN_DAILY_JOBS (default 30).
   An engine is only reported "operational" after a real verification job finished and its outputs passed checks. */
import { caller, fsDoc, rj, wj, hmacHex, safeEq, KEY_RE } from "./creative.js";

const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const SOUND = ["admin", "producer"], MAKERS = ["admin", "writer", "illustrator", "animator", "gamedev", "editor"];
const AUDIO = /^audio\/|\.(wav|mp3|flac|m4a|ogg|webm|aif|aiff)$/i, VIDEO = /^video\/|\.(mp4|webm|mov)$/i, IMAGE = /^image\/|\.(png|jpe?g|webp)$/i, MIDI = /\.(mid|midi)$/i;
/* model registry: what each engine is for, the model the reference GPU worker uses, its license, limits and output checks */
export const ENGINES = {
  encode: { label: "Audio & video encoding", model: "FFmpeg (libmp3lame, libx264, AAC)", license: "LGPL/GPL build of FFmpeg", gpu: false, roles: SOUND.concat(MAKERS), inputs: [1, 40], accept: [AUDIO, VIDEO, IMAGE], maxSec: 900, estSec: 30,
    caps: ["mp3", "wav", "flac", "resample", "concat", "mux"], check: o => o.length >= 1 },
  separate: { label: "Stem separation", model: "Demucs v4 (htdemucs)", license: "Code MIT. Weight license unclear for commercial use; confirm with Meta before release use", gpu: true, roles: SOUND, inputs: [1, 1], accept: [AUDIO], maxSec: 1200, estSec: 120,
    caps: ["vocals", "drums", "bass", "other"], check: o => o.filter(x => AUDIO.test(x.name)).length >= 2 },
  transcribe: { label: "Audio to MIDI", model: "Spotify Basic Pitch", license: "Apache-2.0", gpu: false, roles: SOUND, inputs: [1, 1], accept: [AUDIO], maxSec: 600, estSec: 40, caps: ["polyphonic"], check: o => o.some(x => MIDI.test(x.name)) },
  music: { label: "Music generation", model: "ACE-Step 1.5", license: "MIT", gpu: true, roles: SOUND, inputs: [0, 1], accept: [AUDIO], maxSec: 900, estSec: 90,
    caps: ["text2music", "lyrics", "instrumental", "repaint", "cover", "candidates"], check: (o, j) => o.filter(x => AUDIO.test(x.name)).length >= 1 && o.every(x => !x.duration || x.duration >= 4) },
  "voice-train": { label: "Voice DNA training", model: "RVC v2 (Retrieval-based Voice Conversion)", license: "MIT", gpu: true, roles: SOUND, inputs: [1, 40], accept: [AUDIO], maxSec: 10800, estSec: 3600, voice: true, caps: ["train"], check: o => o.some(x => /\.(pth|index|zip)$/i.test(x.name)) },
  "voice-convert": { label: "Voice conversion", model: "RVC v2", license: "MIT", gpu: true, roles: SOUND, inputs: [1, 1], accept: [AUDIO], maxSec: 900, estSec: 60, voice: true, caps: ["pitch-shift", "index-rate"], check: o => o.some(x => AUDIO.test(x.name)) },
  "voice-sing": { label: "Singing synthesis", model: "DiffSinger (OpenVPI) with a voicebank trained on the singer", license: "Apache-2.0", gpu: true, roles: SOUND, inputs: [1, 2], accept: [MIDI, /\.(json|ds)$/i], maxSec: 900, estSec: 120, voice: true, caps: ["lyrics", "melody", "vibrato", "breathiness"], check: o => o.some(x => AUDIO.test(x.name)) },
  video: { label: "Video generation", model: "Wan 2.1 text-to-video 1.3B (480p)", license: "Apache-2.0", gpu: true, roles: MAKERS, inputs: [0, 4], accept: [IMAGE], maxSec: 1800, estSec: 300, caps: ["text2video", "480p", "5s"], check: o => o.some(x => VIDEO.test(x.name)) }
};
const jobKey = id => "gen/jobs/" + id + ".json", userKey = uid => "gen/users/" + uid + ".json", ACTIVE = "gen/active.json", HEALTH = "gen/health.json", verKey = e => "gen/verify/" + e + ".json", spendKey = () => "gen/spend/" + new Date().toISOString().slice(0, 7) + ".json";
const ID_RE = /^[a-z0-9]{8,40}$/, NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,100}$/;
const cfgOk = env => !!(env.GEN_WORKER_URL && env.GEN_WORKER_TOKEN);
const base = (env, url) => (env.SITE_URL || url.origin).replace(/\/$/, "");
const now = () => new Date().toISOString();
const can = (u, e) => u && (u.founder || ENGINES[e].roles.includes(u.creative));
function canKey(u, key) { if (!KEY_RE.test(key) || key.includes("..")) return false; if (u.founder) return true; return key.startsWith("soundlab/") ? SOUND.includes(u.creative) : !!u.creative && u.creative !== "viewer" }
async function health(env, fetcher, force) {
  if (!cfgOk(env)) return { ok: false, reason: "No GPU worker configured (GEN_WORKER_URL and GEN_WORKER_TOKEN are not set)", engines: {} };
  const c = await rj(env, HEALTH, null); if (c && !force && Date.now() - c.t < 300000) return c;
  let h; try { const r = await (fetcher || fetch)(env.GEN_WORKER_URL.replace(/\/$/, "") + "/health", { headers: { authorization: "Bearer " + env.GEN_WORKER_TOKEN }, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }); const j = await r.json(); h = { ok: r.ok, t: Date.now(), engines: j.engines || {}, worker: j.worker || "", gpu: j.gpu || "", reason: r.ok ? "" : "Worker answered " + r.status } }
  catch (e) { h = { ok: false, t: Date.now(), engines: {}, reason: "GPU worker unreachable: " + String(e.message || e).slice(0, 120) } }
  await wj(env, HEALTH, h); return h;
}
async function engineStatus(env, fetcher, force) {
  const h = await health(env, fetcher, force), out = {};
  for (const [k, E] of Object.entries(ENGINES)) {
    const eh = h.engines[k] || {}, v = await rj(env, verKey(k), null);
    let status = "not connected", detail = h.reason || "";
    if (h.ok) { if (!eh.available) { status = "not installed"; detail = eh.reason || "The GPU worker doesn't have this engine installed" } else if (v && v.ok && Date.now() - Date.parse(v.at) < 30 * 864e5) { status = "operational"; detail = "Verified " + v.at.slice(0, 10) + " (job " + v.job + ")" } else if (v && !v.ok) { status = "failing"; detail = "Last verification failed: " + (v.error || "") } else { status = "installed, not verified"; detail = "Run a verification job before using it" } }
    out[k] = { id: k, label: E.label, model: eh.model || E.model, license: E.license, gpu: E.gpu, caps: eh.caps || E.caps, status, detail, verifiedAt: v && v.ok ? v.at : null };
  }
  return { configured: cfgOk(env), worker: h.worker || "", gpu: h.gpu || "", engines: out };
}
async function spend(env) { return await rj(env, spendKey(), { usd: 0, gpuSeconds: 0, jobs: 0, byEngine: {} }) }
const rate = env => Math.max(0, Number(env.GEN_GPU_USD_PER_HOUR) || 0), limit = env => Math.max(0, Number(env.GEN_MONTHLY_LIMIT_USD) || 0);
async function sign(env, s) { return (await hmacHex(env.GEN_WORKER_TOKEN, s)).slice(0, 40) }
async function dispatch(env, url, job, fetcher) {
  const b = base(env, url), exp = Math.floor(Date.now() / 1000) + 6 * 3600, tok = await sign(env, "up|" + job.id);
  const inputs = []; for (const k of job.inputs) inputs.push({ name: k.split("/").pop(), url: b + "/api/gen/in/" + job.id + "/" + exp + "." + (await sign(env, "in|" + job.id + "|" + k + "|" + exp)) + "/" + k });
  const body = { id: job.id, engine: job.engine, params: job.params, inputs, upload: b + "/api/gen/up/" + job.id + "/" + tok + "/", callback: b + "/api/gen/cb", deadlineSec: ENGINES[job.engine].maxSec };
  try { const r = await (fetcher || fetch)(env.GEN_WORKER_URL.replace(/\/$/, "") + "/jobs", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.GEN_WORKER_TOKEN }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error("Worker refused the job (" + r.status + ") " + t.slice(0, 160)) }
    job.status = "queued"; job.dispatchedAt = now(); log(job, "Sent to the GPU worker") }
  catch (e) { job.status = "failed"; job.error = String(e.message || e).slice(0, 300); log(job, "Dispatch failed: " + job.error) }
}
const log = (j, m) => { j.log = (j.log || []).concat([{ t: now(), m: String(m).slice(0, 300) }]).slice(-60) };
async function setActive(env, id, on) { const a = await rj(env, ACTIVE, []); const s = new Set(a); on ? s.add(id) : s.delete(id); await wj(env, ACTIVE, [...s].slice(-500)) }
async function userIndex(env, uid, id) { const a = await rj(env, userKey(uid), []); await wj(env, userKey(uid), [id].concat(a.filter(x => x !== id)).slice(0, 100)) }
const pub = j => ({ id: j.id, engine: j.engine, status: j.status, progress: j.progress || 0, message: j.message || "", error: j.error || "", params: j.params, inputs: j.inputs, outputs: j.outputs || [], createdAt: j.createdAt, finishedAt: j.finishedAt || "", attempts: j.attempts, verify: !!j.verify, log: j.log || [], gpuSeconds: j.gpuSeconds || 0, usd: j.usd || 0 });
const done = s => ["succeeded", "failed", "canceled"].includes(s);
async function finish(env, j, status, err) { j.status = status; j.finishedAt = now(); if (err) j.error = String(err).slice(0, 300); await setActive(env, j.id, false);
  if (j.verify && status !== "canceled") await wj(env, verKey(j.engine), { ok: status === "succeeded", job: j.id, at: now(), by: j.email, error: status === "succeeded" ? "" : j.error }) }

export async function genApi(req, env, ctx, h) {
  const { p, url } = h, f = h.fetcher, method = req.method;
  /* ---- called by the GPU worker (signed, no user token) ---- */
  let m = p.match(/^\/api\/gen\/in\/([a-z0-9]+)\/(\d+)\.([0-9a-f]{40})\/(.+)$/);
  if (m && method === "GET") { const [, id, exp, sig, key] = m; if (!cfgOk(env) || Number(exp) < Date.now() / 1000 || !safeEq(sig, await sign(env, "in|" + id + "|" + key + "|" + exp))) return J({ error: "Link expired or invalid" }, 403);
    const j = await rj(env, jobKey(id), null); if (!j || !j.inputs.includes(key)) return J({ error: "Not part of this job" }, 403); const o = await env.STUDIO_BUCKET.get(key); if (!o) return J({ error: "Not found" }, 404);
    return new Response(o.body, { headers: { "content-type": (o.httpMetadata && o.httpMetadata.contentType) || "application/octet-stream", "content-length": String(o.size) } }) }
  m = p.match(/^\/api\/gen\/up\/([a-z0-9]+)\/([0-9a-f]{40})\/(.+)$/);
  if (m && method === "PUT") { const [, id, tok, raw] = m, name = decodeURIComponent(raw); if (!cfgOk(env) || !safeEq(tok, await sign(env, "up|" + id))) return J({ error: "Not allowed" }, 403); if (!NAME_RE.test(name)) return J({ error: "Bad file name" }, 400);
    const j = await rj(env, jobKey(id), null); if (!j || done(j.status)) return J({ error: "Job isn't running" }, 409); const len = Number(req.headers.get("content-length") || 0); if (len > 500 * 1048576) return J({ error: "Output too large" }, 413);
    const type = req.headers.get("content-type") || "application/octet-stream", key = j.dest + "/gen-" + id + "/" + name.replace(/ /g, "_"); await env.STUDIO_BUCKET.put(key, req.body, { httpMetadata: { contentType: type } }); return J({ ok: true, key }) }
  if (p === "/api/gen/cb" && method === "POST") { const raw = await req.text(), sig = req.headers.get("x-gen-signature") || ""; if (!cfgOk(env) || !safeEq(sig, await hmacHex(env.GEN_WORKER_TOKEN, raw))) return J({ error: "Bad signature" }, 403);
    let b; try { b = JSON.parse(raw) } catch (e) { return J({ error: "Bad body" }, 400) } return J(await callback(env, b)) }
  /* ---- people ---- */
  const u = await caller(req, env, { verifyIdToken: h.verifyIdToken, fetcher: f }); if (!u) return J({ error: "Sign in first" }, 401); if (!u.founder && !u.creative) return J({ error: "No Creative Studio access" }, 403);
  if (p === "/api/gen/engines") { const st = await engineStatus(env, f, url.searchParams.get("refresh") === "1" && u.founder), sp = await spend(env); return J(Object.assign(st, { budget: { limitUsd: limit(env), usdPerGpuHour: rate(env), spentUsd: sp.usd, gpuSeconds: sp.gpuSeconds, jobs: sp.jobs } })) }
  if (p === "/api/gen/jobs" && method === "GET") { const ids = (await rj(env, userKey(u.uid), [])).slice(0, 40), out = []; for (const id of ids) { const j = await rj(env, jobKey(id), null); if (j) out.push(pub(j)) } return J({ jobs: out }) }
  if (p === "/api/gen/jobs" && method === "POST") {
    let b; try { b = await req.json() } catch (e) { return J({ error: "Bad request" }, 400) }
    const E = ENGINES[b.engine]; if (!E) return J({ error: "Unknown engine" }, 400); if (!can(u, b.engine)) return J({ error: "Your role can't use " + E.label }, 403);
    const verify = !!b.verify; if (verify && !u.founder) return J({ error: "Only the founder runs verification jobs" }, 403);
    if ((Array.isArray(b.inputs) ? b.inputs : []).some(k => !canKey(u, String(k)))) return J({ error: "You can't use that file" }, 403);
    const st = (await engineStatus(env, f)).engines[b.engine]; if (st.status === "not connected" || st.status === "not installed") return J({ error: E.label + " isn't connected: " + st.detail, status: st.status }, 503);
    if (st.status !== "operational" && !u.founder) return J({ error: E.label + " hasn't passed verification yet", status: st.status }, 503);
    const inputs = Array.isArray(b.inputs) ? b.inputs.map(String) : []; if (inputs.length < E.inputs[0] || inputs.length > E.inputs[1]) return J({ error: "This engine takes " + E.inputs.join("–") + " input files" }, 400);
    for (const k of inputs) { if (!canKey(u, k)) return J({ error: "You can't use that file" }, 403); const hd = await env.STUDIO_BUCKET.head(k); if (!hd) return J({ error: "Input file not found: " + k.split("/").pop() }, 404); if (hd.size > 500 * 1048576) return J({ error: "Input files can be up to 500 MB" }, 413);
      const ct = (hd.httpMetadata && hd.httpMetadata.contentType) || ""; if (!E.accept.some(re => re.test(ct) || re.test(k))) return J({ error: "That file type doesn't work with " + E.label }, 415) }
    const dest = String(b.dest || "").replace(/\/+$/, ""); if (!/^(soundlab|creative)\/[A-Za-z0-9_-]{1,40}(\/[A-Za-z0-9_-]{1,40}){0,3}$/.test(dest) || !canKey(u, dest + "/x")) return J({ error: "Choose where results are saved" }, 400);
    const params = b.params && typeof b.params === "object" ? b.params : {}; if (JSON.stringify(params).length > 20000) return J({ error: "Settings too large" }, 413);
    if (E.voice) { const vid = String(params.voiceId || ""); if (!/^[A-Za-z0-9_-]{2,80}$/.test(vid)) return J({ error: "Choose a Voice DNA profile" }, 400); const v = await fsDoc(env, "soundlabVoices/" + vid, u, f);
      if (!v || v.status !== "verified") return J({ error: "That voice doesn't have verified consent" }, 403); const scope = v.consent && Array.isArray(v.consent.scope) ? v.consent.scope : []; if (b.engine !== "voice-train" && !scope.some(s => /synthesis/.test(s))) return J({ error: "The singer's consent doesn't cover voice synthesis" }, 403) }
    /* limits: active jobs, daily count, monthly GPU budget */
    const mine = await rj(env, userKey(u.uid), []); let active = 0, today = 0; const day = now().slice(0, 10);
    for (const id of mine.slice(0, 60)) { const j = await rj(env, jobKey(id), null); if (!j) continue; if (!done(j.status)) active++; if (String(j.createdAt).startsWith(day)) today++ }
    if (active >= 2) return J({ error: "You already have 2 jobs running. Wait for one to finish." }, 429); if (today >= (Number(env.GEN_DAILY_JOBS) || 30)) return J({ error: "Daily job limit reached" }, 429);
    if (E.gpu) { const sp = await spend(env), est = E.estSec / 3600 * rate(env); if (!limit(env)) return J({ error: "GPU engines are off until the founder sets a monthly GPU budget (GEN_MONTHLY_LIMIT_USD)." }, 402); if (sp.usd + est > limit(env)) return J({ error: "This month's GPU budget is used up ($" + sp.usd.toFixed(2) + " of $" + limit(env) + ")." }, 402) }
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24), job = { id, engine: b.engine, uid: u.uid, email: u.email || "", params, inputs, dest, verify, status: "queued", progress: 0, attempts: 1, createdAt: now() };
    log(job, (verify ? "Verification job" : "Job") + " created by " + (u.email || u.uid)); await dispatch(env, url, job, f); await wj(env, jobKey(id), job); await userIndex(env, u.uid, id); if (!done(job.status)) await setActive(env, id, true); else if (verify) await finish(env, job, job.status, job.error);
    return J(pub(job), job.status === "failed" ? 502 : 202) }
  m = p.match(/^\/api\/gen\/jobs\/([a-z0-9]+)(\/(cancel|retry))?$/);
  if (m) { const j = await rj(env, jobKey(m[1]), null); if (!j || (j.uid !== u.uid && !u.founder)) return J({ error: "Job not found" }, 404);
    if (!m[3]) return J(pub(j));
    if (m[3] === "cancel" && method === "POST") { if (done(j.status)) return J(pub(j)); try { await (f || fetch)(env.GEN_WORKER_URL.replace(/\/$/, "") + "/jobs/" + j.id + "/cancel", { method: "POST", headers: { authorization: "Bearer " + env.GEN_WORKER_TOKEN } }) } catch (e) { } log(j, "Canceled by " + (u.email || u.uid)); await finish(env, j, "canceled"); await wj(env, jobKey(j.id), j); return J(pub(j)) }
    if (m[3] === "retry" && method === "POST") { if (!["failed", "canceled"].includes(j.status)) return J({ error: "Only failed or canceled jobs can be retried" }, 409); if (j.attempts >= 3) return J({ error: "This job was already tried 3 times" }, 429);
      j.attempts++; j.error = ""; j.progress = 0; j.outputs = []; j.finishedAt = ""; log(j, "Retry " + j.attempts); await dispatch(env, url, j, f); await wj(env, jobKey(j.id), j); if (!done(j.status)) await setActive(env, j.id, true); return J(pub(j), j.status === "failed" ? 502 : 202) } }
  if (p === "/api/gen/usage" && u.founder) { const sp = await spend(env); return J(Object.assign(sp, { limitUsd: limit(env), usdPerGpuHour: rate(env) })) }
  return J({ error: "Not found" }, 404);
}
/* status reports from the GPU worker: progress, completion (with the files it uploaded), failure */
async function callback(env, b) {
  const j = await rj(env, jobKey(String(b.id || "")), null); if (!j) return { error: "Unknown job" }; if (done(j.status)) return { ok: true, ignored: true };
  if (b.status === "running") { j.status = "running"; j.progress = Math.max(0, Math.min(1, Number(b.progress) || 0)); if (b.message) j.message = String(b.message).slice(0, 200); if (!j.startedAt) { j.startedAt = now(); log(j, "Started on the GPU worker") } await wj(env, jobKey(j.id), j); return { ok: true } }
  const gs = Math.max(0, Math.min(86400, Number(b.gpuSeconds) || 0)); j.gpuSeconds = gs; j.usd = ENGINES[j.engine].gpu ? Math.round(gs / 3600 * rate(env) * 10000) / 10000 : 0;
  const sp = await spend(env); sp.usd = Math.round((sp.usd + j.usd) * 10000) / 10000; sp.gpuSeconds += gs; sp.jobs++; sp.byEngine[j.engine] = (sp.byEngine[j.engine] || 0) + 1; await wj(env, spendKey(), sp);
  if (b.status === "succeeded") {
    const outs = []; for (const o of (Array.isArray(b.outputs) ? b.outputs : []).slice(0, 40)) { const name = String(o.name || "").replace(/ /g, "_"); if (!NAME_RE.test(name)) continue; const key = j.dest + "/gen-" + j.id + "/" + name, hd = await env.STUDIO_BUCKET.head(key); if (!hd || !hd.size) continue;
      outs.push({ name, key, size: hd.size, type: (hd.httpMetadata && hd.httpMetadata.contentType) || "", duration: Number(o.duration) || 0, meta: o.meta && typeof o.meta === "object" ? o.meta : undefined }) }
    j.outputs = outs; if (!ENGINES[j.engine].check(outs, j)) { log(j, "Worker said done, but the results failed the checks (" + outs.length + " usable files)"); await finish(env, j, "failed", "The engine's results didn't pass the output checks"); }
    else { j.progress = 1; log(j, "Finished: " + outs.map(o => o.name).join(", ")); await finish(env, j, "succeeded") } }
  else { log(j, "Failed: " + (b.error || "unknown error")); await finish(env, j, b.status === "canceled" ? "canceled" : "failed", b.error || "The engine failed") }
  await wj(env, jobKey(j.id), j); return { ok: true, status: j.status }
}
/* every cron tick: stop jobs that ran past their limit so nothing keeps billing GPU time */
export async function genCron(env, fetcher) {
  if (!cfgOk(env)) return; const act = await rj(env, ACTIVE, []);
  for (const id of act) { const j = await rj(env, jobKey(id), null); if (!j || done(j.status)) { await setActive(env, id, false); continue }
    const start = Date.parse(j.dispatchedAt || j.createdAt), lim = ENGINES[j.engine].maxSec * 1000 + 120000;
    if (Date.now() - start > lim) { try { await (fetcher || fetch)(env.GEN_WORKER_URL.replace(/\/$/, "") + "/jobs/" + j.id + "/cancel", { method: "POST", headers: { authorization: "Bearer " + env.GEN_WORKER_TOKEN } }) } catch (e) { }
      log(j, "Stopped after " + Math.round(ENGINES[j.engine].maxSec / 60) + " minutes to prevent runaway GPU use"); await finish(env, j, "failed", "Timed out"); await wj(env, jobKey(j.id), j) } }
}
