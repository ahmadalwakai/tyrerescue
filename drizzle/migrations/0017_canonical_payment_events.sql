CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"booking_ref" varchar(20),
	"event_type" text NOT NULL,
	"payment_method" text,
	"paid_via" text,
	"link_status" text,
	"amount_pence" integer,
	"currency" text DEFAULT 'gbp',
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_checkout_url" text,
	"source" text NOT NULL,
	"status" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payment_events_booking_id_idx" ON "payment_events" ("booking_id");
--> statement-breakpoint
CREATE INDEX "payment_events_event_type_idx" ON "payment_events" ("event_type");
--> statement-breakpoint
CREATE INDEX "payment_events_stripe_session_id_idx" ON "payment_events" ("stripe_session_id");
--> statement-breakpoint
CREATE INDEX "payment_events_stripe_payment_intent_id_idx" ON "payment_events" ("stripe_payment_intent_id");
--> statement-breakpoint
CREATE INDEX "payment_events_created_at_idx" ON "payment_events" ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_unique_stripe_event_id_idx" ON "payment_events" ((metadata->>'stripeEventId')) WHERE metadata ? 'stripeEventId';
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_unique_pi_event_idx" ON "payment_events" ("event_type", "stripe_payment_intent_id") WHERE "stripe_payment_intent_id" IS NOT NULL AND "event_type" IN ('payment_succeeded', 'payment_failed', 'deposit_succeeded');
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_unique_session_event_idx" ON "payment_events" ("event_type", "stripe_session_id") WHERE "stripe_session_id" IS NOT NULL AND "event_type" IN ('link_created', 'link_sent', 'link_opened', 'link_expired');
--> statement-breakpoint

INSERT INTO "payment_events" (
	"booking_id",
	"booking_ref",
	"event_type",
	"payment_method",
	"paid_via",
	"link_status",
	"amount_pence",
	"currency",
	"stripe_session_id",
	"stripe_payment_intent_id",
	"stripe_checkout_url",
	"source",
	"status",
	"metadata",
	"occurred_at"
)
SELECT
	p."booking_id",
	b."ref_number",
	CASE
		WHEN b."payment_type" = 'deposit'
			OR b."stripe_deposit_pi_id" = p."stripe_pi_id"
			OR (
				b."deposit_amount_pence" IS NOT NULL
				AND ROUND((p."amount"::numeric * 100))::integer <= b."deposit_amount_pence" + 1
			)
		THEN 'deposit_succeeded'
		ELSE 'payment_succeeded'
	END,
	CASE
		WHEN b."payment_type" = 'deposit'
			OR b."stripe_deposit_pi_id" = p."stripe_pi_id"
			OR (
				b."deposit_amount_pence" IS NOT NULL
				AND ROUND((p."amount"::numeric * 100))::integer <= b."deposit_amount_pence" + 1
			)
		THEN 'deposit_link'
		ELSE 'card_link'
	END,
	'payment_link',
	'paid',
	ROUND((p."amount"::numeric * 100))::integer,
	LOWER(COALESCE(p."currency", 'gbp')),
	CASE
		WHEN p."stripe_pi_id" LIKE 'cs_%' THEN p."stripe_pi_id"
		ELSE p."stripe_payload"->>'sessionId'
	END,
	CASE
		WHEN p."stripe_pi_id" LIKE 'pi_%' THEN p."stripe_pi_id"
		ELSE NULL
	END,
	p."stripe_payload"->>'checkoutUrl',
	'system',
	'succeeded',
	jsonb_build_object('backfill', true, 'legacyPaymentId', p."id"::text, 'legacyPaymentStatus', p."status"),
	COALESCE(p."updated_at", p."created_at", NOW())
FROM "payments" p
LEFT JOIN "bookings" b ON b."id" = p."booking_id"
WHERE p."status" IN ('succeeded', 'paid')
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."metadata"->>'legacyPaymentId' = p."id"::text
	);
--> statement-breakpoint

INSERT INTO "payment_events" (
	"booking_id",
	"booking_ref",
	"event_type",
	"payment_method",
	"paid_via",
	"link_status",
	"amount_pence",
	"currency",
	"stripe_session_id",
	"stripe_payment_intent_id",
	"stripe_checkout_url",
	"source",
	"status",
	"metadata",
	"occurred_at"
)
SELECT
	p."booking_id",
	b."ref_number",
	'payment_failed',
	CASE WHEN b."payment_type" = 'deposit' THEN 'deposit_link' ELSE 'card_link' END,
	NULL,
	'failed',
	ROUND((p."amount"::numeric * 100))::integer,
	LOWER(COALESCE(p."currency", 'gbp')),
	CASE
		WHEN p."stripe_pi_id" LIKE 'cs_%' THEN p."stripe_pi_id"
		ELSE p."stripe_payload"->>'sessionId'
	END,
	CASE
		WHEN p."stripe_pi_id" LIKE 'pi_%' THEN p."stripe_pi_id"
		ELSE NULL
	END,
	p."stripe_payload"->>'checkoutUrl',
	'system',
	'failed',
	jsonb_build_object('backfill', true, 'legacyPaymentId', p."id"::text, 'legacyPaymentStatus', p."status"),
	COALESCE(p."updated_at", p."created_at", NOW())
FROM "payments" p
LEFT JOIN "bookings" b ON b."id" = p."booking_id"
WHERE p."status" = 'failed'
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."metadata"->>'legacyPaymentId' = p."id"::text
	);
--> statement-breakpoint

INSERT INTO "payment_events" (
	"booking_id",
	"booking_ref",
	"event_type",
	"payment_method",
	"paid_via",
	"link_status",
	"amount_pence",
	"currency",
	"stripe_session_id",
	"stripe_payment_intent_id",
	"stripe_checkout_url",
	"source",
	"status",
	"metadata",
	"occurred_at"
)
SELECT
	p."booking_id",
	b."ref_number",
	'link_sent',
	CASE WHEN b."payment_type" = 'deposit' THEN 'deposit_link' ELSE 'card_link' END,
	NULL,
	'sent',
	ROUND((p."amount"::numeric * 100))::integer,
	LOWER(COALESCE(p."currency", 'gbp')),
	COALESCE(p."stripe_payload"->>'sessionId', CASE WHEN p."stripe_pi_id" LIKE 'cs_%' THEN p."stripe_pi_id" ELSE NULL END),
	CASE WHEN p."stripe_pi_id" LIKE 'pi_%' THEN p."stripe_pi_id" ELSE NULL END,
	p."stripe_payload"->>'checkoutUrl',
	'system',
	'pending',
	jsonb_build_object('backfill', true, 'legacyPaymentId', p."id"::text, 'legacyPaymentStatus', p."status"),
	COALESCE(p."created_at", NOW())
FROM "payments" p
LEFT JOIN "bookings" b ON b."id" = p."booking_id"
WHERE p."status" = 'pending'
	AND p."stripe_payload" ? 'checkoutUrl'
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."metadata"->>'legacyPaymentId' = p."id"::text
			AND pe."event_type" = 'link_sent'
	);
--> statement-breakpoint

INSERT INTO "payment_events" (
	"booking_id",
	"booking_ref",
	"event_type",
	"payment_method",
	"paid_via",
	"link_status",
	"amount_pence",
	"currency",
	"source",
	"status",
	"metadata",
	"occurred_at"
)
SELECT
	b."id",
	b."ref_number",
	'cash_confirmed',
	'cash',
	'cash',
	'paid',
	ROUND((b."total_amount"::numeric * 100))::integer,
	'gbp',
	'quick_book',
	'succeeded',
	jsonb_build_object('backfill', true, 'reason', 'quick_book_cash_status_history'),
	COALESCE(MAX(h."created_at"), b."updated_at", b."created_at", NOW())
FROM "bookings" b
INNER JOIN "booking_status_history" h ON h."booking_id" = b."id"
WHERE b."payment_type" = 'cash'
	AND b."status" IN ('paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed')
	AND (
		h."note" ILIKE '%cash payment collected%'
		OR h."note" ILIKE '%cash payment%'
	)
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."booking_id" = b."id"
			AND pe."event_type" = 'cash_confirmed'
	)
GROUP BY b."id", b."ref_number", b."total_amount", b."updated_at", b."created_at";
--> statement-breakpoint

INSERT INTO "payment_events" (
	"booking_id",
	"booking_ref",
	"event_type",
	"payment_method",
	"paid_via",
	"link_status",
	"amount_pence",
	"currency",
	"source",
	"status",
	"metadata",
	"occurred_at"
)
SELECT
	b."id",
	b."ref_number",
	'payment_needs_checking',
	CASE
		WHEN b."payment_type" = 'cash' THEN 'cash'
		WHEN b."payment_type" = 'deposit' THEN 'deposit_link'
		WHEN b."payment_type" IN ('full', 'stripe') OR b."stripe_pi_id" IS NOT NULL THEN 'card_link'
		ELSE 'unknown'
	END,
	NULL,
	'unknown',
	ROUND((b."total_amount"::numeric * 100))::integer,
	'gbp',
	'system',
	'needs_checking',
	jsonb_build_object('backfill', true, 'reason', 'booking_lifecycle_without_payment_evidence', 'bookingStatus', b."status"),
	COALESCE(b."updated_at", b."created_at", NOW())
FROM "bookings" b
WHERE b."status" IN ('paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed')
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."booking_id" = b."id"
			AND pe."event_type" IN ('payment_succeeded', 'deposit_succeeded', 'cash_confirmed', 'manual_paid')
	)
	AND NOT EXISTS (
		SELECT 1 FROM "payments" p
		WHERE p."booking_id" = b."id"
			AND p."status" IN ('succeeded', 'paid')
	)
	AND NOT EXISTS (
		SELECT 1 FROM "payment_events" pe
		WHERE pe."booking_id" = b."id"
			AND pe."event_type" = 'payment_needs_checking'
	);
