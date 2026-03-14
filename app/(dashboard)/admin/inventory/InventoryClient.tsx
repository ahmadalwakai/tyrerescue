'use client';

import { useState, useTransition } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Table,
  Flex, Badge, createListCollection
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import { useRouter } from 'next/navigation';

interface TyreProduct {
  id: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  priceNew: string | null;
  priceUsed: string | null;
  stockNew: number | null;
  stockUsed: number | null;
  slug: string;
}

interface Props {
  tyres: TyreProduct[];
  page: number;
  totalPages: number;
  search: string;
}

export function InventoryClient({ tyres, page, totalPages, search }: Props) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(search);
  const [isPending, startTransition] = useTransition();

  function applySearch() {
    startTransition(() => {
      const params = new URLSearchParams();
      if (searchInput) params.set('search', searchInput);
      params.set('page', '1');
      router.push(`/admin/inventory?${params.toString()}`);
    });
  }

  return (
    <VStack align="stretch" gap={6}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} style={anim.fadeUp('0.5s')}>
        <Box>
          <Heading size="lg" color={c.text}>Inventory</Heading>
          <Text color={c.muted} mt={1}>Manage tyre products and stock levels</Text>
        </Box>
        <Button
          bg={c.accent}
          color="white"
          _hover={{ bg: c.accentHover }}
          onClick={() => router.push('/admin/inventory/new')}
          w={{ base: '100%', md: 'auto' }}
          minH="48px"
        >
          Add Product
        </Button>
      </Flex>

      <Flex gap={2} direction={{ base: 'column', md: 'row' }}>
        <Input {...inputProps}
          placeholder="Search brand, pattern, size..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          bg={c.surface}
          borderColor={c.border}
          color={c.text}
          maxW={{ base: '100%', md: '400px' }}
        />
        <Button onClick={applySearch} bg={c.card} color={c.text} borderColor={c.border} borderWidth="1px" w={{ base: '100%', md: 'auto' }} minH="48px">
          Search
        </Button>
      </Flex>

      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={anim.fadeUp('0.5s', '0.1s')} display={{ base: 'none', md: 'block' }}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Brand / Pattern</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Size</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Season</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Price New</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Price Used</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Stock New</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Stock Used</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3}></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {tyres.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={8} textAlign="center" py={8} color={c.muted}>
                  No products found
                </Table.Cell>
              </Table.Row>
            )}
            {tyres.map((t, i) => (
              <Table.Row key={t.id} _hover={{ bg: c.surface }} style={anim.stagger('fadeUp', i, '0.3s', 0.1, 0.03)}>
                <Table.Cell px={4} py={3} color={c.text}>
                  <Text fontWeight="600">{t.brand}</Text>
                  <Text fontSize="sm" color={c.muted}>{t.pattern}</Text>
                </Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>{t.sizeDisplay}</Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={c.surface} color={c.text}>{t.season}</Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>
                  {t.priceNew ? `£${Number(t.priceNew).toFixed(2)}` : '—'}
                </Table.Cell>
                <Table.Cell px={4} py={3} color={c.text}>
                  {t.priceUsed ? `£${Number(t.priceUsed).toFixed(2)}` : '—'}
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={(t.stockNew ?? 0) <= 2 ? '#7F1D1D' : c.surface} color={c.text}>
                    {t.stockNew ?? 0}
                  </Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Badge bg={(t.stockUsed ?? 0) <= 2 ? '#7F1D1D' : c.surface} color={c.text}>
                    {t.stockUsed ?? 0}
                  </Badge>
                </Table.Cell>
                <Table.Cell px={4} py={3}>
                  <Button
                    size="xs"
                    bg={c.surface}
                    color={c.text}
                    borderWidth="1px"
                    borderColor={c.border}
                    onClick={() => router.push(`/admin/inventory/${t.id}`)}
                  >
                    Edit
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Mobile card list */}
      <VStack gap={2} display={{ base: 'flex', md: 'none' }} align="stretch">
        {tyres.length === 0 ? (
          <Text textAlign="center" py={8} color={c.muted}>No products found</Text>
        ) : (
          tyres.map((t) => (
            <Box key={t.id} bg={c.card} border={`1px solid ${c.border}`} borderRadius="8px" p={4}>
              <Flex justify="space-between" align="start" mb={2}>
                <Box>
                  <Text fontWeight="bold" color={c.text}>{t.brand}</Text>
                  <Text fontSize="sm" color={c.muted}>{t.pattern}</Text>
                </Box>
                <Badge bg={c.surface} color={c.text}>{t.season}</Badge>
              </Flex>
              <Text fontSize="sm" color={c.text} mb={2}>{t.sizeDisplay}</Text>
              <Flex justify="space-between" mb={3}>
                <Box>
                  <Text fontSize="xs" color={c.muted}>New: {t.priceNew ? `£${Number(t.priceNew).toFixed(2)}` : '—'}</Text>
                  <Text fontSize="xs" color={c.muted}>Used: {t.priceUsed ? `£${Number(t.priceUsed).toFixed(2)}` : '—'}</Text>
                </Box>
                <Box textAlign="right">
                  <Text fontSize="xs" color={c.muted}>Stock New: {t.stockNew ?? 0}</Text>
                  <Text fontSize="xs" color={c.muted}>Stock Used: {t.stockUsed ?? 0}</Text>
                </Box>
              </Flex>
              <Button
                w="100%"
                size="sm"
                minH="48px"
                bg={c.surface}
                color={c.text}
                borderWidth="1px"
                borderColor={c.border}
                onClick={() => router.push(`/admin/inventory/${t.id}`)}
              >
                Edit
              </Button>
            </Box>
          ))
        )}
      </VStack>

      {totalPages > 1 && (
        <HStack justify="center" gap={2}>
          <Button
            size="sm"
            bg={c.surface}
            color={c.text}
            disabled={page <= 1}
            onClick={() => router.push(`/admin/inventory?page=${page - 1}&search=${search}`)}
          >
            Previous
          </Button>
          <Text color={c.muted} fontSize="sm">
            Page {page} of {totalPages}
          </Text>
          <Button
            size="sm"
            bg={c.surface}
            color={c.text}
            disabled={page >= totalPages}
            onClick={() => router.push(`/admin/inventory?page=${page + 1}&search=${search}`)}
          >
            Next
          </Button>
        </HStack>
      )}
    </VStack>
  );
}
