import { Heading, Box, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { InvoicesClient } from './InvoicesClient';

export default function AdminInvoicesPage() {
  return (
    <Box>
      <Box mb={6} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Heading size="lg" color={c.text}>Invoices</Heading>
        <Text color={c.muted} mt={1}>Create, manage and send invoices</Text>
      </Box>
      <InvoicesClient />
    </Box>
  );
}
