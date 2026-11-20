CREATE TABLE IF NOT EXISTS finance_businesses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL
);
INSERT OR IGNORE INTO finance_businesses (id,name) VALUES
  ('hq','Grooveville LLC'),('rentals','Grooveville Rentals'),('ent','Grooveville Entertainment'),
  ('music','Grooveville Music'),('aelio','AELIO'),('vybr8','Vybr8'),('pathd','Pathd'),
  ('w4w','W4W'),('aec','DrawUp AEC'),('scu','Shadow Crown Universe'),('wit','What If Tomorrow');
CREATE TABLE IF NOT EXISTS business_finance_entries (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES finance_businesses(id),
  kind TEXT NOT NULL CHECK(kind IN ('income','ai','bill','stripe')),
  name TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  fees_cents INTEGER NOT NULL DEFAULT 0, refunded_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('open','settled')), credit_units INTEGER NOT NULL DEFAULT 0,
  entry_date TEXT NOT NULL, created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS business_finance_business ON business_finance_entries(business_id, entry_date);
