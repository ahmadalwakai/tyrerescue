import {
  Badge,
  Box,
  Flex,
  Heading,
  SimpleGrid,
  Table,
  Text,
  VStack,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type { AdGroupLaunchStatus, LaunchPlan } from '@/lib/google-ads/types';

function statusPalette(status: AdGroupLaunchStatus): string {
  if (status === 'active_ready') return 'green';
  if (status === 'blocked') return 'red';
  if (status === 'paused') return 'orange';
  if (status === 'archived') return 'gray';
  return 'blue';
}

export function LaunchPlanPanel({
  plan,
  activeReadyCount,
  isLoading = false,
  errorMessage = null,
}: {
  plan: LaunchPlan;
  activeReadyCount: number;
  isLoading?: boolean;
  errorMessage?: string | null;
}) {
  if (isLoading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Text color={c.muted}>Loading launch plan...</Text>
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor="red.500" borderRadius="md" p={5}>
        <Text color="red.300" fontWeight="700">Launch plan unavailable</Text>
        <Text color={c.muted} mt={1}>{errorMessage}</Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" gap={4}>
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Flex justify="space-between" gap={4} direction={{ base: 'column', md: 'row' }}>
          <Box>
            <Heading size="sm" color={c.text}>{plan.name}</Heading>
            <Text color={c.muted} fontSize="sm" mt={1}>
              GBP {plan.dailyBudgetGBP}/day. Exact and phrase only. No CSV export in this phase.
            </Text>
          </Box>
          <Badge colorPalette={activeReadyCount > plan.maxActiveReadyAdGroupsDefault ? 'red' : 'green'} alignSelf="flex-start">
            {activeReadyCount} active-ready
          </Badge>
        </Flex>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        {plan.campaigns.map((campaign) => (
          <Box key={campaign.campaignName} bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
            <Text color={c.text} fontWeight="700">{campaign.campaignName}</Text>
            <Text color={c.muted} fontSize="sm" mt={2}>{campaign.notes}</Text>
            <Badge colorPalette="orange" mt={3}>{campaign.defaultStatus}</Badge>
          </Box>
        ))}
      </SimpleGrid>

      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" overflow="hidden">
        <Box p={5} borderBottomWidth="1px" borderColor={c.border}>
          <Heading size="sm" color={c.text}>Ad Group Launch Plan</Heading>
          <Text color={c.muted} fontSize="sm" mt={1}>
            Blocked groups require Ahmad confirmation before they can become active-ready.
          </Text>
        </Box>
        {plan.adGroups.length === 0 ? (
          <Box p={6}>
            <Text color={c.muted}>No ad groups planned.</Text>
          </Box>
        ) : (
          <Box overflowX="auto">
            <Table.Root size="sm" minW="1080px">
              <Table.Header>
                <Table.Row bg={c.surface}>
                  <Table.ColumnHeader color={c.muted}>Ad Group</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted}>Campaign</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted}>Status</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted}>Final URL</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted}>Keywords</Table.ColumnHeader>
                  <Table.ColumnHeader color={c.muted}>Confirmation</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {plan.adGroups.map((adGroup) => (
                  <Table.Row key={adGroup.id}>
                    <Table.Cell>
                      <Text color={c.text} fontWeight="700">{adGroup.adGroupName}</Text>
                      <Text color={c.muted} fontSize="xs">{adGroup.intent}</Text>
                    </Table.Cell>
                    <Table.Cell color={c.muted}>{adGroup.campaignName}</Table.Cell>
                    <Table.Cell>
                      <Badge colorPalette={statusPalette(adGroup.launchStatus)}>{adGroup.launchStatus}</Badge>
                    </Table.Cell>
                    <Table.Cell color={c.accent}>{adGroup.finalUrl}</Table.Cell>
                    <Table.Cell>
                      <VStack align="stretch" gap={1}>
                        {adGroup.keywords.map((keyword) => (
                          <Text key={`${keyword.text}-${keyword.matchType}`} color={c.muted} fontSize="xs">
                            {keyword.matchType}: {keyword.text}
                          </Text>
                        ))}
                      </VStack>
                    </Table.Cell>
                    <Table.Cell>
                      <Text color={adGroup.needsAhmadConfirmation ? 'orange.300' : c.muted} fontSize="xs">
                        {adGroup.confirmationNote}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Box>
    </VStack>
  );
}
