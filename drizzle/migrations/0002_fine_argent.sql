CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"entity_ref" varchar(50),
	"content" text NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "homepage_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"src" text NOT NULL,
	"alt" text NOT NULL,
	"eyebrow" varchar(100) NOT NULL,
	"title" varchar(200) NOT NULL,
	"caption" text,
	"object_position" varchar(50) DEFAULT 'center center' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"animation_style" varchar(20) DEFAULT 'fadeZoom' NOT NULL,
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "site_visitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"ip_hash" varchar(64),
	"city" varchar(100),
	"country" varchar(50) DEFAULT 'UK',
	"device" varchar(20),
	"browser" varchar(50),
	"referrer" varchar(255),
	"age_group" varchar(10),
	"gender" varchar(20),
	"interests" jsonb,
	"consent_given" boolean DEFAULT false,
	"session_duration" integer DEFAULT 0,
	"is_online" boolean DEFAULT true,
	"last_heartbeat" timestamp with time zone DEFAULT NOW(),
	"created_at" timestamp with time zone DEFAULT NOW(),
	"updated_at" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "site_visitors_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"button_text" varchar(255) NOT NULL,
	"path" varchar(500),
	"timestamp" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "visitor_page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitor_id" uuid NOT NULL,
	"path" varchar(500) NOT NULL,
	"title" varchar(255),
	"timestamp" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_clicks" ADD CONSTRAINT "visitor_clicks_visitor_id_site_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."site_visitors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_page_views" ADD CONSTRAINT "visitor_page_views_visitor_id_site_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."site_visitors"("id") ON DELETE no action ON UPDATE no action;