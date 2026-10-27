-- Additive, repeatable migration for the short-lived bOnline incoming-call feed.
-- Run against the intended project's database before enabling the webhook.
BEGIN;

CREATE TABLE IF NOT EXISTS bonline_event_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  cursor bigint NOT NULL DEFAULT 0 CHECK (cursor >= 0)
);
INSERT INTO bonline_event_state (id, cursor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bonline_call_events (
  scope varchar(64) NOT NULL,
  event_key varchar(64) NOT NULL,
  sequence bigint NOT NULL,
  call_id varchar(256) NOT NULL,
  phone varchar(16),
  created_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  PRIMARY KEY (scope, event_key)
);
CREATE INDEX IF NOT EXISTS bonline_call_events_feed_idx ON bonline_call_events (scope, sequence);
CREATE INDEX IF NOT EXISTS bonline_call_events_expiry_idx ON bonline_call_events (received_at);

COMMIT;
