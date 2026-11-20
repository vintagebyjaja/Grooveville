CREATE TABLE IF NOT EXISTS portal_support_threads (
  id TEXT PRIMARY KEY, uid TEXT NOT NULL, subject TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_support_threads_uid ON portal_support_threads(uid, updated);
CREATE TABLE IF NOT EXISTS portal_support_replies (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES portal_support_threads(id),
  author TEXT NOT NULL CHECK(author IN ('customer','team')),
  body TEXT NOT NULL, created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS portal_support_replies_thread ON portal_support_replies(thread_id, seq);
INSERT OR IGNORE INTO portal_support_threads (id,uid,subject,updated)
SELECT 'legacy-' || id, actor, COALESCE(NULLIF(json_extract(data,'$.subject'), ''), 'Message from the portal'), at
FROM audit WHERE action='support_message' AND actor <> '' AND json_valid(data);
INSERT INTO portal_support_replies (thread_id,author,body,created)
SELECT t.id,'customer',COALESCE(json_extract(a.data,'$.message'), ''),a.at
FROM audit a JOIN portal_support_threads t ON t.id='legacy-' || a.id
WHERE a.action='support_message' AND json_valid(a.data)
AND NOT EXISTS (SELECT 1 FROM portal_support_replies r WHERE r.thread_id=t.id);
