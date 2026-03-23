// components/admin/NotificationBell.tsx
'use client';

import NextLink from 'next/link';
import { Box, Flex, Link as ChakraLink } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useNotificationContext } from './AdminNotificationProvider';

export function NotificationBell() {
  const { unreadCount } = useNotificationContext();

  return (
    <ChakraLink
      asChild
      position="relative"
      p="2"
      borderRadius="md"
      color={c.muted}
      _hover={{ color: c.text, bg: c.card, textDecoration: 'none' }}
      transition="all 0.2s"
      aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
    >
      <NextLink href="/admin/notifications">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <Flex
            position="absolute"
            top="0"
            right="0"
            bg="red.500"
            color="white"
            borderRadius="full"
            minW="4"
            h="4"
            align="center"
            justify="center"
            fontSize="10px"
            fontWeight="bold"
            lineHeight="1"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Flex>
        )}
      </NextLink>
    </ChakraLink>
  );
}
