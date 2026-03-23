'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Flex, Text, Heading, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { useNotificationContext } from '@/components/admin/AdminNotificationProvider';
import { PushNotificationToggle } from '@/components/admin/PushNotificationToggle';
import { SoundToggle } from '@/components/admin/SoundToggle';

type FilterTab = 'all' | 'unread' | 'read';

const severityColor: Record<string, string> = {
  info: '#3B82F6',
  success: '#22C55E',
  warning: '#F97316',
  critical: '#EF4444',
};

const severityLabel: Record<string, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  critical: 'Critical',
};

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
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationsClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    hasMore,
    loadMore,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotificationContext();

  const filtered = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.isRead;
    if (activeTab === 'read') return n.isRead;
    return true;
  });

  const handleNotificationClick = async (
    id: string,
    link?: string | null,
    isRead?: boolean
  ) => {
    if (!isRead) {
      await markAsRead([id]);
    }
    if (link) {
      router.push(link);
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'read', label: 'Read' },
  ];

  return (
    <Box>
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        mb={6}
        flexWrap="wrap"
        gap={3}
      >
        <Box>
          <Heading
            as="h1"
            fontSize={{ base: '20px', md: '24px' }}
            fontWeight="600"
            color={c.text}
            letterSpacing="-0.01em"
          >
            Notifications
          </Heading>
          <Text fontSize="sm" color={c.muted} mt={1}>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up'}
          </Text>
        </Box>

        <Flex align="center" gap={2}>
          <SoundToggle />
          {unreadCount > 0 && (
            <Box
              as="button"
              px={3}
              py={1.5}
              fontSize="13px"
              fontWeight="500"
              color={c.accent}
              border={`1px solid ${c.border}`}
              borderRadius="md"
              bg="transparent"
              cursor="pointer"
              _hover={{ bg: c.card }}
              transition="all 0.2s"
              onClick={() => markAllAsRead()}
            >
              Mark all as read
            </Box>
          )}
        </Flex>
      </Flex>

      {/* Filter tabs */}
      <Flex
        gap={0}
        mb={6}
        borderBottom="1px solid"
        borderColor={c.border}
      >
        {tabs.map((tab) => (
          <Box
            key={tab.key}
            as="button"
            px={4}
            py={2.5}
            fontSize="13px"
            fontWeight={activeTab === tab.key ? '600' : '400'}
            color={activeTab === tab.key ? c.text : c.muted}
            borderBottom="2px solid"
            borderColor={activeTab === tab.key ? c.accent : 'transparent'}
            bg="transparent"
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ color: c.text }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Box>
        ))}
      </Flex>

      {/* Error state */}
      {error && (
        <Box
          bg="rgba(239,68,68,0.08)"
          border="1px solid rgba(239,68,68,0.2)"
          borderRadius="md"
          px={4}
          py={3}
          mb={4}
        >
          <Text fontSize="sm" color="#EF4444" mb={2}>
            Failed to load notifications: {error}
          </Text>
          <Box
            as="button"
            fontSize="xs"
            fontWeight="500"
            color={c.accent}
            bg="transparent"
            border="none"
            cursor="pointer"
            _hover={{ textDecoration: 'underline' }}
            onClick={() => refresh()}
          >
            Retry
          </Box>
        </Box>
      )}

      {/* Loading state */}
      {isLoading && notifications.length === 0 ? (
        <Flex justify="center" py={12}>
          <Spinner size="sm" color={c.accent} />
        </Flex>
      ) : filtered.length === 0 ? (
        /* Empty state */
        <Box
          textAlign="center"
          py={16}
          px={4}
          border="1px solid"
          borderColor={c.border}
          borderRadius="lg"
          bg={c.surface}
        >
          <Text fontSize="sm" color={c.muted}>
            {activeTab === 'unread'
              ? 'No unread notifications'
              : activeTab === 'read'
                ? 'No read notifications'
                : 'No notifications yet'}
          </Text>
        </Box>
      ) : (
        /* Notification list */
        <Box
          border="1px solid"
          borderColor={c.border}
          borderRadius="lg"
          overflow="hidden"
          bg={c.surface}
        >
          {filtered.map((n, i) => (
            <Box
              key={n.id}
              as="button"
              display="block"
              w="full"
              textAlign="left"
              px={{ base: 4, md: 5 }}
              py={{ base: 3, md: 4 }}
              borderBottom={i < filtered.length - 1 ? '1px solid' : 'none'}
              borderColor={c.border}
              bg={n.isRead ? 'transparent' : 'rgba(249,115,22,0.04)'}
              _hover={{ bg: c.card }}
              transition="background 0.15s"
              cursor="pointer"
              onClick={() => handleNotificationClick(n.id, n.link, n.isRead)}
            >
              <Flex align="start" gap={3}>
                {/* Severity indicator */}
                <Box
                  mt="2px"
                  w="8px"
                  h="8px"
                  borderRadius="full"
                  flexShrink={0}
                  bg={severityColor[n.severity] ?? c.muted}
                />

                <Box flex="1" minW="0">
                  <Flex
                    align="center"
                    justify="space-between"
                    gap={2}
                    mb={0.5}
                  >
                    <Text
                      fontSize="sm"
                      fontWeight={n.isRead ? 'normal' : '600'}
                      color={c.text}
                      lineHeight="short"
                      truncate
                    >
                      {n.title}
                    </Text>
                    <Text
                      fontSize="xs"
                      color={c.muted}
                      flexShrink={0}
                      opacity={0.7}
                    >
                      {formatTimeAgo(new Date(n.createdAt))}
                    </Text>
                  </Flex>

                  <Text
                    fontSize="xs"
                    color={c.muted}
                    lineClamp={2}
                    mb={1.5}
                  >
                    {n.body}
                  </Text>

                  <Flex align="center" gap={2}>
                    <Text
                      fontSize="11px"
                      fontWeight="500"
                      color={severityColor[n.severity] ?? c.muted}
                      textTransform="uppercase"
                      letterSpacing="0.04em"
                    >
                      {severityLabel[n.severity] ?? n.severity}
                    </Text>

                    {!n.isRead && (
                      <Box
                        w="6px"
                        h="6px"
                        borderRadius="full"
                        bg={c.accent}
                        title="Unread"
                      />
                    )}

                    {n.link && (
                      <Text fontSize="11px" color={c.muted} opacity={0.5}>
                        — view details
                      </Text>
                    )}
                  </Flex>
                </Box>
              </Flex>
            </Box>
          ))}

          {/* Load more */}
          {hasMore && (
            <Box
              textAlign="center"
              py={3}
              borderTop="1px solid"
              borderColor={c.border}
            >
              <Box
                as="button"
                fontSize="13px"
                color={c.accent}
                fontWeight="500"
                bg="transparent"
                border="none"
                cursor="pointer"
                _hover={{ textDecoration: 'underline' }}
                onClick={() => loadMore()}
              >
                Load more
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Push notification settings */}
      <Box
        mt={6}
        border="1px solid"
        borderColor={c.border}
        borderRadius="lg"
        overflow="hidden"
        bg={c.surface}
      >
        <Box px={4} py={3}>
          <Text fontSize="xs" fontWeight="600" color={c.text} mb={1} textTransform="uppercase" letterSpacing="0.04em">
            Push Settings
          </Text>
        </Box>
        <PushNotificationToggle />
      </Box>
    </Box>
  );
}
