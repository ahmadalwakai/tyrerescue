// components/admin/NotificationBell.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Text, Flex, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useNotificationContext } from './AdminNotificationProvider';
import { PushNotificationToggle } from './PushNotificationToggle';

const severityColor: Record<string, string> = {
  info: '#3B82F6',
  success: '#22C55E',
  warning: '#F97316',
  critical: '#EF4444',
};

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
  } = useNotificationContext();

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleNotificationClick = async (
    id: string,
    link?: string | null,
    isRead?: boolean
  ) => {
    if (!isRead) {
      await markAsRead([id]);
    }
    if (link) {
      setIsOpen(false);
      router.push(link);
    }
  };

  return (
    <Box position="relative" ref={panelRef}>
      {/* Bell Button */}
      <Box
        as="button"
        onClick={() => setIsOpen((prev) => !prev)}
        position="relative"
        p="2"
        borderRadius="md"
        color={c.muted}
        _hover={{ color: c.text, bg: c.card }}
        transition="all 0.2s"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
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
      </Box>

      {/* Dropdown Panel */}
      {isOpen && (
        <Box
          position="absolute"
          top="100%"
          right="0"
          mt="2"
          w={{ base: 'calc(100vw - 32px)', md: '380px' }}
          maxH="480px"
          bg={c.surface}
          borderRadius="lg"
          boxShadow="0 8px 30px rgba(0,0,0,0.5)"
          border="1px solid"
          borderColor={c.border}
          zIndex="popover"
          overflowY="auto"
        >
          {/* Header */}
          <Flex
            align="center"
            justify="space-between"
            px="4"
            py="3"
            borderBottom="1px solid"
            borderColor={c.border}
          >
            <Text fontWeight="semibold" fontSize="sm" color={c.text}>
              Notifications
            </Text>
            {unreadCount > 0 && (
              <Box
                as="button"
                fontSize="xs"
                color={c.accent}
                fontWeight="medium"
                _hover={{ textDecoration: 'underline' }}
                onClick={() => markAllAsRead()}
              >
                Mark all as read
              </Box>
            )}
          </Flex>

          {/* List */}
          {isLoading && notifications.length === 0 ? (
            <Flex justify="center" py="8">
              <Spinner size="sm" color={c.accent} />
            </Flex>
          ) : notifications.length === 0 ? (
            <Box textAlign="center" py="8" px="4">
              <Text fontSize="sm" color={c.muted}>
                No notifications yet
              </Text>
            </Box>
          ) : (
            <>
              {notifications.map((n) => (
                <Box
                  key={n.id}
                  as="button"
                  display="block"
                  w="full"
                  textAlign="left"
                  px="4"
                  py="3"
                  borderBottom="1px solid"
                  borderColor={c.border}
                  bg={n.isRead ? 'transparent' : 'rgba(249,115,22,0.06)'}
                  _hover={{ bg: c.card }}
                  transition="background 0.15s"
                  onClick={() =>
                    handleNotificationClick(n.id, n.link, n.isRead)
                  }
                >
                  <Flex align="start" gap="3">
                    <Box
                      mt="1.5"
                      w="2"
                      h="2"
                      borderRadius="full"
                      flexShrink={0}
                      bg={severityColor[n.severity] ?? c.muted}
                    />
                    <Box flex="1" minW="0">
                      <Text
                        fontSize="sm"
                        fontWeight={n.isRead ? 'normal' : 'semibold'}
                        color={c.text}
                        lineHeight="short"
                        truncate
                      >
                        {n.title}
                      </Text>
                      <Text
                        fontSize="xs"
                        color={c.muted}
                        mt="0.5"
                        lineClamp={2}
                      >
                        {n.body}
                      </Text>
                      <Text fontSize="xs" color={c.muted} mt="1" opacity={0.6}>
                        {formatTimeAgo(new Date(n.createdAt))}
                      </Text>
                    </Box>
                  </Flex>
                </Box>
              ))}

              {hasMore && (
                <Box textAlign="center" py="3">
                  <Box
                    as="button"
                    fontSize="xs"
                    color={c.accent}
                    fontWeight="medium"
                    _hover={{ textDecoration: 'underline' }}
                    onClick={() => loadMore()}
                  >
                    Load more
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Push Notification Toggle */}
          <PushNotificationToggle />
        </Box>
      )}
    </Box>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
