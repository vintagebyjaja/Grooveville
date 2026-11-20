# Grooveville update v18

Released 2026-10-29. Upload these files into your repo **keeping the same folders**. Everything else stays as it is.

## What's new in v18
**Content Studio redesign**
- Opens on **Generate Post**: a cinematic header, the generation panel, Quick Themes, and a Generated Posts gallery loaded from Firebase.
- The gallery has Download, Edit, Post, select and ⋯ on every graphic, plus filters and sorting.
- Poster graphics: a cinematic AI photo with a proofread title, plus your real logo and exact dates, venue and lineup text.
- Sizes 4:5, 1:1, 9:16 and 16:9. Video makes a 6-second motion clip.

**Trends / Autopilot fix**
- "Web Search cannot be used with JSON mode" is fixed: research and JSON are now separate requests.

**Autopilot runs on Cloudflare**
- Uses the Cron Trigger plus a Queue. No GitHub runner and no runner tokens.
- Graphics are finished on the server: the full renderer on Workers Paid, Cloudflare Images on the Free plan (chosen automatically).
- Finished graphics go to Approvals. You see real progress, errors come with Retry, and a lock prevents duplicates.

**Approved Content Styles** (Brand Kits › Approved Styles)
- Reference libraries and style collections, with an editable AI Visual Style Profile.
- Visual Direction in Generate Post.
- **Match This Style**, **Generate More Like This** and **Save This Style** on the gallery, previews, Approvals and the Media Library.
- Reject reasons and approval-based priority scores, used by Autopilot to pick a style.

**Book Studio › Original Edition**
- Upload the finished PDF and every page is kept exactly as designed.
- Read it as a page-flip virtual book with single/double pages, zoom, fullscreen, swipe, bookmarks and sound.
- Publish it to Groove Reads, where readers get a Read Original Edition choice.

**Phones**
- The site header sits at the very top and nothing shows behind or above it.

## Before uploading (one time)
1. Cloudflare dashboard › Storage & Databases › Queues › **Create queue** named `grooveville-autopilot`. The deploy needs it to exist.
2. If not already set, add the Cloudflare secret **FIREBASE_SERVICE_ACCOUNT**. It lets finished graphics go into Approvals while your computer is off.
3. See CONTENT-AUTOPILOT-SETUP.md for details.

You can delete these if you added them for the earlier GitHub-runner draft: AUTOPILOT_RUNNER_TOKEN, GITHUB_REPO, GITHUB_DISPATCH_TOKEN, and the GitHub Actions secrets.

## Changed files (9)
- `CONTENT-AUTOPILOT-SETUP.md`
- `GROOVE-READS-SETUP.md`
- `index.html`
- `worker/autopilot.js`
- `worker/content.js`
- `worker/creative.js`
- `worker/index.js`
- `worker/render.js`
- `wrangler.jsonc`

## New files (37)
- `media/ap-scrim-landscape.png`
- `media/ap-scrim-portrait.png`
- `media/ap-scrim-square.png`
- `media/ap-scrim-story.png`
- `media/ap-scrim-thumb.png`
- `vendor/pdfjs/LICENSE`
- `vendor/pdfjs/iccs/CGATS001Compat-v2-micro.icc`
- `vendor/pdfjs/iccs/LICENSE`
- `vendor/pdfjs/pdf.min.mjs`
- `vendor/pdfjs/pdf.worker.min.mjs`
- `vendor/pdfjs/standard_fonts/FoxitDingbats.pfb`
- `vendor/pdfjs/standard_fonts/FoxitFixed.pfb`
- `vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb`
- `vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb`
- `vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb`
- `vendor/pdfjs/standard_fonts/FoxitSerif.pfb`
- `vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb`
- `vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb`
- `vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb`
- `vendor/pdfjs/standard_fonts/FoxitSymbol.pfb`
- `vendor/pdfjs/standard_fonts/LICENSE_FOXIT`
- `vendor/pdfjs/standard_fonts/LICENSE_LIBERATION`
- `vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf`
- `vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf`
- `vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf`
- `vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf`
- `vendor/pdfjs/wasm/LICENSE_JBIG2`
- `vendor/pdfjs/wasm/LICENSE_OPENJPEG`
- `vendor/pdfjs/wasm/LICENSE_PDFJS_JBIG2`
- `vendor/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG`
- `vendor/pdfjs/wasm/LICENSE_PDFJS_QCMS`
- `vendor/pdfjs/wasm/LICENSE_QCMS`
- `vendor/pdfjs/wasm/jbig2.wasm`
- `vendor/pdfjs/wasm/jbig2_nowasm_fallback.js`
- `vendor/pdfjs/wasm/openjpeg.wasm`
- `vendor/pdfjs/wasm/openjpeg_nowasm_fallback.js`
- `vendor/pdfjs/wasm/qcms_bg.wasm`

## Delete these from the repo (0)
Nothing to delete.

`version.txt` is included every time so you can check what's live at grooveville.org/version.txt
