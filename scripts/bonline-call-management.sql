-- Additive, repeatable durable call ledger. Apply after bonline-call-events.sql.
-- Both migrations are required before deploying the durable webhook writer.
BEGIN;

-- Carries verified direction across concurrent create/end upserts. Reading this
-- returned row avoids relying on a pre-lock MVCC snapshot of the new ledger.
ALTER TABLE bonline_call_events
  ADD COLUMN IF NOT EXISTS incoming_verified boolean NOT NULL DEFAULT false;
ALTER TABLE bonline_call_events
  ADD COLUMN IF NOT EXISTS verified_answered_at timestamptz;
ALTER TABLE bonline_call_events
  ADD COLUMN IF NOT EXISTS provider_ended_at timestamptz;

CREATE TABLE IF NOT EXISTS bonline_calls (
  scope varchar(64) NOT NULL,
  event_key varchar(64) NOT NULL,
  call_id varchar(256) NOT NULL,
  phone varchar(16),
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  first_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome varchar(16) NOT NULL DEFAULT 'unknown'
    CHECK (outcome IN ('unknown', 'ringing', 'answered', 'missed')),
  explicit_unanswered boolean NOT NULL DEFAULT false,
  follow_up_required boolean NOT NULL DEFAULT false,
  PRIMARY KEY (scope, event_key)
);
CREATE INDEX IF NOT EXISTS bonline_calls_recent_idx
  ON bonline_calls (scope, last_received_at DESC, event_key DESC);
CREATE INDEX IF NOT EXISTS bonline_calls_outcome_idx
  ON bonline_calls (scope, outcome, started_at DESC);

CREATE TABLE IF NOT EXISTS bonline_call_followups (
  scope varchar(64) NOT NULL,
  event_key varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'resolved')),
  assigned_to varchar(256),
  claimed_at timestamptz,
  resolved_at timestamptz,
  resolved_by varchar(256),
  resolution varchar(500),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope, event_key),
  FOREIGN KEY (scope, event_key) REFERENCES bonline_calls (scope, event_key) ON DELETE CASCADE,
  CHECK (status <> 'claimed' OR (assigned_to IS NOT NULL AND claimed_at IS NOT NULL)),
  CHECK (status <> 'resolved' OR resolved_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS bonline_call_followups_queue_idx
  ON bonline_call_followups (scope, status, created_at, event_key);

CREATE TABLE IF NOT EXISTS bonline_outbound_attempts (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  admin_user_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  phone text NOT NULL,
  booking_id text,
  source_call_id text,
  rate_bucket bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'failed', 'unknown')),
  provider_call_id text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, admin_user_id, idempotency_key),
  UNIQUE (scope, admin_user_id, rate_bucket)
);

COMMIT;
