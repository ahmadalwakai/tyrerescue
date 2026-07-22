CREATE TABLE "virtual_landline_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) DEFAULT 'virtual_landline' NOT NULL,
	"source" varchar(30) DEFAULT 'csv' NOT NULL,
	"import_key" varchar(128) NOT NULL,
	"provider_call_id" varchar(255),
	"direction" text NOT NULL,
	"call_status" text DEFAULT 'unknown' NOT NULL,
	"caller_number_raw" varchar(80),
	"destination_number_raw" varchar(80),
	"caller_number_normalized" varchar(20),
	"destination_number_normalized" varchar(20),
	"customer_phone_normalized" varchar(20),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"recording_url" text,
	"source_file_name" varchar(255),
	"source_row_number" integer NOT NULL,
	"raw_row" jsonb NOT NULL,
	"matched_user_id" uuid,
	"linked_booking_id" uuid,
	"linked_quick_booking_id" uuid,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "virtual_landline_interactions_import_key_unique" UNIQUE("import_key")
);
--> statement-breakpoint
ALTER TABLE "virtual_landline_interactions" ADD CONSTRAINT "virtual_landline_interactions_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "virtual_landline_interactions" ADD CONSTRAINT "virtual_landline_interactions_linked_booking_id_bookings_id_fk" FOREIGN KEY ("linked_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "virtual_landline_interactions" ADD CONSTRAINT "virtual_landline_interactions_linked_quick_booking_id_quick_bookings_id_fk" FOREIGN KEY ("linked_quick_booking_id") REFERENCES "public"."quick_bookings"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "virtual_landline_interactions" ADD CONSTRAINT "virtual_landline_interactions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "virtual_landline_interactions" ADD CONSTRAINT "virtual_landline_interactions_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "virtual_landline_interactions_customer_phone_idx" ON "virtual_landline_interactions" USING btree ("customer_phone_normalized");
--> statement-breakpoint
CREATE INDEX "virtual_landline_interactions_started_at_idx" ON "virtual_landline_interactions" USING btree ("started_at");
--> statement-breakpoint
CREATE INDEX "virtual_landline_interactions_direction_idx" ON "virtual_landline_interactions" USING btree ("direction");
--> statement-breakpoint
CREATE INDEX "virtual_landline_interactions_reviewed_idx" ON "virtual_landline_interactions" USING btree ("reviewed");
--> statement-breakpoint
CREATE INDEX "virtual_landline_interactions_linked_booking_idx" ON "virtual_landline_interactions" USING btree ("linked_booking_id");
