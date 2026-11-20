/* Grooveville Rentals: listings, requests with conflict-free reservations, payment plans and charges.
   Each charge says exactly what it is for (rent, deposit, equipment, service…) and who the legal payee is. */
import { J, one, all, run, now, rid, pj, clean, isDate, isDT, bpsOf, audit, notify, signLink } from "./core.js";
const UNITS = ["hour", "day", "week", "month", "flat"];
const DAY = 864e5;
export function rentalQuote(L, start, end, qty) {
  const errs = []; qty = Math.max(1, Math.round(Number(qty) || 1));
  const s = Date.parse(String(start).length === 10 ? start + "T00:00:00Z" : start + "Z"), e = Date.parse(String(end).length === 10 ? end + "T00:00:00Z" : end + "Z");
  if (!(s && e && e > s)) errs.push("Pick a start and an end after it");
  if (qty > (L.qty || 1)) errs.push("Only " + (L.qty || 1) + " available");
  let units = 1; const span = e - s;
  if (L.unit === "hour") units = Math.ceil(span / 36e5); else if (L.unit === "day") units = Math.max(1, Math.ceil(span / DAY)); else if (L.unit === "week") units = Math.max(1, Math.ceil(span / (7 * DAY))); else if (L.unit === "month") units = Math.max(1, Math.ceil(span / (30 * DAY)));
  if (L.min_units && units < L.min_units) errs.push("Minimum rental is " + L.min_units + " " + L.unit + "(s)"); if (L.max_units && units > L.max_units) errs.push("Maximum rental is " + L.max_units + " " + L.unit + "(s)");
  const sub = L.price_cents * units * qty, tax = bpsOf(sub, L.tax_bps || 0), extras = pj(L.extras, []).filter(x => x.required).reduce((a, x) => a + (x.cents | 0), 0) * qty, dep = (L.deposit_cents || 0) * qty;
  return { errors: errs, units, unit: L.unit, qty, subtotal: sub, tax, extras, total: sub + tax + extras, deposit: dep, lines: [{ label: L.name + " × " + qty + " · " + units + " " + L.unit + (units > 1 ? "s" : ""), cents: sub }].concat(extras ? [{ label: "Required add-ons", cents: extras }] : [], tax ? [{ label: "Tax", cents: tax }] : []) };
}
const pubListing = L => ({ id: L.id, name: L.name, description: L.description, category: L.category, photos: pj(L.photos, []), location: L.location, price_cents: L.price_cents, unit: L.unit, deposit_cents: L.deposit_cents, min_units: L.min_units, max_units: L.max_units, qty: L.qty, eligibility: L.eligibility, tax_bps: L.tax_bps, cancel_policy: L.cancel_policy, extras: pj(L.extras, []), vehicle: !!L.vehicle, available: !L.vehicle || !!L.vehicle_ready });
export async function reserve(D, L, reqId, start, end, qty, status) {
  const id = rid(12);
  const r = await D.prepare("INSERT INTO reservations (id, listing_id, request_id, start, end, qty, status) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(qty),0) FROM reservations WHERE listing_id = ? AND status IN ('hold','confirmed') AND start < ? AND ? < end) + ? <= ?")
    .bind(id, L.id, reqId, start, end, qty, status, L.id, end, start, qty, L.qty || 1).run();
  return r.meta && r.meta.changes === 1;
}
export async function rentalsApi(C) {
  const { D, S, u, b, p, url, env } = C;
  const open = S.rentals_open || (u && u.tester);
  if (p === "/api/p/rentals/listings") { if (!open) return J({ closed: true, listings: [] }); return J({ listings: (await all(D, "SELECT * FROM listings WHERE status = 'active' ORDER BY category, name")).map(pubListing) }) }
  if (p === "/api/p/rentals/availability") { const L = await one(D, "SELECT id, qty FROM listings WHERE id = ? AND status = 'active'", url.searchParams.get("id") || ""); if (!L) return J({ error: "Not found" }, 404); const R = await all(D, "SELECT start, end, qty FROM reservations WHERE listing_id = ? AND status IN ('hold','confirmed') AND end > ? ORDER BY start", L.id, new Date().toISOString().slice(0, 10)); return J({ qty: L.qty, booked: R }) }
  if (p === "/api/p/rentals/quote" && C.req.method === "POST") { const L = await one(D, "SELECT * FROM listings WHERE id = ? AND status = 'active'", String(b.listing || "")); if (!L) return J({ error: "That item isn't available" }, 404); return J(rentalQuote(L, b.start, b.end, b.qty)) }
  if (!u) return J({ error: "Sign in to continue" }, 401);
  if (p === "/api/p/rentals/me") {
    const reqs = await all(D, "SELECT r.*, l.name AS listing_name, l.category FROM rental_requests r LEFT JOIN listings l ON l.id = r.listing_id WHERE r.uid = ? ORDER BY r.created DESC", u.uid);
    const plans = await all(D, "SELECT * FROM plans WHERE uid = ? ORDER BY created DESC", u.uid);
    const charges = await all(D, "SELECT id, plan_id, request_id, kind, description, amount_cents, due_date, status, paid_cents, refunded_cents, paid_at, receipt_no, payee, landlord FROM charges WHERE uid = ? AND status != 'void' ORDER BY due_date DESC LIMIT 200", u.uid);
    const docs = await all(D, "SELECT d.id, d.title, d.status, d.division, d.completed_at, d.sent_at, s.status AS my_status, s.role AS my_role FROM doc_signers s JOIN documents d ON d.id = s.doc_id WHERE s.uid = ? AND d.status != 'draft' ORDER BY d.sent_at DESC", u.uid);
    const open_ = charges.filter(c => c.status === "open" || c.status === "failed"), balance = open_.reduce((a, c) => a + c.amount_cents - c.paid_cents, 0), next = open_.filter(c => c.due_date).sort((a, c) => a.due_date.localeCompare(c.due_date))[0] || null;
    return J({ open: !!open, requests: reqs.map(r => Object.assign(r, { quote: pj(r.quote, null) })), plans, charges, docs, balance, next, payments: charges.filter(c => c.paid_cents > 0) });
  }
  if (p === "/api/p/rentals/request" && C.req.method === "POST") {
    if (!open) return J({ error: "Rental requests open soon." }, 403);
    const pr = await one(D, "SELECT first, last FROM profiles WHERE uid = ?", u.uid); if (!pr || !pr.first || !pr.last) return J({ error: "Add your legal name in Profile & Settings first", code: "profile" }, 400);
    const L = await one(D, "SELECT * FROM listings WHERE id = ? AND status = 'active'", String(b.listing || "")); if (!L) return J({ error: "That item isn't available" }, 404);
    if (L.vehicle && !L.vehicle_ready) return J({ error: "Vehicle rentals aren't open yet." }, 403);
    const start = String(b.start || ""), end = String(b.end || ""); if (!(isDate(start) || isDT(start)) || !(isDate(end) || isDT(end))) return J({ error: "Pick dates" }, 400);
    if (start.slice(0, 10) < new Date().toISOString().slice(0, 10)) return J({ error: "Pick a start date from today on" }, 400);
    const Q = rentalQuote(L, start, end, b.qty); if (Q.errors.length) return J({ error: Q.errors[0] }, 400);
    const info = { license: "", insurance: "" }; if (L.vehicle) { for (const k of ["license", "insurance"]) { const key = String(b[k + "_key"] || ""); if (!new RegExp("^portal/priv/license/" + u.uid.slice(0, 12) + "/").test(key)) return J({ error: "Upload your driver's license and proof of insurance" }, 400); info[k] = key } }
    const id = rid(12); if (!(await reserve(D, L, id, start, end, Q.qty, "hold"))) return J({ error: "Those dates are already booked. Pick different dates.", code: "conflict" }, 409);
    await run(D, "INSERT INTO rental_requests (id, uid, listing_id, start, end, units, qty, quote, total_cents, deposit_cents, note, info, status, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", id, u.uid, L.id, start, end, Q.units, Q.qty, JSON.stringify(Q), Q.total, Q.deposit, clean(b.note, 1000), JSON.stringify(info), "submitted", now(), now());
    await audit(D, u.uid, "rental_requested", "rental_request", id, { listing: L.id, start, end, total: Q.total });
    for (const a of await adminUids(D)) await notify(env, D, a, "rental_request", "New rental request", L.name + " · " + start.slice(0, 10) + " → " + end.slice(0, 10), "#team-portals/rentals");
    return J({ ok: true, id, quote: Q });
  }
  if (p === "/api/p/rentals/request/cancel" && C.req.method === "POST") {
    const r = await one(D, "SELECT * FROM rental_requests WHERE id = ? AND uid = ?", String(b.id || ""), u.uid); if (!r) return J({ error: "Not found" }, 404); if (!["submitted", "info_needed"].includes(r.status)) return J({ error: "Approved rentals can only be changed by Grooveville. Send a message instead." }, 400);
    await run(D, "UPDATE rental_requests SET status = 'canceled', updated = ? WHERE id = ?", now(), r.id); await run(D, "UPDATE reservations SET status = 'released' WHERE request_id = ?", r.id); await audit(D, u.uid, "rental_request_canceled", "rental_request", r.id, {}); return J({ ok: true });
  }
  if (p === "/api/p/rentals/request/info" && C.req.method === "POST") {
    const r = await one(D, "SELECT * FROM rental_requests WHERE id = ? AND uid = ? AND status = 'info_needed'", String(b.id || ""), u.uid); if (!r) return J({ error: "Not found" }, 404);
    await run(D, "UPDATE rental_requests SET note = ?, status = 'submitted', updated = ? WHERE id = ?", (r.note ? r.note + "\n\n" : "") + "Reply: " + clean(b.info, 1500), now(), r.id); for (const a of await adminUids(D)) await notify(env, D, a, "rental_request", "Customer replied to a rental request", "", "#team-portals/rentals"); return J({ ok: true });
  }
  if (p === "/api/p/rentals/receipt") {
    const c = await one(D, "SELECT * FROM charges WHERE id = ? AND (uid = ? OR ? = 1)", url.searchParams.get("id") || "", u.uid, u.admin ? 1 : 0); if (!c || !(c.paid_cents > 0)) return J({ error: "No receipt for that" }, 404);
    const pr = await one(D, "SELECT first, middle, last, email FROM profiles WHERE uid = ?", c.uid); return J({ receipt: { no: c.receipt_no, paid_at: c.paid_at, description: c.description, kind: c.kind, amount: c.paid_cents, refunded: c.refunded_cents, payee: c.landlord || "Grooveville LLC", payee_type: c.payee, customer: pr ? [pr.first, pr.middle, pr.last].filter(Boolean).join(" ") : "", email: pr && pr.email } });
  }
  return J({ error: "Not found" }, 404);
}
export async function adminUids(D) { return (await all(D, "SELECT DISTINCT uid FROM roles WHERE role = 'admin'")).map(r => r.uid).concat((await all(D, "SELECT v FROM settings WHERE k = 'founder_uid'")).map(r => JSON.parse(r.v))).filter(Boolean) }
/* advance a date by the plan frequency */
export function nextDate(d, f) { const t = new Date(d + "T12:00:00Z"); if (f === "weekly") t.setUTCDate(t.getUTCDate() + 7); else if (f === "biweekly") t.setUTCDate(t.getUTCDate() + 14); else if (f === "monthly") { const day = t.getUTCDate(); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() + 1); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)) } else return null; return t.toISOString().slice(0, 10) }
/* daily: bill upcoming plan periods (7 days ahead), send due/overdue reminders */
export async function rentalsCron(env, D, S) {
  const today = new Date().toISOString().slice(0, 10), ahead = new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10);
  for (const pl of await all(D, "SELECT * FROM plans WHERE status = 'active' AND next_due IS NOT NULL AND next_due <= ? LIMIT 200", ahead)) {
    let due = pl.next_due, guard = 0;
    while (due && due <= ahead && (!pl.end_date || due <= pl.end_date) && guard++ < 12) {
      await run(D, "INSERT OR IGNORE INTO charges (id, uid, plan_id, request_id, kind, description, amount_cents, due_date, status, payee, landlord, income_class, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rid(12), pl.uid, pl.id, pl.request_id, pl.kind, pl.title + " · due " + due, pl.amount_cents, due, "open", pl.payee, pl.landlord, pl.income_class, now());
      await notify(env, D, pl.uid, "payment_due", "Payment scheduled", pl.title + " is due " + due, "#rentals/pay");
      due = nextDate(due, pl.frequency);
    }
    if (!due || (pl.end_date && due > pl.end_date)) await run(D, "UPDATE plans SET next_due = NULL, status = 'ended' WHERE id = ?", pl.id); else await run(D, "UPDATE plans SET next_due = ? WHERE id = ?", due, pl.id);
  }
  const soon = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
  for (const c of await all(D, "SELECT c.*, p.email FROM charges c LEFT JOIN profiles p ON p.uid = c.uid WHERE c.status IN ('open','failed') AND c.due_date <= ? AND (c.reminded IS NULL OR c.reminded < ?) LIMIT 300", soon, today)) {
    const late = c.due_date < today; await notify(env, D, c.uid, late ? "payment_overdue" : "payment_reminder", late ? "A payment is past due" : "A payment is due soon", "Sign in to Grooveville Rentals to review and pay.", "#rentals/pay", c.email);
    await run(D, "UPDATE charges SET reminded = ? WHERE id = ?", late ? "9999" : today, c.id);
  }
  await run(D, "UPDATE reservations SET status = 'released' WHERE status = 'hold' AND request_id IN (SELECT id FROM rental_requests WHERE status IN ('declined','canceled'))");
}
