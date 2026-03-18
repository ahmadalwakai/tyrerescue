CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" integer,
	"token_type" varchar(50),
	"scope" text,
	"id_token" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "admin_chat_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_ask_enabled" boolean DEFAULT true,
	"daily_ask_time" text,
	"last_asked_at" timestamp with time zone,
	"last_answered_at" timestamp with time zone,
	"voice_input_enabled" boolean DEFAULT false,
	"voice_output_enabled" boolean DEFAULT false,
	"auto_open_enabled" boolean DEFAULT true,
	"last_seen_alerts_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "admin_chat_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(20),
	"entity_type" varchar(50),
	"entity_id" uuid,
	"action" varchar(100),
	"before_json" jsonb,
	"after_json" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"time_start" time NOT NULL,
	"time_end" time NOT NULL,
	"max_bookings" integer DEFAULT 1,
	"booked_count" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "bank_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" varchar(100),
	"region" varchar(50) DEFAULT 'Scotland',
	CONSTRAINT "bank_holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "booking_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"locked" boolean DEFAULT false,
	"muted" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "booking_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"sender_role" text NOT NULL,
	"body" text,
	"message_type" text DEFAULT 'text' NOT NULL,
	"delivery_status" text DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "booking_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "booking_tyres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"tyre_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"service" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref_number" varchar(20) NOT NULL,
	"user_id" uuid,
	"driver_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"booking_type" text NOT NULL,
	"service_type" text NOT NULL,
	"address_line" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"distance_miles" numeric(5, 2),
	"quantity" integer DEFAULT 1 NOT NULL,
	"tyre_size_display" varchar(20),
	"vehicle_reg" varchar(10),
	"vehicle_make" varchar(100),
	"vehicle_model" varchar(100),
	"tyre_photo_url" text,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"scheduled_at" timestamp with time zone,
	"price_snapshot" jsonb NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"vat_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"stripe_pi_id" varchar(255),
	"quote_expires_at" timestamp with time zone,
	"locking_nut_status" text,
	"has_pre_order_items" boolean DEFAULT false,
	"fulfillment_option" text,
	"notes" text,
	"assigned_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"en_route_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"in_progress_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"acceptance_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "bookings_ref_number_unique" UNIQUE("ref_number")
);
--> statement-breakpoint
CREATE TABLE "call_me_back" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"message" text NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"ai_priority" text,
	"ai_category" text,
	"ai_suggested_response" text,
	"requires_immediate_call" boolean DEFAULT false,
	"ai_sentiment" text,
	"replied_at" timestamp with time zone,
	"replied_by" uuid,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "cookie_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"label" varchar(200),
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "cookie_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "driver_location_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid,
	"booking_id" uuid,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"is_online" boolean DEFAULT false,
	"current_lat" numeric(9, 6),
	"current_lng" numeric(9, 6),
	"location_at" timestamp with time zone,
	"status" text DEFAULT 'offline',
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"display_order" integer,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tyre_id" uuid,
	"booking_id" uuid,
	"movement_type" text,
	"quantity_delta" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tyre_id" uuid,
	"booking_id" uuid,
	"quantity" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"url" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"file_name" varchar(255),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_read_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_message_id" uuid,
	"unread_count" integer DEFAULT 0,
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"booking_id" uuid,
	"type" varchar(50) NOT NULL,
	"channel" text DEFAULT 'email',
	"status" text DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"stripe_pi_id" varchar(255) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'gbp',
	"status" text NOT NULL,
	"stripe_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "payments_stripe_pi_id_unique" UNIQUE("stripe_pi_id")
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"label" varchar(200),
	"type" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "pricing_rules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"address_line" text NOT NULL,
	"booking_type" text NOT NULL,
	"service_type" text NOT NULL,
	"tyre_selections" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"distance_miles" numeric(5, 2) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"booking_id" uuid,
	"stripe_refund_id" varchar(255),
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100),
	"center_lat" numeric(9, 6),
	"center_lng" numeric(9, 6),
	"radius_miles" numeric(5, 2),
	"priority" integer DEFAULT 0,
	"active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "surge_pricing_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"groq_input" jsonb,
	"groq_output" jsonb,
	"multiplier_used" numeric(4, 3),
	"applied" boolean,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_name" varchar(255) NOT NULL,
	"rating" integer,
	"content" text NOT NULL,
	"job_type" varchar(100),
	"approved" boolean DEFAULT false,
	"featured" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "tyre_catalogue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" varchar(100) NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"width" integer NOT NULL,
	"aspect" integer NOT NULL,
	"rim" integer NOT NULL,
	"size_display" varchar(20) NOT NULL,
	"season" text DEFAULT 'allseason' NOT NULL,
	"speed_rating" varchar(5),
	"load_index" integer,
	"wet_grip" varchar(2),
	"fuel_efficiency" varchar(2),
	"noise_db" integer,
	"run_flat" boolean DEFAULT false,
	"tier" text DEFAULT 'mid' NOT NULL,
	"suggested_price_new" numeric(10, 2),
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "tyre_catalogue_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tyre_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalogue_id" uuid,
	"brand" varchar(100) NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"width" integer NOT NULL,
	"aspect" integer NOT NULL,
	"rim" integer NOT NULL,
	"size_display" varchar(20) NOT NULL,
	"season" text NOT NULL,
	"speed_rating" varchar(5),
	"load_index" integer,
	"wet_grip" varchar(2),
	"fuel_efficiency" varchar(2),
	"noise_db" integer,
	"run_flat" boolean DEFAULT false,
	"price_new" numeric(10, 2),
	"stock_new" integer DEFAULT 0,
	"stock_ordered" integer DEFAULT 0,
	"is_local_stock" boolean DEFAULT true,
	"available_new" boolean DEFAULT true,
	"featured" boolean DEFAULT false,
	"images" text[],
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "tyre_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"role" text DEFAULT 'customer' NOT NULL,
	"email_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_chat_settings" ADD CONSTRAINT "admin_chat_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_conversations" ADD CONSTRAINT "booking_conversations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_conversation_id_booking_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."booking_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_tyres" ADD CONSTRAINT "booking_tyres_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_tyres" ADD CONSTRAINT "booking_tyres_tyre_id_tyre_products_id_fk" FOREIGN KEY ("tyre_id") REFERENCES "public"."tyre_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_me_back" ADD CONSTRAINT "call_me_back_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_booking_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."booking_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cookie_settings" ADD CONSTRAINT "cookie_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_history" ADD CONSTRAINT "driver_location_history_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_location_history" ADD CONSTRAINT "driver_location_history_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tyre_id_tyre_products_id_fk" FOREIGN KEY ("tyre_id") REFERENCES "public"."tyre_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_tyre_id_tyre_products_id_fk" FOREIGN KEY ("tyre_id") REFERENCES "public"."tyre_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_booking_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."booking_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_state" ADD CONSTRAINT "message_read_state_conversation_id_booking_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."booking_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_state" ADD CONSTRAINT "message_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_state" ADD CONSTRAINT "message_read_state_last_read_message_id_booking_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."booking_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surge_pricing_log" ADD CONSTRAINT "surge_pricing_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tyre_products" ADD CONSTRAINT "tyre_products_catalogue_id_tyre_catalogue_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."tyre_catalogue"("id") ON DELETE cascade ON UPDATE no action;