/* Payments, Stripe webhooks, manual host settlements and the finance dashboard.
   Authoritative amounts are computed here on the server from database records that only Stripe webhooks
   (signature-checked, processed once per event id) can mark as paid. */
import { J, one, all, run, now, rid, pj, clean, audit, notify, stripe, fmt$ } from "./core.js";
import { businessFinance } from "./business-finance.js";
import { inviteStripeEvent } from "./invites.js";
import { settle, settlementState } from "./settle.js";
import { markOrderPaid, releaseOrder } from "./ent.js";
import { adminUids } from "./rentals.js";
async function piDetails(env, pi, fetcher) {
  if (!pi) return {}; try { const x = await stripe(env, "GET", "payment_intents/" + pi, { expand: ["latest_charge.balance_transaction"] }, { fetcher }); const ch = x.latest_charge || {}, bt = ch.balance_transaction || {}; return { pi, charge: ch.id || "", fee: bt.fee || 0, available_on: bt.available_on ? new Date(bt.available_on * 1000).toISOString().slice(0, 10) : null } } catch (e) { return { pi } }
}
export async function stripeEvent(env, D, ev, fetcher) {
  if (!ev || !ev.id) return { ignored: true };
  const ins = await run(D, "INSERT OR IGNORE INTO stripe_events (id, type, at) VALUES (?,?,?)", ev.id, ev.type, now()); if (!(ins.meta && ins.meta.changes)) return { ok: true, duplicate: true };
  const o = (ev.data && ev.data.object) || {}, md = o.metadata || {}, base = "https://" + (env.SITE_HOST || "grooveville.org");
  try {
    const inviteResult = await inviteStripeEvent(D, ev);
    if (inviteResult) return inviteResult;
    if ((ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") && o.payment_status === "paid") {
      if (md.gvp === "order") {
        const ord = await one(D, "SELECT * FROM orders WHERE id = ?", md.order || ""); if (!ord) return { ok: true, unknown: true };
        if (Number(o.amount_total) !== ord.total_cents || String(o.currency).toLowerCase() !== "usd") { await audit(D, "stripe", "amount_mismatch", "order", ord.id, { paid: o.amount_total, expected: ord.total_cents }); return { ok: true, mismatch: true } }
        const pay = await piDetails(env, o.payment_intent, fetcher); return await markOrderPaid(env, D, ord, pay, base);
      }
      if (md.gvp === "charge") {
        const c = await one(D, "SELECT * FROM charges WHERE id = ?", md.charge || ""); if (!c) return { ok: true, unknown: true };
        const pay = await piDetails(env, o.payment_intent, fetcher), amt = Number(o.amount_total) || 0, rcpt = "GVR-" + new Date().getFullYear() + "-" + c.id.slice(0, 6).toUpperCase();
        const r = await run(D, "UPDATE charges SET paid_cents = paid_cents + ?, fee_cents = fee_cents + ?, status = CASE WHEN paid_cents + ? >= amount_cents THEN 'paid' ELSE 'open' END, paid_at = ?, stripe_pi = ?, stripe_session = ?, receipt_no = ? WHERE id = ? AND (stripe_session IS NULL OR stripe_session != ?)", amt, pay.fee || 0, amt, now(), pay.pi || "", o.id, rcpt, c.id, o.id);
        await audit(D, "stripe", "charge_paid", "charge", c.id, { amount: amt, session: o.id }); await notify(env, D, c.uid, "payment_received", "Payment received", fmt$(amt) + " · " + c.description, "#rentals/history");
        return { ok: true };
      }
    }
    if (ev.type === "checkout.session.expired" && md.gvp === "order") { const ord = await one(D, "SELECT * FROM orders WHERE id = ?", md.order || ""); if (ord && ord.status === "pending") await releaseOrder(D, ord, "expired"); return { ok: true } }
    if (ev.type === "checkout.session.async_payment_failed" && md.gvp === "charge") { await run(D, "UPDATE charges SET status = 'failed' WHERE id = ? AND status = 'open'", md.charge || ""); const c = await one(D, "SELECT uid FROM charges WHERE id = ?", md.charge || ""); if (c) await notify(env, D, c.uid, "payment_failed", "A payment didn't go through", "Sign in to try again with another method.", "#rentals/pay"); return { ok: true } }
    if (ev.type === "charge.refunded") {
      const pi = o.payment_intent || "", refunded = Number(o.amount_refunded) || 0;
      const ord = await one(D, "SELECT * FROM orders WHERE stripe_pi = ?", pi); if (ord) { const full = refunded >= ord.total_cents; await run(D, "UPDATE orders SET refunded_cents = ?, status = ? WHERE id = ?", refunded, full ? "refunded" : "partially_refunded", ord.id); if (full) await run(D, "UPDATE tickets SET status = 'void' WHERE order_id = ?", ord.id); await audit(D, "stripe", "order_refunded", "order", ord.id, { refunded }); return { ok: true } }
      const c = await one(D, "SELECT * FROM charges WHERE stripe_pi = ?", pi); if (c) { await run(D, "UPDATE charges SET refunded_cents = ?, status = ? WHERE id = ?", refunded, refunded >= c.paid_cents ? "refunded" : "partially_refunded", c.id); await audit(D, "stripe", "charge_refunded", "charge", c.id, { refunded }); await notify(env, D, c.uid, "refund", "Refund issued", fmt$(refunded) + " refunded · " + c.description, "#rentals/history") } return { ok: true };
    }
    if (ev.type === "charge.dispute.created" || ev.type === "charge.dispute.closed" || ev.type === "charge.dispute.funds_withdrawn" || ev.type === "charge.dispute.funds_reinstated") {
      const fee = (o.balance_transactions || []).reduce((a, t) => a + (t.fee || 0), 0); let pi = o.payment_intent || ""; const ord = await one(D, "SELECT * FROM orders WHERE stripe_pi = ? OR stripe_charge = ?", pi, o.charge || "");
      if (ord) { const won = o.status === "won", lost = o.status === "lost"; await run(D, "UPDATE orders SET status = ?, dispute_cents = ?, dispute_fee_cents = ? WHERE id = ?", won ? (ord.refunded_cents ? "partially_refunded" : "paid") : lost ? "paid" : "disputed", won ? 0 : Number(o.amount) || 0, fee, ord.id); if (lost) await run(D, "UPDATE tickets SET status = 'void' WHERE order_id = ?", ord.id); await audit(D, "stripe", "dispute_" + (o.status || "update"), "order", ord.id, { amount: o.amount, fee }); for (const a of await adminUids(D)) await notify(env, D, a, "dispute", "Payment dispute " + (o.status || "opened"), "Review it in Finance.", "#team-portals/finance") }
      return { ok: true };
    }
    if (ev.type === "transfer.reversed") { await run(D, "UPDATE payouts SET status = 'reversed', updated = ? WHERE stripe_transfer = ?", now(), o.id); await audit(D, "stripe", "transfer_reversed", "payout", o.id, {}); return { ok: true } }
  } catch (e) { await run(D, "DELETE FROM stripe_events WHERE id = ?", ev.id); throw e } /* let Stripe retry */
  return { ok: true, ignored: ev.type };
}
/* ---------- settlements ---------- */
export async function settlementFor(D, eventId) {
  const e = await one(D, "SELECT * FROM events WHERE id = ?", eventId); if (!e) return null;
  const ag = e.agreement_id ? await one(D, "SELECT * FROM event_agreements WHERE id = ?", e.agreement_id) : null, terms = ag ? pj(ag.terms, {}) : { arrangement: "ticketing" };
  const orders = await all(D, "SELECT o.*, f.cents AS processing_cents FROM orders o LEFT JOIN order_processing_fees f ON f.order_id = o.id WHERE o.event_id = ?", eventId); let rec = await one(D, "SELECT * FROM settlements WHERE event_id = ?", eventId);
  const payouts = rec ? await all(D, "SELECT p.*, m.paid_on, m.method, m.reference FROM payouts p LEFT JOIN manual_host_payments m ON m.payout_id = p.id WHERE p.settlement_id = ? ORDER BY COALESCE(m.paid_on, p.at), p.id", rec.id) : [];
  const calc = settle(terms, orders, rec ? pj(rec.adjustments, []) : [], payouts); const h = await one(D, "SELECT id, name, uid, grooveville FROM hosts WHERE id = ?", e.host_id);
  let state = rec && rec.state === "host_disputed" ? "disputed" : settlementState(e, calc, rec);
  return { event: { id: e.id, title: e.title, slug: e.slug, start: e.start, status: e.status }, host: h, agreement: ag ? { id: ag.id, status: ag.status, terms_hash: ag.terms_hash, arrangement: ag.arrangement } : null, calc, state, record: rec, payouts, log: rec ? await all(D, "SELECT at, actor, action, data FROM settlement_log WHERE settlement_id = ? ORDER BY id", rec.id) : [] };
}
async function ensureRec(D, eventId) { let r = await one(D, "SELECT * FROM settlements WHERE event_id = ?", eventId); if (!r) { await run(D, "INSERT OR IGNORE INTO settlements (id, event_id, state, adjustments, updated) VALUES (?,?,?,?,?)", rid(12), eventId, "open", "[]", now()); r = await one(D, "SELECT * FROM settlements WHERE event_id = ?", eventId) } return r }
async function slog(D, sid, actor, action, data) { await run(D, "INSERT INTO settlement_log (settlement_id, at, actor, action, data) VALUES (?,?,?,?,?)", sid, now(), actor, action, JSON.stringify(data || {})); await audit(D, actor, "settlement_" + action, "settlement", sid, data) }
export async function financeApi(C) {
  const { D, S, u, b, p, url, req, env } = C, base = "https://" + url.host;
  if (!u) return J({ error: "Sign in to continue" }, 401);
  if (/^\/api\/p\/finance\/businesses(?:\/|$)/.test(p)) return businessFinance(C, settlementFor);
  /* customer pays a charge (rent, deposit, equipment, venue rental…) */
  if (p === "/api/p/pay" && req.method === "POST") {
    const c = await one(D, "SELECT * FROM charges WHERE id = ? AND uid = ?", String(b.charge || ""), u.uid); if (!c) return J({ error: "Not found" }, 404); if (!["open", "failed"].includes(c.status)) return J({ error: "This is already paid" }, 409);
    if (C.mode === "off") return J({ error: "Online payments aren't connected yet" }, 503); if (C.mode === "live" && !S.payments_live) return J({ error: "Online payments open soon." }, 403);
    const due = c.amount_cents - c.paid_cents; if (due < 50) return J({ error: "Nothing left to pay" }, 400);
    const sess = await stripe(env, "POST", "checkout/sessions", { mode: "payment", client_reference_id: c.id, customer_email: u.email || undefined, line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: due, product_data: { name: c.description, description: "Payee: " + (c.landlord || "Grooveville LLC") } } }], metadata: { gvp: "charge", charge: c.id }, payment_intent_data: { metadata: { gvp: "charge", charge: c.id, kind: c.kind }, description: c.description }, success_url: base + "/#rentals/history?paid=" + c.id, cancel_url: base + "/#rentals/pay" }, { idem: "chg-" + c.id + "-" + due + "-" + Math.floor(Date.now() / 18e5), fetcher: C.fetcher });
    await audit(D, u.uid, "payment_started", "charge", c.id, { amount: due }); return J({ url: sess.url });
  }
  if (p === "/api/p/settlement" && req.method === "GET") {
    const id = url.searchParams.get("event") || "";
    const isStaff = u.founder || u.finance || u.admin;
    if (!isStaff && !(await one(D, "SELECT e.id FROM events e JOIN hosts h ON h.id = e.host_id WHERE e.id = ? AND h.uid = ?", id, u.uid))) {
      return J({ error: "Not allowed" }, 403);
    }
    const st = await settlementFor(D, id);
    if (!st) return J({ error: "Not found" }, 404);
    if (isStaff) return J(st);
    const ticketTypes = await all(D, "SELECT t.name, SUM(i.qty) AS quantity FROM order_items i JOIN orders o ON o.id = i.order_id JOIN ticket_types t ON t.id = i.ticket_type_id WHERE o.event_id = ? AND o.status IN ('paid','partially_refunded','refunded','disputed') GROUP BY t.id, t.name ORDER BY t.name", id);
    const { calc } = st;
    return J({
      event: st.event, state: st.state, ticketTypes,
      calc: {
        terms: { arrangement: calc.terms.arrangement, shareBps: calc.terms.shareBps },
        gross: calc.gross, tickets: calc.tickets, activeTickets: calc.activeTickets, refunds: calc.refunds,
        chargebacks: calc.chargebacks, fees: calc.fees, buyerProcessing: calc.buyerProcessing, hostFees: calc.hostFees, netSales: calc.netSales,
        grooveLabel: calc.grooveLabel, grooveShare: calc.grooveShare,
        adjustments: calc.adjustments.map(({ kind, cents, label }) => ({ kind, cents, label })),
        hostShare: calc.hostShare, paidOut: calc.paidOut, outstanding: calc.outstanding, openDisputes: calc.openDisputes,
      },
      finalizedHostShare: ["approved", "partially_paid", "paid"].includes(st.state) ? st.record.approved_amount : null,
      payments: st.payouts.filter(p => p.status === "paid").map(p => ({ amount: p.amount_cents, date: p.paid_on || p.at })),
    });
  }
  if (!u.finance && !u.admin) return J({ error: "Grooveville finance only" }, 403);
  if (p === "/api/p/finance/settlement/approve" && req.method === "POST") {
    if (!u.founder) return J({ error: "Only the founder approves settlements" }, 403);
    const st = await settlementFor(D, String(b.event || "")); if (!st) return J({ error: "Not found" }, 404); if (!st.host || st.host.grooveville || st.agreement?.status !== "signed") return J({ error: "A signed host agreement is required" }, 409); if (st.state === "sales_active") return J({ error: "Ticket sales are still open" }, 409); if (st.calc.openDisputes) return J({ error: "Resolve open payment disputes first" }, 409);
    if (Number(b.expected) !== st.calc.hostShare) return J({ error: "The numbers changed since you opened this. Review the latest figures and approve again.", calc: st.calc }, 409);
    const r = await ensureRec(D, st.event.id); await run(D, "UPDATE settlements SET state = 'approved', calc = ?, approved_amount = ?, approved_by = ?, approved_at = ?, updated = ? WHERE id = ?", JSON.stringify(st.calc), st.calc.hostShare, u.uid, now(), now(), r.id);
    await slog(D, r.id, u.uid, "approved", { hostShare: st.calc.hostShare, grooveShare: st.calc.grooveShare, gross: st.calc.gross }); if (st.host) await notify(env, D, st.host.uid, "settlement", "Settlement approved", st.event.title + " · your share " + fmt$(st.calc.hostShare), "#host/earnings"); return J({ ok: true });
  }
  if (p === "/api/p/finance/settlement/adjust" && req.method === "POST") {
    if (!u.founder) return J({ error: "Only the founder can adjust settlements" }, 403);
    const st = await settlementFor(D, String(b.event || "")); if (!st) return J({ error: "Not found" }, 404); const cents = Math.round(Number(b.cents)); if (!(cents > 0) || cents > 1e9) return J({ error: "Enter an amount" }, 400); const label = clean(b.label, 120), reason = clean(b.reason, 500); if (!label || !reason) return J({ error: "Add a label and the reason" }, 400);
    const r = await ensureRec(D, st.event.id), A = pj(r.adjustments, []); A.push({ id: rid(8), kind: b.kind === "credit" ? "credit" : "charge", cents, label, reason, by: u.uid, at: now() });
    await run(D, "UPDATE settlements SET adjustments = ?, state = CASE WHEN state IN ('approved','partially_paid','paid') THEN 'adjusted' ELSE state END, updated = ? WHERE id = ?", JSON.stringify(A), now(), r.id); await slog(D, r.id, u.uid, "adjusted", A[A.length - 1]); return J({ ok: true });
  }
  if (p === "/api/p/finance/payout/record" && req.method === "POST") {
    if (!u.founder) return J({ error: "Only the founder records external payments" }, 403);
    const event = String(b.event || ""), amount = Number(b.amount), paidOn = String(b.paidOn || "");
    const method = clean(b.method, 80), reference = clean(b.reference, 160), requestId = String(b.requestId || "");
    const date = new Date(paidOn + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== paidOn || paidOn > now().slice(0, 10)) {
      return J({ error: "Enter the date the payment was made" }, 400);
    }
    if (!method) return J({ error: "Enter the payment method" }, 400);
    if (!Number.isSafeInteger(amount) || amount <= 0) return J({ error: "Enter a positive payment amount in cents" }, 400);
    if (requestId && !/^[0-9a-f-]{36}$/.test(requestId)) return J({ error: "Invalid payment request identifier" }, 400);
    const id = requestId ? "manual-" + requestId : rid(12);
    const alreadyRecorded = async () => {
      if (!requestId) return null;
      const previous = await one(D, "SELECT s.event_id, p.by, p.amount_cents, m.paid_on, m.method, m.reference FROM payouts p JOIN settlements s ON s.id = p.settlement_id JOIN manual_host_payments m ON m.payout_id = p.id WHERE p.id = ?", id);
      if (!previous) return null;
      if (previous.event_id === event && previous.by === u.uid && previous.amount_cents === amount && previous.paid_on === paidOn && previous.method === method && previous.reference === reference) {
        return J({ ok: true, id });
      }
      return J({ error: "This payment request was already used" }, 409);
    };
    const existing = await alreadyRecorded();
    if (existing) return existing;
    const st = await settlementFor(D, event);
    if (!st?.record || !st.host || st.host.grooveville || st.agreement?.status !== "signed" || !["approved", "partially_paid"].includes(st.state)) {
      return await alreadyRecorded() || J({ error: "Approve the host settlement first" }, 409);
    }
    if (amount > st.calc.outstanding) return await alreadyRecorded() || J({ error: "Check the payment amount against the outstanding balance" }, 400);
    const at = now(), data = JSON.stringify({ payment: id, amount, paidOn, method, reference });
    const [insert] = await D.batch([
      D.prepare(`INSERT OR IGNORE INTO payouts (id, settlement_id, host_id, amount_cents, status, note, by, at, updated)
        SELECT ?, s.id, ?, ?, 'paid', 'Recorded external payment', ?, ?, ?
        FROM settlements s WHERE s.id = ? AND s.state IN ('approved','partially_paid') AND s.approved_amount = ?
        AND ? <= s.approved_amount - (SELECT COALESCE(SUM(amount_cents),0) FROM payouts WHERE settlement_id = s.id AND status = 'paid')`)
        .bind(id, st.host.id, amount, u.uid, at, at, st.record.id, st.calc.hostShare, amount),
      D.prepare("INSERT INTO manual_host_payments (payout_id, paid_on, method, reference) SELECT id, ?, ?, ? FROM payouts WHERE id = ? AND changes() = 1")
        .bind(paidOn, method, reference, id),
      D.prepare("INSERT INTO settlement_log (settlement_id, at, actor, action, data) SELECT settlement_id, ?, ?, 'external_payment_recorded', ? FROM payouts WHERE id = ? AND changes() = 1")
        .bind(at, u.uid, data, id),
    ]);
    if (!insert.meta?.changes) return await alreadyRecorded() || J({ error: "The settlement changed. Refresh before recording the payment." }, 409);
    return J({ ok: true, id });
  }
  if (p === "/api/p/finance/refund" && req.method === "POST") {
    if (!u.founder && !u.finance) return J({ error: "Only the founder or finance issues refunds" }, 403);
    const kind = b.order ? "order" : "charge", rec = kind === "order" ? await one(D, "SELECT * FROM orders WHERE id = ?", String(b.order)) : await one(D, "SELECT * FROM charges WHERE id = ?", String(b.charge || ""));
    if (!rec || !rec.stripe_pi) return J({ error: "No Stripe payment to refund" }, 400); const paid = kind === "order" ? rec.total_cents : rec.paid_cents, left = paid - (rec.refunded_cents || 0), amount = b.amount ? Math.round(Number(b.amount)) : left; if (!(amount > 0) || amount > left) return J({ error: "Refund must be up to " + fmt$(left) }, 400);
    const r = await stripe(env, "POST", "refunds", { payment_intent: rec.stripe_pi, amount, reason: "requested_by_customer", metadata: { gvp: kind, id: rec.id, by: u.uid } }, { idem: "refund-" + rec.id + "-" + ((rec.refunded_cents || 0) + amount), fetcher: C.fetcher });
    await audit(D, u.uid, "refund_requested", kind, rec.id, { amount, refund: r.id, reason: clean(b.reason, 300) }); return J({ ok: true, refund: r.id, status: r.status, note: "Stripe confirms the refund by webhook; the record updates when it arrives." });
  }
  if (p === "/api/p/finance/overview") {
    const pay = await one(D, "SELECT COALESCE(SUM(paid_cents),0) AS paid, COALESCE(SUM(refunded_cents),0) AS ref, COALESCE(SUM(fee_cents),0) AS fee FROM charges"), byClass = await all(D, "SELECT income_class, kind, COALESCE(SUM(paid_cents - refunded_cents),0) AS net FROM charges WHERE paid_cents > 0 GROUP BY income_class, kind");
    const open_ = await one(D, "SELECT COALESCE(SUM(amount_cents - paid_cents),0) AS due, COUNT(*) AS n FROM charges WHERE status IN ('open','failed')");
    const tix = await one(D, "SELECT COALESCE(SUM(total_cents),0) AS gross, COALESCE(SUM(refunded_cents),0) AS ref, COALESCE(SUM(fee_cents + dispute_fee_cents),0) AS fee, COALESCE(SUM(dispute_cents),0) AS disp, COALESCE(SUM(qty),0) AS qty FROM orders WHERE status IN ('paid','partially_refunded','refunded','disputed')");
    const evs = await all(D, "SELECT id FROM events WHERE status IN ('published','sales_closed','completed','canceled') OR id IN (SELECT event_id FROM orders WHERE status != 'pending')"); const sts = []; for (const e of evs) sts.push(await settlementFor(D, e.id));
    /* a minimum guarantee the host still owes is a receivable, not collected revenue */ const grooveEnt = sts.reduce((a, s) => a + s.calc.grooveNet + Math.min(0, s.calc.hostShare), 0), hostOwes = sts.filter(s => s.host && !s.host.grooveville).reduce((a, s) => a + Math.max(0, -s.calc.outstanding), 0), payable = sts.filter(s => s.host && !s.host.grooveville).reduce((a, s) => a + Math.max(0, s.calc.outstanding), 0), hostShare = sts.reduce((a, s) => a + Math.max(0, s.calc.hostShare), 0);
    const po = await one(D, "SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_cents END),0) AS done, COALESCE(SUM(CASE WHEN status = 'pending_funds' THEN amount_cents END),0) AS pending, COALESCE(SUM(CASE WHEN status = 'failed' THEN amount_cents END),0) AS failed FROM payouts");
    const rentBiz = byClass.filter(x => x.income_class !== "personal_passthrough" && x.income_class !== "deposit_liability").reduce((a, x) => a + x.net, 0), deposits = byClass.filter(x => x.income_class === "deposit_liability").reduce((a, x) => a + x.net, 0), personal = byClass.filter(x => x.income_class === "personal_passthrough").reduce((a, x) => a + x.net, 0);
    let balance = null; if (C.mode !== "off" && b && url.searchParams.get("balance") === "1") { try { const bl = await stripe(env, "GET", "balance", {}, { fetcher: C.fetcher }); balance = { available: (bl.available || []).filter(x => x.currency === "usd").reduce((a, x) => a + x.amount, 0), pending: (bl.pending || []).filter(x => x.currency === "usd").reduce((a, x) => a + x.amount, 0), instant: (bl.instant_available || []).filter(x => x.currency === "usd").reduce((a, x) => a + x.amount, 0) } } catch (e) { balance = { error: e.message } } }
    return J({ mode: C.mode, gross: pay.paid + tix.gross, rentals: { collected: pay.paid, refunds: pay.ref, fees: pay.fee, business: rentBiz, deposits, personal, byKind: byClass, outstanding: open_.due, openCount: open_.n }, tickets: { gross: tix.gross, refunds: tix.ref, fees: tix.fee, chargebacks: tix.disp, qty: tix.qty },
      grooveRevenue: rentBiz + grooveEnt, entRevenue: grooveEnt, hostShare, hostPayable: payable, hostOwes, payouts: po, balance, settlements: sts.map(s => ({ event: s.event, host: s.host && { name: s.host.name, grooveville: !!s.host.grooveville }, state: s.state, gross: s.calc.gross, hostShare: s.calc.hostShare, grooveShare: s.calc.grooveShare, outstanding: s.calc.outstanding })) });
  }
  if (p === "/api/p/finance/report") {
    const kind = url.searchParams.get("kind") || "transactions", esc = v => { v = v == null ? "" : String(v); if (/^[=+@\t\r]/.test(v) || (/^-/.test(v) && !/^-?\d+(\.\d+)?$/.test(v))) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }, $ = c => ((c || 0) / 100).toFixed(2); let rows = [];
    if (kind === "transactions") { rows.push(["date", "type", "id", "description", "amount", "refunded", "stripe_fee", "status", "payee", "income_class"]); for (const c of await all(D, "SELECT * FROM charges WHERE paid_cents > 0 ORDER BY paid_at")) rows.push([c.paid_at, "rental/" + c.kind, c.id, c.description, $(c.paid_cents), $(c.refunded_cents), $(c.fee_cents), c.status, c.landlord || "Grooveville LLC", c.income_class]); for (const o of await all(D, "SELECT o.*, e.title FROM orders o JOIN events e ON e.id = o.event_id WHERE o.status != 'pending' AND o.paid_at IS NOT NULL ORDER BY o.paid_at")) rows.push([o.paid_at, "tickets", o.id, o.title + " × " + o.qty, $(o.total_cents), $(o.refunded_cents), $(o.fee_cents + o.dispute_fee_cents), o.status, "", "ticket_sales"]) }
    else if (kind === "settlements") { rows.push(["event", "date", "host", "state", "gross", "refunds", "chargebacks", "fees", "base", "grooveville_share", "host_share", "paid_out", "outstanding"]); for (const e of await all(D, "SELECT id FROM events WHERE status IN ('published','sales_closed','completed','canceled')")) { const s = await settlementFor(D, e.id); rows.push([s.event.title, s.event.start, s.host && s.host.name, s.state, $(s.calc.gross), $(s.calc.refunds), $(s.calc.chargebacks), $(s.calc.fees), $(s.calc.base), $(s.calc.grooveShare), $(s.calc.hostShare), $(s.calc.paidOut), $(s.calc.outstanding)]) } }
    else if (kind === "payouts") { rows.push(["recorded_at", "payment_date", "payment", "host", "amount", "status", "method", "reference", "historical_transfer", "note"]); for (const x of await all(D, "SELECT p.*, h.name, m.paid_on, m.method, m.reference FROM payouts p JOIN hosts h ON h.id = p.host_id LEFT JOIN manual_host_payments m ON m.payout_id = p.id ORDER BY p.at")) rows.push([x.at, x.paid_on, x.id, x.name, $(x.amount_cents), x.status, x.method, x.reference, x.stripe_transfer, x.note]) }
    else return J({ error: "Unknown report" }, 400);
    return new Response(rows.map(r => r.map(esc).join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=grooveville-" + kind + "-" + new Date().toISOString().slice(0, 10) + ".csv", "cache-control": "no-store" } });
  }
  return J({ error: "Not found" }, 404);
}
