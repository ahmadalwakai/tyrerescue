const canonicalSiteUrl = 'https://www.edinburghtyrefitting.com';

function normalizeOrigin(origin: string | undefined): string | null {
  if (!origin) return null;

  try {
    const url = new URL(origin);
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getBookingReturnOrigin(requestOrigin: string): string {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);

  if (configuredOrigin && isLocalOrigin(configuredOrigin)) {
    return configuredOrigin;
  }

  const localRequestOrigin = normalizeOrigin(requestOrigin);
  if (localRequestOrigin && isLocalOrigin(localRequestOrigin)) {
    return localRequestOrigin;
  }

  return canonicalSiteUrl;
}

export const siteConfig = {
  name: 'Edinburgh Tyre Fitting',
  domain: 'www.edinburghtyrefitting.com',
  url: canonicalSiteUrl,
  phone: process.env.NEXT_PUBLIC_PHONE_NUMBER || '0131 000 0000',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '447700900000',
  email: process.env.ADMIN_EMAIL || 'bookings@edinburghtyrefitting.com',
  sourceApp: 'edinburgh_tyre_fitting',
  sourceLabel: 'Edinburgh Tyre Fitting',
  integrationSource: 'edinburgh_tyre_fitting',
  serviceRadiusMiles: 50,
  center: {
    lat: 55.873557,
    lng: -3.16378,
  },
} as const;

export const serviceAreas = [
  {
    slug: 'edinburgh',
    name: 'Edinburgh',
    summary: 'Mobile tyre fitting, puncture repair and urgent roadside tyre help across central Edinburgh.',
    distance: '0-8 miles',
  },
  {
    slug: 'leith',
    name: 'Leith',
    summary: 'Fast mobile tyre fitting for Leith, Newhaven, Trinity and the waterfront.',
    distance: '2-6 miles',
  },
  {
    slug: 'musselburgh',
    name: 'Musselburgh',
    summary: 'Same-day tyre fitting and puncture repair east of Edinburgh, including Musselburgh and Wallyford.',
    distance: '6-12 miles',
  },
  {
    slug: 'dalkeith',
    name: 'Dalkeith',
    summary: 'Mobile tyre service for Dalkeith, Eskbank, Bonnyrigg and nearby Midlothian roads.',
    distance: '8-18 miles',
  },
  {
    slug: 'livingston',
    name: 'Livingston',
    summary: 'Tyre fitting and emergency mobile tyre assistance west of Edinburgh and around Livingston.',
    distance: '14-28 miles',
  },
  {
    slug: 'linlithgow',
    name: 'Linlithgow',
    summary: 'Countryside mobile tyre fitting cover between Edinburgh, Linlithgow and the M9 corridor.',
    distance: '18-32 miles',
  },
  {
    slug: 'north-berwick',
    name: 'North Berwick',
    summary: 'Planned and emergency tyre fitting for North Berwick, Gullane and East Lothian routes.',
    distance: '24-34 miles',
  },
  {
    slug: 'penicuik',
    name: 'Penicuik',
    summary: 'Mobile tyre fitting and puncture repair south of Edinburgh, including Penicuik and Roslin.',
    distance: '9-18 miles',
  },
  {
    slug: 'peebles',
    name: 'Peebles',
    summary: 'Extended 50-mile countryside cover for Peebles and Borders roads when available.',
    distance: '22-31 miles',
  },
] as const;

export type ServiceArea = (typeof serviceAreas)[number];

export function getServiceArea(slug: string): ServiceArea | undefined {
  return serviceAreas.find((area) => area.slug === slug);
}

export const faqs = [
  {
    question: 'Do you cover countryside locations outside Edinburgh?',
    answer:
      'Yes. Edinburgh Tyre Fitting accepts bookings within 50 miles of Edinburgh, including city, Lothian and countryside routes when availability allows.',
  },
  {
    question: 'What happens after I submit a booking?',
    answer:
      'We review your location, tyre details, access notes and preferred time, then contact you if anything needs confirming before the visit.',
  },
  {
    question: 'Can I book if I do not know my tyre size?',
    answer:
      'For secure checkout, add the tyre size printed on the tyre sidewall. If you are not sure, call us first so we can confirm the correct size before payment.',
  },
  {
    question: 'Can you help with locking wheel nuts?',
    answer:
      'Yes. The booking form records whether you have the locking wheel nut key, no key, standard nuts or are not sure, so the visit notes are clear.',
  },
] as const;
