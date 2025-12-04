-- 001_create_stripe_customer_table.sql
-- Requires: a "User" table with column uid

-- Generic updated_at trigger function (safe if re-run elsewhere)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "StripeCustomer" (
  id SERIAL PRIMARY KEY,
  user_uid VARCHAR(128) UNIQUE NOT NULL
    REFERENCES "User"(uid) ON DELETE CASCADE,
  -- AES-GCM encrypted Stripe customer id (format: IV:Ciphertext:Tag)
  encrypted_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_stripe_customer_user_uid
  ON "StripeCustomer"(user_uid);

-- Keep updated_at fresh
CREATE OR REPLACE TRIGGER trg_stripe_customer_updated_at
BEFORE UPDATE ON "StripeCustomer"
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
