export type ServiceSlug =
  | 'mobile-tyre-fitting'
  | 'emergency-tyre-fitting'
  | 'tyre-repair'
  | 'puncture-repair'
  | 'tyre-fitting';

export type CitySlug =
  | 'glasgow'
  | 'edinburgh'
  | 'dundee'
  | 'stirling'
  | 'falkirk'
  | 'paisley'
  | 'hamilton'
  | 'east-kilbride'
  | 'motherwell'
  | 'livingston'
  | 'kirkcaldy'
  | 'perth'
  | 'cumbernauld'
  | 'dumfries'
  | 'greenock'
  | 'dunfermline'
  | 'kilmarnock'
  | 'ayr'
  | 'irvine';

export type CampaignIntent =
  | 'emergency_general'
  | 'emergency_near_me'
  | 'emergency_city'
  | 'emergency_area'
  | 'mobile_tyre_fitting_city'
  | 'mobile_tyre_fitting_area'
  | 'mobile_tyre_fitting_city_price'
  | 'puncture_repair_city'
  | 'puncture_repair_area'
  | 'tyre_repair_city'
  | 'tyre_fitting_city'
  | 'tyres_catalogue'
  | 'booking'
  | 'quote'
  | 'contact'
  | 'legacy_city_hub'
  | 'comparison'
  | 'tracking'
  | 'post_booking'
  | 'location_share'
  | 'pricing_faq';

export type FinalUrlSuitability = 'yes' | 'no' | 'maybe' | 'needs_confirmation';

export type AdGroupLaunchStatus =
  | 'draft'
  | 'paused'
  | 'active_ready'
  | 'blocked'
  | 'archived';

export type MatchType = 'exact' | 'phrase' | 'broad';

export type SafetySeverity = 'error' | 'warning' | 'confirmation';

export interface LandingPageMapping {
  readonly id: CampaignIntent;
  readonly routePattern: string;
  readonly exampleUrl: string;
  readonly serviceSlug?: ServiceSlug;
  readonly requiresCity: boolean;
  readonly requiresArea: boolean;
  readonly finalUrlSuitability: FinalUrlSuitability;
  readonly coldTrafficDefault: boolean;
  readonly requiresAhmadConfirmation: boolean;
  readonly isBannedFinalUrl: boolean;
  readonly bestAdGroupType: string;
  readonly notes: string;
}

export interface RouteAuditItem {
  readonly routePath: string;
  readonly pageName: string;
  readonly h1: string;
  readonly serviceIntent: string;
  readonly locationIntent: string;
  readonly ctaIntent: string;
  readonly bestGoogleAdsIntent: string;
  readonly bestAdGroupType: string;
  readonly suitableAsFinalUrl: FinalUrlSuitability;
  readonly unsuitableReason?: string;
  readonly mixupRisk: string;
  readonly namingIssue: string;
  readonly suspiciousLinkIssue: string;
  readonly recommendedCorrectionOrConfirmation: string;
}

export interface CampaignSafetyIssue {
  readonly id: string;
  readonly severity: SafetySeverity;
  readonly title: string;
  readonly routePath?: string;
  readonly description: string;
  readonly requiredAction: string;
}

export interface KeywordPlan {
  readonly text: string;
  readonly matchType: MatchType;
  readonly intent: CampaignIntent;
}

export interface NegativeKeywordPlan {
  readonly text: string;
  readonly reason: string;
  readonly editable: true;
}

export interface AdCopyPlan {
  readonly headlineIdeas: readonly string[];
  readonly descriptionIdeas: readonly string[];
  readonly riskyClaimsFlagged: readonly string[];
}

export interface AdGroupPlan {
  readonly id: string;
  readonly campaignName: string;
  readonly adGroupName: string;
  readonly intent: CampaignIntent;
  readonly serviceSlug?: ServiceSlug;
  readonly citySlug?: CitySlug;
  readonly finalUrl: string;
  readonly finalUrlSuitability: FinalUrlSuitability;
  readonly launchStatus: AdGroupLaunchStatus;
  readonly serviceConfirmed: boolean;
  readonly cityConfirmed: boolean;
  readonly finalUrlApproved: boolean;
  readonly needsAhmadConfirmation: boolean;
  readonly confirmationNote: string;
  readonly keywords: readonly KeywordPlan[];
  readonly adCopy: AdCopyPlan;
}

export interface CampaignPlan {
  readonly campaignName: string;
  readonly intent: CampaignIntent;
  readonly defaultStatus: AdGroupLaunchStatus;
  readonly notes: string;
}

export interface LaunchPlan {
  readonly name: string;
  readonly dailyBudgetGBP: number;
  readonly maxActiveReadyAdGroupsDefault: number;
  readonly maxActiveReadyAdGroupsStrict: number;
  readonly minActiveReadyAdGroups: number;
  readonly matchTypesDefault: readonly MatchType[];
  readonly broadMatchAllowed: boolean;
  readonly searchPartnersAllowed: boolean;
  readonly displayExpansionAllowed: boolean;
  readonly requireManualFinalUrlApproval: boolean;
  readonly requireManualAdGroupApproval: boolean;
  readonly campaigns: readonly CampaignPlan[];
  readonly adGroups: readonly AdGroupPlan[];
  readonly negativeKeywords: readonly NegativeKeywordPlan[];
}

export interface ValidationMessage {
  readonly code: string;
  readonly severity: SafetySeverity;
  readonly message: string;
  readonly itemId?: string;
  readonly routePath?: string;
}

export interface ValidationResult {
  readonly passed: boolean;
  readonly errors: readonly ValidationMessage[];
  readonly warnings: readonly ValidationMessage[];
  readonly confirmations: readonly ValidationMessage[];
}
