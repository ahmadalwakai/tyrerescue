'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  Input,
  Text,
  Link as ChakraLink,
  HStack,
  VStack,
  NativeSelect,
  Table,
  Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, selectProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  bookingId: string | null;
  status: string;
  customerName: string;
  customerEmail: string;
  totalAmount: string;
  issueDate: string | null;
  dueDate: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'sent', label: 'Sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', sent: 'Sent', paid: 'Paid',
  overdue: 'Overdue', archived: 'Archived', cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(161,161,170,0.15)', color: c.muted },
  issued: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
  sent: { bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6' },
  paid: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  overdue: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  archived: { bg: 'rgba(161,161,170,0.1)', color: c.muted },
  cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
};

function formatDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: string): string {
  return `£${parseFloat(amount).toFixed(2)}`;
}

export function InvoicesClient() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/admin/invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleAction(id: string, action: 'send' | 'archive' | 'delete' | 'markPaid') {
    setActionLoading(id);
    try {
      let res: Response;
      if (action === 'send') {
        res = await fetch(`/api/admin/invoices/${id}/send`, { method: 'POST' });
      } else if (action === 'archive') {
        res = await fetch(`/api/admin/invoices/${id}/archive`, { method: 'POST' });
      } else if (action === 'delete') {
        res = await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' });
      } else {
        res = await fetch(`/api/admin/invoices/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paid' }),
        });
      }
      if (res.ok) {
        setToast({ text: `Invoice ${action === 'delete' ? 'deleted' : action === 'send' ? 'sent' : action === 'archive' ? 'archived' : 'marked paid'}`, ok: true });
        fetchInvoices();
      } else {
        const data = await res.json();
        setToast({ text: data.error || 'Action failed', ok: false });
      }
    } catch {
      setToast({ text: 'Action failed', ok: false });
    }
    setActionLoading(null);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  }

  return (
    <VStack align="stretch" gap={4}>
      {/* Toast */}
      {toast && (
        <Box
          position="fixed" top={4} right={4} zIndex={9999}
          bg={toast.ok ? 'green.600' : 'red.600'} color="white"
          px={4} py={3} borderRadius="md" fontSize="sm" fontWeight="600"
          style={{ animation: 'fadeUp 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {toast.text}
        </Box>
      )}

      {/* Toolbar */}
      <Flex gap={3} wrap="wrap" align="center" style={anim.fadeUp()}>
        <Box as="form" onSubmit={handleSearch} display="flex" gap={2}>
          <Input
            {...inputProps}
            maxW="240px"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>
        <NativeSelect.Root maxW="180px">
          <NativeSelect.Field
            {...selectProps}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
        <Box flex={1} />
        <ChakraLink asChild _hover={{ textDecoration: 'none' }}>
          <NextLink href="/admin/invoices/new">
            <Box
              as="span"
              display="inline-block"
              bg={c.accent}
              color="#09090B"
              px={5}
              py={2.5}
              borderRadius="md"
              fontWeight="600"
              fontSize="14px"
              cursor="pointer"
              transition="background 0.2s"
              _hover={{ bg: c.accentHover }}
            >
              + New Invoice
            </Box>
          </NextLink>
        </ChakraLink>
      </Flex>

      {/* Table */}
      {loading ? (
        <Flex justify="center" py={12}><Spinner color={c.accent} /></Flex>
      ) : invoices.length === 0 ? (
        <Text color={c.muted} py={8} textAlign="center">No invoices found</Text>
      ) : (
        <>
          {/* Desktop */}
          <Box display={{ base: 'none', md: 'block' }} bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={anim.fadeUp('0.3s')}>
            <Table.Root size="sm">
              <Table.Header>
                <Table.Row bg={c.surface}>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Invoice</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Customer</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Status</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Amount</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Date</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3}>Due</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted} px={4} py={3} textAlign="right">Actions</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {invoices.map((inv) => {
                  const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft;
                  return (
                    <Table.Row key={inv.id} _hover={{ bg: c.surface }}>
                      <Table.Cell px={4} py={3}>
                        <ChakraLink asChild color={c.accent} fontWeight="600" fontSize="sm" _hover={{ textDecoration: 'underline' }}>
                          <NextLink href={`/admin/invoices/${inv.id}`}>{inv.invoiceNumber}</NextLink>
                        </ChakraLink>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Text fontSize="sm" color={c.text}>{inv.customerName}</Text>
                        <Text fontSize="xs" color={c.muted}>{inv.customerEmail}</Text>
                      </Table.Cell>
                      <Table.Cell px={4} py={3}>
                        <Box
                          as="span" display="inline-block" px="10px" py="3px" borderRadius="full"
                          fontSize="12px" fontWeight="600"
                          style={{ backgroundColor: sc.bg, color: sc.color }}
                        >
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </Box>
                      </Table.Cell>
                      <Table.Cell px={4} py={3} fontWeight="600" fontSize="sm" color={c.text}>
                        {formatCurrency(inv.totalAmount)}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} fontSize="sm" color={c.muted}>
                        {formatDate(inv.issueDate)}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} fontSize="sm" color={c.muted}>
                        {formatDate(inv.dueDate)}
                      </Table.Cell>
                      <Table.Cell px={4} py={3} textAlign="right">
                        <HStack gap={2} justify="flex-end">
                          <ActionBtn label="PDF" onClick={() => window.open(`/api/admin/invoices/${inv.id}/pdf`, '_blank')} />
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'archived' && (
                            <>
                              <ActionBtn label="Send" loading={actionLoading === inv.id} onClick={() => handleAction(inv.id, 'send')} />
                              <ActionBtn label="Paid" onClick={() => handleAction(inv.id, 'markPaid')} />
                            </>
                          )}
                          {inv.status !== 'archived' && (
                            <ActionBtn label="Archive" onClick={() => handleAction(inv.id, 'archive')} />
                          )}
                          <ActionBtn label="Delete" danger onClick={() => handleAction(inv.id, 'delete')} />
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          </Box>

          {/* Mobile cards */}
          <VStack display={{ base: 'flex', md: 'none' }} align="stretch" gap={3}>
            {invoices.map((inv, i) => {
              const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft;
              return (
                <Box key={inv.id} bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.stagger('fadeUp', i, '0.3s', 0.04)}>
                  <Flex justify="space-between" align="center" mb={2}>
                    <ChakraLink asChild color={c.accent} fontWeight="600" fontSize="sm" _hover={{ textDecoration: 'underline' }}>
                      <NextLink href={`/admin/invoices/${inv.id}`}>{inv.invoiceNumber}</NextLink>
                    </ChakraLink>
                    <Box as="span" display="inline-block" px="8px" py="2px" borderRadius="full" fontSize="11px" fontWeight="600" style={{ backgroundColor: sc.bg, color: sc.color }}>
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </Box>
                  </Flex>
                  <Text fontSize="sm" color={c.text}>{inv.customerName}</Text>
                  <Flex justify="space-between" mt={2}>
                    <Text fontSize="sm" fontWeight="600" color={c.text}>{formatCurrency(inv.totalAmount)}</Text>
                    <Text fontSize="xs" color={c.muted}>{formatDate(inv.issueDate)}</Text>
                  </Flex>
                  <HStack gap={2} mt={3} wrap="wrap">
                    <ActionBtn label="PDF" onClick={() => window.open(`/api/admin/invoices/${inv.id}/pdf`, '_blank')} />
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'archived' && (
                      <ActionBtn label="Send" loading={actionLoading === inv.id} onClick={() => handleAction(inv.id, 'send')} />
                    )}
                    <ActionBtn label="Delete" danger onClick={() => handleAction(inv.id, 'delete')} />
                  </HStack>
                </Box>
              );
            })}
          </VStack>

          {/* Pagination */}
          {totalPages > 1 && (
            <Flex justify="space-between" align="center" mt={2}>
              <Text fontSize="sm" color={c.muted}>{total} invoice{total !== 1 ? 's' : ''}</Text>
              <HStack gap={2}>
                <Box
                  as="button" px={3} py={1.5} fontSize="sm" borderRadius="md"
                  bg={page > 1 ? c.card : 'transparent'} color={page > 1 ? c.text : c.muted}
                  borderWidth="1px" borderColor={c.border}
                  cursor={page > 1 ? 'pointer' : 'default'}
                  _hover={page > 1 ? { bg: c.surface } : undefined}
                  onClick={() => page > 1 && setPage(page - 1)}
                >
                  Previous
                </Box>
                <Text fontSize="sm" color={c.muted}>{page} / {totalPages}</Text>
                <Box
                  as="button" px={3} py={1.5} fontSize="sm" borderRadius="md"
                  bg={page < totalPages ? c.card : 'transparent'} color={page < totalPages ? c.text : c.muted}
                  borderWidth="1px" borderColor={c.border}
                  cursor={page < totalPages ? 'pointer' : 'default'}
                  _hover={page < totalPages ? { bg: c.surface } : undefined}
                  onClick={() => page < totalPages && setPage(page + 1)}
                >
                  Next
                </Box>
              </HStack>
            </Flex>
          )}
        </>
      )}
    </VStack>
  );
}

function ActionBtn({ label, onClick, danger, loading }: { label: string; onClick: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <Box
      as="button"
      px={3}
      py={1}
      fontSize="12px"
      fontWeight="600"
      borderRadius="md"
      bg="transparent"
      color={danger ? '#EF4444' : c.muted}
      borderWidth="1px"
      borderColor={danger ? 'rgba(239,68,68,0.3)' : c.border}
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ bg: danger ? 'rgba(239,68,68,0.1)' : c.surface, color: danger ? '#EF4444' : c.text }}
      onClick={onClick}
      opacity={loading ? 0.5 : 1}
      pointerEvents={loading ? 'none' : 'auto'}
    >
      {loading ? '...' : label}
    </Box>
  );
}
