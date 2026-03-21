'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'motion/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface NotificationVisitor {
  id: string;
  city: string | null;
  device: string | null;
  browser: string | null;
  searchKeyword?: string | null;
  searchEngine?: string | null;
  visitCount?: number | null;
  createdAt?: string | null;
}

interface NotificationToastProps {
  visitor: NotificationVisitor;
  onDismiss: () => void;
}

const MotionBox = motion.create(Box);

function formatTime(iso: string | null | undefined) {
  if (!iso) return 'just now';
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return 'just now'; }
}

export function NotificationToast({ visitor, onDismiss }: NotificationToastProps) {
  const isReturning = (visitor.visitCount || 1) > 1;

  return (
    <MotionBox
      initial={{ x: -340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -340, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      bg={c.surface}
      borderTop="1px solid rgba(16,185,129,0.3)"
      borderRight="1px solid rgba(16,185,129,0.3)"
      borderBottom="1px solid rgba(16,185,129,0.3)"
      borderLeft="3px solid #10b981"
      borderRadius="10px"
      p="10px 14px"
      mb={2}
      w="280px"
      boxShadow="0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(16,185,129,0.1)"
      cursor="pointer"
      onClick={onDismiss}
      pointerEvents="auto"
    >
      <Flex justify="space-between" align="center" mb="4px">
        <Flex align="center" gap="6px">
          <Text fontSize="10px" color="#10b981" fontWeight="700" letterSpacing="1px" fontFamily="monospace">
            NEW VISITOR
          </Text>
          {isReturning && (
            <Text fontSize="9px" p="1px 5px" bg="rgba(249,115,22,0.15)" color={c.accent} borderRadius="3px" fontWeight="600">
              ×{visitor.visitCount}
            </Text>
          )}
        </Flex>
        <Text fontSize="9px" color={c.muted} fontFamily="monospace">
          {formatTime(visitor.createdAt)}
        </Text>
      </Flex>
      <Text fontSize="11px" color={c.muted}>
        <Text as="span" color={c.text} fontWeight="500">
          {visitor.city || 'Unknown'}
        </Text>{' '}
        · {visitor.device || '?'} · {visitor.browser || '?'}
      </Text>
      {visitor.searchKeyword && (
        <Text fontSize="10px" color={c.muted} mt="3px" truncate>
          🔍 <Text as="span" color="#818cf8">{visitor.searchKeyword}</Text>
        </Text>
      )}
    </MotionBox>
  );
}

export function NotificationStack({
  notifications,
  onDismiss,
}: {
  notifications: NotificationVisitor[];
  onDismiss: (id: string) => void;
}) {
  return (
    <Box position="fixed" bottom={14} left={4} zIndex={100} pointerEvents="none" display="flex" flexDirection="column-reverse">
      <AnimatePresence>
        {notifications.map((n) => (
          <NotificationToast key={n.id} visitor={n} onDismiss={() => onDismiss(n.id)} />
        ))}
      </AnimatePresence>
    </Box>
  );
}
