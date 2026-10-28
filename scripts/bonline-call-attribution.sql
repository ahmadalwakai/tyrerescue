-- Apply after bonline-call-management.sql. Local preparation only.
BEGIN;
CREATE TABLE IF NOT EXISTS bonline_call_links (
  scope varchar(64) NOT NULL,
  event_key varchar(64) NOT NULL,
  quote_id uuid REFERENCES admin_quote_drafts(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  linked_by varchar(256) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (scope, event_key),
  FOREIGN KEY (scope, event_key) REFERENCES bonline_calls(scope, event_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bonline_call_links_booking_idx ON bonline_call_links(scope, booking_id);
CREATE INDEX IF NOT EXISTS bonline_call_links_quote_idx ON bonline_call_links(scope, quote_id);
COMMIT;
