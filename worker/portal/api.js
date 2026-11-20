/* /api/p/* : Grooveville Portals router. Rentals, Entertainment and Administration share this backend,
   but every handler checks who is asking on the server: customers only ever see their own records. */
import { J, db, who, settings, pj, one, all, run, now, rid, ipOf, uaOf, signLink, checkLink, FILE_RE, stripeMode, stripeVerify, sha256, clean, limited, audit, notify } from "./core.js";
import { rentalsApi, rentalsCron } from "./rentals.js";
import { docsCron } from "./docs.js";
import { docsApi } from "./docs.js";
import { entApi, entCron, publicEventMeta } from "./ent.js";
import { financeApi, stripeEvent } from "./finance.js";
import { adminApi } from "./admin.js";
import { inviteApi } from "./invites.js";

const MAX_UP = { pub: 12e6, account: 5e6, verification: 15e6, doc: 25e6, final: 30e6, license: 15e6 };
const TYPES = { account: /^image\/(png|jpeg|webp)$/, pub: /^image\/(png|jpeg|webp)$/, verification: /^(image\/(png|jpeg|webp)|application\/pdf)$/, license: /^(image\/(png|jpeg|webp)|application\/pdf)$/, doc: /^application\/pdf$/, final: /^application\/pdf$/ };

export async function portalApi(req, env, ctx, h) {
  const url = new URL(req.url), p = url.pathname; let D;
  try { D = await db(env) } catch (e) { return J({ error: e.message, setup: "d1" }, 503) }
  try {
    /* Stripe webhook (portal endpoint) */
    if (p === "/api/p/stripe" && req.method === "POST") {
      const raw = await req.text(), secret = env.STRIPE_PORTAL_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET;
      if (!(await stripeVerify(secret, raw, req.headers.get("stripe-signature")))) return J({ error: "Bad signature" }, 400);
      let ev; try { ev = JSON.parse(raw) } catch (e) { return J({ error: "Bad payload" }, 400) }
      return J(await stripeEvent(env, D, ev, h.fetcher));
    }
    /* signed private file links */
    let m = /^\/api\/p\/file\/(\d{9,11})\.([0-9a-f]{32})\/(portal\/.+)$/.exec(p);
    if (m && req.method === "GET") { const name = url.searchParams.get("name") || ""; if (!FILE_RE.test(m[3]) || m[3].includes("..") || !(await checkLink(env, m[1], m[2], m[3], name))) return new Response("This link has expired. Open it again from your Grooveville account.", { status: 403 });
      const o = await env.STUDIO_BUCKET.get(m[3]); if (!o) return new Response("Not found", { status: 404 });
      return new Response(o.body, { headers: { "content-type": (o.httpMetadata && o.httpMetadata.contentType) || "application/octet-stream", "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-disposition": (name ? "attachment; filename=\"" + name.replace(/[^A-Za-z0-9 ._-]/g, "") + "\"" : "inline") } }) }
    /* public images (listing photos, flyers, host photos, galleries) */
    m = /^\/api\/p\/img\/(portal\/pub\/[A-Za-z0-9._\/-]{3,200})$/.exec(p);
    if (m && req.method === "GET") { const o = await env.STUDIO_BUCKET.get(m[1]); if (!o) return new Response("Not found", { status: 404 }); return new Response(o.body, { headers: { "content-type": (o.httpMetadata && o.httpMetadata.contentType) || "image/jpeg", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } }) }

    const [S, u] = await Promise.all([settings(D), who(req, env, h, D)]);
    let b = {}; const ct = req.headers.get("content-type") || "";
    if (req.method === "POST" && ct.includes("application/json")) { const t = await req.text(); if (t.length > 400000) return J({ error: "Too much data" }, 413); try { b = JSON.parse(t || "{}") } catch (e) { return J({ error: "Bad request" }, 400) } }
    const C = { req, env, ctx, D, S, u, b, url, p, h, ip: ipOf(req), ua: uaOf(req), fetcher: h.fetcher, mode: stripeMode(env) };

    if (p === "/api/p/status") return J({ ok: true, rentals_open: !!S.rentals_open, ent_open: !!S.ent_open, stripe: C.mode, payments_live: !!S.payments_live, payouts_on: false, signedIn: !!u, admin: !!(u && u.admin), founder: !!(u && u.founder), tester: !!(u && u.tester), email: !!(env.RESEND_API_KEY && env.MAIL_FROM) });

    /* uploads: raw bytes, checked by purpose */
    if (p === "/api/p/upload" && req.method === "PUT") {
      if (!u) return J({ error: "Sign in first" }, 401); if (await limited(D, "up:" + u.uid, 120, 3600)) return J({ error: "Too many uploads. Try again later." }, 429);
      const purpose = url.searchParams.get("purpose") || "", type = (ct.split(";")[0] || "").trim(), len = Number(req.headers.get("content-length") || 0);
      if (!TYPES[purpose] || !TYPES[purpose].test(type)) return J({ error: "That file type isn't allowed here" }, 415);
      if ((purpose === "doc" || purpose === "final") && !u.admin) return J({ error: "Only Grooveville administrators upload agreements" }, 403);
      const buf = new Uint8Array(await req.arrayBuffer()); if (!buf.length || buf.length > MAX_UP[purpose] || (len && len > MAX_UP[purpose])) return J({ error: "File too large" }, 413);
      if (type === "application/pdf" && !(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return J({ error: "That isn't a valid PDF" }, 415);
      if (/^image\/png/.test(type) && !(buf[0] === 0x89 && buf[1] === 0x50)) return J({ error: "That isn't a valid PNG" }, 415);
      if (/^image\/jpeg/.test(type) && !(buf[0] === 0xff && buf[1] === 0xd8)) return J({ error: "That isn't a valid JPG" }, 415);
      if (type === "image/webp" && (String.fromCharCode(...buf.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...buf.subarray(8, 12)) !== "WEBP")) return J({ error: "That isn't a valid WebP image" }, 415);
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" }[type];
      const key = "portal/" + (purpose === "pub" ? "pub/" + u.uid.slice(0, 12) : "priv/" + purpose + "/" + u.uid.slice(0, 12)) + "/" + Date.now().toString(36) + "-" + rid(8) + "." + ext;
      const hash = await sha256(buf); await env.STUDIO_BUCKET.put(key, buf, { httpMetadata: { contentType: type }, customMetadata: { by: u.uid, sha256: hash, purpose } });
      return J({ ok: true, key, sha256: hash, size: buf.length });
    }
    /* account */
    if (p === "/api/p/me/photo") {
      if (!u) return J({ error: "Sign in first" }, 401);
      if (req.method === "POST") {
        const key = String(b.key || "");
        if (key) {
          if (!key.startsWith("portal/priv/account/") || !FILE_RE.test(key)) return J({ error: "Choose an account photo" }, 400);
          const photo = await env.STUDIO_BUCKET.head(key);
          if (photo?.customMetadata?.by !== u.uid) return J({ error: "Photo not found" }, 404);
          await run(D, "INSERT INTO account_photos (uid, key) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET key = excluded.key", u.uid, key);
        } else await run(D, "DELETE FROM account_photos WHERE uid = ?", u.uid);
        return J({ ok: true });
      }
      if (req.method === "GET") {
        const saved = await one(D, "SELECT key FROM account_photos WHERE uid = ?", u.uid);
        const photo = saved && await env.STUDIO_BUCKET.get(saved.key);
        if (!photo) return J({ error: "Photo not found" }, 404);
        return new Response(photo.body, { headers: { "content-type": photo.httpMetadata.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
      }
      return J({ error: "Method not allowed" }, 405);
    }
    if (p === "/api/p/me") {
      if (!u) return J({ signedIn: false }); let pr = await one(D, "SELECT * FROM profiles WHERE uid = ?", u.uid);
      if (!pr) { await run(D, "INSERT INTO profiles (uid, email, created, updated) VALUES (?,?,?,?)", u.uid, u.email || "", now(), now()); pr = await one(D, "SELECT * FROM profiles WHERE uid = ?", u.uid) }
      else if (u.email && pr.email !== u.email) await run(D, "UPDATE profiles SET email = ? WHERE uid = ?", u.email, u.uid);
      if (req.method === "POST") {
        const f = clean(b.first, 40), mi = clean(b.middle, 1).toUpperCase().replace(/[^A-Z]/g, ""), l = clean(b.last, 60), ph = clean(b.phone, 30);
        if (!/^[\p{L}][\p{L}' .-]*$/u.test(f) || !/^[\p{L}][\p{L}' .-]*$/u.test(l)) return J({ error: "Enter your legal first and last name" }, 400);
        if (pr.name_verified && (f !== pr.first || l !== pr.last || mi !== (pr.middle || ""))) { await run(D, "UPDATE profiles SET name_request = ?, phone = ?, updated = ? WHERE uid = ?", JSON.stringify({ first: f, middle: mi, last: l, reason: clean(b.reason, 300), at: now() }), ph, now(), u.uid); await audit(D, u.uid, "name_change_requested", "profile", u.uid, { first: f, middle: mi, last: l }); return J({ ok: true, pending: true }) }
        await run(D, "UPDATE profiles SET first = ?, middle = ?, last = ?, phone = ?, updated = ? WHERE uid = ?", f, mi, l, ph, now(), u.uid); await audit(D, u.uid, "profile_updated", "profile", u.uid, { first: f, middle: mi, last: l });
        pr = await one(D, "SELECT * FROM profiles WHERE uid = ?", u.uid);
      }
      const host = await one(D, "SELECT id, slug, name, verified, official, status, grooveville FROM hosts WHERE uid = ?", u.uid);
      const notes = await all(D, "SELECT id, kind, title, body, link, seen, at FROM notifications WHERE uid = ? ORDER BY at DESC LIMIT 40", u.uid);
      const staff = await all(D, "SELECT e.id, e.slug, e.title, e.start FROM event_staff s JOIN events e ON e.id = s.event_id WHERE s.uid = ? AND e.status IN ('published','sales_closed')", u.uid);
      const photo = await one(D, "SELECT 1 AS present FROM account_photos WHERE uid = ?", u.uid);
      return J({ hasPhoto: !!photo, signedIn: true, uid: u.uid, email: u.email, emailVerified: !!u.email_verified, auth: u.auth, profile: pr, host, notifications: notes, admin: u.admin, founder: u.founder, finance: u.finance, tester: u.tester, staffEvents: staff });
    }
    if (p === "/api/p/me/seen" && req.method === "POST") { if (!u) return J({ error: "Sign in" }, 401); await run(D, "UPDATE notifications SET seen = 1 WHERE uid = ?", u.uid); return J({ ok: true }) }
    if (p === "/api/p/me/esign" && req.method === "POST") {
      if (!u) return J({ error: "Sign in" }, 401); if (b.agree !== true) return J({ error: "Check the box to agree" }, 400);
      await run(D, "UPDATE profiles SET esign_consent_at = ?, esign_version = ? WHERE uid = ?", now(), String(b.version || "1"), u.uid); await audit(D, u.uid, "esign_disclosure_accepted", "profile", u.uid, { version: b.version || "1", ip: C.ip, ua: C.ua }); return J({ ok: true });
    }
    if (p === "/api/p/me/esign-withdraw" && req.method === "POST") { if (!u) return J({ error: "Sign in" }, 401); await run(D, "UPDATE profiles SET esign_consent_at = NULL WHERE uid = ?", u.uid); await audit(D, u.uid, "esign_consent_withdrawn", "profile", u.uid, { ip: C.ip }); return J({ ok: true }) }
    /* document verification (anyone): does this PDF match a completed Grooveville record? */
    if (p === "/api/p/support" && req.method === "POST") {
      if (!u) return J({ error: "Sign in first" }, 401); if (await limited(D, "sup:" + u.uid, 6, 3600)) return J({ error: "Too many messages. Try again later." }, 429);
      const msg = clean(b.message, 3000), subj = clean(b.subject, 120) || "Message from the portal"; if (!msg) return J({ error: "Write a message first" }, 400);
      await audit(D, u.uid, "support_message", "profile", u.uid, { subject: subj, message: msg });
      for (const a of new Set((await all(D, "SELECT DISTINCT uid FROM roles WHERE role = 'admin'")).map(x => x.uid).concat(S.founder_uid ? [S.founder_uid] : []))) await notify(env, D, a, "support", subj, msg.slice(0, 300) + " (" + (u.email || u.uid) + ")", "#team-portals/customers");
      return J({ ok: true });
    }
    if (p === "/api/p/verify" && req.method === "POST") {
      if (await limited(D, "vf:" + C.ip, 30, 3600)) return J({ error: "Too many checks" }, 429);
      const hsh = String(b.sha256 || "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(hsh)) return J({ error: "Bad hash" }, 400);
      const d = await one(D, "SELECT id, title, completed_at, status FROM documents WHERE final_hash = ?", hsh); if (d) return J({ match: true, kind: "final", title: d.title, completed: d.completed_at, status: d.status, id: d.id });
      const s = await one(D, "SELECT id, title, status FROM documents WHERE source_hash = ?", hsh); if (s) return J({ match: true, kind: "original", title: s.title, status: s.status }); return J({ match: false });
    }
    if (p.startsWith("/api/p/rentals")) return await rentalsApi(C);
    if (p.startsWith("/api/p/doc")) return await docsApi(C);
    if (/^\/api\/p\/(?:invite(?:\/|$)|host\/invites(?:\/|$)|admin\/invites(?:\/|$))/.test(p)) return await inviteApi(C);
    if (p.startsWith("/api/p/admin")) return await adminApi(C);
    if (p.startsWith("/api/p/finance") || p.startsWith("/api/p/settlement") || p.startsWith("/api/p/pay")) return await financeApi(C);
    return await entApi(C);
  } catch (e) { const msg = String(e && e.message || e); if (!/CHECK constraint/.test(msg) && !e.status) console.log("portal", p, e && e.stack); if (/CHECK constraint/.test(msg)) return J({ error: "Not enough availability left for that. Please refresh and try again.", code: "capacity" }, 409); return J({ error: e.status ? msg : "Something went wrong. Please try again.", detail: e.status ? undefined : msg.slice(0, 200) }, e.status || 500) }
}
export async function portalCron(env, fetcher) { if (!env.PORTAL_DB) return; const D = await db(env); const S = await settings(D); await rentalsCron(env, D, S, fetcher).catch(e => console.log("rentals cron", e)); await entCron(env, D, S, fetcher).catch(e => console.log("ent cron", e)); await docsCron(D).catch(() => { }) }
export async function portalStripe(env, ev, fetcher) { const D = await db(env); return stripeEvent(env, D, ev, fetcher) }
/* share pages for social previews: /entertainment/events/<slug>, /entertainment/hosts/<slug> */
export async function portalShare(req, env, kind, slug) {
  const base = "https://" + new URL(req.url).host, esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); let title = "Grooveville Entertainment", desc = "Events and hosts on Grooveville.", img = base + "/media/og-share-v2.jpg", to = "/#entertainment";
  try { const D = await db(env); if (kind === "e") { const e = await publicEventMeta(D, slug); if (e) { title = e.title; desc = e.when + (e.venue ? " · " + e.venue : ""); if (e.flyer) img = base + "/api/p/img/" + e.flyer; to = "/#e/" + slug } } else { const hh = await one(D, "SELECT name, bio, photo_key, status FROM hosts WHERE slug = ?", slug); if (hh && hh.status === "active") { title = hh.name + " · Grooveville Entertainment"; desc = String(hh.bio || "").slice(0, 150); if (hh.photo_key) img = base + "/api/p/img/" + hh.photo_key; to = "/#h/" + slug } } } catch (e) { }
  return new Response('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(desc) + '"><meta property="og:image" content="' + esc(img) + '"><meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=' + esc(to) + '"></head><body><a href="' + esc(to) + '">Continue to Grooveville</a><script>location.replace(' + JSON.stringify(to) + ')</script></body></html>', { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
