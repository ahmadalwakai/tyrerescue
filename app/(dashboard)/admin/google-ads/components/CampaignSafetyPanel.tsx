import {
  Badge,
  Box,
  Flex,
  Heading,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import type {
  CampaignSafetyIssue,
  LandingPageMapping,
  NegativeKeywordPlan,
  ValidationResult,
} from '@/lib/google-ads/types';

function severityPalette(severity: CampaignSafetyIssue['severity']): string {
  if (severity === 'error') return 'red';
  if (severity === 'warning') return 'orange';
  return 'blue';
}

export function CampaignSafetyPanel({
  activeReadyCount,
  defaultLimit,
  strictLimit,
  validation,
  issues,
  blockedRoutes,
  confirmationRoutes,
  negativeKeywords,
  isLoading = false,
  errorMessage = null,
}: {
  activeReadyCount: number;
  defaultLimit: number;
  strictLimit: number;
  validation: ValidationResult;
  issues: readonly CampaignSafetyIssue[];
  blockedRoutes: readonly LandingPageMapping[];
  confirmationRoutes: readonly LandingPageMapping[];
  negativeKeywords: readonly NegativeKeywordPlan[];
  isLoading?: boolean;
  errorMessage?: string | null;
}) {
  if (isLoading) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Text color={c.muted}>Loading Google Ads safety checks...</Text>
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor="red.500" borderRadius="md" p={5}>
        <Text color="red.300" fontWeight="700">Safety check failed</Text>
        <Text color={c.muted} mt={1}>{errorMessage}</Text>
      </Box>
    );
  }

  if (issues.length === 0 && validation.errors.length === 0 && validation.warnings.length === 0) {
    return (
      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Text color={c.muted}>No safety issues found.</Text>
      </Box>
    );
  }

  const overDefaultLimit = activeReadyCount > defaultLimit;
  const overStrictLimit = activeReadyCount > strictLimit;

  return (
    <VStack align="stretch" gap={5}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <Box bg={c.card} borderWidth="1px" borderColor={overDefaultLimit ? 'red.500' : c.border} borderRadius="md" p={5}>
          <Text color={c.muted} fontSize="sm">Active-ready ad groups</Text>
          <Text color={c.text} fontSize="3xl" fontWeight="800">{activeReadyCount}</Text>
          <Text color={overDefaultLimit ? 'red.300' : overStrictLimit ? 'orange.300' : c.muted} fontSize="sm">
            Default max {defaultLimit}. Strict high-CPC mode max {strictLimit}.
          </Text>
        </Box>
        <Box bg={c.card} borderWidth="1px" borderColor={validation.errors.length ? 'red.500' : c.border} borderRadius="md" p={5}>
          <Text color={c.muted} fontSize="sm">Hard errors</Text>
          <Text color={validation.errors.length ? 'red.300' : c.text} fontSize="3xl" fontWeight="800">
            {validation.errors.length}
          </Text>
          <Text color={c.muted} fontSize="sm">Must be zero before campaign generation.</Text>
        </Box>
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
          <Text color={c.muted} fontSize="sm">Network defaults</Text>
          <Text color={c.text} fontSize="md" fontWeight="700" mt={2}>Search only</Text>
          <Text color={c.muted} fontSize="sm">Broad, Search Partners, and Display expansion are blocked.</Text>
        </Box>
      </SimpleGrid>

      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Heading size="sm" color={c.text} mb={4}>Campaign Safety Issues</Heading>
        <VStack align="stretch" gap={3}>
          {issues.map((issue) => (
            <Box key={issue.id} borderWidth="1px" borderColor={c.border} borderRadius="md" p={4} bg={c.surface}>
              <Flex gap={3} align="flex-start" justify="space-between" direction={{ base: 'column', sm: 'row' }}>
                <Box>
                  <Flex align="center" gap={2} wrap="wrap">
                    <Text color={c.text} fontWeight="700">{issue.title}</Text>
                    <Badge colorPalette={severityPalette(issue.severity)}>{issue.severity}</Badge>
                  </Flex>
                  {issue.routePath && (
                    <Text color={c.accent} fontSize="sm" mt={1}>{issue.routePath}</Text>
                  )}
                  <Text color={c.muted} fontSize="sm" mt={2}>{issue.description}</Text>
                </Box>
                <Text color={c.text} fontSize="sm" maxW={{ base: '100%', sm: '280px' }}>
                  {issue.requiredAction}
                </Text>
              </Flex>
            </Box>
          ))}
        </VStack>
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
          <Heading size="sm" color={c.text} mb={4}>Blocked Routes</Heading>
          <VStack align="stretch" gap={2}>
            {blockedRoutes.length === 0 ? (
              <Text color={c.muted}>No blocked routes configured.</Text>
            ) : (
              blockedRoutes.map((route) => (
                <Flex key={route.id} justify="space-between" gap={3} borderBottomWidth="1px" borderColor={c.border} py={2}>
                  <Text color={c.text} fontSize="sm">{route.routePattern}</Text>
                  <Badge colorPalette="red">blocked</Badge>
                </Flex>
              ))
            )}
          </VStack>
        </Box>

        <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
          <Heading size="sm" color={c.text} mb={4}>Needs Ahmad Confirmation</Heading>
          <VStack align="stretch" gap={2}>
            {confirmationRoutes.length === 0 ? (
              <Text color={c.muted}>No confirmation routes configured.</Text>
            ) : (
              confirmationRoutes.map((route) => (
                <Box key={route.id} borderBottomWidth="1px" borderColor={c.border} py={2}>
                  <Text color={c.text} fontSize="sm">{route.routePattern}</Text>
                  <Text color={c.muted} fontSize="xs">{route.notes}</Text>
                </Box>
              ))
            )}
          </VStack>
        </Box>
      </SimpleGrid>

      <Box bg={c.card} borderWidth="1px" borderColor={c.border} borderRadius="md" p={5}>
        <Heading size="sm" color={c.text} mb={4}>Editable Negative Keyword Starter List</Heading>
        <Flex gap={2} wrap="wrap">
          {negativeKeywords.length === 0 ? (
            <Text color={c.muted}>No negative keywords configured.</Text>
          ) : (
            negativeKeywords.map((keyword) => (
              <Badge key={keyword.text} colorPalette="gray" px={3} py={1} borderRadius="full">
                {keyword.text}
              </Badge>
            ))
          )}
        </Flex>
      </Box>
    </VStack>
  );
}
