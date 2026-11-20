/* Settlement calculator: one pure function used by the admin finance center and the host dashboard.
   Inputs are the signed agreement's locked terms and the real order records (from Stripe webhooks).
   Integer cents only. Gross and net are never mixed: every step is shown as its own line. */
import { bpsOf } from "./core.js";
const PAIDISH = ["paid", "partially_refunded", "refunded", "disputed"];
export function settle(terms, orders, adjustments, payouts, today) {
  terms = terms || {}; const T = { arrangement: terms.arrangement || "ticketing", shareBps: terms.shareBps | 0, minGuaranteeCents: terms.minGuaranteeCents | 0, platformFeeBps: terms.platformFeeBps | 0, perTicketCents: terms.perTicketCents | 0, processingBorneBy: terms.processingBorneBy === "grooveville" ? "grooveville" : "host", shareBase: terms.shareBase === "gross_less_refunds" ? "gross_less_refunds" : "net_sales" };
  const P = (orders || []).filter(o => PAIDISH.includes(o.status));
  const gross = P.reduce((a, o) => a + (o.total_cents | 0), 0), tickets = P.reduce((a, o) => a + (o.qty | 0), 0);
  const refunds = P.reduce((a, o) => a + (o.refunded_cents | 0), 0), chargebacks = P.reduce((a, o) => a + (o.dispute_cents | 0), 0);
  const fees = P.reduce((a, o) => a + (o.fee_cents | 0) + (o.dispute_fee_cents | 0), 0);
  const fullyRefundedTickets = P.filter(o => o.status === "refunded").reduce((a, o) => a + (o.qty | 0), 0), activeTickets = tickets - fullyRefundedTickets;
  const netSales = gross - refunds - chargebacks, base = Math.max(0, T.shareBase === "gross_less_refunds" ? gross - refunds : netSales);
  let groove = 0, grooveLabel = "";
  if (T.arrangement === "owned") { groove = base; grooveLabel = "Grooveville event: all eligible revenue" }
  else if (T.arrangement === "share") { const pct = bpsOf(base, T.shareBps); groove = Math.max(pct, T.minGuaranteeCents); grooveLabel = (T.shareBps / 100) + "% of " + (T.shareBase === "gross_less_refunds" ? "sales after refunds" : "net sales") + (groove > pct ? " (minimum guarantee applied)" : "") }
  else { groove = bpsOf(base, T.platformFeeBps) + T.perTicketCents * activeTickets; grooveLabel = "Ticketing fee " + (T.platformFeeBps / 100) + "%" + (T.perTicketCents ? " + " + (T.perTicketCents / 100).toFixed(2) + " × " + activeTickets + " tickets" : "") }
  const adj = (adjustments || []).filter(a => a && a.approved !== false); const charges = adj.filter(a => a.kind === "charge").reduce((s, a) => s + (a.cents | 0), 0), credits = adj.filter(a => a.kind === "credit").reduce((s, a) => s + (a.cents | 0), 0);
  const hostFees = T.processingBorneBy === "host" ? fees : 0;
  const host = T.arrangement === "owned" ? 0 : base - groove - hostFees - charges + credits;
  const paid = (payouts || []).filter(p => ["initiated", "paid", "pending_funds"].includes(p.status)).reduce((s, p) => s + (p.amount_cents | 0), 0);
  const paidDone = (payouts || []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount_cents | 0), 0);
  const t = today || new Date().toISOString().slice(0, 10), pendingFunds = P.filter(o => !o.available_on || o.available_on > t).reduce((a, o) => a + (o.total_cents | 0) - (o.refunded_cents | 0), 0);
  const openDisputes = P.filter(o => o.status === "disputed").length;
  return { terms: T, gross, tickets, activeTickets, refunds, chargebacks, fees, taxes: 0, netSales, base, grooveShare: groove, grooveLabel, grooveNet: groove + charges - credits - (T.processingBorneBy === "grooveville" ? fees : 0) + (T.arrangement === "owned" ? -fees : 0),
    charges, credits, adjustments: adj, hostShare: host, previousPayouts: paid, paidOut: paidDone, outstanding: host - paid, pendingFunds, openDisputes, orders: P.length };
}
/* state machine for a settlement record */
export function settlementState(ev, calc, rec, payouts) {
  const closed = ev.status === "sales_closed" || ev.status === "completed" || ev.status === "canceled" || (ev.sales_close && ev.sales_close <= new Date().toISOString().slice(0, 16));
  if (!closed) return "sales_active";
  if (calc.openDisputes) return "disputed";
  const st = rec && rec.state;
  if (st === "approved" || st === "partially_paid" || st === "paid") {
    if (rec.approved_amount !== calc.hostShare) return "adjusted";
    if (calc.hostShare <= 0 || calc.outstanding <= 0) return (payouts || []).some(p => p.status === "pending_funds" || p.status === "initiated") ? "partially_paid" : "paid";
    return calc.previousPayouts > 0 ? "partially_paid" : "approved";
  }
  if (st === "awaiting_approval" || st === "adjusted") return st;
  if (calc.pendingFunds > 0) return "pending_reconciliation";
  return "awaiting_approval";
}
