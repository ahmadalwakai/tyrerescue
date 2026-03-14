'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Grid,
  Flex, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

const WIDTHS = [155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285];
const RIMS = [13, 14, 15, 16, 17, 18, 19, 20, 21];

interface CatalogueItem {
  catalogueId: string;
  brand: string;
  pattern: string;
  width: number;
  rim: number;
  sizeDisplay: string;
  season: string;
  speedRating: string | null;
  loadIndex: number | null;
  wetGrip: string | null;
  fuelEfficiency: string | null;
  runFlat: boolean | null;
  tier: string;
  suggestedPriceNew: string | null;
  slug: string;
  productId: string | null;
  priceNew: string | null;
  stockNew: number | null;
  availableNew: boolean | null;
}

export function InventoryClient() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterWidth, setFilterWidth] = useState('');
  const [filterRim, setFilterRim] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [filterSeason, setFilterSeason] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchItems = useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      if (search) params.set('search', search);
      if (filterWidth) params.set('width', filterWidth);
      if (filterRim) params.set('rim', filterRim);
      if (filterTier !== 'all') params.set('tier', filterTier);
      if (filterSeason !== 'all') params.set('season', filterSeason);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/admin/inventory?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
      setActiveCount(data.activeCount || 0);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, filterWidth, filterRim, filterTier, filterSeason, filterStatus]);

  useEffect(() => { fetchItems(1); }, [fetchItems]);

  const selectStyle: React.CSSProperties = {
    background: c.surface,
    color: c.text,
    border: `1px solid ${c.border}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 13,
    minHeight: 40,
    outline: 'none',
  };

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? c.accent : 'transparent',
    color: active ? '#fff' : c.muted,
    border: `1px solid ${active ? c.accent : c.border}`,
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  return (
    <VStack align="stretch" gap={6}>
      <Box style={anim.fadeUp('0.5s')}>
        <Heading size="lg" color={c.text} fontFamily="var(--font-display)" letterSpacing="0.02em">
          Tyre Catalogue
        </Heading>
        <Text color={c.muted} mt={1} fontSize="sm">
          Activate the tyres you currently stock. Set your price and quantity for each.
        </Text>
      </Box>

      {/* Filter bar */}
      <Box
        position="sticky" top={0} zIndex={10} bg={c.bg} py={3}
        borderBottomWidth="1px" borderColor={c.border}
      >
        <Flex gap={2} flexWrap="wrap" align="center">
          <select value={filterWidth} onChange={(e) => setFilterWidth(e.target.value)} style={selectStyle}>
            <option value="">Width</option>
            {WIDTHS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select value={filterRim} onChange={(e) => setFilterRim(e.target.value)} style={selectStyle}>
            <option value="">Rim</option>
            {RIMS.map((r) => <option key={r} value={r}>R{r}</option>)}
          </select>

          {/* Tier toggle */}
          <Flex gap={1}>
            {['all', 'budget', 'mid', 'premium'].map((t) => (
              <Box as="button" key={t} onClick={() => setFilterTier(t)} style={toggleBtnStyle(filterTier === t)}>
                {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              </Box>
            ))}
          </Flex>

          {/* Season toggle */}
          <Flex gap={1}>
            {['all', 'summer', 'winter', 'allseason'].map((s) => (
              <Box as="button" key={s} onClick={() => setFilterSeason(s)} style={toggleBtnStyle(filterSeason === s)}>
                {s === 'all' ? 'All' : s === 'allseason' ? 'All-Season' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Box>
            ))}
          </Flex>

          {/* Status toggle */}
          <Flex gap={1}>
            {['all', 'active', 'inactive'].map((st) => (
              <Box as="button" key={st} onClick={() => setFilterStatus(st)} style={toggleBtnStyle(filterStatus === st)}>
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </Box>
            ))}
          </Flex>

          <Input
            {...inputProps}
            placeholder="Search brand / pattern…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchItems(1)}
            bg={c.surface}
            borderColor={c.border}
            color={c.text}
            maxW="220px"
            size="sm"
            minH="40px"
          />
          <Button size="sm" bg={c.accent} color="white" onClick={() => fetchItems(1)} minH="40px">
            Search
          </Button>
        </Flex>
      </Box>

      {/* Counts */}
      <Flex justify="space-between" fontSize="sm" color={c.muted}>
        <Text>Showing {items.length} of {totalCount} tyres in catalogue</Text>
        <Text>{activeCount} tyres currently active</Text>
      </Flex>

      {isLoading ? (
        <VStack py={12}><Spinner size="lg" /><Text color={c.muted}>Loading catalogue...</Text></VStack>
      ) : items.length === 0 ? (
        <Box bg={c.card} p={8} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>No catalogue items match your filters</Text>
        </Box>
      ) : (
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }} gap={4}>
          {items.map((item, i) => (
            <CatalogueCard key={item.catalogueId} item={item} index={i} onRefresh={() => fetchItems(page)} />
          ))}
        </Grid>
      )}

      {totalPages > 1 && (
        <HStack justify="center" gap={2} pt={2}>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page <= 1}
            onClick={() => fetchItems(page - 1)} minH="36px">Previous</Button>
          <Text color={c.muted} fontSize="sm">Page {page} of {totalPages}</Text>
          <Button size="sm" bg={c.surface} color={c.text} disabled={page >= totalPages}
            onClick={() => fetchItems(page + 1)} minH="36px">Next</Button>
        </HStack>
      )}
    </VStack>
  );
}

/* ------------------------------------------------------------------ */
/*  Catalogue Card                                                     */
/* ------------------------------------------------------------------ */

function CatalogueCard({ item, index, onRefresh }: { item: CatalogueItem; index: number; onRefresh: () => void }) {
  const isActive = !!item.productId;
  const [price, setPrice] = useState(item.priceNew ? String(Number(item.priceNew).toFixed(2)) : (item.suggestedPriceNew ? String(Number(item.suggestedPriceNew).toFixed(2)) : ''));
  const [stock, setStock] = useState(String(item.stockNew ?? 4));
  const [isSaving, setIsSaving] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const tierColors: Record<string, { bg: string; color: string }> = {
    budget: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
    mid: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    premium: { bg: 'rgba(249,115,22,0.15)', color: '#F97316' },
  };
  const tc = tierColors[item.tier] || tierColors.mid;

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
      setShowActivateForm(false);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate() {
    if (!item.productId) return;
    setIsSaving(true);
    try {
      await fetch(`/api/admin/catalogue/${item.catalogueId}/deactivate`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setIsSaving(false);
      setConfirmRemove(false);
    }
  }

  async function saveField(field: 'priceNew' | 'stockNew', value: string) {
    if (!item.productId) return;
    const body = field === 'priceNew'
      ? { priceNew: value ? Number(value) : null }
      : { stockNew: value ? Number(value) : 0 };
    await fetch(`/api/admin/inventory/${item.productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onRefresh();
  }

  /* ---------- INACTIVE card ---------- */
  if (!isActive) {
    return (
      <Box
        bg={c.surface}
        borderRadius="8px"
        borderWidth="1px"
        borderColor={c.border}
        p={4}
        opacity={0.7}
        style={anim.stagger('fadeUp', index, '0.3s', 0.1, 0.03)}
      >
        <Text fontSize="13px" color={c.muted} fontFamily="var(--font-body)">{item.brand}</Text>
        <Text fontSize="24px" fontWeight="700" color={c.text} fontFamily="var(--font-display)" lineHeight="1.1" mt={1}>
          {item.sizeDisplay}
        </Text>
        <Text fontSize="12px" color={c.muted} mt={1}>{item.pattern}</Text>

        <Flex gap={2} mt={2} align="center" flexWrap="wrap">
          <Box as="span" px={2} py={0.5} borderRadius="4px" fontSize="11px" fontWeight="600"
            style={{ background: tc.bg, color: tc.color }}>
            {item.tier}
          </Box>
          {item.season !== 'allseason' && (
            <Box as="span" px={2} py={0.5} borderRadius="4px" fontSize="11px"
              bg={c.card} color={c.muted}>
              {item.season}
            </Box>
          )}
        </Flex>

        {showActivateForm ? (
          <Box mt={3} pt={3} borderTopWidth="1px" borderColor={c.border}>
            <VStack gap={2} align="stretch">
              <Flex gap={2}>
                <Box flex="1">
                  <Text fontSize="11px" color={c.muted} mb={1}>Your price £</Text>
                  <Input size="sm" type="number" step="0.01" value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    bg={c.card} borderColor={c.border} color={c.text} />
                </Box>
                <Box flex="1">
                  <Text fontSize="11px" color={c.muted} mb={1}>Quantity</Text>
                  <Input size="sm" type="number" value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    bg={c.card} borderColor={c.border} color={c.text} />
                </Box>
              </Flex>
              <Flex gap={2}>
                <Button size="sm" bg={c.accent} color="white" flex="1"
                  onClick={activate} disabled={isSaving || !price} minH="36px">
                  {isSaving ? 'Activating…' : 'Confirm'}
                </Button>
                <Box as="button" onClick={() => setShowActivateForm(false)}
                  style={{ fontSize: 13, color: c.muted, cursor: 'pointer', padding: '0 8px' }}>
                  Cancel
                </Box>
              </Flex>
            </VStack>
          </Box>
        ) : (
          <Flex justify="space-between" align="center" mt={3} pt={3} borderTopWidth="1px" borderColor={c.border}>
            <Text fontSize="12px" color={c.muted}>
              Suggested: £{item.suggestedPriceNew ? Number(item.suggestedPriceNew).toFixed(0) : '—'}
            </Text>
            <Box as="button" onClick={() => setShowActivateForm(true)}
              style={{
                background: 'transparent',
                border: `1px solid ${c.border}`,
                color: c.muted,
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}>
              Activate
            </Box>
          </Flex>
        )}
      </Box>
    );
  }

  /* ---------- ACTIVE card ---------- */
  return (
    <Box
      bg={c.card}
      borderRadius="8px"
      borderWidth="2px"
      borderColor={c.accent}
      p={4}
      style={anim.stagger('fadeUp', index, '0.3s', 0.1, 0.03)}
    >
      <Text fontSize="13px" color={c.accent} fontFamily="var(--font-body)">{item.brand}</Text>
      <Text fontSize="24px" fontWeight="700" color={c.text} fontFamily="var(--font-display)" lineHeight="1.1" mt={1}>
        {item.sizeDisplay}
      </Text>
      <Text fontSize="12px" color={c.muted} mt={1}>{item.pattern}</Text>

      <Flex gap={2} mt={2} align="center" flexWrap="wrap">
        <Box as="span" px={2} py={0.5} borderRadius="4px" fontSize="11px" fontWeight="600"
          style={{ background: tc.bg, color: tc.color }}>
          {item.tier}
        </Box>
        <Flex align="center" gap={1}>
          <Box w="6px" h="6px" borderRadius="full" bg={c.accent} />
          <Text fontSize="11px" color={c.accent}>In Stock</Text>
        </Flex>
      </Flex>

      {/* Inline editable price + stock */}
      <Flex gap={2} mt={3}>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Price (£)</Text>
          <Input
            size="sm" type="number" step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => saveField('priceNew', price)}
            bg={c.surface} borderColor={c.border} color={c.text}
            w="80px" fontSize="14px"
          />
        </Box>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Stock</Text>
          <Input
            size="sm" type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            onBlur={() => saveField('stockNew', stock)}
            bg={c.surface} borderColor={c.border} color={c.text}
            w="60px" fontSize="14px"
          />
        </Box>
      </Flex>

      <Text fontSize="11px" color={c.muted} mt={2}>{item.stockNew ?? 0} items in stock</Text>

      {/* Confirm remove */}
      {confirmRemove ? (
        <Box mt={3} p={3} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.4)">
          <Text fontSize="sm" color={c.text} mb={2}>
            Remove this tyre from your stock? Existing bookings are not affected.
          </Text>
          <Flex gap={2}>
            <Button size="sm" bg="#E53E3E" color="white" onClick={deactivate} disabled={isSaving} minH="36px">
              {isSaving ? 'Removing…' : 'Confirm Remove'}
            </Button>
            <Button size="sm" variant="outline" borderColor={c.border} color={c.text}
              onClick={() => setConfirmRemove(false)} minH="36px">
              Cancel
            </Button>
          </Flex>
        </Box>
      ) : (
        <Flex mt={3} pt={3} borderTopWidth="1px" borderColor={c.border}>
          <Box as="button"
            onClick={() => setConfirmRemove(true)}
            style={{
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background: 'transparent',
            }}>
            Deactivate
          </Box>
        </Flex>
      )}
    </Box>
  );
}
