-- Store external host payment details alongside existing settlement history.
CREATE TABLE IF NOT EXISTS manual_host_payments (
  payout_id TEXT PRIMARY KEY REFERENCES payouts(id), paid_on TEXT NOT NULL, method TEXT NOT NULL, reference TEXT
);
