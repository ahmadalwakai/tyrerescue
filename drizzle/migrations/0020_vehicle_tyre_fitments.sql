CREATE TABLE "vehicle_tyre_fitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_number" varchar(16) NOT NULL,
	"vehicle_fingerprint" varchar(255) NOT NULL,
	"vehicle_fingerprint_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"make" varchar(100),
	"model" varchar(150),
	"year_of_manufacture" integer,
	"fuel_type" varchar(30),
	"colour" varchar(60),
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" varchar(80) DEFAULT 'assisted_chat_sidewall' NOT NULL,
	"status" varchar(30) DEFAULT 'confirmed' NOT NULL,
	"review_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "vehicle_tyre_fitments_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
ALTER TABLE "vehicle_tyre_fitments" ADD CONSTRAINT "vehicle_tyre_fitments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "vehicle_tyre_fitments_fingerprint_idx" ON "vehicle_tyre_fitments" USING btree ("vehicle_fingerprint");
--> statement-breakpoint
CREATE INDEX "vehicle_tyre_fitments_status_idx" ON "vehicle_tyre_fitments" USING btree ("status");
