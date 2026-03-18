'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Grid,
  Flex, Spinner, NativeSelect,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, selectProps } from '@/lib/design-tokens';
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
  stockOrdered: number | null;
  isLocalStock: boolean | null;
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

  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({
    brand: '', pattern: '', width: '', aspect: '', rim: '',
    season: 'allseason', speedRating: '', loadIndex: '',
    tier: 'mid', priceNew: '', stockNew: '4', stockOrdered: '0', isLocalStock: true,
  });
  const [customSaving, setCustomSaving] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  // Import stock state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported?: number;
    activated?: number;
    message?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/inventory/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Import failed');

      setImportResult({
        success: true,
        imported: data.imported,
        activated: data.activated,
        message: `Import complete. ${data.imported} sizes imported from file. ${data.activated} additional sizes activated as pre-order. ${data.reset} items reset to pre-order.`,
      });

      fetchItems(1);
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : 'Import failed',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCustomSubmit = async () => {
    setCustomSaving(true);
    setCustomError(null);
    try {
      const res = await fetch('/api/admin/inventory/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: customForm.brand,
          pattern: customForm.pattern,
          width: Number(customForm.width),
          aspect: Number(customForm.aspect),
          rim: Number(customForm.rim),
          season: customForm.season,
          speedRating: customForm.speedRating || undefined,
          loadIndex: customForm.loadIndex ? Number(customForm.loadIndex) : undefined,
          tier: customForm.tier,
          priceNew: Number(customForm.priceNew),
          stockNew: Number(customForm.stockNew),
          stockOrdered: Number(customForm.stockOrdered),
          isLocalStock: customForm.isLocalStock,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ? JSON.stringify(data.error) : 'Failed to create');
      }
      setShowCustomForm(false);
      setCustomForm({
        brand: '', pattern: '', width: '', aspect: '', rim: '',
        season: 'allseason', speedRating: '', loadIndex: '',
        tier: 'mid', priceNew: '', stockNew: '4', stockOrdered: '0', isLocalStock: true,
      });
      fetchItems(1);
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Failed to create tyre');
    } finally {
      setCustomSaving(false);
    }
  };

  return (
    <VStack align="stretch" gap={6}>
      <Flex align="center" justify="space-between" style={anim.fadeUp('0.5s')}>
        <Box>
          <Heading size="lg" color={c.text} fontFamily="var(--font-display)" letterSpacing="0.02em">
            Tyre Catalogue
          </Heading>
          <Text color={c.muted} mt={1} fontSize="sm">
            Activate the tyres you currently stock. Set your price and quantity for each.
          </Text>
        </Box>
        <Flex gap={2}>
          <Button
            bg={c.surface} color={c.text} fontFamily="var(--font-display)" fontSize="16px"
            h="44px" px={5} borderWidth="1px" borderColor={c.border}
            _hover={{ borderColor: c.accent }}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'IMPORTING...' : 'IMPORT STOCK FILE'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <Button
            bg={c.accent} color="white" fontFamily="var(--font-display)" fontSize="16px"
            h="44px" px={5} onClick={() => setShowCustomForm(!showCustomForm)}
          >
            {showCustomForm ? 'CANCEL' : 'ADD CUSTOM TYRE'}
          </Button>
        </Flex>
      </Flex>

      {/* Import result */}
      {importResult && (
        <Box
          mt={-3}
          borderRadius="8px"
          p="14px"
          bg={importResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
          borderWidth="1px"
          borderColor={importResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}
        >
          <Text fontSize="13px" color={importResult.success ? '#22C55E' : '#EF4444'} style={{ fontFamily: 'var(--font-body)' }}>
            {importResult.message}
          </Text>
        </Box>
      )}

      {/* Import format info */}
      <Box bg={c.surface} borderWidth="1px" borderColor={c.border} borderRadius="8px" p={4}>
        <Text fontSize="13px" fontWeight="600" color={c.text} style={{ fontFamily: 'var(--font-body)' }}>
          Stock Import Format
        </Text>
        <Text fontSize="12px" color={c.muted} mt={2} style={{ fontFamily: 'var(--font-body)' }}>
          Upload your stock Excel file (.xls or .xlsx).
        </Text>
        <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
          Expected columns: Item Code | Item Name | Barcode | Quantity
        </Text>
        <Text fontSize="12px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
          Item code format: 1956016c = 195/60/R16
        </Text>
        <Text fontSize="12px" color={c.accent} mt={2} style={{ fontFamily: 'var(--font-body)' }}>
          Items in the file = In Stock (local). All other catalogue sizes = Pre-order 2-3 days.
        </Text>
      </Box>

      {/* Custom tyre form */}
      {showCustomForm && (
        <Box bg={c.surface} p={5} borderRadius="8px" borderWidth="1px" borderColor={c.accent}>
          <Text fontFamily="var(--font-display)" fontSize="18px" color={c.text} mb={3}>
            Add Custom Tyre
          </Text>
          {customError && <Text fontSize="12px" color="red.400" mb={2}>{customError}</Text>}
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={3}>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Brand *</Text>
              <Input {...inputProps} size="sm" placeholder="e.g. Michelin" value={customForm.brand}
                onChange={(e) => setCustomForm(f => ({ ...f, brand: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Pattern *</Text>
              <Input {...inputProps} size="sm" placeholder="e.g. Primacy 4" value={customForm.pattern}
                onChange={(e) => setCustomForm(f => ({ ...f, pattern: e.target.value }))} />
            </Box>
            <Flex gap={2}>
              <Box flex="1">
                <Text fontSize="11px" color={c.muted} mb={1}>Width *</Text>
                <Input {...inputProps} size="sm" type="number" placeholder="205" value={customForm.width}
                  onChange={(e) => setCustomForm(f => ({ ...f, width: e.target.value }))} />
              </Box>
              <Box flex="1">
                <Text fontSize="11px" color={c.muted} mb={1}>Aspect *</Text>
                <Input {...inputProps} size="sm" type="number" placeholder="55" value={customForm.aspect}
                  onChange={(e) => setCustomForm(f => ({ ...f, aspect: e.target.value }))} />
              </Box>
              <Box flex="1">
                <Text fontSize="11px" color={c.muted} mb={1}>Rim *</Text>
                <Input {...inputProps} size="sm" type="number" placeholder="16" value={customForm.rim}
                  onChange={(e) => setCustomForm(f => ({ ...f, rim: e.target.value }))} />
              </Box>
            </Flex>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Season *</Text>
              <select value={customForm.season} onChange={(e) => setCustomForm(f => ({ ...f, season: e.target.value }))}
                style={selectStyle}>
                <option value="summer">Summer</option>
                <option value="winter">Winter</option>
                <option value="allseason">All-Season</option>
              </select>
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Tier *</Text>
              <select value={customForm.tier} onChange={(e) => setCustomForm(f => ({ ...f, tier: e.target.value }))}
                style={selectStyle}>
                <option value="budget">Budget</option>
                <option value="mid">Mid</option>
                <option value="premium">Premium</option>
              </select>
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Speed Rating</Text>
              <Input {...inputProps} size="sm" placeholder="V" value={customForm.speedRating}
                onChange={(e) => setCustomForm(f => ({ ...f, speedRating: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Load Index</Text>
              <Input {...inputProps} size="sm" type="number" placeholder="91" value={customForm.loadIndex}
                onChange={(e) => setCustomForm(f => ({ ...f, loadIndex: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Your Price (£) *</Text>
              <Input {...inputProps} size="sm" type="number" step="0.01" placeholder="85" value={customForm.priceNew}
                onChange={(e) => setCustomForm(f => ({ ...f, priceNew: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Stock *</Text>
              <Input {...inputProps} size="sm" type="number" placeholder="4" value={customForm.stockNew}
                onChange={(e) => setCustomForm(f => ({ ...f, stockNew: e.target.value }))} />
            </Box>
            <Box>
              <Text fontSize="11px" color={c.muted} mb={1}>Ordered Stock</Text>
              <Input {...inputProps} size="sm" type="number" placeholder="0" value={customForm.stockOrdered}
                onChange={(e) => setCustomForm(f => ({ ...f, stockOrdered: e.target.value }))} />
            </Box>
            <Flex align="end" pb={1}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={customForm.isLocalStock}
                  onChange={(e) => setCustomForm(f => ({ ...f, isLocalStock: e.target.checked }))} />
                <Text fontSize="12px" color={c.muted}>Local Stock</Text>
              </label>
            </Flex>
          </Grid>
          <Flex gap={2} mt={4}>
            <Button bg={c.accent} color="white" onClick={handleCustomSubmit}
              disabled={customSaving || !customForm.brand || !customForm.pattern || !customForm.width || !customForm.priceNew}
              minH="40px" px={6}>
              {customSaving ? 'Creating…' : 'Create Tyre'}
            </Button>
            <Button variant="outline" borderColor={c.border} color={c.text}
              onClick={() => setShowCustomForm(false)} minH="40px">
              Cancel
            </Button>
          </Flex>
        </Box>
      )}

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
  const [stockOrdered, setStockOrdered] = useState(String(item.stockOrdered ?? 0));
  const [brand, setBrand] = useState(item.brand);
  const [sizeDisplay, setSizeDisplay] = useState(item.sizeDisplay);
  const [season, setSeason] = useState(item.season);
  const [isSaving, setIsSaving] = useState(false);
  const [showActivateForm, setShowActivateForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  async function hardDelete() {
    setIsSaving(true);
    setCardError(null);
    try {
      const res = await fetch(`/api/admin/catalogue/${item.catalogueId}/delete`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      onRefresh();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsSaving(false);
      setConfirmHardDelete(false);
    }
  }

  const tierColors: Record<string, { bg: string; color: string }> = {
    budget: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
    mid: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
    premium: { bg: 'rgba(249,115,22,0.15)', color: '#F97316' },
  };
  const tc = tierColors[item.tier] || tierColors.mid;

  async function activate() {
    setIsSaving(true);
    setCardError(null);
    try {
      const res = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogueId: item.catalogueId,
          priceNew: price ? Number(price) : null,
          stockNew: stock ? Number(stock) : 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to activate');
      }
      setShowActivateForm(false);
      onRefresh();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Failed to activate tyre. Please try again.');
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

  async function saveField(field: 'priceNew' | 'stockNew' | 'stockOrdered' | 'brand' | 'sizeDisplay' | 'season', value: string) {
    if (!item.productId) return;
    setCardError(null);
    let body: Record<string, unknown>;
    switch (field) {
      case 'priceNew': body = { priceNew: value ? Number(value) : null }; break;
      case 'stockOrdered': body = { stockOrdered: value ? Number(value) : 0 }; break;
      case 'stockNew': body = { stockNew: value ? Number(value) : 0 }; break;
      case 'brand': body = { brand: value }; break;
      case 'sizeDisplay': body = { sizeDisplay: value }; break;
      case 'season': body = { season: value }; break;
    }
    try {
      const res = await fetch(`/api/admin/inventory/${item.productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      onRefresh();
    } catch {
      setCardError('Failed to save. Please try again.');
      // Revert to server value
      if (field === 'priceNew') {
        setPrice(item.priceNew ? String(Number(item.priceNew).toFixed(2)) : '');
      } else if (field === 'stockOrdered') {
        setStockOrdered(String(item.stockOrdered ?? 0));
      } else if (field === 'brand') {
        setBrand(item.brand);
      } else if (field === 'sizeDisplay') {
        setSizeDisplay(item.sizeDisplay);
      } else if (field === 'season') {
        setSeason(item.season);
      } else {
        setStock(String(item.stockNew ?? 0));
      }
    }
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
              {cardError && <Text fontSize="12px" color="red.400">{cardError}</Text>}
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
        ) : confirmHardDelete ? (
          <Box mt={3} p={3} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.4)">
            <Text fontSize="sm" color={c.text} mb={2}>
              Permanently delete this tyre from the catalogue? This cannot be undone.
            </Text>
            {cardError && <Text fontSize="12px" color="red.400" mb={2}>{cardError}</Text>}
            <Flex gap={2}>
              <Button size="sm" bg="#E53E3E" color="white" onClick={hardDelete} disabled={isSaving} minH="36px">
                {isSaving ? 'Deleting…' : 'Confirm Delete'}
              </Button>
              <Button size="sm" variant="outline" borderColor={c.border} color={c.text}
                onClick={() => setConfirmHardDelete(false)} minH="36px">
                Cancel
              </Button>
            </Flex>
          </Box>
        ) : (
          <Flex justify="space-between" align="center" mt={3} pt={3} borderTopWidth="1px" borderColor={c.border}>
            <Text fontSize="12px" color={c.muted}>
              Suggested: £{item.suggestedPriceNew ? Number(item.suggestedPriceNew).toFixed(0) : '—'}
            </Text>
            <Flex gap={2}>
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
              <Box as="button" onClick={() => setConfirmHardDelete(true)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#F87171',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}>
                Delete
              </Box>
            </Flex>
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

      {/* Inline editable brand + size + season + price + stock */}
      {cardError && <Text fontSize="12px" color="red.400" mt={2}>{cardError}</Text>}
      <Flex gap={2} mt={3}>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Brand</Text>
          <Input
            size="sm"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            onBlur={() => saveField('brand', brand)}
            bg={c.surface} borderColor={c.border} color={c.text}
            fontSize="14px"
          />
        </Box>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Size</Text>
          <Input
            size="sm"
            value={sizeDisplay}
            onChange={(e) => setSizeDisplay(e.target.value)}
            onBlur={() => saveField('sizeDisplay', sizeDisplay)}
            bg={c.surface} borderColor={c.border} color={c.text}
            fontSize="14px"
          />
        </Box>
      </Flex>
      <Flex gap={2} mt={2}>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Season</Text>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              {...selectProps}
              value={season}
              height="32px"
              fontSize="14px"
              onChange={(e) => {
                setSeason(e.target.value);
                saveField('season', e.target.value);
              }}
            >
              <option value="summer">Summer</option>
              <option value="winter">Winter</option>
              <option value="allseason">All Season</option>
            </NativeSelect.Field>
          </NativeSelect.Root>
        </Box>
        <Box flex="1">
          <Text fontSize="11px" color={c.muted} mb={1}>Price (£)</Text>
          <Input
            size="sm" type="number" step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => saveField('priceNew', price)}
            bg={c.surface} borderColor={c.border} color={c.text}
            fontSize="14px"
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

      {/* Local vs Ordered stock indicators */}
      <Flex gap={3} align="center" mt={2}>
        <Box>
          <Text fontSize="10px" color={c.muted} fontFamily="Inter, sans-serif" letterSpacing="0.05em">LOCAL</Text>
          <Text fontFamily="var(--font-display)" fontSize="20px" color={c.accent}>{item.stockNew ?? 0}</Text>
          <Text fontSize="10px" color={c.muted} fontFamily="Inter, sans-serif">in stock</Text>
        </Box>
        <Box>
          <Text fontSize="10px" color={c.muted} fontFamily="Inter, sans-serif" letterSpacing="0.05em">ORDERED</Text>
          <Flex align="center" gap={1}>
            <Input
              size="sm" type="number"
              value={stockOrdered}
              onChange={(e) => setStockOrdered(e.target.value)}
              onBlur={() => saveField('stockOrdered', stockOrdered)}
              bg={c.surface} borderColor={c.border}
              color={Number(stockOrdered) > 0 ? '#22C55E' : c.muted}
              w="50px" fontSize="14px" fontFamily="var(--font-display)"
            />
          </Flex>
          <Text fontSize="10px" color={c.muted} fontFamily="Inter, sans-serif">arriving</Text>
        </Box>
      </Flex>

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
      ) : confirmHardDelete ? (
        <Box mt={3} p={3} bg={c.surface} borderRadius="md" borderWidth="1px" borderColor="rgba(239,68,68,0.4)">
          <Text fontSize="sm" color={c.text} mb={2}>
            Permanently delete this tyre from the catalogue? This cannot be undone.
          </Text>
          {cardError && <Text fontSize="12px" color="red.400" mb={2}>{cardError}</Text>}
          <Flex gap={2}>
            <Button size="sm" bg="#E53E3E" color="white" onClick={hardDelete} disabled={isSaving} minH="36px">
              {isSaving ? 'Deleting…' : 'Confirm Delete'}
            </Button>
            <Button size="sm" variant="outline" borderColor={c.border} color={c.text}
              onClick={() => setConfirmHardDelete(false)} minH="36px">
              Cancel
            </Button>
          </Flex>
        </Box>
      ) : (
        <Flex mt={3} pt={3} borderTopWidth="1px" borderColor={c.border} gap={2}>
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
          <Box as="button"
            onClick={() => setConfirmHardDelete(true)}
            style={{
              color: '#F87171',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background: 'transparent',
            }}>
            Delete
          </Box>
        </Flex>
      )}
    </Box>
  );
}
