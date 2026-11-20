import { J, one, all, run, now, rid, clean, stripe, audit, setSetting, limited, hex } from "./core.js";

const PRICE = 500;
const FREE = "letter";
const TEMPLATES = [FREE, "disco", "burnout", "vault"];
const THEMES = ["peach", "champagne", "silver", "charcoal"];
const OPEN = ["published", "sales_closed", "completed"];
const validToken = token => /^[a-f0-9]{48}$/.test(token || "");
const upgradePaymentsAvailable = C => C.mode === "test" ||
  (C.mode === "live" && C.S.payments_live && C.env.SPECIAL_INVITES_LIVE_UPGRADES === "true");
const enabled = (S, template) => S.special_invites !== false && !S.special_invite_disabled?.includes(template);
const upgrade = (D, event) => one(D, "SELECT * FROM special_invite_upgrades WHERE event_id = ? AND status IN ('pending','paid','revoked')", event);
const ownedEvent = (D, uid, id) => one(D, "SELECT e.*, h.status AS host_status FROM events e JOIN hosts h ON h.id=e.host_id WHERE e.id=? AND h.uid=?", id, uid);

export async function activeInvite(D, S, token, event) {
  if (S.special_invites === false || !validToken(token)) return null;
  const invite = await one(D, `SELECT i.*, e.slug, e.title, e.start, e.end, e.description, e.flyer_key, e.status,
    COALESCE(l.name,e.venue_name) AS venue, h.name AS host_name
    FROM special_invites i JOIN events e ON e.id=i.event_id JOIN hosts h ON h.id=e.host_id
    LEFT JOIN locations l ON l.id=e.location_id
    WHERE i.token=? AND i.revoked IS NULL AND i.visibility=e.visibility AND e.visibility!='password'
    AND i.host_id=e.host_id AND h.status='active'`, token);
  if (!invite || !OPEN.includes(invite.status) || (event && event !== invite.event_id) || !enabled(S, invite.template)) return null;
  if (invite.template !== FREE && (await upgrade(D, invite.event_id))?.status !== "paid") return null;
  return invite;
}

const inviteMetrics = `SELECT i.token, i.event_id, i.template, i.theme, i.guest, i.message, i.destination, i.created, i.revoked,
  (SELECT COALESCE(SUM(opened),0) FROM special_invite_engagement WHERE token=i.token) AS opens,
  (SELECT COALESCE(SUM(opened>0),0) FROM special_invite_engagement WHERE token=i.token) AS visitors,
  (SELECT COALESCE(SUM(revealed),0) FROM special_invite_engagement WHERE token=i.token) AS reveals,
  (SELECT COUNT(*) FROM special_invite_orders a JOIN orders o ON o.id=a.order_id WHERE a.token=i.token AND o.status='paid' AND o.total_cents=0) AS rsvps,
  (SELECT COUNT(*) FROM special_invite_orders a JOIN orders o ON o.id=a.order_id WHERE a.token=i.token AND o.status IN ('paid','partially_refunded','refunded','disputed') AND o.total_cents>0) AS purchases,
  (SELECT COALESCE(SUM(o.qty),0) FROM special_invite_orders a JOIN orders o ON o.id=a.order_id WHERE a.token=i.token AND o.status IN ('paid','partially_refunded','refunded','disputed') AND o.total_cents>0) AS tickets,
  (SELECT COALESCE(SUM(o.total_cents-COALESCE(o.refunded_cents,0)-COALESCE(o.dispute_cents,0)),0) FROM special_invite_orders a JOIN orders o ON o.id=a.order_id
    WHERE a.token=i.token AND o.status IN ('paid','partially_refunded','refunded','disputed') AND o.total_cents>0) AS revenue
  FROM special_invites i`;

async function startUpgrade(C, e) {
  const { D, S, env } = C;
  if (!TEMPLATES.some(t => t !== FREE && enabled(S, t)) || e.host_status !== "active" || e.status === "canceled") return J({ error: "Invites are unavailable for this event." }, 409);
  let order = await upgrade(D, e.id);
  if (order?.status === "paid") return J({ status: "paid" });
  if (order?.status === "revoked") return J({ error: "This upgrade needs founder review." }, 409);
  if (!upgradePaymentsAvailable(C)) return J({ error: "Stripe upgrades are unavailable." }, 503);
  if (order?.checkout_session && order.expires <= Date.now()) {
    const previous = await stripe(env, "GET", "checkout/sessions/" + order.checkout_session, {}, { fetcher: C.fetcher });
    if (previous.status !== "expired") return J({ status: "pending" });
    await run(D, "UPDATE special_invite_upgrades SET status='expired' WHERE id=? AND status='pending'", order.id);
    order = null;
  }
  if (!order) {
    await run(D, "INSERT OR IGNORE INTO special_invite_upgrades (id,event_id,host_id,status,expires,created) VALUES (?,?,?,'pending',?,?)",
      rid(16), e.id, e.host_id, Date.now() + 40 * 60000, now());
    order = await upgrade(D, e.id);
  }
  if (order.status !== "pending") return J({ status: order.status });
  if (order.checkout_url) return J({ status: "pending", url: order.checkout_url });
  const origin = C.url.origin, route = origin + "/#host/invites/" + encodeURIComponent(e.id);
  const metadata = { gvp: "special_invites", upgrade: order.id, event: e.id, host: e.host_id };
  const checkout = await stripe(env, "POST", "checkout/sessions", {
    mode: "payment", expires_at: Math.floor(order.expires / 1000), client_reference_id: order.id,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: PRICE, product_data: { name: "Grooveville Special Invites Collection" } } }],
    metadata, payment_intent_data: { metadata }, success_url: route + "?upgrade=success", cancel_url: route + "?upgrade=cancel",
  }, { idem: "special-invite-" + order.id, fetcher: C.fetcher });
  await run(D, "UPDATE special_invite_upgrades SET checkout_session=?,checkout_url=? WHERE id=? AND status='pending'", checkout.id, checkout.url, order.id);
  if (checkout.status === "expired") {
    await run(D, "UPDATE special_invite_upgrades SET status='expired' WHERE id=? AND status='pending'", order.id);
    return J({ error: "This checkout expired. Start the upgrade again." }, 409);
  }
  if (checkout.status === "complete") return J({ status: "pending" });
  return J({ status: "pending", url: checkout.url });
}

export async function inviteApi(C) {
  const { D, S, u, b, p, url, req } = C;
  if (p === "/api/p/invite" && req.method === "GET") {
    const i = await activeInvite(D, S, url.searchParams.get("token"));
    if (!S.ent_open || !i) return J({ error: "This invitation is unavailable." }, 404);
    return J({ invite: { template: i.template, theme: i.theme, guest: i.guest, message: i.message,
      destination: i.destination, slug: i.slug, title: i.title, start: i.start, end: i.end,
      description: i.description, flyer: i.flyer_key, venue: i.venue, host: i.host_name, registrationOpen: i.status === "published" } });
  }
  if (p === "/api/p/invite/activity" && req.method === "POST") {
    const i = S.ent_open && await activeInvite(D, S, b.token);
    if (!i || !/^[0-9a-f-]{36}$/.test(b.visitor || "") || !["open","reveal"].includes(b.action)) return J({ error: "Invalid activity" }, 400);
    if (await limited(D, "invite:" + i.token + ":" + C.ip, 120, 3600)) return J({ error: "Too many requests" }, 429);
    const isOpen = b.action === "open";
    await run(D, `INSERT INTO special_invite_engagement (token,visitor,opened,revealed) VALUES (?,?,?,?)
      ON CONFLICT(token,visitor) DO UPDATE SET opened=opened+excluded.opened,revealed=revealed+excluded.revealed`,
      i.token, b.visitor, isOpen ? 1 : 0, isOpen ? 0 : 1);
    return J({ ok: true });
  }
  if (p.startsWith("/api/p/admin/invites")) return inviteAdmin(C);
  if (!u) return J({ error: "Sign in first" }, 401);
  const e = await ownedEvent(D, u.uid, String(req.method === "GET" ? url.searchParams.get("event") || "" : b.event || ""));
  if (!e) return J({ error: "Event not found" }, 404);
  if (p === "/api/p/host/invites" && req.method === "GET") {
    const purchase = await upgrade(D, e.id);
    const number = Math.max(1, Math.min(1000000, Math.trunc(Number(url.searchParams.get("page"))) || 1));
    const pageSize = 50;
    const rows = await all(D, inviteMetrics + " WHERE i.event_id=? AND i.host_id=? ORDER BY i.created DESC, i.token DESC LIMIT ? OFFSET ?", e.id, e.host_id, pageSize + 1, (number - 1) * pageSize);
    return J({ enabled: S.special_invites !== false, templates: TEMPLATES.filter(t => enabled(S, t)),
      event: { id: e.id, title: e.title, slug: e.slug, status: e.status, visibility: e.visibility, inviteCode: e.visibility === "private" ? e.invite_code : undefined },
      upgrade: purchase?.status || "none", upgradeAvailable: upgradePaymentsAvailable(C), invites: rows.slice(0, pageSize), page: number, hasNext: rows.length > pageSize });
  }
  if (p === "/api/p/host/invites/upgrade" && req.method === "POST") return startUpgrade(C, e);
  if (p === "/api/p/host/invites" && req.method === "POST") {
    if (e.host_status !== "active" || e.visibility === "password" || e.status === "canceled") return J({ error: "This event cannot use a Special Invite." }, 409);
    if (!TEMPLATES.includes(b.template) || !enabled(S, b.template) || !THEMES.includes(b.theme) || !["rsvp", "tickets"].includes(b.destination)) return J({ error: "Choose an available template, theme and action." }, 400);
    if (b.template !== FREE && (await upgrade(D, e.id))?.status !== "paid") return J({ error: "Unlock this event’s premium collection first." }, 403);
    const token = hex(crypto.getRandomValues(new Uint8Array(24)));
    await run(D, "INSERT INTO special_invites (token,event_id,host_id,visibility,template,theme,guest,message,destination,created) VALUES (?,?,?,?,?,?,?,?,?,?)",
      token, e.id, e.host_id, e.visibility, b.template, b.theme, clean(b.guest, 100), clean(b.message, 1200), b.destination, now());
    return J({ token });
  }
  if (p === "/api/p/host/invites/revoke" && req.method === "POST") {
    await run(D, "UPDATE special_invites SET revoked=? WHERE token=? AND event_id=? AND host_id=? AND revoked IS NULL", now(), String(b.token || ""), e.id, e.host_id);
    return J({ ok: true });
  }
  return J({ error: "Not found" }, 404);
}

async function inviteAdmin(C) {
  const { D, S, u, b, req, p } = C;
  if (!u?.founder) return J({ error: "Founder access required." }, 403);
  if (p === "/api/p/admin/invites" && req.method === "GET") {
    const totals = await one(D, `SELECT COUNT(*) AS created, COUNT(DISTINCT event_id) AS events, COALESCE(SUM(opens),0) AS opens,
      COALESCE(SUM(reveals),0) AS reveals, COALESCE(SUM(rsvps),0) AS rsvps, COALESCE(SUM(purchases),0) AS purchases,
      COALESCE(SUM(tickets),0) AS tickets, COALESCE(SUM(revenue),0) AS attributed_revenue FROM (${inviteMetrics})`);
    const sales = await one(D, `SELECT COUNT(DISTINCT CASE WHEN status='paid' THEN event_id END) AS unlocked,
      COUNT(CASE WHEN paid_at IS NOT NULL THEN 1 END) AS purchased, COUNT(CASE WHEN status IN ('failed','expired') THEN 1 END) AS failed,
      COALESCE(SUM(CASE WHEN paid_at IS NOT NULL THEN ${PRICE}-refunded_cents ELSE 0 END),0) AS revenue FROM special_invite_upgrades`);
    const usage = await one(D, "SELECT COUNT(DISTINCT CASE WHEN i.template='letter' THEN i.event_id END) AS letter_events, COUNT(DISTINCT CASE WHEN i.template!='letter' THEN i.event_id END) AS premium_events FROM special_invites i");
    return J({ enabled: S.special_invites !== false, disabled: S.special_invite_disabled || [], totals, sales, usage,
      templates: await all(D, "SELECT template, COUNT(*) AS count FROM special_invites GROUP BY template"),
      activity: await all(D, inviteMetrics.replace("i.guest, i.message, ", "") + " ORDER BY i.created DESC LIMIT 100"),
      upgrades: await all(D, "SELECT a.id, a.event_id, a.status, a.paid_at, a.refunded_cents, e.title FROM special_invite_upgrades a JOIN events e ON e.id=a.event_id ORDER BY a.created DESC LIMIT 100") });
  }
  if (p === "/api/p/admin/invites/settings" && req.method === "POST") {
    if (typeof b.enabled !== "boolean" || !Array.isArray(b.disabled) || b.disabled.some(t => !TEMPLATES.includes(t))) return J({ error: "Invalid invite settings" }, 400);
    await setSetting(D, "special_invites", b.enabled);
    await setSetting(D, "special_invite_disabled", [...new Set(b.disabled)]);
    await audit(D, u.uid, "special_invites_settings", "settings", "", { enabled: b.enabled, disabled: b.disabled });
    return J({ ok: true });
  }
  if (p === "/api/p/admin/invites/entitlement" && req.method === "POST") {
    const a = await one(D, "SELECT * FROM special_invite_upgrades WHERE id=?", String(b.id || ""));
    if (!a?.paid_at || a.refunded_cents >= PRICE || !["paid", "revoked"].includes(a.status) || typeof b.enabled !== "boolean") return J({ error: "Only verified and non-fully-refunded upgrades can be changed." }, 409);
    await run(D, "UPDATE special_invite_upgrades SET status=? WHERE id=? AND status=? AND refunded_cents<?", b.enabled ? "paid" : "revoked", a.id, a.status, PRICE);
    await audit(D, u.uid, b.enabled ? "invite_access_restored" : "invite_access_revoked", "invite_upgrade", a.id, {});
    return J({ ok: true });
  }
  return J({ error: "Not found" }, 404);
}

export async function inviteStripeEvent(D, event) {
  const o = event.data?.object || {}, m = o.metadata || {};
  if (event.type === "charge.refunded") {
    if (!o.payment_intent) return null;
    let a = await one(D, "SELECT * FROM special_invite_upgrades WHERE payment_intent=?", o.payment_intent);
    if (!a && m.gvp === "special_invites" && o.paid === true && Number(o.amount) === PRICE && o.currency === "usd") {
      const pending = await one(D, "SELECT * FROM special_invite_upgrades WHERE id=? AND status='pending'", m.upgrade || "");
      if (pending && pending.event_id === m.event && pending.host_id === m.host) a = pending;
    }
    if (!a) return null;
    const amount = Math.min(PRICE, Math.max(0, Number(o.amount_refunded) || 0));
    await run(D, `UPDATE special_invite_upgrades SET payment_intent=COALESCE(payment_intent,?), paid_at=COALESCE(paid_at,?),
      refunded_cents=MAX(refunded_cents,?), status=CASE WHEN ?>=? THEN 'refunded' ELSE status END WHERE id=?`,
      o.payment_intent, now(), amount, amount, PRICE, a.id);
    return { ok: true };
  }
  if (!event.type?.startsWith("checkout.session.") || m.gvp !== "special_invites") return null;
  const a = await one(D, "SELECT * FROM special_invite_upgrades WHERE id=?", m.upgrade || "");
  if (!a || a.event_id !== m.event || a.host_id !== m.host || (a.checkout_session && a.checkout_session !== o.id) ||
    o.client_reference_id !== a.id || Number(o.amount_total) !== PRICE || o.currency !== "usd") return { ok: true, ignored: true };
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && o.payment_status === "paid" && /^pi_/.test(o.payment_intent || "")) {
    await run(D, "UPDATE special_invite_upgrades SET status='paid', checkout_session=?, payment_intent=?, paid_at=? WHERE id=? AND status='pending'", o.id, o.payment_intent, now(), a.id);
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await run(D, "UPDATE special_invite_upgrades SET status=?,checkout_session=? WHERE id=? AND status='pending'", event.type.endsWith("expired") ? "expired" : "failed", o.id, a.id);
  }
  return { ok: true };
}
