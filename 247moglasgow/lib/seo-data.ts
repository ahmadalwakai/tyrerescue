export const SITE_URL = 'https://www.247moglasgow.uk';
export const BRAND_NAME = '247 Mo Glasgow';
export const PHONE_DISPLAY = '0141 266 0690';
export const PHONE_TEL = '01412660690';
export const WHATSAPP = '447423262955';
export const ADDRESS = '3 Gateside Street, Parkhead, Glasgow G31 1PD';

export const SERVICES = [
  {
    slug: 'mobile-tyre-fitting',
    name: 'Mobile Tyre Fitting',
    h1: 'Mobile Tyre Fitting Glasgow',
    priceFrom: 'From £49',
    metaTitle: 'Mobile Tyre Fitting Glasgow | 24/7 | From £49 | 247 Mo Glasgow',
    metaDesc:
      'Mobile tyre fitting across all Glasgow postcodes 24/7. We come to you - home, work or roadside. Average 35 min response. Call 0141 266 0690.',
    heroText: 'We bring the tyre shop to your door. Home, work or roadside - anywhere in Glasgow.',
  },
  {
    slug: 'emergency-tyre-fitting',
    name: 'Emergency Tyre Fitting',
    h1: 'Emergency Tyre Fitting Glasgow',
    priceFrom: 'From £69',
    metaTitle: 'Emergency Tyre Fitting Glasgow | 24/7 | 35 Min Response | 247 Mo Glasgow',
    metaDesc:
      '24/7 emergency tyre fitting across Glasgow. Average 35 minute response. Flat tyre on the M8 or A8? Call us now - 0141 266 0690.',
    heroText: '24/7 emergency response across all Glasgow postcodes. Average 35 minutes from your call.',
  },
  {
    slug: 'puncture-repair',
    name: 'Puncture Repair',
    h1: 'Puncture Repair Glasgow',
    priceFrom: 'From £30',
    metaTitle: 'Puncture Repair Glasgow | Mobile | Same Day | 247 Mo Glasgow',
    metaDesc:
      'Mobile puncture repair service across Glasgow. We fix most punctures on-the-spot at your location. No garage visit needed. Call 0141 266 0690.',
    heroText: 'We fix punctures at your location - no recovery truck, no waiting, no garage.',
  },
  {
    slug: 'tyre-fitting',
    name: 'Tyre Fitting',
    h1: 'Tyre Fitting Glasgow',
    priceFrom: 'From £20/tyre',
    metaTitle: 'Tyre Fitting Glasgow | Mobile | Budget to Premium | 247 Mo Glasgow',
    metaDesc:
      'Mobile tyre fitting service in Glasgow. We stock budget, mid-range and premium tyres. Fitted at your home or workplace. Call 0141 266 0690.',
    heroText: 'Choose your tyre, we deliver and fit - at home, at work, wherever suits you.',
  },
] as const;

export const GLASGOW_AREAS = [
  { slug: 'city-centre', name: 'City Centre', postcode: 'G1', etaMin: 20 },
  { slug: 'west-end', name: 'West End', postcode: 'G11-G12', etaMin: 22 },
  { slug: 'southside', name: 'Southside', postcode: 'G41-G44', etaMin: 28 },
  { slug: 'east-end', name: 'East End', postcode: 'G31-G33', etaMin: 18 },
  { slug: 'north-glasgow', name: 'North Glasgow', postcode: 'G20-G23', etaMin: 25 },
  { slug: 'govan', name: 'Govan', postcode: 'G51', etaMin: 25 },
  { slug: 'partick', name: 'Partick', postcode: 'G11', etaMin: 22 },
  { slug: 'maryhill', name: 'Maryhill', postcode: 'G20', etaMin: 25 },
  { slug: 'shawlands', name: 'Shawlands', postcode: 'G41', etaMin: 30 },
  { slug: 'pollokshields', name: 'Pollokshields', postcode: 'G41', etaMin: 28 },
  { slug: 'bearsden', name: 'Bearsden', postcode: 'G61', etaMin: 35 },
  { slug: 'bishopbriggs', name: 'Bishopbriggs', postcode: 'G64', etaMin: 30 },
  { slug: 'rutherglen', name: 'Rutherglen', postcode: 'G73', etaMin: 28 },
  { slug: 'cambuslang', name: 'Cambuslang', postcode: 'G72', etaMin: 32 },
  { slug: 'baillieston', name: 'Baillieston', postcode: 'G69', etaMin: 25 },
  { slug: 'parkhead', name: 'Parkhead', postcode: 'G31', etaMin: 15 },
  { slug: 'springburn', name: 'Springburn', postcode: 'G21', etaMin: 22 },
  { slug: 'dennistoun', name: 'Dennistoun', postcode: 'G31', etaMin: 18 },
  { slug: 'pollok', name: 'Pollok', postcode: 'G53', etaMin: 32 },
  { slug: 'castlemilk', name: 'Castlemilk', postcode: 'G45', etaMin: 35 },
  { slug: 'easterhouse', name: 'Easterhouse', postcode: 'G34', etaMin: 30 },
  { slug: 'drumchapel', name: 'Drumchapel', postcode: 'G15', etaMin: 30 },
  { slug: 'anniesland', name: 'Anniesland', postcode: 'G13', etaMin: 28 },
  { slug: 'jordanhill', name: 'Jordanhill', postcode: 'G13', etaMin: 26 },
  { slug: 'knightswood', name: 'Knightswood', postcode: 'G13', etaMin: 28 },
  { slug: 'kelvinside', name: 'Kelvinside', postcode: 'G12', etaMin: 22 },
  { slug: 'mount-florida', name: 'Mount Florida', postcode: 'G42', etaMin: 28 },
  { slug: 'king-s-park', name: "King's Park", postcode: 'G44', etaMin: 32 },
  { slug: 'newlands', name: 'Newlands', postcode: 'G43', etaMin: 30 },
  { slug: 'clarkston', name: 'Clarkston', postcode: 'G76', etaMin: 38 },
] as const;
