CREATE SEQUENCE "admin_quote_ref_seq" START WITH 1000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;--> statement-breakpoint
CREATE TABLE "admin_quote_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_ref" varchar(20) DEFAULT ('TRQ-' || nextval('admin_quote_ref_seq'::regclass)) NOT NULL,
	"customer_name" varchar(255),
	"customer_phone" varchar(30),
	"address" text,
	"postcode" varchar(20),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"tyre_size" varchar(20),
	"quantity" integer DEFAULT 1 NOT NULL,
	"locking_wheel_nut_status" text,
	"locking_wheel_nut_charge_pence" integer DEFAULT 0,
	"price_amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'GBP' NOT NULL,
	"quote_status" text DEFAULT 'DRAFT' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"quick_booking_id" uuid,
	"created_by_admin_id" uuid,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "admin_quote_drafts_quote_ref_unique" UNIQUE("quote_ref")
);
--> statement-breakpoint
ALTER TABLE "admin_quote_drafts" ADD CONSTRAINT "admin_quote_drafts_quick_booking_id_quick_bookings_id_fk" FOREIGN KEY ("quick_booking_id") REFERENCES "public"."quick_bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_quote_drafts" ADD CONSTRAINT "admin_quote_drafts_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_quote_drafts_customer_phone_idx" ON "admin_quote_drafts" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "admin_quote_drafts_quote_status_idx" ON "admin_quote_drafts" USING btree ("quote_status");--> statement-breakpoint
CREATE INDEX "admin_quote_drafts_created_at_idx" ON "admin_quote_drafts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_quote_drafts_expires_at_idx" ON "admin_quote_drafts" USING btree ("expires_at");