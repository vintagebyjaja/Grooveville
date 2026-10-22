/* Grooveville Music, TV and Song Rate endpoints.
   - Founder-only: signed R2 upload links for MP3s/artwork, MP3 checks, deletes, draft previews, YouTube lookups.
   - Public: stream published Grooveville Originals from R2 (byte ranges), artwork, Song Rate submissions (only when switched on).
   Song Rate submissions live in R2 (private), never in a public collection. */
const json = (o, status, extra) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra || {}) });
const MAX_MP3 = 100 * 1024 * 1024, MAX_IMG = 8 * 1024 * 1024;
const safe = s => String(s || "file").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "file";

/* public Firestore read (no credentials): returns fields or null if missing / not public */
export async function fsPublic(env, path, fetcher) {
  const r = await (fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + path);
  if (!r.ok) return null;
  const d = await r.json(); const out = {};
  Object.entries(d.fields || {}).forEach(([k, v]) => { out[k] = v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? null) });
  return out;
}
const songCache = new Map();
async function publishedSong(env, id, fetcher) {
  const c = songCache.get(id); if (c && Date.now() - c.at < 120000) return c.v;
  const v = await fsPublic(env, "musicSongs/" + encodeURIComponent(id), fetcher);
  const ok = v && v.published === true && typeof v.audioKey === "string" && v.audioKey.startsWith("music/audio/") ? v : null;
  songCache.set(id, { at: Date.now(), v: ok }); return ok;
}
/* "bytes=a-b", "bytes=a-", "bytes=-n" → {offset,length} */
export function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || "").trim()); if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") { const n = Math.min(Number(m[2]), size); start = size - n; end = size - 1 }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (start > end || start >= size) return { invalid: true };
  return { offset: start, length: end - start + 1 };
}
export async function serveR2(env, key, req, type, cache) {
  const head = await env.STUDIO_BUCKET.head(key); if (!head) return new Response("Not found", { status: 404 });
  const size = head.size, rg = parseRange(req.headers.get("range"), size);
  const base = { "content-type": type || (head.httpMetadata || {}).contentType || "application/octet-stream", "accept-ranges": "bytes", "cache-control": cache, etag: head.httpEtag };
  if (rg && rg.invalid) return new Response(null, { status: 416, headers: Object.assign(base, { "content-range": "bytes */" + size }) });
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: Object.assign(base, { "content-length": String(size) }) });
  const obj = await env.STUDIO_BUCKET.get(key, rg ? { range: rg } : {});
  if (!obj) return new Response("Not found", { status: 404 });
  if (rg) return new Response(obj.body, { status: 206, headers: Object.assign(base, { "content-length": String(rg.length), "content-range": "bytes " + rg.offset + "-" + (rg.offset + rg.length - 1) + "/" + size }) });
  return new Response(obj.body, { status: 200, headers: Object.assign(base, { "content-length": String(size) }) });
}
/* MP3 check: ID3 tag or an MPEG audio frame sync at the start */
export function looksLikeMp3(b) { return (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) }

/* ---------- link platforms (Song Rate, Charts) ---------- */
export const PLATFORMS = [
  ["spotify", "Spotify", /^open\.spotify\.com$/], ["youtube", "YouTube", /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/], ["soundcloud", "SoundCloud", /^(www\.|m\.|on\.)?soundcloud\.com$/],
  ["apple", "Apple Music", /^music\.apple\.com$/], ["audiomack", "Audiomack", /^(www\.)?audiomack\.com$/], ["tidal", "TIDAL", /^(www\.|listen\.)?tidal\.com$/],
  ["deezer", "Deezer", /^(www\.)?deezer\.com$/], ["bandcamp", "Bandcamp", /^[a-z0-9-]+\.bandcamp\.com$/]
];
export function platformOf(url) {
  try { const u = new URL(url); if (u.protocol !== "https:") return null; const p = PLATFORMS.find(x => x[2].test(u.hostname.toLowerCase())); return p ? { id: p[0], name: p[1] } : null } catch (e) { return null }
}
async function oembed(url, platform, fetcher) {
  const ep = { youtube: "https://www.youtube.com/oembed?format=json&url=", spotify: "https://open.spotify.com/oembed?url=", soundcloud: "https://soundcloud.com/oembed?format=json&url=" }[platform];
  if (!ep) return null;
  try { const r = await (fetcher || fetch)(ep + encodeURIComponent(url)); if (!r.ok) return null; const d = await r.json(); return { title: d.title || "", author: d.author_name || "", thumb: d.thumbnail_url || "" } } catch (e) { return null }
}

/* ---------- YouTube (TV) ---------- */
function ytIds(url) {
  try { const u = new URL(url); const h = u.hostname.replace(/^www\.|^m\.|^music\./, "");
    const list = u.searchParams.get("list") || "";
    let v = u.searchParams.get("v") || "";
    if (h === "youtu.be") v = u.pathname.slice(1, 12);
    const m = /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/.exec(u.pathname); if (m) v = m[1];
    return (h === "youtube.com" || h === "youtu.be") ? { v: /^[A-Za-z0-9_-]{11}$/.test(v) ? v : "", list: /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : "" } : null;
  } catch (e) { return null }
}
const pickThumb = th => { th = th || {}; return (th.maxres || th.standard || th.high || th.medium || th.default || {}).url || "" };

export async function musicApi(req, env, ctx, h) {
  const { p, url, verifyIdToken, fsField, presignR2, yt, isoDur } = h;
  const fetcher = h.fetcher;
  /* public: stream published originals */
  let m = /^\/api\/music\/a\/([A-Za-z0-9_-]{2,64})$/.exec(p);
  if (m && (req.method === "GET" || req.method === "HEAD")) {
    /* stream only into a player on grooveville.org: opening the audio address in a tab, or embedding it on another site, is refused */
    const dest = req.headers.get("sec-fetch-dest"), site = req.headers.get("sec-fetch-site");
    if (dest === "document" || dest === "iframe" || dest === "embed" || dest === "object") return Response.redirect(url.origin + "/song/" + m[1], 302);
    if (site === "cross-site") return new Response("Grooveville Originals play on grooveville.org", { status: 403 });
    const s = await publishedSong(env, m[1], fetcher); if (!s) return new Response("Not found", { status: 404 });
    const r = await serveR2(env, s.audioKey, req, "audio/mpeg", "private, max-age=3600");
    r.headers.set("content-disposition", "inline");r.headers.set("x-content-type-options", "nosniff");r.headers.set("cross-origin-resource-policy", "same-origin");
    return r;
  }
  m = /^\/api\/music\/img\/(music\/img\/[A-Za-z0-9._\/-]+)$/.exec(p);
  if (m && (req.method === "GET" || req.method === "HEAD")) { if (m[1].includes("..")) return new Response("Bad", { status: 400 }); return serveR2(env, m[1], req, null, "public, max-age=604800, immutable") }
  /* public: Song Rate submission (only when the founder switched it on) */
  if (p === "/api/songrate/status") { const f = await fsPublic(env, "musicSettings/flags", fetcher); return json({ songRate: !!(f && f.songRate), charts: !!(f && f.charts) }, 200, { "cache-control": "public, max-age=60" }) }
  if (p === "/api/songrate/submit" && req.method === "POST") {
    const f = await fsPublic(env, "musicSettings/flags", fetcher); if (!(f && f.songRate)) return json({ error: "Song Rate isn't open yet" }, 403);
    let b; try { b = await req.json() } catch (e) { return json({ error: "Bad request" }, 400) }
    if (b.website2) return json({ ok: true });                       // honeypot: bots fill hidden fields
    const clip = (v, n) => String(v || "").trim().slice(0, n);
    const sub = { artist: clip(b.artist, 80), title: clip(b.title, 120), url: clip(b.url, 400), genre: clip(b.genre, 40), social: clip(b.social, 300), email: clip(b.email, 120), message: clip(b.message, 800) };
    if (!sub.artist || !sub.title || !sub.url) return json({ error: "Artist, song title and song link are required" }, 400);
    const plat = platformOf(sub.url); if (!plat) return json({ error: "Use a link from Spotify, YouTube, SoundCloud, Apple Music, Audiomack, TIDAL, Deezer or Bandcamp" }, 400);
    if (sub.social && !/^https:\/\//.test(sub.social)) return json({ error: "Social link must start with https://" }, 400);
    if (sub.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sub.email)) return json({ error: "Check the email address" }, 400);
    const ip = req.headers.get("cf-connecting-ip") || "0", hour = new Date().toISOString().slice(0, 13);
    const ipHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + env.FIREBASE_PROJECT_ID)))).slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join("");
    const rlKey = "songrate/rl/" + hour + "/" + ipHash, rl = await env.STUDIO_BUCKET.get(rlKey), n = rl ? Number(await rl.text()) || 0 : 0;
    if (n >= 5) return json({ error: "Too many submissions. Try again in an hour." }, 429);
    await env.STUDIO_BUCKET.put(rlKey, String(n + 1));
    const meta = await oembed(sub.url, plat.id, fetcher);
    const id = Date.now().toString(36) + "-" + crypto.randomUUID().slice(0, 8);
    const rec = Object.assign(sub, { id, platform: plat.id, platformName: plat.name, meta, metaOk: !!meta, status: "submitted", submittedAt: new Date().toISOString(), history: [{ status: "submitted", at: new Date().toISOString() }] });
    await env.STUDIO_BUCKET.put("songrate/sub/" + id + ".json", JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
    return json({ ok: true, id });
  }
  /* founder-only below */
  let user;
  try { user = await verifyIdToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.FIREBASE_PROJECT_ID) } catch (e) { return json({ error: "Sign in again" }, 401) }
  const role = (await fsField(env, "access/" + user.uid, user, "role", fetcher)).toLowerCase().trim();
  if (role !== "founder" && role !== "hnic") return json({ error: "Founder only" }, 403);
  let b = {}; if (req.method === "POST") { try { b = await req.json() } catch (e) { } }
  const r2ready = env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.CF_ACCOUNT_ID;
  /* Direct upload through the Worker's R2 binding (no R2 API keys needed). Workers accept bodies up to 100 MB. */
  if (p === "/api/music/put" && req.method === "PUT") {
    const key = url.searchParams.get("key") || "", isAudio = key.startsWith("music/audio/");
    if (!/^music\/(audio|img)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(key)) return json({ error: "Bad key" }, 400);
    const len = Number(req.headers.get("content-length") || 0), type = (req.headers.get("content-type") || "").split(";")[0];
    if (!len || len > (isAudio ? MAX_MP3 : MAX_IMG)) return json({ error: isAudio ? "MP3s can be up to 100 MB" : "Images can be up to 8 MB" }, 413);
    if (isAudio ? type !== "audio/mpeg" : !/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "Wrong file type" }, 415);
    await env.STUDIO_BUCKET.put(key, req.body, { httpMetadata: { contentType: type, cacheControl: isAudio ? "public, max-age=86400" : "public, max-age=604800" } });
    return json({ ok: true, key });
  }
  if (p === "/api/music/raw" && req.method === "GET") {
    const key = url.searchParams.get("key") || ""; if (!/^music\/(audio|img)\//.test(key) || key.includes("..")) return json({ error: "Not allowed" }, 403);
    return serveR2(env, key, req, null, "private, no-store");
  }
  if (p === "/api/music/upload") {
    const kind = b.kind === "image" ? "image" : "audio", size = Number(b.size) || 0, type = String(b.contentType || "");
    if (kind === "audio" && !(type === "audio/mpeg" || type === "audio/mp3" || /\.mp3$/i.test(b.filename || ""))) return json({ error: "Upload an MP3 file" }, 415);
    if (kind === "image" && !/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: "Use a JPG, PNG or WebP image" }, 415);
    if (!size || size > (kind === "audio" ? MAX_MP3 : MAX_IMG)) return json({ error: kind === "audio" ? "MP3s can be up to 100 MB" : "Images can be up to 8 MB" }, 413);
    const key = (kind === "audio" ? "music/audio/" : "music/img/") + safe(b.id || "x") + "/" + crypto.randomUUID().slice(0, 12) + "-" + safe(b.filename);
    return json({ key, url: "/api/music/put?key=" + encodeURIComponent(key), direct: true, contentType: kind === "audio" ? "audio/mpeg" : type });
  }
  if (p === "/api/music/verify") {
    const key = String(b.key || ""); if (!key.startsWith("music/audio/")) return json({ error: "Not allowed" }, 403);
    const o = await env.STUDIO_BUCKET.get(key, { range: { offset: 0, length: 4 } }); if (!o) return json({ error: "Upload not found" }, 404);
    const bytes = new Uint8Array(await o.arrayBuffer());
    if (!looksLikeMp3(bytes)) { await env.STUDIO_BUCKET.delete(key); return json({ error: "That file isn't a valid MP3" }, 415) }
    const head = await env.STUDIO_BUCKET.head(key); return json({ ok: true, size: head ? head.size : 0 });
  }
  if (p === "/api/music/file") { const key = String(b.key || ""); if (!/^music\/(audio|img)\//.test(key) || key.includes("..")) return json({ error: "Not allowed" }, 403); if (!r2ready) return json({ url: "/api/music/raw?key=" + encodeURIComponent(key), direct: true }); return json({ url: await presignR2(env, "GET", key, 3600) }) }
  if (p === "/api/music/delete") { const keys = (b.keys || []).filter(k => typeof k === "string" && /^music\/(audio|img)\//.test(k) && !k.includes("..")).slice(0, 20); for (const k of keys) await env.STUDIO_BUCKET.delete(k); return json({ ok: true, deleted: keys.length }) }
  if (p === "/api/tv/resolve") {
    const ids = ytIds(String(b.url || "")); if (!ids || (!ids.v && !ids.list)) return json({ error: "Paste a YouTube video or playlist link" }, 400);
    const asList = ids.list && (b.as === "playlist" || !ids.v);
    if (env.YOUTUBE_API_KEY) {
      try {
        if (asList) {
          const pl = await yt(env, "playlists", { part: "snippet,contentDetails", id: ids.list }, fetcher); const it = (pl.items || [])[0]; if (!it) return json({ error: "Playlist not found or private" }, 404);
          const items = await yt(env, "playlistItems", { part: "snippet,contentDetails", playlistId: ids.list, maxResults: "50" }, fetcher);
          return json({ type: "playlist", playlistId: ids.list, title: it.snippet.title, description: (it.snippet.description || "").slice(0, 600), thumb: pickThumb(it.snippet.thumbnails), channel: it.snippet.channelTitle, count: (it.contentDetails || {}).itemCount || 0,
            items: (items.items || []).filter(x => x.snippet && x.snippet.title !== "Private video" && x.snippet.title !== "Deleted video").map(x => ({ id: x.contentDetails.videoId, title: x.snippet.title, thumb: pickThumb(x.snippet.thumbnails) })), via: "api" });
        }
        const v = await yt(env, "videos", { part: "snippet,contentDetails,status", id: ids.v }, fetcher); const it = (v.items || [])[0]; if (!it) return json({ error: "Video not found or private" }, 404);
        return json({ type: "video", youtubeId: ids.v, title: it.snippet.title, description: (it.snippet.description || "").slice(0, 600), thumb: pickThumb(it.snippet.thumbnails), channel: it.snippet.channelTitle, duration: isoDur((it.contentDetails || {}).duration), embeddable: (it.status || {}).embeddable !== false, published: it.snippet.publishedAt, via: "api" });
      } catch (e) { /* fall through to oEmbed */ }
    }
    const o = await oembed("https://www.youtube.com/" + (asList ? "playlist?list=" + ids.list : "watch?v=" + ids.v), "youtube", fetcher);
    if (!o) return json({ error: "Couldn't read that YouTube link (private, deleted, or embedding off)" }, 404);
    return asList ? json({ type: "playlist", playlistId: ids.list, title: o.title, thumb: o.thumb, channel: o.author, items: [], via: "oembed" })
      : json({ type: "video", youtubeId: ids.v, title: o.title, thumb: o.thumb || ("https://i.ytimg.com/vi/" + ids.v + "/hqdefault.jpg"), channel: o.author, embeddable: true, via: "oembed" });
  }
  if (p === "/api/tv/channel-playlists") {
    if (!env.YOUTUBE_API_KEY) return json({ error: "YOUTUBE_API_KEY isn't set" }, 503);
    const ch = String(b.channel || "@GroovevilleEnt").trim(), idm = /(UC[A-Za-z0-9_-]{22})/.exec(ch), hm = /@([A-Za-z0-9._-]{3,30})/.exec(ch);
    try {
      const c = await yt(env, "channels", Object.assign({ part: "id,snippet" }, idm ? { id: idm[1] } : { forHandle: "@" + (hm ? hm[1] : ch.replace(/^@/, "")) }), fetcher);
      const it = (c.items || [])[0]; if (!it) return json({ error: "Channel not found" }, 404);
      const pls = await yt(env, "playlists", { part: "snippet,contentDetails", channelId: it.id, maxResults: "50" }, fetcher);
      return json({ channelId: it.id, channelTitle: it.snippet.title, playlists: (pls.items || []).map(x => ({ playlistId: x.id, title: x.snippet.title, thumb: pickThumb(x.snippet.thumbnails), count: (x.contentDetails || {}).itemCount || 0 })) });
    } catch (e) { return json({ error: String(e.message || e) }, 502) }
  }
  if (p === "/api/songrate/list") {
    const out = []; let cursor;
    for (let i = 0; i < 3; i++) { const l = await env.STUDIO_BUCKET.list({ prefix: "songrate/sub/", limit: 200, cursor }); for (const o of l.objects) { const g = await env.STUDIO_BUCKET.get(o.key); if (g) out.push(await g.json()) } if (!l.truncated) break; cursor = l.cursor }
    out.sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : -1)); return json({ items: out });
  }
  if (p === "/api/songrate/update") {
    const id = String(b.id || ""); if (!/^[a-z0-9-]{6,40}$/.test(id)) return json({ error: "Bad id" }, 400);
    const key = "songrate/sub/" + id + ".json", g = await env.STUDIO_BUCKET.get(key); if (!g) return json({ error: "Not found" }, 404);
    const rec = await g.json(), FLOW = { submitted: ["pending", "declined"], pending: ["reviewed", "declined"], reviewed: ["approved", "declined", "pending"], approved: ["charted", "declined", "reviewed"], declined: ["pending"], charted: ["approved"] };
    if (b.status && b.status !== rec.status) { if (!(FLOW[rec.status] || []).includes(b.status)) return json({ error: "Can't move from " + rec.status + " to " + b.status }, 409); rec.status = b.status; rec.history = (rec.history || []).concat({ status: b.status, at: new Date().toISOString(), by: user.uid }) }
    if (b.delete) { await env.STUDIO_BUCKET.delete(key); return json({ ok: true, deleted: true }) }
    await env.STUDIO_BUCKET.put(key, JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } }); return json({ ok: true, item: rec });
  }
  if (p === "/api/songrate/meta") { const plat = platformOf(String(b.url || "")); if (!plat) return json({ error: "Unsupported link" }, 400); return json({ platform: plat, meta: await oembed(b.url, plat.id, fetcher) }) }
  return json({ error: "Not found" }, 404);
}
