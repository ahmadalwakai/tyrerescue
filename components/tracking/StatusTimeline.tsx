'use client';

import { Box, VStack, HStack, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  note: string | null;
}

interface StatusTimelineProps {
  history: StatusHistoryItem[];
  currentStatus: string;
}

// Define the expected order of statuses
const STATUS_ORDER = [
  'pending_payment',
  'confirmed',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
];

// Human-readable status labels
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_payment: 'Awaiting Payment',
  confirmed: 'Booking Confirmed',
  driver_assigned: 'Driver Assigned',
  en_route: 'Driver En Route',
  arrived: 'Driver Arrived',
  in_progress: 'Job In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function StatusTimeline({ history, currentStatus }: StatusTimelineProps) {
  // Create a map of status to timestamp for quick lookup
  const statusTimestamps = new Map<string, string>();
  for (const item of history) {
    if (!statusTimestamps.has(item.status)) {
      statusTimestamps.set(item.status, item.timestamp);
    }
  }

  // Determine which statuses to show
  // Show all completed statuses plus the current one
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const displayStatuses = currentIndex >= 0
    ? STATUS_ORDER.slice(0, currentIndex + 1)
    : history.map(h => h.status).filter((s, i, arr) => arr.indexOf(s) === i);

  // Handle cancelled/refunded specially
  if (currentStatus === 'cancelled' || currentStatus === 'refunded') {
    displayStatuses.push(currentStatus);
  }

  return (
    <VStack align="stretch" gap={0} role="list" aria-label="Booking status timeline">
      {displayStatuses.map((status, index) => {
        const timestamp = statusTimestamps.get(status);
        const isLast = index === displayStatuses.length - 1;
        const isCurrent = status === currentStatus;
        const isCancelled = status === 'cancelled' || status === 'refunded';

        return (
          <Box key={status} position="relative" role="listitem" style={anim.stagger('fadeUp', index, '0.4s', 0, 0.1)}>
            {/* Connector Line */}
            {!isLast && (
              <Box
                position="absolute"
                left="11px"
                top="24px"
                bottom="0"
                w="2px"
                bg={timestamp ? 'blue.500' : c.border}
              />
            )}

            <HStack gap={4} align="start" py={3}>
              {/* Status Dot */}
              <Box
                w="24px"
                h="24px"
                borderRadius="full"
                bg={
                  isCancelled
                    ? 'red.500'
                    : timestamp
                    ? 'blue.500'
                    : c.border
                }
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
                aria-hidden="true"
              >
                {timestamp && (
                  <Box
                    w="8px"
                    h="8px"
                    borderRadius="full"
                    bg={c.bg}
                  />
                )}
              </Box>

              {/* Status Content */}
              <Box flex="1">
                <Text
                  fontWeight={isCurrent ? '600' : '400'}
                  color={
                    isCancelled
                      ? 'red.400'
                      : timestamp
                      ? c.text
                      : c.muted
                  }
                >
                  {isCancelled ? '✗ ' : timestamp ? '✓ ' : ''}{STATUS_LABELS[status] || status}
                </Text>
                {timestamp && (
                  <Text fontSize="sm" color={c.muted}>
                    {formatTimestamp(timestamp)}
                  </Text>
                )}
              </Box>
            </HStack>
          </Box>
        );
      })}
    </VStack>
  );
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) {
    return `Today at ${time}`;
  }

  const dateStr = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });

  return `${dateStr} at ${time}`;
}
