/* Grooveville Portals (browser): shared core. Loaded after the main site script.
   Every number, permission and status shown here comes from /api/p/* on the server; the browser never decides money. */
(function () {
const PV = window.PV = { me: null, meAt: 0, status: null, html: {}, acts: {}, views: {}, busy: false, mountN: 0 };
const previewParams = new URLSearchParams(location.search);
const publicPreview = previewParams.get("portal-preview") === "1";
const previewReturn = previewParams.get("return") || "";
const founderReturn = /^team-portals(?:\/[a-z]+(?:\/[\w-]+)?)?$/.test(previewReturn) ? previewReturn : "team-portals";
const fb = () => !publicPreview && window.firebase && firebase.apps && firebase.apps.length ? firebase.auth().currentUser : null;
const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
PV.e = E;
PV.$ = c => (c < 0 ? "−" : "") + "$" + (Math.abs(c || 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
PV.lineVal = (l, i) => l.cents != null ? PV.$(l.cents) : l.bps != null ? (i && l.bps > 0 ? "+" : "") + (l.bps / 100) + "%" : E(l.value || "");
PV.m = c => (c < 0 ? "−" : "") + PV.$(Math.abs(c || 0));
PV.date = s => { if (!s) return ""; const d = new Date(String(s).length === 10 ? s + "T12:00:00" : s); return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) };
PV.dt = s => { if (!s) return ""; const d = new Date(String(s).slice(0, 16) + (String(s).length <= 16 ? ":00Z" : "")); return isNaN(d) ? s : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: String(s).length <= 16 ? "UTC" : undefined }) };
PV.ago = s => { const d = (Date.now() - Date.parse(s)) / 1000; if (!(d >= 0)) return PV.date(s); if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + " min ago"; if (d < 86400) return Math.floor(d / 3600) + " h ago"; return PV.date(s) };
PV.toast = m => (window.GV ? GV.toast(m) : alert(m));
/* ---------- API ---------- */
PV.api = async function (path, body, opts) {
  opts = opts || {};
  const method = opts.method || (body ? "POST" : "GET");
  if (publicPreview && (method !== "GET" || !/^(status|events|event|hostpage|rentals\/(listings|availability))$/.test(path.split("?")[0]))) {
    throw new Error("This action is unavailable in public preview.");
  }
  const h = {}; const u = fb(); if (u) h.authorization = "Bearer " + await u.getIdToken();
  let b; if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof Uint8Array) { b = body; h["content-type"] = opts.type || (body.type || "application/octet-stream") } else if (body) { b = JSON.stringify(body); h["content-type"] = "application/json" }
  const r = await fetch("/api/p/" + path, { method, headers: h, body: b, ...(method === "GET" ? { signal: AbortSignal.timeout(12000) } : {}) });
  if (opts.raw) return r; const j = await r.json().catch(() => ({ error: "The server didn't answer (" + r.status + ")" }));
  if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong"), { status: r.status, j }); return j;
};
PV.upload = async (file, purpose) => { const t = file.type || "application/octet-stream"; return PV.api("upload?purpose=" + purpose, file, { method: "PUT", type: t }) };
PV.sha = async buf => [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map(x => x.toString(16).padStart(2, "0")).join("");
let identityLoad;
PV.loadMe = async force => {
  const uid = fb()?.uid || null;
  if (!force && PV.me && Date.now() - PV.meAt < 30000 && (PV.me.uid || null) === uid) return PV.me;
  if (identityLoad?.uid === uid) return identityLoad.promise;
  const promise = Promise.all([
    PV.api("status").catch(e => ({ error: e.message, setup: e.j?.setup })),
    uid ? PV.api("me").catch(e => ({ signedIn: false, error: e.message })) : { signedIn: false },
  ]).then(([status, me]) => {
    if ((fb()?.uid || null) === uid) {
      PV.status = status;
      PV.me = me;
      PV.meAt = Date.now();
    }
    return me;
  }).finally(() => { if (identityLoad?.promise === promise) identityLoad = null; });
  identityLoad = { uid, promise };
  return promise;
};
PV.fullName = p => p ? [p.first, p.middle ? p.middle + "." : "", p.last].filter(Boolean).join(" ") : "";
PV.initials = p => p && p.first ? (p.first[0] + (p.last || "").slice(0, 1)).toUpperCase() : "G";
/* ---------- fonts (cursive signatures) ---------- */
PV.fontsReady = () => document.fonts ? document.fonts.load('44px "Great Vibes"').catch(() => []) : Promise.resolve([]);
/* ---------- icons ---------- */
const IC = { home: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", card: "M3 6h18v12H3zM3 10h18M7 15h4", doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5", sign: "M6 3h9l4 4v6M6 3v18h6M14 3v5h5M9 11h6M9 15h3M15 21l5-5-2-2-5 5v2z", folder: "M3 6h6l2 2h10v11H3z", chart: "M5 20V11M10 20V6M15 20v-8M20 20V9", chat: "M4 5h16v11H9l-5 4z", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6", bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0", cal: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5", layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5", up: "M12 16V4M7 9l5-5 5 5M4 20h16", down: "M12 4v12M7 11l5 5 5-5M4 20h16", arrow: "M5 12h14M13 6l6 6-6 6", ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7v10", scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16", pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", check: "M5 12l5 5 9-10", shield: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z", cash: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", building: "M4 21V8l8-5 8 5v13M9 21v-6h6v6", speaker: "M7 3h10v18H7zM12 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 2L6 8.2 4 8 3 11l2 1v0l-2 1 1 3 2-.2 1.3 1.3L7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.3 2 .2 1-3z", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", plus: "M12 5v14M5 12h14", music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", out: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11", link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1", users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c1-3.5 3.8-5 7-5s6 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c2 .6 3.4 2.2 4 5" };
PV.ic = (n, cls) => '<svg viewBox="0 0 24 24" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : "") + '><path d="' + (IC[n] || IC.grid) + '"/></svg>';
PV.badge = (h, lg) => h && h.verified ? '<span class="pvver' + (lg ? " lg" : "") + '" title="' + (h.official ? "Official Grooveville account" : "Grooveville Peach Verified") + '" aria-label="' + (h.official ? "Official Grooveville account" : "Peach Verified host") + '"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></span>' : "";
/* ---------- original line art (no stock photography needed) ---------- */
PV.houseArt = () => '<svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="pvsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2433"/><stop offset=".55" stop-color="#2b2a2e"/><stop offset="1" stop-color="#151416"/></linearGradient><linearGradient id="pvwin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a8"/><stop offset="1" stop-color="#e48f52"/></linearGradient><radialGradient id="pvglow" cx=".6" cy=".7" r=".6"><stop offset="0" stop-color="#f1ae8a" stop-opacity=".35"/><stop offset="1" stop-color="#f1ae8a" stop-opacity="0"/></radialGradient></defs>'
  + '<rect width="800" height="300" fill="url(#pvsky)"/><rect width="800" height="300" fill="url(#pvglow)"/>'
  + '<g fill="#0f0f10"><path d="M150 300V170l90-38h360l70 30v138z"/><path d="M120 168l130-56h400l90 42-6 6-88-38H254L126 174z" fill="#2b2622"/></g>'
  + '<g fill="url(#pvwin)" opacity=".95"><rect x="270" y="150" width="70" height="60"/><rect x="350" y="150" width="70" height="60"/><rect x="430" y="150" width="70" height="60"/><rect x="510" y="150" width="70" height="60"/><rect x="270" y="225" width="150" height="75" opacity=".85"/><rect x="430" y="225" width="150" height="75" opacity=".7"/><rect x="600" y="182" width="50" height="118" opacity=".55"/></g>'
  + '<g stroke="#0f0f10" stroke-width="5"><path d="M345 150v150M425 150v150M505 150v60M268 218h316"/></g><path d="M250 218h360" stroke="#c9b9a7" stroke-width="2" opacity=".5"/>'
  + '<g fill="none" stroke="#0b0b0c" stroke-width="6" stroke-linecap="round"><path d="M735 300c-6-60-2-110 10-150"/><path d="M745 150c-30-12-58-6-80 14M745 150c-14-26-40-40-72-38M745 150c22-22 50-26 76-16M745 150c10-28 34-42 60-42M745 150c-28 4-46 22-58 46"/></g>'
  + '<g fill="none" stroke="#0b0b0c" stroke-width="5" stroke-linecap="round"><path d="M70 300c4-50 0-90-10-120"/><path d="M60 180c-24-6-44 2-58 18M60 180c4-24 22-38 46-40M60 180c20-10 42-6 58 10"/></g></svg>';
PV.cityArt = () => '<svg viewBox="0 0 240 120"><defs><linearGradient id="pvcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c6a8"/><stop offset="1" stop-color="#a8613f"/></linearGradient></defs><g fill="url(#pvcg)" opacity=".9"><rect x="20" y="60" width="22" height="60"/><rect x="46" y="36" width="26" height="84"/><rect x="76" y="18" width="30" height="102"/><rect x="110" y="44" width="22" height="76"/><rect x="136" y="8" width="28" height="112"/><rect x="168" y="50" width="22" height="70"/><rect x="194" y="30" width="26" height="90"/></g><g fill="#0f0f10" opacity=".55"><rect x="82" y="30" width="4" height="80"/><rect x="92" y="30" width="4" height="80"/><rect x="142" y="20" width="4" height="90"/><rect x="152" y="20" width="4" height="90"/></g></svg>';
/* ---------- shell ---------- */
/* o: {sec:"RENTALS", key, nav:[[route,label,icon,badge]], card:[title,sub,icon], art:true|false, hero:{kick,title,sub,art}} */
/* the approved logo published on the website (Website Studio › brand), else the Grooveville LLC logo */
PV.logo = sec => { const g = window.GV && GV.brandLogo, id = sec === "RENTALS" ? "rentals" : sec === "ENTERTAINMENT" ? "ent" : "hq"; const src = (g && (g(id) || g("hq"))) || "/logo.webp"; return '<img class="pvlogo" src="' + E(src) + '" alt="" width="34" height="34">' };
const LIGHT = ['ADMINISTRATION', 'ACCOUNT', 'AGREEMENTS', 'VERIFY'];
PV.isLight = r => /^(account|sign\/|verify|team-portals)/.test(String(r || ''));
PV.shell = function (o, body) {
  PV.rentalRecords = o.records || [];
  const light = o.light != null ? o.light : LIGHT.includes(o.sec);
  const me = PV.me || {}, cur = "#" + GV.S.route.split("?")[0], unread = (me.notifications || []).filter(n => !n.seen).length;
  const nav = (o.nav || []).map(([href, label, ic, n]) => '<a class="pvnav' + (cur === href || (href !== o.nav[0][0] && cur.startsWith(href + "/")) ? " on" : "") + '" href="' + href + '">' + PV.ic(ic) + '<span>' + E(label) + '</span>' + (n ? '<span class="pvn">' + n + '</span>' : '') + '</a>').join("");
  const mnav = (o.nav || []).map(([href, label, ic, n]) => '<a class="' + (cur === href || (href !== o.nav[0][0] && cur.startsWith(href + "/")) ? "on" : "") + '" href="' + href + '">' + E(label) + (n ? ' (' + n + ')' : '') + '</a>').join("");
  const mobileNav = o.theme === "pv-rental"
    ? '<details class="pv-rental-menu"><summary>Rentals menu</summary><nav aria-label="Rentals sections">' + mnav + '</nav></details>'
    : '<nav class="pvmnav" aria-label="' + E(o.sec) + ' sections">' + mnav + '</nav>';
  const search = o.records ? '<button class="pvicon" data-act="pv-rental-search" aria-label="Search your rental records">' + PV.ic("search") + '</button>' : "";
  const test = PV.status && PV.status.stripe === "test" ? '<span class="pvmode" title="Stripe test mode: no real charges">TEST MODE</span>' : "";
  const portalSwitch = me.signedIn && (me.founder || me.rentalsStaff) && ["RENTALS", "ADMINISTRATION"].includes(o.sec)
    ? '<div class="pv-portal-switch"><select class="pvin" aria-label="Switch portal" data-pv-portal><option value="#rentals"' + (o.sec === "RENTALS" ? ' selected' : '') + '>Tenant Portal</option><option value="' + (me.founder ? '#team-portals' : '#team-portals/rentals') + '"' + (o.sec === "ADMINISTRATION" ? ' selected' : '') + '>' + (me.founder ? 'Founder Portal' : 'Rentals Staff') + '</option></select></div>'
    : "";
  return '<div class="pv' + (o.theme ? ' ' + o.theme : '') + (light ? ' pvl' : '') + '">' +
    '<div class="pvtop"><a class="pvbrand" href="#home">' + PV.logo(o.sec) + 'GROOVEVILLE <span>LLC</span></a><span class="pvdiv"></span><span class="pvsec">' + E(o.sec) + '</span>' +
    '<div class="pvtopr">' + search + test + portalSwitch + (me.founder && o.sec !== "ADMINISTRATION" && o.sec !== "RENTALS" ? '<a class="pvicon" href="/founder-portal" aria-label="Founder tools" title="Founder tools">' + PV.ic("shield") + '</a>' : '') + (me.signedIn ? '<button class="pvicon" data-act="pv-notes" aria-label="Notifications' + (unread ? ", " + unread + " unread" : "") + '">' + PV.ic("bell") + (unread ? '<span class="pvdot">' + unread + '</span>' : '') + '</button><a class="pvav" href="#account" aria-label="Account">' + E(PV.initials(me.profile)) + '</a>' : '<button class="pvbtn sm pk" data-act="pv-signin">Sign in</button>') + '</div></div>' +
    (nav ? mobileNav : '') +
    '<div class="pvbody"' + (nav ? '' : ' style="grid-template-columns:1fr"') + '>' + (nav ? '<aside class="pvside"><div class="pvcard0">' + PV.ic(o.card[2] || "home") + '<div><b>' + E(o.card[0]) + '</b><small>' + E(o.card[1]) + '</small></div></div><nav aria-label="' + E(o.sec) + '">' + nav + '</nav>' + (o.art !== false ? '<div class="pvsideart">' + PV.cityArt() + '<b>GROOVEVILLE</b><small>— ' + E(o.sec) + ' —</small></div>' : '') + '</aside>' : '') +
    '<main class="pvmain">' + (o.hero ? '<section class="pvhero"' + (o.hero.bg ? ' style="--hero-bg:' + o.hero.bg + '"' : '') + '>' + (o.hero.art ? '<div class="pvart" aria-hidden="true">' + o.hero.art + '</div>' : '') + '<div class="pvkick">' + E(o.hero.kick) + '</div><h1>' + o.hero.title + '</h1>' + (o.hero.sub ? '<p>' + E(o.hero.sub) + '</p>' : '') + '<div class="pvrule"></div></section>' : '') + body + '</main></div></div>';
};
PV.sigBlock = (p, opts) => { opts = opts || {}; const name = PV.fullName(p); return '<div class="pvsig">' + (name ? '<div class="pvcursive">' + E(name) + '</div><div class="pvprinted">' + E(name) + '</div>' : '<p class="muted">Add your legal name to create your signature.</p>') + '</div>' };
PV.loading = t => '<div class="pv' + (window.GV && PV.isLight(GV.S.route) ? ' pvl' : '') + '"><div class="pvbody" style="grid-template-columns:1fr"><main class="pvmain"><p class="muted pvloading" role="status">' + E(t || "Loading…") + '</p></main></div></div>';
PV.err = (msg, setup) => setup === "d1" ? '<div class="pvbanner">The portal database isn’t connected yet. See PORTALS-SETUP.md (create the D1 database <b>grooveville-portal</b>).</div>' : '<div class="pvbanner bad">' + E(msg) + '</div>';
/* ---------- routing ---------- */
const ROUTES = [[/^rentals(\/|$)/, "rentals"], [/^entertainment$/, "ent"], [/^events$/, "events"], [/^invite\//, "invite"], [/^e\//, "event"], [/^[ho]\//, "hostpage"], [/^host(\/|$)/, "host"], [/^account$/, "account"], [/^sign\//, "sign"], [/^order\//, "order"], [/^t\//, "ticket"], [/^checkin(\/|$)/, "checkin"], [/^verify$/, "verify"], [/^team-portals(\/|$)/, "admin"]];
const previewRoute = /^(?:rentals(?:\/(?:browse|item\/[^/]+))?|events|entertainment|[eho]\/[^/]+)$/;
const previewBar = () => '<nav class="pv-preview-bar" aria-label="Public preview"><strong>Public preview</strong><a href="#rentals">Rentals</a><a href="#events">Events</a><a class="pvbtn pk sm" href="/#' + E(founderReturn) + '">Back to founder tools</a></nav>';
PV.previewLink = (area, route) => '/?portal-preview=1&return=' + encodeURIComponent(route.split("?")[0]) + '#' + area;
window.pvRoute = function (r) {
  const path = r.split("?")[0], hit = ROUTES.find(([re]) => re.test(path));
  if (publicPreview && !previewRoute.test(path)) return '<div class="wrap">' + previewBar() + '<p class="pvempty">Choose Rentals or Events to continue browsing the public preview.</p></div>';
  if (!hit) return null;
  const uid = fb()?.uid || null, key = JSON.stringify([r, uid]);
  if (document.getElementById("pvroot")?.dataset.keep !== key) setTimeout(pvMount, 0);
  const cached = PV.html[r];
  const inner = '<div id="pvroot" data-r="' + E(r) + '" data-keep="' + E(key) + '">' + ((cached?.uid === uid && cached.body) || PV.loading(hit[1] === "admin" ? "Opening founder tools…" : undefined)) + '</div>';
  const workspace = ["admin", "account", "host"].includes(hit[1]);
  return '<div class="' + (workspace ? "pv-full-page" : hit[1] === "rentals" || hit[1] === "events" ? "pv-destination" : "wrap") + '">' + (publicPreview ? previewBar() : '') + inner + '</div>';
};
PV.isRoute = r => ROUTES.some(([re]) => re.test(String(r || "").split("?")[0]));
window.pvMount = async function (force) {
  const root = document.getElementById("pvroot"); if (!root) return; const r = root.dataset.r, n = ++PV.mountN;
  const path = r.split("?")[0], qs = new URLSearchParams(r.split("?")[1] || ""), parts = path.split("/"), hit = ROUTES.find(([re]) => re.test(path));
  const uid = fb()?.uid || null;
  try { await PV.loadMe(force); if (uid !== (fb()?.uid || null) || n !== PV.mountN) return; const html = await PV.views[hit[1]]({ r, path, parts, qs }); if (uid !== (fb()?.uid || null) || n !== PV.mountN || !document.getElementById("pvroot") || document.getElementById("pvroot").dataset.r !== r) return; PV.html[r] = { uid, body: html }; root.innerHTML = html; if (PV.after) { const a = PV.after; PV.after = null; try { await a(root) } catch (e) { console.warn(e) } } }
  catch (e) { console.warn(e); if (n === PV.mountN) root.innerHTML = '<div class="pv' + (PV.isLight(r) ? ' pvl' : '') + '"><div class="pvbody" style="grid-template-columns:1fr"><main class="pvmain">' + PV.err(e.name === "TimeoutError" ? "The portal took too long to respond. Reload to try again." : e.message, e.j && e.j.setup) + '</main></div></div>' }
};
PV.refresh = () => { PV.meAt = 0; return pvMount(true) };
PV.go = h => { if (location.hash === h) PV.refresh(); else location.hash = h };
document.addEventListener("change", e => {
  if (e.target.matches("[data-pv-portal]")) PV.go(e.target.value);
});
/* ---------- auth ---------- */
PV.signin = function (mode, then) {
  if (publicPreview) { PV.toast("Return to founder tools to leave public preview."); return; }
  PV.authNext = then;
  if (!(window.firebase && firebase.apps && firebase.apps.length)) { PV.toast("Sign-in works on grooveville.org"); return }
  mode = mode || "in";
  GV.openModal('<form id="pvauth" class="pvauth"><h3>' + (mode === "up" ? "Create your Grooveville account" : "Sign in to Grooveville") + '</h3><p class="muted small" style="margin:6px 0 12px">One account for Rentals, Entertainment and your documents. Signing in doesn’t give Back Office access.</p>' +
    (mode === "up" ? '<div class="grid2"><label class="f">Legal first name<input class="i" name="first" autocomplete="given-name" required></label><label class="f">Legal last name<input class="i" name="last" autocomplete="family-name" required></label></div>' : '') +
    '<label class="f">Email<input class="i" type="email" name="email" autocomplete="email" required></label><label class="f">Password<input class="i" type="password" name="pass" autocomplete="' + (mode === "up" ? "new-password" : "current-password") + '" minlength="6" required></label><p class="small" id="pvauthmsg" role="alert" style="color:#c0392b;min-height:1em"></p>' +
    '<div class="row"><button type="button" class="btn ghost" data-act="pv-google">Continue with Google</button><button class="btn olive">' + (mode === "up" ? "Create account" : "Sign in") + '</button></div><p class="small" style="margin-top:10px">' + (mode === "up" ? '<a href="#" data-act="pv-signin">I already have an account</a>' : '<a href="#" data-act="pv-signup">Create an account</a> · <a href="#" data-act="pv-reset">Forgot password?</a>') + '</p></form>',
    el => el.querySelector("#pvauth").addEventListener("submit", async ev => { ev.preventDefault(); const F = new FormData(ev.target), msg = el.querySelector("#pvauthmsg");
      try { if (mode === "up") { await firebase.auth().createUserWithEmailAndPassword(String(F.get("email")).trim(), String(F.get("pass"))); GV.closeModal(); PV.meAt = 0; await PV.loadMe(true); try { await PV.api("me", { first: String(F.get("first")).trim(), last: String(F.get("last")).trim() }) } catch (e) { } PV.toast("Account created. You’re signed in.") }
        else { await firebase.auth().signInWithEmailAndPassword(String(F.get("email")).trim(), String(F.get("pass"))); GV.closeModal() } PV.meAt = 0; setTimeout(() => { PV.authNext = null; if (then) then(); else PV.refresh() }, 400) }
      catch (e) { msg.textContent = ({ "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.", "auth/user-not-found": "No account with that email.", "auth/email-already-in-use": "That email already has an account. Sign in instead.", "auth/weak-password": "Use at least 6 characters.", "auth/invalid-email": "Check the email address." })[e.code] || e.message } }));
};
/* ---------- actions ---------- */
window.pvAct = function (a, t, ev) {
  if (!/^pv-/.test(a)) return false; if (ev && t.tagName === "A") ev.preventDefault();
  const fn = PV.acts[a]; if (!fn) return true;
  (async () => { if (t.dataset.busy) return; try { if (t.tagName === "BUTTON") { t.dataset.busy = 1; t.disabled = true } await fn(t, ev) } catch (e) { PV.toast(e.message || "Something went wrong") } finally { if (t.isConnected && t.tagName === "BUTTON") { delete t.dataset.busy; t.disabled = false } } })();
  return true;
};
PV.acts["pv-signin"] = () => PV.signin("in"); PV.acts["pv-signup"] = () => PV.signin("up");
PV.acts["pv-google"] = async () => { const p = new firebase.auth.GoogleAuthProvider(); await firebase.auth().signInWithPopup(p); GV.closeModal(); PV.meAt = 0; const next = PV.authNext; PV.authNext = null; setTimeout(next || PV.refresh, 400) };
PV.acts["pv-reset"] = () => {
  const email = document.querySelector('#pvauth [name=email]')?.value || "";
  const next = PV.authNext;
  GV.openModal('<form id="pvreset" class="pvauth"><h3>Reset your password</h3><p class="muted small">Grooveville will send a reset link to the email on your account.</p>' +
    '<label class="f">Email<input class="i" type="email" name="email" autocomplete="email" required value="' + E(email) + '"></label><p role="status" class="small"></p>' +
    '<div class="row"><button class="btn olive">Send reset link</button><button type="button" class="btn ghost" data-act="pv-reset-back">Back to sign in</button></div></form>', root => {
      const form = root.querySelector("#pvreset");
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const button = form.querySelector('button:not([type])'), status = form.querySelector('[role="status"]');
        if (button.disabled) return;
        button.disabled = true;
        try {
          await firebase.auth().sendPasswordResetEmail(new FormData(form).get("email").trim());
          status.textContent = "If this email has an account, check your inbox and spam folder for a reset link.";
        } catch (e) {
          status.textContent = e.code === "auth/user-not-found" ? "If this email has an account, check your inbox and spam folder for a reset link." : "The reset link couldn’t be sent right now. Try again shortly.";
        } finally { button.disabled = false; }
      });
    });
  PV.authNext = next;
};
PV.acts["pv-reset-back"] = () => PV.signin("in", PV.authNext);

PV.acts["pv-signout"] = async () => { await firebase.auth().signOut() };
PV.acts["pv-rental-search"] = () => {
  const records = PV.rentalRecords;
  GV.openModal('<h3>Search rental records</h3><label class="f">Search agreements, payments, and requests<input type="search" class="i" id="pv-record-query"></label><div id="pv-record-results" class="pvnotes" aria-live="polite"></div>', el => {
    const input = el.querySelector("#pv-record-query");
    const results = el.querySelector("#pv-record-results");
    const showMatches = () => {
      const query = input.value.trim().toLowerCase();
      const matches = records.filter(([label]) => label && label.toLowerCase().includes(query)).slice(0, 12);
      results.innerHTML = matches.length
        ? matches.map(([label, href]) => '<a class="pvnote1" data-act="close-modal" href="' + E(href) + '">' + E(label) + '</a>').join("")
        : '<p class="muted">No matching records.</p>';
    };
    input.addEventListener("input", showMatches);
    showMatches();
    input.focus();
  });
};
PV.acts["pv-notes"] = async () => { const N = (PV.me && PV.me.notifications) || []; GV.openModal('<h3>Notifications</h3><div class="pvnotes">' + (N.length ? N.map(n => '<a class="pvnote1' + (n.seen ? "" : " new") + '" href="' + E(n.link || "#account") + '" data-act="close-modal"><b>' + E(n.title) + '</b><small>' + E(n.body || "") + ' · ' + PV.ago(n.at) + '</small></a>').join("") : '<p class="muted">Nothing yet.</p>') + '</div><div class="row"><button class="btn ghost" data-act="close-modal">Close</button></div>'); if (N.some(n => !n.seen)) { await PV.api("me/seen", {}); N.forEach(n => n.seen = 1) } };
PV.acts["pv-verify-email"] = async () => { const u = fb(); if (!u) return; await u.sendEmailVerification(); PV.toast("Verification email sent to " + u.email) };
PV.acts["pv-reload-user"] = async () => {
  const user = fb();
  if (!user) return;
  await user.reload();
  await user.getIdToken(true);
  if (identityLoad?.uid === user.uid) await identityLoad.promise;
  await PV.refresh();
  PV.toast(PV.me?.emailVerified ? "Email verified." : "Verification is still pending. Open the link for this account and try again.");
};
/* ---------- portal conversations ---------- */
PV.support = async (qs, team = false) => {
  const endpoint = team ? "admin/support" : "support";
  const base = team ? "#team-portals/support" : "#rentals/support";
  const id = qs.get("id");
  const result = await PV.api(endpoint + (id ? "?id=" + encodeURIComponent(id) : ""));
  const messageForm = '<form class="pvform" id="pvsup" onsubmit="return false">' +
    (id ? '' : '<label class="pvf"><span>Subject</span><input class="pvin" name="subject" maxlength="120"></label>') +
    '<label class="pvf"><span>' + (id ? "Reply" : "Message") + '</span><textarea name="message" maxlength="3000" required></textarea></label>' +
    '<div><button class="pvbtn pk" data-act="pv-support-send" data-id="' + E(id) + '" data-team="' + (team ? "yes" : "no") + '">Send ' + (id ? "reply" : "message") + '</button></div></form>';
  if (id) return '<div class="pvpanel"><a href="' + base + '">‹ All messages</a><h2>' + E(result.thread.subject) + '</h2><div class="pvlist" style="margin:16px 0">' +
    result.replies.map(r => '<article class="pvpanel"><b>' + (r.author === "team" ? "Grooveville team" : team ? "Customer" : "You") + '</b> <small class="pvnote">' + E(PV.dt(r.created)) + '</small><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px">' + E(r.body) + '</p></article>').join("") +
    '</div>' + messageForm + '</div>';
  const threads = result.threads.map(t => '<a class="pvq" href="' + base + '?id=' + E(t.id) + '"><span><b>' + E(t.subject) + '</b><small>' + (t.email ? E(t.email) + ' · ' : '') + E(PV.dt(t.updated)) + '</small></span></a>').join("");
  return '<div class="pvpanel"><h2>' + (team ? "Customer messages" : "Messages") + '</h2>' + (threads || '<p class="pvnote">No conversations yet.</p>') + '</div>' +
    (team ? '' : '<div class="pvpanel" style="margin-top:16px"><h3>New message</h3><p class="pvnote" style="margin-bottom:12px">Grooveville will reply here. Keep card numbers and passwords out of messages.</p>' + messageForm +
      '<p class="pvnote" style="margin-top:16px">Questions about a charge or receipt? <a href="mailto:jaja+grooveville-billing@vybr8.live">Email Grooveville Billing</a>.</p></div>');
};
PV.acts["pv-support-send"] = async button => {
  const form = document.getElementById("pvsup");
  if (!form.reportValidity()) return;
  const team = button.dataset.team === "yes";
  const data = Object.fromEntries(new FormData(form));
  const r = await PV.api(team ? "admin/support" : "support", { ...data, id: button.dataset.id });
  PV.toast("Message sent.");
  await PV.go((team ? "#team-portals/support" : "#rentals/support") + "?id=" + r.id);
};

/* ---------- account ---------- */
PV.views.account = async () => {
  const me = PV.me; if (!me.signedIn) return PV.shell({ sec: "ACCOUNT" }, '<div class="pvpanel" style="max-width:560px"><h3>Your Grooveville account</h3><p class="muted" style="margin-bottom:16px">One sign-in for Grooveville Rentals, Entertainment and your agreements.</p><div class="pvrow"><button class="pvbtn pk" data-act="pv-signin">Sign in</button><button class="pvbtn" data-act="pv-signup">Create account</button></div></div>');
  const p = me.profile || {}, docs = (await PV.api("docs/mine").catch(() => ({ docs: [] }))).docs;
  if (me.hasPhoto) PV.after = async root => {
    const response = await PV.api("me/photo", undefined, { raw: true });
    const target = root.querySelector("#pv-account-photo");
    if (!response.ok || !target) return;
    const url = URL.createObjectURL(await response.blob());
    if (!target.isConnected) { URL.revokeObjectURL(url); return; }
    target.addEventListener("load", () => { target.hidden = false; URL.revokeObjectURL(url); }, { once: true });
    target.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
    target.src = url;
  };
  const photoPanel = '<form class="pvpanel pvform pv-account-photo" id="pvphotoform" onsubmit="return false"><h3>Profile photo</h3>' +
    (me.hasPhoto ? '<img id="pv-account-photo" class="pv-profile-image" alt="Your profile photo" hidden>' : '') +
    '<label class="pvf"><span>Choose a photo</span><input class="pvin" type="file" name="photo" accept="image/png,image/jpeg,image/webp"></label>' +
    '<p class="pvnote">Your account photo is private. You can copy it to your public Host profile from Host profile settings.</p><div class="pvrow"><button class="pvbtn pk" data-act="pv-account-photo">Save photo</button>' +
    (me.hasPhoto ? '<button class="pvbtn" data-act="pv-account-photo-remove">Remove photo</button>' : '') + '</div></form>';
  const links = [["#rentals", "Grooveville Rentals", "home"], ["#entertainment", "Grooveville Entertainment", "music"], me.host ? ["#host", "Host dashboard", "star"] : ["#host", "Become a host", "star"]].concat((me.staffEvents || []).length || me.host ? [["#checkin", "Door check-in", "scan"]] : []).concat(me.admin || me.finance ? [["#team-portals", "Grooveville administration", "gear"]] : []);
  return PV.shell({ sec: "ACCOUNT", nav: [["#account", "Profile & Settings", "user"], ["#rentals", "Rentals", "home"], ["#host", "Host", "star"]], card: ["My Account", me.email || "", "user"], hero: { kick: "Grooveville", title: "Profile &amp; Settings", sub: "Your legal name, signature, verification and documents." } },
    (p.name_request ? '<div class="pvbanner tl">Your name change request is waiting for Grooveville to review it.</div>' : '') +
    '<div class="pvgrid pvg2"><div class="pvpanel"><h3>Legal name</h3><p class="pvnote" style="margin-bottom:12px">Used for your typed electronic signature. ' + (p.name_verified ? 'Your name has been verified, so changes go to Grooveville for review.' : 'Enter it exactly as on your ID.') + '</p><form class="pvform c3" id="pvname" onsubmit="return false"><label class="pvf"><span>First name</span><input class="pvin" name="first" value="' + E(p.first) + '" autocomplete="given-name"></label><label class="pvf"><span>Middle initial (optional)</span><input class="pvin" name="middle" value="' + E(p.middle) + '" maxlength="1"></label><label class="pvf"><span>Last name</span><input class="pvin" name="last" value="' + E(p.last) + '" autocomplete="family-name"></label><label class="pvf full"><span>Phone</span><input class="pvin" name="phone" value="' + E(p.phone) + '" autocomplete="tel"></label>' + (p.name_verified ? '<label class="pvf full"><span>Reason for the change (e.g. marriage)</span><input class="pvin" name="reason"></label>' : '') + '<div class="full pvrow"><button class="pvbtn pk" data-act="pv-save-name">Save</button></div></form></div>' +
    '<div class="pvpanel"><div class="pvph"><h3>Your signature</h3>' + (p.name_verified || me.emailVerified ? '<span class="pvpill ok">' + PV.ic("check") + (p.name_verified ? "Name verified" : "Email verified") + '</span>' : '<span class="pvpill warn">Signature preview</span>') + '</div>' + PV.sigBlock(p) + '<p class="pvnote" style="margin-top:12px">This is how your typed electronic signature appears on agreements. It’s applied only when you press <b>Agree &amp; Sign</b> on a document.</p>' +
    '<p class="pvnote" style="margin-top:10px">Electronic records consent: ' + (p.esign_consent_at ? 'given ' + PV.date(p.esign_consent_at) + ' <button class="pvbtn sm" data-act="pv-esign-withdraw">Withdraw consent</button>' : 'not given yet (you’ll be asked before your first signature)') + '</p></div></div>' +
    photoPanel +
    '<div class="pvgrid pvg2" style="margin-top:18px"><div class="pvpanel"><h3>Documents</h3>' + (docs.length ? '<div class="pvlist">' + docs.map(d => '<div class="pvli">' + PV.ic("doc") + '<div><b>' + E(d.title) + '</b><small>' + E(d.division) + ' · ' + (d.completed_at ? 'completed ' + PV.date(d.completed_at) : 'sent ' + PV.date(d.sent_at)) + '</small></div><a class="pvbtn sm' + (d.my_status === "pending" && d.status !== "completed" ? " pk" : "") + '" href="#sign/' + E(d.id) + '">' + (d.my_status === "pending" && !["completed", "canceled", "expired", "superseded"].includes(d.status) ? "Review &amp; sign" : "Open") + '</a></div>').join("") + '</div>' : '<p class="muted">No documents yet.</p>') + '</div>' +
    '<div class="pvpanel"><h3>Go to</h3>' + links.map(([h, l, i]) => '<a class="pvq" href="' + h + '">' + PV.ic(i) + '<span><b>' + E(l) + '</b></span><i>›</i></a>').join("") + '<button class="pvq" data-act="pv-signout">' + PV.ic("out") + '<span><b>Sign out</b></span></button><p class="pvnote" style="margin-top:12px">Signed in as ' + E(me.email) + ' · ' + E(me.auth || "") + '</p></div></div>');
};
PV.acts["pv-account-photo"] = async () => {
  const file = new FormData(document.getElementById("pvphotoform")).get("photo");
  if (!file?.size) throw new Error("Choose a photo first");
  const { key } = await PV.upload(file, "account");
  await PV.api("me/photo", { key });
  PV.toast("Profile photo saved");
  PV.refresh();
};
PV.acts["pv-account-photo-remove"] = async () => {
  await PV.api("me/photo", {});
  PV.toast("Profile photo removed");
  PV.refresh();
};
PV.acts["pv-save-name"] = async t => { const F = new FormData(document.getElementById("pvname")); const j = await PV.api("me", Object.fromEntries(F)); PV.toast(j.pending ? "Sent to Grooveville for review" : "Saved"); PV.refresh() };
PV.acts["pv-esign-withdraw"] = async () => { if (!confirm("Withdraw your consent to sign electronically? You won't be able to sign Grooveville documents online until you consent again. Contact Grooveville for paper copies.")) return; await PV.api("me/esign-withdraw", {}); PV.refresh() };
/* ---------- verify a PDF ---------- */
PV.views.verify = async () => PV.shell({ sec: "VERIFY" }, '<div class="pvpanel" style="max-width:640px"><h3>Verify a Grooveville agreement</h3><p class="pvnote" style="margin-bottom:14px">Choose a signed PDF. Its fingerprint (SHA-256) is calculated on this device and compared with Grooveville’s records. The file itself isn’t uploaded. Any change to the file, even one character, makes the fingerprint different.</p><input type="file" accept="application/pdf" id="pvvf" class="pvin"><div id="pvvr" style="margin-top:16px"></div></div>');
document.addEventListener("change", async e => { if (e.target.id !== "pvvf" || !e.target.files[0]) return; const out = document.getElementById("pvvr"); out.textContent = "Checking…"; const h = await PV.sha(await e.target.files[0].arrayBuffer()); try { const j = await PV.api("verify", { sha256: h }); out.innerHTML = j.match ? '<div class="pvres ok">' + (j.kind === "final" ? "Matches a completed agreement" : "Matches an original (unsigned) document") + '<small>' + E(j.title) + (j.completed ? " · completed " + PV.date(j.completed) : "") + '</small></div><p class="pvnote" style="margin-top:8px">SHA-256 ' + h + '</p>' : '<div class="pvres bad">No match<small>This file isn’t identical to any document in Grooveville’s records.</small></div><p class="pvnote" style="margin-top:8px">SHA-256 ' + h + '</p>' } catch (er) { out.textContent = er.message } });
/* brand page call-to-action */
window.pvBrandCta = function (id) {
  if (id === "rentals") return '<a class="pvcta" href="#rentals"><b>Grooveville Rentals portal</b><span>Request rentals, sign agreements and pay securely.</span><i>Open ›</i></a>';
  if (id === "ent") return '<a class="pvcta" href="#entertainment"><b>Grooveville Entertainment events</b><span>Tickets, verified hosts and hosting with Grooveville.</span><i>See events ›</i></a>';
  return "";
};
})();
