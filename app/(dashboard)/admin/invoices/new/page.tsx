import { Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InvoiceFormClient } from './InvoiceFormClient';

export default function NewInvoicePage() {
  return (
    <VStack align="stretch" gap={4}>
      <Heading fontFamily="var(--font-display)" color={c.text} size="xl" letterSpacing="1px">
        New Invoice
      </Heading>
      <Text color={c.muted} fontSize="sm">Create a new invoice</Text>
      <InvoiceFormClient />
    </VStack>
  );
}
