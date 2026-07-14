import { bannedFinalUrlPatterns, campaignRules } from './campaign-rules';
import { landingPageMappings } from './landing-page-map';
import type {
  AdGroupPlan,
  KeywordPlan,
  LandingPageMapping,
  LaunchPlan,
  SafetySeverity,
  ValidationMessage,
  ValidationResult,
} from './types';

function message(
  severity: SafetySeverity,
  code: string,
  text: string,
  itemId?: string,
  routePath?: string,
): ValidationMessage {
  return { severity, code, message: text, itemId, routePath };
}

function result(messages: readonly ValidationMessage[]): ValidationResult {
  const errors = messages.filter((item) => item.severity === 'error');
  const warnings = messages.filter((item) => item.severity === 'warning');
  const confirmations = messages.filter((item) => item.severity === 'confirmation');

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    confirmations,
  };
}

function mergeResults(results: readonly ValidationResult[]): ValidationResult {
  return result(results.flatMap((item) => [...item.errors, ...item.warnings, ...item.confirmations]));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routePatternToRegex(pattern: string): RegExp {
  const tokenized = escapeRegex(pattern).replace(/\\\{[^}]+\\\}/g, '[^/]+');
  return new RegExp(`^${tokenized}$`);
}

function routeMatchesPattern(url: string, pattern: string): boolean {
  if (pattern.includes('{')) return routePatternToRegex(pattern).test(url);
  return url === pattern || url.startsWith(`${pattern}/`);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function activeReadyAdGroups(plan: LaunchPlan): readonly AdGroupPlan[] {
  return plan.adGroups.filter((adGroup) => adGroup.launchStatus === 'active_ready');
}

function allKeywords(plan: LaunchPlan): readonly KeywordPlan[] {
  return plan.adGroups.flatMap((adGroup) => [...adGroup.keywords]);
}

export function validateFinalUrlMapping(
  mappings: readonly LandingPageMapping[] = landingPageMappings,
): ValidationResult {
  const messages: ValidationMessage[] = [];

  for (const mapping of mappings) {
    if (mapping.isBannedFinalUrl && mapping.finalUrlSuitability === 'yes') {
      messages.push(
        message(
          'error',
          'BANNED_MAPPING_MARKED_SUITABLE',
          `${mapping.routePattern} is banned but marked suitable.`,
          mapping.id,
          mapping.routePattern,
        ),
      );
    }

    if (mapping.requiresArea && mapping.finalUrlSuitability !== 'needs_confirmation') {
      messages.push(
        message(
          'error',
          'AREA_ROUTE_NOT_CONFIRMATION_GATED',
          `${mapping.routePattern} is area-level and must require Ahmad confirmation.`,
          mapping.id,
          mapping.routePattern,
        ),
      );
    }

    if (mapping.requiresAhmadConfirmation) {
      messages.push(
        message(
          'confirmation',
          'MAPPING_NEEDS_AHMAD_CONFIRMATION',
          `${mapping.routePattern} requires Ahmad confirmation before use in ads.`,
          mapping.id,
          mapping.routePattern,
        ),
      );
    }
  }

  if (messages.length === 0) {
    messages.push(
      message(
        'confirmation',
        'FINAL_URL_MAPPING_OK',
        'Landing page mappings are gated by suitability and confirmation flags.',
      ),
    );
  }

  return result(messages);
}

export function validateAdGroupCountForBudget(plan: LaunchPlan): ValidationResult {
  const activeReadyCount = activeReadyAdGroups(plan).length;
  const messages: ValidationMessage[] = [];

  if (activeReadyCount > plan.maxActiveReadyAdGroupsDefault) {
    messages.push(
      message(
        'error',
        'ACTIVE_READY_LIMIT_EXCEEDED',
        `${activeReadyCount} active-ready ad groups exceeds the ${plan.maxActiveReadyAdGroupsDefault} default limit.`,
      ),
    );
  } else if (activeReadyCount > plan.maxActiveReadyAdGroupsStrict) {
    messages.push(
      message(
        'warning',
        'STRICT_ACTIVE_READY_LIMIT_EXCEEDED',
        `${activeReadyCount} active-ready ad groups exceeds strict mode ${plan.maxActiveReadyAdGroupsStrict}. Use only if CPC is not high.`,
      ),
    );
  } else if (activeReadyCount < plan.minActiveReadyAdGroups) {
    messages.push(
      message(
        'warning',
        'ACTIVE_READY_BELOW_MINIMUM',
        `${activeReadyCount} active-ready ad groups is below the ${plan.minActiveReadyAdGroups} recommended minimum.`,
      ),
    );
  } else {
    messages.push(
      message(
        'confirmation',
        'ACTIVE_READY_COUNT_SAFE',
        `${activeReadyCount} active-ready ad groups fits the GBP ${plan.dailyBudgetGBP}/day safety model.`,
      ),
    );
  }

  return result(messages);
}

export function validateNoBroadMatch(plan: LaunchPlan): ValidationResult {
  const broadKeywords = plan.adGroups.flatMap((adGroup) =>
    adGroup.keywords
      .filter((keyword) => keyword.matchType === 'broad')
      .map((keyword) => ({ adGroup, keyword })),
  );

  if (broadKeywords.length === 0) {
    return result([
      message('confirmation', 'NO_BROAD_MATCH', 'No broad match keywords appear in the launch plan.'),
    ]);
  }

  return result(
    broadKeywords.map(({ adGroup, keyword }) =>
      message(
        'error',
        'BROAD_MATCH_BLOCKED',
        `Broad match keyword "${keyword.text}" is blocked.`,
        adGroup.id,
        adGroup.finalUrl,
      ),
    ),
  );
}

export function validateNoBannedFinalUrls(plan: LaunchPlan): ValidationResult {
  const messages: ValidationMessage[] = [];

  for (const adGroup of plan.adGroups) {
    const matchedPattern = bannedFinalUrlPatterns.find((pattern) =>
      routeMatchesPattern(adGroup.finalUrl, pattern),
    );
    if (matchedPattern) {
      messages.push(
        message(
          'error',
          'BANNED_FINAL_URL',
          `${adGroup.adGroupName} uses banned final URL pattern ${matchedPattern}.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }
  }

  if (messages.length === 0) {
    messages.push(
      message('confirmation', 'NO_BANNED_FINAL_URLS', 'No ad group uses a banned final URL.'),
    );
  }

  return result(messages);
}

export function validateNoLegacyRoutes(plan: LaunchPlan): ValidationResult {
  const legacyGroups = plan.adGroups.filter((adGroup) => routeMatchesPattern(adGroup.finalUrl, '/services/{city}'));

  if (legacyGroups.length === 0) {
    return result([
      message('confirmation', 'NO_LEGACY_ROUTES', 'No ad group uses /services/{city}.'),
    ]);
  }

  return result(
    legacyGroups.map((adGroup) =>
      message(
        'error',
        'LEGACY_ROUTE_BLOCKED',
        `${adGroup.adGroupName} uses legacy /services/{city}.`,
        adGroup.id,
        adGroup.finalUrl,
      ),
    ),
  );
}

export function validateNoTrackingOrSuccessRoutes(plan: LaunchPlan): ValidationResult {
  const blockedPatterns = [
    '/tracking',
    '/tracking/{ref}',
    '/success/{ref}',
    '/locate/{token}',
    '/track/customer/{token}',
    '/track/driver/{token}',
  ] as const;

  const messages: ValidationMessage[] = [];
  for (const adGroup of plan.adGroups) {
    const matchedPattern = blockedPatterns.find((pattern) =>
      routeMatchesPattern(adGroup.finalUrl, pattern),
    );
    if (matchedPattern) {
      messages.push(
        message(
          'error',
          'POST_BOOKING_ROUTE_BLOCKED',
          `${adGroup.adGroupName} uses post-booking route ${matchedPattern}.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }
  }

  if (messages.length === 0) {
    messages.push(
      message(
        'confirmation',
        'NO_TRACKING_SUCCESS_ROUTES',
        'No tracking, success, or location-share route is used as a final URL.',
      ),
    );
  }

  return result(messages);
}

export function validateManualApprovalRequired(plan: LaunchPlan): ValidationResult {
  const messages: ValidationMessage[] = [];

  for (const adGroup of activeReadyAdGroups(plan)) {
    if (!adGroup.finalUrlApproved) {
      messages.push(
        message(
          'error',
          'FINAL_URL_APPROVAL_REQUIRED',
          `${adGroup.adGroupName} is active-ready without manual final URL approval.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }

    if (campaignRules.requireConfirmedService && !adGroup.serviceConfirmed) {
      messages.push(
        message(
          'error',
          'SERVICE_CONFIRMATION_REQUIRED',
          `${adGroup.adGroupName} is active-ready without confirmed service intent.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }

    if (campaignRules.requireConfirmedCity && adGroup.citySlug && !adGroup.cityConfirmed) {
      messages.push(
        message(
          'error',
          'CITY_CONFIRMATION_REQUIRED',
          `${adGroup.adGroupName} is active-ready without confirmed city intent.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }

    if (campaignRules.requireConfirmedFinalUrl && adGroup.finalUrlSuitability !== 'yes') {
      messages.push(
        message(
          'error',
          'FINAL_URL_SUITABILITY_REQUIRED',
          `${adGroup.adGroupName} is active-ready with final URL suitability ${adGroup.finalUrlSuitability}.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }
  }

  if (messages.length === 0) {
    messages.push(
      message(
        'confirmation',
        'MANUAL_APPROVAL_REQUIREMENTS_MET',
        'All active-ready ad groups have confirmed service, city, and final URL approval.',
      ),
    );
  }

  return result(messages);
}

export function validateServiceCityIntentMatch(plan: LaunchPlan): ValidationResult {
  const messages: ValidationMessage[] = [];

  for (const adGroup of plan.adGroups) {
    const mapping = landingPageMappings.find((item) => item.id === adGroup.intent);
    if (!mapping) {
      messages.push(
        message(
          'error',
          'INTENT_MAPPING_MISSING',
          `${adGroup.adGroupName} has no landing page mapping for ${adGroup.intent}.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
      continue;
    }

    if (!routePatternToRegex(mapping.routePattern).test(adGroup.finalUrl)) {
      messages.push(
        message(
          'error',
          'FINAL_URL_INTENT_MISMATCH',
          `${adGroup.adGroupName} final URL does not match ${mapping.routePattern}.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
    }
  }

  if (messages.length === 0) {
    messages.push(
      message('confirmation', 'SERVICE_CITY_INTENT_MATCH', 'All final URLs match their campaign intent patterns.'),
    );
  }

  return result(messages);
}

export function validateDuplicateAdGroups(plan: LaunchPlan): ValidationResult {
  const seen = new Map<string, string>();
  const messages: ValidationMessage[] = [];

  for (const adGroup of plan.adGroups) {
    const key = normalize(adGroup.adGroupName);
    const existing = seen.get(key);
    if (existing) {
      messages.push(
        message(
          'error',
          'DUPLICATE_AD_GROUP',
          `${adGroup.adGroupName} duplicates another ad group.`,
          adGroup.id,
          adGroup.finalUrl,
        ),
      );
      messages.push(
        message(
          'error',
          'DUPLICATE_AD_GROUP_SOURCE',
          `${adGroup.adGroupName} duplicate source.`,
          existing,
        ),
      );
    } else {
      seen.set(key, adGroup.id);
    }
  }

  if (messages.length === 0) {
    messages.push(message('confirmation', 'NO_DUPLICATE_AD_GROUPS', 'No duplicate ad group names found.'));
  }

  return result(messages);
}

export function validateDuplicateKeywordsWithinAdGroup(plan: LaunchPlan): ValidationResult {
  const messages: ValidationMessage[] = [];

  for (const adGroup of plan.adGroups) {
    const seen = new Set<string>();
    for (const keyword of adGroup.keywords) {
      const key = `${normalize(keyword.text)}::${keyword.matchType}`;
      if (seen.has(key)) {
        messages.push(
          message(
            'error',
            'DUPLICATE_KEYWORD_WITHIN_AD_GROUP',
            `${adGroup.adGroupName} duplicates keyword "${keyword.text}" (${keyword.matchType}).`,
            adGroup.id,
            adGroup.finalUrl,
          ),
        );
      }
      seen.add(key);
    }
  }

  if (messages.length === 0) {
    messages.push(
      message('confirmation', 'NO_DUPLICATE_KEYWORDS_WITHIN_AD_GROUP', 'No duplicate keywords within ad groups.'),
    );
  }

  return result(messages);
}

export function validateConflictingKeywordsAcrossAdGroups(plan: LaunchPlan): ValidationResult {
  const keywordOwners = new Map<string, readonly string[]>();

  for (const adGroup of plan.adGroups) {
    for (const keyword of adGroup.keywords) {
      const key = `${normalize(keyword.text)}::${keyword.matchType}`;
      const owners = keywordOwners.get(key) ?? [];
      keywordOwners.set(key, [...owners, adGroup.id]);
    }
  }

  const messages = [...keywordOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([key, owners]) =>
      message(
        'warning',
        'CONFLICTING_KEYWORD_ACROSS_AD_GROUPS',
        `Keyword ${key} appears in ${owners.length} ad groups.`,
        owners.join(', '),
      ),
    );

  if (messages.length === 0) {
    messages.push(
      message('confirmation', 'NO_CONFLICTING_KEYWORDS', 'No conflicting duplicate keywords across ad groups.'),
    );
  }

  return result(messages);
}

export function validateLaunchPlan(plan: LaunchPlan): ValidationResult {
  const networkMessages: ValidationMessage[] = [];

  if (plan.broadMatchAllowed) {
    networkMessages.push(
      message('error', 'BROAD_MATCH_DEFAULT_ENABLED', 'Broad match is enabled in planning defaults.'),
    );
  }

  if (plan.searchPartnersAllowed) {
    networkMessages.push(
      message('error', 'SEARCH_PARTNERS_ENABLED', 'Search Partners must be disabled in planning defaults.'),
    );
  }

  if (plan.displayExpansionAllowed) {
    networkMessages.push(
      message('error', 'DISPLAY_EXPANSION_ENABLED', 'Display expansion must be disabled in planning defaults.'),
    );
  }

  if (networkMessages.length === 0) {
    networkMessages.push(
      message(
        'confirmation',
        'NETWORK_DEFAULTS_SAFE',
        'Broad match, Search Partners, and Display expansion are disabled by defaults.',
      ),
    );
  }

  return mergeResults([
    result(networkMessages),
    validateAdGroupCountForBudget(plan),
    validateNoBroadMatch(plan),
    validateNoBannedFinalUrls(plan),
    validateNoLegacyRoutes(plan),
    validateNoTrackingOrSuccessRoutes(plan),
    validateManualApprovalRequired(plan),
    validateServiceCityIntentMatch(plan),
    validateDuplicateAdGroups(plan),
    validateDuplicateKeywordsWithinAdGroup(plan),
    validateConflictingKeywordsAcrossAdGroups(plan),
  ]);
}

export function getActiveReadyAdGroupCount(plan: LaunchPlan): number {
  return activeReadyAdGroups(plan).length;
}

export function getLaunchKeywordCount(plan: LaunchPlan): number {
  return allKeywords(plan).length;
}
