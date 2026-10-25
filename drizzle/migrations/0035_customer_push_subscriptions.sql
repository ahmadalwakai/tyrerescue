CREATE TABLE IF NOT EXISTS "customer_push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "push_token_id" uuid NOT NULL REFERENCES "customer_push_tokens"("id") ON DELETE CASCADE,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_push_subscriptions_device_booking_idx" ON "customer_push_subscriptions" ("push_token_id", "booking_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_push_subscriptions_booking_idx" ON "customer_push_subscriptions" ("booking_id");
--> statement-breakpoint
-- Legacy guest registrations used only a reference and email. Require each
-- device to register again with authenticated ownership or a signed capability.
UPDATE "customer_push_tokens" SET "is_active" = false, "user_id" = NULL, "booking_id" = NULL, "last_ref_number" = NULL, "updated_at" = now();
--> statement-breakpoint
ALTER TABLE "tracking_sessions" ADD COLUMN IF NOT EXISTS "share_version" integer DEFAULT 0 NOT NULL;
