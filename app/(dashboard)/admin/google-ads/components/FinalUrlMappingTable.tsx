import { Badge, Box, Heading, Table, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type { FinalUrlSuitability, LandingPageMapping } from '@/lib/google-ads/types';

function suitabilityPalette(value: FinalUrlSuitability): string {
  if (value === 'yes') return 'green';
  if (value === 'no') return 'red';
  if (value === 'needs_confirmation') return 'blue';
  return 'orange';
}

export function FinalUrlMappingTable({
  mappings,
  isLoading = false,
  errorMessage = null,
}: {
  mappings: readonly LandingPageMapping[];
  isLoading?: boolean;
  errorMessage?: string | null;
}) {
  if (isLoading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Text color={c.muted}>Loading final URL mappings...</Text>
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor="red.500" borderRadius="md" p={5}>
        <Text color="red.300" fontWeight="700">Final URL mapping error</Text>
        <Text color={c.muted} mt={1}>{errorMessage}</Text>
      </Box>
    );
  }

  return (
    <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" overflow="hidden">
      <Box p={5} borderBottomWidth="1px" borderColor={c.border}>
        <Heading size="sm" color={c.text}>Final URL Mapping</Heading>
        <Text color={c.muted} fontSize="sm" mt={1}>
          Banned and uncertain routes cannot pass launch validation.
        </Text>
      </Box>
      {mappings.length === 0 ? (
        <Box p={6}>
          <Text color={c.muted}>No final URL mappings configured.</Text>
        </Box>
      ) : (
        <Box overflowX="auto">
          <Table.Root size="sm" minW="980px">
            <Table.Header>
              <Table.Row bg={c.surface}>
                <Table.ColumnHeader color={c.muted}>Intent</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Route Pattern</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Example</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Suitability</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Default</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Confirmation</Table.ColumnHeader>
                <Table.ColumnHeader color={c.muted}>Notes</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {mappings.map((mapping) => (
                <Table.Row key={mapping.id}>
                  <Table.Cell color={c.text} fontWeight="700">{mapping.id}</Table.Cell>
                  <Table.Cell color={c.accent}>{mapping.routePattern}</Table.Cell>
                  <Table.Cell color={c.muted}>{mapping.exampleUrl}</Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={suitabilityPalette(mapping.finalUrlSuitability)}>
                      {mapping.finalUrlSuitability}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={mapping.coldTrafficDefault ? 'green' : 'gray'}>
                      {mapping.coldTrafficDefault ? 'cold ok' : 'not default'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={mapping.requiresAhmadConfirmation ? 'blue' : 'gray'}>
                      {mapping.requiresAhmadConfirmation ? 'Ahmad' : 'not needed'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell color={c.muted} fontSize="xs">{mapping.notes}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}
