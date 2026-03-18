'use client';

import { useState, useEffect, useCallback } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  Text,
  VStack,
  HStack,
  Input,
  NativeSelect,
  Link as ChakraLink,
  Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import type { ConversationSummary } from '@/lib/chat/types';

const CHANNEL_LABELS: Record<string, string> = {
  customer_admin: 'Customer ↔ Admin',
  customer_driver: 'Customer ↔ Driver',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'green.400',
  closed: c.muted,
  archived: c.muted,
};

export function ChatConversationsClient() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', channel: '', bookingRef: '' });

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.channel) params.set('channel', filters.channel);
      if (filters.bookingRef) params.set('bookingRef', filters.bookingRef);
      const res = await fetch(`/api/chat/conversations?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <VStack align="stretch" gap={4}>
      {/* Filters */}
      <Flex gap={3} wrap="wrap" style={anim.fadeUp()}>
        <Input
          placeholder="Search booking ref..."
          value={filters.bookingRef}
          onChange={(e) => setFilters((f) => ({ ...f, bookingRef: e.target.value }))}
          maxW="220px"
          {...inputProps}
        />
        <NativeSelect.Root maxW="180px">
          <NativeSelect.Field
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            {...selectProps}
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </NativeSelect.Field>
        </NativeSelect.Root>
        <NativeSelect.Root maxW="200px">
          <NativeSelect.Field
            value={filters.channel}
            onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
            {...selectProps}
          >
            <option value="">All Channels</option>
            <option value="customer_admin">Customer ↔ Admin</option>
            <option value="customer_driver">Customer ↔ Driver</option>
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Flex>

      {/* List */}
      {loading ? (
        <Flex justify="center" py={12}><Spinner color={c.accent} /></Flex>
      ) : conversations.length === 0 ? (
        <Text color={c.muted} py={8} textAlign="center">No conversations found</Text>
      ) : (
        <VStack align="stretch" gap={2}>
          {conversations.map((conv, i) => (
            <ChakraLink
              key={conv.id}
              asChild
              _hover={{ textDecoration: 'none' }}
            >
              <NextLink href={`/admin/bookings/${conv.bookingRef}`}>
                <Box
                  bg={c.card}
                  borderWidth="1px"
                  borderColor={conv.unreadCount > 0 ? c.accent : c.border}
                  borderRadius="md"
                  p={4}
                  cursor="pointer"
                  transition="all 0.2s"
                  _hover={{ bg: c.surface, borderColor: c.accent }}
                  style={anim.stagger('fadeUp', i, '0.3s', 0.03)}
                >
                  <Flex justify="space-between" align="center" mb={2}>
                    <HStack gap={3}>
                      <Text fontWeight="600" color={c.text}>
                        {conv.bookingRef}
                      </Text>
                      <Text fontSize="xs" color={c.muted} px={2} py={0.5} bg={c.surface} borderRadius="full">
                        {CHANNEL_LABELS[conv.channel] ?? conv.channel}
                      </Text>
                      <Text fontSize="xs" color={STATUS_COLORS[conv.status] ?? c.muted}>
                        {STATUS_LABELS[conv.status] ?? conv.status}
                      </Text>
                      {conv.locked && <Text fontSize="xs" color="#EAB308">🔒</Text>}
                    </HStack>
                    <HStack gap={2}>
                      {conv.unreadCount > 0 && (
                        <Flex
                          align="center"
                          justify="center"
                          bg={c.accent}
                          color="#09090B"
                          fontSize="10px"
                          fontWeight="700"
                          minW="18px"
                          h="18px"
                          borderRadius="full"
                          px="4px"
                        >
                          {conv.unreadCount}
                        </Flex>
                      )}
                      {conv.lastMessageAt && (
                        <Text fontSize="xs" color={c.muted}>
                          {formatRelative(conv.lastMessageAt)}
                        </Text>
                      )}
                    </HStack>
                  </Flex>
                  <Flex justify="space-between" align="center">
                    <Text fontSize="sm" color={c.muted} truncate maxW="70%">
                      <Text as="span" fontWeight="500" color={c.text}>{conv.customerName}</Text>
                      {conv.driverName && <Text as="span"> • Driver: {conv.driverName}</Text>}
                    </Text>
                    {conv.lastMessageBody && (
                      <Text fontSize="sm" color={c.muted} truncate maxW="40%">
                        {conv.lastMessageSenderRole === 'admin' ? 'You: ' : ''}
                        {conv.lastMessageBody}
                      </Text>
                    )}
                  </Flex>
                </Box>
              </NextLink>
            </ChakraLink>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
