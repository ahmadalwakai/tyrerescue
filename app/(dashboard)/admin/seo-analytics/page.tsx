import { Box, Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { SEODashboardClient } from './SEODashboardClient';

export const metadata = {
  title: 'SEO Analytics | Admin | Tyre Rescue',
};

export default function SEOAnalyticsPage() {
  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>SEO Analytics</Heading>
        <Text color={c.muted} mt={1}>Performance monitoring, schema validation, and indexing status</Text>
      </Box>
      <SEODashboardClient />
    </VStack>
  );
}
