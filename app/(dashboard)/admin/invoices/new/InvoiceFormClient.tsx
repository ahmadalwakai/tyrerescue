'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Grid,
  Input,
  Text,
  Spinner,
  Textarea,
  Button,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps, labelProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface LineItem {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

let keyCounter = 1;

export function InvoiceFormClient({ initialData, invoiceId }: {
  initialData?: {
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    issueDate: string;
    dueDate: string;
    vatRate: string;
    notes: string;
    internalNotes: string;
    bookingId: string;
    items: { description: string; quantity: number; unitPrice: string }[];
  };
  invoiceId?: string;
}) {
  const router = useRouter();
  const isEdit = !!invoiceId;

  const [form, setForm] = useState({
    customerName: initialData?.customerName ?? '',
    customerEmail: initialData?.customerEmail ?? '',
    customerPhone: initialData?.customerPhone ?? '',
    customerAddress: initialData?.customerAddress ?? '',
    issueDate: initialData?.issueDate ?? new Date().toISOString().slice(0, 10),
    dueDate: initialData?.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    vatRate: initialData?.vatRate ?? '0',
    notes: initialData?.notes ?? '',
    internalNotes: initialData?.internalNotes ?? '',
    bookingId: initialData?.bookingId ?? '',
  });

  const [items, setItems] = useState<LineItem[]>(() => {
    if (initialData?.items?.length) {
      return initialData.items.map((it) => ({
        key: keyCounter++,
        description: it.description,
        quantity: String(it.quantity),
        unitPrice: it.unitPrice,
      }));
    }
    return [{ key: keyCounter++, description: '', quantity: '1', unitPrice: '' }];
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateItem(key: number, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { key: keyCounter++, description: '', quantity: '1', unitPrice: '' }]);
  }

  function removeItem(key: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  function computeSubtotal(): number {
    return items.reduce((sum, it) => {
      const qty = parseFloat(it.quantity) || 0;
      const price = parseFloat(it.unitPrice) || 0;
      return sum + qty * price;
    }, 0);
  }

  const subtotal = computeSubtotal();
  const vatRate = parseFloat(form.vatRate) || 0;
  const vatAmount = subtotal * (vatRate / 100);
  const totalAmount = subtotal + vatAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        bookingId: form.bookingId || undefined,
        items: items.map((it) => ({
          description: it.description,
          quantity: parseInt(it.quantity) || 1,
          unitPrice: it.unitPrice,
        })),
      };

      const url = isEdit ? `/api/admin/invoices/${invoiceId}` : '/api/admin/invoices';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save invoice');
      }

      const data = await res.json();
      setToast({ text: isEdit ? 'Invoice updated' : 'Invoice created', ok: true });
      setTimeout(() => {
        router.push(`/admin/invoices/${isEdit ? invoiceId : data.id}`);
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box as="form" onSubmit={handleSubmit}>
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

      <VStack align="stretch" gap={6}>
        {/* Customer Details */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp()}>
          <Text fontWeight="700" color={c.text} mb={4} fontSize="md">Customer Details</Text>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
            <Box>
              <Text {...labelProps} mb={1}>Name *</Text>
              <Input {...inputProps} value={form.customerName} onChange={(e) => updateForm('customerName', e.target.value)} required />
            </Box>
            <Box>
              <Text {...labelProps} mb={1}>Email *</Text>
              <Input {...inputProps} type="email" value={form.customerEmail} onChange={(e) => updateForm('customerEmail', e.target.value)} required />
            </Box>
            <Box>
              <Text {...labelProps} mb={1}>Phone</Text>
              <Input {...inputProps} value={form.customerPhone} onChange={(e) => updateForm('customerPhone', e.target.value)} />
            </Box>
            <Box>
              <Text {...labelProps} mb={1}>Address</Text>
              <Input {...inputProps} value={form.customerAddress} onChange={(e) => updateForm('customerAddress', e.target.value)} />
            </Box>
          </Grid>
        </Box>

        {/* Invoice Details */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.05s')}>
          <Text fontWeight="700" color={c.text} mb={4} fontSize="md">Invoice Details</Text>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={4}>
            <Box>
              <Text {...labelProps} mb={1}>Issue Date</Text>
              <Input {...inputProps} type="date" value={form.issueDate} onChange={(e) => updateForm('issueDate', e.target.value)} />
            </Box>
            <Box>
              <Text {...labelProps} mb={1}>Due Date</Text>
              <Input {...inputProps} type="date" value={form.dueDate} onChange={(e) => updateForm('dueDate', e.target.value)} />
            </Box>
          </Grid>
          <Box mt={4}>
            <Text {...labelProps} mb={1}>Booking Reference (optional)</Text>
            <Input {...inputProps} placeholder="Booking ID or reference" value={form.bookingId} onChange={(e) => updateForm('bookingId', e.target.value)} />
          </Box>
        </Box>

        {/* Line Items */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.1s')}>
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontWeight="700" color={c.text} fontSize="md">Line Items</Text>
            <Button
              bg={c.accent} color="#09090B" px={4} py={1.5}
              borderRadius="md" fontWeight="600" fontSize="13px"
              _hover={{ bg: c.accentHover }} onClick={addItem}
            >
              + Add Item
            </Button>
          </Flex>

          <VStack align="stretch" gap={3}>
            {items.map((it, i) => (
              <Grid
                key={it.key}
                templateColumns={{ base: '1fr', md: '1fr 100px 120px 40px' }}
                gap={3}
                alignItems="end"
                style={anim.stagger('fadeUp', i, '0.2s', 0, 0.03)}
              >
                <Box>
                  {i === 0 && <Text {...labelProps} mb={1}>Description</Text>}
                  <Input {...inputProps} placeholder="e.g. Mobile tyre fitting" value={it.description} onChange={(e) => updateItem(it.key, 'description', e.target.value)} required />
                </Box>
                <Box>
                  {i === 0 && <Text {...labelProps} mb={1}>Qty</Text>}
                  <Input {...inputProps} type="number" min="1" value={it.quantity} onChange={(e) => updateItem(it.key, 'quantity', e.target.value)} required />
                </Box>
                <Box>
                  {i === 0 && <Text {...labelProps} mb={1}>Unit Price</Text>}
                  <Input {...inputProps} type="number" step="0.01" min="0" placeholder="0.00" value={it.unitPrice} onChange={(e) => updateItem(it.key, 'unitPrice', e.target.value)} required />
                </Box>
                <Box>
                  {items.length > 1 && (
                    <Button
                      variant="ghost" color="#EF4444" fontSize="18px"
                      _hover={{ color: '#DC2626' }} onClick={() => removeItem(it.key)}
                      py={2} minW="auto" px={2}
                    >
                      &times;
                    </Button>
                  )}
                </Box>
              </Grid>
            ))}
          </VStack>

          {/* Totals */}
          <Box mt={6} pt={4} borderTopWidth="1px" borderColor={c.border}>
            <VStack align="flex-end" gap={1}>
              <HStack gap={8}>
                <Text color={c.muted} fontSize="sm">Subtotal</Text>
                <Text color={c.text} fontSize="sm" fontWeight="600">£{subtotal.toFixed(2)}</Text>
              </HStack>
              <Box w="160px" h="2px" bg={c.accent} my={1} />
              <HStack gap={8}>
                <Text color={c.text} fontSize="md" fontWeight="700">Total</Text>
                <Text color={c.accent} fontSize="md" fontWeight="700">£{totalAmount.toFixed(2)}</Text>
              </HStack>
            </VStack>
          </Box>
        </Box>

        {/* Notes */}
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.3s', '0.15s')}>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
            <Box>
              <Text {...labelProps} mb={1}>Notes (visible on invoice)</Text>
              <Textarea {...textareaProps} value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
            </Box>
            <Box>
              <Text {...labelProps} mb={1}>Internal Notes (admin-only)</Text>
              <Textarea {...textareaProps} value={form.internalNotes} onChange={(e) => updateForm('internalNotes', e.target.value)} />
            </Box>
          </Grid>
        </Box>

        {/* Error + Submit */}
        {error && (
          <Text color="red.400" fontSize="sm" fontWeight="600">{error}</Text>
        )}

        <Flex gap={3}>
          <Button
            type="submit" bg={c.accent} color="#09090B" px={6} py={3}
            borderRadius="md" fontWeight="700" fontSize="15px"
            _hover={{ bg: c.accentHover }}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : isEdit ? 'Update Invoice' : 'Create Invoice'}
          </Button>
          <Button
            variant="outline" bg={c.surface} color={c.muted} px={6} py={3}
            borderRadius="md" fontWeight="600" fontSize="15px"
            borderColor={c.border}
            _hover={{ bg: c.card }}
            onClick={() => router.push('/admin/invoices')}
          >
            Cancel
          </Button>
        </Flex>
      </VStack>
    </Box>
  );
}
