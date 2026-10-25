-- Add observed device details without inventing historical login/activity times.
ALTER TABLE admin_device_sessions
  ADD COLUMN IF NOT EXISTS device_name varchar(120),
  ADD COLUMN IF NOT EXISTS model_name varchar(120),
  ADD COLUMN IF NOT EXISTS platform varchar(24),
  ADD COLUMN IF NOT EXISTS os_version varchar(64),
  ADD COLUMN IF NOT EXISTS app_version varchar(40),
  ADD COLUMN IF NOT EXISTS user_agent varchar(256),
  ADD COLUMN IF NOT EXISTS first_ip inet,
  ADD COLUMN IF NOT EXISTS last_ip inet,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE admin_push_tokens
  ADD COLUMN IF NOT EXISTS device_session_id uuid REFERENCES admin_device_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS admin_push_tokens_device_session_idx ON admin_push_tokens(device_session_id);
