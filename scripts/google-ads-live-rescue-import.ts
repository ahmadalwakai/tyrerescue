import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAreasForCity } from '../lib/areas';
import { getCityBySlug } from '../lib/cities';

const outputDir = path.join(process.cwd(), 'artifacts', 'google-ads', 'live-rescue-2026-06-29');
const customerId = '242-715-2166';
const campaign = 'TR Search Emergency Scotland Mainland';
const campaignId = '23976658719';
const baseUrl = 'https://www.tyrerescue.uk';
const phone = '0141 266 0690';
const negativeListName = 'TR Emergency Waste Blockers';

const citySlugs = [
  'glasgow',
  'edinburgh',
  'dundee',
  'stirling',
  'falkirk',
  'paisley',
  'hamilton',
  'east-kilbride',
  'motherwell',
  'livingston',
  'kirkcaldy',
  'perth',
  'cumbernauld',
  'dumfries',
  'greenock',
  'dunfermline',
  'kilmarnock',
  'ayr',
  'irvine',
] as const;

const roadGroups = [
  'M8 Glasgow Edinburgh',
  'M74 Glasgow Carlisle',
  'M77 Glasgow Ayrshire',
  'M80 Glasgow Stirling',
  'M9 Edinburgh Stirling',
  'M90 Fife Perth',
  'A9 Perth Inverness',
  'A90 Dundee Aberdeen',
  'A82 Glasgow Fort William',
  'A77 Glasgow Ayr Stranraer',
  'A75 Dumfries Stranraer',
  'A1 Edinburgh Borders',
] as const;

const extraEmergencyLocations = [
  'Aberdeen',
  'Stonehaven',
  'Forfar',
  'Arbroath',
  'Montrose',
  'Alloa',
  'Grangemouth',
  'Larbert',
  'Denny',
  'Troon',
  'Prestwick',
  'Galashiels',
  'Hawick',
  'Peebles',
  'Inverness',
  'Aviemore',
  'Fort William',
  'Nairn',
  'Elgin',
  'Dingwall',
] as const;

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
  'cheap rims',
  'wheel alignment',
  'wheel balancing machine',
  'tyre review',
  'tyre reviews',
  'which tyre',
  'tyre size guide',
  'meaning',
  'definition',
  'law',
  'legal limit',
  'tread depth',
  'ebay',
  'amazon',
  'gumtree',
  'facebook marketplace',
  'halfords bicycle',
  'kwik fit jobs',
  'ats jobs',
  'national tyres jobs',
  'indeed',
  'reed',
  'cv library',
  'orkney',
  'shetland',
  'outer hebrides',
  'isle of skye',
  'isle of mull',
  'isle of arran',
  'isle of islay',
  'isle of jura',
  'isle of bute',
  'isle of tiree',
  'isle of coll',
  'isle of lewis',
  'isle of harris',
  'north uist',
  'south uist',
  'benbecula',
  'barra',
  'stornoway',
  'kirkwall',
  'lerwick',
  'portree',
  'rothesay',
  'tobermory',
  'ferry',
  'calmac',
  'northlink',
] as const;

type RescueGroup = {
  adGroup: string;
  location: string;
  finalUrl: string;
  path1: string;
  path2: string;
  kind: 'city' | 'area' | 'road' | 'extra';
  cityName?: string;
};

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n') + '\n';
}

function slugify(value: string, max = 15): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
}

function compact(value: string, max = 45): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd();
}

function h(value: string): string {
  if (value.length > 30) throw new Error(`Headline over 30 chars: ${value}`);
  return value;
}

function d(value: string): string {
  if (value.length > 90) throw new Error(`Description over 90 chars: ${value}`);
  return value;
}

function keywordTemplates(location: string, kind: RescueGroup['kind']): string[] {
  const locationTerms =
    kind === 'road'
      ? [
          `tyre fitter ${location}`,
          `flat tyre ${location}`,
          `roadside tyre ${location}`,
          `emergency tyre ${location}`,
          `mobile tyre ${location}`,
        ]
      : [
          `emergency tyre fitting ${location}`,
          `emergency tyre fitter ${location}`,
          `24 hour tyre fitter ${location}`,
          `24 hour tyre fitting ${location}`,
          `mobile tyre fitter ${location}`,
          `mobile tyre fitting ${location}`,
          `mobile tyre repair ${location}`,
          `flat tyre help ${location}`,
          `flat tyre repair ${location}`,
          `roadside tyre fitting ${location}`,
          `tyre call out ${location}`,
          `tyre callout ${location}`,
          `puncture repair ${location}`,
          `emergency puncture repair ${location}`,
        ];

  return locationTerms.map((term) => term.replace(/\s+/g, ' ').trim());
}

function buildGroups(): RescueGroup[] {
  const rows: RescueGroup[] = [];

  for (const citySlug of citySlugs) {
    const city = getCityBySlug(citySlug);
    if (!city) continue;

    rows.push({
      adGroup: compact(`${city.name} - Emergency 24-7`),
      location: city.name,
      cityName: city.name,
      finalUrl: `${baseUrl}/emergency-tyre-fitting/${city.slug}`,
      path1: 'emergency',
      path2: slugify(city.name),
      kind: 'city',
    });

    rows.push({
      adGroup: compact(`${city.name} - Flat Tyre Call`),
      location: city.name,
      cityName: city.name,
      finalUrl: `${baseUrl}/emergency-tyre-fitting/${city.slug}`,
      path1: 'flat-tyre',
      path2: slugify(city.name),
      kind: 'city',
    });

    for (const area of getAreasForCity(citySlug)) {
      rows.push({
        adGroup: compact(`${city.name} - ${area.name} Emergency`),
        location: area.name,
        cityName: city.name,
        finalUrl: `${baseUrl}/emergency-tyre-fitting/${city.slug}/${area.slug}`,
        path1: 'emergency',
        path2: slugify(area.name),
        kind: 'area',
      });
    }
  }

  for (const road of roadGroups) {
    rows.push({
      adGroup: compact(`${road} - Roadside Tyres`),
      location: road,
      finalUrl: `${baseUrl}/emergency`,
      path1: 'roadside',
      path2: slugify(road),
      kind: 'road',
    });
  }

  for (const location of extraEmergencyLocations) {
    rows.push({
      adGroup: compact(`${location} - Emergency 24-7`),
      location,
      finalUrl: `${baseUrl}/emergency`,
      path1: 'emergency',
      path2: slugify(location),
      kind: 'extra',
    });
  }

  return rows;
}

function buildHeadlines(group: RescueGroup): Record<string, string> {
  const local =
    group.location.length <= 16
      ? `${group.location} Tyre Help`
      : group.cityName && group.cityName.length <= 16
        ? `${group.cityName} Tyre Help`
        : 'Local Tyre Rescue';

  const values = [
    h('Emergency Tyre Fitting'),
    h(`Call ${phone}`),
    h('24/7 Mobile Tyre Help'),
    h('24 Hour Tyre Fitter'),
    h('Mobile Tyre Fitter'),
    h('Flat Tyre Help Now'),
    h('Roadside Tyre Help'),
    h('Call Now For Tyres'),
    h('Callout From GBP49'),
    h('Fitting From GBP20'),
    h('Repair From GBP25'),
    h('We Come To Your Location'),
    h('No Tow Truck Needed'),
    h('Fast Emergency Dispatch'),
    h(local),
  ];

  return Object.fromEntries(values.map((value, index) => [`Headline ${index + 1}`, value]));
}

function buildDescriptions(group: RescueGroup): Record<string, string> {
  const place =
    group.kind === 'road'
      ? 'this route'
      : group.location.length <= 24
        ? group.location
        : group.cityName || 'mainland Scotland';
  const values = [
    d(`Flat tyre in ${place}? Call Tyre Rescue 24/7 for mobile tyre fitting help.`),
    d('Emergency mobile tyre fitter sent to your location. Callout from GBP49.'),
    d('Tyre size and price confirmed first. Call now for urgent roadside tyre help.'),
    d('Book online or call now. Fitting from GBP20 and puncture repair from GBP25.'),
  ];

  return Object.fromEntries(values.map((value, index) => [`Description ${index === 0 ? '' : index + 1}`.trim(), value]));
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const groups = buildGroups();

  const adGroupRows = groups.map((group) => ({
    Action: 'Add',
    'Customer ID': customerId,
    'Campaign ID': campaignId,
    'Ad group': group.adGroup,
    Status: 'Enabled',
    'Ad group type': '',
  }));

  const keywordRows = groups.flatMap((group) =>
    keywordTemplates(group.location, group.kind).flatMap((keyword) => [
      {
        Action: 'Add',
        'Keyword status': 'Enabled',
        'Customer ID': customerId,
        'Campaign ID': campaignId,
        'Ad group': group.adGroup,
        Keyword: keyword,
        'Match Type': 'Exact Match',
        'Final URL': group.finalUrl,
      },
      {
        Action: 'Add',
        'Keyword status': 'Enabled',
        'Customer ID': customerId,
        'Campaign ID': campaignId,
        'Ad group': group.adGroup,
        Keyword: keyword,
        'Match Type': 'Phrase Match',
        'Final URL': group.finalUrl,
      },
    ]),
  );

  const rsaRows = groups.map((group) => ({
    Action: 'Add',
    'Ad status': 'Enabled',
    'Customer ID': customerId,
    'Campaign ID': campaignId,
    'Ad group': group.adGroup,
    'Ad type': 'Responsive search ad',
    ...buildHeadlines(group),
    ...buildDescriptions(group),
    'Headline 1 position': 1,
    'Headline 2 position': 2,
    'Path 1': group.path1,
    'Path 2': group.path2,
    'Final URL': group.finalUrl,
  }));

  const negativeKeywordRows = negativeTerms.map((term) => ({
    Action: 'Add',
    'Customer ID': customerId,
    'Negative keyword list name': negativeListName,
    'Negative keyword': term,
    'Keyword or list': 'Keyword',
    'Match type': 'Phrase Match',
  }));

  const associateListRows = [
    {
      Action: 'Add',
      'Customer ID': customerId,
      'Negative keyword': negativeListName,
      'Keyword or list': 'List',
      'Campaign ID': campaignId,
    },
  ];

  const manualNegativePaste = negativeTerms.join('\n') + '\n';

  await writeFile(
    path.join(outputDir, '01_create_ad_groups.csv'),
    toCsv(['Action', 'Customer ID', 'Campaign ID', 'Ad group', 'Status', 'Ad group type'], adGroupRows),
  );

  await writeFile(
    path.join(outputDir, '02_add_keywords.csv'),
    toCsv(
      ['Action', 'Keyword status', 'Customer ID', 'Campaign ID', 'Ad group', 'Keyword', 'Match Type', 'Final URL'],
      keywordRows,
    ),
  );

  await writeFile(
    path.join(outputDir, '03_create_responsive_search_ads.csv'),
    toCsv(
      [
        'Action',
        'Ad status',
        'Customer ID',
        'Campaign ID',
        'Ad group',
        'Ad type',
        'Headline 1',
        'Headline 2',
        'Headline 3',
        'Headline 4',
        'Headline 5',
        'Headline 6',
        'Headline 7',
        'Headline 8',
        'Headline 9',
        'Headline 10',
        'Headline 11',
        'Headline 12',
        'Headline 13',
        'Headline 14',
        'Headline 15',
        'Description',
        'Description 2',
        'Description 3',
        'Description 4',
        'Headline 1 position',
        'Headline 2 position',
        'Path 1',
        'Path 2',
        'Final URL',
      ],
      rsaRows,
    ),
  );

  await writeFile(
    path.join(outputDir, '04_add_negative_keywords_to_list.csv'),
    toCsv(
      [
        'Action',
        'Customer ID',
        'Negative keyword list name',
        'Negative keyword',
        'Keyword or list',
        'Match type',
      ],
      negativeKeywordRows,
    ),
  );

  await writeFile(
    path.join(outputDir, '05_apply_negative_list_to_campaign.csv'),
    toCsv(['Action', 'Customer ID', 'Negative keyword', 'Keyword or list', 'Campaign ID'], associateListRows),
  );

  await writeFile(path.join(outputDir, 'negative-keywords-manual-paste.txt'), manualNegativePaste);

  await writeFile(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        customerId,
        campaign,
        campaignId,
        adGroups: adGroupRows.length,
        keywords: keywordRows.length,
        responsiveSearchAds: rsaRows.length,
        negativeKeywords: negativeKeywordRows.length,
        negativeListName,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
