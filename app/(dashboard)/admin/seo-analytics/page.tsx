import { Box, Heading, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { SEODashboardClient } from './SEODashboardClient';

export const metadata = {
  title: 'SEO Analytics | Admin | Tyre Rescue',
  description: 'Real-time SEO performance: Core Web Vitals, traffic analytics, keyword tracking, page crawl results, and schema coverage.',
};

export default function SEOAnalyticsPage() {
  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>SEO Analytics</Heading>
        <Text color={c.muted} mt={1}>Real data from PageSpeed Insights, visitor analytics, and site crawls</Text>
      </Box>
      <SEODashboardClient />
    </VStack>
  );
}
