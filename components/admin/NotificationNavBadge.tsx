'use client';

import { Flex } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useNotificationContext } from './AdminNotificationProvider';

export function NotificationNavBadge() {
  const { unreadCount } = useNotificationContext();

  if (unreadCount <= 0) return null;

  return (
    <Flex
      align="center"
      justify="center"
      bg="red.500"
      color="white"
      fontSize="10px"
      fontWeight="700"
      minW="18px"
      h="18px"
      borderRadius="full"
      ml="auto"
      px="4px"
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </Flex>
  );
}
