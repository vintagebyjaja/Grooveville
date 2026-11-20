/* Agreements and electronic signatures (Rentals + Entertainment).
   Type-to-sign: the signature is the signer's legal name from their profile, shown in a cursive style and in print.
   The server records who signed (Firebase sign-in), how they were authenticated, the SHA-256 of the exact PDF they
   were shown, their consent, time, IP and browser. A signature is only applied after an explicit, unchecked-by-default
   consent and an "Agree & Sign" press. The completed PDF (signatures stamped + audit certificate page) is stored
   privately with its own SHA-256 so any later change is detectable. This is an electronic signature under ESIGN/UETA,
   not a cryptographic digital certificate, and it is labeled that way. */
import { J, one, all, run, now, rid, pj, clean, audit, notify, signLink, sha256, isDate } from "./core.js";
export const ESIGN_VERSION = "2026-11";
const ROLES = ["customer", "tenant", "host", "landlord", "grooveville", "cosigner", "witness"];
const nameOf = s => [s.first, s.middle ? s.middle + "." : "", s.last].filter(Boolean).join(" ");
async function ev(D, C, doc, actor, event, data) { await run(D, "INSERT INTO doc_events (doc_id, at, actor, event, ip, ua, data) VALUES (?,?,?,?,?,?,?)", doc, now(), actor || "", event, C.ip || "", C.ua || "", JSON.stringify(data || {})) }
async function docView(C, d, me) {
  const { D, env, u } = C, signers = await all(D, "SELECT * FROM doc_signers WHERE doc_id = ? ORDER BY ord, id", d.id);
  const admin = u && u.admin, fields = pj(d.fields, []);
  return { id: d.id, title: d.title, division: d.division, kind: d.kind, status: d.status, pages: d.pages, source_hash: d.source_hash, final_hash: d.final_hash, sent_at: d.sent_at, completed_at: d.completed_at, expires_at: d.expires_at, message: d.message, ref_type: d.ref_type, ref_id: d.ref_id, text_body: d.text_body,
    source: d.source_key ? await signLink(env, d.source_key, 30) : "", final: d.final_key ? await signLink(env, d.final_key, 10, (d.title || "agreement").replace(/[^A-Za-z0-9 ._-]/g, "") + " (signed).pdf") : "",
    fields, signers: signers.map(s => Object.assign({ id: s.id, ord: s.ord, role: s.role, name: nameOf(s) || s.email, status: s.status, signed_at: s.signed_at, consent_at: s.consent_at, sig_text: s.sig_text, initials: s.initials, vals: pj(s.vals, {}), me: !!(me && me.id === s.id) }, admin ? { uid: s.uid, email: s.email, ip: s.ip, ua: s.ua, auth: s.auth } : {})),
    events: admin || (me && d.status === "completed") ? await all(D, "SELECT at, actor, event, ip, data FROM doc_events WHERE doc_id = ? ORDER BY id", d.id) : [] };
}
async function mySigner(D, u, docId) {
  let s = await one(D, "SELECT * FROM doc_signers WHERE doc_id = ? AND uid = ?", docId, u.uid);
  if (!s && u.email && u.email_verified) { s = await one(D, "SELECT * FROM doc_signers WHERE doc_id = ? AND uid IS NULL AND lower(email) = lower(?)", docId, u.email); if (s) { await run(D, "UPDATE doc_signers SET uid = ? WHERE id = ?", u.uid, s.id); s.uid = u.uid } }
  return s;
}
export async function finalizeHooks(C, d) {
  const { D, env } = C;
  if (d.ref_type === "rental_request") { const r = await one(D, "SELECT * FROM rental_requests WHERE id = ?", d.ref_id); if (r && r.status === "approved") await run(D, "UPDATE rental_requests SET status = 'active', updated = ? WHERE id = ?", now(), r.id) }
  if (d.ref_type === "event_agreement") { await run(D, "UPDATE event_agreements SET status = 'signed', signed_at = ? WHERE id = ? AND status IN ('accepted','sent')", now(), d.ref_id) }
  for (const s of await all(D, "SELECT uid, email FROM doc_signers WHERE doc_id = ?", d.id)) await notify(env, D, s.uid, "doc_completed", "Agreement completed", "All parties have signed. Your copy is in Documents.", "#sign/" + d.id, s.email);
}
export async function docsApi(C) {
  const { D, u, b, p, url, req, env } = C;
  if (!u) return J({ error: "Sign in to view documents" }, 401);
  /* ---------------- signer side ---------------- */
  if (p === "/api/p/docs/mine") return J({ docs: await all(D, "SELECT d.id, d.title, d.status, d.division, d.sent_at, d.completed_at, s.status AS my_status, s.role FROM doc_signers s JOIN documents d ON d.id = s.doc_id WHERE s.uid = ? AND d.status != 'draft' ORDER BY d.sent_at DESC", u.uid) });
  if (p === "/api/p/doc" && req.method === "GET") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", url.searchParams.get("id") || ""); if (!d) return J({ error: "Not found" }, 404);
    if (d.status === "draft" && !u.admin) return J({ error: "Not available" }, 403);
    const me = await mySigner(D, u, d.id);
    if (!me && !u.admin) {
      const pending = !u.email_verified && u.email && await one(D, "SELECT id FROM doc_signers WHERE doc_id = ? AND uid IS NULL AND lower(email) = lower(?)", d.id, u.email);
      if (pending) return J({ error: "Verify your email address to open this document", code: "verify" }, 403);
      return J({ error: "You don't have access to this document" }, 403);
    }
    if (me) { const last = await one(D, "SELECT at FROM doc_events WHERE doc_id = ? AND actor = ? AND event = 'viewed' ORDER BY id DESC LIMIT 1", d.id, u.uid); if (!last || Date.now() - Date.parse(last.at) > 36e5) await ev(D, C, d.id, u.uid, "viewed", { signer: me.id }) }
    const pr = await one(D, "SELECT first, middle, last, name_verified, esign_consent_at, esign_version FROM profiles WHERE uid = ?", u.uid);
    const blocked = me ? (await one(D, "SELECT COUNT(*) AS n FROM doc_signers WHERE doc_id = ? AND ord < ? AND status != 'signed'", d.id, me.ord)).n : 0;
    return J({ doc: await docView(C, d, me), me: me ? { id: me.id, role: me.role, status: me.status, waiting: blocked > 0 } : null, profile: pr, emailVerified: !!u.email_verified, auth: u.auth, esignVersion: ESIGN_VERSION });
  }
  if (p === "/api/p/doc/sign" && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", String(b.id || "")); if (!d) return J({ error: "Not found" }, 404);
    if (!["sent", "partially_signed"].includes(d.status)) return J({ error: "This document isn't open for signing (" + d.status + ")" }, 409);
    if (d.expires_at && d.expires_at < now()) { await run(D, "UPDATE documents SET status = 'expired' WHERE id = ?", d.id); return J({ error: "This document has expired. Ask Grooveville to send a new one." }, 409) }
    if (C.mode === "live" && !C.S.esign_live) { /* production signing switch */ if (!u.admin && !u.tester) return J({ error: "Electronic signing isn't live yet." }, 403) }
    const me = await mySigner(D, u, d.id); if (!me) return J({ error: "You aren't a signer on this document" }, 403); if (me.status === "signed") return J({ error: "You already signed this document", already: true }, 409);
    const wait = (await one(D, "SELECT COUNT(*) AS n FROM doc_signers WHERE doc_id = ? AND ord < ? AND status != 'signed'", d.id, me.ord)).n; if (wait) return J({ error: "Another party needs to sign first" }, 409);
    if (b.consent !== true) return J({ error: "Check the box to agree to sign electronically" }, 400);
    if (String(b.sourceHash || "") !== d.source_hash) return J({ error: "The document changed or didn't load completely. Reload it and review it again before signing." }, 409);
    const pr = await one(D, "SELECT * FROM profiles WHERE uid = ?", u.uid); if (!pr || !pr.first || !pr.last) return J({ error: "Add your legal name in Profile & Settings first", code: "profile" }, 400);
    if (!u.email_verified && !pr.name_verified && !u.admin) return J({ error: "Verify your email address before signing", code: "verify" }, 403);
    if (!pr.esign_consent_at) { if (b.esignConsent !== true) return J({ error: "Review and accept the electronic records disclosure first", code: "esign" }, 400); await run(D, "UPDATE profiles SET esign_consent_at = ?, esign_version = ? WHERE uid = ?", now(), ESIGN_VERSION, u.uid); await ev(D, C, d.id, u.uid, "esign_disclosure_accepted", { version: ESIGN_VERSION }) }
    const fields = pj(d.fields, []).filter(f => f.signer === me.ord), vals = {};
    for (const f of fields) if (f.type === "text") { const v = clean((b.values || {})[f.id], 200); if (f.required && !v) return J({ error: "Fill in “" + (f.label || "text") + "”" }, 400); vals[f.id] = v }
    const sig = nameOf(pr), ini = (pr.first[0] + (pr.middle || "") + pr.last[0]).toUpperCase(), at = now();
    const r = await run(D, "UPDATE doc_signers SET status = 'signed', consent_at = ?, signed_at = ?, ip = ?, ua = ?, auth = ?, sig_text = ?, initials = ?, vals = ?, first = ?, middle = ?, last = ?, uid = ? WHERE id = ? AND status != 'signed'", at, at, C.ip, C.ua, u.auth, sig, ini, JSON.stringify(vals), pr.first, pr.middle || "", pr.last, u.uid, me.id);
    if (!(r.meta && r.meta.changes === 1)) return J({ error: "Already signed" }, 409);
    await ev(D, C, d.id, u.uid, "consented", { signer: me.id }); await ev(D, C, d.id, u.uid, "signed", { signer: me.id, name: sig, documentSha256: d.source_hash, auth: u.auth });
    await audit(D, u.uid, "document_signed", "document", d.id, { signer: me.id, sha256: d.source_hash });
    const left = await all(D, "SELECT * FROM doc_signers WHERE doc_id = ? AND status != 'signed' ORDER BY ord", d.id);
    await run(D, "UPDATE documents SET status = 'partially_signed' WHERE id = ?", d.id);
    if (left.length) { const nextOrd = left[0].ord; for (const s of left.filter(x => x.ord === nextOrd)) await notify(env, D, s.uid, "doc_to_sign", "A document is ready for your signature", "Sign in to Grooveville to review and sign it.", "#sign/" + d.id, s.email) }
    else for (const a of (await all(D, "SELECT DISTINCT uid FROM roles WHERE role = 'admin'")).map(x => x.uid)) await notify(env, D, a, "doc_ready", "All signatures collected", d.title + " is ready to finalize.", "#team-portals/docs");
    return J({ ok: true, signed_at: at, signature: sig, initials: ini, allSigned: !left.length });
  }
  if (p === "/api/p/doc/decline" && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", String(b.id || "")); const me = d && await mySigner(D, u, d.id); if (!me || me.status === "signed") return J({ error: "Not available" }, 400);
    await run(D, "UPDATE doc_signers SET status = 'declined' WHERE id = ?", me.id); await ev(D, C, d.id, u.uid, "declined", { reason: clean(b.reason, 500) });
    for (const a of (await all(D, "SELECT DISTINCT uid FROM roles WHERE role = 'admin'")).map(x => x.uid)) await notify(env, D, a, "doc_declined", "A signer declined a document", d.title, "#team-portals/docs"); return J({ ok: true });
  }
  /* ---------------- admin side ---------------- */
  if (!p.startsWith("/api/p/doc/admin")) return J({ error: "Not found" }, 404);
  if (!u.admin) return J({ error: "Grooveville administrators only" }, 403);
  if (p === "/api/p/doc/admin/list") { const L = await all(D, "SELECT id, title, division, kind, status, ref_type, ref_id, sent_at, completed_at, created, expires_at FROM documents ORDER BY created DESC LIMIT 300"); const S = await all(D, "SELECT doc_id, role, first, last, email, status, ord FROM doc_signers"); return J({ docs: L.map(d => Object.assign(d, { signers: S.filter(s => s.doc_id === d.id) })) }) }
  if (p === "/api/p/doc/admin/create" && req.method === "POST") {
    const key = String(b.sourceKey || ""); if (!/^portal\/priv\/doc\//.test(key)) return J({ error: "Upload the PDF first" }, 400);
    const o = await env.STUDIO_BUCKET.head(key); if (!o) return J({ error: "Upload not found" }, 404); const hash = (o.customMetadata && o.customMetadata.sha256) || ""; if (!/^[0-9a-f]{64}$/.test(hash)) return J({ error: "Upload missing its fingerprint; upload it again" }, 400);
    if (b.sourceHash && b.sourceHash !== hash) return J({ error: "The upload didn't arrive intact; upload it again" }, 400);
    const id = rid(12), div = ["rentals", "entertainment", "general"].includes(b.division) ? b.division : "general";
    await run(D, "INSERT INTO documents (id, title, division, kind, ref_type, ref_id, source_key, source_hash, text_body, pages, fields, status, expires_at, created_by, created, message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id, clean(b.title, 160) || "Agreement", div, b.kind === "generated" ? "generated" : "upload", clean(b.refType, 40), clean(b.refId, 60), key, hash, clean(b.textBody, 60000), Math.max(1, Math.min(500, Number(b.pages) || 1)), "[]", "draft", isDate(b.expiresAt) ? b.expiresAt + "T23:59:59Z" : null, u.uid, now(), clean(b.message, 1000));
    await ev(D, C, id, u.uid, "created", { sha256: hash, title: b.title }); await audit(D, u.uid, "document_created", "document", id, { sha256: hash, ref: b.refType + ":" + (b.refId || "") });
    if (b.refType === "event_agreement" && b.refId) await run(D, "UPDATE event_agreements SET doc_id = ? WHERE id = ?", id, b.refId);
    return J({ ok: true, id, sha256: hash });
  }
  if (p === "/api/p/doc/admin/setup" && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", String(b.id || "")); if (!d) return J({ error: "Not found" }, 404); if (d.status !== "draft") return J({ error: "Fields can't change after the document is sent. Supersede it with a new version instead." }, 409);
    const signers = (b.signers || []).slice(0, 8).map((s, i) => ({ id: rid(10), ord: Math.max(0, Math.min(9, Number(s.ord != null ? s.ord : i) | 0)), role: ROLES.includes(s.role) ? s.role : "customer", uid: clean(s.uid, 128) || null, email: clean(s.email, 200).toLowerCase(), first: clean(s.first, 40), middle: clean(s.middle, 1), last: clean(s.last, 60) }));
    if (!signers.length) return J({ error: "Add at least one signer" }, 400); for (const s of signers) if (!s.uid && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) return J({ error: "Each signer needs an account or an email address" }, 400);
    const fields = (b.fields || []).slice(0, 200).map(f => ({ id: clean(f.id, 20) || rid(6), type: ["signature", "initials", "date", "text", "name"].includes(f.type) ? f.type : "signature", page: Math.max(1, Math.min(d.pages || 1, Number(f.page) | 0)), x: +Math.max(0, Math.min(1, Number(f.x))).toFixed(4), y: +Math.max(0, Math.min(1, Number(f.y))).toFixed(4), w: +Math.max(.02, Math.min(1, Number(f.w))).toFixed(4), h: +Math.max(.01, Math.min(1, Number(f.h))).toFixed(4), signer: Math.max(0, Math.min(signers.length - 1, Number(f.signer) | 0)), label: clean(f.label, 60), required: f.required !== false }));
    const idx = [...new Set(signers.map(s => s.ord))].sort((a, c) => a - c); /* signer index in fields refers to the position in the list; store ord on fields */
    const F = fields.map(f => Object.assign(f, { signer: signers[f.signer].ord }));
    for (const s of signers) if (!F.some(f => f.signer === s.ord && f.type === "signature")) return J({ error: "Every signer needs at least one signature field" }, 400);
    await run(D, "DELETE FROM doc_signers WHERE doc_id = ?", d.id); for (const s of signers) await run(D, "INSERT INTO doc_signers (id, doc_id, ord, role, uid, email, first, middle, last, status) VALUES (?,?,?,?,?,?,?,?,?,?)", s.id, d.id, s.ord, s.role, s.uid, s.email, s.first, s.middle, s.last, "pending");
    await run(D, "UPDATE documents SET fields = ?, title = COALESCE(?, title), message = COALESCE(?, message) WHERE id = ?", JSON.stringify(F), b.title ? clean(b.title, 160) : null, b.message != null ? clean(b.message, 1000) : null, d.id); await ev(D, C, d.id, u.uid, "fields_set", { signers: signers.length, fields: F.length, order: idx }); return J({ ok: true });
  }
  if (p === "/api/p/doc/admin/send" && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ? AND status = 'draft'", String(b.id || "")); if (!d) return J({ error: "Only drafts can be sent" }, 409);
    const S = await all(D, "SELECT * FROM doc_signers WHERE doc_id = ? ORDER BY ord", d.id); if (!S.length || !pj(d.fields, []).length) return J({ error: "Place the signature fields and choose the signers first" }, 400);
    await run(D, "UPDATE documents SET status = 'sent', sent_at = ? WHERE id = ?", now(), d.id); await ev(D, C, d.id, u.uid, "sent", {}); await audit(D, u.uid, "document_sent", "document", d.id, { sha256: d.source_hash });
    if (d.ref_type === "event_agreement") await run(D, "UPDATE event_agreements SET status = 'sent' WHERE id = ? AND status = 'accepted'", d.ref_id);
    for (const s of S.filter(x => x.ord === S[0].ord)) await notify(env, D, s.uid, "doc_to_sign", "A document is ready for your signature", "Sign in to Grooveville to review and sign it.", "#sign/" + d.id, s.email);
    return J({ ok: true });
  }
  if ((p === "/api/p/doc/admin/cancel" || p === "/api/p/doc/admin/supersede") && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", String(b.id || "")); if (!d) return J({ error: "Not found" }, 404); if (d.status === "completed" && p.endsWith("cancel")) return J({ error: "Completed agreements can't be canceled; supersede them with a new version." }, 409);
    const st = p.endsWith("cancel") ? "canceled" : "superseded"; await run(D, "UPDATE documents SET status = ? WHERE id = ?", st, d.id); await ev(D, C, d.id, u.uid, st, { reason: clean(b.reason, 300), by: b.newId || "" }); await audit(D, u.uid, "document_" + st, "document", d.id, { reason: clean(b.reason, 300) });
    if (st === "superseded" && b.newId) await run(D, "UPDATE documents SET supersedes = ? WHERE id = ?", d.id, String(b.newId)); return J({ ok: true });
  }
  if (p === "/api/p/doc/admin/finalize" && req.method === "POST") {
    const d = await one(D, "SELECT * FROM documents WHERE id = ?", url.searchParams.get("id") || ""); if (!d) return J({ error: "Not found" }, 404); if (d.status === "completed") return J({ ok: true, already: true, sha256: d.final_hash });
    const left = await one(D, "SELECT COUNT(*) AS n FROM doc_signers WHERE doc_id = ? AND status != 'signed'", d.id); if (left.n) return J({ error: "Not everyone has signed yet" }, 409);
    const buf = new Uint8Array(await req.arrayBuffer()); if (buf.length < 500 || buf.length > 30e6 || !(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return J({ error: "That isn't a valid PDF" }, 400);
    const claimed = String(url.searchParams.get("source") || ""); if (claimed !== d.source_hash) return J({ error: "The completed file was built from a different version of the document" }, 409);
    const hash = await sha256(buf), key = d.source_key.replace(/[^/]+$/, "") + "final-" + d.id + "-" + hash.slice(0, 12) + ".pdf";
    await env.STUDIO_BUCKET.put(key, buf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { sha256: hash, source: d.source_hash, doc: d.id } });
    const r = await run(D, "UPDATE documents SET status = 'completed', completed_at = ?, final_key = ?, final_hash = ? WHERE id = ? AND status != 'completed'", now(), key, hash, d.id); if (!(r.meta && r.meta.changes)) return J({ ok: true, already: true });
    await ev(D, C, d.id, u.uid, "completed", { finalSha256: hash, originalSha256: d.source_hash }); await audit(D, u.uid, "document_completed", "document", d.id, { final: hash, original: d.source_hash });
    await finalizeHooks(C, Object.assign({}, d, { final_hash: hash })); return J({ ok: true, sha256: hash });
  }
  return J({ error: "Not found" }, 404);
}
export async function docsCron(D) { await run(D, "UPDATE documents SET status = 'expired' WHERE status IN ('sent','partially_signed') AND expires_at IS NOT NULL AND expires_at < ?", now()) }
