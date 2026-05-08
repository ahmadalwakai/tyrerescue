/**
 * SEO route priority tiers.
 *
 * Used by `generateStaticParams` on high-volume SEO routes
 * (`/[service]/[city]` and `/[service]/[city]/[area]`) to keep the static
 * build conservative (~100 routes) while preserving full crawlable coverage
 * via on-demand ISR for everything else.
 *
 * TODO: Replace `PRIORITY_AREAS` with the top organic landing pages from
 * Google Search Console (top impressions/clicks, last 90 days). The current
 * list is a conservative seed based on existing project coverage data.
 */

import {
  services,
  serviceCities,
  getAreasForCity,
} from '@/lib/areas';

/**
 * Tier 1: cities that receive the highest organic search volume.
 * Used to scope priority area generation, not to gate sitemap inclusion.
 */
export const TIER_1_CITIES = ['glasgow', 'edinburgh'] as const;

/**
 * Tier 2: other covered cities used as priority for the top service
 * (`mobile-tyre-fitting`) only.
 */
export const TIER_2_CITIES = [
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

/**
 * Services prioritised for static prebuild on Tier 1 city/area pages.
 * Other services in `services` still get full coverage via ISR.
 */
export const TIER_1_SERVICES = [
  'mobile-tyre-fitting',
  'emergency-tyre-fitting',
] as const;

/**
 * Top intent neighbourhoods per Tier 1 city. Limited to ~10 per city so the
 * total prebuilt area-page count stays under 100. Slugs MUST exist in
 * `lib/areas.ts`; mismatches are filtered out at build time.
 */
const PRIORITY_AREAS: Record<string, readonly string[]> = {
  glasgow: [
    'city-centre',
    'west-end',
    'east-end',
    'southside',
    'govan',
    'partick',
    'shawlands',
    'dennistoun',
    'parkhead',
    'finnieston',
    'hyndland',
    'hillhead',
  ],
  edinburgh: [
    'old-town',
    'new-town',
    'leith',
    'morningside',
    'portobello',
    'corstorphine',
    'haymarket',
    'newington',
    'stockbridge',
    'bruntsfield',
  ],
};

/**
 * Returns the (service, city) param tuples to prebuild statically.
 * All 19 cities × 5 services = 95 — under the 100 prebuild target — so we
 * keep all of them. Other services still get ISR coverage via dynamicParams.
 */
export function getPriorityServiceCityParams(): {
  service: string;
  city: string;
}[] {
  const params: { service: string; city: string }[] = [];
  for (const service of services) {
    for (const citySlug of serviceCities) {
      params.push({ service: service.slug, city: citySlug });
    }
  }
  return params;
}

/**
 * Returns the (service, city, area) param tuples to prebuild statically.
 * Conservative seed: top services for Tier 1 cities only. Everything else
 * is generated on-demand and cached via long ISR.
 *
 * TODO: replace with Search Console top URLs once available.
 */
export function getPriorityServiceAreaParams(): {
  service: string;
  city: string;
  area: string;
}[] {
  const params: { service: string; city: string; area: string }[] = [];
  for (const citySlug of TIER_1_CITIES) {
    const validAreaSlugs = new Set(getAreasForCity(citySlug).map((a) => a.slug));
    const wanted = PRIORITY_AREAS[citySlug] ?? [];
    for (const areaSlug of wanted) {
      if (!validAreaSlugs.has(areaSlug)) continue;
      for (const service of TIER_1_SERVICES) {
        params.push({ service, city: citySlug, area: areaSlug });
      }
    }
  }
  return params;
}
