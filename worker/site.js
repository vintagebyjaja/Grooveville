/* Website Studio media (Back office › Media Library).
   Files live in R2 under site/media/<assetId>/<rev>-<variant>.<ext>
     o = original upload, d = desktop size, m = phone size, t = thumbnail / video poster.
   Public visitors can only load files that belong to the PUBLISHED site (settings/site.assets in Firestore).
   Drafts and unpublished uploads are only reachable by the founder, either with a signed-in request
   or with a short-lived preview token used by Preview mode. Uploads, deletes and tokens are founder-only. */
import { serveR2 } from "./music.js";
const json = (o, status) => new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const IMG = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const VID = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const TYPE_OF = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
export const MAX = { img: 30 * 1024 * 1024, video: 95 * 1024 * 1024, variant: 8 * 1024 * 1024 };
const ID = /^as_[a-z0-9]{6,24}$/;
export const FILE = /^\/api\/site\/m\/(as_[a-z0-9]{6,24})\/(\d{1,6})-([odmt])\.(jpg|png|webp|avif|mp4|webm|mov)$/;

/* published asset registry, read from Firestore without credentials (settings/site is public) */
let REG = { at: 0, v: null };
export function resetRegistry() { REG = { at: 0, v: null } }
function num(v) { return v ? Number(v.integerValue ?? v.doubleValue ?? v.stringValue ?? 0) : 0 }
export async function publishedAssets(env, fetcher) {
  if (REG.v && Date.now() - REG.at < 20000) return REG.v;
  const r = await (fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/settings/site?mask.fieldPaths=assets");
  const out = {};
  if (r.ok) {
    const d = await r.json(); const m = (((d.fields || {}).assets || {}).mapValue || {}).fields || {};
    for (const [id, v] of Object.entries(m)) { const f = (v.mapValue || {}).fields || {}; out[id] = { rev: num(f.rev), orev: num(f.orev) || num(f.rev) } }
  }
  REG = { at: Date.now(), v: out };
  return out;
}

/* preview tokens: HMAC(secret, expiry). The secret comes from SITE_PREVIEW_SECRET or is generated once and kept in R2. */
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function secret(env) {
  if (env.SITE_PREVIEW_SECRET) return env.SITE_PREVIEW_SECRET;
  const o = await env.STUDIO_BUCKET.get("site/_preview-secret"); if (o) return await o.text();
  const s = b64u(crypto.getRandomValues(new Uint8Array(32))); await env.STUDIO_BUCKET.put("site/_preview-secret", s); return s;
}
async function hmac(env, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(await secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
export async function makeToken(env, ttlSec) { const exp = Math.floor(Date.now() / 1000) + (ttlSec || 43200); return exp + "." + await hmac(env, "gv-preview:" + exp) }
export async function checkToken(env, t) {
  const m = /^(\d{10})\.([A-Za-z0-9_-]{20,})$/.exec(String(t || "")); if (!m || Number(m[1]) < Date.now() / 1000) return false;
  const want = await hmac(env, "gv-preview:" + m[1]); if (want.length !== m[2].length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ m[2].charCodeAt(i); return d === 0;
}

export async function siteApi(req, env, ctx, h) {
  const { p, url, verifyIdToken, fsField, fetcher } = h;
  if (!env.STUDIO_BUCKET) return json({ error: "The STUDIO_BUCKET R2 binding is missing (see STUDIO-SETUP.md)" }, 503);
  /* serve a file */
  const fm = FILE.exec(p);
  if (fm && (req.method === "GET" || req.method === "HEAD")) {
    const [, id, rev, v, ext] = fm, key = "site/media/" + id + "/" + rev + "-" + v + "." + ext;
    if (await checkToken(env, url.searchParams.get("pt"))) return serveR2(env, key, req, TYPE_OF[ext], "private, max-age=600");
    const reg = (await publishedAssets(env, fetcher))[id];
    if (!reg || Number(rev) !== (v === "o" ? reg.orev : reg.rev)) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    return serveR2(env, key, req, TYPE_OF[ext], "public, max-age=31536000, immutable");
  }
  /* founder only below */
  let user;
  try { user = await verifyIdToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), env.FIREBASE_PROJECT_ID) } catch (e) { return json({ error: "Sign in again" }, 401) }
  const role = String(await fsField(env, "access/" + user.uid, user, "role", fetcher) || "").toLowerCase().trim();
  if (role !== "founder" && role !== "hnic") return json({ error: "Founder only" }, 403);

  if (p === "/api/site/put" && req.method === "PUT") {
    const id = url.searchParams.get("id") || "", rev = url.searchParams.get("rev") || "", v = url.searchParams.get("v") || "";
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), len = Number(req.headers.get("content-length") || 0);
    if (!ID.test(id) || !/^\d{1,6}$/.test(rev) || !/^[odmt]$/.test(v)) return json({ error: "Bad upload address" }, 400);
    const ext = IMG[type] || VID[type];
    if (!ext || (v !== "o" && !/^image\/(webp|jpeg)$/.test(type))) return json({ error: "Use JPG, PNG, WebP or AVIF images, or MP4, WebM or MOV video" }, 415);
    const max = v !== "o" ? MAX.variant : VID[type] ? MAX.video : MAX.img;
    if (!len) return json({ error: "Empty file" }, 400);
    if (len > max) return json({ error: VID[type] ? "Videos can be up to 95 MB. For longer films, add a YouTube or Vimeo link instead." : "That file is too large" }, 413);
    const key = "site/media/" + id + "/" + rev + "-" + v + "." + ext;
    await env.STUDIO_BUCKET.put(key, req.body, { httpMetadata: { contentType: type }, customMetadata: { by: user.uid, at: new Date().toISOString() } });
    return json({ ok: true, key, ext });
  }
  if (p === "/api/site/token" && req.method === "GET") { const t = await makeToken(env); return json({ token: t, exp: Number(t.split(".")[0]) }) }
  if (p === "/api/site/delete" && req.method === "POST") {
    let b = {}; try { b = await req.json() } catch (e) { }
    if (!ID.test(b.id || "")) return json({ error: "Bad id" }, 400);
    if ((await publishedAssets(env, fetcher))[b.id]) { resetRegistry(); if ((await publishedAssets(env, fetcher))[b.id]) return json({ error: "This file is on the live site. Publish a version without it first." }, 409) }
    let cursor, n = 0;
    do { const l = await env.STUDIO_BUCKET.list({ prefix: "site/media/" + b.id + "/", cursor }); for (const o of l.objects) { await env.STUDIO_BUCKET.delete(o.key); n++ } cursor = l.truncated ? l.cursor : null } while (cursor);
    return json({ ok: true, deleted: n });
  }
  if (p === "/api/site/purge" && req.method === "POST") { resetRegistry(); return json({ ok: true }) }
  return json({ error: "Not found" }, 404);
}
