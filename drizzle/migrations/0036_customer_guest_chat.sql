ALTER TABLE "booking_messages" ALTER COLUMN "sender_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_messages_guest_sender_check') THEN
    ALTER TABLE "booking_messages" ADD CONSTRAINT "booking_messages_guest_sender_check"
      CHECK ("sender_id" IS NOT NULL OR "sender_role" = 'customer');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_chat_read_state" (
  "conversation_id" uuid PRIMARY KEY REFERENCES "booking_conversations"("id") ON DELETE CASCADE,
  "last_read_message_id" uuid REFERENCES "booking_messages"("id") ON DELETE SET NULL,
  "last_read_at" timestamp with time zone
);
