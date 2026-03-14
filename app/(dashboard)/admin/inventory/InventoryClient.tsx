'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Grid,
  Flex, Badge, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface CatalogueItem {
  catalogueId: string;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  runFlat: boolean | null;
  slug: string;
  // Product fields (null if inactive)
  productId: string | null;
  priceNew: string | null;
  stockNew: number | null;
  availableNew: boolean | null;
  bookingCount: number;
}

export function InventoryClient() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchItems = useCallback(async (p: number, q: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/inventory?${params}`);
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

  useEffect(() => { fetchItems(1, ''); }, [fetchItems]);

  function handleSearch() { fetchItems(1, search); }

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text}>Tyre Catalogue</Heading>
        <Text color={c.muted} mt={1}>Browse the master catalogue. Activate items to sell them on site.</Text>
      </Box>

      <Flex gap={2} direction={{ base: 'column', md: 'row' }}>
        <Input {...inputProps}
          placeholder="Search brand, pattern, size..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          bg={c.surface}
          borderColor={c.border}
          color={c.text}
          maxW={{ base: '100%', md: '400px' }}
        />
        <Button onClick={handleSearch} bg={c.card} color={c.text} borderColor={c.border} borderWidth="1px" w={{ base: '100%', md: 'auto' }} minH="48px">
          Search
        </Button>
      </Flex>

      {isLoading ? (
        <VStack py={12}><Spinner size="lg" /><Text color={c.muted}>Loading catalogue...</Text></VStack>
      ) : items.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>No catalogue items found</Text>
        </Box>
      ) : (
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }} gap={4}>
          {items.map((item, i) => (
            <CatalogueCard key={item.catalogueId} item={item} index={i} onRefresh={() => fetchItems(page, search)} />
          ))}
        </Grid>
      )}

      {totalPages > 1 && (
        <HStack justify="center" gap={2}>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page <= 1}
            onClick={() => fetchItems(page - 1, search)}>Previous</Button>
          <Text color={c.muted} fontSize="sm">Page {page} of {totalPages}</Text>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page >= totalPages}
            onClick={() => fetchItems(page + 1, search)}>Next</Button>
        </HStack>
      )}
    </VStack>
  );
}

function CatalogueCard({ item, index, onRefresh }: { item: CatalogueItem; index: number; onRefresh: () => void }) {
  const isActive = !!item.productId;
  const [price, setPrice] = useState(item.priceNew ? String(Number(item.priceNew).toFixed(2)) : '');
  const [stock, setStock] = useState(String(item.stockNew ?? 0));
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Edit fields
  const [editBrand, setEditBrand] = useState(item.brand);
  const [editPattern, setEditPattern] = useState(item.pattern);
  const [editSeason, setEditSeason] = useState(item.season);
  const [editSpeedRating, setEditSpeedRating] = useState(item.speedRating ?? '');

  async function activate() {
    setIsSaving(true);
    try {
      await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogueId: item.catalogueId,
          priceNew: price ? Number(price) : null,
          stockNew: stock ? Number(stock) : 0,
        }),
      });
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate() {
    if (!item.productId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/admin/inventory/${item.productId}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setIsSaving(false);
      setConfirmRemove(false);
    }
  }

  async function saveChanges() {
    if (!item.productId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/admin/inventory/${item.productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceNew: price ? Number(price) : null,
          stockNew: stock ? Number(stock) : 0,
        }),
      });
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit() {
    setIsSaving(true);
    try {
      await fetch(`/api/admin/catalogue/${item.catalogueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: editBrand,
          pattern: editPattern,
          season: editSeason,
          speed_rating: editSpeedRating || undefined,
        }),
      });
      setIsEditing(false);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Box
      bg={c.card}
      borderRadius="md"
      borderWidth="2px"
      borderColor={isActive ? c.accent : c.border}
      p={4}
      style={anim.stagger('fadeUp', index, '0.3s', 0.1, 0.03)}
      position="relative"
    >
      {isActive && (
        <Badge colorPalette="green" position="absolute" top={2} right={2} fontSize="xs">Active</Badge>
      )}

      <Text fontWeight="700" fontSize="lg" color={c.text}>{item.brand}</Text>
      <Text color={c.muted} fontSize="sm">{item.pattern}</Text>
      <Text color={c.muted} fontSize="sm" mt={1}>{item.sizeDisplay}</Text>

      <HStack gap={3} mt={2} fontSize="xs" color={c.muted} flexWrap="wrap">
        <Badge bg={c.surface} color={c.text}>{item.season}</Badge>
        {item.speedRating && <Text>Speed: {item.speedRating}</Text>}
        {item.loadIndex && <Text>Load: {item.loadIndex}</Text>}
        {item.runFlat && <Badge colorPalette="blue" fontSize="xs">Run Flat</Badge>}
      </HStack>

      {isActive && Number(item.bookingCount) > 0 && (
        <Text fontSize="xs" color={c.muted} mt={2}>
          Used in {Number(item.bookingCount)} booking{Number(item.bookingCount) !== 1 ? 's' : ''}
        </Text>
      )}

      {/* Inline edit panel */}
      {isEditing && (
        <Box mt={4} p={3} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <Grid templateColumns="1fr 1fr" gap={2}>
            <Box>
              <Text fontSize="xs" color={c.muted} mb={1}>Brand</Text>
              <Input size="sm" value={editBrand} onChange={(e) => setEditBrand(e.target.value)}
                bg={c.card} borderColor={c.border} color={c.text} />
            </Box>
            <Box>
              <Text fontSize="xs" color={c.muted} mb={1}>Pattern</Text>
              <Input size="sm" value={editPattern} onChange={(e) => setEditPattern(e.target.value)}
                bg={c.card} borderColor={c.border} color={c.text} />
            </Box>
            <Box>
              <Text fontSize="xs" color={c.muted} mb={1}>Season</Text>
              <Input size="sm" value={editSeason} onChange={(e) => setEditSeason(e.target.value)}
                bg={c.card} borderColor={c.border} color={c.text} />
            </Box>
            <Box>
              <Text fontSize="xs" color={c.muted} mb={1}>Speed Rating</Text>
              <Input size="sm" value={editSpeedRating} onChange={(e) => setEditSpeedRating(e.target.value)}
                bg={c.card} borderColor={c.border} color={c.text} />
            </Box>
          </Grid>
          <Flex gap={2} mt={3}>
            <Button size="sm" bg={c.accent} color="white" onClick={saveEdit} disabled={isSaving} minH="36px">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button size="sm" variant="outline" borderColor={c.border} color={c.text}
              onClick={() => setIsEditing(false)} minH="36px">
              Cancel
            </Button>
          </Flex>
        </Box>
      )}

      {/* Confirm remove panel */}
      {confirmRemove && (
        <Box mt={4} p={3} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor="#E53E3E">
          <Text fontSize="sm" color={c.text} mb={2}>
            Remove this item from active stock?
            {Number(item.bookingCount) > 0 && ` It has been used in ${Number(item.bookingCount)} booking(s).`}
          </Text>
          <Flex gap={2}>
            <Button size="sm" bg="#E53E3E" color="white" onClick={deactivate} disabled={isSaving} minH="36px">
              {isSaving ? 'Removing...' : 'Confirm Remove'}
            </Button>
            <Button size="sm" variant="outline" borderColor={c.border} color={c.text}
              onClick={() => setConfirmRemove(false)} minH="36px">
              Cancel
            </Button>
          </Flex>
        </Box>
      )}

      <VStack align="stretch" gap={2} mt={4}>
        <Flex gap={2}>
          <Box flex="1">
            <Text fontSize="xs" color={c.muted} mb={1}>Price (£)</Text>
            <Input
              size="sm"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              bg={c.surface}
              borderColor={c.border}
              color={c.text}
            />
          </Box>
          <Box flex="1">
            <Text fontSize="xs" color={c.muted} mb={1}>Stock</Text>
            <Input
              size="sm"
              type="number"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              bg={c.surface}
              borderColor={c.border}
              color={c.text}
            />
          </Box>
        </Flex>

        {isActive ? (
          <>
            <Flex gap={2}>
              <Button
                flex="1"
                size="sm"
                bg={c.accent}
                color="white"
                onClick={saveChanges}
                disabled={isSaving}
                minH="40px"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                borderColor={c.border}
                color={c.text}
                onClick={() => { setIsEditing(!isEditing); setConfirmRemove(false); }}
                disabled={isSaving}
                minH="40px"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                borderColor="#E53E3E"
                color="#E53E3E"
                onClick={() => { setConfirmRemove(!confirmRemove); setIsEditing(false); }}
                disabled={isSaving}
                minH="40px"
              >
                Remove
              </Button>
            </Flex>
          </>
        ) : (
          <Flex gap={2}>
            <Button
              flex="1"
              size="sm"
              bg={c.accent}
              color="white"
              onClick={activate}
              disabled={isSaving || !price}
              minH="40px"
            >
              {isSaving ? 'Activating...' : 'Activate'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              borderColor={c.border}
              color={c.text}
              onClick={() => { setIsEditing(!isEditing); }}
              disabled={isSaving}
              minH="40px"
            >
              Edit
            </Button>
          </Flex>
        )}
      </VStack>
    </Box>
  );
}
