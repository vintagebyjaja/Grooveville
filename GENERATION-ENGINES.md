# Generation engines — status and setup

Heavy AI (music, voices, stems, MIDI, video) can't run in Cloudflare Workers or Firebase. The Worker is the secure **gateway** (`/api/gen/*`); it handles:
- permissions, file checks, quotas, monthly GPU budget, timeouts and cancel/retry;
- signed links, results in R2, and job status.

A **GPU worker** that you run (folder `gpu-worker/`) does the actual work. An engine shows **operational** only after a verification job really ran and its files passed checks.

## Feature status (verified in this repository)
| Feature | State now | Engine | Implementation | Tested |
|---|---|---|---|---|
| MP3 export | **Working** | Sound Lab's own MP3 encoder (in the browser) | Done: 128–320 kbps, 44.1/48 kHz, stems as MP3 | Yes: decoded by FFmpeg, quality on par with LAME on test signals |
| Send approved song to Grooveville Music | **Working** | Existing music upload API | Done: uploaded **unpublished**; founder publishes | In the browser with test storage; not yet on the live site |
| Audio → instrument | **Working** | In-browser pitch tracking → notes → Sound Lab instruments, optional render to audio | Done | Yes |
| Stem separation (basic) | **Working** | In-browser DSP (timing/pitch/pan/frequency); bleed expected | Done | Yes, on a synthetic mix with known sources (stems sum exactly to the original) |
| Gateway + GPU worker protocol | **Working** | `worker/gen.js` + `gpu-worker/worker.py` | Done | Yes: end to end with the real worker and FFmpeg |
| Stem separation (high quality) | Adapter ready, **not connected** | Demucs v4 (code MIT; **weight license unclear for commercial use**: confirm first) | Needs a GPU server | No |
| Audio → MIDI (polyphonic) | Adapter ready, **not connected** | Spotify Basic Pitch (Apache-2.0) | Needs `pip install basic-pitch` on the worker | No |
| Full-song generation | Adapter ready, **not connected** | ACE-Step 1.5 (MIT; under 4 GB VRAM per its docs) | Needs a GPU server running `acestep-api` | No |
| Voice DNA training / conversion | Consent flow working; synthesis **not connected** | RVC v2 (MIT); needs about 10 minutes of clean singing per voice | Needs RVC installed and its commands set (`RVC_TRAIN_CMD`, `RVC_INFER_CMD`) | No |
| Singing from lyrics + melody | **Not connected** | DiffSinger (Apache-2.0) with a voicebank trained on a consenting singer | Needs `SING_CMD`; voicebank training is a separate project | No |
| Video generation | Adapter ready, **not connected** | Wan 2.1 T2V 1.3B (Apache-2.0; about 8 GB VRAM; about 4 min per 5 s clip on an RTX 4090) | Needs a CUDA GPU | No |
| KDP files | Preparation and checks working | — | Manual upload to KDP | Yes (format, preflight) |

## Turning engines on (each step needs your approval; nothing has been bought)
1. **Rent or use a GPU machine.** One 16–24 GB NVIDIA GPU covers ACE-Step, Demucs, RVC and Wan 1.3B, one job at a time. Check current hourly prices with your provider.
2. On that machine:
   - Install FFmpeg and the engines you want (see `gpu-worker/README.md`).
   - Run `GEN_WORKER_TOKEN=<secret> python3 worker.py --port 8787` behind HTTPS.
3. Cloudflare build variables:
   - `GEN_WORKER_URL`, `GEN_WORKER_TOKEN`
   - `GEN_GPU_USD_PER_HOUR` (your rate)
   - `GEN_MONTHLY_LIMIT_USD` (GPU engines stay off while this is 0)
   - optional `GEN_DAILY_JOBS` (default 30)
4. Run one verification job per engine (founder). Only then does it show as operational.
