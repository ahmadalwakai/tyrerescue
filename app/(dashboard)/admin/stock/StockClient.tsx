'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Heading, Text, VStack, HStack, Button, Input, Flex, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

/* ─── Constants ─────────────────────────────────────────── */
const WIDTHS = [155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285];
const RIMS = [10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

/* ─── Types ─────────────────────────────────────────────── */
interface StockItem {
  id: string;
  catalogueId: string | null;
  brand: string;
  pattern: string;
  width: number;
  aspect: number;
  rim: number;
  sizeDisplay: string;
  season: string;
  priceNew: number | null;
  stockNew: number;
  stockOrdered: number;
  isLocalStock: boolean;
  availableNew: boolean;
  featured: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  totalStock: number;
}

type ImportPhase = 'idle' | 'uploading' | 'parsing' | 'validating' | 'importing' | 'completed' | 'failed';

interface ImportSummary {
  totalRows: number;
  inserted: number;
  skippedDbDuplicates: number;
  skippedFileDuplicates: number;
  invalidRows: number;
  errors: number;
}

interface ImportResult {
  success: boolean;
  summary: ImportSummary;
  duplicateSizes: { existingInDb: string[]; duplicatesInFile: string[] };
  invalidRows: { row: number; raw: string; reason: string }[];
  errors: string[];
}

/* ─── Component ─────────────────────────────────────────── */
export function StockClient() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, inactive: 0, totalStock: 0 });
  const [isLoading, setIsLoading] = useState(true);

  /* Filters */
  const [search, setSearch] = useState('');
  const [filterWidth, setFilterWidth] = useState('');
  const [filterRim, setFilterRim] = useState('');
  const [filterAvailable, setFilterAvailable] = useState('all');
  const [sort, setSort] = useState('size');

  /* Edit state */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ priceNew: '', stockNew: '', stockOrdered: '' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* Add form state */
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ sizeRaw: '', stockNew: '0', priceNew: '' });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  /* Import state */
  const [showImport, setShowImport] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Remove confirm state */
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(null);

  /* ─── Data fetch ────────────────────────────────────────── */
  const fetchItems = useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('sort', sort);
      if (search) params.set('search', search);
      if (filterWidth) params.set('width', filterWidth);
      if (filterRim) params.set('rim', filterRim);
      if (filterAvailable !== 'all') params.set('available', filterAvailable);
      const res = await fetch(`/api/admin/stock?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
      setStats(data.stats || { total: 0, active: 0, inactive: 0, totalStock: 0 });
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, filterWidth, filterRim, filterAvailable, sort]);

  useEffect(() => { fetchItems(1); }, [fetchItems]);

  /* ─── Inline PATCH helpers ──────────────────────────────── */
  const startEdit = (item: StockItem) => {
    setEditingId(item.id);
    setEditForm({
      priceNew: item.priceNew != null ? String(item.priceNew) : '',
      stockNew: String(item.stockNew),
      stockOrdered: String(item.stockOrdered),
    });
  };
  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/inventory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceNew: editForm.priceNew ? Number(editForm.priceNew) : null,
          stockNew: parseInt(editForm.stockNew, 10) || 0,
          stockOrdered: parseInt(editForm.stockOrdered, 10) || 0,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setEditingId(null);
      flash('Saved', true);
      fetchItems(page);
    } catch {
      flash('Save failed', false);
    } finally {
      setSavingId(null);
    }
  };

  /* ─── Toggle availability ───────────────────────────────── */
  const toggleAvailable = async (item: StockItem) => {
    setSavingId(item.id);
    try {
      const res = await fetch(`/api/admin/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availableNew: !item.availableNew }),
      });
      if (!res.ok) throw new Error();
      flash(item.availableNew ? 'Deactivated' : 'Activated', true);
      fetchItems(page);
    } catch {
      flash('Failed to toggle', false);
    } finally {
      setSavingId(null);
    }
  };

  /* ─── Delete (with inline confirm) ─────────────────────── */
  const confirmRemove = (id: string, label: string) => {
    setRemoveTarget({ id, label });
  };

  const executeRemove = async () => {
    if (!removeTarget) return;
    const { id } = removeTarget;
    setRemoveTarget(null);
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      flash('Removed', true);
      fetchItems(page);
    } catch {
      flash('Delete failed', false);
    } finally {
      setSavingId(null);
    }
  };

  /* ─── Add product ───────────────────────────────────────── */
  const parseSizeInput = (raw: string) => {
    const s = raw.trim().toUpperCase();
    const m = s.match(/^(\d+)\/(?:(\d+)\/)?R(\d+)(C?)$/);
    if (!m) return null;
    const width = Number(m[1]);
    const aspect = m[2] ? Number(m[2]) : 0;
    const rim = Number(m[3]);
    const isCommercial = m[4] === 'C';
    if (width < 100 || width > 400 || rim < 10 || rim > 26) return null;
    const rimStr = `R${rim}${isCommercial ? 'C' : ''}`;
    const sizeDisplay = aspect > 0 ? `${width}/${aspect}/${rimStr}` : `${width}/${rimStr}`;
    return { sizeDisplay, width, aspect, rim, isCommercial };
  };

  const handleAdd = async () => {
    setAddError('');
    const parsed = parseSizeInput(addForm.sizeRaw);
    if (!parsed) {
      setAddError('Invalid size. Use format like 205/55/R16 or 195/75/R16C');
      return;
    }
    const stockNew = parseInt(addForm.stockNew, 10);
    if (isNaN(stockNew) || stockNew < 0) {
      setAddError('Stock must be 0 or more');
      return;
    }

    setAddSaving(true);
    try {
      const res = await fetch('/api/admin/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          stockNew,
          priceNew: addForm.priceNew ? Number(addForm.priceNew) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(typeof data.error === 'string' ? data.error : 'Failed to add');
        return;
      }
      setShowAddForm(false);
      setAddForm({ sizeRaw: '', stockNew: '0', priceNew: '' });
      flash('Added successfully', true);
      fetchItems(1);
    } catch {
      setAddError('Network error');
    } finally {
      setAddSaving(false);
    }
  };

  /* ─── Import pipeline ───────────────────────────────────── */
  const handleImport = async (file: File) => {
    setImportResult(null);
    setImportError('');
    setImportPhase('uploading');

    try {
      // Simulate stage progression for UX
      await new Promise(r => setTimeout(r, 200));
      setImportPhase('parsing');

      const formData = new FormData();
      formData.append('file', file);

      setImportPhase('validating');
      await new Promise(r => setTimeout(r, 200));
      setImportPhase('importing');

      const res = await fetch('/api/admin/stock/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setImportPhase('failed');
        setImportError(typeof data.error === 'string' ? data.error : 'Import failed');
        return;
      }

      setImportResult(data as ImportResult);
      setImportPhase('completed');
      fetchItems(1);
    } catch {
      setImportPhase('failed');
      setImportError('Network error during import');
    }
  };

  const resetImport = () => {
    setShowImport(false);
    setImportPhase('idle');
    setImportResult(null);
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ─── Toast helper ──────────────────────────────────────── */
  const flash = (text: string, ok: boolean) => {
    setToastMsg({ text, ok });
    setTimeout(() => setToastMsg(null), 2500);
  };

  /* ─── Shared styles ─────────────────────────────────────── */
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
  const toggleBtn = (active: boolean): React.CSSProperties => ({
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
  const phaseLabels: Record<ImportPhase, string> = {
    idle: '', uploading: 'Uploading file…', parsing: 'Parsing rows…',
    validating: 'Validating sizes…', importing: 'Importing to database…',
    completed: 'Import completed', failed: 'Import failed',
  };
  const isImporting = importPhase !== 'idle' && importPhase !== 'completed' && importPhase !== 'failed';

  /* ─── Render ────────────────────────────────────────────── */
  return (
    <VStack align="stretch" gap={6}>
      {/* Header + Action buttons */}
      <Flex align="center" justify="space-between" wrap="wrap" gap={3} style={anim.fadeUp('0.5s')}>
        <Box>
          <Heading size="lg" color={c.text} fontFamily="var(--font-display)" letterSpacing="0.02em">
            Current Stock
          </Heading>
          <Text color={c.muted} mt={1} fontSize="sm">
            Manage your live tyre inventory — edit prices, adjust stock levels, toggle availability.
          </Text>
        </Box>
        <HStack gap={2}>
          <Button
            bg={c.accent} color="white" h="38px" px={4}
            fontFamily="var(--font-display)" fontSize="13px"
            onClick={() => { setShowAddForm(true); setAddError(''); }}
            disabled={showAddForm}
          >
            + Add Size
          </Button>
          <Button
            bg="transparent" color={c.text} h="38px" px={4}
            borderWidth="1px" borderColor={c.border}
            fontFamily="var(--font-display)" fontSize="13px"
            _hover={{ bg: c.surface }}
            onClick={() => setShowImport(true)}
            disabled={showImport}
          >
            Import File
          </Button>
        </HStack>
      </Flex>

      {/* ─── Add Form Panel ────────────────────────────────── */}
      {showAddForm && (
        <Box bg={c.surface} p={5} borderRadius="8px" borderWidth="1px" borderColor={c.accent}
          style={anim.fadeUp('0.3s')}>
          <Text fontSize="14px" fontWeight="600" color={c.text} mb={3}>Add New Tyre Size</Text>
          <Flex gap={3} wrap="wrap" align="end">
            <Box flex="1" minW="160px">
              <Text fontSize="11px" color={c.muted} mb={1}>Size (e.g. 205/55/R16)</Text>
              <Input {...inputProps} size="sm"
                placeholder="205/55/R16"
                value={addForm.sizeRaw}
                onChange={(e) => setAddForm(f => ({ ...f, sizeRaw: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !addSaving) handleAdd(); }}
              />
            </Box>
            <Box minW="90px">
              <Text fontSize="11px" color={c.muted} mb={1}>Stock</Text>
              <Input {...inputProps} size="sm" type="number" w="80px"
                value={addForm.stockNew}
                onChange={(e) => setAddForm(f => ({ ...f, stockNew: e.target.value }))}
              />
            </Box>
            <Box minW="100px">
              <Text fontSize="11px" color={c.muted} mb={1}>Price (£, optional)</Text>
              <Input {...inputProps} size="sm" type="number" step="0.01" w="90px"
                placeholder="Auto"
                value={addForm.priceNew}
                onChange={(e) => setAddForm(f => ({ ...f, priceNew: e.target.value }))}
              />
            </Box>
            <HStack gap={2}>
              <Button bg={c.accent} color="white" h="38px" px={4} fontSize="13px"
                fontFamily="var(--font-display)"
                onClick={handleAdd} disabled={addSaving}>
                {addSaving ? <Spinner size="sm" /> : 'Save'}
              </Button>
              <Button bg="transparent" color={c.muted} h="38px" px={4} fontSize="13px"
                borderWidth="1px" borderColor={c.border}
                onClick={() => { setShowAddForm(false); setAddError(''); }}
                disabled={addSaving}>
                Cancel
              </Button>
            </HStack>
          </Flex>
          {addError && (
            <Box mt={3} p={3} borderRadius="6px"
              bg="rgba(239,68,68,0.1)" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
              <Text fontSize="12px" color="#EF4444">{addError}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* ─── Import Panel ──────────────────────────────────── */}
      {showImport && (
        <Box bg={c.surface} p={5} borderRadius="8px" borderWidth="1px" borderColor={c.border}
          style={anim.fadeUp('0.3s')}>
          <Flex justify="space-between" align="center" mb={3}>
            <Text fontSize="14px" fontWeight="600" color={c.text}>Import Stock File</Text>
            <button
              style={{ ...toggleBtn(false), fontSize: 11, padding: '4px 10px' }}
              onClick={resetImport}>
              Close
            </button>
          </Flex>
          <Text fontSize="12px" color={c.muted} mb={3}>
            Upload a CSV, TSV, or Excel file. Format: tyre size, quantity — one per row.
            Example: <code style={{ color: c.accent }}>205/55/R16, 4</code>
          </Text>

          {/* File input */}
          {importPhase === 'idle' && (
            <Flex gap={3} align="center">
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                style={{
                  color: c.text, fontSize: 13, background: c.card,
                  border: `1px solid ${c.border}`, borderRadius: 6, padding: '8px 12px',
                  maxWidth: 360,
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                }}
              />
            </Flex>
          )}

          {/* Progress indicator */}
          {isImporting && (
            <Box mt={3}>
              <Flex align="center" gap={3} mb={2}>
                <Spinner size="sm" color={c.accent} />
                <Text fontSize="13px" color={c.text}>{phaseLabels[importPhase]}</Text>
              </Flex>
              <Box w="100%" h="4px" bg={c.card} borderRadius="2px" overflow="hidden">
                <Box
                  h="100%" bg={c.accent} borderRadius="2px"
                  transition="width 0.4s ease"
                  style={{
                    width: importPhase === 'uploading' ? '15%'
                      : importPhase === 'parsing' ? '35%'
                      : importPhase === 'validating' ? '60%'
                      : '90%',
                  }}
                />
              </Box>
            </Box>
          )}

          {/* Error */}
          {importPhase === 'failed' && importError && (
            <Box mt={3} p={3} borderRadius="6px"
              bg="rgba(239,68,68,0.1)" borderWidth="1px" borderColor="rgba(239,68,68,0.3)">
              <Text fontSize="13px" color="#EF4444" fontWeight="600">Import Failed</Text>
              <Text fontSize="12px" color="#EF4444" mt={1}>{importError}</Text>
              <Button mt={2} size="sm" bg="transparent" color={c.muted}
                borderWidth="1px" borderColor={c.border}
                onClick={() => { setImportPhase('idle'); setImportError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                Try Again
              </Button>
            </Box>
          )}

          {/* Success + Report */}
          {importPhase === 'completed' && importResult && (
            <Box mt={3}>
              {/* Progress bar — full */}
              <Box w="100%" h="4px" bg={c.card} borderRadius="2px" overflow="hidden" mb={3}>
                <Box h="100%" w="100%" bg="#22C55E" borderRadius="2px" />
              </Box>

              {/* Summary */}
              <Box p={4} borderRadius="6px" bg="rgba(34,197,94,0.08)" borderWidth="1px" borderColor="rgba(34,197,94,0.25)">
                <Text fontSize="13px" color="#22C55E" fontWeight="600" mb={2}>Import Complete</Text>
                <Flex gap={4} wrap="wrap">
                  <StatBadge label="Total Rows" value={importResult.summary.totalRows} color={c.text} />
                  <StatBadge label="Inserted" value={importResult.summary.inserted} color="#22C55E" />
                  <StatBadge label="DB Duplicates" value={importResult.summary.skippedDbDuplicates}
                    color={importResult.summary.skippedDbDuplicates > 0 ? '#F59E0B' : c.muted} />
                  <StatBadge label="File Duplicates" value={importResult.summary.skippedFileDuplicates}
                    color={importResult.summary.skippedFileDuplicates > 0 ? '#F59E0B' : c.muted} />
                  <StatBadge label="Invalid Rows" value={importResult.summary.invalidRows}
                    color={importResult.summary.invalidRows > 0 ? '#EF4444' : c.muted} />
                  <StatBadge label="Errors" value={importResult.summary.errors}
                    color={importResult.summary.errors > 0 ? '#EF4444' : c.muted} />
                </Flex>
              </Box>

              {/* Duplicate warnings */}
              {(importResult.duplicateSizes.existingInDb.length > 0 ||
                importResult.duplicateSizes.duplicatesInFile.length > 0) && (
                <Box mt={3} p={4} borderRadius="6px" bg="rgba(245,158,11,0.08)"
                  borderWidth="1px" borderColor="rgba(245,158,11,0.25)">
                  <Text fontSize="13px" color="#F59E0B" fontWeight="600" mb={2}>
                    Duplicate Sizes Skipped
                  </Text>
                  {importResult.duplicateSizes.existingInDb.length > 0 && (
                    <Box mb={2}>
                      <Text fontSize="11px" color={c.muted} mb={1}>Already in database:</Text>
                      <Text fontSize="12px" color={c.text} style={{ wordBreak: 'break-all' }}>
                        {importResult.duplicateSizes.existingInDb.join(', ')}
                      </Text>
                    </Box>
                  )}
                  {importResult.duplicateSizes.duplicatesInFile.length > 0 && (
                    <Box>
                      <Text fontSize="11px" color={c.muted} mb={1}>Repeated in file:</Text>
                      <Text fontSize="12px" color={c.text} style={{ wordBreak: 'break-all' }}>
                        {importResult.duplicateSizes.duplicatesInFile.join(', ')}
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              {/* Invalid rows */}
              {importResult.invalidRows.length > 0 && (
                <Box mt={3} p={4} borderRadius="6px" bg="rgba(239,68,68,0.08)"
                  borderWidth="1px" borderColor="rgba(239,68,68,0.25)">
                  <Text fontSize="13px" color="#EF4444" fontWeight="600" mb={2}>
                    Invalid Rows ({importResult.invalidRows.length})
                  </Text>
                  {importResult.invalidRows.slice(0, 10).map((r, i) => (
                    <Text key={i} fontSize="12px" color={c.muted}>
                      Row {r.row}: &ldquo;{r.raw}&rdquo; — {r.reason}
                    </Text>
                  ))}
                  {importResult.invalidRows.length > 10 && (
                    <Text fontSize="11px" color={c.muted} mt={1}>
                      …and {importResult.invalidRows.length - 10} more
                    </Text>
                  )}
                </Box>
              )}

              <Button mt={3} size="sm" bg="transparent" color={c.muted}
                borderWidth="1px" borderColor={c.border}
                onClick={resetImport}>
                Done
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* ─── Remove Confirmation ───────────────────────────── */}
      {removeTarget && (
        <Box p={4} borderRadius="8px" bg="rgba(239,68,68,0.08)" borderWidth="1px"
          borderColor="rgba(239,68,68,0.3)">
          <Text fontSize="13px" color="#EF4444" fontWeight="600" mb={2}>
            Remove &ldquo;{removeTarget.label}&rdquo; from stock?
          </Text>
          <Text fontSize="12px" color={c.muted} mb={3}>
            This permanently deletes the product. Customers will no longer see it in the booking flow.
          </Text>
          <HStack gap={2}>
            <Button size="sm" bg="#EF4444" color="white" fontSize="12px"
              onClick={executeRemove}>
              Confirm Remove
            </Button>
            <Button size="sm" bg="transparent" color={c.muted} fontSize="12px"
              borderWidth="1px" borderColor={c.border}
              onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
          </HStack>
        </Box>
      )}

      {/* Stats row */}
      <Flex gap={3} wrap="wrap" style={anim.fadeUp('0.5s', '0.05s')}>
        {[
          { label: 'Total Products', value: stats.total, color: c.text },
          { label: 'Active', value: stats.active, color: '#22C55E' },
          { label: 'Inactive', value: stats.inactive, color: '#EF4444' },
          { label: 'Total Units', value: stats.totalStock, color: c.accent },
        ].map((s) => (
          <Box key={s.label} bg={c.surface} borderWidth="1px" borderColor={c.border}
            borderRadius="8px" p={4} minW="140px" flex="1">
            <Text fontSize="11px" color={c.muted} textTransform="uppercase" letterSpacing="0.05em">
              {s.label}
            </Text>
            <Text fontSize="24px" fontWeight="700" color={s.color} fontFamily="var(--font-display)">
              {s.value.toLocaleString()}
            </Text>
          </Box>
        ))}
      </Flex>

      {/* Filters */}
      <Box bg={c.surface} p={4} borderRadius="8px" borderWidth="1px" borderColor={c.border}
        style={anim.fadeUp('0.5s', '0.1s')}>
        <Flex gap={3} wrap="wrap" align="end">
          <Box flex="1" minW="180px">
            <Text fontSize="11px" color={c.muted} mb={1}>Search</Text>
            <Input {...inputProps} size="sm" placeholder="Brand, pattern, size…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fetchItems(1); }} />
          </Box>
          <Box minW="100px">
            <Text fontSize="11px" color={c.muted} mb={1}>Width</Text>
            <select style={selectStyle} value={filterWidth}
              onChange={(e) => { setFilterWidth(e.target.value); }}>
              <option value="">All</option>
              {WIDTHS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Box>
          <Box minW="90px">
            <Text fontSize="11px" color={c.muted} mb={1}>Rim</Text>
            <select style={selectStyle} value={filterRim}
              onChange={(e) => { setFilterRim(e.target.value); }}>
              <option value="">All</option>
              {RIMS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Box>
          <Box minW="110px">
            <Text fontSize="11px" color={c.muted} mb={1}>Status</Text>
            <Flex gap={1}>
              {(['all', 'true', 'false'] as const).map((v) => (
                <button key={v} style={toggleBtn(filterAvailable === v)}
                  onClick={() => setFilterAvailable(v)}>
                  {v === 'all' ? 'All' : v === 'true' ? 'Active' : 'Inactive'}
                </button>
              ))}
            </Flex>
          </Box>
          <Box minW="110px">
            <Text fontSize="11px" color={c.muted} mb={1}>Sort</Text>
            <select style={selectStyle} value={sort}
              onChange={(e) => setSort(e.target.value)}>
              <option value="size">Size</option>
              <option value="stock">Stock (high&#8594;low)</option>
              <option value="price">Price (low&#8594;high)</option>
            </select>
          </Box>
          <Button bg={c.accent} color="white" h="40px" px={5}
            fontFamily="var(--font-display)" fontSize="14px"
            onClick={() => fetchItems(1)}>
            SEARCH
          </Button>
        </Flex>
      </Box>

      {/* Toast */}
      {toastMsg && (
        <Box p={3} borderRadius="8px" textAlign="center"
          bg={toastMsg.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}
          borderWidth="1px"
          borderColor={toastMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}>
          <Text fontSize="13px" color={toastMsg.ok ? '#22C55E' : '#EF4444'}>
            {toastMsg.text}
          </Text>
        </Box>
      )}

      {/* Loading */}
      {isLoading && (
        <Flex justify="center" py={12}><Spinner size="lg" color={c.accent} /></Flex>
      )}

      {/* Table */}
      {!isLoading && items.length === 0 && (
        <Box py={12} textAlign="center">
          <Text color={c.muted}>No products found. Use &ldquo;Add Size&rdquo; or &ldquo;Import File&rdquo; to add stock.</Text>
        </Box>
      )}

      {!isLoading && items.length > 0 && (
        <Box overflowX="auto" borderRadius="8px" borderWidth="1px" borderColor={c.border}
          style={anim.fadeUp('0.5s', '0.15s')}>
          <Box as="table" w="100%" style={{ borderCollapse: 'collapse' }}>
            <Box as="thead">
              <Box as="tr" bg={c.surface}>
                {['Brand', 'Size', 'Season', 'Price', 'Stock', 'Ordered', 'Local', 'Status', 'Actions'].map((h) => (
                  <Box key={h} as="th" p={3} textAlign="left" fontSize="11px"
                    color={c.muted} textTransform="uppercase" letterSpacing="0.05em"
                    borderBottomWidth="1px" borderColor={c.border}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                const isBusy = savingId === item.id;
                return (
                  <Box key={item.id} as="tr"
                    bg={item.availableNew ? 'transparent' : 'rgba(239,68,68,0.04)'}
                    _hover={{ bg: c.surface }}
                    transition="background 0.15s">
                    {/* Brand */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Text fontSize="13px" color={c.text} fontWeight="600">{item.brand}</Text>
                      <Text fontSize="11px" color={c.muted}>{item.pattern}</Text>
                    </Box>
                    {/* Size */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Text fontSize="13px" color={c.text} fontWeight="500">{item.sizeDisplay}</Text>
                    </Box>
                    {/* Season */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Text fontSize="12px" color={c.muted} textTransform="capitalize">{item.season}</Text>
                    </Box>
                    {/* Price */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border} minW="90px">
                      {isEditing ? (
                        <Input {...inputProps} size="sm" w="80px" type="number" step="0.01"
                          value={editForm.priceNew}
                          onChange={(e) => setEditForm((f) => ({ ...f, priceNew: e.target.value }))} />
                      ) : (
                        <Text fontSize="13px" color={c.accent} fontWeight="600">
                          {item.priceNew != null ? `£${item.priceNew.toFixed(2)}` : '—'}
                        </Text>
                      )}
                    </Box>
                    {/* Stock */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border} minW="70px">
                      {isEditing ? (
                        <Input {...inputProps} size="sm" w="60px" type="number"
                          value={editForm.stockNew}
                          onChange={(e) => setEditForm((f) => ({ ...f, stockNew: e.target.value }))} />
                      ) : (
                        <Text fontSize="13px" fontWeight="600"
                          color={item.stockNew > 0 ? '#22C55E' : '#EF4444'}>
                          {item.stockNew}
                        </Text>
                      )}
                    </Box>
                    {/* Ordered */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border} minW="70px">
                      {isEditing ? (
                        <Input {...inputProps} size="sm" w="60px" type="number"
                          value={editForm.stockOrdered}
                          onChange={(e) => setEditForm((f) => ({ ...f, stockOrdered: e.target.value }))} />
                      ) : (
                        <Text fontSize="13px" color={c.muted}>{item.stockOrdered}</Text>
                      )}
                    </Box>
                    {/* Local */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Box w="8px" h="8px" borderRadius="full"
                        bg={item.isLocalStock ? '#22C55E' : c.border} />
                    </Box>
                    {/* Status */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Box as="span" px={2} py={1} borderRadius="4px" fontSize="11px" fontWeight="600"
                        bg={item.availableNew ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}
                        color={item.availableNew ? '#22C55E' : '#EF4444'}>
                        {item.availableNew ? 'Active' : 'Inactive'}
                      </Box>
                    </Box>
                    {/* Actions */}
                    <Box as="td" p={3} borderBottomWidth="1px" borderColor={c.border}>
                      <Flex gap={2} wrap="wrap">
                        {isEditing ? (
                          <>
                            <button
                              style={{ ...toggleBtn(true), fontSize: 11, padding: '4px 10px' }}
                              onClick={() => saveEdit(item.id)}
                              disabled={isBusy}>
                              {isBusy ? '…' : 'Save'}
                            </button>
                            <button
                              style={{ ...toggleBtn(false), fontSize: 11, padding: '4px 10px' }}
                              onClick={cancelEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              style={{ ...toggleBtn(false), fontSize: 11, padding: '4px 10px' }}
                              onClick={() => startEdit(item)}>
                              Edit
                            </button>
                            <button
                              style={{
                                ...toggleBtn(false), fontSize: 11, padding: '4px 10px',
                                borderColor: item.availableNew ? '#EF4444' : '#22C55E',
                                color: item.availableNew ? '#EF4444' : '#22C55E',
                              }}
                              onClick={() => toggleAvailable(item)}
                              disabled={isBusy}>
                              {item.availableNew ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              style={{
                                ...toggleBtn(false), fontSize: 11, padding: '4px 10px',
                                borderColor: '#EF4444', color: '#EF4444',
                              }}
                              onClick={() => confirmRemove(item.id, `${item.brand} ${item.sizeDisplay}`)}
                              disabled={isBusy}>
                              Remove
                            </button>
                          </>
                        )}
                      </Flex>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="center" align="center" gap={3} pt={2}>
          <Button size="sm" variant="outline" onClick={() => fetchItems(page - 1)}
            disabled={page <= 1}>
            ← Prev
          </Button>
          <Text fontSize="13px" color={c.muted}>
            Page {page} of {totalPages} ({totalCount} items)
          </Text>
          <Button size="sm" variant="outline" onClick={() => fetchItems(page + 1)}
            disabled={page >= totalPages}>
            Next →
          </Button>
        </Flex>
      )}
    </VStack>
  );
}

/* ─── Small helper component ──────────────────────────── */
function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box>
      <Text fontSize="11px" color={c.muted}>{label}</Text>
      <Text fontSize="16px" fontWeight="700" color={color}>{value}</Text>
    </Box>
  );
}
