/* Founder-only business finance workspace. Totals are calculated by the Worker. */
(function () {
const E = PV.e, money = PV.$;
const categories = { income: "Income", ai: "AI credits", bill: "Bill", stripe: "Stripe payment" };
const row = (label, amount) => '<div><span>' + E(label) + '</span><span class="pvmoney">' + money(amount) + '</span></div>';
const total = (label, amount) => '<div class="tot"><span>' + E(label) + '</span><span>' + money(amount) + '</span></div>';
PV.businessFinance = async () => {
  const { businesses, mode } = await PV.api("finance/businesses");
  const options = businesses.map(b => '<option value="' + E(b.id) + '">' + E(b.name) + '</option>').join("");
  const cards = businesses.map(b => '<section class="pvpanel pv-business-card"><div class="pvph"><h3>' + E(b.name) + '</h3><button class="pvbtn sm" data-act="pv-business-select" data-id="' + E(b.id) + '">Add entry</button></div>' +
    '<div class="pvcalc">' + row("Net collected", b.collected) + row("Expected income", b.incoming) +
    row("AI credits paid (" + b.creditsPaid.toLocaleString() + ")", b.aiPaid) + row("AI credits due (" + b.creditsDue.toLocaleString() + ")", b.aiDue) +
    row("Bills paid", b.billsPaid) + row("Bills due", b.billsDue) + total("Collected after recorded bills", b.afterBills) + total("Projected profit", b.projected) + '</div>' +
    (b.records.length ? '<details class="pv-business-records"><summary>Entries (' + b.records.length + ')</summary><div class="pvlist">' + b.records.map(item =>
      '<div class="pvli"><div><b>' + E(item.name) + '</b><small>' + E(categories[item.kind]) + ' · ' + PV.date(item.entry_date) + ' · ' + money(item.amount_cents) +
        (item.kind === "stripe" ? ' · ' + E(item.id) + ' · fees ' + money(item.fees_cents) + ' · refunds ' + money(item.refunded_cents) : item.status === "open" ? ' · Open' : ' · Settled') + '</small></div>' +
      '<div class="pvrow">' + (item.kind === "stripe" ? '<button class="pvbtn sm" data-act="pv-business-stripe-refresh" data-id="' + E(item.id) + '" data-business="' + E(b.id) + '">Refresh</button>' :
        (item.status === "open" ? '<button class="pvbtn sm" data-act="pv-business-update" data-action="settle" data-id="' + E(item.id) + '">Mark ' + (item.kind === "income" ? 'received' : 'paid') + '</button>' : '') +
        '<button class="pvbtn sm" data-act="pv-business-update" data-action="remove" data-id="' + E(item.id) + '">Remove</button>') + '</div></div>').join("") + '</div></details>' : '') + '</section>').join("");
  const select = id => '<label class="pvf"><span>Business</span><select id="' + id + '" class="pvin" name="business">' + options + '</select></label>';
  return '<div class="pvph"><h2>Business Finance</h2><a class="pvbtn" href="#team-portals/finance">Finance &amp; settlements</a></div>' +
    '<p class="pvnote" style="margin:8px 0 18px">All recorded amounts in USD. Projected profit is net collected plus expected income minus recorded AI costs and bills, including paid costs. Record taxes as bills if you want them included.</p>' +
    '<div class="pvgrid pv-business-grid">' + cards + '</div>' +
    '<div class="pvgrid pvg2" style="margin-top:18px"><form class="pvpanel pvform" id="pv-business-entry" onsubmit="return false"><h3>Add income or expense</h3>' + select("pv-business-entry-company") +
      '<label class="pvf"><span>Type</span><select class="pvin" name="kind"><option value="income">Income</option><option value="ai">AI credits</option><option value="bill">Bill</option></select></label>' +
      '<label class="pvf"><span>Description</span><input class="pvin" name="name" maxlength="120" required></label><label class="pvf"><span>Amount (USD)</span><input class="pvin" name="amount" type="number" step="0.01" min="0.01" required></label>' +
      '<label class="pvf"><span>Credit units (for AI credits)</span><input class="pvin" name="credits" type="number" min="0" step="1"></label><label class="pvf"><span>Date due or settled</span><input class="pvin" name="date" type="date" required></label>' +
      '<label class="pvf"><span>Status</span><select class="pvin" name="status"><option value="open">Expected or due</option><option value="settled">Received or paid</option></select></label><button class="pvbtn pk" data-act="pv-business-entry">Save entry</button></form>' +
    '<div class="pvgrid"><form class="pvpanel pvform" id="pv-business-stripe" onsubmit="return false"><h3>Link a Stripe payment</h3><p class="pvnote">Rentals and Entertainment checkout totals already sync here. Link Groove Reads book payments or external business charges by ID, then refresh them after refunds. Avoid recording the same payment as manual income.</p>' +
      (mode === "off" ? '<p class="pvbanner">Stripe is disconnected in this environment.</p>' : select("pv-business-stripe-company") + '<label class="pvf"><span>Charge ID</span><input class="pvin" name="charge" placeholder="ch_…" required></label><button class="pvbtn" data-act="pv-business-stripe">Verify &amp; link</button>') +
      '</form><form class="pvpanel pvform" id="pv-business-create" onsubmit="return false"><h3>Add a business</h3><label class="pvf"><span>Business name</span><input class="pvin" name="name" maxlength="80" required></label><button class="pvbtn" data-act="pv-business-create">Add business</button></form></div></div>';
};
const form = name => {
  const el = document.getElementById("pv-business-" + name);
  return el.reportValidity() ? Object.fromEntries(new FormData(el)) : null;
};
const save = async (route, body, message) => {
  await PV.api("finance/businesses/" + route, body);
  PV.toast(message);
  PV.refresh();
};
PV.acts["pv-business-select"] = button => {
  const el = document.getElementById("pv-business-entry-company");
  el.value = button.dataset.id;
  el.focus();
};
PV.acts["pv-business-create"] = async () => {
  const data = form("create");
  if (data) await save("create", data, "Business added");
};
PV.acts["pv-business-entry"] = async () => {
  const data = form("entry");
  if (!data) return;
  const { business, kind, name, amount, date, status, credits } = data;
  await save("entry", { business, kind, name, date, status, amountCents: Math.round(Number(amount) * 100), creditUnits: Number(credits || 0) }, "Entry saved");
};
PV.acts["pv-business-update"] = async button => {
  const { action, id } = button.dataset;
  if (action === "remove" && !confirm("Remove this entry from Business Finance?")) return;
  await save("update", { action, id }, action === "remove" ? "Entry removed" : "Entry settled");
};
PV.acts["pv-business-stripe"] = async () => {
  const data = form("stripe");
  if (data) await save("stripe", data, "Stripe payment linked");
};
PV.acts["pv-business-stripe-refresh"] = button => save("stripe", { charge: button.dataset.id, business: button.dataset.business }, "Stripe payment refreshed");
})();
