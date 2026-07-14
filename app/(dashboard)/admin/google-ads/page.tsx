import { Box, Heading, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { landingPageMappings, routeAuditItems } from '@/lib/google-ads/landing-page-map';
import { campaignSafetyIssues, launchPlan } from '@/lib/google-ads/recommendations';
import { getActiveReadyAdGroupCount, getLaunchKeywordCount, validateFinalUrlMapping, validateLaunchPlan } from '@/lib/google-ads/validation';
import { CampaignSafetyPanel } from './components/CampaignSafetyPanel';
import { FinalUrlMappingTable } from './components/FinalUrlMappingTable';
import { LandingPageAuditTable } from './components/LandingPageAuditTable';
import { LaunchPlanPanel } from './components/LaunchPlanPanel';

export const metadata = {
  title: 'Google Ads Safety | Tyre Rescue Admin',
};

export default function GoogleAdsSafetyPage() {
  const launchValidation = validateLaunchPlan(launchPlan);
  const mappingValidation = validateFinalUrlMapping(landingPageMappings);
  const activeReadyCount = getActiveReadyAdGroupCount(launchPlan);
  const keywordCount = getLaunchKeywordCount(launchPlan);
  const blockedRoutes = landingPageMappings.filter((mapping) => mapping.isBannedFinalUrl);
  const confirmationRoutes = landingPageMappings.filter((mapping) => mapping.requiresAhmadConfirmation);
  const combinedErrorCount = launchValidation.errors.length + mappingValidation.errors.length;
  const combinedWarningCount = launchValidation.warnings.length + mappingValidation.warnings.length;

  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg" color={c.text}>Google Ads Safety</Heading>
        <Text color={c.muted} mt={2} maxW="760px">
          Planning controls only. No Google Ads API calls, no CSV export, and no campaign activation from this page.
        </Text>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 4 }} gap={4}>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <Text color={c.muted} fontSize="sm">Budget model</Text>
          <Text color={c.text} fontSize="2xl" fontWeight="800">GBP {launchPlan.dailyBudgetGBP}/day</Text>
        </Box>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={c.border}>
          <Text color={c.muted} fontSize="sm">Active-ready</Text>
          <Text color={c.text} fontSize="2xl" fontWeight="800">{activeReadyCount}</Text>
        </Box>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={combinedErrorCount ? 'red.500' : c.border}>
          <Text color={c.muted} fontSize="sm">Hard errors</Text>
          <Text color={combinedErrorCount ? 'red.300' : c.text} fontSize="2xl" fontWeight="800">
            {combinedErrorCount}
          </Text>
        </Box>
        <Box bg={c.card} p={5} borderRadius="md" borderWidth="1px" borderColor={combinedWarningCount ? 'orange.500' : c.border}>
          <Text color={c.muted} fontSize="sm">Launch keywords</Text>
          <Text color={c.text} fontSize="2xl" fontWeight="800">{keywordCount}</Text>
        </Box>
      </SimpleGrid>

      <CampaignSafetyPanel
        activeReadyCount={activeReadyCount}
        defaultLimit={launchPlan.maxActiveReadyAdGroupsDefault}
        strictLimit={launchPlan.maxActiveReadyAdGroupsStrict}
        validation={launchValidation}
        issues={campaignSafetyIssues}
        blockedRoutes={blockedRoutes}
        confirmationRoutes={confirmationRoutes}
        negativeKeywords={launchPlan.negativeKeywords}
      />

      <LaunchPlanPanel plan={launchPlan} activeReadyCount={activeReadyCount} />

      <FinalUrlMappingTable mappings={landingPageMappings} />

      <LandingPageAuditTable items={routeAuditItems} />
    </VStack>
  );
}
