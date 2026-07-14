export type CampaignNetwork = 'Search Network Only';
export type CurrencyCode = 'GBP';
export type BiddingStrategy = 'Maximize Conversions';
export type CampaignService =
  | 'emergency-tyre-fitting'
  | 'puncture-repair'
  | 'mobile-tyre-fitting'
  | 'tracking'
  | 'booking'
  | 'comparison';

export interface PriceItem {
  readonly id: 'fitting' | 'emergency' | 'punctureRepair';
  readonly service: CampaignService;
  readonly label: string;
  readonly fromAmount: number;
  readonly unit: string;
  readonly note: string;
}

export interface LandingPage {
  readonly path: string;
  readonly title: string;
  readonly service: CampaignService;
  readonly citySlug?: string;
  readonly areaSlug?: string;
  readonly intent: string;
}

export interface ServiceArea {
  readonly citySlug: string;
  readonly cityName: string;
  readonly areaSlug: string;
  readonly areaName: string;
  readonly postcode: string;
  readonly county: string;
  readonly landmark: string;
  readonly responseMinutes: number;
  readonly emergencyPath: string;
  readonly punctureRepairPath?: string;
}

export interface AdGroup {
  readonly id: string;
  readonly name: string;
  readonly intent: string;
  readonly landingPath: string;
  readonly dailyBudget: number;
  readonly keywordThemes: readonly string[];
}

export interface Campaign {
  readonly accountName: string;
  readonly name: string;
  readonly network: CampaignNetwork;
  readonly dailyBudget: number;
  readonly monthlyBudget: number;
  readonly currency: CurrencyCode;
  readonly bidding: {
    readonly initialStrategy: BiddingStrategy;
    readonly initialConversionThreshold: number;
    readonly targetCpaRange: readonly [number, number];
  };
  readonly phone: {
    readonly display: string;
    readonly tel: string;
    readonly href: string;
  };
  readonly coverage: {
    readonly label: string;
    readonly excluded: readonly string[];
  };
  readonly responsePromiseMinutes: number;
  readonly service: string;
  readonly priceItems: readonly PriceItem[];
  readonly serviceAreas: readonly ServiceArea[];
  readonly landingPages: readonly LandingPage[];
  readonly adGroups: readonly AdGroup[];
}

export const EMERGENCY_PHONE_DISPLAY = '0141 266 0690' as const;
export const EMERGENCY_PHONE_TEL = '01412660690' as const;
export const EMERGENCY_PHONE_HREF = `tel:${EMERGENCY_PHONE_TEL}` as const;
export const EMERGENCY_RESPONSE_MINUTES = 45 as const;

export const EMERGENCY_PRICE_ITEMS = [
  {
    id: 'fitting',
    service: 'mobile-tyre-fitting',
    label: 'Tyre fitting',
    fromAmount: 20,
    unit: 'per tyre fitting fee',
    note: 'Tyre price varies by size and brand.',
  },
  {
    id: 'emergency',
    service: 'emergency-tyre-fitting',
    label: 'Emergency callout',
    fromAmount: 49,
    unit: 'callout fee',
    note: 'Confirmed before dispatch. Tyre price is separate.',
  },
  {
    id: 'punctureRepair',
    service: 'puncture-repair',
    label: 'Puncture repair',
    fromAmount: 25,
    unit: 'repair where safe',
    note: 'Subject to the tyre being legally repairable.',
  },
] as const satisfies readonly PriceItem[];

export const EMERGENCY_SERVICE_AREAS = [
  {
    citySlug: 'glasgow',
    cityName: 'Glasgow',
    areaSlug: 'city-centre',
    areaName: 'City Centre',
    postcode: 'G1',
    county: 'Glasgow City',
    landmark: 'George Square',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/glasgow/city-centre',
    punctureRepairPath: '/puncture-repair/glasgow/city-centre',
  },
  {
    citySlug: 'edinburgh',
    cityName: 'Edinburgh',
    areaSlug: 'old-town',
    areaName: 'Old Town',
    postcode: 'EH1',
    county: 'City of Edinburgh',
    landmark: 'Edinburgh Castle',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/edinburgh/old-town',
  },
  {
    citySlug: 'dundee',
    cityName: 'Dundee',
    areaSlug: 'city-centre',
    areaName: 'City Centre',
    postcode: 'DD1',
    county: 'City of Dundee',
    landmark: 'V&A Dundee',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/dundee/city-centre',
  },
  {
    citySlug: 'stirling',
    cityName: 'Stirling',
    areaSlug: 'city-centre',
    areaName: 'City Centre',
    postcode: 'FK8',
    county: 'Stirling',
    landmark: 'Stirling Castle',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/stirling/city-centre',
  },
  {
    citySlug: 'paisley',
    cityName: 'Paisley',
    areaSlug: 'town-centre',
    areaName: 'Town Centre',
    postcode: 'PA1',
    county: 'Renfrewshire',
    landmark: 'Paisley Abbey',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/paisley/town-centre',
  },
  {
    citySlug: 'hamilton',
    cityName: 'Hamilton',
    areaSlug: 'town-centre',
    areaName: 'Town Centre',
    postcode: 'ML3',
    county: 'South Lanarkshire',
    landmark: 'Hamilton Townhouse',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/hamilton/town-centre',
  },
  {
    citySlug: 'kilmarnock',
    cityName: 'Kilmarnock',
    areaSlug: 'town-centre',
    areaName: 'Town Centre',
    postcode: 'KA1',
    county: 'East Ayrshire',
    landmark: 'The Dick Institute',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/kilmarnock/town-centre',
  },
  {
    citySlug: 'ayr',
    cityName: 'Ayr',
    areaSlug: 'town-centre',
    areaName: 'Town Centre',
    postcode: 'KA7',
    county: 'South Ayrshire',
    landmark: 'Burns Statue Square',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/ayr/town-centre',
  },
  {
    citySlug: 'kirkcaldy',
    cityName: 'Kirkcaldy',
    areaSlug: 'town-centre',
    areaName: 'Town Centre',
    postcode: 'KY1',
    county: 'Fife',
    landmark: 'Kirkcaldy High Street',
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: '/emergency-tyre-fitting/kirkcaldy/town-centre',
  },
] as const satisfies readonly ServiceArea[];

type EmergencyServiceAreaItem = (typeof EMERGENCY_SERVICE_AREAS)[number];

function getConfiguredPunctureRepairPath(area: EmergencyServiceAreaItem): string | undefined {
  return 'punctureRepairPath' in area ? area.punctureRepairPath : undefined;
}

export const EMERGENCY_LANDING_PAGES = [
  {
    path: '/emergency',
    title: 'Emergency Tyre Fitting',
    service: 'emergency-tyre-fitting',
    intent: 'Emergency intent landing page',
  },
  {
    path: '/book',
    title: 'Book Online',
    service: 'booking',
    intent: 'Booking conversion flow',
  },
  {
    path: '/tracking',
    title: 'Track Your Fitter',
    service: 'tracking',
    intent: 'Existing customer tracking flow',
  },
  {
    path: '/tyres',
    title: 'Tyres',
    service: 'mobile-tyre-fitting',
    intent: 'Tyre browsing and quote support',
  },
  {
    path: '/compare',
    title: 'Compare Tyres',
    service: 'comparison',
    intent: 'Comparison content support',
  },
  {
    path: '/services/glasgow',
    title: 'Glasgow Services',
    service: 'mobile-tyre-fitting',
    citySlug: 'glasgow',
    intent: 'Glasgow service coverage',
  },
  ...EMERGENCY_SERVICE_AREAS.map((area) => ({
    path: area.emergencyPath,
    title: `Emergency Tyre Fitting ${area.cityName} ${area.areaName}`,
    service: 'emergency-tyre-fitting' as const,
    citySlug: area.citySlug,
    areaSlug: area.areaSlug,
    intent: 'Local emergency tyre fitting',
  })),
  ...EMERGENCY_SERVICE_AREAS.flatMap((area) => {
    const path = getConfiguredPunctureRepairPath(area);
    if (!path) return [];

    return [{
      path,
      title: `Puncture Repair ${area.cityName} ${area.areaName}`,
      service: 'puncture-repair' as const,
      citySlug: area.citySlug,
      areaSlug: area.areaSlug,
      intent: 'Local puncture repair',
    }];
  }),
] as const satisfies readonly LandingPage[];

export const EMERGENCY_AD_GROUPS = [
  {
    id: 'emergency-glasgow-core',
    name: 'Emergency Glasgow Core',
    intent: 'Emergency tyre fitting in Glasgow',
    landingPath: '/emergency-tyre-fitting/glasgow/city-centre',
    dailyBudget: 65,
    keywordThemes: [
      'emergency tyre fitting glasgow',
      '24 hour tyre fitter glasgow',
      'mobile tyre fitter near me',
    ],
  },
  {
    id: 'flat-tyre-glasgow',
    name: 'Flat Tyre Glasgow',
    intent: 'Flat tyre help and roadside tyre support',
    landingPath: '/emergency',
    dailyBudget: 35,
    keywordThemes: [
      'flat tyre help glasgow',
      'roadside tyre assistance',
      'flat tyre mobile fitter',
    ],
  },
  {
    id: 'paisley-renfrew-clyde',
    name: 'Paisley / Renfrew / Clydebank',
    intent: 'West Scotland emergency tyre calls',
    landingPath: '/emergency-tyre-fitting/paisley/town-centre',
    dailyBudget: 35,
    keywordThemes: [
      'emergency tyre fitting paisley',
      'mobile tyre fitter renfrew',
      'flat tyre paisley',
    ],
  },
  {
    id: 'edinburgh-core',
    name: 'Emergency Edinburgh Core',
    intent: 'Emergency tyre fitting in Edinburgh',
    landingPath: '/emergency-tyre-fitting/edinburgh/old-town',
    dailyBudget: 60,
    keywordThemes: [
      'emergency tyre fitting edinburgh',
      '24 hour tyre fitter edinburgh',
      'flat tyre edinburgh',
    ],
  },
  {
    id: 'dundee-stirling',
    name: 'Dundee / Stirling Emergency',
    intent: 'Emergency tyre help in Dundee and Stirling',
    landingPath: '/emergency-tyre-fitting/dundee/city-centre',
    dailyBudget: 50,
    keywordThemes: [
      'emergency tyre fitting dundee',
      'emergency tyre fitting stirling',
      'mobile tyre fitter dundee',
    ],
  },
  {
    id: 'ayrshire-core',
    name: 'Kilmarnock / Ayr Emergency',
    intent: 'Ayrshire emergency tyre assistance',
    landingPath: '/emergency-tyre-fitting/kilmarnock/town-centre',
    dailyBudget: 45,
    keywordThemes: [
      'emergency tyre fitting kilmarnock',
      'emergency tyre fitting ayr',
      'flat tyre ayrshire',
    ],
  },
  {
    id: 'fife-core',
    name: 'Fife / Kirkcaldy Emergency',
    intent: 'Fife emergency tyre fitting',
    landingPath: '/emergency-tyre-fitting/kirkcaldy/town-centre',
    dailyBudget: 35,
    keywordThemes: [
      'emergency tyre fitting kirkcaldy',
      'mobile tyre fitter fife',
      'flat tyre kirkcaldy',
    ],
  },
  {
    id: 'puncture-repair-glasgow',
    name: 'Puncture Repair Glasgow',
    intent: 'Repairable puncture searches',
    landingPath: '/puncture-repair/glasgow/city-centre',
    dailyBudget: 25,
    keywordThemes: [
      'puncture repair glasgow',
      'mobile puncture repair',
      'tyre repair near me',
    ],
  },
  {
    id: 'motorway-assistance',
    name: 'Motorway Tyre Assistance',
    intent: 'Motorway and roadside tyre help',
    landingPath: '/emergency',
    dailyBudget: 30,
    keywordThemes: [
      'motorway tyre assistance',
      'roadside tyre fitting',
      'mobile tyre emergency',
    ],
  },
] as const satisfies readonly AdGroup[];

export const emergencyCampaign = {
  accountName: 'Tyre Rescue Scotland',
  name: '[TR] Search Emergency - Scotland Mainland',
  network: 'Search Network Only',
  dailyBudget: 380,
  monthlyBudget: 11400,
  currency: 'GBP',
  bidding: {
    initialStrategy: 'Maximize Conversions',
    initialConversionThreshold: 30,
    targetCpaRange: [18, 22],
  },
  phone: {
    display: EMERGENCY_PHONE_DISPLAY,
    tel: EMERGENCY_PHONE_TEL,
    href: EMERGENCY_PHONE_HREF,
  },
  coverage: {
    label: 'Scotland mainland only',
    excluded: ['Scottish islands'],
  },
  responsePromiseMinutes: EMERGENCY_RESPONSE_MINUTES,
  service: '24/7 emergency mobile tyre fitting',
  priceItems: EMERGENCY_PRICE_ITEMS,
  serviceAreas: EMERGENCY_SERVICE_AREAS,
  landingPages: EMERGENCY_LANDING_PAGES,
  adGroups: EMERGENCY_AD_GROUPS,
} as const satisfies Campaign;

export function getEmergencyServiceArea(
  citySlug: string,
  areaSlug: string,
): ServiceArea | undefined {
  return EMERGENCY_SERVICE_AREAS.find(
    (area) => area.citySlug === citySlug && area.areaSlug === areaSlug,
  );
}

export function getPunctureRepairServiceArea(
  citySlug: string,
  areaSlug: string,
): ServiceArea | undefined {
  const area = getEmergencyServiceArea(citySlug, areaSlug);
  return area?.punctureRepairPath ? area : undefined;
}

export function getEmergencyServiceAreaParams() {
  return EMERGENCY_SERVICE_AREAS.map((area) => ({
    city: area.citySlug,
    area: area.areaSlug,
  }));
}

export function getPunctureRepairServiceAreaParams() {
  return EMERGENCY_SERVICE_AREAS.flatMap((area) => {
    if (!getConfiguredPunctureRepairPath(area)) return [];

    return [{
      city: area.citySlug,
      area: area.areaSlug,
    }];
  });
}
