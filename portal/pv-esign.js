/* Grooveville electronic signatures (browser side).
   The server is the record: it checks the SHA-256 of the exact PDF the signer was shown, the consent, the signer's
   sign-in and order, and keeps the audit trail. This file renders documents (PDF.js, self-hosted), collects the
   signature, lets administrators place fields and build agreements, and assembles the completed PDF (pdf-lib, self-hosted):
   signatures stamped in place plus a certificate page. The finished file's SHA-256 is registered on the server. */
(function () {
const E = PV.e;
const ES = PV.esign = {};
const DST = { draft: ["Draft", ""], sent: ["Awaiting signatures", "warn"], partially_signed: ["Partially signed", "warn"], completed: ["Completed", "ok"], expired: ["Expired", "bad"], canceled: ["Canceled", ""], superseded: ["Superseded", ""] };
ES.DST = DST;
const ROLE = { customer: "Customer", tenant: "Tenant", host: "Host", landlord: "Landlord", grooveville: "Grooveville LLC", cosigner: "Co-signer", witness: "Witness" };
ES.ROLE = ROLE;
const FT = { signature: "Signature", initials: "Initials", date: "Date signed", name: "Printed name", text: "Text" };
/* ---------- libraries (self-hosted) ---------- */
let pj = null, pl = null;
ES.pdfjs = () => pj || (pj = import("/vendor/pdfjs/pdf.min.mjs").then(m => { m.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs"; return m }).catch(e => { pj = null; throw new Error("The PDF viewer couldn’t load") }));
ES.pdflib = () => pl || (pl = window.PDFLib ? Promise.resolve(window.PDFLib) : new Promise((res, rej) => { const s = document.createElement("script"); s.src = "/vendor/pdf-lib/pdf-lib.min.js"; s.onload = () => res(window.PDFLib); s.onerror = () => { pl = null; rej(new Error("The PDF tools couldn’t load")) }; document.head.appendChild(s) }));
ES.fetchBytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error("The document couldn’t be downloaded (" + r.status + ")"); return new Uint8Array(await r.arrayBuffer()) };
/* render every page into `box` as .pvpage[data-page] with a canvas; returns page count */
ES.render = async (box, bytes, width) => {
  const lib = await ES.pdfjs(), pdf = await lib.getDocument({ data: bytes.slice(0), standardFontDataUrl: "/vendor/pdfjs/standard_fonts/", iccUrl: "/vendor/pdfjs/iccs/", wasmUrl: "/vendor/pdfjs/wasm/" }).promise;
  box.innerHTML = ""; const W = Math.min(width || 820, Math.max(280, box.clientWidth - 32 || 820)), dpr = Math.min(2, window.devicePixelRatio || 1);
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i), v1 = pg.getViewport({ scale: 1 }), sc = W / v1.width, vp = pg.getViewport({ scale: sc * dpr });
    const wrap = document.createElement("div"); wrap.className = "pvpage"; wrap.dataset.page = i; wrap.style.width = W + "px"; wrap.style.aspectRatio = v1.width + " / " + v1.height;
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); wrap.appendChild(cv); box.appendChild(wrap);
    await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
  }
  return pdf.numPages;
};
const pos = f => "left:" + (f.x * 100) + "%;top:" + (f.y * 100) + "%;width:" + (f.w * 100) + "%;height:" + (f.h * 100) + "%";
const fmtD = s => s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
/* ---------- ESIGN / UETA disclosure ---------- */
ES.disclosure = () => { const em = (PV.status && PV.status.support) || ""; return '<details class="pvdisc" open><summary><b>Electronic records and signatures disclosure</b></summary><ul class="pvnote" style="margin:10px 0 0 18px;display:grid;gap:6px">' +
  '<li>You can choose to receive and sign Grooveville documents electronically. Your typed legal name, applied when you press <b>Agree &amp; Sign</b>, is your electronic signature and has the same effect as a handwritten one.</li>' +
  '<li>You can ask for a paper copy of any document' + (em ? ' by writing to ' + E(em) : ' by contacting Grooveville') + '. You can also sign on paper instead; contact Grooveville before signing.</li>' +
  '<li>You can withdraw this consent at any time in Profile &amp; Settings. Withdrawing doesn’t undo documents you already signed.</li>' +
  '<li>You need a current web browser, an email address, and a way to open, save or print PDF files. Keep your email address up to date.</li>' +
  '<li>Grooveville keeps a record of your signature: your sign-in, the time, your IP address and browser, and a fingerprint (SHA-256) of the exact document you signed.</li></ul></details>' };
/* ---------- signer view ---------- */
const verifyPanel = message => '<div class="pvpanel"><h3>Verify your email first</h3><p class="pvnote" style="margin-bottom:12px">' + E(message) + '</p><div class="pvrow"><button class="pvbtn pk" data-act="pv-verify-email">Send verification email</button><button class="pvbtn" data-act="pv-reload-user">I verified it</button></div></div>';
PV.views.sign = async ({ parts }) => {
  const id = parts[1] || ""; if (!PV.me.signedIn) return PV.shell({ sec: "AGREEMENTS" }, '<div class="pvpanel" style="max-width:560px"><h3>Sign in to view this document</h3><p class="muted" style="margin:6px 0 16px">Use the email address the document was sent to.</p><div class="pvrow"><button class="pvbtn pk" data-act="pv-signin">Sign in</button><button class="pvbtn" data-act="pv-signup">Create account</button></div></div>');
  let j;
  try { j = await PV.api("doc?id=" + encodeURIComponent(id)) }
  catch (err) {
    if (err.j?.code !== "verify") throw err;
    return PV.shell({ sec: "AGREEMENTS" }, verifyPanel(err.message));
  }
  const d = j.doc, me = j.me, mine = me ? d.signers.find(s => s.id === me.id) : null, myOrd = mine ? mine.ord : -1;
  const open = ["sent", "partially_signed"].includes(d.status), canSign = open && me && me.status === "pending" && !me.waiting, p = j.profile || {}, name = PV.fullName(p);
  const myText = d.fields.filter(f => f.signer === myOrd && f.type === "text");
  ES.cur = { d, me, myOrd, name, j };
  PV.after = async root => { await PV.fontsReady(); const box = root.querySelector("#pvpages"); try { const bytes = await ES.fetchBytes(d.source), h = await PV.sha(bytes); ES.cur.hash = h; ES.cur.bytes = bytes; await ES.render(box, bytes); ES.overlay(box, d, myOrd, canSign); const st = root.querySelector("#pvhashst"); if (st) st.innerHTML = h === d.source_hash ? '<span class="pvpill ok">' + PV.ic("shield") + 'Document fingerprint matches</span>' : '<span class="pvpill bad">The file doesn’t match the original. Don’t sign; reload the page.</span>'; if (h !== d.source_hash) { const b = root.querySelector('[data-act="pv-sign"]'); if (b) b.disabled = true } } catch (e) { box.innerHTML = '<div class="pvbanner bad">' + E(e.message) + '</div>' } };
  const side = '<div class="pvpanel"><div class="pvlbl">' + E(d.division === "entertainment" ? "Grooveville Entertainment" : d.division === "rentals" ? "Grooveville Rentals" : "Grooveville") + '</div><h2 style="margin:6px 0 10px;font-size:24px">' + E(d.title) + '</h2><span class="pvpill ' + (DST[d.status] || ["", ""])[1] + '">' + (DST[d.status] || [d.status])[0] + '</span><div id="pvhashst" style="margin-top:10px"></div>' + (d.message ? '<p class="pvnote" style="margin-top:12px;white-space:pre-wrap">' + E(d.message) + '</p>' : '') + (d.expires_at && open ? '<p class="pvnote" style="margin-top:8px">Sign by ' + PV.date(d.expires_at) + '</p>' : '') +
    '<h4 style="margin:18px 0 8px">Signers</h4><div class="pvlist">' + d.signers.map(s => '<div class="pvli"><span class="pvck' + (s.status === "signed" ? "" : " off") + '">' + (s.status === "signed" ? "✓" : s.ord + 1) + '</span><div><b>' + E(s.name) + (s.me ? " (you)" : "") + '</b><small>' + E(ROLE[s.role] || s.role) + ' · ' + (s.status === "signed" ? "signed " + PV.dt(s.signed_at) : s.status === "declined" ? "declined" : "waiting") + '</small></div></div>').join("") + '</div></div>';
  let act = "";
  if (d.status === "completed") act = '<div class="pvpanel"><h3>Completed</h3><p class="pvnote">All parties signed. The completed PDF includes every signature and a certificate page with the audit trail.</p>' + (d.final ? '<a class="pvbtn pk block" style="margin-top:14px" href="' + E(d.final) + '">' + PV.ic("down") + 'Download signed PDF</a>' : '') + '<p class="pvnote" style="margin-top:12px">Completed file SHA-256:<br><code style="word-break:break-all">' + E(d.final_hash) + '</code><br>Check any copy at <a href="#verify">Verify a document</a>.</p></div>';
  else if (!me) act = '<div class="pvpanel"><p class="muted">You’re viewing this document as an administrator.</p></div>';
  else if (me.status === "signed") act = '<div class="pvpanel"><h3>You signed this document</h3><p class="pvnote">' + PV.dt(mine.signed_at) + '. You’ll get the completed copy when every party has signed.</p></div>';
  else if (me.status === "declined") act = '<div class="pvpanel"><p class="muted">You declined to sign this document.</p></div>';
  else if (!open) act = '<div class="pvpanel"><p class="muted">This document is ' + E((DST[d.status] || [d.status])[0].toLowerCase()) + ' and can’t be signed.</p></div>';
  else if (me.waiting) act = '<div class="pvpanel"><h3>Not your turn yet</h3><p class="pvnote">Another party signs first. We’ll notify you when it’s ready for you.</p></div>';
  else if (!name) act = '<div class="pvpanel"><h3>Add your legal name</h3><p class="pvnote" style="margin-bottom:12px">Your signature is your legal name. Add it in Profile &amp; Settings.</p><a class="pvbtn pk" href="#account">Open Profile &amp; Settings</a></div>';
  else if (!j.emailVerified && !p.name_verified) act = verifyPanel("Before you sign, confirm the email address on your account.");
  else act = '<form class="pvpanel" id="pvsignf" onsubmit="return false"><h3>Review and sign</h3><p class="pvnote" style="margin:4px 0 14px">Read every page. Fields marked for you are highlighted.</p>' +
    myText.map(f => '<label class="pvf"><span>' + E(f.label || "Text") + (f.required ? " *" : "") + '</span><input class="pvin" name="t_' + E(f.id) + '" maxlength="200"></label>').join("") +
    (p.esign_consent_at ? '' : ES.disclosure() + '<label class="pvchk" style="margin-top:10px"><input type="checkbox" name="esign"><span>I’ve read the disclosure and agree to use electronic records and signatures.</span></label>') +
    '<div class="pvlbl" style="margin-top:16px">Your signature</div>' + PV.sigBlock(p) + '<p class="pvnote">Initials: <b>' + E((p.first[0] + (p.middle || "") + p.last[0]).toUpperCase()) + '</b> · Signing as ' + E(PV.me.email || "") + '</p>' +
    '<label class="pvchk" style="margin-top:14px"><input type="checkbox" name="consent"><span>I have reviewed this document. I agree to sign it electronically and intend my typed legal name above to be my signature, with the same effect as a handwritten signature.</span></label>' +
    '<button class="pvbtn pk lg block" style="margin-top:14px" data-act="pv-sign">' + PV.ic("sign") + 'Agree &amp; Sign</button><button class="pvbtn sm" style="margin-top:10px" data-act="pv-decline">Decline to sign</button></form>';
  const admin = PV.me.admin && d.status === "partially_signed" && d.signers.every(s => s.status === "signed") ? '<div class="pvpanel"><h3>Ready to finalize</h3><p class="pvnote" style="margin-bottom:12px">Builds the completed PDF (signatures + certificate page), registers its fingerprint and sends copies to every party.</p><button class="pvbtn pk block" data-act="pv-finalize" data-id="' + E(d.id) + '">Finalize agreement</button></div>' : '';
  const back = d.division === "entertainment" ? "#host" : "#rentals/agreements";
  return PV.shell({ sec: "AGREEMENTS" }, '<a class="pvprice" href="' + back + '" style="text-decoration:none">‹ Back</a><div style="height:14px"></div><div class="pvdoc"><div class="pvpages" id="pvpages"><p class="muted" style="color:#bbb">Loading document…</p></div><div class="pvgrid" style="gap:16px">' + side + act + admin + ES.trail(d) + '</div></div>');
};
ES.trail = d => d.events && d.events.length ? '<details class="pvpanel"><summary><b>Audit trail</b> (' + d.events.length + ')</summary><div class="pvlist" style="margin-top:10px">' + d.events.map(e => '<div class="pvli"><div><b>' + E(e.event.replace(/_/g, " ")) + '</b><small>' + E(new Date(e.at).toISOString().replace("T", " ").slice(0, 19)) + ' UTC' + (e.ip ? " · IP " + E(e.ip) : "") + '</small></div></div>').join("") + '</div><p class="pvnote" style="margin-top:8px">Original SHA-256: <code style="word-break:break-all">' + E(d.source_hash) + '</code></p></details>' : '';
ES.overlay = (box, d, myOrd, canSign) => {
  const sg = {}; d.signers.forEach(s => { sg[s.ord] = s });
  box.querySelectorAll(".pvpage").forEach(pg => { const n = +pg.dataset.page; d.fields.filter(f => f.page === n).forEach(f => { const s = sg[f.signer], el = document.createElement("div"); const done = s && s.status === "signed", mine = f.signer === myOrd;
    el.className = "pvfld ro " + (done ? "done" : mine ? "mine" : "s" + (f.signer % 4)); el.style.cssText = pos(f) + ";cursor:default"; el.title = FT[f.type] + " · " + (s ? s.name : "");
    el.innerHTML = done ? (f.type === "signature" ? '<span class="sigtxt">' + E(s.sig_text) + '</span>' : f.type === "initials" ? '<span class="sigtxt">' + E(s.initials) + '</span>' : f.type === "date" ? E(fmtD(s.signed_at)) : f.type === "name" ? E(s.sig_text) : E((s.vals || {})[f.id] || "")) : E(mine && canSign ? (f.type === "signature" ? "Sign here" : FT[f.type]) : FT[f.type] + (s ? " · " + s.name : ""));
    pg.appendChild(el) }) });
};
PV.acts["pv-sign"] = async t => {
  const c = ES.cur, F = new FormData(document.getElementById("pvsignf")); if (!c.hash) throw new Error("Wait for the document to finish loading");
  if (c.hash !== c.d.source_hash) throw new Error("The document didn’t load correctly. Reload the page.");
  const esignNeeded = !(c.j.profile || {}).esign_consent_at; if (esignNeeded && !F.get("esign")) throw new Error("Accept the electronic records disclosure first");
  if (!F.get("consent")) throw new Error("Check the box to confirm you agree to sign");
  const values = {}; for (const [k, v] of F) if (k.startsWith("t_")) values[k.slice(2)] = v;
  const r = await PV.api("doc/sign", { id: c.d.id, consent: true, esignConsent: esignNeeded ? true : undefined, sourceHash: c.hash, values });
  PV.toast(r.allSigned ? "Signed. Grooveville will finalize the agreement and send your copy." : "Signed. The next party has been notified."); PV.refresh();
};
PV.acts["pv-decline"] = async () => { const r = prompt("Why are you declining? (optional; Grooveville will see this)"); if (r === null) return; await PV.api("doc/decline", { id: ES.cur.d.id, reason: r }); PV.toast("Declined. Grooveville has been notified."); PV.refresh() };
/* ---------- completed PDF (administrator) ---------- */
const ansi = s => String(s == null ? "" : s).normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
ES.ansi = ansi;
async function cursivePng(text, wPt, hPt, withName) {
  await PV.fontsReady(); const k = 4, cv = document.createElement("canvas"); cv.width = Math.max(40, Math.round(wPt * k)); cv.height = Math.max(20, Math.round(hPt * k)); const g = cv.getContext("2d");
  const lineH = withName ? cv.height * .7 : cv.height; let fs = lineH * .82; g.font = fs + 'px "Great Vibes", cursive'; while (g.measureText(text).width > cv.width * .94 && fs > 8) { fs *= .92; g.font = fs + 'px "Great Vibes", cursive' }
  g.fillStyle = "#1d2a4a"; g.textBaseline = "middle"; g.fillText(text, cv.width * .03, lineH * .55);
  if (withName) { g.fillStyle = "#333"; let ps = cv.height * .2; g.font = "600 " + ps + "px Helvetica, Arial, sans-serif"; while (g.measureText(text.toUpperCase()).width > cv.width * .94 && ps > 6) { ps *= .92; g.font = "600 " + ps + "px Helvetica, Arial, sans-serif" } g.fillText(text.toUpperCase(), cv.width * .03, cv.height * .86) }
  return new Uint8Array(await (await new Promise(r => cv.toBlob(r, "image/png"))).arrayBuffer());
}
ES.finalize = async id => {
  const j = await PV.api("doc?id=" + encodeURIComponent(id)), d = j.doc; if (d.signers.some(s => s.status !== "signed")) throw new Error("Not everyone has signed yet");
  const src = await ES.fetchBytes(d.source), h = await PV.sha(src); if (h !== d.source_hash) throw new Error("The stored original doesn’t match its fingerprint. Don’t finalize; contact support.");
  const L = await ES.pdflib(), doc = await L.PDFDocument.load(src), font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold), pages = doc.getPages(), sg = {};
  d.signers.forEach(s => { sg[s.ord] = s });
  for (const f of d.fields) { const s = sg[f.signer], pg = pages[f.page - 1]; if (!s || !pg) continue; const { width: W, height: H } = pg.getSize(), x = f.x * W, w = f.w * W, hh = f.h * H, y = H - f.y * H - hh;
    if (f.type === "signature" || f.type === "initials") { const png = await doc.embedPng(await cursivePng(f.type === "signature" ? s.sig_text : s.initials, w, hh, f.type === "signature" && hh > 26)); pg.drawImage(png, { x, y, width: w, height: hh }) }
    else { const txt = ansi(f.type === "date" ? fmtD(s.signed_at) : f.type === "name" ? s.sig_text : (s.vals || {})[f.id] || ""); let size = Math.min(11, hh * .62); while (size > 5 && font.widthOfTextAtSize(txt, size) > w - 4) size -= .5; pg.drawText(txt, { x: x + 2, y: y + (hh - size) / 2 + 1, size, font, color: L.rgb(.07, .07, .1) }) } }
  /* certificate pages */
  let pg = doc.addPage([612, 792]), Y = 740; const M = 54, ink = L.rgb(.1, .1, .12), mute = L.rgb(.4, .4, .42), peach = L.rgb(.89, .6, .46);
  const line = (t, o) => { o = o || {}; const f = o.b ? bold : font, sz = o.s || 9.5; for (const part of wrap(ansi(t), f, sz, 612 - M * 2 - (o.ind || 0))) { if (Y < 60) { pg = doc.addPage([612, 792]); Y = 740 } pg.drawText(part, { x: M + (o.ind || 0), y: Y, size: sz, font: f, color: o.c || ink }); Y -= sz * 1.45 } };
  pg.drawRectangle({ x: 0, y: 772, width: 612, height: 20, color: L.rgb(.09, .09, .1) }); pg.drawText("GROOVEVILLE LLC", { x: M, y: 778, size: 9, font: bold, color: peach });
  line("Certificate of Completion", { b: 1, s: 18 }); Y -= 4; line("Electronic signature record for the document above. Signatures were applied under the U.S. ESIGN Act and the Uniform Electronic Transactions Act by typing the signer's legal name after an explicit consent. This is an electronic signature record, not a cryptographic digital certificate.", { c: mute }); Y -= 6;
  [["Document", d.title], ["Document ID", d.id], ["Pages (original)", String(d.pages)], ["Original SHA-256", d.source_hash], ["Sent", d.sent_at], ["Completed", new Date().toISOString()]].forEach(([k, v]) => line(k + ": " + (v || "")));
  Y -= 8; line("Signers", { b: 1, s: 12 });
  for (const s of d.signers.slice().sort((a, b) => a.ord - b.ord)) { Y -= 4; line((s.ord + 1) + ". " + s.sig_text + " - " + (ROLE[s.role] || s.role), { b: 1, s: 10.5 }); [["Email", s.email || ""], ["Consented", s.consent_at], ["Signed", s.signed_at], ["Authentication", s.auth || ""], ["IP address", s.ip || ""], ["Browser", (s.ua || "").slice(0, 160)], ["Initials", s.initials]].forEach(([k, v]) => line(k + ": " + (v || ""), { ind: 14, c: mute })) }
  Y -= 8; line("Audit trail (UTC)", { b: 1, s: 12 }); for (const e of d.events || []) line(String(e.at).replace("T", " ").slice(0, 19) + "  " + e.event.replace(/_/g, " ") + (e.ip ? "  IP " + e.ip : ""), { s: 8.5, c: mute });
  Y -= 8; line("The SHA-256 fingerprint of this completed file is registered with Grooveville at the time of completion. Anyone can check a copy at grooveville.org (Verify a document). Any change to the file produces a different fingerprint.", { s: 8.5, c: mute });
  doc.setTitle(ansi(d.title + " (signed)")); doc.setProducer("Grooveville e-signature"); doc.setCreator("Grooveville LLC");
  const out = await doc.save({ useObjectStreams: false });
  return PV.api("doc/admin/finalize?id=" + encodeURIComponent(d.id) + "&source=" + d.source_hash, new Blob([out], { type: "application/pdf" }), { type: "application/pdf" });
};
function wrap(t, f, sz, maxW) { const out = []; for (const para of String(t).split("\n")) { let cur = ""; for (const w of para.split(/\s+/)) { const nx = cur ? cur + " " + w : w; if (f.widthOfTextAtSize(nx, sz) <= maxW) cur = nx; else { if (cur) out.push(cur); let ww = w; while (f.widthOfTextAtSize(ww, sz) > maxW) { let k = ww.length; while (k > 1 && f.widthOfTextAtSize(ww.slice(0, k), sz) > maxW) k--; out.push(ww.slice(0, k)); ww = ww.slice(k) } cur = ww } } out.push(cur) } return out }
ES.wrap = wrap;
PV.acts["pv-finalize"] = async t => { const r = await ES.finalize(t.dataset.id); PV.toast(r.already ? "Already finalized" : "Agreement completed. Copies sent to every party."); PV.refresh() };
/* ---------- field placement editor (administrator) ---------- */
ES.editor = async id => {
  const j = await PV.api("doc?id=" + encodeURIComponent(id)), d = j.doc; const draft = d.status === "draft";
  const signers = d.signers.length ? d.signers.map(s => ({ ord: s.ord, role: s.role, uid: s.uid || "", email: s.email || "", first: (s.name || "").split(" ")[0], middle: "", last: (s.name || "").split(" ").slice(1).join(" ").replace(/^\w\.\s*/, "") })) : [{ ord: 0, role: d.division === "entertainment" ? "host" : "customer", uid: "", email: "", first: "", middle: "", last: "" }];
  const idxOf = ord => Math.max(0, signers.findIndex(s => s.ord === ord));
  const ED = ES.ed = { d, draft, signers, fields: d.fields.map(f => Object.assign({}, f, { signer: idxOf(f.signer) })), tool: "signature", si: 0 };
  PV.after = async root => { const box = root.querySelector("#pvpages"); try { const bytes = await ES.fetchBytes(d.source); if (await PV.sha(bytes) !== d.source_hash) throw new Error("The stored original doesn’t match its fingerprint"); ED.n = await ES.render(box, bytes); ES.edDraw(); if (draft) ES.edBind(box) } catch (e) { box.innerHTML = '<div class="pvbanner bad">' + E(e.message) + '</div>' } await PV.fontsReady() };
  return '<div class="pvdoc"><div class="pvpages" id="pvpages"><p class="muted" style="color:#bbb">Loading document…</p></div><div class="pvgrid" style="gap:16px"><div class="pvpanel"><div class="pvlbl">Document</div><h3 style="margin:4px 0 8px">' + E(d.title) + '</h3><span class="pvpill ' + (DST[d.status] || ["", ""])[1] + '">' + (DST[d.status] || [d.status])[0] + '</span><p class="pvnote" style="margin-top:8px">SHA-256 <code style="word-break:break-all">' + E(d.source_hash) + '</code></p></div>' +
    (draft ? '<div class="pvpanel" id="pvedsg"></div><div class="pvpanel"><h3>Place fields</h3><p class="pvnote" style="margin:4px 0 10px">Pick a field and a signer, then click the page where it goes. Drag to move; drag the corner to resize; × removes it.</p><div class="pvrow" id="pvedtools">' + Object.entries(FT).map(([k, v]) => '<button class="pvbtn sm' + (k === "signature" ? " pk" : "") + '" data-act="pv-ed-tool" data-t="' + k + '">' + v + '</button>').join("") + '</div><label class="pvf" style="margin-top:10px"><span>Text field label</span><input class="pvin" id="pvedlabel" placeholder="e.g. Vehicle plate"></label><div id="pvedsum" class="pvnote" style="margin-top:8px"></div></div>' +
      '<div class="pvpanel"><label class="pvf"><span>Message to signers (optional)</span><textarea id="pvedmsg" maxlength="1000">' + E(d.message || "") + '</textarea></label><div class="pvrow" style="margin-top:12px"><button class="pvbtn" data-act="pv-ed-save">Save</button><button class="pvbtn pk" data-act="pv-ed-send">Save &amp; send for signature</button></div><p class="pvnote" style="margin-top:8px">After sending, fields and signers are locked. To change a sent document, supersede it with a new version.</p></div>'
      : '<div class="pvpanel"><h3>Signers</h3><div class="pvlist">' + d.signers.map(s => '<div class="pvli"><span class="pvck' + (s.status === "signed" ? "" : " off") + '">' + (s.status === "signed" ? "✓" : s.ord + 1) + '</span><div><b>' + E(s.name) + '</b><small>' + E(ROLE[s.role] || s.role) + ' · ' + E(s.email || "") + ' · ' + E(s.status) + (s.signed_at ? " " + PV.dt(s.signed_at) : "") + (s.ip ? " · IP " + E(s.ip) : "") + '</small></div></div>').join("") + '</div>' +
        (d.status === "partially_signed" && d.signers.every(s => s.status === "signed") ? '<button class="pvbtn pk block" style="margin-top:14px" data-act="pv-finalize" data-id="' + E(d.id) + '">Finalize agreement</button>' : '') + (d.final ? '<a class="pvbtn block" style="margin-top:10px" href="' + E(d.final) + '">' + PV.ic("down") + 'Signed PDF</a>' : '') +
        (["sent", "partially_signed"].includes(d.status) ? '<div class="pvrow" style="margin-top:12px"><button class="pvbtn sm danger" data-act="pv-doc-cancel" data-id="' + E(d.id) + '">Cancel document</button></div>' : '') + (["sent", "partially_signed", "completed"].includes(d.status) ? '<button class="pvbtn sm" style="margin-top:8px" data-act="pv-doc-supersede" data-id="' + E(d.id) + '">Mark superseded</button>' : '') + '</div>' + ES.trail(d)) + '</div></div>';
};
ES.edSigners = () => { const ED = ES.ed, el = document.getElementById("pvedsg"); if (!el) return;
  el.innerHTML = '<div class="pvph"><h3>Signers &amp; order</h3><button class="pvbtn sm" data-act="pv-ed-addme">Add me (Grooveville)</button></div><p class="pvnote" style="margin:2px 0 10px">Lower order numbers sign first. Signers with the same number can sign at the same time.</p>' + ED.signers.map((s, i) => '<div class="pvedsg' + (i === ED.si ? " on" : "") + '" data-i="' + i + '"><div class="pvrow" style="justify-content:space-between"><button class="pvbtn sm' + (i === ED.si ? " pk" : "") + '" data-act="pv-ed-si" data-i="' + i + '"><span class="pvsw s' + (i % 4) + '"></span>Signer ' + (i + 1) + '</button>' + (ED.signers.length > 1 ? '<button class="pvbtn sm" data-act="pv-ed-delsg" data-i="' + i + '" aria-label="Remove signer">×</button>' : '') + '</div><div class="pvform c2" style="margin-top:8px"><label class="pvf"><span>Role</span><select class="pvin" data-sg="role" data-i="' + i + '">' + Object.entries(ROLE).map(([k, v]) => '<option value="' + k + '"' + (s.role === k ? " selected" : "") + '>' + v + '</option>').join("") + '</select></label><label class="pvf"><span>Signing order</span><input class="pvin" type="number" min="1" max="10" data-sg="ord" data-i="' + i + '" value="' + (s.ord + 1) + '"></label><label class="pvf"><span>Legal first name</span><input class="pvin" data-sg="first" data-i="' + i + '" value="' + E(s.first) + '"></label><label class="pvf"><span>Legal last name</span><input class="pvin" data-sg="last" data-i="' + i + '" value="' + E(s.last) + '"></label><label class="pvf full"><span>Email (they sign in with it)</span><input class="pvin" type="email" data-sg="email" data-i="' + i + '" value="' + E(s.email) + '"></label></div></div>').join("") + '<button class="pvbtn sm" style="margin-top:10px" data-act="pv-ed-addsg">' + PV.ic("plus") + 'Add signer</button>';
};
ES.edDraw = () => { const ED = ES.ed; document.querySelectorAll("#pvpages .pvfld").forEach(x => x.remove());
  ED.fields.forEach((f, i) => { const pg = document.querySelector('#pvpages .pvpage[data-page="' + f.page + '"]'); if (!pg) return; const el = document.createElement("div"); el.className = "pvfld s" + (f.signer % 4); el.dataset.i = i; el.style.cssText = pos(f) + (ED.draft ? "" : ";cursor:default");
    el.innerHTML = '<span>' + E((f.type === "text" && f.label ? f.label : FT[f.type]) + " · S" + (f.signer + 1)) + '</span>' + (ED.draft ? '<i class="rz" data-rz="1"></i><b class="x" data-x="1" title="Remove">×</b>' : ""); pg.appendChild(el) });
  const sum = document.getElementById("pvedsum"); if (sum) sum.innerHTML = ED.signers.map((s, i) => '<span class="pvsw s' + (i % 4) + '"></span>Signer ' + (i + 1) + ': ' + Object.entries(ED.fields.filter(f => f.signer === i).reduce((a, f) => (a[FT[f.type]] = (a[FT[f.type]] || 0) + 1, a), {})).map(([k, v]) => v + " " + k.toLowerCase()).join(", ") || "no fields").join("<br>");
  ES.edSigners() };
const SIZES = { signature: [.3, .055], initials: [.09, .045], date: [.18, .03], name: [.26, .03], text: [.26, .03] };
ES.edBind = box => { const ED = ES.ed; let drag = null;
  box.addEventListener("pointerdown", e => { const el = e.target.closest(".pvfld"), pg = e.target.closest(".pvpage"); if (!pg) return; const r = pg.getBoundingClientRect();
    if (el) { const i = +el.dataset.i; if (e.target.dataset.x) { ED.fields.splice(i, 1); ES.edDraw(); return } drag = { i, rz: !!e.target.dataset.rz, sx: e.clientX, sy: e.clientY, f0: Object.assign({}, ED.fields[i]), r }; el.setPointerCapture(e.pointerId); e.preventDefault(); return }
    const [w, h] = SIZES[ED.tool], x = Math.max(0, Math.min(1 - w, (e.clientX - r.left) / r.width - w / 2)), y = Math.max(0, Math.min(1 - h, (e.clientY - r.top) / r.height - h / 2));
    ED.fields.push({ id: Math.random().toString(36).slice(2, 8), type: ED.tool, page: +pg.dataset.page, x, y, w, h, signer: ED.si, label: ED.tool === "text" ? (document.getElementById("pvedlabel").value || "Text") : "", required: true }); ES.edDraw() });
  box.addEventListener("pointermove", e => { if (!drag) return; const f = ED.fields[drag.i], dx = (e.clientX - drag.sx) / drag.r.width, dy = (e.clientY - drag.sy) / drag.r.height;
    if (drag.rz) { f.w = Math.max(.03, Math.min(1 - f.x, drag.f0.w + dx)); f.h = Math.max(.015, Math.min(1 - f.y, drag.f0.h + dy)) } else { f.x = Math.max(0, Math.min(1 - f.w, drag.f0.x + dx)); f.y = Math.max(0, Math.min(1 - f.h, drag.f0.y + dy)) }
    const el = box.querySelector('.pvfld[data-i="' + drag.i + '"]'); if (el) el.style.cssText = pos(f) });
  const up = () => { drag = null }; box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  document.getElementById("pvedsg").addEventListener("input", e => { const k = e.target.dataset.sg; if (!k) return; const s = ED.signers[+e.target.dataset.i]; s[k] = k === "ord" ? Math.max(0, Math.min(9, (parseInt(e.target.value, 10) || 1) - 1)) : e.target.value });
};
PV.acts["pv-ed-tool"] = t => { ES.ed.tool = t.dataset.t; document.querySelectorAll("#pvedtools .pvbtn").forEach(b => b.classList.toggle("pk", b === t)) };
PV.acts["pv-ed-si"] = t => { ES.ed.si = +t.dataset.i; ES.edSigners() };
PV.acts["pv-ed-addsg"] = () => { const ED = ES.ed; ED.signers.push({ ord: Math.max(...ED.signers.map(s => s.ord)) + 1, role: "grooveville", uid: "", email: "", first: "", middle: "", last: "" }); ED.si = ED.signers.length - 1; ES.edDraw() };
PV.acts["pv-ed-addme"] = () => { const ED = ES.ed, p = PV.me.profile || {}; ED.signers.push({ ord: Math.max(...ED.signers.map(s => s.ord)) + 1, role: "grooveville", uid: PV.me.uid, email: PV.me.email || "", first: p.first || "", middle: p.middle || "", last: p.last || "" }); ED.si = ED.signers.length - 1; ES.edDraw() };
PV.acts["pv-ed-delsg"] = t => { const ED = ES.ed, i = +t.dataset.i; ED.signers.splice(i, 1); ED.fields = ED.fields.filter(f => f.signer !== i).map(f => Object.assign(f, { signer: f.signer > i ? f.signer - 1 : f.signer })); ED.si = 0; ES.edDraw() };
ES.edSave = async () => { const ED = ES.ed; await PV.api("doc/admin/setup", { id: ED.d.id, signers: ED.signers, fields: ED.fields, message: (document.getElementById("pvedmsg") || {}).value }) };
PV.acts["pv-ed-save"] = async () => { await ES.edSave(); PV.toast("Saved") };
PV.acts["pv-ed-send"] = async () => { await ES.edSave(); if (!confirm("Send “" + ES.ed.d.title + "” for signature? Fields and signers lock once it’s sent.")) return; await PV.api("doc/admin/send", { id: ES.ed.d.id }); PV.toast("Sent. Signers have been notified."); PV.refresh() };
PV.acts["pv-doc-cancel"] = async t => { const r = prompt("Reason for canceling (kept in the audit trail)"); if (r === null) return; await PV.api("doc/admin/cancel", { id: t.dataset.id, reason: r }); PV.refresh() };
PV.acts["pv-doc-supersede"] = async t => { const r = prompt("Why is this version superseded? Create and send the replacement separately."); if (r === null) return; await PV.api("doc/admin/supersede", { id: t.dataset.id, reason: r }); PV.refresh() };
/* ---------- upload a PDF for signature ---------- */
ES.uploadPdf = async (file, o) => {
  if (!file || file.type !== "application/pdf") throw new Error("Choose a PDF file"); const bytes = new Uint8Array(await file.arrayBuffer()), h = await PV.sha(bytes);
  const lib = await ES.pdfjs(), pdf = await lib.getDocument({ data: bytes.slice(0) }).promise; const up = await PV.upload(new Blob([bytes], { type: "application/pdf" }), "doc"); if (up.sha256 !== h) throw new Error("The upload didn’t arrive intact; try again");
  return PV.api("doc/admin/create", Object.assign({ sourceKey: up.key, sourceHash: h, pages: pdf.numPages, kind: "upload" }, o));
};
/* ---------- agreement builder (templates → PDF → fields placed automatically) ---------- */
const T = {
  residential: { name: "Residential room / housing rental", div: "rentals", roles: ["landlord", "tenant"], body: o => [
    ["Parties", o.payee + " (\"Landlord\") rents to " + o.customer + " (\"Tenant\") the premises described below on the terms in this agreement."],
    ["Premises", o.item + (o.address ? ", " + o.address : "")],
    ["Term", "From " + o.start + (o.end ? " to " + o.end : " on a " + o.freq + " basis until ended by either party with the notice required by law") + "."],
    ["Rent", "Tenant pays " + o.amount + " " + o.freq + ", due on the date shown in the Grooveville Rentals portal. Payments are made through the portal (processed by Stripe) and receipts are issued there. Rent is paid to " + o.payee + "."],
    ["Security deposit", o.deposit ? "Tenant pays a refundable security deposit of " + o.deposit + ". It is returned, less lawful deductions itemized in writing, within the time required by applicable law after Tenant moves out." : "No security deposit."],
    ["Utilities and household charges", o.utilities || "As agreed in writing."],
    ["Use and house rules", o.rules || "Tenant uses the premises as a residence only, keeps them clean and safe, does not sublet without written consent, and follows any written house rules."],
    ["Entry", "Landlord may enter with reasonable advance notice as allowed by law, or immediately in an emergency."],
    ["Ending the agreement", "Either party may end a periodic tenancy with the written notice required by applicable law. Nothing in this agreement waives rights that the law gives Tenant."],
    ["Additional terms", o.extra || "None."],
    ["Entire agreement", "This is the whole agreement. Changes must be in writing and signed by both parties. If a term is unenforceable, the rest still applies. The parties agree to sign electronically."]] },
  equipment: { name: "Equipment / speaker / furniture rental", div: "rentals", roles: ["grooveville", "customer"], body: o => [
    ["Parties", o.payee + " (\"Owner\") rents the equipment below to " + o.customer + " (\"Renter\")."],
    ["Equipment", o.item], ["Rental period", "Pickup/delivery " + o.start + "; return by " + (o.end || "the agreed date") + "."],
    ["Price", "Rental price " + o.amount + (o.freq && o.freq !== "one-time" ? " " + o.freq : "") + ". Paid through the Grooveville Rentals portal (Stripe)."],
    ["Deposit", o.deposit ? "Refundable deposit " + o.deposit + ", returned after the equipment comes back in the same condition, less documented repair or replacement costs." : "No deposit."],
    ["Care and responsibility", "Renter uses the equipment carefully and only for its intended purpose, keeps it secure and dry, and is responsible for loss, theft or damage beyond normal wear while it is in Renter's possession."],
    ["Late return", o.rules || "Late returns are charged at the daily rate for each extra day unless Owner agrees otherwise in writing."],
    ["Additional terms", o.extra || "None."], ["Entire agreement", "This is the whole agreement; changes must be in writing. The parties agree to sign electronically."]] },
  vehicle: { name: "Vehicle rental", div: "rentals", roles: ["grooveville", "customer"], body: o => [
    ["Parties", o.payee + " (\"Owner\") rents the vehicle below to " + o.customer + " (\"Renter\")."], ["Vehicle", o.item], ["Rental period", "From " + o.start + " to " + (o.end || "the agreed return date") + "."],
    ["Price and deposit", "Rental price " + o.amount + (o.freq && o.freq !== "one-time" ? " " + o.freq : "") + ". " + (o.deposit ? "Refundable deposit " + o.deposit + "." : "No deposit.") + " Paid through the Grooveville Rentals portal (Stripe)."],
    ["Driver and insurance", "Only Renter, holding a valid driver's license provided to Owner, may drive. Renter keeps the insurance shown to Owner in force for the whole rental and is responsible for tolls, tickets, fuel and damage during the rental."],
    ["Use", "No commercial driving, racing, towing, off-road use, smoking, or driving under the influence. Return with the same fuel/charge level."],
    ["Additional terms", o.extra || "None."], ["Entire agreement", "This is the whole agreement; changes must be in writing. The parties agree to sign electronically."]] },
  service: { name: "Service agreement", div: "general", roles: ["grooveville", "customer"], body: o => [
    ["Parties", o.payee + " (\"Provider\") will provide the services below to " + o.customer + " (\"Client\")."], ["Services", o.item], ["Dates", o.start + (o.end ? " to " + o.end : "")],
    ["Price", o.amount + (o.freq && o.freq !== "one-time" ? " " + o.freq : "") + (o.deposit ? "; deposit " + o.deposit : "") + ". Paid through the Grooveville portal (Stripe)."],
    ["Changes and cancellation", o.rules || "Changes must be agreed in writing. Cancellation terms: as stated in Additional terms."], ["Additional terms", o.extra || "None."], ["Entire agreement", "This is the whole agreement; changes must be in writing. The parties agree to sign electronically."]] },
  custom: { name: "Custom agreement", div: "general", roles: ["grooveville", "customer"], body: o => [["Agreement", o.extra || ""]] }
};
ES.templates = T;
ES.buildPdf = async (title, sections, signers, intro) => {
  const L = await ES.pdflib(), doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold), M = 64, W = 612, H = 792; let pg, Y; const fields = [];
  const np = () => { pg = doc.addPage([W, H]); Y = H - 70; pg.drawText("GROOVEVILLE LLC", { x: M, y: H - 40, size: 8, font: bold, color: L.rgb(.6, .38, .27) }); pg.drawText("Page " + doc.getPageCount(), { x: W - M - 40, y: 30, size: 8, font, color: L.rgb(.5, .5, .5) }) };
  const txt = (t, o) => { o = o || {}; const f = o.b ? bold : font, sz = o.s || 10.5; for (const ln of wrap(ansi(t), f, sz, W - M * 2)) { if (Y < 80) np(); pg.drawText(ln, { x: M, y: Y, size: sz, font: f, color: L.rgb(.08, .08, .1) }); Y -= sz * 1.5 } };
  np(); txt(title, { b: 1, s: 20 }); Y -= 4; if (intro) { txt(intro, { s: 9, c: 1 }); Y -= 4 }
  sections.forEach(([h, b], i) => { Y -= 6; txt((i + 1) + ". " + h, { b: 1, s: 11.5 }); txt(b) });
  Y -= 14; txt("Signatures", { b: 1, s: 13 }); Y -= 4;
  signers.forEach((s, i) => { if (Y < 170) np(); pg.drawText(ansi((ROLE[s.role] || s.role) + (s.first ? ": " + [s.first, s.last].join(" ") : "")), { x: M, y: Y, size: 10, font: bold }); Y -= 52;
    pg.drawLine({ start: { x: M, y: Y }, end: { x: M + 260, y: Y }, thickness: .7, color: L.rgb(.3, .3, .3) }); pg.drawLine({ start: { x: M + 300, y: Y }, end: { x: W - M, y: Y }, thickness: .7, color: L.rgb(.3, .3, .3) });
    pg.drawText("Signature", { x: M, y: Y - 11, size: 8, font }); pg.drawText("Date", { x: M + 300, y: Y - 11, size: 8, font });
    const p = doc.getPageCount(); fields.push({ type: "signature", page: p, x: M / W, y: (H - (Y + 42)) / H, w: 260 / W, h: 42 / H, signer: i }, { type: "date", page: p, x: (M + 300) / W, y: (H - (Y + 16)) / H, w: (W - M * 2 - 300) / W, h: 14 / H, signer: i });
    Y -= 40 });
  const bytes = await doc.save({ useObjectStreams: false }); return { bytes, pages: doc.getPageCount(), fields: fields.map(f => Object.assign(f, { id: Math.random().toString(36).slice(2, 8), required: true, label: "" })) };
};
ES.builder = o => { o = o || {}; const keys = Object.keys(T);
  return '<form class="pvpanel pvform" id="pvbld" onsubmit="return false"><h3>Agreement builder</h3><p class="pvnote">Builds a clean PDF from a template, places signature and date lines for each signer, and opens it in the field editor for review before sending. Templates are a starting point: have them reviewed by a lawyer licensed where you operate before using them with customers.</p>' +
    '<div class="pvform c2"><label class="pvf"><span>Template</span><select class="pvin" name="tpl">' + keys.map(k => '<option value="' + k + '"' + (o.tpl === k ? " selected" : "") + '>' + E(T[k].name) + '</option>').join("") + '</select></label><label class="pvf"><span>Title</span><input class="pvin" name="title" value="' + E(o.title || "") + '" placeholder="e.g. Room Rental Agreement"></label>' +
    '<label class="pvf"><span>Owner / landlord / payee (legal name)</span><input class="pvin" name="payee" value="' + E(o.payee || "Grooveville LLC") + '"></label><label class="pvf"><span>Customer legal name</span><input class="pvin" name="customer" value="' + E(o.customer || "") + '"></label>' +
    '<label class="pvf"><span>Customer email</span><input class="pvin" type="email" name="email" value="' + E(o.email || "") + '"></label><label class="pvf"><span>Customer account ID (optional)</span><input class="pvin" name="uid" value="' + E(o.uid || "") + '"></label>' +
    '<label class="pvf full"><span>Item / premises / services</span><input class="pvin" name="item" value="' + E(o.item || "") + '"></label><label class="pvf full"><span>Address (if housing)</span><input class="pvin" name="address" value="' + E(o.address || "") + '"></label>' +
    '<label class="pvf"><span>Start date</span><input class="pvin" type="date" name="start" value="' + E(o.start || "") + '"></label><label class="pvf"><span>End date (blank = periodic)</span><input class="pvin" type="date" name="end" value="' + E(o.end || "") + '"></label>' +
    '<label class="pvf"><span>Amount (e.g. $850.00)</span><input class="pvin" name="amount" value="' + E(o.amount || "") + '"></label><label class="pvf"><span>Frequency</span><select class="pvin" name="freq">' + ["monthly", "weekly", "biweekly", "one-time"].map(f => '<option' + (o.freq === f ? " selected" : "") + '>' + f + '</option>').join("") + '</select></label>' +
    '<label class="pvf"><span>Deposit (blank = none)</span><input class="pvin" name="deposit" value="' + E(o.deposit || "") + '"></label><label class="pvf"><span>Countersign as Grooveville</span><select class="pvin" name="counter"><option value="1">Yes, I countersign after the customer</option><option value="0">No</option></select></label>' +
    '<label class="pvf full"><span>Utilities / household charges</span><input class="pvin" name="utilities" value="' + E(o.utilities || "") + '"></label><label class="pvf full"><span>Rules / late return / changes</span><textarea name="rules">' + E(o.rules || "") + '</textarea></label><label class="pvf full"><span>Additional terms</span><textarea name="extra">' + E(o.extra || "") + '</textarea></label>' +
    '<input type="hidden" name="refType" value="' + E(o.refType || "") + '"><input type="hidden" name="refId" value="' + E(o.refId || "") + '"></div><div class="pvrow" style="margin-top:12px"><button class="pvbtn pk" data-act="pv-bld">Build agreement</button></div></form>' };
const money = s => { s = String(s || "").trim(); if (!s) return ""; const n = Number(s.replace(/[$,]/g, "")); return isFinite(n) && n > 0 ? "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : s };
PV.acts["pv-bld"] = async () => { const F = Object.fromEntries(new FormData(document.getElementById("pvbld"))), t = T[F.tpl]; if (!F.customer || !F.email && !F.uid) throw new Error("Enter the customer’s legal name and email"); if (!F.title) F.title = t.name.replace(/ \/.*$/, "") + " Agreement";
  const o = Object.assign({}, F, { amount: money(F.amount) || "the agreed amount", deposit: money(F.deposit), start: F.start ? fmtD(F.start + "T12:00:00") : "the agreed start date", end: F.end ? fmtD(F.end + "T12:00:00") : "", freq: F.freq });
  const [cf, ...cl] = F.customer.trim().split(/\s+/), p = PV.me.profile || {}, cust = { role: t.roles[1] === "tenant" ? "tenant" : "customer", email: F.email, uid: F.uid, first: cf, last: cl.join(" ") };
  const payeeRole = t.roles[0]; const signers = [Object.assign({ ord: 0 }, cust)]; if (F.counter === "1") signers.push({ ord: 1, role: payeeRole === "landlord" ? "landlord" : "grooveville", uid: PV.me.uid, email: PV.me.email || "", first: p.first || "", last: p.last || "" });
  const pdf = await ES.buildPdf(F.title, t.body(o), signers, "Prepared through the Grooveville portal. Read the whole agreement before signing.");
  const up = await PV.upload(new Blob([pdf.bytes], { type: "application/pdf" }), "doc"), c = await PV.api("doc/admin/create", { sourceKey: up.key, sourceHash: up.sha256, pages: pdf.pages, kind: "generated", title: F.title, division: t.div, refType: F.refType, refId: F.refId, textBody: t.body(o).map(([h, b]) => h + ": " + b).join("\n\n") });
  await PV.api("doc/admin/setup", { id: c.id, signers, fields: pdf.fields }); PV.toast("Agreement built. Review the fields, then send."); location.hash = "#team-portals/docs/" + c.id };
/* event agreement from the locked accepted terms */
ES.eventAgreement = async agId => {
  const j = await PV.api("admin/agreement?id=" + encodeURIComponent(agId)), a = j.agreement, t = a.terms, h = j.host || {}, f = j.founder || {}, $ = PV.$;
  const arr = { flat: "Option A: flat location rental", share: "Option B: revenue share", ticketing: "Ticketing only (external venue)", owned: "Grooveville-owned event" }[t.arrangement] || t.arrangement;
  const S = [["Parties", "Grooveville LLC (\"Grooveville\") and " + (t.host.name || "the host") + " (\"Host\")" + (h.first ? ", represented by " + [h.first, h.last].join(" ") : "") + "."],
    ["Event", t.event.title + ", " + String(t.event.start).replace("T", " ") + " to " + String(t.event.end).replace("T", " ") + ". Expected attendance " + t.event.expected + (t.event.capacity ? "; ticket capacity " + t.event.capacity : "") + "."],
    ["Location", (t.location.name || "") + (t.location.address ? ", " + t.location.address : "") + (t.location.category === "external" ? ". The Host confirms it is authorized to hold the event at this venue." : "") + (t.location.restrictions ? " Restrictions: " + t.location.restrictions : "")],
    ["Arrangement", arr + "."],
    ["Pricing", (t.lines || []).map((l, i) => l.label + " " + (l.cents != null ? $(l.cents) : l.bps != null ? (i && l.bps > 0 ? "+" : "") + l.bps / 100 + "%" : l.value || "")).join("; ") + (t.rentalCents ? ". Location rental total " + $(t.rentalCents) : "") + (t.depositCents ? ". Refundable deposit " + $(t.depositCents) : "") + "."],
    ["Ticket revenue", t.arrangement === "share" ? "Grooveville receives " + (t.shareBps / 100) + "% of " + (t.shareBase === "gross" ? "gross ticket sales" : "net ticket sales (after refunds, chargebacks and processing fees)") + ", with a minimum guarantee of " + $(t.minGuaranteeCents) + "." : t.arrangement === "owned" ? "All ticket revenue belongs to Grooveville." : t.independentTicketing ? "Grooveville deducts " + (t.platformFeeBps / 100).toFixed(2) + "% from collected ticket revenue after refunds and chargebacks. " + (t.buyerProcessingBps ? "Buyers pay 3.5% for processing and Grooveville covers actual Stripe fees." : "Actual Stripe fees are deducted separately from the host’s proceeds.") : "Grooveville's ticketing fee is " + (t.platformFeeBps / 100) + "% of ticket sales" + (t.perTicketCents ? " plus " + $(t.perTicketCents) + " per ticket" : "") + "; the rest belongs to the Host after refunds, chargebacks and processing fees."],
    ["Refunds and chargebacks", t.refundsAndChargebacks + (t.event.refundPolicy ? " Ticket refund policy: " + t.event.refundPolicy : "")],
    ["Off-platform sales", t.offPlatform], ["Payout", t.payout], ["Cancellation", t.cancelPolicy || "As stated in the location's policy."],
    ["Locked terms", "These terms were accepted by the Host in the Grooveville portal on " + fmtD(a.accepted_at) + " and are locked. A material change needs a written amendment signed by both parties."],
    ["Entire agreement", "This is the whole agreement for this event. The parties agree to sign electronically."]];
  const signers = [{ ord: 0, role: "host", uid: h.uid || "", email: h.email || "", first: h.first || "", last: h.last || "" }, { ord: 1, role: "grooveville", uid: f.uid || PV.me.uid, email: f.email || PV.me.email || "", first: f.first || "", last: f.last || "" }];
  const pdf = await ES.buildPdf("Event Location & Ticketing Agreement", S, signers, "Agreement " + a.id + " · Terms version " + (t.version || 1));
  const up = await PV.upload(new Blob([pdf.bytes], { type: "application/pdf" }), "doc"), c = await PV.api("doc/admin/create", { sourceKey: up.key, sourceHash: up.sha256, pages: pdf.pages, kind: "generated", title: "Event Agreement: " + t.event.title, division: "entertainment", refType: "event_agreement", refId: a.id, textBody: S.map(([x, y]) => x + ": " + y).join("\n\n") });
  await PV.api("doc/admin/setup", { id: c.id, signers, fields: pdf.fields }); return c.id;
};
})();
