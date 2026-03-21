'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'motion/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface NotificationToastProps {
  visitor: {
    id: string;
    city: string | null;
    device: string | null;
    browser: string | null;
    path?: string;
  };
  onDismiss: () => void;
}

const MotionBox = motion.create(Box);

export function NotificationToast({ visitor, onDismiss }: NotificationToastProps) {
  return (
    <MotionBox
      initial={{ x: 340, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 340, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      bg={c.surface}
      border={`1px solid rgba(16,185,129,0.3)`}
      borderRadius="12px"
      p="12px 16px"
      mb={2}
      maxW="320px"
      boxShadow="0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(16,185,129,0.1)"
      cursor="pointer"
      onClick={onDismiss}
    >
      <Flex justify="space-between" align="center" mb="6px">
        <Text fontSize="11px" color="#10b981" fontWeight="700" letterSpacing="1px" fontFamily="monospace">
          NEW VISITOR
        </Text>
        <Text fontSize="10px" color={c.muted}>
          just now
        </Text>
      </Flex>
      <Text fontSize="12px" color={c.muted}>
        <Text as="span" color={c.text}>
          {visitor.city || 'Unknown'}
        </Text>{' '}
        · {visitor.device || 'Unknown'} · {visitor.browser || 'Unknown'}
      </Text>
    </MotionBox>
  );
}

export function NotificationStack({
  notifications,
  onDismiss,
}: {
  notifications: { id: string; city: string | null; device: string | null; browser: string | null }[];
  onDismiss: (id: string) => void;
}) {
  return (
    <Box position="fixed" top={4} right={4} zIndex={100}>
      <AnimatePresence>
        {notifications.map((n) => (
          <NotificationToast key={n.id} visitor={n} onDismiss={() => onDismiss(n.id)} />
        ))}
      </AnimatePresence>
    </Box>
  );
}
