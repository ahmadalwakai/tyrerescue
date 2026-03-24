CREATE TABLE IF NOT EXISTS "driver_sound_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event" varchar(50) NOT NULL UNIQUE,
  "sound_file" varchar(100) NOT NULL DEFAULT 'new_job.wav',
  "enabled" boolean NOT NULL DEFAULT true,
  "volume" real NOT NULL DEFAULT 1.0,
  "vibration_enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT NOW()
);

-- Seed default settings for all four sound events
INSERT INTO "driver_sound_settings" ("event", "sound_file", "enabled", "volume", "vibration_enabled")
VALUES
  ('new_job', 'new_job.wav', true, 1.0, true),
  ('job_accepted', 'new_job.wav', true, 0.8, false),
  ('job_completed', 'new_job.wav', true, 0.8, false),
  ('new_message', 'new_job.wav', true, 0.7, true)
ON CONFLICT ("event") DO NOTHING;
