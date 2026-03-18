'use client';

import { Box } from '@chakra-ui/react';
import { ChatWidget } from '@/components/chat/ChatWidget';
import type { ChatChannel, ChatRole } from '@/lib/chat/types';

interface Props {
  bookingId: string;
  bookingRef: string;
  currentUserId: string;
  hasDriver: boolean;
}

export function CustomerChatSection({ bookingId, bookingRef, currentUserId, hasDriver }: Props) {
  return (
    <>
      <Box>
        <ChatWidget
          bookingId={bookingId}
          bookingRef={bookingRef}
          channel="customer_admin"
          currentUserId={currentUserId}
          currentUserRole="customer"
          defaultCollapsed
        />
      </Box>
      {hasDriver && (
        <Box>
          <ChatWidget
            bookingId={bookingId}
            bookingRef={bookingRef}
            channel="customer_driver"
            currentUserId={currentUserId}
            currentUserRole="customer"
            defaultCollapsed
          />
        </Box>
      )}
    </>
  );
}
