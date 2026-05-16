CREATE TABLE "tracking_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_token" varchar(64) NOT NULL,
	"driver_token" varchar(64) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_latitude" numeric(9, 6),
	"last_longitude" numeric(9, 6),
	"last_accuracy" real,
	"last_heading" real,
	"last_speed" real,
	"last_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "tracking_sessions_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "tracking_sessions_customer_token_unique" UNIQUE("customer_token"),
	CONSTRAINT "tracking_sessions_driver_token_unique" UNIQUE("driver_token")
);
--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;