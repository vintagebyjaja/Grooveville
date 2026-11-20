/* Special Invites uses the existing portal API, routing, and action dispatcher. */
(function () {
  const E = PV.e;
  const templates = [
    ["letter", "The Private Letter", "An ivory envelope and a peach wax seal."],
    ["disco", "Disco Piñata", "Mirror tiles, club lights, and a burst of confetti."],
    ["burnout", "Burnout", "An after-dark arrival through tire smoke."],
    ["vault", "The VIP Vault", "A chrome lock opens onto a private invitation."],
  ];
  const themes = [["peach", "Peach"], ["champagne", "Champagne"], ["silver", "Silver"], ["charcoal", "Charcoal"]];
  const shareUrl = token => location.origin + "/events/invite/" + encodeURIComponent(token);
  const shareButton = (url, title, label) =>
    '<button class="pvbtn sm" data-act="pv-share" data-url="' + E(url) + '" data-title="' + E(title) + '">' + E(label) + '</button>';
  const option = (key, label, disabled = false) => '<option value="' + E(key) + '"' + (disabled ? " disabled" : "") + '>' + E(label) + '</option>';
  const nameOf = key => templates.find(t => t[0] === key)?.[1] || key;
  const validTheme = theme => themes.some(t => t[0] === theme) ? theme : "peach";
  const pieces = Array.from({ length: 16 }, (_, i) => '<i style="--position:' + i + '"></i>').join("");
  const stageArt = {
    letter: '<div class="si-envelope"><div class="si-paper"></div><div class="si-flap"></div><span class="si-seal">G</span></div>',
    disco: '<div class="si-spotlight"></div><div class="si-mirror"></div><div class="si-confetti">' + pieces + '</div>',
    burnout: '<div class="si-road"></div><div class="si-smoke"></div><img class="si-car" src="/media/invite-burnout.webp" alt="">',
    vault: '<div class="si-vault"><div class="si-vault-glow"></div><div class="si-door left"><span></span></div><div class="si-door right"></div></div>',
  };
  const stage = (key, title) => '<div class="si-stage si-stage-' + E(key) + '" aria-hidden="true">' + (stageArt[key] || stageArt.letter) +
    (key === "burnout" ? '<span class="si-track-title">' + E(title || "") + '</span>' : '') + '</div>';

  function reveal(root, onReveal) {
    if (!root) return;
    const open = root.querySelector("[data-si-open]"), skip = root.querySelector("[data-si-skip]");
    const replay = root.querySelector("[data-si-replay]"), card = root.querySelector("[data-si-card]");
    let timer, counted = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    function show() {
      if (!counted) { counted = true; onReveal?.(); }
      root.dataset.phase = "open";
      card.hidden = false;
      replay.hidden = false;
      open.hidden = skip.hidden = true;
      card.focus({ preventScroll: true });
    }
    function start(skipMotion) {
      if (timer) clearTimeout(timer);
      if (skipMotion || reduced.matches) { show(); return; }
      root.dataset.phase = "opening";
      open.disabled = true;
      timer = setTimeout(show, 760);
    }
    function reset() {
      if (timer) clearTimeout(timer);
      root.dataset.phase = "sealed";
      card.hidden = replay.hidden = true;
      open.hidden = skip.hidden = false;
      open.disabled = false;
    }
    open.addEventListener("click", () => start(false));
    skip.addEventListener("click", () => start(true));
    replay.addEventListener("click", () => { reset(); open.focus(); });
    if (reduced.matches) { open.hidden = skip.hidden = true; replay.hidden = true; }
    else reset();
  }

  function experience(data, action) {
    const logo = (GV.brandLogo && GV.brandLogo("ent")) || "/logo.webp";
    return '<article class="si-experience si-' + validTheme(data.theme) + '">' +
      '<div class="si-brand"><img src="' + E(logo) + '" alt="" width="30" height="30">Grooveville Special Invites</div>' +
      stage(data.template, data.title) +
      '<div class="si-controls"><button class="pvbtn pk" data-si-open hidden>' +
      ({ letter: "Open the letter", disco: "Reveal the invite", burnout: "Start the reveal", vault: "Unlock the vault" }[data.template] || "Open invitation") +
      '</button><button class="pvbtn" data-si-skip hidden>Skip animation</button></div>' +
      '<div class="si-card" tabindex="-1" data-si-card>' +
      (data.guest ? '<p class="si-greeting">For ' + E(data.guest) + '</p>' : '') +
      '<h1>' + E(data.title) + '</h1><p>' + E(PV.dt(data.start)) + (data.venue ? ' · ' + E(data.venue) : '') + '</p>' +
      (data.host ? '<p class="muted">Hosted by ' + E(data.host) + '</p>' : '') +
      (data.message ? '<p class="si-message">' + E(data.message) + '</p>' : '') +
      (data.description ? '<p class="si-message">' + E(data.description) + '</p>' : '') +
      (data.flyer ? '<img class="si-flyer" src="/api/p/img/' + E(data.flyer) + '" alt="Event flyer" loading="lazy">' : '') +
      '<div class="si-controls">' + action + '<button class="pvbtn" data-si-replay hidden>Replay invitation</button></div></div></article>';
  }

  PV.views.invite = async ({ parts }) => {
    const token = parts[1] || "", { invite } = await PV.api("invite?token=" + encodeURIComponent(token));
    const action = invite.registrationOpen
      ? '<a class="pvbtn pk" href="#e/' + E(invite.slug) + '?invite=' + E(token) + '">' + (invite.destination === "rsvp" ? "RSVP" : "Get tickets") + '</a>'
      : '<p class="muted">Registration is closed.</p>';
    PV.after = root => {
      let visitor;
      try {
        const key = "gv:invite-visitor:" + token;
        visitor = localStorage.getItem(key) || crypto.randomUUID();
        localStorage.setItem(key, visitor);
      } catch { visitor = crypto.randomUUID(); }
      const track = action => PV.api("invite/activity", { token, visitor, action }).catch(() => {});
      // The site can re-render after Firebase finishes loading. Count one open per navigation.
      const href = location.href;
      if (PV.inviteOpened !== href) { PV.inviteOpened = href; track("open"); }
      reveal(root.querySelector(".si-experience"), () => track("reveal"));
    };
    return '<div class="pv si-surface">' + experience(invite, action) + '</div>';
  };
  window.addEventListener("hashchange", () => { if (!/^#invite\//.test(location.hash)) PV.inviteOpened = null; });

  PV.inviteHost = async ({ id, qs, context, shell }) => {
    const eventOptions = context.events.map(e => option(e.id, e.title)).join("");
    if (!id) return shell('<div class="pvpanel"><h2>Invite guests</h2>' + (eventOptions ?
      '<label class="pvf">Event<select id="si-pick-event" class="pvin">' + eventOptions + '</select></label><button class="pvbtn pk" data-act="pv-si-select">Continue</button>' :
      '<p class="muted">Create an event before inviting guests.</p><a class="pvbtn pk" href="#host/new">Create event</a>') + '</div>');
    const pageUrl = "#host/invites/" + encodeURIComponent(id);
    const data = await PV.api("host/invites?event=" + encodeURIComponent(id) + "&page=" + encodeURIComponent(qs.get("page") || ""));
    const e = data.event, unlocked = data.upgrade === "paid";
    const standard = location.origin + "/#e/" + encodeURIComponent(e.slug) + (e.inviteCode ? "?k=" + encodeURIComponent(e.inviteCode) : "");
    const status = ["published", "sales_closed", "completed"].includes(e.status) ? "" : '<p class="pvnote">Guest links will open after the event is published.</p>';
    const usable = data.enabled && e.visibility !== "password" && e.status !== "canceled";
    const templatesHtml = '<div class="si-template-grid">' + templates.map(([key, title, sub]) => {
      const allowed = data.templates.includes(key), locked = key !== "letter" && !unlocked;
      return '<div class="pvpanel si-template">' + stage(key) + '<h3>' + E(title) + '</h3><p class="pvnote">' + E(sub) + '</p>' +
        '<div class="pvrow"><span class="pvpill">' + (!allowed ? "Disabled" : locked ? "Locked" : key === "letter" ? "Free" : "Unlocked") + '</span>' +
        '<button class="pvbtn sm" data-act="pv-si-preview" data-template="' + key + '" data-title="' + E(e.title) + '">Preview</button></div></div>';
    }).join("") + '</div>';
    const eligible = templates.filter(([key]) => data.templates.includes(key) && (key === "letter" || unlocked));
    const creator = eligible.length ? '<form id="si-create" class="pvpanel pvform" onsubmit="return false"><h3>Create Special Invite</h3>' +
      '<label class="pvf">Animation template<select class="pvin" name="template">' + eligible.map(([k, l]) => option(k, l)).join("") + '</select></label>' +
      '<label class="pvf">Theme<select class="pvin" name="theme">' + themes.map(([k, l]) => option(k, l)).join("") + '</select></label>' +
      '<label class="pvf">Guest name (optional)<input class="pvin" name="guest" maxlength="100"></label>' +
      '<label class="pvf">Personal message (optional)<textarea class="pvin" name="message" maxlength="1200"></textarea></label>' +
      '<label class="pvf">Guest action<select class="pvin" name="destination">' + option("rsvp", "Free RSVP") + option("tickets", "Get tickets") + '</select></label>' +
      '<button type="button" data-act="pv-si-create" data-id="' + E(id) + '" class="pvbtn pk">Create shareable link</button></form>' : '';
    const purchase = !unlocked && data.templates.some(key => key !== "letter") && data.upgrade !== "revoked" ?
      '<div class="pvpanel"><h3>Special Invites Collection</h3><p class="pvnote">One purchase for this event. Share as many invites as you need.</p>' +
      '<button class="pvbtn pk" data-act="pv-si-upgrade" data-id="' + E(id) + '">' +
      (data.upgrade === "pending" ? "Resume $5 upgrade" : "Unlock All 4 Special Invites — $5 for This Event") + '</button></div>' : '';
    const pagination = '<div class="pvrow">' +
      (data.page > 1 ? '<a class="pvbtn sm" href="' + E(pageUrl + "?page=" + (data.page - 1)) + '">Previous page</a>' : "") +
      (data.hasNext ? '<a class="pvbtn sm" href="' + E(pageUrl + "?page=" + (data.page + 1)) + '">Next page</a>' : "") + '</div>';
    const table = '<div class="pvpanel"><h3>Invitation links and activity</h3>' + (data.invites.length ?
      '<div class="pvtblw"><table class="pvtbl"><thead><tr><th>Invite</th><th>Opens</th><th>Visitors</th><th>Reveals</th><th>RSVPs</th><th>Paid orders</th><th>Net ticket revenue</th><th>Actions</th></tr></thead><tbody>' +
      data.invites.map(i => '<tr><td><b>' + E(i.guest || nameOf(i.template)) + '</b><small class="muted"> ' + E(nameOf(i.template)) + '</small></td><td>' +
      [i.opens, i.visitors, i.reveals, i.rsvps, i.purchases].map(E).join('</td><td>') + '</td><td>' + PV.$(i.revenue) + '</td><td>' +
      (i.revoked ? '<span class="pvpill">Revoked</span>' : shareButton(shareUrl(i.token), e.title, "Share") +
        '<button class="pvbtn sm danger" data-act="pv-si-revoke" data-id="' + E(id) + '" data-token="' + E(i.token) + '">Revoke</button>') +
      '</td></tr>').join("") + '</tbody></table></div><p class="pvnote">Visitors are estimated per browser. Revenue is after refunds and chargebacks.</p>' :
      '<p class="muted">No invitations on this page.</p>') + pagination + '</div>';
    if (!unlocked && (qs.get("upgrade") === "success" || data.upgrade === "pending")) PV.after = root => {
      const message = root.querySelector("#si-upgrade-status");
      if (!message) return;
      const poll = async () => {
        if (!message.isConnected) return;
        try {
          const result = await PV.api("host/invites?event=" + encodeURIComponent(id));
          if (result.upgrade !== "pending") { PV.go(pageUrl); return; }
        } catch { /* A brief network interruption does not end confirmation. */ }
        if (message.isConnected) setTimeout(poll, 4000);
      };
      setTimeout(poll, 1800);
    };
    return shell('<div class="pvgrid si-host"><div class="pvph"><div><h2>Invite guests</h2><p class="muted">' + E(e.title) +
      '</p></div><a class="pvbtn sm" href="#host/invites">Change event</a></div><div class="pvpanel"><h3>Standard link</h3>' +
      status + shareButton(standard, e.title, "Share event link") + '</div>' +
      (usable ? templatesHtml + (data.upgrade === "pending" || qs.get("upgrade") === "success" && !unlocked ?
        '<p class="pvbanner tl" id="si-upgrade-status" role="status">Waiting for Stripe to confirm the upgrade.</p>' : '') + purchase +
        (data.upgrade === "revoked" ? '<p class="pvbanner">This event’s premium collection is disabled. Contact Grooveville for a review.</p>' : '') + creator :
        '<p class="pvbanner">Special Invites are unavailable for this event. Use the standard link for password-protected events.</p>') + table + '</div>');
  };

  PV.acts["pv-si-select"] = () => PV.go("#host/invites/" + encodeURIComponent(document.getElementById("si-pick-event").value));
  PV.acts["pv-si-preview"] = t => {
    const theme = document.querySelector("#si-create [name=theme]")?.value;
    GV.openModal('<div class="pv si-surface si-modal">' + experience({ template: t.dataset.template, theme, title: t.dataset.title }, "") + '</div>',
      el => reveal(el.querySelector(".si-experience")));
  };
  PV.acts["pv-si-create"] = async t => {
    const data = Object.fromEntries(new FormData(document.getElementById("si-create")));
    const result = await PV.api("host/invites", { ...data, event: t.dataset.id });
    GV.openModal('<h3>Invitation link</h3><label class="f">Shareable URL<input class="i" readonly value="' + E(shareUrl(result.token)) +
      '"></label>' + shareButton(shareUrl(result.token), "Grooveville Special Invite", "Share or copy"));
    PV.refresh();
  };
  PV.acts["pv-si-revoke"] = async t => {
    if (!confirm("Disable this invitation link?")) return;
    await PV.api("host/invites/revoke", { event: t.dataset.id, token: t.dataset.token });
    PV.refresh();
  };
  PV.acts["pv-si-upgrade"] = async t => {
    const result = await PV.api("host/invites/upgrade", { event: t.dataset.id });
    if (result.url) location.assign(result.url);
    else PV.refresh();
  };

  PV.inviteAdmin = async () => {
    const data = await PV.api("admin/invites");
    const stats = [["Invitations", data.totals.created], ["Events using Private Letter", data.usage.letter_events],
      ["Events using premium templates", data.usage.premium_events], ["Upgrades purchased", data.sales.purchased], ["Currently unlocked", data.sales.unlocked],
      ["Net upgrade revenue", PV.$(data.sales.revenue)], ["Failed or expired checkouts", data.sales.failed], ["Opens", data.totals.opens],
      ["Reveals", data.totals.reveals], ["RSVPs", data.totals.rsvps], ["RSVPs per open", data.totals.opens ? (100 * data.totals.rsvps / data.totals.opens).toFixed(1) + "%" : "—"],
      ["Paid orders", data.totals.purchases], ["Attributed paid tickets", data.totals.tickets], ["Net attributed revenue", PV.$(data.totals.attributed_revenue)]];
    const summary = stats.map(([label, value]) => '<div><span>' + E(label) + '</span><b>' + E(value) + '</b></div>').join("");
    const controls = '<form class="pvform" id="si-settings" onsubmit="return false"><label class="pvchk"><input type="checkbox" name="enabled"' +
      (data.enabled ? " checked" : "") + '> Enable Special Invites</label>' + templates.map(([key, title]) =>
        '<label class="pvchk"><input type="checkbox" name="template" value="' + key + '"' + (data.disabled.includes(key) ? "" : " checked") + '> ' + E(title) + '</label>').join("") +
      '<button class="pvbtn pk" data-act="pv-si-settings">Save settings</button></form>';
    const upgrades = data.upgrades.map(a => '<tr><td>' + E(a.title) + '</td><td>' + E(a.status) + '</td><td>' +
      E(PV.date(a.paid_at)) + '</td><td>' + PV.$(a.refunded_cents) + '</td><td>' + (["paid", "revoked"].includes(a.status) ?
        '<button class="pvbtn sm" data-act="pv-si-entitlement" data-id="' + E(a.id) + '" data-enable="' + (a.status === "revoked") +
        '">' + (a.status === "revoked" ? "Restore access" : "Disable access") + '</button>' : '') + '</td></tr>').join("");
    const activity = data.activity.map(i => '<tr><td>' + E(nameOf(i.template)) + '</td><td>' + E(PV.date(i.created)) + '</td><td>' +
      [i.opens, i.visitors, i.reveals, i.rsvps, i.purchases].map(E).join('</td><td>') + '</td><td>' + PV.$(i.revenue) +
      '</td><td>' + (i.revoked ? "Revoked" : "Active") + '</td></tr>').join("");
    return '<div class="pvgrid"><h2>Special Invites</h2><div class="pvgrid pvg2"><div class="pvpanel"><h3>Performance</h3><div class="pvcalc">' +
      summary + '</div></div><div class="pvpanel"><h3>Templates and availability</h3>' + controls + '<h4>Template usage</h4><div class="pvcalc">' +
      templates.map(([key, title]) => '<div><span>' + E(title) + '</span><b>' + (data.templates.find(t => t.template === key)?.count || 0) + '</b></div>').join("") +
      '</div></div></div><div class="pvpanel"><h3>Event upgrades</h3>' + adminTable(["Event", "Status", "Paid", "Refunded", "Access"], upgrades) +
      '</div><div class="pvpanel"><h3>Recent invitation activity</h3>' +
      adminTable(["Template", "Created", "Opens", "Visitors", "Reveals", "RSVPs", "Paid orders", "Net revenue", "Status"], activity) + '</div></div>';
  };
  function adminTable(labels, rows) {
    return rows ? '<div class="pvtblw"><table class="pvtbl"><thead><tr>' + labels.map(l => '<th>' + E(l) + '</th>').join("") +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="muted">No records yet.</p>';
  }
  PV.acts["pv-si-settings"] = async () => {
    const form = new FormData(document.getElementById("si-settings"));
    await PV.api("admin/invites/settings", { enabled: form.has("enabled"), disabled: templates.map(t => t[0]).filter(k => !form.getAll("template").includes(k)) });
    PV.refresh();
  };
  PV.acts["pv-si-entitlement"] = async t => {
    await PV.api("admin/invites/entitlement", { id: t.dataset.id, enabled: t.dataset.enable === "true" });
    PV.refresh();
  };
})();
