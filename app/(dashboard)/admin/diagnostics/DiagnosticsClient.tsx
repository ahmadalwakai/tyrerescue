'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Heading, Text, VStack, HStack, SimpleGrid, Button, Flex, Spinner, Table,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';
import type { StockIssue, StockIssueType, DiagnosticsSummary } from '@/lib/inventory/stock-domain';

/* ─── Types ─────────────────────────────────────────────── */

interface Movement {
  id: string;
  tyreId: string | null;
  movementType: string | null;
  quantityDelta: number;
  stockAfter: number;
  note: string | null;
  createdAt: string | null;
}

interface DiagnosticsData extends DiagnosticsSummary {
  recentMovements: Movement[];
  counts: { products: number; reservations: number; catalogueItems: number };
}

type SeverityFilter = 'all' | 'error' | 'warning' | 'info';
type IssueTypeFilter = 'all' | StockIssueType;

/* ─── Helpers ───────────────────────────────────────────── */

const severityColors: Record<string, { bg: string; text: string }> = {
  error: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  warning: { bg: 'rgba(234,179,8,0.15)', text: '#EAB308' },
  info: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
};

function issueTypeLabel(t: StockIssueType): string {
  const labels: Record<StockIssueType, string> = {
    'negative-stock': 'Negative Stock',
    'nan-stock': 'NaN Stock',
    'null-price-available': 'No Price (Available)',
    'zero-stock-available': 'Zero Stock (Available)',
    'overcommitted': 'Overcommitted',
    'missing-catalogue': 'Missing Catalogue',
    'orphan-product': 'Orphan Product',
    'duplicate-size-brand': 'Duplicate Size+Brand',
    'invalid-size-format': 'Invalid Size',
    'stale-reservation': 'Stale Reservation',
    'unreleased-expired': 'Unreleased Expired',
    'price-without-stock': 'Price Without Stock',
  };
  return labels[t] ?? t;
}

/* ─── Component ─────────────────────────────────────────── */

export function DiagnosticsClient() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [typeFilter, setTypeFilter] = useState<IssueTypeFilter>('all');
  const [tab, setTab] = useState<'issues' | 'movements'>('issues');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/diagnostics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Flex justify="center" align="center" minH="200px">
        <Spinner color={c.accent} size="lg" />
      </Flex>
    );
  }

  if (error || !data) {
    return (
      <VStack align="stretch" gap={4}>
        <Heading size="lg" color={c.text}>Stock Diagnostics</Heading>
        <Box bg="rgba(239,68,68,0.1)" border="1px solid" borderColor="#EF4444" borderRadius="md" p={4}>
          <Text color="#EF4444">{error || 'No data'}</Text>
        </Box>
        <Button onClick={load} bg={c.accent} color="white" _hover={{ bg: c.accentHover }} alignSelf="start">
          Retry
        </Button>
      </VStack>
    );
  }

  /* ── Filter issues ─────────────────────────────────────── */

  const filteredIssues = data.issues.filter(i => {
    if (severityFilter !== 'all' && i.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && i.type !== typeFilter) return false;
    return true;
  });

  const issueTypes = [...new Set(data.issues.map(i => i.type))];
  const errorCount = data.issues.filter(i => i.severity === 'error').length;
  const warningCount = data.issues.filter(i => i.severity === 'warning').length;

  return (
    <VStack align="stretch" gap={6} style={anim.fadeUp()}>
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3}>
        <Box>
          <Heading size="lg" color={c.text}>Stock Diagnostics</Heading>
          <Text color={c.muted} mt={1}>
            Scanned {data.totalProducts} products at {new Date(data.checkedAt).toLocaleString()}
          </Text>
        </Box>
        <Button onClick={load} bg={c.accent} color="white" _hover={{ bg: c.accentHover }} size="sm">
          Re-scan
        </Button>
      </Flex>

      {/* Summary cards */}
      <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} gap={3}>
        <StatCard label="Total Products" value={data.totalProducts} />
        <StatCard label="Physical Stock" value={data.totalPhysicalStock} />
        <StatCard label="Reserved" value={data.totalReservedStock} color={data.totalReservedStock > 0 ? '#3B82F6' : undefined} />
        <StatCard label="Available" value={data.totalAvailableStock} color="#22C55E" />
        <StatCard label="Low Stock" value={data.lowStock} color={data.lowStock > 0 ? '#EAB308' : undefined} />
        <StatCard label="Issues" value={data.withIssues} color={data.withIssues > 0 ? '#EF4444' : undefined} />
      </SimpleGrid>

      {/* Level breakdown */}
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        <LevelCard label="In Stock" value={data.inStock} color="#22C55E" />
        <LevelCard label="Low Stock" value={data.lowStock} color="#EAB308" />
        <LevelCard label="Out of Stock" value={data.outOfStock} color="#A1A1AA" />
        <LevelCard label="Overcommitted" value={data.overcommitted} color="#EF4444" />
      </SimpleGrid>

      {/* Alert banner */}
      {errorCount > 0 && (
        <Box bg="rgba(239,68,68,0.1)" border="1px solid" borderColor="#EF4444" borderRadius="md" p={4}>
          <Text color="#EF4444" fontWeight="600">
            {errorCount} error{errorCount !== 1 ? 's' : ''} and {warningCount} warning{warningCount !== 1 ? 's' : ''} detected
          </Text>
          <Text color={c.muted} fontSize="sm" mt={1}>
            Review the issues below to resolve data integrity problems.
          </Text>
        </Box>
      )}

      {/* Tab buttons */}
      <HStack gap={2}>
        <TabBtn active={tab === 'issues'} onClick={() => setTab('issues')}>
          Issues ({data.issues.length})
        </TabBtn>
        <TabBtn active={tab === 'movements'} onClick={() => setTab('movements')}>
          Recent Movements ({data.recentMovements.length})
        </TabBtn>
      </HStack>

      {tab === 'issues' ? (
        <IssuesPanel
          issues={filteredIssues}
          issueTypes={issueTypes}
          severityFilter={severityFilter}
          typeFilter={typeFilter}
          onSeverityChange={setSeverityFilter}
          onTypeChange={setTypeFilter}
          duplicates={data.duplicates}
        />
      ) : (
        <MovementsPanel movements={data.recentMovements} />
      )}
    </VStack>
  );
}

/* ─── Sub-components ────────────────────────────────────── */

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Box bg={c.surface} border="1px solid" borderColor={c.border} borderRadius="md" p={4}>
      <Text color={c.muted} fontSize="xs" fontWeight="500">{label}</Text>
      <Text color={color ?? c.text} fontSize="2xl" fontWeight="700" mt={1}>{value}</Text>
    </Box>
  );
}

function LevelCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box bg={c.surface} border="1px solid" borderColor={c.border} borderRadius="md" p={3}>
      <HStack justify="space-between">
        <Text color={c.muted} fontSize="sm">{label}</Text>
        <Text color={color} fontWeight="700" fontSize="lg">{value}</Text>
      </HStack>
    </Box>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      size="sm"
      bg={active ? c.accent : c.card}
      color={active ? 'white' : c.muted}
      _hover={{ bg: active ? c.accentHover : c.border }}
      borderRadius="md"
    >
      {children}
    </Button>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      size="xs"
      bg={active ? c.accent : 'transparent'}
      color={active ? 'white' : c.muted}
      border="1px solid"
      borderColor={active ? c.accent : c.border}
      _hover={{ bg: active ? c.accentHover : c.card }}
      borderRadius="md"
    >
      {children}
    </Button>
  );
}

/* ─── Issues Panel ──────────────────────────────────────── */

function IssuesPanel({
  issues,
  issueTypes,
  severityFilter,
  typeFilter,
  onSeverityChange,
  onTypeChange,
  duplicates,
}: {
  issues: StockIssue[];
  issueTypes: StockIssueType[];
  severityFilter: SeverityFilter;
  typeFilter: IssueTypeFilter;
  onSeverityChange: (v: SeverityFilter) => void;
  onTypeChange: (v: IssueTypeFilter) => void;
  duplicates: DiagnosticsSummary['duplicates'];
}) {
  return (
    <VStack align="stretch" gap={4}>
      {/* Severity filters */}
      <HStack gap={2} wrap="wrap">
        <Text color={c.muted} fontSize="xs" fontWeight="500">Severity:</Text>
        {(['all', 'error', 'warning', 'info'] as SeverityFilter[]).map(s => (
          <FilterBtn key={s} active={severityFilter === s} onClick={() => onSeverityChange(s)}>
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </FilterBtn>
        ))}
      </HStack>

      {/* Type filters */}
      {issueTypes.length > 0 && (
        <HStack gap={2} wrap="wrap">
          <Text color={c.muted} fontSize="xs" fontWeight="500">Type:</Text>
          <FilterBtn active={typeFilter === 'all'} onClick={() => onTypeChange('all')}>All</FilterBtn>
          {issueTypes.map(t => (
            <FilterBtn key={t} active={typeFilter === t} onClick={() => onTypeChange(t)}>
              {issueTypeLabel(t)}
            </FilterBtn>
          ))}
        </HStack>
      )}

      {/* Issue count */}
      <Text color={c.muted} fontSize="sm">
        Showing {issues.length} issue{issues.length !== 1 ? 's' : ''}
      </Text>

      {/* Issues table */}
      {issues.length === 0 ? (
        <Box bg={c.surface} border="1px solid" borderColor={c.border} borderRadius="md" p={6} textAlign="center">
          <Text color={c.muted}>No issues found matching filters</Text>
        </Box>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Severity</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Type</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Product</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Message</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {issues.map((issue, i) => {
                const sev = severityColors[issue.severity] ?? severityColors.info;
                return (
                  <Table.Row key={`${issue.productId}-${issue.type}-${i}`}>
                    <Table.Cell borderColor={c.border}>
                      <Box
                        as="span"
                        display="inline-block"
                        bg={sev.bg}
                        color={sev.text}
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                        fontSize="xs"
                        fontWeight="600"
                      >
                        {issue.severity}
                      </Box>
                    </Table.Cell>
                    <Table.Cell color={c.text} borderColor={c.border} fontSize="sm">
                      {issueTypeLabel(issue.type)}
                    </Table.Cell>
                    <Table.Cell borderColor={c.border}>
                      <Text color={c.text} fontSize="sm" fontWeight="500">{issue.brand}</Text>
                      <Text color={c.muted} fontSize="xs">{issue.sizeDisplay}</Text>
                    </Table.Cell>
                    <Table.Cell color={c.muted} borderColor={c.border} fontSize="sm">
                      {issue.message}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {/* Duplicates section */}
      {duplicates.length > 0 && (
        <VStack align="stretch" gap={3} mt={2}>
          <Heading size="sm" color={c.text}>
            Duplicate Groups ({duplicates.length})
          </Heading>
          {duplicates.map(dup => (
            <Box key={dup.key} bg={c.surface} border="1px solid" borderColor={c.border} borderRadius="md" p={3}>
              <Text color={c.text} fontSize="sm" fontWeight="600">{dup.key.replace('|', ' ')}</Text>
              <Text color={c.muted} fontSize="xs" mt={1}>
                {dup.productIds.length} products: {dup.productIds.map(id => id.slice(0, 8)).join(', ')}
              </Text>
            </Box>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

/* ─── Movements Panel ───────────────────────────────────── */

function MovementsPanel({ movements }: { movements: Movement[] }) {
  if (movements.length === 0) {
    return (
      <Box bg={c.surface} border="1px solid" borderColor={c.border} borderRadius="md" p={6} textAlign="center">
        <Text color={c.muted}>No recent inventory movements</Text>
      </Box>
    );
  }

  return (
    <Box overflowX="auto">
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Time</Table.ColumnHeader>
            <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Type</Table.ColumnHeader>
            <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Delta</Table.ColumnHeader>
            <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>After</Table.ColumnHeader>
            <Table.ColumnHeader color={c.muted} bg={c.surface} borderColor={c.border}>Note</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {movements.map(m => (
            <Table.Row key={m.id}>
              <Table.Cell color={c.muted} borderColor={c.border} fontSize="xs" whiteSpace="nowrap">
                {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
              </Table.Cell>
              <Table.Cell color={c.text} borderColor={c.border} fontSize="sm">
                {m.movementType ?? '-'}
              </Table.Cell>
              <Table.Cell borderColor={c.border} fontSize="sm" fontWeight="600"
                color={m.quantityDelta > 0 ? '#22C55E' : m.quantityDelta < 0 ? '#EF4444' : c.muted}
              >
                {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
              </Table.Cell>
              <Table.Cell color={c.text} borderColor={c.border} fontSize="sm">{m.stockAfter}</Table.Cell>
              <Table.Cell color={c.muted} borderColor={c.border} fontSize="xs" maxW="300px" truncate>
                {m.note ?? '-'}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
