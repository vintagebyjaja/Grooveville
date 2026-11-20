# AI clip worker (to be set up later)

The Studio already queues jobs. A processing machine (your PC, a Mac, or a server) runs a small program that picks them up. Nothing heavy runs on Cloudflare or Firebase.

## Software (all free, open source)
- **Faster-Whisper** – transcription with word timestamps
- **Ollama** + a local model (e.g. `llama3.1:8b` or `qwen2.5:7b`) – picks highlight moments from the transcript
- **FFmpeg** – cutting, scaling, burning captions (ASS subtitle presets: bold, karaoke, clean, neon)
- **MediaPipe / OpenCV** – face/speaker tracking for 9:16 and 1:1 reframing
- **firebase-admin** (service account) for Firestore, and the R2 S3 API for files

Recommended machine: 16 GB RAM, an NVIDIA GPU (6 GB+) or Apple Silicon. CPU-only works but a 2-hour episode can take several hours.

## How it talks to Grooveville
- Watches `shows/{show}/jobs` where `status == "queued"`.
- Writes a heartbeat to `studioWorker/main` → `{ lastSeen: ISO time, host, version }` every minute (Studio shows "Online").
- Reads recordings from R2 (`recordingKey`), writes exports to `shows/{show}/exports/{clipId}/clip.mp4`.

### Job document
```
type:        "highlights" | "transcribe" | "render"
episodeId, recordingKey, clipId?, clipTitle?
status:      "queued" → "running" → "done" | "failed"
progress:    0–100      error: text      createdBy, createdAt
options:     { formats:["9:16"], maxClips:8, minSec:15, maxSec:75 }
```
- **highlights**: transcribe (save transcript to `shows/{show}/episodes/{id}.transcriptKey` in R2), ask Ollama for moments (funny, debates, strong opinions, memorable lines), create clip docs with `status:"draft"`, `ai:true`, `captions:[{t,text}]`, `start`, `end`, `format`.
- **render**: cut `start`–`end`, reframe to the clip's `format`, burn captions in the chosen `preset`, add show branding if `brand:true`, upload MP4, then set the clip's `exportKey` and `renderStatus:"done"`.

Approval rules are unchanged: the worker never sets a clip to approved or published.
