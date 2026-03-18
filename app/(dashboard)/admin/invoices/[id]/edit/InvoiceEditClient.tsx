'use client';

import { useState, useEffect } from 'react';
import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InvoiceFormClient } from '../../new/InvoiceFormClient';

interface InvoiceData {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  internalNotes: string | null;
  bookingId: string | null;
  items: {
    description: string;
    quantity: number;
    unitPrice: string;
  }[];
}

export function InvoiceEditWrapper({ invoiceId }: { invoiceId: string }) {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [invoiceId]);

  if (loading) return <Flex justify="center" py={12}><Spinner color={c.accent} /></Flex>;
  if (!data) return <Text color={c.muted} py={8}>Invoice not found</Text>;

  return (
    <InvoiceFormClient
      invoiceId={invoiceId}
      initialData={{
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone ?? '',
        customerAddress: data.customerAddress ?? '',
        issueDate: data.issueDate ? data.issueDate.slice(0, 10) : '',
        dueDate: data.dueDate ? data.dueDate.slice(0, 10) : '',
        notes: data.notes ?? '',
        internalNotes: data.internalNotes ?? '',
        bookingId: data.bookingId ?? '',
        items: data.items,
      }}
    />
  );
}
