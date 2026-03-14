'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Flex, Badge, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface CallbackItem {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

export function CallbacksClient() {
  const [items, setItems] = useState<CallbackItem[]>([]);
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async (p: number, status: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), status });
      const res = await fetch(`/api/admin/callbacks?${params}`);
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
    await fetch(`/api/admin/callbacks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchItems(page, filter);
  }

  const statusColor = (s: string) => {
    if (s === 'pending') return c.accent;
    if (s === 'resolved') return '#22C55E';
    return c.muted;
  };

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text}>Callback Requests</Heading>
        <Text color={c.muted} mt={1}>Manage call-me-back requests from customers.</Text>
      </Box>

      <HStack gap={2}>
        {['pending', 'resolved', 'dismissed', 'all'].map((s) => (
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
          <Text color={c.muted}>No callback requests found</Text>
        </Box>
      ) : (
        <VStack align="stretch" gap={3}>
          {items.map((item, i) => (
            <Box
              key={item.id}
              bg={c.card}
              borderRadius="md"
              borderWidth="1px"
              borderColor={c.border}
              p={4}
              style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}
            >
              <Flex justify="space-between" align="start" gap={4} direction={{ base: 'column', md: 'row' }}>
                <Box flex="1">
                  <Flex gap={3} align="center" mb={1}>
                    <Text fontWeight="700" color={c.text}>{item.name}</Text>
                    <Badge bg={statusColor(item.status)} color={item.status === 'pending' ? 'white' : '#09090B'} fontSize="xs">
                      {item.status}
                    </Badge>
                  </Flex>
                  <Text color={c.muted} fontSize="sm">Phone: {item.phone}</Text>
                  {item.notes && <Text color={c.muted} fontSize="sm" mt={1}>{item.notes}</Text>}
                  <Text color={c.muted} fontSize="xs" mt={2}>
                    {new Date(item.createdAt).toLocaleString('en-GB')}
                  </Text>
                </Box>
                {item.status === 'pending' && (
                  <HStack gap={2} flexShrink={0}>
                    <Button
                      size="sm"
                      bg={c.accent}
                      color="white"
                      _hover={{ bg: c.accentHover }}
                      onClick={() => updateStatus(item.id, 'resolved')}
                      minH="36px"
                    >
                      Resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor={c.border}
                      color={c.muted}
                      onClick={() => updateStatus(item.id, 'dismissed')}
                      minH="36px"
                    >
                      Dismiss
                    </Button>
                  </HStack>
                )}
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
