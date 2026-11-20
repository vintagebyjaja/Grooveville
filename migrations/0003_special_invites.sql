-- Event-level purchases, revocable bearer links, and first-party engagement.
CREATE TABLE IF NOT EXISTS special_invites (
  token TEXT PRIMARY KEY, event_id TEXT NOT NULL, host_id TEXT NOT NULL, visibility TEXT NOT NULL,
  template TEXT NOT NULL, theme TEXT NOT NULL, guest TEXT NOT NULL, message TEXT NOT NULL,
  destination TEXT NOT NULL, created TEXT NOT NULL, revoked TEXT
);
CREATE INDEX IF NOT EXISTS special_invites_event ON special_invites(event_id);
CREATE TABLE IF NOT EXISTS special_invite_engagement (
  token TEXT NOT NULL, visitor TEXT NOT NULL, opened INTEGER NOT NULL DEFAULT 0,
  revealed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(token,visitor)
);
CREATE TABLE IF NOT EXISTS special_invite_orders (order_id TEXT PRIMARY KEY, token TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS special_invite_orders_token ON special_invite_orders(token);
CREATE TABLE IF NOT EXISTS special_invite_upgrades (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, host_id TEXT NOT NULL, status TEXT NOT NULL,
  checkout_session TEXT UNIQUE, checkout_url TEXT, payment_intent TEXT UNIQUE, paid_at TEXT,
  refunded_cents INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL, created TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS special_invite_upgrade_active ON special_invite_upgrades(event_id)
  WHERE status IN ('pending','paid','revoked');
