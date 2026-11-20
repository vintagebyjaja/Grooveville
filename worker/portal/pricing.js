/* Location-specific event pricing. Pure and deterministic: the same location settings and event details
   always give the same quote. Every value comes from the location's pricing table (set in the admin
   dashboard); nothing here is a hardcoded dollar amount or percentage. All money is integer cents. */
import { bpsOf } from "./core.js";
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const mins = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : null };
const int = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : (d || 0) };
export const PRICING_DEFAULT = { tiers: [], bands: [], days: {}, includedHours: 4, extraHourCents: 0, extraHourBps: 0, setupHourCents: 0, breakdownHourCents: 0, services: [], depositCents: 0, minGuaranteeCents: 0, allowFlat: true, allowShare: true, platformFeeBps: 0, platformPerTicketCents: 0, shareBase: "net_sales", processingBorneBy: "host", cancelPolicy: "" };
export function normPricing(p) {
  p = Object.assign({}, PRICING_DEFAULT, p || {});
  p.tiers = (p.tiers || []).map(t => ({ id: String(t.id || t.name || "").slice(0, 40), name: String(t.name || "").slice(0, 60), maxGuests: int(t.maxGuests), flatCents: Math.max(0, int(t.flatCents)), shareBps: Math.max(0, Math.min(9000, int(t.shareBps))) })).filter(t => t.maxGuests > 0).sort((a, b) => a.maxGuests - b.maxGuests);
  p.bands = (p.bands || []).map(b => ({ id: String(b.id || b.name || "").slice(0, 40), name: String(b.name || "").slice(0, 60), from: String(b.from || "00:00").slice(0, 5), to: String(b.to || "23:59").slice(0, 5), flatAdjBps: int(b.flatAdjBps), shareAdjBps: int(b.shareAdjBps) }));
  const d = {}; for (const k of DAYS) if (p.days && p.days[k]) d[k] = { flatAdjBps: int(p.days[k].flatAdjBps), shareAdjBps: int(p.days[k].shareAdjBps) }; p.days = d;
  p.services = (p.services || []).map(s => ({ id: String(s.id || s.name || "").slice(0, 40), name: String(s.name || "").slice(0, 80), required: s.required === true, requiredOverGuests: int(s.requiredOverGuests), flatCents: Math.max(0, int(s.flatCents)), perGuestCents: Math.max(0, int(s.perGuestCents)), shareBps: Math.max(0, int(s.shareBps)) })).filter(s => s.id);
  for (const k of ["includedHours", "extraHourCents", "extraHourBps", "setupHourCents", "breakdownHourCents", "depositCents", "minGuaranteeCents", "platformFeeBps", "platformPerTicketCents"]) p[k] = Math.max(0, int(p[k]));
  p.allowFlat = p.allowFlat !== false; p.allowShare = p.allowShare !== false; return p;
}
/* hours: { mon: ["16:00","02:00"], ... } (closing earlier than opening means after midnight); missing day = closed */
function withinHours(hours, start, end) {
  if (!hours || !Object.keys(hours).length) return null;
  const d = new Date(start.slice(0, 10) + "T12:00:00Z").getUTCDay(), h = hours[DAYS[d]]; if (!h || !h[0]) return "The location is closed on " + DAYS[d].toUpperCase();
  let o = mins(h[0]), c = mins(h[1]); if (c <= o) c += 1440; let s = mins(start.slice(11)), e = s + Math.round((Date.parse(end + "Z") - Date.parse(start + "Z")) / 60000); if (s < o && s + 1440 <= c) { s += 1440; e += 1440 }
  if (s < o || e > c) return "The event must fit inside operating hours (" + h[0] + "–" + h[1] + ")"; return null;
}
/* ev: { expected, start "YYYY-MM-DDTHH:MM", end, services: [ids], setupHours, breakdownHours, ticketPriceCents? } */
export const BUYER_PROCESSING_BPS = 350;

export function independentTicketingOffer(buyerProcessing = false) {
  const feeBps = 200;
  return {
    arrangement: "ticketing",
    label: "Independent event ticketing",
    platformFee: { feeBps, perTicketCents: 0 },
    processingBorneBy: buyerProcessing ? "grooveville" : "host",
    buyerProcessingBps: buyerProcessing ? BUYER_PROCESSING_BPS : 0,
    payout: "Grooveville settles with hosts manually, typically within 3–5 business days after ticket sales close and funds are available, subject to reconciliation and dispute review.",
    lines: [{ label: "Ticketing fee", value: (feeBps / 100).toFixed(2) + "% of collected ticket revenue after refunds and chargebacks" }],
    note: buyerProcessing ? "The platform fee comes from host proceeds. Buyers pay 3.5% for processing as part of the displayed total. Free tickets and RSVPs have no fee." : "The platform fee is deducted from host proceeds. Stripe processing is deducted separately. Free tickets and RSVPs have no platform fee.",
  };
}
export function quote(loc, ev) {
  const P = normPricing(typeof loc.pricing === "string" ? JSON.parse(loc.pricing || "{}") : loc.pricing), errors = [], guests = int(ev.expected);
  const start = String(ev.start || ""), end = String(ev.end || ""); const durMin = Math.round((Date.parse(end + "Z") - Date.parse(start + "Z")) / 60000);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start.slice(0, 16)) || !(durMin > 0)) errors.push("Pick a valid start and end time");
  if (!(guests > 0)) errors.push("Enter the expected attendance");
  if (loc.capacity && guests > loc.capacity) errors.push("Expected attendance is over this location's permitted capacity of " + loc.capacity);
  if (loc.status && loc.status !== "active") errors.push("This location isn't taking bookings");
  if (loc.category !== "external" && loc.authorization && loc.authorization !== "authorized") errors.push("Grooveville isn't authorized to book this location yet");
  const blocked = (typeof loc.blocked === "string" ? JSON.parse(loc.blocked || "[]") : loc.blocked) || []; if (blocked.includes(start.slice(0, 10))) errors.push("That date isn't available at this location");
  if (!errors.length) { const hErr = withinHours(typeof loc.hours === "string" ? JSON.parse(loc.hours || "{}") : loc.hours, start.slice(0, 16), end.slice(0, 16)); if (hErr) errors.push(hErr) }
  const out = { location: loc.id, category: loc.category, guests, hours: Math.max(0, durMin) / 60, errors, offers: [] };
  const fee = { feeBps: P.platformFeeBps, perTicketCents: P.platformPerTicketCents };
  if (loc.category === "external") {
    if (!errors.length) out.offers.push(independentTicketingOffer());
    return out;
  }
  if (errors.length) return out;
  const tier = P.tiers.find(t => guests <= t.maxGuests); if (!tier) { errors.push("No pricing tier covers " + guests + " guests at this location"); return out }
  const sMin = mins(start.slice(11)), band = P.bands.find(b => { let f = mins(b.from), t = mins(b.to); if (t <= f) return sMin >= f || sMin < t; return sMin >= f && sMin < t }) || null;
  const day = DAYS[new Date(start.slice(0, 10) + "T12:00:00Z").getUTCDay()], dAdj = P.days[day] || null;
  const extraHours = Math.max(0, Math.ceil(durMin / 60 - P.includedHours));
  const want = new Set((ev.services || []).map(String)), svc = P.services.filter(s => s.required || (s.requiredOverGuests && guests > s.requiredOverGuests) || want.has(s.id));
  /* Option A: flat rental */
  if (P.allowFlat) {
    const L = []; let total = tier.flatCents; L.push({ label: tier.name + " (up to " + tier.maxGuests + " guests)", cents: tier.flatCents });
    if (band && band.flatAdjBps) { const a = bpsOf(tier.flatCents, band.flatAdjBps); total += a; L.push({ label: band.name + " adjustment", cents: a }) }
    if (dAdj && dAdj.flatAdjBps) { const a = bpsOf(tier.flatCents, dAdj.flatAdjBps); total += a; L.push({ label: day.toUpperCase() + " adjustment", cents: a }) }
    if (extraHours && P.extraHourCents) { const a = extraHours * P.extraHourCents; total += a; L.push({ label: extraHours + " extra hour(s)", cents: a }) }
    const su = int(ev.setupHours), bd = int(ev.breakdownHours); if (su && P.setupHourCents) { total += su * P.setupHourCents; L.push({ label: su + " setup hour(s)", cents: su * P.setupHourCents }) } if (bd && P.breakdownHourCents) { total += bd * P.breakdownHourCents; L.push({ label: bd + " breakdown hour(s)", cents: bd * P.breakdownHourCents }) }
    for (const s of svc) { const a = s.flatCents + s.perGuestCents * guests; if (a) { total += a; L.push({ label: s.name + (s.required || (s.requiredOverGuests && guests > s.requiredOverGuests) ? " (required)" : ""), cents: a }) } }
    total = Math.max(0, total); out.offers.push({ arrangement: "flat", label: "Flat rental", totalCents: total, depositCents: P.depositCents, lines: L, platformFee: fee, note: "You pay the rental; ticket proceeds are yours after the ticketing fee, Stripe processing fees and refunds." });
  }
  /* Option B: ticket revenue share */
  if (P.allowShare && tier.shareBps > 0) {
    const L = []; let bps = tier.shareBps; L.push({ label: tier.name, bps: tier.shareBps });
    if (band && band.shareAdjBps) { bps += band.shareAdjBps; L.push({ label: band.name + " adjustment", bps: band.shareAdjBps }) }
    if (dAdj && dAdj.shareAdjBps) { bps += dAdj.shareAdjBps; L.push({ label: day.toUpperCase() + " adjustment", bps: dAdj.shareAdjBps }) }
    if (extraHours && P.extraHourBps) { bps += extraHours * P.extraHourBps; L.push({ label: extraHours + " extra hour(s)", bps: extraHours * P.extraHourBps }) }
    for (const s of svc) if (s.shareBps) { bps += s.shareBps; L.push({ label: s.name, bps: s.shareBps }) }
    bps = Math.max(0, Math.min(9000, bps)); out.offers.push({ arrangement: "share", label: "Ticket revenue share", shareBps: bps, minGuaranteeCents: P.minGuaranteeCents, depositCents: P.depositCents, shareBase: P.shareBase, processingBorneBy: P.processingBorneBy, lines: L, note: "No rental upfront: Grooveville receives " + (bps / 100) + "% of eligible ticket revenue" + (P.minGuaranteeCents ? " (at least $" + (P.minGuaranteeCents / 100).toFixed(2) + ")" : "") + "." });
  }
  out.tier = tier.name; out.band = band && band.name; out.day = day; out.services = svc.map(s => s.id); out.cancelPolicy = P.cancelPolicy; return out;
}
