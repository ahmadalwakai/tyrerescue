import { Badge, Box, Heading, Table, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type { FinalUrlSuitability, RouteAuditItem } from '@/lib/google-ads/types';

function suitabilityPalette(value: FinalUrlSuitability): string {
  if (value === 'yes') return 'green';
  if (value === 'no') return 'red';
  if (value === 'needs_confirmation') return 'blue';
  return 'orange';
}

export function LandingPageAuditTable({
  items,
  isLoading = false,
  errorMessage = null,
}: {
  items: readonly RouteAuditItem[];
  isLoading?: boolean;
  errorMessage?: string | null;
}) {
  if (isLoading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Text color={c.muted}>Loading landing page audit...</Text>
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor="red.500" borderRadius="md" p={5}>
        <Text color="red.300" fontWeight="700">Landing page audit unavailable</Text>
        <Text color={c.muted} mt={1}>{errorMessage}</Text>
      </Box>
    );
  }

  return (
    <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" overflow="hidden">
      <Box p={5} borderBottomWidth="1px" borderColor={c.border}>
        <Heading size="sm" color={c.text}>Landing Page Audit</Heading>
        <Text color={c.muted} fontSize="sm" mt={1}>
          Actual inspected routes only. Scroll sideways on mobile.
        </Text>
      </Box>
      {items.length === 0 ? (
        <Box p={6}>
          <Text color={c.muted}>No landing pages found.</Text>
        </Box>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm" minW="1180px">
            <Table.Header>
              <Table.Row bg={c.surface}>
                <Table.ColumnHeader color={c.muted}>Route</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Page / H1</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Intent</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>CTA</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Ad Group</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Suitability</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Risk</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Correction</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.map((item) => (
                <Table.Row key={item.routePath}>
                  <Table.Cell color={c.accent} fontWeight="700">{item.routePath}</Table.Cell>
                  <Table.Cell>
                    <Text color={c.text} fontWeight="700">{item.pageName}</Text>
                    <Text color={c.muted} fontSize="xs">{item.h1}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color={c.text} fontSize="sm">{item.serviceIntent}</Text>
                    <Text color={c.muted} fontSize="xs">{item.locationIntent}</Text>
                  </Table.Cell>
                  <Table.Cell color={c.muted}>{item.ctaIntent}</Table.Cell>
                  <Table.Cell>
                    <Text color={c.text}>{item.bestAdGroupType}</Text>
                    <Text color={c.muted} fontSize="xs">{item.bestGoogleAdsIntent}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={suitabilityPalette(item.suitableAsFinalUrl)}>
                      {item.suitableAsFinalUrl}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text color={c.muted} fontSize="xs">{item.mixupRisk}</Text>
                    <Text color={c.muted} fontSize="xs">{item.suspiciousLinkIssue}</Text>
                  </Table.Cell>
                  <Table.Cell color={c.muted} fontSize="xs">
                    {item.recommendedCorrectionOrConfirmation}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}
