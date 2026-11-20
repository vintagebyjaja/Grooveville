/* Grooveville Portals (Rentals + Entertainment + Administration): shared server core.
   Database: Cloudflare D1 (binding PORTAL_DB). The schema below is applied automatically on first use
   (and kept in /migrations for reference). Money is always integer cents. Every financial or signing
   action is checked here on the server and written to a hash-chained audit log. */
export const J = (o, s, h) => new Response(JSON.stringify(o), { status: s || 200, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, h || {}) });
export const te = new TextEncoder();
export const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
export async function sha256(data) { return hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? te.encode(data) : data)) }
export async function hmac(secret, msg) { const k = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return hex(await crypto.subtle.sign("HMAC", k, te.encode(msg))) }
export const safeEq = (a, b) => { a = String(a || ""); b = String(b || ""); if (!a || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++)r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0 };
const B32 = "abcdefghjkmnpqrstuvwxyz23456789";
export function rid(n) { const u = crypto.getRandomValues(new Uint8Array(n || 16)); let s = ""; for (const x of u) s += B32[x % B32.length]; return s }
export const now = () => new Date().toISOString();
export const secretOf = env => env.PORTAL_SECRET || env.READS_SECRET || env.SITE_PREVIEW_SECRET || env.STRIPE_WEBHOOK_SECRET || env.R2_SECRET_ACCESS_KEY || "";

/* ---------- money: integer cents only ---------- */
export const cents = v => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error("Bad amount"); return n };
export const toCents = dollars => cents(Math.round(Number(String(dollars).replace(/[$,]/g, "")) * 100));
/* round-half-up of (amount × bps / 10000) using integers */
export const bpsOf = (amount, bps) => { const p = amount * bps; return Math.floor((p + 5000) / 10000) };
export const fmt$ = c => (c < 0 ? "−$" : "$") + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* ---------- schema (migration 1) ---------- */
export const SCHEMA = [
`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
`CREATE TABLE IF NOT EXISTS profiles (uid TEXT PRIMARY KEY, email TEXT, first TEXT, middle TEXT, last TEXT, phone TEXT, name_verified INTEGER DEFAULT 0, name_request TEXT, esign_consent_at TEXT, esign_version TEXT, created TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS roles (uid TEXT, role TEXT, scope TEXT DEFAULT '', added_by TEXT, at TEXT, PRIMARY KEY (uid, role, scope))`,
`CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, actor TEXT, action TEXT, entity TEXT, entity_id TEXT, data TEXT, prev TEXT, hash TEXT)`,
`CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, uid TEXT, kind TEXT, title TEXT, body TEXT, link TEXT, seen INTEGER DEFAULT 0, at TEXT)`,
`CREATE INDEX IF NOT EXISTS n_uid ON notifications (uid, at)`,
`CREATE TABLE IF NOT EXISTS ratelimit (k TEXT PRIMARY KEY, n INTEGER, until INTEGER)`,
`CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT, at TEXT)`,
`CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, name TEXT, description TEXT, category TEXT, photos TEXT, location TEXT, price_cents INTEGER, unit TEXT, deposit_cents INTEGER DEFAULT 0, min_units INTEGER DEFAULT 1, max_units INTEGER DEFAULT 0, qty INTEGER DEFAULT 1, eligibility TEXT, tax_bps INTEGER DEFAULT 0, agreement TEXT, cancel_policy TEXT, extras TEXT, status TEXT DEFAULT 'active', landlord TEXT, payee TEXT DEFAULT 'grooveville', income_class TEXT DEFAULT 'business', vehicle INTEGER DEFAULT 0, vehicle_ready INTEGER DEFAULT 0, created TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, listing_id TEXT, request_id TEXT, start TEXT, end TEXT, qty INTEGER DEFAULT 1, status TEXT)`,
`CREATE INDEX IF NOT EXISTS r_listing ON reservations (listing_id, start, end)`,
`CREATE TABLE IF NOT EXISTS rental_requests (id TEXT PRIMARY KEY, uid TEXT, listing_id TEXT, start TEXT, end TEXT, units INTEGER, qty INTEGER, quote TEXT, total_cents INTEGER, deposit_cents INTEGER, note TEXT, info TEXT, status TEXT, admin_note TEXT, created TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, uid TEXT, request_id TEXT, listing_id TEXT, title TEXT, kind TEXT, amount_cents INTEGER, frequency TEXT, next_due TEXT, end_date TEXT, status TEXT, payee TEXT, landlord TEXT, income_class TEXT, created TEXT)`,
`CREATE TABLE IF NOT EXISTS charges (id TEXT PRIMARY KEY, uid TEXT, plan_id TEXT, request_id TEXT, kind TEXT, description TEXT, amount_cents INTEGER, due_date TEXT, status TEXT, paid_cents INTEGER DEFAULT 0, refunded_cents INTEGER DEFAULT 0, fee_cents INTEGER DEFAULT 0, stripe_session TEXT, stripe_pi TEXT, payee TEXT, landlord TEXT, income_class TEXT, created TEXT, paid_at TEXT, receipt_no TEXT, reminded TEXT, UNIQUE (plan_id, due_date))`,
`CREATE INDEX IF NOT EXISTS c_uid ON charges (uid, due_date)`,
`CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, division TEXT, kind TEXT, ref_type TEXT, ref_id TEXT, source_key TEXT, source_hash TEXT, text_body TEXT, pages INTEGER, fields TEXT, status TEXT, expires_at TEXT, created_by TEXT, created TEXT, sent_at TEXT, completed_at TEXT, final_key TEXT, final_hash TEXT, supersedes TEXT, message TEXT)`,
`CREATE TABLE IF NOT EXISTS doc_signers (id TEXT PRIMARY KEY, doc_id TEXT, ord INTEGER, role TEXT, uid TEXT, email TEXT, first TEXT, middle TEXT, last TEXT, status TEXT, consent_at TEXT, signed_at TEXT, ip TEXT, ua TEXT, auth TEXT, sig_text TEXT, initials TEXT, vals TEXT)`,
`CREATE INDEX IF NOT EXISTS ds_uid ON doc_signers (uid)`,
`CREATE TABLE IF NOT EXISTS doc_events (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, at TEXT, actor TEXT, event TEXT, ip TEXT, ua TEXT, data TEXT)`,
`CREATE TABLE IF NOT EXISTS hosts (id TEXT PRIMARY KEY, uid TEXT UNIQUE, slug TEXT UNIQUE, name TEXT, bio TEXT, photo_key TEXT, location TEXT, socials TEXT, status TEXT DEFAULT 'active', verified INTEGER DEFAULT 0, official INTEGER DEFAULT 0, verified_at TEXT, verified_by TEXT, grooveville INTEGER DEFAULT 0, connect_id TEXT, connect_status TEXT, created TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS host_verifications (id TEXT PRIMARY KEY, host_id TEXT, status TEXT, legal_name TEXT, business_name TEXT, doc_keys TEXT, note TEXT, decision_note TEXT, decided_by TEXT, decided_at TEXT, purge_after TEXT, created TEXT)`,
`CREATE TABLE IF NOT EXISTS host_gallery (id TEXT PRIMARY KEY, host_id TEXT, event_id TEXT, key TEXT, caption TEXT, created TEXT)`,
`CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, name TEXT, slug TEXT, category TEXT, address TEXT, type TEXT, description TEXT, photos TEXT, amenities TEXT, capacity INTEGER, hours TEXT, blocked TEXT, restrictions TEXT, services_text TEXT, equipment TEXT, authorization TEXT, pricing TEXT, status TEXT DEFAULT 'active', created TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, slug TEXT UNIQUE, host_id TEXT, location_id TEXT, venue_name TEXT, venue_address TEXT, title TEXT, description TEXT, flyer_key TEXT, category TEXT, start TEXT, end TEXT, sales_open TEXT, sales_close TEXT, capacity INTEGER, reserved INTEGER DEFAULT 0, expected INTEGER, age TEXT, refund_policy TEXT, visibility TEXT, password_hash TEXT, invite_code TEXT, contact TEXT, services TEXT, setup_hours INTEGER DEFAULT 0, breakdown_hours INTEGER DEFAULT 0, status TEXT, venue_authorized INTEGER DEFAULT 0, arrangement TEXT, agreement_id TEXT, admin_note TEXT, created TEXT, updated TEXT, CHECK (reserved >= 0 AND (capacity IS NULL OR capacity = 0 OR reserved <= capacity)))`,
`CREATE TABLE IF NOT EXISTS ticket_types (id TEXT PRIMARY KEY, event_id TEXT, name TEXT, price_cents INTEGER, qty INTEGER, sold INTEGER DEFAULT 0, held INTEGER DEFAULT 0, max_per_order INTEGER DEFAULT 10, sales_start TEXT, sales_end TEXT, ord INTEGER DEFAULT 0, status TEXT DEFAULT 'active', CHECK (held >= 0 AND sold >= 0 AND sold + held <= qty))`,
`CREATE TABLE IF NOT EXISTS promo_codes (id TEXT PRIMARY KEY, event_id TEXT, code TEXT, kind TEXT, value INTEGER, max_uses INTEGER, used INTEGER DEFAULT 0, expires TEXT, UNIQUE (event_id, code), CHECK (max_uses = 0 OR used <= max_uses))`,
`CREATE TABLE IF NOT EXISTS event_agreements (id TEXT PRIMARY KEY, event_id TEXT, host_id TEXT, arrangement TEXT, terms TEXT, terms_hash TEXT, quote TEXT, status TEXT, doc_id TEXT, accepted_at TEXT, signed_at TEXT, amendment_of TEXT, created TEXT, rental_charge_id TEXT)`,
`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, event_id TEXT, email TEXT, name TEXT, uid TEXT, qty INTEGER, subtotal_cents INTEGER, discount_cents INTEGER DEFAULT 0, total_cents INTEGER, fee_cents INTEGER DEFAULT 0, refunded_cents INTEGER DEFAULT 0, dispute_cents INTEGER DEFAULT 0, dispute_fee_cents INTEGER DEFAULT 0, status TEXT, stripe_session TEXT, stripe_pi TEXT, stripe_charge TEXT, available_on TEXT, promo TEXT, hold_expires INTEGER, attendees TEXT, view_token TEXT, created TEXT, paid_at TEXT)`,
`CREATE INDEX IF NOT EXISTS o_event ON orders (event_id, status)`,
`CREATE TABLE IF NOT EXISTS order_items (order_id TEXT, ticket_type_id TEXT, qty INTEGER, unit_cents INTEGER)`,
`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, token TEXT UNIQUE, code TEXT, order_id TEXT, event_id TEXT, ticket_type_id TEXT, attendee TEXT, status TEXT, checked_in_at TEXT, checked_in_by TEXT)`,
`CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT, event_id TEXT, at TEXT, by TEXT, result TEXT)`,
`CREATE TABLE IF NOT EXISTS event_staff (event_id TEXT, uid TEXT, email TEXT, PRIMARY KEY (event_id, uid))`,
`CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, event_id TEXT UNIQUE, state TEXT, calc TEXT, adjustments TEXT, approved_amount INTEGER, approved_by TEXT, approved_at TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS settlement_log (id INTEGER PRIMARY KEY AUTOINCREMENT, settlement_id TEXT, at TEXT, actor TEXT, action TEXT, data TEXT)`,
`CREATE TABLE IF NOT EXISTS payouts (id TEXT PRIMARY KEY, settlement_id TEXT, host_id TEXT, amount_cents INTEGER, status TEXT, stripe_transfer TEXT, note TEXT, by TEXT, at TEXT, updated TEXT)`,
`CREATE TABLE IF NOT EXISTS schema_version (v INTEGER)`
];
const MANUAL_HOST_PAYMENTS = `CREATE TABLE IF NOT EXISTS manual_host_payments (
  payout_id TEXT PRIMARY KEY REFERENCES payouts(id), paid_on TEXT NOT NULL, method TEXT NOT NULL, reference TEXT
)`;
const SPECIAL_INVITES_SCHEMA = `CREATE TABLE IF NOT EXISTS special_invites (
  token TEXT PRIMARY KEY, event_id TEXT NOT NULL, host_id TEXT NOT NULL, visibility TEXT NOT NULL,
  template TEXT NOT NULL, theme TEXT NOT NULL, guest TEXT NOT NULL, message TEXT NOT NULL,
  destination TEXT NOT NULL, created TEXT NOT NULL, revoked TEXT
);
CREATE INDEX IF NOT EXISTS special_invites_event ON special_invites(event_id);
CREATE TABLE IF NOT EXISTS special_invite_engagement (
  token TEXT NOT NULL, visitor TEXT NOT NULL, opened INTEGER NOT NULL DEFAULT 0,
  revealed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(token,visitor)
);
CREATE TABLE IF NOT EXISTS special_invite_orders (order_id TEXT PRIMARY KEY, token TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS special_invite_orders_token ON special_invite_orders(token);
CREATE TABLE IF NOT EXISTS special_invite_upgrades (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, host_id TEXT NOT NULL, status TEXT NOT NULL,
  checkout_session TEXT UNIQUE, checkout_url TEXT, payment_intent TEXT UNIQUE, paid_at TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL, created TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS special_invite_upgrade_active ON special_invite_upgrades(event_id)
  WHERE status IN ('pending','paid','revoked');`.split(";").map(sql => sql.trim()).filter(Boolean);
const PROFILE_SCHEMA = [
`CREATE TABLE IF NOT EXISTS account_photos (
  uid TEXT PRIMARY KEY, key TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS host_organizations (
  id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id), slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', photo_key TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#f1ae8a', created TEXT NOT NULL, updated TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS host_organizations_host ON host_organizations(host_id)`,
`CREATE TABLE IF NOT EXISTS event_organizations (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES host_organizations(id)
)`,
`CREATE INDEX IF NOT EXISTS event_organizations_org ON event_organizations(organization_id)`
];
const BUYER_PROCESSING_SCHEMA = `CREATE TABLE IF NOT EXISTS order_processing_fees (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  cents INTEGER NOT NULL CHECK(cents > 0)
)`;
const BUSINESS_FINANCE_SCHEMA = [
`CREATE TABLE IF NOT EXISTS finance_businesses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
)`,
`INSERT OR IGNORE INTO finance_businesses (id,name) VALUES
  ('hq','Grooveville LLC'),('rentals','Grooveville Rentals'),('ent','Grooveville Entertainment'),
  ('music','Grooveville Music'),('aelio','AELIO'),('vybr8','Vybr8'),('pathd','Pathd'),
  ('w4w','W4W'),('aec','DrawUp AEC'),('scu','Shadow Crown Universe'),('wit','What If Tomorrow')`,
`CREATE TABLE IF NOT EXISTS business_finance_entries (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES finance_businesses(id),
  kind TEXT NOT NULL CHECK(kind IN ('income','ai','bill','stripe')),
  name TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  fees_cents INTEGER NOT NULL DEFAULT 0, refunded_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('open','settled')), credit_units INTEGER NOT NULL DEFAULT 0,
  entry_date TEXT NOT NULL, created TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS business_finance_business ON business_finance_entries(business_id, entry_date)`
];
const GROOVE_READS_FINANCE = "INSERT OR IGNORE INTO finance_businesses (id,name) VALUES ('reads','Groove Reads')";
const SUPPORT_SCHEMA = [
`CREATE TABLE IF NOT EXISTS portal_support_threads (
  id TEXT PRIMARY KEY, uid TEXT NOT NULL, subject TEXT NOT NULL, updated TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS portal_support_threads_uid ON portal_support_threads(uid, updated)`,
`CREATE TABLE IF NOT EXISTS portal_support_replies (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES portal_support_threads(id),
  author TEXT NOT NULL CHECK(author IN ('customer','team')),
  body TEXT NOT NULL, created TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS portal_support_replies_thread ON portal_support_replies(thread_id, seq)`,
`INSERT OR IGNORE INTO portal_support_threads (id,uid,subject,updated)
SELECT 'legacy-' || id, actor, COALESCE(NULLIF(json_extract(data,'$.subject'), ''), 'Message from the portal'), at
FROM audit WHERE action='support_message' AND actor <> '' AND json_valid(data)`,
`INSERT INTO portal_support_replies (thread_id,author,body,created)
SELECT t.id,'customer',COALESCE(json_extract(a.data,'$.message'), ''),a.at
FROM audit a JOIN portal_support_threads t ON t.id='legacy-' || a.id
WHERE a.action='support_message' AND json_valid(a.data)
AND NOT EXISTS (SELECT 1 FROM portal_support_replies r WHERE r.thread_id=t.id)`
];
let READY = null;
export async function db(env) {
  if (!env.PORTAL_DB) throw Object.assign(new Error("The portal database (D1 binding PORTAL_DB) isn't connected yet."), { status: 503 });
  if (!READY) READY = (async () => {
    const D = env.PORTAL_DB;
    const current = await D.prepare("SELECT MAX(v) AS v FROM schema_version").first().catch(() => null);
    if (current?.v >= 8) return;
    const schema = current?.v >= 1 ? [] : SCHEMA;
    await D.batch([...schema, ...(current?.v >= 2 ? [] : [MANUAL_HOST_PAYMENTS]), ...(current?.v >= 3 ? [] : SPECIAL_INVITES_SCHEMA), ...(current?.v >= 4 ? [] : PROFILE_SCHEMA), ...(current?.v >= 5 ? [] : [BUYER_PROCESSING_SCHEMA]), ...(current?.v >= 6 ? [] : BUSINESS_FINANCE_SCHEMA), ...(current?.v >= 7 ? [] : [GROOVE_READS_FINANCE]), ...SUPPORT_SCHEMA, "INSERT INTO schema_version (v) SELECT 8 WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE v >= 8)"].map(sql => D.prepare(sql)));
  })().catch(e => { READY = null; throw e });
  await READY; return env.PORTAL_DB;
}
export const q = (D, sql, ...a) => D.prepare(sql).bind(...a);
export const one = (D, sql, ...a) => q(D, sql, ...a).first();
export const all = async (D, sql, ...a) => (await q(D, sql, ...a).all()).results || [];
export const run = (D, sql, ...a) => q(D, sql, ...a).run();
export const pj = (s, d) => { try { return s ? JSON.parse(s) : d } catch (e) { return d } };

/* ---------- settings (founder switches) ---------- */
export const DEF_SETTINGS = { rentals_open: false, ent_open: false, payments_live: false, esign_live: false, platform_fee_bps: 500, platform_fee_cents: 0, support_email: "", hold_minutes: 15 };
export async function settings(D) { const rows = await all(D, "SELECT k, v FROM settings"); const o = Object.assign({}, DEF_SETTINGS); for (const r of rows) o[r.k] = pj(r.v, r.v); return o }
export async function setSetting(D, k, v) { await run(D, "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, JSON.stringify(v)) }

/* ---------- who is calling ---------- */
function fsVal(v) { if (!v) return undefined; if ("stringValue" in v) return v.stringValue; if ("booleanValue" in v) return v.booleanValue; if ("integerValue" in v) return Number(v.integerValue); if ("arrayValue" in v) return (v.arrayValue.values || []).map(fsVal); if ("mapValue" in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = fsVal(x); return o } return null }
export async function who(req, env, h, D) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""); if (!t) return null;
  let u; try { u = await h.verifyIdToken(t, env.FIREBASE_PROJECT_ID) } catch (e) { return null }
  let role = ""; try { const r = await (h.fetcher || fetch)("https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT_ID + "/databases/(default)/documents/access/" + u.uid, { headers: { Authorization: "Bearer " + t } }); if (r.ok) { const d = await r.json(); role = String(fsVal((d.fields || {}).role) || "").toLowerCase() } } catch (e) { }
  u.founder = role === "founder" || role === "hnic";
  const R = D ? await all(D, "SELECT role, scope FROM roles WHERE uid = ?", u.uid) : [];
  u.roles = R; u.admin = u.founder || R.some(x => x.role === "admin"); u.finance = u.founder || R.some(x => x.role === "finance");
  u.rentalsStaff = R.some(x => x.role === "rentals");
  u.tester = u.admin || R.some(x => x.role === "tester");
  u.auth = "Firebase sign-in (" + (u.firebase && u.firebase.sign_in_provider || "password") + "), email " + (u.email_verified ? "verified" : "not verified");
  return u;
}
export const ipOf = req => req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
export const uaOf = req => String(req.headers.get("user-agent") || "").slice(0, 300);

/* ---------- audit log (hash-chained: each row commits to the one before it) ---------- */
export async function audit(D, actor, action, entity, id, data) {
  const prev = await one(D, "SELECT hash FROM audit ORDER BY id DESC LIMIT 1"); const at = now(), d = JSON.stringify(data || {});
  const hash = await sha256((prev ? prev.hash : "genesis") + "|" + at + "|" + actor + "|" + action + "|" + entity + "|" + id + "|" + d);
  await run(D, "INSERT INTO audit (at, actor, action, entity, entity_id, data, prev, hash) VALUES (?,?,?,?,?,?,?,?)", at, actor || "system", action, entity, id || "", d, prev ? prev.hash : "genesis", hash);
}
export async function verifyAudit(D) { const rows = await all(D, "SELECT * FROM audit ORDER BY id"); const seen = new Set(["genesis"]); for (const r of rows) { const h = await sha256(r.prev + "|" + r.at + "|" + r.actor + "|" + r.action + "|" + r.entity + "|" + r.entity_id + "|" + r.data); if (!seen.has(r.prev) || h !== r.hash) return { ok: false, at: r.id, rows: rows.length }; seen.add(r.hash) } return { ok: true, rows: rows.length } }

/* ---------- notifications: in-app always; email only with RESEND_API_KEY, and never with private details ---------- */
export async function notify(env, D, uid, kind, title, body, link, email) {
  if (uid) await run(D, "INSERT INTO notifications (id, uid, kind, title, body, link, seen, at) VALUES (?,?,?,?,?,?,0,?)", rid(12), uid, kind, title, body || "", link || "", now());
  if (email && env.RESEND_API_KEY && env.MAIL_FROM) await mail(env, email, title, (body || "") + "\n\nOpen Grooveville: https://" + (env.SITE_HOST || "grooveville.org") + "/" + (link || "#account")).catch(() => { });
}
export async function mail(env, to, subject, text, fetcher) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false;
  const r = await (fetcher || fetch)("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }) });
  return r.ok;
}

/* ---------- rate limiting (per key, fixed window) ---------- */
export async function limited(D, key, max, secs) {
  const t = Math.floor(Date.now() / 1000), r = await one(D, "SELECT n, until FROM ratelimit WHERE k = ?", key);
  if (!r || r.until < t) { await run(D, "INSERT INTO ratelimit (k, n, until) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, until = excluded.until", key, t + secs); return false }
  if (r.n >= max) return true; await run(D, "UPDATE ratelimit SET n = n + 1 WHERE k = ?", key); return false;
}

/* ---------- Stripe ---------- */
export function stripeMode(env) { const k = String(env.STRIPE_SECRET_KEY || ""); return k.startsWith("sk_live") || k.startsWith("rk_live") ? "live" : k ? "test" : "off" }
export async function stripe(env, method, path, form, opts) {
  opts = opts || {}; const body = new URLSearchParams();
  const add = (k, v) => { if (v === undefined || v === null || v === "") return; if (Array.isArray(v)) v.forEach((x, i) => add(k + "[" + i + "]", x)); else if (typeof v === "object") { for (const [kk, vv] of Object.entries(v)) add(k + "[" + kk + "]", vv) } else body.append(k, String(v)) };
  for (const [k, v] of Object.entries(form || {})) add(k, v);
  const headers = { authorization: "Bearer " + env.STRIPE_SECRET_KEY }; if (method === "POST") headers["content-type"] = "application/x-www-form-urlencoded"; if (opts.idem) headers["idempotency-key"] = opts.idem; if (opts.account) headers["stripe-account"] = opts.account;
  const url = "https://api.stripe.com/v1/" + path + (method === "GET" && body.toString() ? "?" + body : "");
  const send = async () => {
    const r = await (opts.fetcher || fetch)(url, { method, headers, body: method === "POST" ? body : undefined });
    return { r, j: await r.json().catch(() => ({})) };
  };
  const hostedCheckout = method === "POST" && path === "checkout/sessions" && (!form?.ui_mode || form.ui_mode === "hosted");
  let result;
  if (hostedCheckout) {
    const settings = {
      display_name: "Grooveville LLC",
      background_color: "#FFF9F4",
      button_color: "#F4A987",
      border_style: "rounded",
      font_family: "inter",
      logo: { type: "url", url: "https://" + (env.SITE_HOST || "grooveville.org") + "/media/checkout-logo.png" },
    };
    add("branding_settings", settings);
    headers["stripe-version"] = "2026-11-18.endive";
    result = await send();
    // Stripe does not execute requests it rejects at parameter validation.
    // Preserve the existing route and key if Stripe rejects the visual settings.
    const param = result.j.error?.param;
    if (result.r.status === 400 && /^branding_settings(?:$|[.\[])/.test(param || "")) {
      console.warn("stripe_checkout_branding_rejected", { requestId: result.r.headers.get("request-id"), param, code: result.j.error?.code });
      for (const key of [...body.keys()]) if (key.startsWith("branding_settings[")) body.delete(key);
      delete headers["stripe-version"];
      result = await send();
    }
  } else result = await send();
  const { r, j } = result;
  if (!r.ok) throw Object.assign(new Error(j.error?.message || "Stripe error (" + r.status + ")"), {
    status: 502, stripeStatus: r.status, stripe: j.error, requestId: r.headers.get("request-id"),
  });
  return j;
}
export async function stripeVerify(secret, payload, header) {
  const parts = Object.fromEntries(String(header || "").split(",").map(x => x.split("=")).filter(x => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || "").split(",").filter(x => x.trim().startsWith("v1=")).map(x => x.trim().slice(3));
  if (!parts.t || !sigs.length || !secret) return false; if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const want = await hmac(secret, parts.t + "." + payload); return sigs.some(s => safeEq(s, want));
}

/* ---------- private files (R2) with expiring signed links ---------- */
export const FILE_RE = /^portal\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9._\/-]{1,200}$/;
export async function signLink(env, key, mins, name) { const exp = Math.floor(Date.now() / 1000) + (mins || 10) * 60; const sig = (await hmac(secretOf(env), "pf|" + key + "|" + exp + "|" + (name || ""))).slice(0, 32); return "/api/p/file/" + exp + "." + sig + "/" + key + (name ? "?name=" + encodeURIComponent(name) : "") }
export async function checkLink(env, exp, sig, key, name) { return Number(exp) > Date.now() / 1000 && safeEq(sig, (await hmac(secretOf(env), "pf|" + key + "|" + exp + "|" + (name || ""))).slice(0, 32)) }
export const slugify = s => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";
export const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n || 500);
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
export const isDT = s => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(s || ""));
