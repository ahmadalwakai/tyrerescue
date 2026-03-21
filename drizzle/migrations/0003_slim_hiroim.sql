CREATE TYPE "public"."notification_severity" AS ENUM('info', 'success', 'warning', 'critical');--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"link" text,
	"metadata" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(500) NOT NULL,
	"title" varchar(500),
	"meta_description" varchar(1000),
	"h1" varchar(500),
	"h1_count" integer DEFAULT 0,
	"h2_count" integer DEFAULT 0,
	"img_without_alt" integer DEFAULT 0,
	"word_count" integer DEFAULT 0,
	"has_canonical" boolean DEFAULT false,
	"has_open_graph" boolean DEFAULT false,
	"has_twitter_card" boolean DEFAULT false,
	"has_json_ld" boolean DEFAULT false,
	"status_code" integer,
	"load_time_ms" integer,
	"issues" jsonb,
	"last_crawled" timestamp with time zone DEFAULT NOW(),
	CONSTRAINT "page_analysis_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"performance_score" integer,
	"accessibility_score" integer,
	"best_practices_score" integer,
	"seo_score" integer,
	"lcp" real,
	"fid" real,
	"cls" real,
	"fcp" real,
	"ttfb" real,
	"total_visitors" integer DEFAULT 0,
	"organic_visitors" integer DEFAULT 0,
	"direct_visitors" integer DEFAULT 0,
	"social_visitors" integer DEFAULT 0,
	"bounce_rate" real,
	"avg_session_duration" real,
	"created_at" timestamp with time zone DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE "site_visitors" ADD COLUMN "search_keyword" varchar(500);--> statement-breakpoint
ALTER TABLE "site_visitors" ADD COLUMN "search_engine" varchar(50);--> statement-breakpoint
ALTER TABLE "site_visitors" ADD COLUMN "exited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_visitors" ADD COLUMN "visit_count" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "site_visitors" ADD COLUMN "previous_visits" jsonb;