# Grooveville GPU worker

A small Python server (standard library only) that runs the generation engines for `grooveville.org/api/gen`.

```
export GEN_WORKER_TOKEN=<same value as the Cloudflare variable>
python3 worker.py --port 8787          # put it behind HTTPS (Caddy, nginx or a tunnel)
```

| Engine | Install on this machine | Notes |
|---|---|---|
| encode | `apt install ffmpeg` | MP3/WAV/FLAC conversion, video concat and audio mux |
| separate | `pip install demucs` (CUDA torch) | Code MIT; confirm the pretrained weights' license before commercial use |
| transcribe | `pip install basic-pitch` | Apache-2.0 |
| music | ACE-Step 1.5: `git clone https://github.com/ACE-Step/ACE-Step-1.5 && uv sync && uv run acestep-api` | MIT. Set `ACESTEP_URL` if it isn't on `127.0.0.1:8001` |
| video | `pip install diffusers transformers accelerate ftfy` + CUDA torch | Wan 2.1 T2V 1.3B, Apache-2.0, about 8 GB VRAM |
| voice-train / voice-convert | RVC (MIT); set `RVC_TRAIN_CMD` / `RVC_INFER_CMD` | Placeholders: `{input}` `{inputs}` `{outdir}` `{voice}` `{pitch}` `{params}`. The gateway only sends jobs for voices with **verified consent** |
| voice-sing | DiffSinger (Apache-2.0); set `SING_CMD` | Needs a voicebank trained on a consenting singer |

`GET /health` reports what is installed. The Back Office shows exactly that.
