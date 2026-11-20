import { J, one, all, run, clean, now, rid, audit, isDate, slugify, stripe } from "./core.js";

export async function businessFinance(C, settlementFor) {
  const { D, u, b, p, req, env } = C;
  if (!u?.founder) return J({ error: "Only the founder can access Business Finance" }, 403);
  if (req.method === "GET" && p === "/api/p/finance/businesses") {
    const [businesses, entries, rentals, events] = await Promise.all([
      all(D, "SELECT * FROM finance_businesses ORDER BY name"),
      all(D, "SELECT * FROM business_finance_entries ORDER BY entry_date DESC, created DESC"),
      one(D, "SELECT COALESCE(SUM(paid_cents - refunded_cents - fee_cents),0) AS net, COALESCE(SUM(CASE WHEN status IN ('open','failed') THEN MAX(0,amount_cents-paid_cents) ELSE 0 END),0) AS due FROM charges WHERE income_class = 'business' AND kind NOT IN ('venue_rental','deposit')"),
      all(D, "SELECT DISTINCT event_id AS id FROM orders WHERE status IN ('paid','partially_refunded','refunded','disputed')"),
    ]);
    let entNet = 0;
    for (let i = 0; i < events.length; i += 8) {
      const settlements = await Promise.all(events.slice(i, i + 8).map(e => settlementFor(D, e.id)));
      entNet += settlements.reduce((sum, s) => sum + (s ? s.calc.grooveNet + Math.min(0, s.calc.hostShare) : 0), 0);
    }
    const venue = await one(D, "SELECT COALESCE(SUM(paid_cents-refunded_cents-fee_cents),0) AS net, COALESCE(SUM(CASE WHEN status IN ('open','failed') THEN MAX(0,amount_cents-paid_cents) ELSE 0 END),0) AS due FROM charges WHERE income_class = 'business' AND kind = 'venue_rental'");
    return J({ mode: C.mode, businesses: businesses.map(biz => {
      const records = entries.filter(item => item.business_id === biz.id);
      const totals = { collected: biz.id === "rentals" ? rentals.net : biz.id === "ent" ? entNet + venue.net : 0,
        incoming: biz.id === "rentals" ? rentals.due : biz.id === "ent" ? venue.due : 0,
        aiPaid: 0, aiDue: 0, creditsPaid: 0, creditsDue: 0, billsPaid: 0, billsDue: 0 };
      for (const item of records) {
        const paid = item.status === "settled";
        if (item.kind === "stripe") totals.collected += item.amount_cents - item.refunded_cents - item.fees_cents;
        if (item.kind === "income") totals[paid ? "collected" : "incoming"] += item.amount_cents;
        if (item.kind === "ai") {
          totals[paid ? "aiPaid" : "aiDue"] += item.amount_cents;
          totals[paid ? "creditsPaid" : "creditsDue"] += item.credit_units;
        }
        if (item.kind === "bill") totals[paid ? "billsPaid" : "billsDue"] += item.amount_cents;
      }
      const costs = totals.aiPaid + totals.aiDue + totals.billsPaid + totals.billsDue;
      return { ...biz, ...totals, afterBills: totals.collected - costs, projected: totals.collected + totals.incoming - costs, records };
    }) });
  }
  if (req.method !== "POST") return J({ error: "Method not allowed" }, 405);
  if (p === "/api/p/finance/businesses/create") {
    const name = clean(b.name, 80), id = slugify(name);
    if (!id || name.length < 2) return J({ error: "Enter a business name" }, 400);
    const result = await run(D, "INSERT OR IGNORE INTO finance_businesses (id,name) VALUES (?,?)", id, name);
    if (!result.meta.changes) return J({ error: "That business already has a card" }, 409);
    await audit(D, u.uid, "business_finance_created", "finance_business", id, { name });
    return J({ ok: true });
  }
  if (p === "/api/p/finance/businesses/entry") {
    const biz = await one(D, "SELECT id FROM finance_businesses WHERE id=?", clean(b.business, 80));
    if (!biz) return J({ error: "Choose a business" }, 400);
    const kind = b.kind, name = clean(b.name, 120), amount = b.amountCents, units = kind === "ai" ? b.creditUnits || 0 : 0;
    if (!["income", "ai", "bill"].includes(kind) || !["open", "settled"].includes(b.status) ||
        !name || !isDate(b.date) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1e10 ||
        !Number.isSafeInteger(units) || units < 0 || units > 1e12) return J({ error: "Check the amount, date, credits, and status" }, 400);
    const id = rid(12);
    await run(D, "INSERT INTO business_finance_entries (id,business_id,kind,name,amount_cents,status,credit_units,entry_date,created) VALUES (?,?,?,?,?,?,?,?,?)", id, biz.id, kind, name, amount, b.status, units, b.date, now());
    await audit(D, u.uid, "business_finance_entry", "finance_business", biz.id, { id, kind, amount, status: b.status });
    return J({ ok: true });
  }
  if (p === "/api/p/finance/businesses/update") {
    const item = await one(D, "SELECT * FROM business_finance_entries WHERE id=?", clean(b.id, 100));
    if (!item || item.kind === "stripe") return J({ error: "Manual entry not found" }, 404);
    if (b.action === "remove") await run(D, "DELETE FROM business_finance_entries WHERE id=?", item.id);
    else if (b.action === "settle") await run(D, "UPDATE business_finance_entries SET status='settled' WHERE id=?", item.id);
    else return J({ error: "Choose an entry action" }, 400);
    await audit(D, u.uid, "business_finance_" + b.action, "finance_business", item.business_id, { entry: item });
    return J({ ok: true });
  }
  if (p === "/api/p/finance/businesses/stripe") {
    const id = clean(b.charge, 100);
    if (!/^ch_[a-zA-Z0-9]+$/.test(id)) return J({ error: "Enter a Stripe charge ID starting with ch_" }, 400);
    if (C.mode === "off") return J({ error: "Stripe is not connected in this environment" }, 503);
    const biz = await one(D, "SELECT id FROM finance_businesses WHERE id=?", clean(b.business, 80));
    if (!biz) return J({ error: "Choose a business" }, 400);
    const charge = await stripe(env, "GET", "charges/" + id, { expand: ["balance_transaction", "payment_intent"] }, { fetcher: C.fetcher });
    if (charge.id !== id || charge.currency !== "usd" || !charge.paid || charge.status !== "succeeded" || !charge.captured || charge.livemode !== (C.mode === "live")) return J({ error: "Only captured USD payments from this Stripe environment can be linked" }, 400);
    const intent = charge.payment_intent;
    if (typeof intent !== "object" || !intent?.id || !charge.balance_transaction || typeof charge.balance_transaction !== "object") return J({ error: "Stripe has not provided the payment and fee details yet" }, 409);
    if (charge.metadata?.gvp || intent.metadata?.gvp || await one(D, "SELECT 1 AS native FROM charges WHERE stripe_pi=? UNION ALL SELECT 1 FROM orders WHERE stripe_pi=? UNION ALL SELECT 1 FROM special_invite_upgrades WHERE payment_intent=? LIMIT 1", intent.id, intent.id, intent.id)) return J({ error: "This payment is already managed by Grooveville checkout" }, 409);
    if (charge.disputed) return J({ error: "Reconcile this disputed payment directly in Stripe before linking it" }, 409);
    const amount = charge.amount_captured, refunds = charge.amount_refunded, fees = charge.balance_transaction.fee;
    if (![amount, refunds, fees].every(x => Number.isSafeInteger(x) && x >= 0) || refunds > amount || !Number.isFinite(charge.created)) return J({ error: "Stripe returned incomplete totals" }, 409);
    const result = await run(D, "INSERT INTO business_finance_entries (id,business_id,kind,name,amount_cents,fees_cents,refunded_cents,status,entry_date,created) VALUES (?,?,'stripe',?,?,?,?,'settled',?,?) ON CONFLICT(id) DO UPDATE SET amount_cents=excluded.amount_cents,fees_cents=excluded.fees_cents,refunded_cents=excluded.refunded_cents WHERE business_finance_entries.business_id=excluded.business_id", id, biz.id, "Stripe payment", amount, fees, refunds, new Date(charge.created * 1000).toISOString().slice(0, 10), now());
    if (!result.meta.changes) return J({ error: "This payment is already linked to another business" }, 409);
    await audit(D, u.uid, "business_finance_stripe_link", "finance_business", biz.id, { id, amount, refunds, fees });
    return J({ ok: true });
  }
  return J({ error: "Not found" }, 404);
}
