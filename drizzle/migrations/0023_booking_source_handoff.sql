ALTER TABLE "bookings" ADD COLUMN "source_app" varchar(60) DEFAULT 'tyre_rescue' NOT NULL;
ALTER TABLE "bookings" ADD COLUMN "source_label" varchar(120) DEFAULT 'Tyre Rescue' NOT NULL;
ALTER TABLE "bookings" ADD COLUMN "external_reference" varchar(120);

CREATE INDEX "bookings_source_app_idx" ON "bookings" ("source_app");
CREATE INDEX "bookings_external_reference_idx" ON "bookings" ("external_reference") WHERE "external_reference" IS NOT NULL;
CREATE UNIQUE INDEX "bookings_source_external_reference_unique" ON "bookings" ("source_app", "external_reference") WHERE "external_reference" IS NOT NULL;
