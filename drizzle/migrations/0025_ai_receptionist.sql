CREATE TABLE IF NOT EXISTS "ai_call_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "call_sid" varchar(64) UNIQUE NOT NULL,
  "caller_number" varchar(20) NOT NULL,
  "step" integer DEFAULT 0 NOT NULL,
  "collected_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "call_me_back_id" uuid,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT NOW(),
  "updated_at" timestamptz DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ai_call_sessions_call_sid_idx" ON "ai_call_sessions" ("call_sid");
CREATE INDEX IF NOT EXISTS "ai_call_sessions_status_idx" ON "ai_call_sessions" ("status");
CREATE INDEX IF NOT EXISTS "ai_call_sessions_created_at_idx" ON "ai_call_sessions" ("created_at");
