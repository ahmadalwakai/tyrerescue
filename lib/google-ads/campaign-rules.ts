import type { AdGroupLaunchStatus, MatchType } from './types';

export const campaignRules = {
  maxActiveReadyAdGroupsDefault: 12,
  maxActiveReadyAdGroupsStrict: 7,
  minActiveReadyAdGroups: 5,
  maxBudgetPerDayGBP: 41,
  broadMatchAllowed: false,
  searchPartnersAllowed: false,
  displayExpansionAllowed: false,
  requireManualFinalUrlApproval: true,
  requireManualAdGroupApproval: true,
  requireConfirmedService: true,
  requireConfirmedCity: true,
  requireConfirmedFinalUrl: true,
  areaPagesDefaultStatus: 'paused' satisfies AdGroupLaunchStatus,
  libraryAdGroupsDefaultStatus: 'draft' satisfies AdGroupLaunchStatus,
  launchMatchTypes: ['exact', 'phrase'] satisfies readonly MatchType[],
} as const;

export const bannedFinalUrlPatterns = [
  '/tracking',
  '/tracking/{ref}',
  '/success/{ref}',
  '/locate/{token}',
  '/track/customer/{token}',
  '/track/driver/{token}',
  '/compare',
  '/compare/{slug}',
  '/pricing-faq',
  '/services/{city}',
] as const;

export const needsConfirmationRoutePatterns = [
  '/mobile-tyre-fitting-{city}-price',
  '/{service}/{city}/{area}',
  '/emergency-tyre-fitting/{city}/{area}',
  '/puncture-repair/{city}/{area}',
] as const;
