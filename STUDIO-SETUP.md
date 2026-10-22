# Grooveville LIVE + Entertainment Studio: setup

Do these in order. Steps 1–3 must be done **before** you upload this version to GitHub, or Cloudflare's build will stop (your current site stays up if that happens).

## 1. Create the private storage bucket (Cloudflare R2)
1. Cloudflare dashboard › **R2 Object Storage** › (first time: add a payment method; the first 10 GB/month are free).
2. **Create bucket** › name it exactly `grooveville-studio` › Create. Leave it **private** (no public access).
3. Bucket › **Settings** › **CORS policy** › paste this and save (lets the Studio upload recordings straight from the browser):
```json
[{"AllowedOrigins":["https://grooveville.org","https://www.grooveville.org","https://grooveville.jaja-a20.workers.dev"],
  "AllowedMethods":["PUT","GET"],"AllowedHeaders":["content-type"],"MaxAgeSeconds":3600}]
```
4. Optional retention: Bucket › Settings › **Object lifecycle rules** › add a rule for prefix `shows/` to delete raw recordings after, for example, 120 days (exports you've downloaded are safe to drop too).

## 2. Create R2 access keys (for signed upload/download links)
1. R2 › **Manage R2 API tokens** › **Create API token** › Permissions: **Object Read & Write** › Apply to: **only** `grooveville-studio` › Create.
2. Copy the **Access Key ID** and **Secret Access Key** (shown once). Also copy your **Account ID** (right side of the R2 page).

## 3. Create the YouTube API key (Google Cloud project, not the channel)
1. https://console.cloud.google.com › select your Firebase project **groovevillellc** (or any project).
2. **APIs & Services › Library** › search **YouTube Data API v3** › **Enable**.
3. **APIs & Services › Credentials › Create credentials › API key**. Click the key › **API restrictions** › Restrict key › tick **YouTube Data API v3** › Save. (Leave "Application restrictions" as None: only the Worker uses this key, never the browser.)
4. Free quota is 10,000 units/day. Grooveville uses about 1,500/day (one check every 2 minutes).

## 4. Add the secrets to the Worker
Cloudflare › **Workers & Pages › grooveville › Settings › Variables and Secrets** › **Add** › type **Secret** for each:

| Name | Value |
|---|---|
| `YOUTUBE_API_KEY` | the key from step 3 |
| `R2_ACCESS_KEY_ID` | from step 2 |
| `R2_SECRET_ACCESS_KEY` | from step 2 |
| `CF_ACCOUNT_ID` | your Cloudflare account ID |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | optional: from https://dev.twitch.tv/console › Register app (shows the Twitch LIVE badge) |

## 5. Upload this version and publish the Firestore rules
1. Replace the repo files with this folder (it now includes `wrangler.jsonc` and `worker/`). Cloudflare builds and deploys automatically.
2. Firebase › Firestore › **Rules** › paste `firestore.rules` › **Publish**.
3. Check: open `https://grooveville.org/api/live?show=uncneph`. You should see `"ok":true` and a `channelId` starting with `UC` within a couple of minutes.
4. Open **Back Office › Ent. Studio › Show Settings** once. The resolved channel ID is saved to the show automatically.

## 6. Invite the team
Studio › **Team Management** › enter their email and role. They go to **Groove Team › Sign in** (or create an account) with that **same email**; access is granted on sign-in. Remove someone any time with **Remove**.

| Role | Can do | Can't do |
|---|---|---|
| Owner (Founder/HNIC) | Everything | — |
| Entertainment Manager | All shows, team invites, settings, approvals, sync | Finances, other companies, site settings, keys |
| Producer | Assigned shows: recordings, clips, approvals, publishing, calendar, next show | Team, show settings |
| Editor | Assigned shows: upload recordings, make/edit clips and captions, submit for review | Approve, publish, team |
| Show Member | View assigned show, suggest clips | Raw recordings, approvals |

Studio people never get the Back Office: finances, timesheets, other companies, website settings and private notes stay founder-only in Firestore rules.

## Costs
- Cloudflare Worker, Cron and Cache: free plan.
- R2: free for the first 10 GB stored/month, then about $0.015 per GB per month. A 2-hour 1080p StreamYard recording is about 2–4 GB.
- YouTube Data API: free within quota.
- AI clipping: needs a computer you run (see `clip-worker/README.md`). Software is free; electricity/hardware or a cloud server (about $10–40/month) are the real costs.

---

# Grooveville Music, TV, Song Rate and Charts

Uses the same Worker, R2 bucket and keys as above. Nothing new to create in Cloudflare.

1. **Publish the Firestore rules again** (Firebase › Firestore › Rules › paste `firestore.rules` › Publish). The new rules add `musicSongs`, `musicArtists`, `musicAlbums`, `musicPlaylists`, `musicSettings`, `tvVideos`, `tvPlaylists`, `tvCategories`, `musicCharts`, `musicChartEntries` and `songReviews`. Everything you already had is unchanged.
2. **Indexes:** none needed. Public pages only ask for `published == true`, which Firestore handles automatically.
3. **YouTube:** Grooveville TV reuses `YOUTUBE_API_KEY`. If the key isn't working, adding a single video still works through YouTube's public oEmbed (title + thumbnail); channel playlists need the key.
4. **Where files go:** MP3s → R2 `music/audio/…`, artwork → R2 `music/img/…`. Only published songs can be streamed (`/api/music/a/<songId>`), with byte-range support for seeking. Song Rate submissions are stored privately in R2 under `songrate/` and never in Firestore.
5. **Artist share links:** `grooveville.org/artist/<id>` gives social apps a proper preview, then opens the artist page.

**Switches (both off until you turn them on in Back office › Entertainment):** Song Rate public submissions, and public Charts. You can preview both as founder before launch.

## Website Studio and Media Library (update v3)

Back office › **Website Studio** edits the public site as a **draft**. Back office › **Media Library** holds your photos and videos.

**One-time setup**
1. **Firestore rules:** paste the new `firestore.rules` into Firebase › Firestore › Rules and click **Publish**. It adds three founder-only collections: `sitedraft`, `siteversions` (read-only history) and `mediaLib`. Everything you had before is unchanged.
2. **R2:** nothing new. Website files use the same `STUDIO_BUCKET` binding as music, under `site/media/`.
3. **Optional secret:** `SITE_PREVIEW_SECRET`, any long random string. It signs Preview links. Without it, the Worker creates one and keeps it in R2.

**How it works**
- Edits autosave to the draft. Visitors don't see them.
- **Preview Changes** opens the real site showing your draft. Only the founder can see it.
- **Publish to Live Site** checks the draft, lists what changed, asks you to confirm, then switches the live site to a new numbered version in one step.
- **History** lists every published version. You can load any version into your draft, or restore it to the live site with a confirmation.
- Uploaded files stay private until a published page uses them. The Worker serves a file to the public only if it's part of the live version.
- Uploads, deletes, publishing and restoring are founder or HNIC only. This is enforced by the Firestore rules and the Worker, not by hiding buttons.
- Size limits: images (JPG, PNG, WebP, AVIF) up to 30 MB; videos (MP4, WebM, MOV) up to 95 MB. For longer films, add a YouTube or Vimeo link.
