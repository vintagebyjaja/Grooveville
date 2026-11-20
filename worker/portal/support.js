import { J, all, one, clean, limited, now, rid, audit, notify } from "./core.js";

export async function supportApi(C) {
  const { D, u, req, url, p, b, env, S, ctx } = C;
  if (!u) return J({ error: "Sign in first" }, 401);
  const team = p === "/api/p/admin/support";
  if (team && !u.admin) return J({ error: "Grooveville administrators only" }, 403);
  const id = clean(req.method === "GET" ? url.searchParams.get("id") : b.id, 40);
  const thread = id ? await (team
    ? one(D, "SELECT id,uid,subject,updated FROM portal_support_threads WHERE id=?", id)
    : one(D, "SELECT id,uid,subject,updated FROM portal_support_threads WHERE id=? AND uid=?", id, u.uid)) : null;
  if (id && !thread) return J({ error: "Conversation not found" }, 404);
  if (req.method === "GET") {
    if (thread) return J({ thread, replies: await all(D, "SELECT author,body,created FROM portal_support_replies WHERE thread_id=? ORDER BY seq", id) });
    return J({ threads: await (team
      ? all(D, "SELECT t.id,t.subject,t.updated,p.email FROM portal_support_threads t LEFT JOIN profiles p ON p.uid=t.uid ORDER BY t.updated DESC LIMIT 200")
      : all(D, "SELECT id,subject,updated FROM portal_support_threads WHERE uid=? ORDER BY updated DESC LIMIT 200", u.uid)) });
  }
  if (req.method !== "POST") return J({ error: "Method not allowed" }, 405);
  if (team && !thread) return J({ error: "Choose a conversation" }, 400);
  const message = clean(b.message, 3000);
  if (!message) return J({ error: "Write a message first" }, 400);
  if (await limited(D, "sup:" + u.uid, team ? 40 : 6, 3600)) return J({ error: "Too many messages. Try again later." }, 429);
  const tid = id || rid(12), at = now(), subject = thread?.subject || clean(b.subject, 120) || "Message from the portal";
  const save = thread ? D.prepare("UPDATE portal_support_threads SET updated=? WHERE id=?").bind(at, tid)
    : D.prepare("INSERT INTO portal_support_threads (id,uid,subject,updated) VALUES (?,?,?,?)").bind(tid, u.uid, subject, at);
  await D.batch([save, D.prepare("INSERT INTO portal_support_replies (thread_id,author,body,created) VALUES (?,?,?,?)").bind(tid, team ? "team" : "customer", message, at)]);
  ctx.waitUntil((async () => {
    await audit(D, u.uid, team ? "support_reply" : "support_message_saved", "support_thread", tid, {});
    if (team) await notify(env, D, thread.uid, "support", subject, "Grooveville replied to your message.", "#rentals/support?id=" + tid);
    else {
      const admins = await all(D, "SELECT DISTINCT uid FROM roles WHERE role='admin'");
      for (const uid of new Set(admins.map(a => a.uid).concat(S.founder_uid ? [S.founder_uid] : []))) {
        await notify(env, D, uid, "support", subject, "A customer sent a portal message.", "#team-portals/support?id=" + tid);
      }
    }
  })().catch(error => console.error("Portal support notification:", error.message)));
  return J({ ok: true, id: tid });
}
