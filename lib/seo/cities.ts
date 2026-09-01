/**
 * City-specific data for /mobile-tyre-fitting-[city]-price SEO pages.
 * Every city has genuinely unique copy — no duplicated content.
 */

export interface CityPriceData {
  name: string;
  description: string;
  depotDistance: number;
  coordinates: { lat: number; lng: number };
  postcodeHint: string;
}

export const cityData: Record<string, CityPriceData> = {
  glasgow: {
    name: 'Glasgow',
    description:
      "Our Glasgow depot on Duke Street means we reach most G-postcode areas within 30 minutes. Whether you're stuck on the M8, parked up in the West End, or at home in Shawlands, our fitters carry a full range of budget, mid-range and premium tyres on the van \u2014 ready to fit roadside or on your driveway.",
    depotDistance: 0,
    coordinates: { lat: 55.8642, lng: -4.2518 },
    postcodeHint: 'G1',
  },
  edinburgh: {
    name: 'Edinburgh',
    description:
      "We cover Edinburgh seven days a week from early morning through to late evening. From Leith Walk to Corstorphine, Morningside to Portobello, our mobile fitters navigate the city daily. Prices include the full callout \u2014 no hidden extras for crossing the M8 corridor.",
    depotDistance: 46,
    coordinates: { lat: 55.9533, lng: -3.1883 },
    postcodeHint: 'EH1',
  },
  paisley: {
    name: 'Paisley',
    description:
      "Paisley sits just seven miles from our Glasgow HQ, making it one of our fastest-response areas. We serve Renfrew, Johnstone, Linwood and Elderslie with the same pricing \u2014 no postcode lottery. Ideal if you need an urgent weekday fitting or a planned weekend swap.",
    depotDistance: 7,
    coordinates: { lat: 55.8451, lng: -4.4235 },
    postcodeHint: 'PA1',
  },
  'east-kilbride': {
    name: 'East Kilbride',
    description:
      'East Kilbride and the surrounding South Lanarkshire villages get the same competitive pricing as central Glasgow. We regularly fit tyres at Kingsgate Retail Park, Hairmyres Hospital car park, and residential driveways across Westwood and Murray. Average arrival under 40 minutes.',
    depotDistance: 9,
    coordinates: { lat: 55.7644, lng: -4.1769 },
    postcodeHint: 'G75',
  },
  livingston: {
    name: 'Livingston',
    description:
      "Livingston is our West Lothian hub, covering Bathgate, Broxburn and Whitburn. The town's grid-style layout means our vans move efficiently between calls. A small distance supplement applies to account for the M8 journey, but you'll still pay less than most garage call-outs.",
    depotDistance: 28,
    coordinates: { lat: 55.8836, lng: -3.5157 },
    postcodeHint: 'EH54',
  },
  falkirk: {
    name: 'Falkirk',
    description:
      'Falkirk, Grangemouth and the wider FK postcode area benefit from our central-belt coverage. Whether you need an emergency swap by the Kelpies or a planned set of four at home in Polmont, our pricing stays transparent. We carry stock suited to the mix of commuter and rural roads across the district.',
    depotDistance: 22,
    coordinates: { lat: 56.0019, lng: -3.7839 },
    postcodeHint: 'FK1',
  },
  inverness: {
    name: 'Inverness',
    description:
      'Tyre Rescue covers the full Inverness IV1–IV12 postcode area including the city, Nairn, the Black Isle and the Beauly corridor. Highland tyre callouts are booked in advance — our fitters carry a full range of sizes suited to SUVs, 4x4s and campervans common in the Highlands. No hidden distance surcharge for IV postcodes.',
    depotDistance: 170,
    coordinates: { lat: 57.4778, lng: -4.2247 },
    postcodeHint: 'IV1',
  },
  elgin: {
    name: 'Elgin',
    description:
      'Elgin and the Moray IV30–IV36 postcode band including Lossiemouth, Fochabers and Forres. The A96 Aberdeen–Inverness corridor is one of Scotland\'s busiest trunk roads, and our Moray callouts are booked in advance with no hidden distance fees. We carry stock for campervan, SUV and commercial tyre sizes common in rural Moray.',
    depotDistance: 160,
    coordinates: { lat: 57.6528, lng: -3.3140 },
    postcodeHint: 'IV30',
  },
  aberdeen: {
    name: 'Aberdeen',
    description:
      'Aberdeen and the full AB postcode area — from Union Street in the city (AB10) to Westhill (AB32), Inverurie (AB51), Peterhead (AB42) and Royal Deeside (AB35). As Scotland\'s energy capital, Aberdeen has a high concentration of premium and fleet vehicles. We carry run-flat tyres for BMW and Mercedes, all-season fitments for northeast conditions, and heavy-load sizes for commercial vehicles. Advance booking recommended for Aberdeenshire areas beyond 15 miles.',
    depotDistance: 143,
    coordinates: { lat: 57.1497, lng: -2.0943 },
    postcodeHint: 'AB10',
  },
  galashiels: {
    name: 'Galashiels',
    description:
      'Galashiels and the Scottish Borders TD postcode area — covering Melrose, Selkirk, Hawick, Jedburgh, Kelso, Peebles and the Berwickshire coast. The A7 and A68 are our main trunk routes through the Borders. Rural Borders roads are exposed and can be harsh on tyres, especially in winter on the Carter Bar approach and the Teviotdale hill roads. No hidden distance surcharges across the TD postcode area.',
    depotDistance: 73,
    coordinates: { lat: 55.6185, lng: -2.8097 },
    postcodeHint: 'TD1',
  },
};

export const priceCitySlugs = Object.keys(cityData);

export function getCityPriceData(slug: string): CityPriceData | undefined {
  return cityData[slug];
}
