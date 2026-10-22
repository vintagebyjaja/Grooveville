import { musicApi, fsPublic } from "./music.js";
import { siteApi } from "./site.js";
import { guideApi } from "./guide.js";
import { contentApi, contentCron } from "./content.js";
/* Grooveville Worker
   - Serves the static site (ASSETS binding). Only /api/* runs this code first.
   - YouTube sync for Grooveville LIVE: live status, upcoming show, completed livestream archive.
     Runs on a Cron Trigger every 2 minutes and stores results in R2 (studio bucket, key yt/<show>.json).
     Public endpoints read the cached copy, so visitor traffic never spends YouTube quota.
   - Studio file access: signed upload/download links for private recordings and clip exports in R2,
     only after checking the visitor's Firebase sign-in and their Studio role in Firestore.
   Secrets (Cloudflare dashboard › Worker › Settings › Variables and Secrets):
     YOUTUBE_API_KEY            required for live + archive
     R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CF_ACCOUNT_ID   required for Studio uploads/downloads
     TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET                 optional: confirms Twitch live status
   Plain variables (wrangler.jsonc › vars): FIREBASE_PROJECT_ID, R2_BUCKET_NAME */

/* Built-in starter show. Shows saved in Studio › Show Settings (Firestore "shows" collection) are added
   automatically and override these values, so new productions need no code changes. */
export const DEFAULT_SHOWS = {
  uncneph: { name: "The Unc & Neph Show", youtube: "https://www.youtube.com/@TheUncNephShowCLT", twitch: "uncnephshow" }
};
/* Accepts a channel URL, @handle or UC… channel ID. */
export function parseChannel(v) {
  v = String(v || "").trim(); if (!v) return null;
  let m = /(?:youtube\.com\/channel\/)?(UC[A-Za-z0-9_-]{22})/.exec(v); if (m) return { id: m[1] };
  m = /(?:youtube\.com\/)?@([A-Za-z0-9._-]{3,30})/.exec(v); if (m) return { handle: m[1] };
  return null;
}
const twitchLogin = v => { const m = /(?:twitch\.tv\/)?([A-Za-z0-9_]{3,25})\/?$/.exec(String(v || "").trim()); return m ? m[1].toLowerCase() : "" };
let SHOW_CACHE = null, SHOW_AT = 0;
/* Reads public show settings from Firestore (no credentials needed; the collection is public-read). */
export async function getShows(env, fetcher) {
  if (SHOW_CACHE && Date.now() - SHOW_AT < 120000 && !fetcher) return SHOW_CACHE;
  const out = JSON.parse(JSON.stringify(DEFAULT_SHOWS));
  try {
    const r = await (fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/shows?pageSize=100");
    if (r.ok) {
      const d = await r.json();
      (d.documents || []).forEach(doc => {
        const id = doc.name.split("/").pop(), f = doc.fields || {}, str = k => (f[k] || {}).stringValue || "";
        const soc = ((f.socials || {}).mapValue || {}).fields || {};
        const cur = out[id] || {};
        out[id] = { name: str("name") || cur.name || id, youtube: str("youtube") || cur.youtube || "", channelId: str("channelId"), twitch: f.socials ? twitchLogin((soc.twitch || {}).stringValue) : (cur.twitch || ""), disabled: (f.disabled || {}).booleanValue === true };
      });
    }
  } catch (e) { }
  SHOW_CACHE = out; SHOW_AT = Date.now(); return out;
}
const ROLE_RANK = { member: 1, editor: 2, producer: 3, manager: 4, owner: 5 };
const json = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra || {}) });

/* ---------------- YouTube ---------------- */
async function yt(env, path, params, fetcher) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set("key", env.YOUTUBE_API_KEY);
  const r = await (fetcher || fetch)(u.toString());
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = (((body.error || {}).errors || [])[0] || {}).reason || r.status;
    const e = new Error("YouTube API " + path + ": " + reason); e.reason = String(reason); throw e;
  }
  return body;
}
export function isoDur(s) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s || ""); if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
function slim(v) {
  const sn = v.snippet || {}, ls = v.liveStreamingDetails || {}, th = sn.thumbnails || {};
  const t = th.maxres || th.standard || th.high || th.medium || th.default || {};
  return {
    id: v.id, title: sn.title || "", kind: sn.liveBroadcastContent || "none",
    thumb: t.url || ("https://i.ytimg.com/vi/" + v.id + "/hqdefault.jpg"),
    publishedAt: sn.publishedAt || "", start: ls.actualStartTime || ls.scheduledStartTime || sn.publishedAt || "",
    scheduled: ls.scheduledStartTime || "", ended: ls.actualEndTime || "",
    duration: isoDur((v.contentDetails || {}).duration), views: Number((v.statistics || {}).viewCount || 0),
    url: "https://www.youtube.com/watch?v=" + v.id
  };
}
async function videoDetails(env, ids, fetcher) {
  if (!ids.length) return [];
  const r = await yt(env, "videos", { part: "snippet,contentDetails,liveStreamingDetails,statistics", id: ids.join(","), maxResults: "50" }, fetcher);
  return (r.items || []).map(slim);
}
async function loadState(env, show) {
  const o = env.STUDIO_BUCKET && await env.STUDIO_BUCKET.get("yt/" + show + ".json");
  return o ? await o.json() : { show, episodes: [], backfillDone: false };
}
async function saveState(env, show, st) {
  if (env.STUDIO_BUCKET) await env.STUDIO_BUCKET.put("yt/" + show + ".json", JSON.stringify(st), { httpMetadata: { contentType: "application/json" } });
}
/* One sync pass: ~2 quota units (+2 while backfilling older episodes). */
export async function syncShow(env, show, fetcher, cfgIn) {
  const cfg = cfgIn || (await getShows(env, fetcher))[show]; if (!cfg) throw new Error("Unknown show");
  let st = await loadState(env, show);
  const src = parseChannel(cfg.channelId || cfg.youtube);
  const srcKey = src ? (src.id || "@" + src.handle.toLowerCase()) : "";
  if (st.source !== srcKey) st = { show, source: srcKey, episodes: [], backfillDone: false };   // channel changed in Show Settings: start fresh
  st.errors = [];
  if (!src) { st.errors.push("No YouTube channel set in Show Settings"); st.live = null; st.upcoming = null; st.checkedAt = new Date().toISOString(); await saveState(env, show, st); return st; }
  if (!env.YOUTUBE_API_KEY) { st.errors.push("YOUTUBE_API_KEY is not set"); st.reason = "missing_api_key"; await keylessFallback(st, src, fetcher); st.checkedAt = new Date().toISOString(); await saveState(env, show, st); return st; }
  try {
    if (!st.channelId || !st.uploads) {
      const c = await yt(env, "channels", Object.assign({ part: "id,contentDetails,snippet" }, src.id ? { id: src.id } : { forHandle: "@" + src.handle }), fetcher);
      const ch = (c.items || [])[0]; if (!ch) throw new Error("YouTube channel " + (src.id || "@" + src.handle) + " not found");
      st.channelId = ch.id; st.uploads = ch.contentDetails.relatedPlaylists.uploads; st.channelTitle = (ch.snippet || {}).title || cfg.name;
      st.handle = ((ch.snippet || {}).customUrl || (src.handle ? "@" + src.handle : "")).replace(/^@?/, "@");
    }
    const recent = await yt(env, "playlistItems", { part: "contentDetails", playlistId: st.uploads, maxResults: "25" }, fetcher);
    const vids = await videoDetails(env, (recent.items || []).map(i => i.contentDetails.videoId), fetcher);
    if (!st.backfillDone) {
      const page = await yt(env, "playlistItems", Object.assign({ part: "contentDetails", playlistId: st.uploads, maxResults: "50" }, st.backfillToken ? { pageToken: st.backfillToken } : {}), fetcher);
      const more = await videoDetails(env, (page.items || []).map(i => i.contentDetails.videoId), fetcher);
      vids.push(...more);
      st.backfillToken = page.nextPageToken || ""; st.backfillDone = !page.nextPageToken;
    }
    const live = vids.filter(v => v.kind === "live").sort((a, b) => (b.start > a.start ? 1 : -1))[0] || null;
    const now = new Date().toISOString();
    const upcoming = vids.filter(v => v.kind === "upcoming" && v.scheduled && v.scheduled > now).sort((a, b) => (a.scheduled > b.scheduled ? 1 : -1))[0] || null;
    const byId = new Map((st.episodes || []).map(e => [e.id, e]));
    vids.filter(v => v.kind === "none" && (v.ended || v.duration >= 120)).forEach(v => byId.set(v.id, v));   // finished livestreams + full-length uploads (no Shorts)
    st.episodes = [...byId.values()].sort((a, b) => (b.start > a.start ? 1 : -1));
    if (st.live && !live) st.lastEnded = { id: st.live.id, at: now };    // post-show hook for the Studio
    st.live = live; st.upcoming = upcoming;
    st.reason = ""; st.via = "api";
  } catch (e) {
    st.errors.push(String(e.message || e)); if (e.reason === "quotaExceeded") st.quotaHitAt = new Date().toISOString();
    st.reason = e.reason || "channel_not_found";
    await keylessFallback(st, src, fetcher);
  }
  if (env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && cfg.twitch) {
    try { st.twitchLive = await twitchLive(env, cfg.twitch, st, fetcher); } catch (e) { st.errors.push("Twitch: " + (e.message || e)); }
  } else st.twitchLive = null;
  st.checkedAt = new Date().toISOString();
  await saveState(env, show, st);
  return st;
}
/* Backup when the YouTube API key is missing or refused: YouTube's public channel page + RSS feed (latest 15 videos).
   It can't tell livestreams from uploads, so it lists recent videos; live detection uses the channel's /live page. */
const UA = { "user-agent": "Mozilla/5.0 (compatible; GroovevilleBot/1.0; +https://grooveville.org)", "accept-language": "en-US,en;q=0.9" };
const unx = s => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
export async function keylessFallback(st, src, fetcher) {
  const f = fetcher || fetch;
  try {
    if (!st.channelId) {
      if (src.id) st.channelId = src.id;
      else {
        const html = await (await f("https://www.youtube.com/@" + src.handle, { headers: UA })).text();
        const m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html) || /"(?:externalId|channelId)":"(UC[A-Za-z0-9_-]{22})"/.exec(html);
        if (!m) return;
        st.channelId = m[1]; st.handle = "@" + src.handle;
        const t = /<meta property="og:title" content="([^"]+)"/.exec(html); if (t) st.channelTitle = unx(t[1]);
      }
    }
    const xml = await (await f("https://www.youtube.com/feeds/videos.xml?channel_id=" + st.channelId, { headers: UA })).text();
    const items = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
      const e = m[1], g = re => (re.exec(e) || [])[1] || "";
      const id = g(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      return { id, title: unx(g(/<title>([^<]*)<\/title>/)), kind: "none", thumb: g(/<media:thumbnail url="([^"]+)"/) || ("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"),
        publishedAt: g(/<published>([^<]+)<\/published>/), start: g(/<published>([^<]+)<\/published>/), scheduled: "", ended: "", duration: 0,
        views: Number(g(/<media:statistics views="(\d+)"/) || 0), url: "https://www.youtube.com/watch?v=" + id };
    }).filter(v => v.id && !/#shorts/i.test(v.title));
    if (items.length) {
      const byId = new Map((st.episodes || []).map(e => [e.id, e]));
      items.forEach(v => { if (!byId.has(v.id)) byId.set(v.id, v) });
      st.episodes = [...byId.values()].sort((a, b) => (b.start > a.start ? 1 : -1));
      st.via = "rss";
    }
    try {
      const live = await (await f("https://www.youtube.com/channel/" + st.channelId + "/live", { headers: UA })).text();
      const lv = /"isLiveNow":true/.test(live) && /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/.exec(live);
      st.live = lv ? { id: lv[1], title: unx((/<meta name="title" content="([^"]+)"/.exec(live) || [])[1] || "Live now"), start: new Date().toISOString(), url: "https://www.youtube.com/watch?v=" + lv[1], kind: "live" } : null;
    } catch (e) { }
  } catch (e) { st.errors.push("Backup feed: " + (e.message || e)) }
}
async function twitchLive(env, login, st, fetcher) {
  const f = fetcher || fetch;
  if (!st.twitchToken || st.twitchToken.exp < Date.now() + 60000) {
    const r = await f("https://id.twitch.tv/oauth2/token?client_id=" + encodeURIComponent(env.TWITCH_CLIENT_ID) + "&client_secret=" + encodeURIComponent(env.TWITCH_CLIENT_SECRET) + "&grant_type=client_credentials", { method: "POST" });
    const b = await r.json(); if (!b.access_token) throw new Error("token");
    st.twitchToken = { t: b.access_token, exp: Date.now() + (b.expires_in || 3600) * 1000 };
  }
  const r = await f("https://api.twitch.tv/helix/streams?user_login=" + encodeURIComponent(login), { headers: { "Client-Id": env.TWITCH_CLIENT_ID, Authorization: "Bearer " + st.twitchToken.t } });
  const b = await r.json(); return !!(b.data && b.data.length);
}
function publicLive(st) {
  return { reason: st.reason || "", via: st.via || "", ok: !!st.channelId, channelId: st.channelId || "", channelTitle: st.channelTitle || "", handle: st.handle || "", live: st.live || null, upcoming: st.upcoming || null, twitchLive: st.twitchLive, checkedAt: st.checkedAt || "", stale: !st.checkedAt || (Date.now() - Date.parse(st.checkedAt) > 10 * 60000), error: (st.errors || []).length ? "sync" : "",
    help: ({ missing_api_key: "Add the YOUTUBE_API_KEY secret to the grooveville Worker", keyInvalid: "The YouTube API key is wrong: re-copy it into YOUTUBE_API_KEY", badRequest: "The YouTube API key is wrong or restricted to another API", accessNotConfigured: "Turn on YouTube Data API v3 in the Google Cloud project that owns the key", forbidden: "The key is restricted: allow YouTube Data API v3 and remove website/IP restrictions", quotaExceeded: "Daily YouTube quota used up; it resets at midnight Pacific", channel_not_found: "Check the YouTube channel in Studio › Show Settings", ipRefererBlocked: "Remove the key's website/IP restriction (only the Worker uses it)" })[st.reason] || "" };
}

/* ---------------- Firebase sign-in check ---------------- */
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), c => c.charCodeAt(0));
let JWKS = null, JWKS_AT = 0;
export async function verifyIdToken(token, projectId, jwksFetch) {
  const parts = String(token || "").split("."); if (parts.length !== 3) throw new Error("bad token");
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0]))), body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (head.alg !== "RS256") throw new Error("alg");
  if (!JWKS || Date.now() - JWKS_AT > 3600000 || jwksFetch) {
    const r = await (jwksFetch || fetch)("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    JWKS = (await r.json()).keys || []; JWKS_AT = Date.now();
  }
  const jwk = JWKS.find(k => k.kid === head.kid); if (!jwk) throw new Error("kid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok) throw new Error("signature");
  if (body.aud !== projectId || body.iss !== "https://securetoken.google.com/" + projectId) throw new Error("audience");
  if (!body.sub || body.exp < now || body.iat > now + 300) throw new Error("expired");
  return { uid: body.sub, email: body.email || "", token };
}
/* Reads a Firestore document AS the signed-in person, so Firestore security rules decide what they can see. */
async function fsField(env, path, user, field, fetcher) {
  const r = await (fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + path, { headers: { Authorization: "Bearer " + user.token } });
  if (!r.ok) return "";
  const d = await r.json(); const f = (d.fields || {})[field] || {};
  return f.stringValue || "";
}
export async function studioRank(env, user, show, fetcher) {
  const acc = (await fsField(env, "access/" + user.uid, user, "role", fetcher)).toLowerCase().trim();
  if (acc === "founder" || acc === "hnic") return ROLE_RANK.owner;
  if ((await fsField(env, "studioRoles/" + user.uid, user, "role", fetcher)) === "manager") return ROLE_RANK.manager;
  return ROLE_RANK[await fsField(env, "shows/" + show + "/members/" + user.uid, user, "role", fetcher)] || 0;
}

/* ---------------- R2 signed links (AWS Signature V4, query-string) ---------------- */
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const enc = s => new TextEncoder().encode(s);
async function hmac(key, msg) { const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return crypto.subtle.sign("HMAC", k, enc(msg)) }
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc(s)));
const rfc3986 = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export async function presign({ method, host, path, accessKey, secretKey, region, expires, date }) {
  const d = date || new Date(), amz = d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), day = amz.slice(0, 8);
  const scope = day + "/" + region + "/s3/aws4_request";
  const q = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": accessKey + "/" + scope, "X-Amz-Date": amz, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host" };
  const cq = Object.keys(q).sort().map(k => rfc3986(k) + "=" + rfc3986(q[k])).join("&");
  const cpath = path.split("/").map(rfc3986).join("/");
  const creq = [method, cpath, cq, "host:" + host + "\n", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amz, scope, await sha(creq)].join("\n");
  let k = await hmac("AWS4" + secretKey, day); k = await hmac(k, region); k = await hmac(k, "s3"); k = await hmac(k, "aws4_request");
  return "https://" + host + cpath + "?" + cq + "&X-Amz-Signature=" + hex(await hmac(k, sts));
}
function r2Link(env, method, key, expires) {
  const host = env.CF_ACCOUNT_ID + ".r2.cloudflarestorage.com";
  return presign({ method, host, path: "/" + env.R2_BUCKET_NAME + "/" + key, accessKey: env.R2_ACCESS_KEY_ID, secretKey: env.R2_SECRET_ACCESS_KEY, region: "auto", expires });
}
const safeName = s => String(s || "file").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "file";

/* ---------------- routes ---------------- */
async function api(req, env, ctx) {
  const url = new URL(req.url), p = url.pathname, show = url.searchParams.get("show") || "uncneph";
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (p.startsWith("/api/content/")) return contentApi(req, env, ctx, { p, url, verifyIdToken, fsField });
  if (p.startsWith("/api/guide/")) return guideApi(req, env, ctx, { p, url });
  if (p.startsWith("/api/site/")) return siteApi(req, env, ctx, { p, url, verifyIdToken, fsField });
  if (/^\/api\/(music|tv|songrate)\//.test(p)) return musicApi(req, env, ctx, { p, url, verifyIdToken, fsField, presignR2: r2Link, yt, isoDur });
  const SH = await getShows(env);
  if (p === "/api/live" || p === "/api/episodes") {
    if (!SH[show] || SH[show].disabled) return json({ error: "Unknown show" }, 404);
    const cache = caches.default, ck = new Request(url.origin + p + "?show=" + show + "&o=" + (url.searchParams.get("offset") || 0) + "&l=" + (url.searchParams.get("limit") || 12));
    const hit = await cache.match(ck); if (hit) return hit;
    let st = await loadState(env, show);
    if (!st.checkedAt || Date.now() - Date.parse(st.checkedAt) > 5 * 60000) { try { st = await syncShow(env, show, null, SH[show]) } catch (e) { } }   // cron missed: refresh once
    let body;
    if (p === "/api/live") body = publicLive(st);
    else {
      const off = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0), lim = Math.min(48, Math.max(1, parseInt(url.searchParams.get("limit") || "12", 10) || 12));
      const all = (st.episodes || []).map(({ id, title, thumb, start, duration, views, url }) => ({ id, title, thumb, start, duration, views, url }));
      body = { ok: !!st.channelId, total: all.length, items: all.slice(off, off + lim), next: off + lim < all.length ? off + lim : null, complete: !!st.backfillDone, checkedAt: st.checkedAt || "" };
    }
    const res = json(body, 200, { "cache-control": "public, max-age=" + (p === "/api/live" ? 30 : 300) });
    ctx.waitUntil(cache.put(ck, res.clone()));
    return res;
  }
  if (p.startsWith("/api/studio/") || p === "/api/sync") {
    let user;
    try { user = await verifyIdToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.FIREBASE_PROJECT_ID) } catch (e) { return json({ error: "Sign in again" }, 401) }
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const s = String(body.show || show); if (!/^[a-z0-9-]{2,40}$/.test(s)) return json({ error: "Unknown show" }, 404);
    const rank = await studioRank(env, user, s);
    if (!rank) return json({ error: "No Studio access for this show" }, 403);
    if (p === "/api/sync") { if (rank < ROLE_RANK.manager) return json({ error: "Managers only" }, 403); SHOW_CACHE = null; const st = await syncShow(env, s); return json(Object.assign(publicLive(st), { errors: st.errors || [] })) }
    if (p === "/api/studio/status") return json(Object.assign(publicLive(await loadState(env, s)), { lastEnded: (await loadState(env, s)).lastEnded || null, rank, errors: rank >= 4 ? (await loadState(env, s)).errors || [] : [], storage: !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.CF_ACCOUNT_ID) }));
    if (!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.CF_ACCOUNT_ID && env.R2_BUCKET_NAME)) return json({ error: "Studio storage isn't set up yet (R2 keys missing)" }, 503);
    if (p === "/api/studio/upload") {
      if (rank < ROLE_RANK.editor) return json({ error: "Editors and above can upload recordings" }, 403);
      const kind = body.kind === "export" ? "exports" : "recordings";
      if (kind === "exports" && rank < ROLE_RANK.editor) return json({ error: "Not allowed" }, 403);
      if (Number(body.size) > 5e9) return json({ error: "Files over 5 GB need to be split or compressed first" }, 413);
      if (!/^(video|audio)\//.test(body.contentType || "")) return json({ error: "Upload a video or audio file" }, 415);
      const key = "shows/" + s + "/" + kind + "/" + safeName(body.episodeId || "misc") + "/" + Date.now().toString(36) + "-" + safeName(body.filename);
      return json({ key, url: await r2Link(env, "PUT", key, 3600) });
    }
    if (p === "/api/studio/file") {
      const key = String(body.key || ""); const prefix = "shows/" + s + "/";
      if (!key.startsWith(prefix) || key.includes("..")) return json({ error: "Not allowed" }, 403);
      const isRecording = key.startsWith(prefix + "recordings/");
      if (isRecording && rank < ROLE_RANK.editor) return json({ error: "Recordings are limited to editors, producers and managers" }, 403);
      return json({ url: await r2Link(env, "GET", key, 3600) });
    }
    return json({ error: "Not found" }, 404);
  }
  return json({ error: "Not found" }, 404);
}

/* Share links for artist pages (grooveville.org/artist/<id>): social apps get a real preview, people land on the page. */
async function artistShare(env, id, url) {
  let a = null; try { a = await fsPublic(env, "musicArtists/" + id) } catch (e) { }
  const e = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = a && a.name ? a.name : "Grooveville Artists", desc = a && a.bio ? String(a.bio).slice(0, 180) : "Official Grooveville Artist on Grooveville Music.";
  const img = a && a.portrait ? url.origin + "/api/music/img/" + a.portrait : url.origin + "/media/og-share-v2.jpg", dest = "/#artist/" + id;
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + e(name) + ' · Grooveville Music</title><meta name="description" content="' + e(desc) + '">' +
    '<meta property="og:type" content="profile"><meta property="og:site_name" content="Grooveville"><meta property="og:title" content="' + e(name) + ' · Grooveville Music"><meta property="og:description" content="' + e(desc) + '"><meta property="og:image" content="' + e(img) + '"><meta property="og:url" content="' + e(url.origin + "/artist/" + id) + '">' +
    '<meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0; url=' + e(dest) + '"><script>location.replace(' + JSON.stringify(dest) + ')</script></head><body style="background:#101112;color:#f3efe7;font-family:system-ui;padding:40px"><a style="color:#f4a987" href="' + e(dest) + '">' + e(name) + ' on Grooveville</a></body></html>', { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
/* Share links for songs (grooveville.org/song/<id>): a rich preview in messages and social apps, then straight to the song.
   Only published songs get a preview; the audio itself is never offered as a file. */
async function songShare(env, id, url) {
  let s = null, a = null, al = null;
  try { s = await fsPublic(env, "musicSongs/" + id) } catch (e) { }
  if (s && s.published !== true) s = null;
  if (s && s.artistId) { try { a = await fsPublic(env, "musicArtists/" + s.artistId) } catch (e) { } }
  if (s && !s.art && s.albumId) { try { al = await fsPublic(env, "musicAlbums/" + s.albumId) } catch (e) { } }
  const e = v => String(v || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const artist = (a && a.name) || (s && (s.artistName || s.artist)) || "Grooveville";
  const title = s ? s.title + " · " + artist : "Grooveville Music";
  const desc = s ? "Listen to “" + s.title + "” by " + artist + ", a Grooveville Original. Plays right on grooveville.org." : "Grooveville Originals, artists and the Grooveville sound.";
  const art = (s && s.art) || (al && al.art) || "";
  const img = art ? url.origin + "/api/music/img/" + art : url.origin + "/media/og-square-v2.jpg", dest = s ? "/#song/" + id : "/#music";
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + e(title) + ' · Grooveville</title><meta name="description" content="' + e(desc) + '">' +
    '<meta property="og:type" content="music.song"><meta property="og:site_name" content="Grooveville"><meta property="og:title" content="' + e(title) + '"><meta property="og:description" content="' + e(desc) + '"><meta property="og:image" content="' + e(img) + '"><meta property="og:url" content="' + e(url.origin + "/song/" + id) + '">' +
    '<meta name="twitter:card" content="' + (art ? "summary" : "summary_large_image") + '"><meta name="twitter:title" content="' + e(title) + '"><meta name="twitter:image" content="' + e(img) + '"><meta name="theme-color" content="#0b0b0c">' +
    '<meta http-equiv="refresh" content="0; url=' + e(dest) + '"><script>location.replace(' + JSON.stringify(dest) + ')</script></head><body style="background:#0b0b0c;color:#f3efe7;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><a style="color:#f4a987" href="' + e(dest) + '">Open ' + e(s ? s.title : "Grooveville Music") + ' on Grooveville</a></body></html>',
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const am = /^\/artist\/([a-z0-9-]{1,60})\/?$/.exec(url.pathname);
    if (am) return artistShare(env, am[1], url);
    const sm = /^\/song\/([A-Za-z0-9_-]{2,64})\/?$/.exec(url.pathname);
    if (sm) return songShare(env, sm[1], url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(req, env, ctx) } catch (e) { return json({ error: "Server error" }, 500) }
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) {
    const SH = await getShows(env);
    for (const [s, cfg] of Object.entries(SH)) if (!cfg.disabled) ctx.waitUntil(syncShow(env, s, null, cfg).catch(() => {}));
    ctx.waitUntil(contentCron(env).catch(() => {}));
  }
};
