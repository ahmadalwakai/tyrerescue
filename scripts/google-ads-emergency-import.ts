import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAreasForCity } from '../lib/areas';
import { getCityBySlug } from '../lib/cities';

const outputDir = path.join(process.cwd(), 'artifacts', 'google-ads', 'emergency-search-2026-06-28');
const baseUrl = 'https://www.tyrerescue.uk';
const phone = '0141 266 0690';
const phoneCompact = '01412660690';
const campaignStatus = 'Paused';
const adGroupStatus = 'Enabled';
const itemStatus = 'Enabled';
const currency = 'GBP';

type CampaignConfig = {
  readonly name: string;
  readonly budget: number;
  readonly citySlugs: readonly string[];
  readonly extraLocations?: readonly string[];
};

type AdGroupConfig = {
  readonly campaign: string;
  readonly adGroup: string;
  readonly citySlug?: string;
  readonly cityName?: string;
  readonly areaSlug?: string;
  readonly areaName?: string;
  readonly finalUrl: string;
  readonly path1: string;
  readonly path2: string;
  readonly theme: 'emergency-area' | 'puncture-area' | 'city-core' | 'flat-tyre' | 'motorway';
};

const campaigns: readonly CampaignConfig[] = [
  {
    name: '[TR] Search Emergency - Glasgow & West',
    budget: 135,
    citySlugs: [
      'glasgow',
      'paisley',
      'greenock',
      'hamilton',
      'east-kilbride',
      'motherwell',
      'cumbernauld',
    ],
  },
  {
    name: '[TR] Search Emergency - Edinburgh & East',
    budget: 85,
    citySlugs: ['edinburgh', 'livingston', 'dunfermline', 'kirkcaldy'],
  },
  {
    name: '[TR] Search Emergency - Dundee Perth North East',
    budget: 55,
    citySlugs: ['dundee', 'perth'],
    extraLocations: ['Aberdeen', 'Stonehaven', 'Forfar', 'Arbroath', 'Montrose'],
  },
  {
    name: '[TR] Search Emergency - Central Forth Valley',
    budget: 40,
    citySlugs: ['stirling', 'falkirk'],
    extraLocations: ['Alloa', 'Grangemouth', 'Larbert', 'Denny'],
  },
  {
    name: '[TR] Search Emergency - Ayrshire South West Borders',
    budget: 40,
    citySlugs: ['kilmarnock', 'ayr', 'irvine', 'dumfries'],
    extraLocations: ['Troon', 'Prestwick', 'Galashiels', 'Hawick', 'Peebles'],
  },
  {
    name: '[TR] Search Emergency - Highlands Mainland A9',
    budget: 25,
    citySlugs: [],
    extraLocations: ['Inverness', 'Aviemore', 'Fort William', 'Nairn', 'Elgin', 'Dingwall'],
  },
];

const motorwayGroups = [
  ['M8 Glasgow Edinburgh', '[TR] Search Emergency - Glasgow & West'],
  ['M74 Glasgow Carlisle', '[TR] Search Emergency - Glasgow & West'],
  ['M77 Glasgow Ayrshire', '[TR] Search Emergency - Ayrshire South West Borders'],
  ['M80 Glasgow Stirling', '[TR] Search Emergency - Central Forth Valley'],
  ['M9 Edinburgh Stirling', '[TR] Search Emergency - Central Forth Valley'],
  ['M90 Fife Perth', '[TR] Search Emergency - Edinburgh & East'],
  ['A9 Perth Inverness', '[TR] Search Emergency - Highlands Mainland A9'],
  ['A90 Dundee Aberdeen', '[TR] Search Emergency - Dundee Perth North East'],
  ['A82 Glasgow Fort William', '[TR] Search Emergency - Highlands Mainland A9'],
  ['A77 Glasgow Ayr Stranraer', '[TR] Search Emergency - Ayrshire South West Borders'],
  ['A75 Dumfries Stranraer', '[TR] Search Emergency - Ayrshire South West Borders'],
  ['A1 Edinburgh Borders', '[TR] Search Emergency - Edinburgh & East'],
] as const;

const islandExclusions = [
  'Orkney Islands',
  'Shetland Islands',
  'Na h-Eileanan Siar',
  'Outer Hebrides',
  'Isle of Skye',
  'Isle of Mull',
  'Isle of Arran',
  'Isle of Islay',
  'Isle of Jura',
  'Isle of Bute',
  'Isle of Tiree',
  'Isle of Coll',
  'Isle of Lewis',
  'Isle of Harris',
  'North Uist',
  'South Uist',
  'Benbecula',
  'Barra',
  'Stornoway',
  'Kirkwall',
  'Lerwick',
  'Portree',
  'Rothesay',
  'Tobermory',
];

const negativeTerms = [
  'jobs',
  'job',
  'career',
  'careers',
  'vacancy',
  'vacancies',
  'salary',
  'apprenticeship',
  'training',
  'course',
  'courses',
  'diy',
  'how to',
  'youtube',
  'video',
  'manual',
  'forum',
  'pdf',
  'free',
  'kit',
  'repair kit',
  'puncture kit',
  'tyre machine',
  'tyre changer',
  'garage equipment',
  'wholesale',
  'supplier',
  'suppliers',
  'bicycle',
  'bike',
  'cycle',
  'motorcycle',
  'motorbike',
  'scooter',
  'tractor',
  'tyre pressure',
  'air pump',
  'compressor',
  'mot',
  'alloy wheel repair',
  'car wash',
  'scrap tyres',
  'tyre disposal',
  'used tyres wholesale',
  'part worn wholesale',
  ...islandExclusions.map((item) => item.toLowerCase()),
  'isle of',
  'ferry',
  'calmac',
  'northlink',
];

const sitelinks = [
  ['Book Online', '/book', 'Choose emergency fitting', 'Confirm details online'],
  ['Call Emergency Team', '/emergency', '24/7 tyre help', 'Fast dispatch support'],
  ['Track Your Fitter', '/tracking', 'Live fitter tracking', 'See job progress'],
  ['Tyres & Sizes', '/tyres', 'Find tyre options', 'Confirm tyre size'],
  ['Compare Tyres', '/compare', 'Compare before fitting', 'Budget to premium'],
  ['Glasgow Emergency', '/emergency-tyre-fitting/glasgow/city-centre', 'Glasgow 24/7 help', 'City centre dispatch'],
  ['Edinburgh Emergency', '/emergency-tyre-fitting/edinburgh/old-town', 'Edinburgh 24/7 help', 'Old Town dispatch'],
  ['Puncture Repair', '/puncture-repair/glasgow/city-centre', 'Repair where safe', 'From \u00a325'],
] as const;

const callouts = [
  '24/7 Emergency Help',
  '45 Min Response',
  'Mainland Scotland',
  'No Islands',
  'Callout From \u00a349',
  'Fitting From \u00a320',
  'Repair From \u00a325',
  'Mobile Fitter To You',
  'Price Confirmed First',
  'Roadside Tyre Help',
  'Tyre Size Checked',
  'Book Online',
] as const;

const structuredSnippets = [
  ['Services', 'Emergency tyre fitting;Flat tyre help;Puncture repair;Mobile tyre fitter'],
  ['Coverage', 'Glasgow;Edinburgh;Dundee;Stirling;Paisley;Hamilton;Ayr;Kirkcaldy'],
  ['Roads', 'M8;M74;M77;M80;M9;M90;A9;A90;A82;A77'],
] as const;

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n') + '\n';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 15);
}

function compactName(value: string, max = 45): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd();
}

function headline(value: string): string {
  if (value.length > 30) {
    throw new Error(`Headline over 30 chars: ${value}`);
  }
  return value;
}

function description(value: string): string {
  if (value.length > 90) {
    throw new Error(`Description over 90 chars: ${value}`);
  }
  return value;
}

function uniqueRows<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

function keywordsForLocation(location: string, theme: AdGroupConfig['theme']): string[] {
  if (theme === 'puncture-area') {
    return [
      `puncture repair ${location}`,
      `mobile puncture repair ${location}`,
      `tyre repair ${location}`,
      `slow puncture ${location}`,
      `nail in tyre ${location}`,
      `puncture repair near ${location}`,
    ];
  }

  if (theme === 'flat-tyre') {
    return [
      `flat tyre ${location}`,
      `flat tyre help ${location}`,
      `flat tyre repair ${location}`,
      `roadside tyre help ${location}`,
      `tyre blowout ${location}`,
      `mobile tyre help ${location}`,
    ];
  }

  return [
    `emergency tyre fitting ${location}`,
    `emergency tyre fitter ${location}`,
    `24 hour tyre fitter ${location}`,
    `mobile tyre fitter ${location}`,
    `mobile tyre fitting ${location}`,
    `roadside tyre assistance ${location}`,
    `flat tyre help ${location}`,
    `tyre rescue ${location}`,
  ];
}

function buildAdGroups(): AdGroupConfig[] {
  const out: AdGroupConfig[] = [];

  for (const campaign of campaigns) {
    for (const citySlug of campaign.citySlugs) {
      const city = getCityBySlug(citySlug);
      if (!city) continue;

      out.push({
        campaign: campaign.name,
        adGroup: `${city.name} - Core Emergency`,
        citySlug,
        cityName: city.name,
        finalUrl: `${baseUrl}/emergency-tyre-fitting/${citySlug}`,
        path1: 'emergency',
        path2: slugify(city.name),
        theme: 'city-core',
      });

      out.push({
        campaign: campaign.name,
        adGroup: `${city.name} - Flat Tyre`,
        citySlug,
        cityName: city.name,
        finalUrl: `${baseUrl}/emergency-tyre-fitting/${citySlug}`,
        path1: 'flat-tyre',
        path2: slugify(city.name),
        theme: 'flat-tyre',
      });

      for (const area of getAreasForCity(citySlug)) {
        out.push({
          campaign: campaign.name,
          adGroup: compactName(`${city.name} - ${area.name} Emergency`),
          citySlug,
          cityName: city.name,
          areaSlug: area.slug,
          areaName: area.name,
          finalUrl: `${baseUrl}/emergency-tyre-fitting/${citySlug}/${area.slug}`,
          path1: 'emergency',
          path2: slugify(area.name),
          theme: 'emergency-area',
        });

        out.push({
          campaign: campaign.name,
          adGroup: compactName(`${city.name} - ${area.name} Puncture`),
          citySlug,
          cityName: city.name,
          areaSlug: area.slug,
          areaName: area.name,
          finalUrl: `${baseUrl}/puncture-repair/${citySlug}/${area.slug}`,
          path1: 'puncture',
          path2: slugify(area.name),
          theme: 'puncture-area',
        });
      }
    }
  }

  for (const [road, campaign] of motorwayGroups) {
    out.push({
      campaign,
      adGroup: `${road} - Roadside Tyres`,
      finalUrl: `${baseUrl}/emergency`,
      path1: 'roadside',
      path2: slugify(road),
      theme: 'motorway',
      areaName: road,
    });
  }

  for (const campaign of campaigns) {
    for (const location of campaign.extraLocations ?? []) {
      out.push({
        campaign: campaign.name,
        adGroup: `${location} - Emergency Generic`,
        areaName: location,
        finalUrl: `${baseUrl}/emergency`,
        path1: 'emergency',
        path2: slugify(location),
        theme: 'city-core',
      });
    }
  }

  return uniqueRows(out, (row) => `${row.campaign}|${row.adGroup}`);
}

function buildAdHeadlines(group: AdGroupConfig): Record<string, string> {
  const location = group.areaName || group.cityName || 'Scotland';
  const localHeadline =
    location.length <= 16
      ? `${location} Tyre Help`
      : group.cityName && group.cityName.length <= 16
        ? `${group.cityName} Tyre Help`
        : 'Local Tyre Rescue';

  const values = [
    headline('Emergency Tyre Fitting'),
    headline(`Call ${phone}`),
    headline('45 Min Response'),
    headline('24/7 Mobile Tyre Help'),
    headline('Mobile Tyre Fitter'),
    headline('Flat Tyre Help Now'),
    headline('Roadside Tyre Help'),
    headline('Mainland Scotland'),
    headline('Callout From \u00a349'),
    headline('Fitting From \u00a320'),
    headline('Repair From \u00a325'),
    headline('We Come To Your Location'),
    headline('No Tow Truck Needed'),
    headline('Book Online Now'),
    headline(localHeadline),
  ];

  return Object.fromEntries(values.map((value, index) => [`Headline ${index + 1}`, value]));
}

function buildDescriptions(group: AdGroupConfig): Record<string, string> {
  const location = group.areaName || group.cityName || 'mainland Scotland';
  const values = [
    description(`Flat tyre in ${location}? Call Tyre Rescue 24/7. Mainland Scotland only.`),
    description('Mobile tyre fitter sent to your location. Emergency callout from \u00a349.'),
    description('45-minute response where available. Tyre size and price confirmed first.'),
    description('Book online or call now. Fitting from \u00a320 and puncture repair from \u00a325.'),
  ];

  return Object.fromEntries(values.map((value, index) => [`Description ${index + 1}`, value]));
}

function buildFiles() {
  const adGroups = buildAdGroups();

  const campaignRows = campaigns.map((campaign) => ({
    Campaign: campaign.name,
    'Campaign type': 'Search',
    Networks: 'Google Search',
    'Campaign daily budget': campaign.budget,
    Currency: currency,
    'Bid strategy type': 'Maximize conversions',
    'Campaign status': campaignStatus,
    'Language targeting': 'en',
    Comment: 'Emergency Search only. Switch to Target CPA GBP18-22 after first 30 real conversions.',
  }));

  const locationRows = campaigns.flatMap((campaign) => [
    {
      Campaign: campaign.name,
      Location: 'Scotland',
      Type: '',
      Comment: 'Presence targeting should be set to people in or regularly in targeted locations.',
    },
    ...islandExclusions.map((location) => ({
      Campaign: campaign.name,
      Location: location,
      Type: 'Negative',
      Comment: 'Exclude Scottish islands from mainland-only emergency service.',
    })),
  ]);

  const adGroupRows = adGroups.map((group) => ({
    Campaign: group.campaign,
    'Ad group': group.adGroup,
    'Ad group status': adGroupStatus,
    'Ad group type': 'Standard',
    Comment: `${group.theme} landing ${group.finalUrl}`,
  }));

  const keywordRows = adGroups.flatMap((group) => {
    const location = group.areaName || group.cityName || 'Scotland';
    const sourceKeywords =
      group.theme === 'motorway'
        ? [
            `tyre assistance ${location}`,
            `flat tyre ${location}`,
            `roadside tyre fitting ${location}`,
            `motorway tyre help ${location}`,
            `mobile tyre fitter ${location}`,
            `tyre blowout ${location}`,
          ]
        : keywordsForLocation(location, group.theme);

    return sourceKeywords.flatMap((keyword) => [
      {
        Campaign: group.campaign,
        'Ad group': group.adGroup,
        Keyword: keyword,
        'Match type': 'Exact',
        Status: itemStatus,
        'Final URL': group.finalUrl,
      },
      {
        Campaign: group.campaign,
        'Ad group': group.adGroup,
        Keyword: keyword,
        'Match type': 'Phrase',
        Status: itemStatus,
        'Final URL': group.finalUrl,
      },
    ]);
  });

  const negativeRows = campaigns.flatMap((campaign) =>
    negativeTerms.map((keyword) => ({
      Campaign: campaign.name,
      Keyword: keyword,
      'Match type': 'Phrase',
      Type: 'Campaign negative',
    })),
  );

  const rsaRows = adGroups.map((group) => ({
    Campaign: group.campaign,
    'Ad group': group.adGroup,
    'Ad type': 'Responsive search ad',
    Status: itemStatus,
    'Final URL': group.finalUrl,
    'Path 1': group.path1,
    'Path 2': group.path2,
    ...buildAdHeadlines(group),
    'Headline 1 position': 1,
    'Headline 2 position': 2,
    ...buildDescriptions(group),
  }));

  const sitelinkRows = campaigns.flatMap((campaign) =>
    sitelinks.map(([text, url, desc1, desc2]) => ({
      Campaign: campaign.name,
      'Sitelink text': text,
      'Final URL': `${baseUrl}${url}`,
      'Description 1': desc1,
      'Description 2': desc2,
      Status: itemStatus,
      'Platform targeting': 'All',
    })),
  );

  const calloutRows = campaigns.flatMap((campaign) =>
    callouts.map((text) => ({
      Campaign: campaign.name,
      'Callout text': text,
      Status: itemStatus,
    })),
  );

  const structuredSnippetRows = campaigns.flatMap((campaign) =>
    structuredSnippets.map(([header, values]) => ({
      Campaign: campaign.name,
      Header: header,
      Values: values,
      Status: itemStatus,
    })),
  );

  const callAssetRows = campaigns.map((campaign) => ({
    Campaign: campaign.name,
    'Phone number': phoneCompact,
    'Country of phone': 'GB',
    'Call reporting': 'Enabled',
    Status: itemStatus,
  }));

  const landingPageRows = adGroups.map((group) => ({
    Campaign: group.campaign,
    'Ad group': group.adGroup,
    Theme: group.theme,
    'Landing page': group.finalUrl,
  }));

  const phase2Rows = campaigns.map((campaign) => ({
    Campaign: campaign.name,
    'Bid strategy type': 'Target CPA',
    'Target CPA': 20,
    Currency: currency,
    Comment: 'Apply only after at least 30 real conversion actions with phone-call quality checked.',
  }));

  const allInOneHeaders = [
    'Campaign',
    'Campaign type',
    'Networks',
    'Campaign daily budget',
    'Currency',
    'Bid strategy type',
    'Campaign status',
    'Language targeting',
    'Location',
    'Type',
    'Ad group',
    'Ad group status',
    'Ad group type',
    'Keyword',
    'Match type',
    'Status',
    'Final URL',
    'Ad type',
    'Path 1',
    'Path 2',
    ...Array.from({ length: 15 }, (_, index) => `Headline ${index + 1}`),
    'Headline 1 position',
    'Headline 2 position',
    ...Array.from({ length: 4 }, (_, index) => `Description ${index + 1}`),
    'Sitelink text',
    'Platform targeting',
    'Callout text',
    'Header',
    'Values',
    'Phone number',
    'Country of phone',
    'Call reporting',
    'Comment',
  ];

  const allInOneRows = [
    ...campaignRows,
    ...locationRows,
    ...adGroupRows,
    ...uniqueRows(keywordRows, (row) => `${row.Campaign}|${row['Ad group']}|${row.Keyword}|${row['Match type']}`),
    ...negativeRows,
    ...rsaRows,
    ...sitelinkRows,
    ...calloutRows,
    ...structuredSnippetRows,
    ...callAssetRows,
  ];

  return {
    '00_all_in_one_editor_import.csv': toCsv(allInOneHeaders, allInOneRows),
    '01_campaigns.csv': toCsv(
      [
        'Campaign',
        'Campaign type',
        'Networks',
        'Campaign daily budget',
        'Currency',
        'Bid strategy type',
        'Campaign status',
        'Language targeting',
        'Comment',
      ],
      campaignRows,
    ),
    '02_locations_and_exclusions.csv': toCsv(
      ['Campaign', 'Location', 'Type', 'Comment'],
      locationRows,
    ),
    '03_ad_groups.csv': toCsv(
      ['Campaign', 'Ad group', 'Ad group status', 'Ad group type', 'Comment'],
      adGroupRows,
    ),
    '04_keywords.csv': toCsv(
      ['Campaign', 'Ad group', 'Keyword', 'Match type', 'Status', 'Final URL'],
      uniqueRows(keywordRows, (row) => `${row.Campaign}|${row['Ad group']}|${row.Keyword}|${row['Match type']}`),
    ),
    '05_negative_keywords.csv': toCsv(
      ['Campaign', 'Keyword', 'Match type', 'Type'],
      negativeRows,
    ),
    '06_responsive_search_ads.csv': toCsv(
      [
        'Campaign',
        'Ad group',
        'Ad type',
        'Status',
        'Final URL',
        'Path 1',
        'Path 2',
        ...Array.from({ length: 15 }, (_, index) => `Headline ${index + 1}`),
        'Headline 1 position',
        'Headline 2 position',
        ...Array.from({ length: 4 }, (_, index) => `Description ${index + 1}`),
      ],
      rsaRows,
    ),
    '07_sitelinks.csv': toCsv(
      ['Campaign', 'Sitelink text', 'Final URL', 'Description 1', 'Description 2', 'Status', 'Platform targeting'],
      sitelinkRows,
    ),
    '08_callouts.csv': toCsv(['Campaign', 'Callout text', 'Status'], calloutRows),
    '09_structured_snippets.csv': toCsv(
      ['Campaign', 'Header', 'Values', 'Status'],
      structuredSnippetRows,
    ),
    '10_call_assets.csv': toCsv(
      ['Campaign', 'Phone number', 'Country of phone', 'Call reporting', 'Status'],
      callAssetRows,
    ),
    '11_landing_pages.csv': toCsv(
      ['Campaign', 'Ad group', 'Theme', 'Landing page'],
      landingPageRows,
    ),
    '12_phase_2_target_cpa_after_30_conversions.csv': toCsv(
      ['Campaign', 'Bid strategy type', 'Target CPA', 'Currency', 'Comment'],
      phase2Rows,
    ),
    'README.md': [
      '# Tyre Rescue Emergency Search Import',
      '',
      'Generated Google Ads Editor import package for Search-only emergency tyre demand.',
      '',
      '- Daily budget total: GBP380',
      '- Network: Google Search only',
      '- Initial bidding: Maximize conversions',
      '- Status: Paused for safe review before launch',
      '- Phone: 0141 266 0690',
      '- Coverage: mainland Scotland only; island exclusions included',
      '',
      'Fast import:',
      '1. Use 00_all_in_one_editor_import.csv in Google Ads Editor.',
      '2. Review every proposed change before posting.',
      '',
      'Fallback import order if Editor asks for type-by-type review:',
      '1. 01_campaigns.csv',
      '2. 02_locations_and_exclusions.csv',
      '3. 03_ad_groups.csv',
      '4. 04_keywords.csv',
      '5. 05_negative_keywords.csv',
      '6. 06_responsive_search_ads.csv',
      '7. 07_sitelinks.csv',
      '8. 08_callouts.csv',
      '9. 09_structured_snippets.csv',
      '10. 10_call_assets.csv',
      '',
      'Before enabling campaigns: confirm billing, conversion actions, call reporting, location presence setting, and landing page crawl status.',
      '',
    ].join('\n'),
    'summary.json': JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        campaigns: campaigns.length,
        dailyBudget: campaigns.reduce((sum, campaign) => sum + campaign.budget, 0),
        adGroups: adGroups.length,
        keywords: uniqueRows(keywordRows, (row) => `${row.Campaign}|${row['Ad group']}|${row.Keyword}|${row['Match type']}`).length,
        responsiveSearchAds: rsaRows.length,
        negativeKeywords: negativeRows.length,
        sitelinks: sitelinkRows.length,
        callouts: calloutRows.length,
        structuredSnippets: structuredSnippetRows.length,
        callAssets: callAssetRows.length,
      },
      null,
      2,
    ) + '\n',
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const files = buildFiles();

  for (const [fileName, contents] of Object.entries(files)) {
    await writeFile(path.join(outputDir, fileName), contents, 'utf8');
  }

  console.log(`Generated ${Object.keys(files).length} files in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
