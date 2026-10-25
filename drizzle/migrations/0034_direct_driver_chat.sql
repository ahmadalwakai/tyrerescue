-- Add private staff-to-driver chats without creating or changing bookings.
ALTER TABLE booking_conversations ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE booking_conversations ADD COLUMN IF NOT EXISTS direct_driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_conversations_scope_check' AND conrelid = 'booking_conversations'::regclass) THEN
    ALTER TABLE booking_conversations ADD CONSTRAINT booking_conversations_scope_check CHECK (
      (booking_id IS NOT NULL AND direct_driver_id IS NULL)
      OR (booking_id IS NULL AND direct_driver_id IS NOT NULL AND channel = 'admin_driver')
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS booking_conversations_direct_driver_unique
  ON booking_conversations(direct_driver_id) WHERE direct_driver_id IS NOT NULL;
