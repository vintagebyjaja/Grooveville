# Grooveville update v16

Released 2026-10-28. Upload these files into your repo **keeping the same folders**. Everything else stays as it is.

## Changed files (6)
- `.assetsignore`
- `index.html`
- `scripts/sync-secrets.mjs`
- `worker/content.js`
- `worker/creative.js`
- `worker/index.js`

## New files (12)
- `CONTENT-AUTOPILOT-SETUP.md`
- `GENERATION-ENGINES.md`
- `fonts/OFL.txt`
- `fonts/Poppins-Bold.ttf`
- `fonts/Poppins-Medium.ttf`
- `fonts/Poppins-Regular.ttf`
- `gpu-worker/README.md`
- `gpu-worker/worker.py`
- `worker/autopilot.js`
- `worker/gen.js`
- `worker/icons.js`
- `worker/render.js`

## Delete these from the repo (0)
Nothing to delete.

`version.txt` is included every time so you can check what's live at grooveville.org/version.txt


## After you upload
1. Nothing is required for MP3 export, stem separation (basic), track bounce, Autopilot research/planning, or the new Content Studio Autopilot tab.
2. **Content Studio › Autopilot:** turn it on and press *Generate My Week*. Read `CONTENT-AUTOPILOT-SETUP.md` for two optional settings:
   - `FIREBASE_SERVICE_ACCOUNT` (free) sends drafts straight to Approvals.
   - `CONTENT_RENDER=worker` draws graphics on the server, but needs the Cloudflare Workers Paid plan (about $5/month; your call).
3. GPU engines (music generation, voice, high-quality stems, video) stay **not connected** until you run the GPU worker. See `GENERATION-ENGINES.md`. Nothing has been bought or provisioned.
