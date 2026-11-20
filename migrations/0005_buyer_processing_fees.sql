CREATE TABLE IF NOT EXISTS order_processing_fees (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  cents INTEGER NOT NULL CHECK(cents > 0)
);
