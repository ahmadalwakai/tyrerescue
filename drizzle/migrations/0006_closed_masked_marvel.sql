CREATE TABLE "demand_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hour_start" timestamp with time zone NOT NULL,
	"page_views" integer DEFAULT 0,
	"call_clicks" integer DEFAULT 0,
	"booking_starts" integer DEFAULT 0,
	"booking_completes" integer DEFAULT 0,
	"whatsapp_clicks" integer DEFAULT 0,
	"surcharge_applied" numeric(5, 2) DEFAULT '0.00',
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "driver_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"booking_ref" varchar(20),
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_callout_fee" numeric(10, 2) DEFAULT '0.00',
	"base_fitting_fee" numeric(10, 2) DEFAULT '20.00',
	"night_surcharge_percent" numeric(5, 2) DEFAULT '15.00',
	"night_start_hour" integer DEFAULT 18,
	"night_end_hour" integer DEFAULT 6,
	"manual_surcharge_percent" numeric(5, 2) DEFAULT '0.00',
	"manual_surcharge_active" boolean DEFAULT false,
	"demand_surcharge_percent" numeric(5, 2) DEFAULT '0.00',
	"demand_threshold_clicks" integer DEFAULT 20,
	"demand_increment_percent" numeric(5, 2) DEFAULT '2.00',
	"cookie_return_surcharge_percent" numeric(5, 2) DEFAULT '0.00',
	"max_total_surcharge_percent" numeric(5, 2) DEFAULT '25.00',
	"updated_at" timestamp with time zone DEFAULT NOW(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "quick_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"customer_email" varchar(255),
	"location_lat" numeric(9, 6),
	"location_lng" numeric(9, 6),
	"location_address" text,
	"location_postcode" varchar(10),
	"location_method" text,
	"location_link_token" varchar(64),
	"location_link_expiry" timestamp with time zone,
	"location_link_used" boolean DEFAULT false,
	"service_type" text NOT NULL,
	"tyre_size" varchar(20),
	"tyre_count" integer DEFAULT 1,
	"distance_km" numeric(8, 2),
	"base_price" numeric(10, 2),
	"surcharge_percent" numeric(5, 2) DEFAULT '0.00',
	"total_price" numeric(10, 2),
	"price_breakdown" jsonb,
	"admin_adjustment_amount" numeric(10, 2) DEFAULT '0.00',
	"admin_adjustment_reason" text,
	"booking_id" uuid,
	"status" text DEFAULT 'pending_location' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "quick_bookings_location_link_token_unique" UNIQUE("location_link_token")
);
--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "distance_source" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "push_token" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "push_token_platform" text;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "app_version" text;--> statement-breakpoint
ALTER TABLE "driver_notifications" ADD CONSTRAINT "driver_notifications_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_config" ADD CONSTRAINT "pricing_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD CONSTRAINT "quick_bookings_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_bookings" ADD CONSTRAINT "quick_bookings_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;