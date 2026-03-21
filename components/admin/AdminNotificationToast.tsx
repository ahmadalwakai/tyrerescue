// components/admin/AdminNotificationToast.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Text, Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type { AdminNotificationEvent } from '@/lib/notifications/types';

const severityAccent: Record<string, string> = {
  info: '#3B82F6',
  success: '#22C55E',
  warning: '#F97316',
  critical: '#EF4444',
};

const TOAST_DURATION = 5000;

interface AdminNotificationToastProps {
  event: AdminNotificationEvent | null;
  onDismiss: () => void;
}

export function AdminNotificationToast({
  event,
  onDismiss,
}: AdminNotificationToastProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [currentEvent, setCurrentEvent] =
    useState<AdminNotificationEvent | null>(null);

  useEffect(() => {
    if (!event) return;

    setCurrentEvent(event);
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        onDismiss();
        setCurrentEvent(null);
      }, 300);
    }, TOAST_DURATION);

    return () => clearTimeout(timer);
  }, [event, onDismiss]);

  if (!currentEvent) return null;

  const accentColor = severityAccent[currentEvent.severity] ?? c.muted;

  const handleClick = () => {
    setVisible(false);
    onDismiss();
    if (currentEvent.link) {
      router.push(currentEvent.link);
    }
  };

  return (
    <Box
      position="fixed"
      top="4"
      right="4"
      zIndex="toast"
      maxW="sm"
      w="full"
      transform={visible ? 'translateX(0)' : 'translateX(120%)'}
      opacity={visible ? 1 : 0}
      transition="all 0.3s ease-in-out"
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Box
        as="button"
        display="block"
        w="full"
        textAlign="left"
        bg={c.surface}
        borderRadius="lg"
        boxShadow="0 8px 32px rgba(0,0,0,0.5)"
        border="1px solid"
        borderColor={c.border}
        overflow="hidden"
        _hover={{ bg: c.card }}
        onClick={handleClick}
      >
        {/* Severity accent bar */}
        <Box h="2px" bg={accentColor} />

        <Box px="4" py="3">
          <Flex align="center" gap="2" mb="1">
            <Box
              w="2"
              h="2"
              borderRadius="full"
              bg={accentColor}
              flexShrink={0}
            />
            <Text fontSize="sm" fontWeight="semibold" color={c.text} truncate>
              {currentEvent.title}
            </Text>
          </Flex>
          <Text fontSize="xs" color={c.muted} lineClamp={2}>
            {currentEvent.body}
          </Text>
          <Text fontSize="xs" color={c.muted} mt="1" opacity={0.5}>
            just now
          </Text>
        </Box>

        {/* Dismiss X */}
        <Box
          position="absolute"
          top="2"
          right="3"
          as="span"
          fontSize="xs"
          color={c.muted}
          _hover={{ color: c.text }}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setVisible(false);
            setTimeout(() => {
              onDismiss();
              setCurrentEvent(null);
            }, 300);
          }}
        >
          ✕
        </Box>
      </Box>
    </Box>
  );
}
