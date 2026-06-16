CREATE TABLE "b2b_api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"company_name" varchar(255),
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(30),
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "b2b_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"key_prefix" varchar(30) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"allowed_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_stock_filters" jsonb,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "b2b_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "b2b_api_key_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" uuid,
	"client_id" uuid,
	"action" varchar(100) NOT NULL,
	"route" varchar(500),
	"ip_address" inet,
	"user_agent" text,
	"status_code" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "b2b_api_clients" ADD CONSTRAINT "b2b_api_clients_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b2b_api_keys" ADD CONSTRAINT "b2b_api_keys_client_id_b2b_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."b2b_api_clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b2b_api_key_audit_logs" ADD CONSTRAINT "b2b_api_key_audit_logs_api_key_id_b2b_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."b2b_api_keys"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b2b_api_key_audit_logs" ADD CONSTRAINT "b2b_api_key_audit_logs_client_id_b2b_api_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."b2b_api_clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "b2b_api_keys_key_prefix_idx" ON "b2b_api_keys" ("key_prefix");
--> statement-breakpoint
CREATE INDEX "b2b_api_keys_key_hash_idx" ON "b2b_api_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX "b2b_api_keys_client_id_idx" ON "b2b_api_keys" ("client_id");
--> statement-breakpoint
CREATE INDEX "b2b_api_keys_status_idx" ON "b2b_api_keys" ("status");
--> statement-breakpoint
CREATE INDEX "b2b_api_clients_status_idx" ON "b2b_api_clients" ("status");
--> statement-breakpoint
CREATE INDEX "b2b_audit_logs_api_key_id_idx" ON "b2b_api_key_audit_logs" ("api_key_id");
--> statement-breakpoint
CREATE INDEX "b2b_audit_logs_client_id_idx" ON "b2b_api_key_audit_logs" ("client_id");
--> statement-breakpoint
CREATE INDEX "b2b_audit_logs_created_at_idx" ON "b2b_api_key_audit_logs" ("created_at");
