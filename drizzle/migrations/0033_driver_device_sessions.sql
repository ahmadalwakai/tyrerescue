-- Additive driver-only credentials; no existing users, sessions or bookings change.
CREATE TABLE IF NOT EXISTS driver_device_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  device_name varchar(120),
  model_name varchar(120),
  platform varchar(24),
  os_version varchar(64),
  app_version varchar(40),
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS driver_device_sessions_user_idx ON driver_device_sessions(user_id);
