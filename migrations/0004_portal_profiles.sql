CREATE TABLE IF NOT EXISTS account_photos (
  uid TEXT PRIMARY KEY, key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS host_organizations (
  id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(id), slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', photo_key TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#f1ae8a', created TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS host_organizations_host ON host_organizations(host_id);
CREATE TABLE IF NOT EXISTS event_organizations (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES host_organizations(id)
);
CREATE INDEX IF NOT EXISTS event_organizations_org ON event_organizations(organization_id);
