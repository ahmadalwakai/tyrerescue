CREATE TABLE "customer_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"booking_id" uuid,
	"token" text NOT NULL,
	"platform" text DEFAULT 'ios' NOT NULL,
	"last_ref_number" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	CONSTRAINT "customer_push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "customer_push_tokens" ADD CONSTRAINT "customer_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_push_tokens" ADD CONSTRAINT "customer_push_tokens_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "customer_push_tokens_user_id_idx" ON "customer_push_tokens" ("user_id");
--> statement-breakpoint
CREATE INDEX "customer_push_tokens_booking_id_idx" ON "customer_push_tokens" ("booking_id");
--> statement-breakpoint
CREATE INDEX "customer_push_tokens_last_ref_idx" ON "customer_push_tokens" ("last_ref_number");
--> statement-breakpoint
CREATE INDEX "customer_push_tokens_active_idx" ON "customer_push_tokens" ("is_active");
