/* Grooveville Entertainment: hosts, peach verification, events, ticket types, guest checkout,
   QR tickets and door check-in. Overselling is impossible by construction: ticket holds and sales are
   guarded by database CHECK constraints inside one transaction. */
import { J, one, all, run, now, rid, pj, clean, audit, notify, stripe, sha256, slugify, limited, isDT, mail, signLink } from "./core.js";
import { activeInvite } from "./invites.js";
import { quote, normPricing } from "./pricing.js";
import { adminUids } from "./rentals.js";
export function localNow(tz) { const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()), g = t => (f.find(x => x.type === t) || {}).value; return g("year") + "-" + g("month") + "-" + g("day") + "T" + g("hour") + ":" + g("minute") }
const TZ = S => S.tz || "America/New_York";
const fmtWhen = s => { try { const d = new Date(s.slice(0, 16) + ":00Z"); return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) } catch (e) { return s } };
const hostCard = h => h && { id: h.id, slug: h.slug, name: h.name, photo: h.photo_key || "", verified: !!h.verified, official: !!h.official, location: h.location };
const orgCard = o => o && { id: o.id, slug: o.slug, name: o.name, bio: o.bio, photo: o.photo_key, accent: o.accent };
const ownedPublicPhoto = async (env, key, uid) => typeof key === "string" && key.startsWith("portal/pub/") &&
  (await env.STUDIO_BUCKET.head(key))?.customMetadata?.by === uid;
export async function publicEventMeta(D, slug) { const e = await one(D, "SELECT e.title, e.start, e.flyer_key, e.venue_name, e.status, e.visibility, l.name AS lname FROM events e LEFT JOIN locations l ON l.id = e.location_id WHERE e.slug = ?", slug); if (!e || !["published", "sales_closed", "completed"].includes(e.status) || e.visibility === "private" || e.visibility === "password") return null; return { title: e.title, when: fmtWhen(e.start), venue: e.lname || e.venue_name, flyer: e.flyer_key } }
async function pwHash(salt, pw) { return sha256("gvev|" + salt + "|" + pw) }
function eventPublic(e, h, loc, types, S) {
  const ln = localNow(TZ(S)), salesOpen = (!e.sales_open || e.sales_open <= ln) && (!e.sales_close || e.sales_close > ln) && e.status === "published";
  return { id: e.id, slug: e.slug, title: e.title, description: e.description, flyer: e.flyer_key || "", category: e.category, start: e.start, end: e.end, sales_open: e.sales_open, sales_close: e.sales_close, age: e.age, refund_policy: e.refund_policy, contact: e.contact, status: e.status, visibility: e.visibility, capacity: e.capacity, remaining: e.capacity ? Math.max(0, e.capacity - e.reserved) : null, salesOpen, now: ln,
    venue: loc ? { name: loc.name, address: loc.address, category: loc.category } : { name: e.venue_name, address: e.venue_address, category: "external" }, host: hostCard(h),
    tickets: (types || []).filter(t => t.status === "active").map(t => ({ id: t.id, name: t.name, price_cents: t.price_cents, remaining: Math.max(0, t.qty - t.sold - t.held), max_per_order: t.max_per_order, sales_start: t.sales_start, sales_end: t.sales_end, onSale: salesOpen && (!t.sales_start || t.sales_start <= ln) && (!t.sales_end || t.sales_end > ln) })) };
}
async function canSeeEvent(C, e, k, pw) {
  const { u, D } = C; const owner = u && (u.admin || (await one(D, "SELECT 1 AS x FROM hosts WHERE id = ? AND uid = ?", e.host_id, u.uid)));
  if (owner) return { ok: true, owner: true };
  if (!["published", "sales_closed", "completed"].includes(e.status)) return { ok: false };
  if (!C.S.ent_open && !(u && u.tester)) return { ok: false, closed: true };
  if (e.visibility === "private" && k !== e.invite_code) return { ok: false, private: true };
  if (e.visibility === "password") { const [salt, hh] = String(e.password_hash || "").split(":"); if (!pw || (await pwHash(salt, String(pw))) !== hh) return { ok: false, password: true } }
  return { ok: true };
}
export async function issueTickets(env, D, o, base) {
  const have = await one(D, "SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?", o.id); if (have.n) return [];
  const items = await all(D, "SELECT * FROM order_items WHERE order_id = ?", o.id), att = pj(o.attendees, []), T = []; let i = 0;
  for (const it of items) for (let k = 0; k < it.qty; k++) { const t = { id: rid(12), token: rid(24), code: (rid(4) + rid(4)).toUpperCase(), type: it.ticket_type_id, att: clean(att[i++] || o.name, 80) }; T.push(t) }
  await D.batch(T.map(t => D.prepare("INSERT INTO tickets (id, token, code, order_id, event_id, ticket_type_id, attendee, status) VALUES (?,?,?,?,?,?,?,'valid')").bind(t.id, t.token, t.code, o.id, o.event_id, t.type, t.att)));
  const e = await one(D, "SELECT title, start FROM events WHERE id = ?", o.event_id);
  if (o.email) await mail(env, o.email, "Your tickets: " + (e ? e.title : "Grooveville event"), "Thanks for your order" + (o.name ? ", " + o.name : "") + ".\n\n" + (e ? e.title + "\n" + fmtWhen(e.start) + "\n\n" : "") + "Your " + T.length + " ticket" + (T.length > 1 ? "s" : "") + " (with QR codes): " + base + "/#order/" + o.id + "." + o.view_token + "\n\nShow the QR code at the door. Keep this link private: anyone with it can use the tickets.").catch(() => { });
  return T;
}
/* convert held seats to sold and mark the order paid: idempotent, and safe if the hold had already expired */
export async function markOrderPaid(env, D, o, pay, base) {
  const items = await all(D, "SELECT * FROM order_items WHERE order_id = ?", o.id), qty = items.reduce((a, x) => a + x.qty, 0);
  if (o.status === "pending") {
    const r = await D.batch([D.prepare("UPDATE orders SET status = 'paid', paid_at = ?, stripe_pi = ?, stripe_charge = ?, fee_cents = ?, available_on = ? WHERE id = ? AND status = 'pending'").bind(now(), pay.pi || "", pay.charge || "", pay.fee | 0, pay.available_on || null, o.id)].concat(items.map(it => D.prepare("UPDATE ticket_types SET held = held - ?, sold = sold + ? WHERE id = ? AND (SELECT changes()) > 0").bind(it.qty, it.qty, it.ticket_type_id))));
    if (!(r[0].meta && r[0].meta.changes)) return { already: true };
  } else if (o.status === "expired") {
    try { await D.batch([D.prepare("UPDATE orders SET status = 'paid', paid_at = ?, stripe_pi = ?, stripe_charge = ?, fee_cents = ?, available_on = ? WHERE id = ? AND status = 'expired'").bind(now(), pay.pi || "", pay.charge || "", pay.fee | 0, pay.available_on || null, o.id), D.prepare("UPDATE events SET reserved = reserved + ? WHERE id = ?").bind(qty, o.event_id)].concat(items.map(it => D.prepare("UPDATE ticket_types SET sold = sold + ? WHERE id = ?").bind(it.qty, it.ticket_type_id)))) }
    catch (e) { await run(D, "UPDATE orders SET status = 'paid', paid_at = ?, stripe_pi = ?, fee_cents = ?, attendees = attendees WHERE id = ?", now(), pay.pi || "", pay.fee | 0, o.id); await audit(D, "stripe", "order_paid_over_capacity", "order", o.id, { note: "Payment arrived after the hold expired and capacity is full. Refund or honor manually." }); for (const a of await adminUids(D)) await notify(env, D, a, "oversold", "Late payment over capacity", "An order was paid after its hold expired and the event is full. Review it in Finance.", "#team-portals/finance") }
  } else return { already: true };
  const fresh = await one(D, "SELECT * FROM orders WHERE id = ?", o.id); const T = await issueTickets(env, D, fresh, base);
  await audit(D, "stripe", "order_paid", "order", o.id, { total: o.total_cents, tickets: T.length });
  const ev = await one(D, "SELECT e.title, h.uid FROM events e JOIN hosts h ON h.id = e.host_id WHERE e.id = ?", o.event_id); if (ev) await notify(env, D, ev.uid, "ticket_sale", "New ticket order", qty + " ticket" + (qty > 1 ? "s" : "") + " for " + ev.title, "#host");
  return { ok: true, tickets: T.length };
}
export async function releaseOrder(D, o, status) {
  const items = await all(D, "SELECT * FROM order_items WHERE order_id = ?", o.id), qty = items.reduce((a, x) => a + x.qty, 0);
  const r = await D.batch([D.prepare("UPDATE orders SET status = ? WHERE id = ? AND status = 'pending'").bind(status || "expired", o.id)].concat(items.map(it => D.prepare("UPDATE ticket_types SET held = held - ? WHERE id = ? AND (SELECT status FROM orders WHERE id = ?) = ? AND held >= ?").bind(it.qty, it.ticket_type_id, o.id, status || "expired", it.qty)), [D.prepare("UPDATE events SET reserved = reserved - ? WHERE id = ? AND (SELECT status FROM orders WHERE id = ?) = ?").bind(qty, o.event_id, o.id, status || "expired")], o.promo ? [D.prepare("UPDATE promo_codes SET used = used - 1 WHERE event_id = ? AND code = ? AND used > 0").bind(o.event_id, o.promo)] : []));
  return r[0].meta && r[0].meta.changes === 1;
}
async function ownEvent(C, id) { const { D, u } = C; const e = await one(D, "SELECT * FROM events WHERE id = ?", id || ""); if (!e) return null; if (u.admin) return e; const h = await one(D, "SELECT id FROM hosts WHERE uid = ?", u.uid); return h && h.id === e.host_id ? e : null }
async function canStaff(C, eventId) { const { D, u } = C; if (!u) return false; if (u.admin) return true; const e = await one(D, "SELECT host_id FROM events WHERE id = ?", eventId); if (!e) return false; if (await one(D, "SELECT 1 AS x FROM hosts WHERE id = ? AND uid = ?", e.host_id, u.uid)) return true; return !!(await one(D, "SELECT 1 AS x FROM event_staff WHERE event_id = ? AND uid = ?", eventId, u.uid)) }
const MATERIAL = ["location_id", "venue_name", "venue_address", "start", "end", "expected", "services", "setup_hours", "breakdown_hours", "capacity"];
export async function termsFor(D, S, e, h, offer, loc) {
  const P = loc ? normPricing(pj(loc.pricing, {})) : null;
  return { version: 1, event: { id: e.id, title: e.title, start: e.start, end: e.end, expected: e.expected, capacity: e.capacity, services: pj(e.services, []), setupHours: e.setup_hours, breakdownHours: e.breakdown_hours, refundPolicy: e.refund_policy },
    location: loc ? { id: loc.id, name: loc.name, address: loc.address, category: loc.category, restrictions: loc.restrictions } : { name: e.venue_name, address: e.venue_address, category: "external" },
    host: { id: h.id, name: h.name }, arrangement: offer.arrangement, rentalCents: offer.totalCents || 0, depositCents: offer.depositCents || 0, shareBps: offer.shareBps || 0, minGuaranteeCents: offer.minGuaranteeCents || 0,
    platformFeeBps: P && (P.platformFeeBps || offer.arrangement !== "share") ? (P.platformFeeBps || S.platform_fee_bps || 0) : (offer.arrangement === "share" ? 0 : (S.platform_fee_bps || 0)), perTicketCents: P ? (P.platformPerTicketCents || 0) : (S.platform_fee_cents || 0),
    processingBorneBy: P ? P.processingBorneBy : "host", shareBase: P ? P.shareBase : "net_sales", cancelPolicy: (P && P.cancelPolicy) || "", lines: offer.lines || [],
    refundsAndChargebacks: "Refunds and chargebacks are deducted from ticket sales before any revenue share is calculated. Stripe processing fees are paid by the " + ((P && P.processingBorneBy) === "grooveville" ? "Grooveville" : "host") + ".",
    offPlatform: "Tickets sold outside Grooveville (cash, other platforms) are not part of this settlement; they must be reported to Grooveville and are reconciled manually.", payout: "Grooveville pays approved host earnings externally after ticket sales close and payments are reconciled." };
}
export async function entApi(C) {
  const { D, S, u, b, p, url, req, env } = C, base = "https://" + url.host;
  const pubOpen = S.ent_open || (u && u.tester);
  /* ---------------- public ---------------- */
  if (p === "/api/p/events") { if (!pubOpen) return J({ closed: true, events: [] }); const ln = localNow(TZ(S)); const E = await all(D, "SELECT e.*, l.name AS lname, l.address AS laddr, h.name AS hname, h.slug AS hslug, h.verified AS hver, h.official AS hoff, o.name AS oname, o.slug AS oslug FROM events e LEFT JOIN event_organizations eo ON eo.event_id = e.id LEFT JOIN host_organizations o ON o.id = eo.organization_id AND o.host_id = e.host_id LEFT JOIN locations l ON l.id = e.location_id JOIN hosts h ON h.id = e.host_id WHERE e.status IN ('published','sales_closed') AND e.visibility = 'public' AND e.end > ? ORDER BY e.start LIMIT 100", ln);
    const mins = await all(D, "SELECT event_id, MIN(price_cents) AS m FROM ticket_types WHERE status = 'active' GROUP BY event_id"); return J({ events: E.map(e => ({ slug: e.slug, title: e.title, start: e.start, flyer: e.flyer_key, venue: e.lname || e.venue_name, host: { name: e.hname, slug: e.hslug, verified: !!e.hver, official: !!e.hoff }, organization: e.oslug ? { name: e.oname, slug: e.oslug } : null, from: (mins.find(m => m.event_id === e.id) || {}).m, status: e.status, category: e.category })) }) }
  if (p === "/api/p/event") {
    const e = await one(D, "SELECT * FROM events WHERE slug = ?", url.searchParams.get("slug") || ""); if (!e) return J({ error: "Event not found" }, 404);
    const token = url.searchParams.get("invite");
    const invite = token && S.ent_open && await activeInvite(D, S, token, e.id);
    if (token && !invite) return J({ error: "This invitation is unavailable." }, 404);
    const v = invite ? { ok: true } : await canSeeEvent(C, e, url.searchParams.get("k") || "", url.searchParams.get("pw") || ""); if (!v.ok) return J(v.password ? { locked: "password", title: e.title } : v.private ? { locked: "private" } : { error: v.closed ? "Grooveville Entertainment opens soon." : "Event not found" }, v.password || v.private ? 200 : 404);
    const h = await one(D, "SELECT * FROM hosts WHERE id = ?", e.host_id), loc = e.location_id ? await one(D, "SELECT * FROM locations WHERE id = ?", e.location_id) : null, T = await all(D, "SELECT * FROM ticket_types WHERE event_id = ? ORDER BY ord, price_cents", e.id);
    const org = await one(D, "SELECT o.* FROM event_organizations eo JOIN host_organizations o ON o.id = eo.organization_id WHERE eo.event_id = ? AND o.host_id = ?", e.id, e.host_id);
    return J({ event: { ...eventPublic(e, h, loc, invite?.destination === "rsvp" ? T.filter(t => !t.price_cents) : T, S), organization: orgCard(org) }, preview: !!v.owner && e.status !== "published", stripe: C.mode, live: C.mode === "live" && !!S.payments_live });
  }
  if (p === "/api/p/hostpage") {
    const orgSlug = url.searchParams.get("org");
    const org = orgSlug ? await one(D, "SELECT * FROM host_organizations WHERE slug = ?", orgSlug) : null;
    const h = orgSlug ? org && await one(D, "SELECT * FROM hosts WHERE id = ?", org.host_id) : await one(D, "SELECT * FROM hosts WHERE slug = ?", url.searchParams.get("slug") || "");
    if (!h || h.status !== "active" || (!pubOpen && !(u && (u.admin || u.uid === h.uid)))) return J({ error: orgSlug ? "Organization not found" : "Host not found" }, 404);
    const ln = localNow(TZ(S));
    const [events, gallery, organizations] = await Promise.all([
      all(D, "SELECT e.slug, e.title, e.start, e.end, e.flyer_key AS flyer, COALESCE(l.name, e.venue_name) AS venue FROM events e LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN event_organizations eo ON eo.event_id = e.id WHERE e.host_id = ? AND e.status IN ('published','sales_closed','completed') AND e.visibility = 'public' AND (? IS NULL OR eo.organization_id = ?) ORDER BY e.start DESC LIMIT 60", h.id, org?.id || null, org?.id || null),
      org ? [] : all(D, "SELECT key, caption, event_id FROM host_gallery WHERE host_id = ? ORDER BY created DESC LIMIT 60", h.id),
      org ? [] : all(D, "SELECT * FROM host_organizations WHERE host_id = ? ORDER BY name", h.id),
    ]);
    return J({ host: { ...hostCard(h), bio: h.bio, socials: pj(h.socials, {}) }, organization: orgCard(org), organizations: organizations.map(orgCard), upcoming: events.filter(e => e.end > ln).reverse(), past: events.filter(e => e.end <= ln), gallery });
  }
  if (p === "/api/p/promo/check" && req.method === "POST") { const e = await one(D, "SELECT id FROM events WHERE slug = ?", String(b.slug || "")); if (!e) return J({ valid: false }); const pc = await one(D, "SELECT * FROM promo_codes WHERE event_id = ? AND code = ?", e.id, String(b.code || "").toUpperCase().trim()); if (!pc || (pc.max_uses && pc.used >= pc.max_uses) || (pc.expires && pc.expires < localNow(TZ(S)))) return J({ valid: false }); return J({ valid: true, kind: pc.kind, value: pc.value }) }
  if (p === "/api/p/checkout" && req.method === "POST") {
    if (await limited(D, "co:" + C.ip, 40, 600)) return J({ error: "Too many attempts. Wait a few minutes and try again." }, 429);
    const e = await one(D, "SELECT * FROM events WHERE slug = ?", String(b.slug || "")); if (!e) return J({ error: "Event not found" }, 404);
    const invite = b.invite && S.ent_open && await activeInvite(D, S, b.invite, e.id);
    if (b.invite && !invite) return J({ error: "This invitation is unavailable." }, 404);
    const v = invite ? { ok: true } : await canSeeEvent(C, e, String(b.k || ""), String(b.pw || "")); if (!v.ok || e.status !== "published") return J({ error: "Tickets aren't on sale for this event" }, 403);
    const ln = localNow(TZ(S)); if ((e.sales_open && e.sales_open > ln) || (e.sales_close && e.sales_close <= ln)) return J({ error: "Ticket sales are closed" }, 403);
    const name = clean(b.name, 80), email = clean(b.email, 200).toLowerCase(); if (name.length < 2) return J({ error: "Enter your name" }, 400); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return J({ error: "Enter a valid email for your tickets" }, 400);
    const T = await all(D, "SELECT * FROM ticket_types WHERE event_id = ? AND status = 'active'", e.id); const items = []; let qty = 0, sub = 0;
    for (const it of (b.items || []).slice(0, 10)) { const q = Math.round(Number(it.qty) || 0); if (q <= 0) continue; const t = T.find(x => x.id === it.type); if (!t) return J({ error: "That ticket type isn't available" }, 400); if ((t.sales_start && t.sales_start > ln) || (t.sales_end && t.sales_end <= ln)) return J({ error: t.name + " isn't on sale right now" }, 400); if (q > (t.max_per_order || 10)) return J({ error: "Up to " + (t.max_per_order || 10) + " " + t.name + " per order" }, 400); items.push({ t, q }); qty += q; sub += q * t.price_cents }
    if (invite?.destination === "rsvp" && sub > 0) return J({ error: "This invite is for free RSVPs." }, 400);
    if (!qty) return J({ error: "Choose at least one ticket" }, 400); if (qty > 20) return J({ error: "Up to 20 tickets per order" }, 400);
    let disc = 0, promo = ""; if (b.promo) { promo = String(b.promo).toUpperCase().trim().slice(0, 30); const pc = await one(D, "SELECT * FROM promo_codes WHERE event_id = ? AND code = ?", e.id, promo); if (!pc || (pc.expires && pc.expires < ln)) return J({ error: "That promo code isn't valid" }, 400); disc = pc.kind === "pct" ? Math.min(sub, Math.floor(sub * Math.min(10000, pc.value) / 10000)) : Math.min(sub, pc.value) }
    const total = sub - disc, free = total === 0;
    if (!free && (C.mode === "off")) return J({ error: "Payments aren't connected yet" }, 503);
    if (!free && C.mode === "live" && !S.payments_live) return J({ error: "Ticket sales open soon." }, 403);
    const id = rid(12), tok = rid(24), att = (Array.isArray(b.attendees) ? b.attendees : []).slice(0, qty).map(x => clean(x, 80));
    const stmts = items.map(({ t, q }) => D.prepare("UPDATE ticket_types SET " + (free ? "sold = sold + ?" : "held = held + ?") + " WHERE id = ?").bind(q, t.id));
    stmts.push(D.prepare("UPDATE events SET reserved = reserved + ? WHERE id = ?").bind(qty, e.id));
    if (promo) stmts.push(D.prepare("UPDATE promo_codes SET used = used + 1 WHERE event_id = ? AND code = ?").bind(e.id, promo));
    stmts.push(D.prepare("INSERT INTO orders (id, event_id, email, name, uid, qty, subtotal_cents, discount_cents, total_cents, status, promo, hold_expires, attendees, view_token, created, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, e.id, email, name, u ? u.uid : null, qty, sub, disc, total, free ? "paid" : "pending", promo, Date.now() + 31 * 60000, JSON.stringify(att), tok, now(), free ? now() : null));
    if (invite) stmts.push(D.prepare("INSERT INTO special_invite_orders (order_id,token) VALUES (?,?)").bind(id, invite.token));
    for (const { t, q } of items) stmts.push(D.prepare("INSERT INTO order_items (order_id, ticket_type_id, qty, unit_cents) VALUES (?,?,?,?)").bind(id, t.id, q, t.price_cents));
    await D.batch(stmts); /* throws (CHECK constraint) if any ticket type, the event or the promo code would go over its limit */
    const o = await one(D, "SELECT * FROM orders WHERE id = ?", id);
    if (free) { await issueTickets(env, D, o, base); await audit(D, u ? u.uid : "guest", "order_free", "order", id, { qty }); return J({ ok: true, free: true, order: id, token: tok }) }
    const host = await one(D, "SELECT * FROM hosts WHERE id = ?", e.host_id);
    try {
      const sess = await stripe(env, "POST", "checkout/sessions", { mode: "payment", customer_email: email, client_reference_id: id, expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 15,
        line_items: disc ? [{ quantity: 1, price_data: { currency: "usd", unit_amount: total, product_data: { name: e.title + " · " + qty + " ticket" + (qty > 1 ? "s" : "") + " (code " + promo + ")" } } }] : items.map(({ t, q }) => ({ quantity: q, price_data: { currency: "usd", unit_amount: t.price_cents, product_data: { name: e.title + " · " + t.name } } })),
        metadata: { gvp: "order", order: id, event: e.id }, payment_intent_data: { metadata: { gvp: "order", order: id, event: e.id }, description: "Tickets: " + e.title + (host && !host.grooveville ? " (hosted by " + host.name + ")" : "") },
        success_url: base + "/#order/" + id + "." + tok + "?paid=1", cancel_url: base + "/#e/" + e.slug + "?cancel=" + id + "." + tok + (invite ? "&invite=" + invite.token : "") }, { idem: "order-" + id, fetcher: C.fetcher });
      await run(D, "UPDATE orders SET stripe_session = ? WHERE id = ?", sess.id, id); await audit(D, u ? u.uid : "guest", "order_started", "order", id, { total, qty, session: sess.id });
      return J({ ok: true, url: sess.url, order: id });
    } catch (er) { await releaseOrder(D, o, "canceled"); throw er }
  }
  if (p === "/api/p/order") {
    const [id, t] = String(url.searchParams.get("o") || "").split("."); const o = await one(D, "SELECT * FROM orders WHERE id = ?", id || ""); if (!o || !t || o.view_token !== t) return J({ error: "Order not found" }, 404);
    const e = await one(D, "SELECT e.*, l.name AS lname, l.address AS laddr FROM events e LEFT JOIN locations l ON l.id = e.location_id WHERE e.id = ?", o.event_id), T = await all(D, "SELECT t.token, t.code, t.attendee, t.status, t.checked_in_at, y.name AS type FROM tickets t LEFT JOIN ticket_types y ON y.id = t.ticket_type_id WHERE t.order_id = ?", o.id);
    return J({ order: { id: o.id, status: o.status, qty: o.qty, total_cents: o.total_cents, discount_cents: o.discount_cents, refunded_cents: o.refunded_cents, name: o.name, email: o.email, paid_at: o.paid_at, created: o.created }, event: { title: e.title, slug: e.slug, start: e.start, end: e.end, venue: e.lname || e.venue_name, address: e.laddr || e.venue_address, flyer: e.flyer_key, age: e.age }, tickets: T });
  }
  if (p === "/api/p/order/cancel" && req.method === "POST") {
    const [id, t] = String(b.o || "").split("."); const o = await one(D, "SELECT * FROM orders WHERE id = ?", id || ""); if (!o || o.view_token !== t) return J({ error: "Not found" }, 404); if (o.status !== "pending") return J({ ok: true, status: o.status });
    if (o.stripe_session) { try { await stripe(env, "POST", "checkout/sessions/" + o.stripe_session + "/expire", {}, { fetcher: C.fetcher }) } catch (er) { const s = await stripe(env, "GET", "checkout/sessions/" + o.stripe_session, {}, { fetcher: C.fetcher }).catch(() => null); if (s && s.payment_status === "paid") return J({ ok: true, status: "paid" }) } }
    await releaseOrder(D, o, "canceled"); return J({ ok: true, status: "canceled" });
  }
  if (p === "/api/p/ticket") { const t = await one(D, "SELECT t.status, t.code, t.attendee, t.checked_in_at, e.title, e.start, e.id AS event_id FROM tickets t JOIN events e ON e.id = t.event_id WHERE t.token = ?", url.searchParams.get("token") || ""); if (!t) return J({ error: "Ticket not found" }, 404); const staff = u ? await canStaff(C, t.event_id) : false; return J({ ticket: t, staff }) }
  if (p === "/api/p/locations") { const L = await all(D, "SELECT * FROM locations WHERE status = 'active' ORDER BY category, name"); return J({ locations: L.map(l => ({ id: l.id, name: l.name, category: l.category, address: l.address, type: l.type, description: l.description, photos: pj(l.photos, []), amenities: pj(l.amenities, []), capacity: l.capacity, hours: pj(l.hours, {}), restrictions: l.restrictions, equipment: l.equipment, authorized: l.category === "external" || l.authorization === "authorized", services: normPricing(pj(l.pricing, {})).services.map(s => ({ id: s.id, name: s.name, required: s.required, requiredOverGuests: s.requiredOverGuests })) })) }) }
  /* ---------------- signed in ---------------- */
  if (!u) return J({ error: "Sign in to continue" }, 401);
  if (p === "/api/p/checkin" && req.method === "POST") {
    const evId = String(b.event || ""); let t = null; if (b.token) t = await one(D, "SELECT * FROM tickets WHERE token = ?", String(b.token).replace(/^.*#t\//, "")); else if (b.code) t = await one(D, "SELECT * FROM tickets WHERE event_id = ? AND code = ?", evId, String(b.code).toUpperCase().replace(/[^A-Z0-9]/g, ""));
    if (!t) return J({ result: "not_found", message: "No ticket with that code" });
    if (!(await canStaff(C, t.event_id))) return J({ error: "You aren't on the door team for this event" }, 403);
    const log = r => run(D, "INSERT INTO checkins (ticket_id, event_id, at, by, result) VALUES (?,?,?,?,?)", t.id, t.event_id, now(), u.uid, r);
    if (evId && t.event_id !== evId) { await log("wrong_event"); return J({ result: "wrong_event", message: "This ticket is for a different event" }) }
    if (t.status !== "valid") { await log("void"); return J({ result: "void", message: "This ticket was refunded or canceled", attendee: t.attendee }) }
    const r = await run(D, "UPDATE tickets SET checked_in_at = ?, checked_in_by = ? WHERE id = ? AND status = 'valid' AND checked_in_at IS NULL", now(), u.uid, t.id);
    if (!(r.meta && r.meta.changes === 1)) { const t2 = await one(D, "SELECT checked_in_at FROM tickets WHERE id = ?", t.id); await log("duplicate"); return J({ result: "duplicate", message: "Already checked in", at: t2.checked_in_at, attendee: t.attendee }) }
    await log("ok"); const y = await one(D, "SELECT name FROM ticket_types WHERE id = ?", t.ticket_type_id); const st = await one(D, "SELECT COUNT(*) AS n FROM tickets WHERE event_id = ? AND checked_in_at IS NOT NULL", t.event_id);
    return J({ result: "ok", message: "Admitted", attendee: t.attendee, type: y && y.name, admitted: st.n });
  }
  if (p === "/api/p/checkin/stats") { const id = url.searchParams.get("event") || ""; if (!(await canStaff(C, id))) return J({ error: "Not allowed" }, 403); const e = await one(D, "SELECT id, title, start, capacity FROM events WHERE id = ?", id); const s = await one(D, "SELECT COUNT(*) AS sold, SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS inn, SUM(CASE WHEN status != 'valid' THEN 1 ELSE 0 END) AS void FROM tickets WHERE event_id = ?", id); const H = await all(D, "SELECT c.at, c.result, t.attendee, t.code FROM checkins c LEFT JOIN tickets t ON t.id = c.ticket_id WHERE c.event_id = ? ORDER BY c.id DESC LIMIT 30", id); return J({ event: e, sold: s.sold || 0, admitted: s.inn || 0, void: s.void || 0, history: H }) }
  if (p === "/api/p/checkin/search") { const id = url.searchParams.get("event") || ""; if (!(await canStaff(C, id))) return J({ error: "Not allowed" }, 403); const qq = "%" + String(url.searchParams.get("q") || "").toLowerCase().slice(0, 40) + "%"; return J({ tickets: await all(D, "SELECT t.code, t.attendee, t.status, t.checked_in_at, o.email, o.name FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.event_id = ? AND (lower(t.attendee) LIKE ? OR lower(o.email) LIKE ? OR lower(o.name) LIKE ? OR lower(t.code) LIKE ?) LIMIT 25", id, qq, qq, qq, qq) }) }
  /* ---------------- host ---------------- */
  const H = await one(D, "SELECT id, uid, slug, name, bio, photo_key, location, socials, status, verified, official, grooveville FROM hosts WHERE uid = ?", u.uid);
  if (p === "/api/p/host/me") {
    if (!H) return J({ host: null });
    const E = await all(D, "SELECT e.*, l.name AS lname, eo.organization_id FROM events e LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN event_organizations eo ON eo.event_id = e.id WHERE e.host_id = ? ORDER BY e.start DESC", H.id);
    const sales = await all(D, "SELECT event_id, SUM(qty) AS tickets, SUM(total_cents) AS gross, SUM(refunded_cents) AS refunds FROM orders WHERE event_id IN (SELECT id FROM events WHERE host_id = ?) AND status IN ('paid','partially_refunded','refunded','disputed') GROUP BY event_id", H.id);
    const A = await all(D, "SELECT * FROM event_agreements WHERE host_id = ? ORDER BY created DESC", H.id), V = await one(D, "SELECT status, decision_note, created, decided_at FROM host_verifications WHERE host_id = ? ORDER BY created DESC LIMIT 1", H.id);
    const ch = await all(D, "SELECT id, kind, description, amount_cents, paid_cents, status, due_date, request_id FROM charges WHERE uid = ? AND kind IN ('venue_rental','deposit') AND status != 'void'", u.uid);
    const G = await all(D, "SELECT id, key, caption, event_id FROM host_gallery WHERE host_id = ? ORDER BY created DESC", H.id);
    const organizations = await all(D, "SELECT * FROM host_organizations WHERE host_id = ? ORDER BY name", H.id);
    return J({ organizations: organizations.map(orgCard), host: Object.assign({}, H, { socials: pj(H.socials, {}) }), events: E.map(e => Object.assign(e, { services: pj(e.services, []), password_hash: undefined, sales: sales.find(s => s.event_id === e.id) || null, agreement: A.find(a => a.event_id === e.id && a.status !== "void" && a.status !== "amended") || null })), verification: V, charges: ch, gallery: G });
  }
  if (p === "/api/p/host/profile" && req.method === "POST") {
    const name = clean(b.name, 80); if (name.length < 2) return J({ error: "Add your host name" }, 400); let slug = slugify(b.slug || name); if (slug.length < 3) return J({ error: "Choose a longer profile address" }, 400);
    const taken = await one(D, "SELECT uid FROM hosts WHERE slug = ?", slug); if (taken && taken.uid !== u.uid) return J({ error: "That profile address is taken" }, 409);
    let photo = H?.photo_key || "";
    if (b.photo_key) {
      if (!await ownedPublicPhoto(env, b.photo_key, u.uid)) return J({ error: "Photo not found" }, 404);
      photo = b.photo_key;
    } else if (b.use_account_photo === true) {
      const saved = await one(D, "SELECT key FROM account_photos WHERE uid = ?", u.uid);
      const original = saved && await env.STUDIO_BUCKET.get(saved.key);
      if (!original) return J({ error: "Add an account photo first" }, 400);
      photo = "portal/pub/" + u.uid.slice(0, 12) + "/" + rid(16) + "." + saved.key.split(".").pop();
      await env.STUDIO_BUCKET.put(photo, original.body, { httpMetadata: original.httpMetadata, customMetadata: { by: u.uid, purpose: "pub" } });
    }
    const so = {}; for (const k of ["instagram", "tiktok", "x", "facebook", "youtube", "website"]) { const v = clean((b.socials || {})[k], 200); if (v && /^https:\/\//.test(v)) so[k] = v }
    if (H) await run(D, "UPDATE hosts SET name = ?, slug = ?, bio = ?, photo_key = ?, location = ?, socials = ?, updated = ? WHERE id = ?", name, slug, clean(b.bio, 3000), photo, clean(b.location, 120), JSON.stringify(so), now(), H.id);
    else await run(D, "INSERT INTO hosts (id, uid, slug, name, bio, photo_key, location, socials, status, created, updated) VALUES (?,?,?,?,?,?,?,?,'active',?,?)", rid(12), u.uid, slug, name, clean(b.bio, 3000), photo, clean(b.location, 120), JSON.stringify(so), now(), now());
    await audit(D, u.uid, H ? "host_updated" : "host_created", "host", slug, {}); return J({ ok: true, slug });
  }
  if (!H) return J({ error: "Create your host profile first", code: "nohost" }, 400);
  if (H.status !== "active") return J({ error: "This host account is suspended. Contact Grooveville." }, 403);
  if (p === "/api/p/host/organizations" && req.method === "POST") {
    const id = clean(b.id, 40), name = clean(b.name, 80);
    const org = id ? await one(D, "SELECT * FROM host_organizations WHERE id = ? AND host_id = ?", id, H.id) : null;
    if (id && !org) return J({ error: "Organization not found" }, 404);
    const slug = slugify(b.slug || org?.slug || name);
    if (name.length < 2 || slug.length < 3) return J({ error: "Enter an organization name and an address of at least 3 characters" }, 400);
    const accent = /^#[0-9a-f]{6}$/i.test(b.accent) ? b.accent : "#f1ae8a";
    if (b.photo && !await ownedPublicPhoto(env, b.photo, u.uid)) return J({ error: "Photo not found" }, 404);
    const saved = org ? await run(D, "UPDATE OR IGNORE host_organizations SET slug=?, name=?, bio=?, photo_key=?, accent=?, updated=? WHERE id=? AND host_id=?", slug, name, clean(b.bio, 3000), b.photo || org.photo_key, accent, now(), id, H.id)
      : await run(D, "INSERT OR IGNORE INTO host_organizations (id, host_id, slug, name, bio, photo_key, accent, created, updated) VALUES (?,?,?,?,?,?,?,?,?)", rid(12), H.id, slug, name, clean(b.bio, 3000), b.photo || "", accent, now(), now());
    if (!saved.meta.changes) return J({ error: "That organization address is taken" }, 409);
    return J({ ok: true, slug });
  }
  if (p === "/api/p/host/verify" && req.method === "POST") {
    if (H.verified) return J({ error: "You're already verified" }, 400); const pend = await one(D, "SELECT id FROM host_verifications WHERE host_id = ? AND status = 'submitted'", H.id); if (pend) return J({ error: "Your request is already being reviewed" }, 409);
    const keys = (b.doc_keys || []).map(String).filter(k => k.startsWith("portal/priv/verification/" + u.uid.slice(0, 12) + "/")).slice(0, 5); if (!keys.length) return J({ error: "Upload a photo ID or business document" }, 400);
    const legal = clean(b.legal_name, 120); if (legal.length < 3) return J({ error: "Enter your legal name" }, 400);
    await run(D, "INSERT INTO host_verifications (id, host_id, status, legal_name, business_name, doc_keys, note, created) VALUES (?,?,?,?,?,?,?,?)", rid(12), H.id, "submitted", legal, clean(b.business_name, 160), JSON.stringify(keys), clean(b.note, 1000), now());
    await audit(D, u.uid, "verification_submitted", "host", H.id, {}); for (const a of await adminUids(D)) await notify(env, D, a, "verification", "Host verification request", H.name, "#team-portals/hosts"); return J({ ok: true });
  }
  if (p === "/api/p/host/gallery" && req.method === "POST") { if (b.remove) { await run(D, "DELETE FROM host_gallery WHERE id = ? AND host_id = ?", String(b.remove), H.id); return J({ ok: true }) } const k = String(b.key || ""); if (!/^portal\/pub\//.test(k)) return J({ error: "Upload a photo" }, 400); await run(D, "INSERT INTO host_gallery (id, host_id, event_id, key, caption, created) VALUES (?,?,?,?,?,?)", rid(12), H.id, clean(b.event_id, 20), k, clean(b.caption, 200), now()); return J({ ok: true }) }
  if (p === "/api/p/host/event/save" && req.method === "POST") {
    let e = b.id ? await ownEvent(C, b.id) : null; if (b.id && !e) return J({ error: "Event not found" }, 404);
    if (e && !["draft", "rejected", "submitted", "approved", "published"].includes(e.status)) return J({ error: "This event can't be edited now" }, 409);
    const orgId = clean(b.organization_id, 40);
    if (orgId && !await one(D, "SELECT 1 AS owned FROM host_organizations WHERE id = ? AND host_id = ?", orgId, H.id)) return J({ error: "Choose an organization from your host profile" }, 400);
    const ag = e ? await one(D, "SELECT * FROM event_agreements WHERE event_id = ? AND status NOT IN ('void','amended') ORDER BY created DESC LIMIT 1", e.id) : null;
    const f = { title: clean(b.title, 120), description: clean(b.description, 6000), flyer_key: /^portal\/pub\//.test(String(b.flyer_key || "")) ? b.flyer_key : (e ? e.flyer_key : ""), category: clean(b.category, 40), location_id: clean(b.location_id, 20) || null, venue_name: clean(b.venue_name, 120), venue_address: clean(b.venue_address, 200), start: String(b.start || "").slice(0, 16), end: String(b.end || "").slice(0, 16), sales_open: String(b.sales_open || "").slice(0, 16) || null, sales_close: String(b.sales_close || "").slice(0, 16) || null, capacity: Math.max(0, Math.round(Number(b.capacity) || 0)), expected: Math.max(0, Math.round(Number(b.expected) || 0)), age: clean(b.age, 40), refund_policy: clean(b.refund_policy, 1500), visibility: ["public", "unlisted", "private", "password"].includes(b.visibility) ? b.visibility : "public", contact: clean(b.contact, 200), services: JSON.stringify((b.services || []).map(String).slice(0, 20)), setup_hours: Math.max(0, Math.min(24, Math.round(Number(b.setup_hours) || 0))), breakdown_hours: Math.max(0, Math.min(24, Math.round(Number(b.breakdown_hours) || 0))) };
    if (f.title.length < 3) return J({ error: "Add an event title" }, 400); if (!isDT(f.start) || !isDT(f.end) || f.end <= f.start) return J({ error: "Add a start and end time" }, 400);
    if (f.sales_close && f.sales_close > f.end) return J({ error: "Ticket sales must close before the event ends" }, 400); if (f.sales_open && f.sales_close && f.sales_open >= f.sales_close) return J({ error: "Sales must open before they close" }, 400);
    let loc = null; if (f.location_id) { loc = await one(D, "SELECT * FROM locations WHERE id = ? AND status = 'active'", f.location_id); if (!loc) return J({ error: "Pick a location" }, 400); if (loc.capacity && f.capacity > loc.capacity) return J({ error: "Capacity can't exceed the location's permitted capacity (" + loc.capacity + ")" }, 400) } else if (f.venue_name.length < 2 || f.venue_address.length < 5) return J({ error: "Pick a location, or enter the venue name and address" }, 400);
    if (!f.capacity) return J({ error: "Set the maximum attendance" }, 400); if (f.expected > f.capacity) f.expected = f.capacity; if (!f.expected) f.expected = f.capacity;
    if (ag && ["accepted", "sent", "signed"].includes(ag.status) && e) { const changed = MATERIAL.filter(k => String(e[k] == null ? "" : e[k]) !== String(f[k] == null ? "" : f[k])); if (changed.length) { if (ag.status === "accepted") { await run(D, "UPDATE event_agreements SET status = 'void' WHERE id = ?", ag.id); await run(D, "UPDATE events SET arrangement = NULL, agreement_id = NULL WHERE id = ?", e.id) } else return J({ error: "This change affects the signed agreement (" + changed.join(", ") + "). Ask Grooveville for an amendment.", code: "amendment" }, 409) } }
    let pwh = e ? e.password_hash : null; if (f.visibility === "password" && b.password) { const salt = rid(8); pwh = salt + ":" + (await pwHash(salt, String(b.password))) } if (f.visibility === "password" && !pwh) return J({ error: "Set an event password" }, 400);
    const invite = f.visibility === "private" ? (e && e.invite_code) || rid(10) : null;
    if (!e) { let slug = slugify(b.slug || f.title), n = 1; while (await one(D, "SELECT 1 AS x FROM events WHERE slug = ?", slug)) slug = slugify(b.slug || f.title).slice(0, 52) + "-" + (++n); const id = rid(12);
      await run(D, "INSERT INTO events (id, slug, host_id, location_id, venue_name, venue_address, title, description, flyer_key, category, start, end, sales_open, sales_close, capacity, expected, age, refund_policy, visibility, password_hash, invite_code, contact, services, setup_hours, breakdown_hours, status, venue_authorized, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id, slug, H.id, f.location_id, f.venue_name, f.venue_address, f.title, f.description, f.flyer_key, f.category, f.start, f.end, f.sales_open, f.sales_close, f.capacity, f.expected, f.age, f.refund_policy, f.visibility, pwh, invite, f.contact, f.services, f.setup_hours, f.breakdown_hours, "draft", loc && loc.category === "owned" && loc.authorization === "authorized" ? 1 : 0, now(), now()); e = await one(D, "SELECT * FROM events WHERE id = ?", id) }
    else { if (f.capacity < e.reserved) return J({ error: "Capacity can't go below tickets already sold (" + e.reserved + ")" }, 400); await run(D, "UPDATE events SET location_id=?, venue_name=?, venue_address=?, title=?, description=?, flyer_key=?, category=?, start=?, end=?, sales_open=?, sales_close=?, capacity=?, expected=?, age=?, refund_policy=?, visibility=?, password_hash=?, invite_code=?, contact=?, services=?, setup_hours=?, breakdown_hours=?, updated=? WHERE id = ?", f.location_id, f.venue_name, f.venue_address, f.title, f.description, f.flyer_key, f.category, f.start, f.end, f.sales_open, f.sales_close, f.capacity, f.expected, f.age, f.refund_policy, f.visibility, pwh, invite, f.contact, f.services, f.setup_hours, f.breakdown_hours, now(), e.id) }
    /* ticket types: price/qty changes allowed only while nothing is sold for that type */
    const old = await all(D, "SELECT * FROM ticket_types WHERE event_id = ?", e.id), keep = new Set();
    for (const [i, t] of (b.tickets || []).slice(0, 12).entries()) { const name = clean(t.name, 60), price = Math.max(0, Math.round(Number(t.price_cents) || 0)), qty = Math.max(1, Math.round(Number(t.qty) || 0)), mpo = Math.max(1, Math.min(20, Math.round(Number(t.max_per_order) || 10))); if (!name) continue;
      const ex = old.find(x => x.id === t.id); if (ex) { keep.add(ex.id); if (ex.sold + ex.held > 0 && price !== ex.price_cents) return J({ error: "“" + ex.name + "” has sales; its price can't change. Add a new ticket type instead." }, 409); if (qty < ex.sold + ex.held) return J({ error: "“" + ex.name + "” quantity can't go below " + (ex.sold + ex.held) }, 409); await run(D, "UPDATE ticket_types SET name=?, price_cents=?, qty=?, max_per_order=?, sales_start=?, sales_end=?, ord=?, status='active' WHERE id = ?", name, price, qty, mpo, String(t.sales_start || "").slice(0, 16) || null, String(t.sales_end || "").slice(0, 16) || null, i, ex.id) }
      else await run(D, "INSERT INTO ticket_types (id, event_id, name, price_cents, qty, max_per_order, sales_start, sales_end, ord) VALUES (?,?,?,?,?,?,?,?,?)", rid(10), e.id, name, price, qty, mpo, String(t.sales_start || "").slice(0, 16) || null, String(t.sales_end || "").slice(0, 16) || null, i) }
    for (const x of old) if (!keep.has(x.id)) { if (x.sold + x.held > 0) await run(D, "UPDATE ticket_types SET status = 'closed' WHERE id = ?", x.id); else await run(D, "DELETE FROM ticket_types WHERE id = ?", x.id) }
    for (const pc of (b.promos || []).slice(0, 20)) { const code = String(pc.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30); if (!code) continue; await run(D, "INSERT INTO promo_codes (id, event_id, code, kind, value, max_uses, expires) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_id, code) DO UPDATE SET kind = excluded.kind, value = excluded.value, max_uses = excluded.max_uses, expires = excluded.expires", rid(10), e.id, code, pc.kind === "amount" ? "amount" : "pct", Math.max(0, Math.round(Number(pc.value) || 0)), Math.max(0, Math.round(Number(pc.max_uses) || 0)), String(pc.expires || "").slice(0, 16) || null) }
    if ("organization_id" in b) {
      if (orgId) await run(D, "INSERT INTO event_organizations (event_id, organization_id) SELECT id, ? FROM events WHERE id = ? AND host_id = ? ON CONFLICT(event_id) DO UPDATE SET organization_id = excluded.organization_id", orgId, e.id, H.id);
      else await run(D, "DELETE FROM event_organizations WHERE event_id IN (SELECT id FROM events WHERE id = ? AND host_id = ?)", e.id, H.id);
    }
    return J({ ok: true, id: e.id, slug: e.slug, invite });
  }
  if (p === "/api/p/host/event/quote" && req.method === "POST") {
    const e = await ownEvent(C, b.id); if (!e) return J({ error: "Event not found" }, 404);
    if (H.grooveville) return J({ owned: true, offers: [{ arrangement: "owned", label: "Grooveville event", note: "Grooveville's own event: no rental or revenue share." }], errors: [] });
    if (!e.location_id) return J({ location: null, category: "external", errors: [], offers: [{ arrangement: "ticketing", label: "Ticketing only", platformFee: { feeBps: S.platform_fee_bps || 0, perTicketCents: S.platform_fee_cents || 0 }, lines: [{ label: "Grooveville ticketing fee", value: ((S.platform_fee_bps || 0) / 100) + "% of ticket sales" }], note: "No property rental: Grooveville doesn't own or rent this venue." }] });
    const loc = await one(D, "SELECT * FROM locations WHERE id = ?", e.location_id); return J(quote(loc, { expected: e.expected, start: e.start, end: e.end, services: pj(e.services, []), setupHours: e.setup_hours, breakdownHours: e.breakdown_hours }));
  }
  if (p === "/api/p/host/event/accept" && req.method === "POST") {
    const e = await ownEvent(C, b.id); if (!e) return J({ error: "Event not found" }, 404); if (!["draft", "rejected"].includes(e.status)) return J({ error: "Terms can only be chosen before the event is submitted" }, 409);
    if (b.agree !== true) return J({ error: "Confirm you've read the terms" }, 400);
    const ex = await one(D, "SELECT * FROM event_agreements WHERE event_id = ? AND status IN ('sent','signed')", e.id); if (ex) return J({ error: "This event already has a signed agreement. Ask Grooveville for an amendment." }, 409);
    let offer, loc = null;
    if (H.grooveville) offer = { arrangement: "owned" };
    else if (!e.location_id) offer = { arrangement: "ticketing", lines: [] };
    else { loc = await one(D, "SELECT * FROM locations WHERE id = ?", e.location_id); const Q = quote(loc, { expected: e.expected, start: e.start, end: e.end, services: pj(e.services, []), setupHours: e.setup_hours, breakdownHours: e.breakdown_hours }); if (Q.errors.length) return J({ error: Q.errors[0] }, 400); offer = Q.offers.find(o => o.arrangement === b.arrangement); if (!offer) return J({ error: "That option isn't available for this event" }, 400) }
    const terms = await termsFor(D, S, e, H, offer, loc), th = await sha256(JSON.stringify(terms)), id = rid(12);
    await run(D, "UPDATE event_agreements SET status = 'void' WHERE event_id = ? AND status = 'accepted'", e.id);
    await run(D, "INSERT INTO event_agreements (id, event_id, host_id, arrangement, terms, terms_hash, quote, status, accepted_at, created) VALUES (?,?,?,?,?,?,?,?,?,?)", id, e.id, H.id, offer.arrangement, JSON.stringify(terms), th, JSON.stringify(offer), H.grooveville ? "signed" : "accepted", now(), now());
    await run(D, "UPDATE events SET arrangement = ?, agreement_id = ? WHERE id = ?", offer.arrangement, id, e.id); await audit(D, u.uid, "terms_accepted", "event", e.id, { arrangement: offer.arrangement, terms_hash: th });
    return J({ ok: true, agreement: id, terms_hash: th });
  }
  if (p === "/api/p/host/event/submit" && req.method === "POST") {
    const e = await ownEvent(C, b.id); if (!e) return J({ error: "Event not found" }, 404); if (!["draft", "rejected"].includes(e.status)) return J({ error: "Already submitted" }, 409);
    if (!(await one(D, "SELECT 1 AS x FROM ticket_types WHERE event_id = ? AND status = 'active'", e.id))) return J({ error: "Add at least one ticket type" }, 400);
    if (!e.agreement_id) return J({ error: "Choose your pricing option first" }, 400);
    if (!e.location_id && b.venueAuthorized !== true) return J({ error: "Confirm you're authorized to hold this event at the venue" }, 400);
    await run(D, "UPDATE events SET status = ?, venue_authorized = CASE WHEN location_id IS NULL THEN ? ELSE venue_authorized END, updated = ? WHERE id = ?", H.grooveville ? "approved" : "submitted", b.venueAuthorized === true ? 1 : 0, now(), e.id);
    await audit(D, u.uid, "event_submitted", "event", e.id, {}); if (!H.grooveville) for (const a of await adminUids(D)) await notify(env, D, a, "event_review", "Event submitted for approval", e.title, "#team-portals/events");
    return J({ ok: true, status: H.grooveville ? "approved" : "submitted" });
  }
  if (p === "/api/p/host/event/publish" && req.method === "POST") {
    const e = await ownEvent(C, b.id); if (!e) return J({ error: "Event not found" }, 404); if (e.status !== "approved") return J({ error: "Grooveville needs to approve the event first" }, 409);
    const ag = await one(D, "SELECT * FROM event_agreements WHERE id = ?", e.agreement_id || ""); if (!ag || ag.status !== "signed") return J({ error: "The event agreement must be signed by both parties first" }, 409);
    if (!e.venue_authorized) return J({ error: "Venue authorization hasn't been confirmed yet" }, 409);
    if (ag.rental_charge_id) { const ch = await all(D, "SELECT * FROM charges WHERE request_id = ? AND kind IN ('venue_rental','deposit') AND status != 'void'", "ag:" + ag.id); if (ch.some(c => c.paid_cents < c.amount_cents)) return J({ error: "Pay the venue rental (and deposit) first", code: "rental" }, 409) }
    await run(D, "UPDATE events SET status = 'published', updated = ? WHERE id = ?", now(), e.id); await audit(D, u.uid, "event_published", "event", e.id, {}); return J({ ok: true, url: "/entertainment/events/" + e.slug, invite: e.invite_code });
  }
  if (p === "/api/p/host/event/close" && req.method === "POST") { const e = await ownEvent(C, b.id); if (!e || e.status !== "published") return J({ error: "Only published events can close sales" }, 409); await run(D, "UPDATE events SET status = 'sales_closed', updated = ? WHERE id = ?", now(), e.id); await audit(D, u.uid, "sales_closed", "event", e.id, {}); return J({ ok: true }) }
  if (p === "/api/p/host/event/guests") { const e = await ownEvent(C, url.searchParams.get("id")); if (!e) return J({ error: "Not found" }, 404); const id = url.searchParams.get("id");
    return J({ orders: await all(D, "SELECT id, name, email, qty, total_cents, refunded_cents, status, created, paid_at, promo FROM orders WHERE event_id = ? AND status != 'pending' ORDER BY created DESC", id), tickets: await all(D, "SELECT t.code, t.attendee, t.status, t.checked_in_at, y.name AS type, o.email FROM tickets t JOIN orders o ON o.id = t.order_id LEFT JOIN ticket_types y ON y.id = t.ticket_type_id WHERE t.event_id = ? ORDER BY t.attendee", id), staff: await all(D, "SELECT uid, email FROM event_staff WHERE event_id = ?", id), promos: await all(D, "SELECT code, kind, value, max_uses, used, expires FROM promo_codes WHERE event_id = ?", id), types: await all(D, "SELECT * FROM ticket_types WHERE event_id = ? ORDER BY ord", id) }) }
  if (p === "/api/p/host/event/staff" && req.method === "POST") { const e = await ownEvent(C, b.id); if (!e) return J({ error: "Event not found" }, 404); if (b.remove) { await run(D, "DELETE FROM event_staff WHERE event_id = ? AND uid = ?", e.id, String(b.remove)); return J({ ok: true }) } const pr = await one(D, "SELECT uid, email FROM profiles WHERE lower(email) = lower(?)", clean(b.email, 200)); if (!pr) return J({ error: "That person needs to sign in to Grooveville once first" }, 404); await run(D, "INSERT OR IGNORE INTO event_staff (event_id, uid, email) VALUES (?,?,?)", e.id, pr.uid, pr.email); await notify(env, D, pr.uid, "staff", "You're on the door team", e.title, "#checkin/" + e.id); return J({ ok: true }) }
  return J({ error: "Not found" }, 404);
}
export async function entCron(env, D, S, fetcher) {
  const ln = localNow(TZ(S));
  for (const o of await all(D, "SELECT * FROM orders WHERE status = 'pending' AND hold_expires < ? LIMIT 100", Date.now() - 4 * 60000)) {
    if (o.stripe_session) { const s = await stripe(env, "GET", "checkout/sessions/" + o.stripe_session, { expand: ["payment_intent.latest_charge.balance_transaction"] }, { fetcher }).catch(() => null); if (s && s.payment_status === "paid") continue; if (s && s.status === "open") { await stripe(env, "POST", "checkout/sessions/" + o.stripe_session + "/expire", {}, { fetcher }).catch(() => null) } }
    await releaseOrder(D, o, "expired");
  }
  await run(D, "UPDATE events SET status = 'sales_closed', updated = ? WHERE status = 'published' AND sales_close IS NOT NULL AND sales_close <= ?", now(), ln);
  await run(D, "UPDATE events SET status = 'completed', updated = ? WHERE status IN ('published','sales_closed') AND end <= ?", now(), ln);
  for (const v of await all(D, "SELECT * FROM host_verifications WHERE purge_after IS NOT NULL AND purge_after < ? AND doc_keys != '[]' LIMIT 50", now())) { for (const k of pj(v.doc_keys, [])) await env.STUDIO_BUCKET.delete(k).catch(() => { }); await run(D, "UPDATE host_verifications SET doc_keys = '[]' WHERE id = ?", v.id); await audit(D, "system", "verification_docs_purged", "host", v.host_id, {}) }
}
