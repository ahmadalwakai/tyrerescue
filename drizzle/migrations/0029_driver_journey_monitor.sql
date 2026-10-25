-- Additive, admin-only observation state. Does not assign drivers or alter bookings.
CREATE TABLE IF NOT EXISTS driver_journey_states (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS driver_journey_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_day varchar(10) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','ended','expired')),
  revision integer NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  inferred_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_evidence_at timestamptz NOT NULL,
  responded_at timestamptz,
  responded_by uuid REFERENCES users(id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS driver_journey_one_active_per_driver
  ON driver_journey_observations(driver_id) WHERE status IN ('pending','confirmed');
CREATE INDEX IF NOT EXISTS driver_journey_booking_idx ON driver_journey_observations(booking_id);
CREATE INDEX IF NOT EXISTS driver_journey_driver_booking_day_idx ON driver_journey_observations(driver_id,booking_id,service_day);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS driver_journey_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL REFERENCES driver_journey_observations(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('confirmation','near','stopped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  push_attempted_at timestamptz,
  push_claimed_until timestamptz,
  push_attempts integer NOT NULL DEFAULT 0,
  push_accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS driver_journey_events_created_idx ON driver_journey_events(created_at);
