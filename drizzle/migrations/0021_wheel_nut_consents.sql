ALTER TABLE "bookings" ADD COLUMN "wheel_nut_consent_required_at" timestamp with time zone;
ALTER TABLE "bookings" ADD COLUMN "wheel_nut_consent_required_by_driver_id" uuid;
ALTER TABLE "bookings" ADD COLUMN "wheel_nut_consent_reason" text;

CREATE TABLE "wheel_nut_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL,
  "booking_ref" varchar(20) NOT NULL,
  "driver_id" uuid,
  "driver_user_id" uuid,
  "driver_name" varchar(255),
  "customer_name" varchar(255) NOT NULL,
  "customer_email" varchar(255),
  "vehicle_reg" varchar(16),
  "declaration_text" text NOT NULL,
  "declaration_accepted" boolean DEFAULT false NOT NULL,
  "signature_url" text NOT NULL,
  "signature_mime_type" varchar(50) DEFAULT 'image/png' NOT NULL,
  "signature_file_size" integer,
  "signature_point_count" integer,
  "signature_sha256" varchar(64),
  "pdf_url" text NOT NULL,
  "pdf_file_size" integer,
  "pdf_sha256" varchar(64),
  "gps_lat" numeric(9, 6),
  "gps_lng" numeric(9, 6),
  "gps_accuracy" real,
  "device_id" text,
  "device_label" text,
  "email_status" text DEFAULT 'not_sent' NOT NULL,
  "email_sent_at" timestamp with time zone,
  "email_error" text,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_wheel_nut_consent_required_by_driver_id_drivers_id_fk" FOREIGN KEY ("wheel_nut_consent_required_by_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wheel_nut_consents" ADD CONSTRAINT "wheel_nut_consents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "wheel_nut_consents" ADD CONSTRAINT "wheel_nut_consents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "wheel_nut_consents" ADD CONSTRAINT "wheel_nut_consents_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "wheel_nut_consents_booking_id_idx" ON "wheel_nut_consents" ("booking_id");
CREATE INDEX "wheel_nut_consents_booking_ref_idx" ON "wheel_nut_consents" ("booking_ref");
