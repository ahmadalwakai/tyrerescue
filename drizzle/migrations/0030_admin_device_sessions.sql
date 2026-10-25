-- Opt-in Assisted Chat admin device credentials. Never stores a plaintext token.
-- No expiry/inactivity deadline; logout revokes only the presented device token.
CREATE TABLE IF NOT EXISTS admin_device_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_device_sessions_user_idx ON admin_device_sessions(user_id);
