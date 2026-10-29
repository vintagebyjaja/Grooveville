/* Grooveville Creative Studio, Groove Reads and Sound Lab: server endpoints.
   Storage: Cloudflare R2 (the same STUDIO_BUCKET used for songs and Content Studio). Metadata the Back Office edits lives in Firestore.
   - /api/creative/*  private (founder, or a creativeRoles/{uid} member): files, AI writing, AI images (with character references), narration
   - /api/reads/*     Groove Reads: public catalog + 5-page previews, signed-in library, Stripe checkout + webhook, protected downloads
   Paid book pages, audio and files are only sent after the server checks the reader's entitlement; nothing relies on the browser hiding them. */
import { openaiJSON, budgetOk, charge, IMAGE_MODELS, modelProblem, openaiErr } from "./content.js";
import { serveR2 } from "./music.js";

const J = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, h || {}) });
const te = new TextEncoder();
const hexOf = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
async function hmacHex(secret, msg) { const k = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hexOf(await crypto.subtle.sign("HMAC", k, te.encode(msg))) }
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++)r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 };
async function rj(env, k, d) { const o = await env.STUDIO_BUCKET.get(k); if (!o) return d; try { return await o.json() } catch (e) { return d } }
async function wj(env, k, v) { await env.STUDIO_BUCKET.put(k, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } }) }
const secretOf = env => env.READS_SECRET || env.SITE_PREVIEW_SECRET || env.STRIPE_WEBHOOK_SECRET || env.R2_SECRET_ACCESS_KEY || env.OPENAI_API_KEY || "";
const KEY_RE = /^(creative|soundlab)\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9._\/-]{1,200}$/;
const ID_RE = /^[A-Za-z0-9_-]{2,80}$/;
const FORMATS = ["read", "listen", "readalong", "pdf", "epub", "mp3", "mp4"];
export const CREATIVE_ROLES = ["admin", "writer", "illustrator", "animator", "gamedev", "editor", "producer", "viewer"];

/* Firestore document read AS the signed-in person (security rules decide) */
function fsVal(v) { if (!v) return undefined; if ("stringValue" in v) return v.stringValue; if ("booleanValue" in v) return v.booleanValue; if ("integerValue" in v) return Number(v.integerValue); if ("doubleValue" in v) return v.doubleValue; if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal); if ("mapValue" in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o } return null }
async function fsDoc(env, path, user, fetcher) {
  try { const r = await (fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + path, { headers: { Authorization: "Bearer " + user.token } }); if (!r.ok) return null; const d = await r.json(); const o = {}; for (const [k, v] of Object.entries(d.fields || {})) o[k] = fsVal(v); return o } catch (e) { return null }
}
async function caller(req, env, h) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); if (!t) return null;
  let user; try { user = await h.verifyIdToken(t, env.FIREBASE_PROJECT_ID) } catch (e) { return null }
  const acc = (await fsDoc(env, "access/" + user.uid, user, h.fetcher)) || {};
  const role = String(acc.role || "").toLowerCase().trim();
  user.founder = role === "founder" || role === "hnic";
  user.team = user.founder || !!role || (Array.isArray(acc.brands) && acc.brands.length > 0);
  const cr = user.founder ? null : await fsDoc(env, "creativeRoles/" + user.uid, user, h.fetcher);
  user.creative = user.founder ? "founder" : (cr && CREATIVE_ROLES.includes(cr.role) ? cr.role : "");
  const st = await fsDoc(env, "readsStaff/" + user.uid, user, h.fetcher);
  user.groups = (st && Array.isArray(st.groups) ? st.groups : []).filter(x => typeof x === "string");
  return user;
}

/* ---------------- OpenAI helpers (shared budget with Content Studio) ---------------- */
async function aiImage(env, prompt, refs, size, q, fetcher) {
  const f = fetcher || fetch; let r, j, used = "", note = "";
  const sizes = ["1024x1024", "1024x1536", "1536x1024"]; size = sizes.includes(size) ? size : "1024x1536"; q = ["low", "medium", "high"].includes(q) ? q : "medium";
  for (const model of IMAGE_MODELS(env)) {
    const d3 = /^dall-e/.test(model);
    if (refs.length && !d3) {
      const fd = new FormData(); fd.append("model", model); fd.append("prompt", prompt); fd.append("size", size); fd.append("quality", q);
      for (const [i, k] of refs.entries()) { const o = await env.STUDIO_BUCKET.get(k); if (o) fd.append("image[]", new File([await o.arrayBuffer()], "ref" + i + ".png", { type: (o.httpMetadata && o.httpMetadata.contentType) || "image/png" })) }
      r = await f("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: "Bearer " + env.OPENAI_API_KEY }, body: fd });
    } else {
      if (refs.length && d3) note = "This OpenAI account can't use reference images (gpt-image-1 needs a verified organization), so this image was made from the written description only.";
      const sz = d3 ? ({ "1024x1536": "1024x1792", "1536x1024": "1792x1024" })[size] || "1024x1024" : size;
      r = await f("https://api.openai.com/v1/images/generations", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(d3 ? { model, prompt: prompt.slice(0, 3900), size: sz, quality: q === "high" ? "hd" : "standard", response_format: "b64_json", n: 1 } : { model, prompt, size, quality: q, n: 1 }) });
    }
    j = await r.json().catch(() => ({})); used = model;
    if (r.ok || !modelProblem(r.status, j)) break;
  }
  if (!r.ok) throw Object.assign(new Error(openaiErr(r.status, j)), { status: r.status });
  const b64 = j.data && j.data[0] && j.data[0].b64_json; if (!b64) throw new Error("OpenAI returned no image");
  return { bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)), model: used, note };
}
async function aiSpeech(env, text, voice, instructions, fetcher) {
  const f = fetcher || fetch; let r, j = {}, used = "";
  for (const model of ["gpt-4o-mini-tts", "tts-1"]) {
    const body = { model, input: text, voice: voice || "alloy", response_format: "mp3" }; if (instructions && model !== "tts-1") body.instructions = String(instructions).slice(0, 600);
    r = await f("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify(body) }); used = model;
    if (r.ok) break; j = await r.json().catch(() => ({})); if (!modelProblem(r.status, j)) break;
  }
  if (!r.ok) throw Object.assign(new Error(openaiErr(r.status, j)), { status: r.status });
  return { bytes: new Uint8Array(await r.arrayBuffer()), model: used };
}

/* ---------------- Groove Reads entitlements ---------------- */
const catKey = "reads/catalog.json", edKey = id => "reads/books/" + id + "/edition.json", entKey = uid => "reads/ent/" + uid + ".json";
function staffFormats(ed, user) {
  if (!user) return [];
  if (user.founder) return FORMATS.slice();
  const g = ed.staffGrants || {}; const groups = new Set(user.groups || []); if (user.team) groups.add("grooveville");
  return (g.grooveville && groups.has("grooveville")) || (g.shadowcrown && groups.has("shadowcrown")) ? (g.formats && g.formats.length ? g.formats : ["read", "listen", "readalong"]) : [];
}
async function formatsFor(env, ed, user) {
  const out = new Set();
  if (ed.free) (ed.products && ed.products.digital && ed.products.digital.formats || ["read"]).forEach(x => out.add(x));
  staffFormats(ed, user).forEach(x => out.add(x));
  if (user) { const e = await rj(env, entKey(user.uid), { books: {} }); const b = e.books && e.books[ed.id]; if (b) for (const g of (b.grants || [])) if (!g.revoked) (g.formats || []).forEach(x => out.add(x)) }
  return [...out].filter(x => FORMATS.includes(x));
}
function publicMeta(ed) {
  const pk = ed.products || {};
  return { id: ed.id, title: ed.title, subtitle: ed.subtitle || "", author: ed.author, series: ed.series || "", volume: ed.volume || "", universe: ed.universe || "", sites: Array.isArray(ed.sites) ? ed.sites.slice(0, 5) : [], desc: ed.desc || "", genres: ed.genres || [], age: ed.age || "", layout: ed.layout || "reflow",
    cover: ed.cover ? "/api/reads/cover/" + ed.id + "?v=" + (ed.rev || 1) : "", pages: (ed.pages || []).length, preview: Math.max(0, Math.min(ed.previewPages == null ? 5 : ed.previewPages, (ed.pages || []).length)),
    toc: (ed.toc || []).map(t => ({ title: t.title, page: t.page })), free: !!ed.free, featured: !!ed.featured, collections: ed.collections || [], publishAt: ed.publishAt || "",
    audio: (ed.audio || []).length > 0, readalong: (ed.audio || []).some(a => a.align && a.align.length), physical: ed.physical || {},
    products: Object.fromEntries(Object.entries(pk).filter(([k, v]) => v && v.enabled !== false && v.price > 0).map(([k, v]) => [k, { price: v.price, currency: v.currency || "usd", formats: v.formats || [] }])),
    downloads: Object.entries(ed.downloads || {}).filter(([k, v]) => v).map(([k]) => k), rev: ed.rev || 1 };
}
const visible = ed => ed && ed.status === "published" && (!ed.publishAt || Date.parse(ed.publishAt) <= Date.now());
async function signAsset(env, id, key, mins) { const exp = Math.floor(Date.now() / 1000) + (mins || 30) * 60; const sig = (await hmacHex(secretOf(env), id + "|" + key + "|" + exp)).slice(0, 32); return "/api/reads/a/" + id + "/" + exp + "." + sig + "/" + key }
async function pageOut(env, ed, p) { const o = Object.assign({}, p); if (Array.isArray(p.blocks)) o.blocks = await Promise.all(p.blocks.map(async x => x && x.key ? Object.assign({}, x, { key: await signAsset(env, ed.id, x.key, 60) }) : x)); if (p.img) o.img = await signAsset(env, ed.id, p.img, 60); if (p.bg) o.bg = await signAsset(env, ed.id, p.bg, 60); if (Array.isArray(p.panels)) o.panels = await Promise.all(p.panels.map(k => signAsset(env, ed.id, k, 60))); return o }
async function bump(env, ctx, id, type, n) { const k = "reads/stats/" + id + ".json"; const s = await rj(env, k, {}); s[type] = (s[type] || 0) + (n || 1); s.updated = new Date().toISOString(); await wj(env, k, s) }

/* Stripe webhook signature: t=...,v1=... over `${t}.${payload}` */
async function stripeVerify(env, payload, header) {
  const parts = Object.fromEntries(String(header || "").split(",").map(x => x.split("=")).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || "").split(",").filter(x => x.trim().startsWith("v1=")).map(x => x.trim().slice(3));
  if (!parts.t || !sigs.length || !env.STRIPE_WEBHOOK_SECRET) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const want = await hmacHex(env.STRIPE_WEBHOOK_SECRET, parts.t + "." + payload);
  return sigs.some(s => safeEq(s, want));
}
async function stripe(env, path, form, fetcher) {
  const body = new URLSearchParams(); const add = (k, v) => { if (v === undefined || v === null) return; if (typeof v === "object") { for (const [kk, vv] of Object.entries(v)) add(k + "[" + kk + "]", vv) } else body.append(k, String(v)) };
  for (const [k, v] of Object.entries(form)) add(k, v);
  const r = await (fetcher || fetch)("https://api.stripe.com/v1/" + path, { method: "POST", headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || "Stripe error (" + r.status + ")"); return j;
}
async function grant(env, uid, bookId, product, formats, ref) {
  const e = await rj(env, entKey(uid), { books: {} }); e.books = e.books || {}; const b = e.books[bookId] = e.books[bookId] || { grants: [] };
  if (b.grants.some(g => g.ref === ref)) return false;                       // idempotent: same Stripe session never grants twice
  b.grants.push({ ref, product, formats, at: new Date().toISOString() }); await wj(env, entKey(uid), e); return true;
}

export async function creativeApi(req, env, ctx, h) {
  const { p, url } = h, fetcher = h.fetcher || fetch, B = env.STUDIO_BUCKET;
  if (!B) return J({ error: "Storage isn't connected (STUDIO_BUCKET)" }, 503);
  const site = req.headers.get("sec-fetch-site");
  /* ======================= Groove Reads: public ======================= */
  if (p.startsWith("/api/reads/")) {
    if (p === "/api/reads/stripe" && req.method === "POST") {                 // Stripe → server only, verified signature
      const raw = await req.text(); if (!(await stripeVerify(env, raw, req.headers.get("stripe-signature")))) return J({ error: "Bad signature" }, 400);
      let ev; try { ev = JSON.parse(raw) } catch (e) { return J({ error: "Bad payload" }, 400) }
      const seenK = "reads/stripe/events/" + String(ev.id || "").replace(/[^A-Za-z0-9_-]/g, "") + ".json"; if (await B.head(seenK)) return J({ ok: true, duplicate: true });
      const o = (ev.data && ev.data.object) || {};
      if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") {
        const md = o.metadata || {}; if (o.payment_status === "paid" && md.uid && md.book && md.product) {
          const ed = await rj(env, edKey(md.book), null); const pr = ed && ed.products && ed.products[md.product];
          if (ed && pr && Math.round(pr.price * 100) === Number(o.amount_total) && String(pr.currency || "usd").toLowerCase() === String(o.currency || "").toLowerCase()) {
            const fresh = await grant(env, md.uid, md.book, md.product, pr.formats || ["read"], o.id);
            if (fresh) { const s = await rj(env, "reads/sales.json", { items: [] }); s.items.unshift({ at: new Date().toISOString(), book: md.book, product: md.product, amount: o.amount_total / 100, currency: o.currency, session: o.id, pi: o.payment_intent || "", uid: md.uid }); s.items = s.items.slice(0, 5000); await wj(env, "reads/sales.json", s); await wj(env, "reads/stripe/pi/" + String(o.payment_intent || o.id).replace(/[^A-Za-z0-9_-]/g, "") + ".json", { uid: md.uid, book: md.book, session: o.id }) }
          } else await wj(env, "reads/stripe/mismatch/" + o.id + ".json", { ev: ev.id, md, amount: o.amount_total, currency: o.currency });
        }
      }
      if (ev.type === "charge.refunded" || ev.type === "charge.dispute.created") {
        const pi = String(o.payment_intent || "").replace(/[^A-Za-z0-9_-]/g, ""), link = pi && await rj(env, "reads/stripe/pi/" + pi + ".json", null), pol = await rj(env, "reads/policy.json", { revokeOnRefund: true, revokeOnDispute: true });
        if (link && ((ev.type === "charge.refunded" && pol.revokeOnRefund !== false) || (ev.type === "charge.dispute.created" && pol.revokeOnDispute !== false))) {
          const e = await rj(env, entKey(link.uid), { books: {} }); const b = e.books && e.books[link.book]; if (b) { b.grants.forEach(g => { if (g.ref === link.session) { g.revoked = ev.type; g.revokedAt = new Date().toISOString() } }); await wj(env, entKey(link.uid), e) }
          const s = await rj(env, "reads/sales.json", { items: [] }); s.items.forEach(x => { if (x.session === link.session) x.refunded = ev.type }); await wj(env, "reads/sales.json", s);
        }
      }
      await wj(env, seenK, { type: ev.type, at: new Date().toISOString() }); return J({ ok: true });
    }
    let m = /^\/api\/reads\/a\/([A-Za-z0-9_-]{2,80})\/(\d{9,11})\.([0-9a-f]{32})\/(.+)$/.exec(p);
    if (m && (req.method === "GET" || req.method === "HEAD")) {
      const [, id, exp, sig, key] = m; if (Number(exp) < Date.now() / 1000 || !KEY_RE.test(key) && !/^reads\/books\/[A-Za-z0-9_-]+\/[A-Za-z0-9._\/-]+$/.test(key)) return new Response("Link expired", { status: 410 });
      if (!safeEq(sig, (await hmacHex(secretOf(env), id + "|" + key + "|" + exp)).slice(0, 32))) return new Response("Not allowed", { status: 403 });
      const r = await serveR2(env, key, req, null, "private, max-age=1800"); r.headers.set("cross-origin-resource-policy", "same-origin"); if (/\.(mp3|m4a|wav)$/i.test(key) || /^audio/.test(r.headers.get("content-type") || "")) r.headers.set("content-disposition", "inline"); return r;
    }
    m = /^\/api\/reads\/cover\/([A-Za-z0-9_-]{2,80})$/.exec(p);
    if (m) { const ed = await rj(env, edKey(m[1]), null); if (!visible(ed) || !ed.cover) return new Response("Not found", { status: 404 }); return serveR2(env, ed.cover, req, null, "public, max-age=3600") }
    if (p === "/api/reads/catalog") {
      const cat = await rj(env, catKey, { books: [] }); const list = (cat.books || []).filter(b => b.status === "published" && (!b.publishAt || Date.parse(b.publishAt) <= Date.now())).map(b => b.meta);
      const uni = url.searchParams.get("universe"); return J({ books: uni ? list.filter(b => b.universe === uni || (b.sites || []).includes(uni)) : list }, 200, { "cache-control": "public, max-age=60" });
    }
    if (site === "cross-site") return J({ error: "Groove Reads works on grooveville.org" }, 403);
    const user = await caller(req, env, h);
    const id = url.searchParams.get("id") || ""; let body = {}; if (req.method === "POST") { try { body = await req.json() } catch (e) { } }
    const bid = id || body.id || "";
    if (p === "/api/reads/library") {
      if (!user) return J({ error: "Sign in to see your library" }, 401);
      const cat = await rj(env, catKey, { books: [] }), e = await rj(env, entKey(user.uid), { books: {} }), out = [];
      for (const b of cat.books || []) { if (b.status !== "published" && !user.founder) continue; const ed = await rj(env, edKey(b.id), null); if (!ed) continue; const f = await formatsFor(env, ed, user); const own = e.books && e.books[b.id] && e.books[b.id].grants.some(g => !g.revoked);
        if (f.length && (own || staffFormats(ed, user).length || ed.free && own)) out.push(Object.assign({}, b.meta, { formats: f, via: own ? "purchase" : user.founder ? "founder" : "staff" })) }
      return J({ books: out, uid: user.uid });
    }
    if (!ID_RE.test(bid)) return J({ error: "Pick a book" }, 400);
    const ed = await rj(env, edKey(bid), null);
    if (!ed || (!visible(ed) && !(user && user.founder))) return J({ error: "This book isn't available" }, 404);
    const formats = await formatsFor(env, ed, user);
    if (p === "/api/reads/book") return J({ book: publicMeta(ed), access: formats, signedIn: !!user, draft: !visible(ed) });
    if (p === "/api/reads/pages") {                                          // the 5-page preview is enforced here
      const total = (ed.pages || []).length, prev = Math.min(ed.previewPages == null ? 5 : ed.previewPages, total), full = formats.includes("read") || formats.includes("readalong");
      let from = Math.max(1, Number(url.searchParams.get("from")) || 1), to = Math.min(total, Number(url.searchParams.get("to")) || from + 9); if (to - from > 40) to = from + 40;
      if (!full && from > prev) return J({ locked: true, preview: prev, total }, 402);
      if (!full) to = Math.min(to, prev);
      const pages = []; for (let i = from; i <= to; i++)pages.push(Object.assign({ n: i }, await pageOut(env, ed, ed.pages[i - 1])));
      return J({ pages, total, preview: prev, full, style: ed.style || {}, layout: ed.layout || "reflow" });
    }
    if (p === "/api/reads/audio") {
      if (!formats.includes("listen") && !formats.includes("readalong")) return J({ error: "The audiobook is part of a purchase", locked: true }, 402);
      const ch = []; for (const a of ed.audio || []) ch.push({ title: a.title, chapter: a.chapter, dur: a.dur || 0, src: await signAsset(env, ed.id, a.key, 240), align: formats.includes("readalong") ? (a.align || []) : [] });
      return J({ chapters: ch, readalong: formats.includes("readalong") });
    }
    if (p === "/api/reads/download" && req.method === "POST") {
      const f = String(body.format || ""); if (!["pdf", "epub", "mp3", "mp4"].includes(f)) return J({ error: "Pick a format" }, 400);
      if (!(ed.downloads || {})[f]) return J({ error: "This format isn't offered for download" }, 403);
      if (!formats.includes(f)) return J({ error: "Your purchase doesn't include the " + f.toUpperCase() + " download", locked: true }, 402);
      const key = (ed.files || {})[f]; if (!key) return J({ error: "That file hasn't been made yet" }, 404);
      ctx && ctx.waitUntil && ctx.waitUntil(bump(env, ctx, ed.id, "dl_" + f));
      return J({ url: await signAsset(env, ed.id, key, 10), expiresIn: 600 });
    }
    if (p === "/api/reads/checkout" && req.method === "POST") {
      if (!env.STRIPE_SECRET_KEY) return J({ error: "Checkout isn't connected yet. Add STRIPE_SECRET_KEY in Cloudflare (see GROOVE-READS-SETUP.md).", setup: true }, 503);
      if (!user) return J({ error: "Sign in to buy", signin: true }, 401);
      const prod = String(body.product || "digital"), pr = ed.products && ed.products[prod];
      if (!pr || pr.enabled === false || !(pr.price > 0)) return J({ error: "That edition isn't for sale" }, 400);
      const back = String(body.back || "/#reads/" + ed.id).replace(/[^A-Za-z0-9_\/#?=&.-]/g, "").slice(0, 200), origin = url.origin;
      const s = await stripe(env, "checkout/sessions", { mode: "payment", success_url: origin + "/#reads/" + ed.id + "?paid={CHECKOUT_SESSION_ID}", cancel_url: origin + back, client_reference_id: user.uid, customer_email: user.email || undefined,
        "line_items[0][quantity]": 1, "line_items[0][price_data][currency]": (pr.currency || "usd").toLowerCase(), "line_items[0][price_data][unit_amount]": Math.round(pr.price * 100),
        "line_items[0][price_data][product_data][name]": ed.title + ({ digital: " (Digital book)", audio: " (Audiobook)", bundle: " (Book + audiobook)" }[prod] || ""),
        metadata: { uid: user.uid, book: ed.id, product: prod }, payment_intent_data: { metadata: { uid: user.uid, book: ed.id, product: prod } } }, fetcher);
      return J({ url: s.url });
    }
    if (p === "/api/reads/event" && req.method === "POST") {
      const t = String(body.type || ""); if (!["open", "chapter", "complete", "audio", "readalong", "preview_end"].includes(t)) return J({ ok: false });
      const ip = req.headers.get("cf-connecting-ip") || "0", c = typeof caches !== "undefined" ? caches.default : null, k = new Request("https://reads-cache.grooveville.org/e/" + (await hmacHex("e", ip + bid + t + Math.floor(Date.now() / 600000))).slice(0, 24));
      if (c && await c.match(k)) return J({ ok: true }); if (c) ctx && ctx.waitUntil ? ctx.waitUntil(c.put(k, new Response("1", { headers: { "cache-control": "max-age=600" } }))) : await c.put(k, new Response("1", { headers: { "cache-control": "max-age=600" } }));
      const dev = /mobile|iphone|android/i.test(req.headers.get("user-agent") || "") ? "phone" : /ipad|tablet/i.test(req.headers.get("user-agent") || "") ? "tablet" : "desktop";
      await bump(env, ctx, bid, t); if (t === "open") await bump(env, ctx, bid, "dev_" + dev); return J({ ok: true });
    }
    return J({ error: "Not found" }, 404);
  }
  /* ======================= private studios ======================= */
  const user = await caller(req, env, h);
  if (!user) return J({ error: "Sign in again" }, 401);
  if (!user.founder && !user.creative) return J({ error: "Creative Studio is for the founder and approved team members" }, 403);
  const canWrite = user.founder || !["viewer"].includes(user.creative), by = user.email || user.uid;
  const isFounderOnly = () => user.founder || user.creative === "admin";
  let m = /^\/api\/creative\/f\/(.+)$/.exec(p);
  if (m && (req.method === "GET" || req.method === "HEAD")) { if (!KEY_RE.test(m[1]) || m[1].includes("..")) return new Response("Bad key", { status: 400 }); if (m[1].startsWith("soundlab/") && !(user.founder || ["admin", "producer"].includes(user.creative))) return new Response("Sound Lab is private", { status: 403 }); return serveR2(env, m[1], req, null, "private, max-age=600") }
  if (p === "/api/creative/put" && req.method === "PUT") {
    if (!canWrite) return J({ error: "View-only access" }, 403);
    const key = url.searchParams.get("key") || ""; if (!KEY_RE.test(key) || key.includes("..")) return J({ error: "Bad file name" }, 400);
    if (key.startsWith("soundlab/") && !(user.founder || ["admin", "producer"].includes(user.creative))) return J({ error: "Sound Lab is private" }, 403);
    const len = Number(req.headers.get("content-length") || 0); if (len > 95 * 1024 * 1024) return J({ error: "Files up to 95 MB" }, 413);
    const type = (req.headers.get("content-type") || "application/octet-stream").split(";")[0];
    if (!/^(image\/(png|jpeg|webp|gif)|audio\/(mpeg|wav|x-wav|wave|webm|ogg|mp4|aac|flac|x-flac)|video\/(mp4|webm)|application\/(json|pdf|epub\+zip|zip|octet-stream|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/(plain|markdown)|audio\/midi|model\/gltf-binary)$/.test(type)) return J({ error: "That file type isn't allowed (" + type + ")" }, 415);
    if (url.searchParams.get("keep") === "1" && await B.head(key)) return J({ error: "A file with that name already exists" }, 409);
    await B.put(key, req.body, { httpMetadata: { contentType: type }, customMetadata: { by, at: new Date().toISOString() } });
    return J({ key, type });
  }
  if (p === "/api/creative/list") { const pre = url.searchParams.get("prefix") || ""; if (!/^(creative|soundlab)\/[A-Za-z0-9_\/-]*$/.test(pre)) return J({ error: "Bad prefix" }, 400); const l = await B.list({ prefix: pre, limit: 500 }); return J({ items: (l.objects || []).map(o => ({ key: o.key, size: o.size, at: o.uploaded })) }) }
  let body = {}; if (req.method === "POST") { try { body = await req.json() } catch (e) { } }
  if (p === "/api/creative/delete" && req.method === "POST") {
    if (!isFounderOnly()) return J({ error: "Only the founder or an admin can delete files" }, 403);
    const keys = (body.keys || []).filter(k => KEY_RE.test(k) && !k.includes("..")).slice(0, 50); for (const k of keys) await B.delete(k); return J({ deleted: keys.length });
  }
  if (p === "/api/creative/json" && req.method === "POST") {                // project files (Sound Lab sessions, layouts) with version history
    if (!canWrite) return J({ error: "View-only access" }, 403);
    const key = String(body.key || ""); if (!KEY_RE.test(key) || !key.endsWith(".json")) return J({ error: "Bad file name" }, 400);
    const cur = await B.get(key); if (cur && body.keepVersion) { const v = key.replace(/\.json$/, "") + "/v/" + Date.now() + ".json"; await B.put(v, await cur.arrayBuffer(), { httpMetadata: { contentType: "application/json" } }) }
    await B.put(key, JSON.stringify(body.data || {}), { httpMetadata: { contentType: "application/json" }, customMetadata: { by, at: new Date().toISOString() } }); return J({ ok: true, key });
  }
  /* ---- AI (needs OPENAI_API_KEY; shares the monthly AI budget set in Content Studio) ---- */
  if (p.startsWith("/api/creative/ai/")) {
    if (!env.OPENAI_API_KEY) return J({ error: "AI isn't connected. Add OPENAI_API_KEY in Cloudflare.", setup: true }, 503);
    if (!canWrite) return J({ error: "View-only access" }, 403);
    if (p === "/api/creative/ai/text") {
      const bud = await budgetOk(env, 0.02); if (!bud.ok) return J({ error: "Monthly AI budget reached ($" + bud.total.toFixed(2) + " of $" + bud.limit + "). Raise it in Content Studio › Settings." }, 402);
      const sys = "You are the in-house writing and production assistant for Grooveville Creative Studio. You help the founder write, edit and plan original books, animation and games. Respect locked canon exactly as given; never contradict it. Never copy existing copyrighted text. When asked for changes, explain them. Always answer in JSON as asked. " + String(body.system || "").slice(0, 3000);
      try { const r = await openaiJSON(env, sys, String(body.prompt || "").slice(0, 120000), {}, fetcher); await charge(env, "creative-" + String(body.task || "text").slice(0, 20), r.cost, by, String(body.task || "")); return J({ data: r.data, cost: r.cost, model: r.model }) }
      catch (e) { return J({ error: e.message }, e.status === 429 ? 429 : 502) }
    }
    if (p === "/api/creative/ai/image") {
      const q = ["low", "medium", "high"].includes(body.quality) ? body.quality : "medium", est = q === "high" ? .25 : q === "low" ? .02 : .07; const bud = await budgetOk(env, est); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
      const refs = (body.refs || []).filter(k => KEY_RE.test(k)).slice(0, 6), save = String(body.save || ""); if (!KEY_RE.test(save) || !/\.png$/.test(save)) return J({ error: "Bad save name" }, 400);
      const prompt = String(body.prompt || "").slice(0, 3800) + (body.noText === false ? "" : " No written words, letters, logos or watermarks in the image.");
      try { const r = await aiImage(env, prompt, refs, body.size, q, fetcher); await B.put(save, r.bytes, { httpMetadata: { contentType: "image/png" }, customMetadata: { by, at: new Date().toISOString(), model: r.model, refs: refs.join("|").slice(0, 900) } }); await charge(env, "creative-image", est, by, r.model); return J({ key: save, model: r.model, note: r.note, cost: est }) }
      catch (e) { return J({ error: e.message }, e.status === 429 ? 429 : 502) }
    }
    if (p === "/api/creative/ai/compare") {                                  // identity check: new image vs approved master references
      const bud = await budgetOk(env, 0.01); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
      const keys = (body.a || []).filter(k => KEY_RE.test(k)).slice(0, 3).concat([String(body.b || "")]); if (!KEY_RE.test(keys[keys.length - 1])) return J({ error: "Pick an image" }, 400);
      const imgs = []; for (const k of keys) { const o = await B.get(k); if (!o) return J({ error: "Image not found" }, 404); const b = new Uint8Array(await o.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); imgs.push("data:" + ((o.httpMetadata && o.httpMetadata.contentType) || "image/png") + ";base64," + btoa(s)) }
      const content = [{ type: "input_text", text: "The first " + (imgs.length - 1) + " image(s) are the APPROVED master references of one character. The LAST image is a new picture that should show the same character. Character notes: " + String(body.about || "").slice(0, 1500) + "\nCompare identity only (face structure, eyes, skin tone, hair, body proportions, distinguishing marks, signature clothing unless the new image is meant to change outfit). Ignore pose, camera angle, lighting and background. Answer in JSON: {\"consistent\": true|false, \"differences\": [\"...\"], \"summary\": \"one short sentence\"}." }].concat(imgs.map(u => ({ type: "input_image", image_url: u })));
      let r, j, used = "";
      for (const model of [...new Set([String(env.OPENAI_VISION_MODEL || "").trim() || "gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"])]) { r = await fetcher("https://api.openai.com/v1/responses", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENAI_API_KEY }, body: JSON.stringify({ model, input: [{ role: "user", content }], text: { format: { type: "json_object" } } }) }); j = await r.json().catch(() => ({})); used = model; if (r.ok || !modelProblem(r.status, j)) break }
      if (!r.ok) return J({ error: openaiErr(r.status, j) }, 502);
      let txt = j.output_text || ""; if (!txt) for (const it of j.output || []) if (it.type === "message") for (const c of it.content || []) if (c.type === "output_text") txt += c.text;
      let d = {}; try { d = JSON.parse(txt) } catch (e) { const m = /\{[\s\S]*\}/.exec(txt); try { d = m ? JSON.parse(m[0]) : {} } catch (e2) { } }
      await charge(env, "creative-check", 0.01, by, used);
      const diffs = Array.isArray(d.differences) ? d.differences.slice(0, 8).map(String) : [];
      return J({ consistent: d.consistent !== false, flag: d.consistent === false || diffs.length > 1, differences: diffs, summary: String(d.summary || (d.consistent === false ? "Differs from the master" : "Consistent with the master")).slice(0, 240), model: used });
    }
    if (p === "/api/creative/ai/speech") {
      const text = String(body.text || "").slice(0, 4000), save = String(body.save || ""); if (!text.trim()) return J({ error: "Nothing to read" }, 400); if (!KEY_RE.test(save) || !/\.mp3$/.test(save)) return J({ error: "Bad save name" }, 400);
      const est = text.length / 1000 * .015; const bud = await budgetOk(env, est); if (!bud.ok) return J({ error: "Monthly AI budget reached." }, 402);
      try { const r = await aiSpeech(env, text, body.voice, body.instructions, fetcher); let bytes = r.bytes;
        if (body.append) { const cur = await B.get(save); if (cur) { const a = new Uint8Array(await cur.arrayBuffer()), out = new Uint8Array(a.length + bytes.length); out.set(a); out.set(bytes, a.length); bytes = out } }
        await B.put(save, bytes, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { by, at: new Date().toISOString(), model: r.model, voice: String(body.voice || "") } }); await charge(env, "creative-voice", est, by, r.model); return J({ key: save, bytes: bytes.length, model: r.model, cost: est }) }
      catch (e) { return J({ error: e.message }, e.status === 429 ? 429 : 502) }
    }
    return J({ error: "Not found" }, 404);
  }
  /* ---- Groove Reads management (founder / admin) ---- */
  if (p.startsWith("/api/creative/reads/")) {
    if (!isFounderOnly()) return J({ error: "Only the founder manages Groove Reads" }, 403);
    if (p === "/api/creative/reads/publish" && req.method === "POST") {
      const ed = body.edition || {}; if (!ID_RE.test(ed.id || "")) return J({ error: "Bad book id" }, 400); if (!String(ed.title || "").trim()) return J({ error: "Add a title" }, 400);
      if (!Array.isArray(ed.pages) || !ed.pages.length) return J({ error: "Format the book into pages first" }, 400); if (ed.pages.length > 3000) return J({ error: "That edition is too long" }, 400);
      const keys = []; ed.pages.forEach(pg => { [pg.img, pg.bg].concat(pg.panels || [], (pg.blocks || []).map(x => x && x.key)).forEach(k => { if (k) keys.push(k) }) }); (ed.audio || []).forEach(a => keys.push(a.key)); Object.values(ed.files || {}).forEach(k => k && keys.push(k)); if (ed.cover) keys.push(ed.cover);
      const bad = keys.find(k => !KEY_RE.test(k)); if (bad) return J({ error: "A file in this edition isn't in Creative Studio storage: " + bad }, 400);
      const prev = await rj(env, edKey(ed.id), null); ed.rev = (prev && prev.rev || 0) + 1; ed.updatedAt = new Date().toISOString(); ed.status = ["draft", "scheduled", "published", "unpublished"].includes(ed.status) ? ed.status : "draft";
      if (ed.status === "scheduled") { ed.status = "published"; if (!ed.publishAt) return J({ error: "Pick a publish date" }, 400) }
      ed.previewPages = Math.max(0, Math.min(Number(ed.previewPages == null ? 5 : ed.previewPages) || 0, 50));
      for (const [k, v] of Object.entries(ed.products || {})) { v.price = Math.max(0, Math.round(Number(v.price || 0) * 100) / 100); v.formats = (v.formats || []).filter(x => FORMATS.includes(x)) }
      await wj(env, edKey(ed.id), ed);
      const cat = await rj(env, catKey, { books: [] }); cat.books = (cat.books || []).filter(b => b.id !== ed.id); cat.books.push({ id: ed.id, status: ed.status, publishAt: ed.publishAt || "", meta: publicMeta(ed) }); await wj(env, catKey, cat);
      return J({ ok: true, rev: ed.rev, meta: publicMeta(ed) });
    }
    if (p === "/api/creative/reads/status" && req.method === "POST") {
      const ed = await rj(env, edKey(bid0(body)), null); if (!ed) return J({ error: "Not found" }, 404); ed.status = ["draft", "published", "unpublished"].includes(body.status) ? body.status : ed.status; if ("featured" in body) ed.featured = !!body.featured; await wj(env, edKey(ed.id), ed);
      const cat = await rj(env, catKey, { books: [] }); cat.books = (cat.books || []).filter(b => b.id !== ed.id); cat.books.push({ id: ed.id, status: ed.status, publishAt: ed.publishAt || "", meta: publicMeta(ed) }); await wj(env, catKey, cat); return J({ ok: true, status: ed.status });
    }
    if (p === "/api/creative/reads/edition") { const ed = await rj(env, edKey(url.searchParams.get("id") || ""), null); return J({ edition: ed }) }
    if (p === "/api/creative/reads/report") {
      const cat = await rj(env, catKey, { books: [] }), sales = await rj(env, "reads/sales.json", { items: [] }), stats = {};
      for (const b of cat.books || []) stats[b.id] = await rj(env, "reads/stats/" + b.id + ".json", {});
      return J({ books: (cat.books || []).map(b => ({ id: b.id, status: b.status, title: b.meta.title })), sales: sales.items.slice(0, 500), stats, stripe: !!env.STRIPE_SECRET_KEY, webhook: !!env.STRIPE_WEBHOOK_SECRET, policy: await rj(env, "reads/policy.json", { revokeOnRefund: true, revokeOnDispute: true }) });
    }
    if (p === "/api/creative/reads/policy" && req.method === "POST") { await wj(env, "reads/policy.json", { revokeOnRefund: body.revokeOnRefund !== false, revokeOnDispute: body.revokeOnDispute !== false }); return J({ ok: true }) }
    if (p === "/api/creative/reads/grant" && req.method === "POST") {      // manual grant (comp copy / support)
      if (!/^[A-Za-z0-9]{10,40}$/.test(String(body.uid || "")) || !ID_RE.test(String(body.book || ""))) return J({ error: "Pick a person and a book" }, 400);
      await grant(env, body.uid, body.book, "manual", (body.formats || ["read"]).filter(x => FORMATS.includes(x)), "manual-" + Date.now()); return J({ ok: true });
    }
  }
  return J({ error: "Not found" }, 404);
}
const bid0 = b => ID_RE.test(String(b.id || "")) ? b.id : "";
/* shared with the generation gateway (gen.js) */
export { caller, fsDoc, rj, wj, hmacHex, safeEq, KEY_RE };
