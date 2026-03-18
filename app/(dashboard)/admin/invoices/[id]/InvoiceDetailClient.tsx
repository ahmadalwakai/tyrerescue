'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Grid,
  Text,
  Link as ChakraLink,
  Spinner,
  Table,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  status: string;
  bookingId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVatNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  notes: string | null;
  internalNotes: string | null;
  sentAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string | null;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    sortOrder: number;
  }[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(161,161,170,0.15)', color: '#A1A1AA' },
  issued: { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' },
  sent: { bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6' },
  paid: { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' },
  overdue: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  archived: { bg: 'rgba(161,161,170,0.1)', color: '#A1A1AA' },
  cancelled: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444' },
};

function fmtDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoice({ ...data.invoice, items: data.items ?? [] });
      }
      setLoading(false);
    })();
  }, [invoiceId]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleAction(action: 'send' | 'archive' | 'delete' | 'hardDelete' | 'markPaid') {
    setActionLoading(action);
    try {
      let res: Response;
      if (action === 'send') {
        res = await fetch(`/api/admin/invoices/${invoiceId}/send`, { method: 'POST' });
      } else if (action === 'archive') {
        res = await fetch(`/api/admin/invoices/${invoiceId}/archive`, { method: 'POST' });
      } else if (action === 'delete') {
        res = await fetch(`/api/admin/invoices/${invoiceId}`, { method: 'DELETE' });
      } else if (action === 'hardDelete') {
        res = await fetch(`/api/admin/invoices/${invoiceId}/hard-delete`, { method: 'DELETE' });
      } else {
        res = await fetch(`/api/admin/invoices/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'paid' }),
        });
      }
      if (res.ok) {
        setToast({ text: `Invoice ${action === 'hardDelete' ? 'permanently deleted' : action === 'delete' ? 'deleted' : action === 'send' ? 'sent' : action === 'archive' ? 'archived' : 'marked paid'}`, ok: true });
        if (action === 'hardDelete') {
          setTimeout(() => router.push('/admin/invoices'), 600);
        } else {
          const r = await fetch(`/api/admin/invoices/${invoiceId}`);
          if (r.ok) {
            const d = await r.json();
            setInvoice({ ...d.invoice, items: d.items ?? [] });
          }
        }
      } else {
        const data = await res.json();
        setToast({ text: data.error || 'Action failed', ok: false });
      }
    } catch {
      setToast({ text: 'Action failed', ok: false });
    }
    setActionLoading('');
  }

  if (loading) return <Flex justify="center" py={12}><Spinner color={c.accent} /></Flex>;
  if (!invoice) return <Text color={c.muted} py={8}>Invoice not found</Text>;

  const sc = STATUS_COLORS[invoice.status] ?? STATUS_COLORS.draft;
  const isActionable = !['paid', 'cancelled', 'archived'].includes(invoice.status) && !invoice.deletedAt;

  return (
    <VStack align="stretch" gap={5}>
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

      {/* Print styles */}
      <style>{`
        @media print {
          nav, [data-print-hide], button { display: none !important; }
          body { background: white !important; color: black !important; }
          * { color: black !important; background: white !important; border-color: #ddd !important; }
        }
      `}</style>

      {/* Top bar */}
      <Flex justify="space-between" align="center" wrap="wrap" gap={3} data-print-hide style={anim.fadeUp()}>
        <HStack gap={3}>
          <Text fontSize="xl" fontWeight="700" color={c.text}>{invoice.invoiceNumber}</Text>
          <Box
            as="span" display="inline-block" px="10px" py="3px" borderRadius="full"
            fontSize="12px" fontWeight="600"
            style={{ backgroundColor: sc.bg, color: sc.color }}
          >
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </Box>
          {invoice.deletedAt && (
            <Box as="span" display="inline-block" px="8px" py="2px" borderRadius="full" fontSize="11px" fontWeight="600" bg="rgba(239,68,68,0.15)" color="#EF4444">
              Deleted
            </Box>
          )}
        </HStack>
        <HStack gap={2} wrap="wrap">
          <ActionBtn label="Download PDF" onClick={() => window.open(`/api/admin/invoices/${invoiceId}/pdf`, '_blank')} />
          <ActionBtn label="Print" onClick={() => window.print()} />
          {isActionable && (
            <>
              <ChakraLink asChild _hover={{ textDecoration: 'none' }}>
                <NextLink href={`/admin/invoices/${invoiceId}/edit`}>
                  <Box as="span" display="inline-block" px={3} py={1.5} fontSize="12px" fontWeight="600" borderRadius="md" borderWidth="1px" borderColor={c.border} color={c.muted} _hover={{ bg: c.surface, color: c.text }} cursor="pointer">
                    Edit
                  </Box>
                </NextLink>
              </ChakraLink>
              <ActionBtn label="Send" loading={actionLoading === 'send'} onClick={() => handleAction('send')} />
              <ActionBtn label="Mark Paid" onClick={() => handleAction('markPaid')} />
              <ActionBtn label="Archive" onClick={() => handleAction('archive')} />
            </>
          )}
          {!invoice.deletedAt && (
            <ActionBtn label="Delete" danger onClick={() => handleAction('delete')} />
          )}
          {invoice.deletedAt && (
            <ActionBtn label="Hard Delete" danger onClick={() => handleAction('hardDelete')} />
          )}
        </HStack>
      </Flex>

      {/* Company + Customer */}
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={5}>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.05s')}>
          <Text fontWeight="700" color={c.text} mb={3} fontSize="sm">FROM</Text>
          <Text color={c.text} fontWeight="600">{invoice.companyName}</Text>
          <Text color={c.muted} fontSize="sm">{invoice.companyAddress}</Text>
          <Text color={c.muted} fontSize="sm">{invoice.companyPhone}</Text>
          <Text color={c.muted} fontSize="sm">{invoice.companyEmail}</Text>
          {invoice.companyVatNumber && <Text color={c.muted} fontSize="sm" mt={1}>VAT: {invoice.companyVatNumber}</Text>}
        </Box>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.1s')}>
          <Text fontWeight="700" color={c.text} mb={3} fontSize="sm">BILL TO</Text>
          <Text color={c.text} fontWeight="600">{invoice.customerName}</Text>
          <Text color={c.muted} fontSize="sm">{invoice.customerEmail}</Text>
          {invoice.customerPhone && <Text color={c.muted} fontSize="sm">{invoice.customerPhone}</Text>}
          {invoice.customerAddress && <Text color={c.muted} fontSize="sm">{invoice.customerAddress}</Text>}
        </Box>
      </Grid>

      {/* Invoice info */}
      <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.15s')}>
        <Grid templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }} gap={4}>
          <Box>
            <Text {...{ color: c.muted, fontSize: '12px', fontWeight: '500' }}>Issue Date</Text>
            <Text color={c.text} fontSize="sm" fontWeight="600">{fmtDate(invoice.issueDate)}</Text>
          </Box>
          <Box>
            <Text {...{ color: c.muted, fontSize: '12px', fontWeight: '500' }}>Due Date</Text>
            <Text color={c.text} fontSize="sm" fontWeight="600">{fmtDate(invoice.dueDate)}</Text>
          </Box>
          <Box>
            <Text {...{ color: c.muted, fontSize: '12px', fontWeight: '500' }}>Created</Text>
            <Text color={c.text} fontSize="sm" fontWeight="600">{fmtDate(invoice.createdAt)}</Text>
          </Box>
          {invoice.sentAt && (
            <Box>
              <Text {...{ color: c.muted, fontSize: '12px', fontWeight: '500' }}>Sent</Text>
              <Text color={c.text} fontSize="sm" fontWeight="600">{fmtDate(invoice.sentAt)}</Text>
            </Box>
          )}
        </Grid>
        {invoice.bookingId && (
          <Text color={c.muted} fontSize="sm" mt={3}>
            Linked to booking: <Text as="span" color={c.accent} fontWeight="600">{invoice.bookingId}</Text>
          </Text>
        )}
      </Box>

      {/* Line Items */}
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden" style={anim.fadeUp('0.3s', '0.2s')}>
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg={c.surface}>
              <Table.ColumnHeader color={c.muted} px={4} py={3}>Description</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3} textAlign="center">Qty</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3} textAlign="right">Unit Price</Table.ColumnHeader>
              <Table.ColumnHeader color={c.muted} px={4} py={3} textAlign="right">Total</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {invoice.items.map((item) => (
              <Table.Row key={item.id}>
                <Table.Cell px={4} py={3} color={c.text} fontSize="sm">{item.description}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text} fontSize="sm" textAlign="center">{item.quantity}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text} fontSize="sm" textAlign="right">£{parseFloat(item.unitPrice).toFixed(2)}</Table.Cell>
                <Table.Cell px={4} py={3} color={c.text} fontSize="sm" fontWeight="600" textAlign="right">£{parseFloat(item.totalPrice).toFixed(2)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>

        {/* Totals */}
        <Box px={4} py={4} borderTopWidth="1px" borderColor={c.border}>
          <VStack align="flex-end" gap={1}>
            <HStack gap={8}>
              <Text color={c.muted} fontSize="sm">Subtotal</Text>
              <Text color={c.text} fontSize="sm" fontWeight="600" w="100px" textAlign="right">£{parseFloat(invoice.subtotal).toFixed(2)}</Text>
            </HStack>
            <Box w="160px" h="2px" bg={c.accent} my={1} />
            <HStack gap={8}>
              <Text color={c.text} fontSize="md" fontWeight="700">Total Due</Text>
              <Text color={c.accent} fontSize="lg" fontWeight="700" w="100px" textAlign="right">£{parseFloat(invoice.totalAmount).toFixed(2)}</Text>
            </HStack>
          </VStack>
        </Box>
      </Box>

      {/* Notes */}
      {(invoice.notes || invoice.internalNotes) && (
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={5}>
          {invoice.notes && (
            <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.25s')}>
              <Text fontWeight="700" color={c.text} mb={2} fontSize="sm">Notes</Text>
              <Text color={c.muted} fontSize="sm" whiteSpace="pre-wrap">{invoice.notes}</Text>
            </Box>
          )}
          {invoice.internalNotes && (
            <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border} data-print-hide style={anim.fadeUp('0.3s', '0.3s')}>
              <Text fontWeight="700" color="#EF4444" mb={2} fontSize="sm">Internal Notes (admin only)</Text>
              <Text color={c.muted} fontSize="sm" whiteSpace="pre-wrap">{invoice.internalNotes}</Text>
            </Box>
          )}
        </Grid>
      )}
    </VStack>
  );
}

function ActionBtn({ label, onClick, danger, loading }: { label: string; onClick: () => void; danger?: boolean; loading?: boolean }) {
  return (
    <Box
      as="button" px={3} py={1.5} fontSize="12px" fontWeight="600"
      borderRadius="md" bg="transparent"
      color={danger ? '#EF4444' : c.muted}
      borderWidth="1px" borderColor={danger ? 'rgba(239,68,68,0.3)' : c.border}
      cursor="pointer" transition="all 0.2s"
      _hover={{ bg: danger ? 'rgba(239,68,68,0.1)' : c.surface, color: danger ? '#EF4444' : c.text }}
      onClick={onClick} opacity={loading ? 0.5 : 1} pointerEvents={loading ? 'none' : 'auto'}
    >
      {loading ? '...' : label}
    </Box>
  );
}
