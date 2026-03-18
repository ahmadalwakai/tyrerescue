import { Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InvoiceEditWrapper } from './InvoiceEditClient';

export default function InvoiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <VStack align="stretch" gap={4}>
      <Heading fontFamily="var(--font-display)" color={c.text} size="xl" letterSpacing="1px">
        Edit Invoice
      </Heading>
      <Text color={c.muted} fontSize="sm">Update invoice details</Text>
      <InvoiceEditWrapperServer params={params} />
    </VStack>
  );
}

async function InvoiceEditWrapperServer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceEditWrapper invoiceId={id} />;
}
