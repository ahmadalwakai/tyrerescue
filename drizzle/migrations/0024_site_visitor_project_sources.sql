ALTER TABLE "site_visitors" ADD COLUMN IF NOT EXISTS "source_app" varchar(60) DEFAULT 'tyre_rescue' NOT NULL;
ALTER TABLE "site_visitors" ADD COLUMN IF NOT EXISTS "source_label" varchar(120) DEFAULT 'Tyre Rescue' NOT NULL;

CREATE INDEX IF NOT EXISTS "site_visitors_source_app_idx" ON "site_visitors" ("source_app");
CREATE INDEX IF NOT EXISTS "site_visitors_source_app_live_idx" ON "site_visitors" ("source_app", "is_online", "last_heartbeat");
