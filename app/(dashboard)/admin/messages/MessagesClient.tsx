'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Flex, Badge, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface MessageItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
  aiPriority: string | null;
  aiCategory: string | null;
  aiSuggestedResponse: string | null;
  requiresImmediateCall: boolean | null;
  aiSentiment: string | null;
  createdAt: string;
  repliedAt: string | null;
}

export function MessagesClient() {
  const [items, setItems] = useState<MessageItem[]>([]);
  const [filter, setFilter] = useState('unread');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async (p: number, status: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), status });
      const res = await fetch(`/api/admin/messages?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(1, filter); }, [fetchItems, filter]);

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchItems(page, filter);
  }

  const statusColor = (s: string) => {
    if (s === 'unread') return c.accent;
    if (s === 'read') return '#3B82F6';
    if (s === 'replied') return '#22C55E';
    return c.muted;
  };

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text}>Contact Messages</Heading>
        <Text color={c.muted} mt={1}>Manage contact form messages from customers.</Text>
      </Box>

      <HStack gap={2} flexWrap="wrap">
        {['unread', 'read', 'replied', 'archived', 'all'].map((s) => (
          <Button
            key={s}
            size="sm"
            bg={filter === s ? c.accent : c.card}
            color={filter === s ? 'white' : c.text}
            borderWidth="1px"
            borderColor={filter === s ? c.accent : c.border}
            onClick={() => { setFilter(s); setPage(1); }}
            minH="36px"
            textTransform="capitalize"
          >
            {s}
          </Button>
        ))}
      </HStack>

      {isLoading ? (
        <VStack py={12}><Spinner size="lg" /><Text color={c.muted}>Loading...</Text></VStack>
      ) : items.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>No messages found</Text>
        </Box>
      ) : (
        <VStack align="stretch" gap={3}>
          {items.map((item, i) => (
            <Box
              key={item.id}
              bg={c.card}
              borderRadius="md"
              borderWidth="1px"
              borderColor={item.status === 'unread' ? c.accent : c.border}
              p={4}
              style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}
            >
              <Flex justify="space-between" align="start" gap={4} direction={{ base: 'column', md: 'row' }}>
                <Box flex="1" minW={0}>
                  <Flex gap={2} align="center" mb={1} flexWrap="wrap">
                    <Text fontWeight="700" color={c.text}>{item.name}</Text>
                    <Badge bg={statusColor(item.status)} color="white" fontSize="xs">
                      {item.status}
                    </Badge>
                    {item.aiPriority && (
                      <Badge
                        colorPalette={item.aiPriority === 'urgent' ? 'red' : item.aiPriority === 'high' ? 'orange' : item.aiPriority === 'low' ? 'gray' : 'blue'}
                        fontSize="xs"
                        size="sm"
                      >
                        {item.aiPriority}
                      </Badge>
                    )}
                    {item.aiCategory && (
                      <Badge colorPalette="cyan" fontSize="xs" size="sm" variant="outline">
                        {item.aiCategory.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {item.requiresImmediateCall && (
                      <Badge colorPalette="red" fontSize="xs" size="sm" variant="solid">📞 NEEDS CALL</Badge>
                    )}
                  </Flex>
                  <Text color={c.muted} fontSize="sm">{item.email}</Text>
                  {item.phone && <Text color={c.muted} fontSize="sm">Phone: {item.phone}</Text>}
                  <Text color={c.text} fontSize="sm" mt={2} whiteSpace="pre-wrap">{item.message}</Text>
                  {item.aiSuggestedResponse && (
                    <Box mt={2} p={2} bg={c.surface} borderRadius="md" borderLeft="3px solid" borderColor={c.accent}>
                      <Text fontSize="xs" color={c.muted} mb={1}>⚡ AI Suggested Response</Text>
                      <Text fontSize="sm" color={c.text}>{item.aiSuggestedResponse}</Text>
                    </Box>
                  )}
                  <Text color={c.muted} fontSize="xs" mt={2}>
                    {new Date(item.createdAt).toLocaleString('en-GB')}
                    {item.aiSentiment && ` · Sentiment: ${item.aiSentiment}`}
                  </Text>
                </Box>
                <VStack gap={2} flexShrink={0} align="stretch">
                  {item.status === 'unread' && (
                    <Button
                      size="sm"
                      bg={c.surface}
                      color={c.text}
                      borderWidth="1px"
                      borderColor={c.border}
                      onClick={() => updateStatus(item.id, 'read')}
                      minH="36px"
                    >
                      Mark Read
                    </Button>
                  )}
                  {(item.status === 'unread' || item.status === 'read') && (
                    <Button
                      size="sm"
                      bg={c.accent}
                      color="white"
                      _hover={{ bg: c.accentHover }}
                      onClick={() => updateStatus(item.id, 'replied')}
                      minH="36px"
                    >
                      Mark Replied
                    </Button>
                  )}
                  {item.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={c.border}
                      color={c.muted}
                      onClick={() => updateStatus(item.id, 'archived')}
                      minH="36px"
                    >
                      Archive
                    </Button>
                  )}
                </VStack>
              </Flex>
            </Box>
          ))}
        </VStack>
      )}

      {totalPages > 1 && (
        <HStack justify="center" gap={2}>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page <= 1}
            onClick={() => fetchItems(page - 1, filter)}>Previous</Button>
          <Text color={c.muted} fontSize="sm">Page {page} of {totalPages}</Text>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page >= totalPages}
            onClick={() => fetchItems(page + 1, filter)}>Next</Button>
        </HStack>
      )}
    </VStack>
  );
}
