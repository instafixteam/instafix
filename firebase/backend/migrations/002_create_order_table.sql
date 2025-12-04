-- 002_create_order_table.sql
-- Requires: a "User" table with column uid

-- Generic updated_at trigger function (safe if already defined)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "Order" (
  id BIGSERIAL PRIMARY KEY,
  user_uid VARCHAR(128) NOT NULL
    REFERENCES "User"(uid) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'InstaFix Service',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','canceled')),
  stripe_payment_intent_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_user
  ON "Order"(user_uid);

CREATE INDEX IF NOT EXISTS idx_order_pi
  ON "Order"(stripe_payment_intent_id);

-- Keep updated_at fresh
CREATE OR REPLACE TRIGGER trg_order_updated_at
BEFORE UPDATE ON "Order"
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
