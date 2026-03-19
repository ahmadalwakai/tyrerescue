-- Add context & summary columns to chat_sessions
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "context" jsonb;
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "summary" text;

-- Agent long-term memory
CREATE TABLE IF NOT EXISTS "agent_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS "idx_agent_memory_user_id" ON "agent_memory" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_agent_memory_kind" ON "agent_memory" ("kind");
CREATE INDEX IF NOT EXISTS "idx_agent_memory_entity" ON "agent_memory" ("entity_type", "entity_id");
