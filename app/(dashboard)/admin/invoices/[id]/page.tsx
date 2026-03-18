import { Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InvoiceDetailClient } from './InvoiceDetailClient';

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <VStack align="stretch" gap={4}>
      <Heading fontFamily="var(--font-display)" color={c.text} size="xl" letterSpacing="1px">
        Invoice Details
      </Heading>
      <InvoiceDetailClientWrapper params={params} />
    </VStack>
  );
}

async function InvoiceDetailClientWrapper({ params }: { params: Promise<{ id: string}> }) {
  const { id } = await params;
  return <InvoiceDetailClient invoiceId={id} />;
}
