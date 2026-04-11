CREATE TABLE "driver_sound_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" varchar(50) DEFAULT 'audio/wav' NOT NULL,
	"file_size" integer,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_sound_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" varchar(50) NOT NULL,
	"sound_file" varchar(100) DEFAULT 'new_job.wav' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"volume" real DEFAULT 1 NOT NULL,
	"vibration_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "driver_sound_settings_event_unique" UNIQUE("event")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_type" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_amount_pence" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deposit_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "remaining_balance_pence" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "stripe_deposit_pi_id" varchar(255);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "location_source" text;--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD COLUMN "selected_tyre_product_id" uuid;--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD COLUMN "selected_tyre_unit_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD COLUMN "selected_tyre_brand" varchar(100);--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD COLUMN "selected_tyre_pattern" varchar(200);--> statement-breakpoint
ALTER TABLE "driver_sound_assets" ADD CONSTRAINT "driver_sound_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sound_settings" ADD CONSTRAINT "driver_sound_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD CONSTRAINT "quick_bookings_selected_tyre_product_id_tyre_products_id_fk" FOREIGN KEY ("selected_tyre_product_id") REFERENCES "public"."tyre_products"("id") ON DELETE no action ON UPDATE no action;