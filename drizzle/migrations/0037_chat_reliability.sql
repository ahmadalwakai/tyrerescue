-- Chat reliability: indexes for inbox/unread queries and uniqueness for rows
-- that the application treats as one-per-key. Additive and re-runnable; the
-- application works before and after it is applied.

-- One read marker per conversation and user (keep the most recently updated).
DELETE FROM message_read_state r
USING message_read_state newer
WHERE r.conversation_id = newer.conversation_id AND r.user_id = newer.user_id
  AND (newer.updated_at, newer.id) > (r.updated_at, r.id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS message_read_state_conversation_user_key
  ON message_read_state (conversation_id, user_id);
--> statement-breakpoint

-- One participant row per conversation and user (keep the earliest join).
DELETE FROM conversation_participants p
USING conversation_participants earlier
WHERE p.conversation_id = earlier.conversation_id AND p.user_id = earlier.user_id
  AND (earlier.joined_at, earlier.id) < (p.joined_at, p.id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS conversation_participants_conversation_user_key
  ON conversation_participants (conversation_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON conversation_participants (user_id);
--> statement-breakpoint

-- Message pages, last message, read anchors and unread counts all scan one
-- conversation newest-first.
CREATE INDEX IF NOT EXISTS booking_messages_conversation_created_idx
  ON booking_messages (conversation_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_attachments_message_idx
  ON message_attachments (message_id);
--> statement-breakpoint

-- openBookingConversation already serialises creation per booking and channel;
-- this makes the invariant explicit. Fails loudly instead of deleting if
-- duplicates exist, because merging threads needs a human decision.
CREATE UNIQUE INDEX IF NOT EXISTS booking_conversations_booking_channel_key
  ON booking_conversations (booking_id, channel) WHERE booking_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_conversations_booking_idx
  ON booking_conversations (booking_id);
