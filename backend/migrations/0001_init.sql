-- Users table: created on first sign-in via Clerk
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,        -- Clerk user_id
  email       TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro'
  stripe_customer_id TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Daily usage per user
CREATE TABLE IF NOT EXISTS usage (
  user_id     TEXT NOT NULL,
  date        TEXT NOT NULL,           -- YYYY-MM-DD
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Anonymous usage tracked by device UUID (before sign-in)
CREATE TABLE IF NOT EXISTS anon_usage (
  device_id   TEXT NOT NULL,
  date        TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage (user_id, date);
CREATE INDEX IF NOT EXISTS idx_anon_usage_device_date ON anon_usage (device_id, date);
