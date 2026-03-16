export interface Area {
  slug: string;
  name: string;
  postcode: string;
  lat: number;
  lng: number;
  distanceFromCentre: number;
  nearestLandmark: string;
}

export interface ServiceSEO {
  slug: string;
  name: string;
  h1Template: string;
  metaTitleTemplate: string;
  metaDescTemplate: string;
  heroText: string;
  priceFrom: string;
}

export const services: ServiceSEO[] = [
  {
    slug: 'mobile-tyre-fitting',
    name: 'Mobile Tyre Fitting',
    h1Template: 'Mobile Tyre Fitting in {location}',
    metaTitleTemplate: 'Mobile Tyre Fitting {location} | 24/7 | Tyre Rescue',
    metaDescTemplate: 'Mobile tyre fitting in {location}. Our certified fitters come to your exact location 24 hours a day. Emergency and scheduled service. Call 0141 266 0690.',
    heroText: 'Professional mobile tyre fitting at your location in {location}. We come to you.',
    priceFrom: 'From £20',
  },
  {
    slug: 'emergency-tyre-fitting',
    name: 'Emergency Tyre Fitting',
    h1Template: 'Emergency Tyre Fitting in {location}',
    metaTitleTemplate: 'Emergency Tyre Fitting {location} | 45 Min Response | Tyre Rescue',
    metaDescTemplate: 'Emergency tyre fitting in {location}. Flat tyre? Our mobile fitters respond within 45 minutes, 24 hours a day. Call 0141 266 0690 now.',
    heroText: 'Emergency tyre fitting in {location}. Rapid response, any time of day or night.',
    priceFrom: 'From £49',
  },
  {
    slug: 'tyre-repair',
    name: 'Tyre Repair',
    h1Template: 'Tyre Repair in {location}',
    metaTitleTemplate: 'Tyre Repair {location} | Mobile Service | Tyre Rescue',
    metaDescTemplate: 'Professional tyre repair in {location}. We repair punctures and damage at your location. No garage visit needed. Call 0141 266 0690.',
    heroText: 'Expert tyre repair at your location in {location}. Fast, professional, affordable.',
    priceFrom: 'From £25',
  },
  {
    slug: 'puncture-repair',
    name: 'Puncture Repair',
    h1Template: 'Puncture Repair in {location}',
    metaTitleTemplate: 'Puncture Repair {location} | Mobile Tyre Fitter | Tyre Rescue',
    metaDescTemplate: 'Mobile puncture repair in {location}. Nail in your tyre? Slow puncture? Our fitters come to you and repair on the spot. Call 0141 266 0690.',
    heroText: 'Fast puncture repair at your location in {location}. We fix it while you wait.',
    priceFrom: 'From £25',
  },
  {
    slug: 'tyre-fitting',
    name: 'Tyre Fitting',
    h1Template: 'Tyre Fitting in {location}',
    metaTitleTemplate: 'Tyre Fitting {location} | New Tyres Fitted | Tyre Rescue',
    metaDescTemplate: 'New tyre fitting in {location}. Budget, mid-range and premium tyres fitted at your home or workplace. Call 0141 266 0690 to book.',
    heroText: 'New tyres fitted at your location in {location}. All major brands available.',
    priceFrom: 'From £20',
  },
];

export const glasgowAreas: Area[] = [
  { slug: 'govan', name: 'Govan', postcode: 'G51', lat: 55.8642, lng: -4.3096, distanceFromCentre: 2.1, nearestLandmark: 'Ibrox Stadium' },
  { slug: 'partick', name: 'Partick', postcode: 'G11', lat: 55.8721, lng: -4.3098, distanceFromCentre: 1.8, nearestLandmark: 'Partick Cross' },
  { slug: 'shawlands', name: 'Shawlands', postcode: 'G41', lat: 55.8344, lng: -4.2755, distanceFromCentre: 2.9, nearestLandmark: 'Shawlands Cross' },
  { slug: 'pollok', name: 'Pollok', postcode: 'G53', lat: 55.8187, lng: -4.3278, distanceFromCentre: 4.2, nearestLandmark: 'Pollok Country Park' },
  { slug: 'pollokshields', name: 'Pollokshields', postcode: 'G41', lat: 55.8396, lng: -4.2878, distanceFromCentre: 2.4, nearestLandmark: 'Queens Park' },
  { slug: 'maryhill', name: 'Maryhill', postcode: 'G20', lat: 55.8869, lng: -4.2878, distanceFromCentre: 2.8, nearestLandmark: 'Forth and Clyde Canal' },
  { slug: 'springburn', name: 'Springburn', postcode: 'G21', lat: 55.8870, lng: -4.2345, distanceFromCentre: 2.9, nearestLandmark: 'Springburn Park' },
  { slug: 'dennistoun', name: 'Dennistoun', postcode: 'G31', lat: 55.8634, lng: -4.2178, distanceFromCentre: 1.4, nearestLandmark: 'Alexandra Park' },
  { slug: 'parkhead', name: 'Parkhead', postcode: 'G31', lat: 55.8520, lng: -4.1985, distanceFromCentre: 2.3, nearestLandmark: 'Celtic Park' },
  { slug: 'bridgeton', name: 'Bridgeton', postcode: 'G40', lat: 55.8486, lng: -4.2198, distanceFromCentre: 1.8, nearestLandmark: 'Bridgeton Cross' },
  { slug: 'tollcross', name: 'Tollcross', postcode: 'G32', lat: 55.8439, lng: -4.1879, distanceFromCentre: 2.8, nearestLandmark: 'Tollcross Park' },
  { slug: 'castlemilk', name: 'Castlemilk', postcode: 'G45', lat: 55.8054, lng: -4.2189, distanceFromCentre: 4.9, nearestLandmark: 'Castlemilk Stables' },
  { slug: 'cathcart', name: 'Cathcart', postcode: 'G44', lat: 55.8198, lng: -4.2556, distanceFromCentre: 3.8, nearestLandmark: 'Linn Park' },
  { slug: 'govanhill', name: 'Govanhill', postcode: 'G42', lat: 55.8365, lng: -4.2612, distanceFromCentre: 2.1, nearestLandmark: 'Victoria Road' },
  { slug: 'ibrox', name: 'Ibrox', postcode: 'G51', lat: 55.8565, lng: -4.3089, distanceFromCentre: 2.4, nearestLandmark: 'Ibrox Stadium' },
  { slug: 'kinning-park', name: 'Kinning Park', postcode: 'G41', lat: 55.8522, lng: -4.2878, distanceFromCentre: 1.9, nearestLandmark: 'M8 Junction' },
  { slug: 'kelvinside', name: 'Kelvinside', postcode: 'G12', lat: 55.8818, lng: -4.2912, distanceFromCentre: 2.2, nearestLandmark: 'Kelvingrove Park' },
  { slug: 'hyndland', name: 'Hyndland', postcode: 'G12', lat: 55.8748, lng: -4.3087, distanceFromCentre: 2.1, nearestLandmark: 'Hyndland Station' },
  { slug: 'hillhead', name: 'Hillhead', postcode: 'G12', lat: 55.8745, lng: -4.2912, distanceFromCentre: 1.8, nearestLandmark: 'Byres Road' },
  { slug: 'anniesland', name: 'Anniesland', postcode: 'G13', lat: 55.8891, lng: -4.3378, distanceFromCentre: 3.8, nearestLandmark: 'Anniesland Cross' },
  { slug: 'scotstoun', name: 'Scotstoun', postcode: 'G14', lat: 55.8798, lng: -4.3487, distanceFromCentre: 3.5, nearestLandmark: 'Scotstoun Stadium' },
  { slug: 'whiteinch', name: 'Whiteinch', postcode: 'G14', lat: 55.8821, lng: -4.3312, distanceFromCentre: 3.1, nearestLandmark: 'Victoria Park' },
  { slug: 'knightswood', name: 'Knightswood', postcode: 'G13', lat: 55.8934, lng: -4.3512, distanceFromCentre: 4.4, nearestLandmark: 'Knightswood Park' },
  { slug: 'jordanhill', name: 'Jordanhill', postcode: 'G13', lat: 55.8867, lng: -4.3312, distanceFromCentre: 3.4, nearestLandmark: 'Jordanhill Station' },
  { slug: 'drumchapel', name: 'Drumchapel', postcode: 'G15', lat: 55.9034, lng: -4.3923, distanceFromCentre: 6.1, nearestLandmark: 'Drumchapel Shopping Centre' },
  { slug: 'yoker', name: 'Yoker', postcode: 'G13', lat: 55.8921, lng: -4.3712, distanceFromCentre: 4.8, nearestLandmark: 'Yoker Station' },
  { slug: 'bearsden', name: 'Bearsden', postcode: 'G61', lat: 55.9223, lng: -4.3298, distanceFromCentre: 6.2, nearestLandmark: 'Bearsden Cross' },
  { slug: 'milngavie', name: 'Milngavie', postcode: 'G62', lat: 55.9423, lng: -4.3198, distanceFromCentre: 7.8, nearestLandmark: 'Milngavie Town Centre' },
  { slug: 'kirkintilloch', name: 'Kirkintilloch', postcode: 'G66', lat: 55.9398, lng: -4.1578, distanceFromCentre: 7.9, nearestLandmark: 'Forth and Clyde Canal' },
  { slug: 'lenzie', name: 'Lenzie', postcode: 'G66', lat: 55.9298, lng: -4.1398, distanceFromCentre: 7.2, nearestLandmark: 'Lenzie Station' },
  { slug: 'bishopbriggs', name: 'Bishopbriggs', postcode: 'G64', lat: 55.9098, lng: -4.2198, distanceFromCentre: 5.4, nearestLandmark: 'Bishopbriggs Town Centre' },
  { slug: 'stepps', name: 'Stepps', postcode: 'G33', lat: 55.9034, lng: -4.1578, distanceFromCentre: 5.8, nearestLandmark: 'Stepps Station' },
  { slug: 'riddrie', name: 'Riddrie', postcode: 'G33', lat: 55.8712, lng: -4.1878, distanceFromCentre: 3.1, nearestLandmark: 'Riddrie Park' },
  { slug: 'carntyne', name: 'Carntyne', postcode: 'G32', lat: 55.8612, lng: -4.1798, distanceFromCentre: 3.2, nearestLandmark: 'Carntyne Station' },
  { slug: 'baillieston', name: 'Baillieston', postcode: 'G69', lat: 55.8512, lng: -4.1298, distanceFromCentre: 4.9, nearestLandmark: 'Baillieston Cross' },
  { slug: 'mount-vernon', name: 'Mount Vernon', postcode: 'G32', lat: 55.8434, lng: -4.1498, distanceFromCentre: 4.5, nearestLandmark: 'Mount Vernon Station' },
  { slug: 'carmyle', name: 'Carmyle', postcode: 'G32', lat: 55.8398, lng: -4.1678, distanceFromCentre: 4.1, nearestLandmark: 'River Clyde' },
  { slug: 'rutherglen', name: 'Rutherglen', postcode: 'G73', lat: 55.8298, lng: -4.2178, distanceFromCentre: 3.5, nearestLandmark: 'Rutherglen Town Hall' },
  { slug: 'cambuslang', name: 'Cambuslang', postcode: 'G72', lat: 55.8198, lng: -4.1878, distanceFromCentre: 4.8, nearestLandmark: 'Cambuslang Station' },
  { slug: 'burnside', name: 'Burnside', postcode: 'G73', lat: 55.8134, lng: -4.2178, distanceFromCentre: 4.6, nearestLandmark: 'Burnside Station' },
  { slug: 'kings-park', name: "King's Park", postcode: 'G44', lat: 55.8234, lng: -4.2378, distanceFromCentre: 3.9, nearestLandmark: "King's Park" },
  { slug: 'croftfoot', name: 'Croftfoot', postcode: 'G44', lat: 55.8134, lng: -4.2378, distanceFromCentre: 4.4, nearestLandmark: 'Croftfoot Station' },
  { slug: 'toryglen', name: 'Toryglen', postcode: 'G42', lat: 55.8298, lng: -4.2378, distanceFromCentre: 3.1, nearestLandmark: 'Toryglen Football Centre' },
  { slug: 'dalmarnock', name: 'Dalmarnock', postcode: 'G40', lat: 55.8412, lng: -4.2012, distanceFromCentre: 2.4, nearestLandmark: 'Dalmarnock Station' },
  { slug: 'calton', name: 'Calton', postcode: 'G40', lat: 55.8512, lng: -4.2212, distanceFromCentre: 1.6, nearestLandmark: 'Barrowlands' },
  { slug: 'barlanark', name: 'Barlanark', postcode: 'G33', lat: 55.8612, lng: -4.1578, distanceFromCentre: 3.9, nearestLandmark: 'Barlanark Road' },
  { slug: 'easterhouse', name: 'Easterhouse', postcode: 'G34', lat: 55.8712, lng: -4.1098, distanceFromCentre: 5.8, nearestLandmark: 'Easterhouse Sports Centre' },
  { slug: 'garrowhill', name: 'Garrowhill', postcode: 'G69', lat: 55.8612, lng: -4.1298, distanceFromCentre: 4.9, nearestLandmark: 'Garrowhill Station' },
  { slug: 'cranhill', name: 'Cranhill', postcode: 'G33', lat: 55.8712, lng: -4.1478, distanceFromCentre: 4.5, nearestLandmark: 'Cranhill Park' },
  { slug: 'robroyston', name: 'Robroyston', postcode: 'G33', lat: 55.9012, lng: -4.1878, distanceFromCentre: 5.2, nearestLandmark: 'Robroyston Park' },
  { slug: 'possil', name: 'Possil', postcode: 'G22', lat: 55.8934, lng: -4.2612, distanceFromCentre: 3.4, nearestLandmark: 'Possil Loch' },
  { slug: 'lambhill', name: 'Lambhill', postcode: 'G22', lat: 55.8998, lng: -4.2812, distanceFromCentre: 4.1, nearestLandmark: 'Forth and Clyde Canal' },
  { slug: 'ruchill', name: 'Ruchill', postcode: 'G20', lat: 55.8912, lng: -4.2612, distanceFromCentre: 3.1, nearestLandmark: 'Ruchill Park' },
  { slug: 'thornliebank', name: 'Thornliebank', postcode: 'G46', lat: 55.8098, lng: -4.3012, distanceFromCentre: 5.1, nearestLandmark: 'Thornliebank Industrial Estate' },
  { slug: 'giffnock', name: 'Giffnock', postcode: 'G46', lat: 55.8034, lng: -4.2878, distanceFromCentre: 5.1, nearestLandmark: 'Giffnock Shopping Centre' },
  { slug: 'clarkston', name: 'Clarkston', postcode: 'G76', lat: 55.7934, lng: -4.2678, distanceFromCentre: 6.1, nearestLandmark: 'Clarkston Toll' },
  { slug: 'busby', name: 'Busby', postcode: 'G76', lat: 55.7834, lng: -4.2778, distanceFromCentre: 7.1, nearestLandmark: 'Busby Station' },
  { slug: 'newton-mearns', name: 'Newton Mearns', postcode: 'G77', lat: 55.7698, lng: -4.3012, distanceFromCentre: 8.2, nearestLandmark: 'Mearns Cross' },
  { slug: 'barrhead', name: 'Barrhead', postcode: 'G78', lat: 55.7998, lng: -4.3898, distanceFromCentre: 7.8, nearestLandmark: 'Barrhead Town Centre' },
  { slug: 'nitshill', name: 'Nitshill', postcode: 'G53', lat: 55.8134, lng: -4.3512, distanceFromCentre: 5.5, nearestLandmark: 'Nitshill Station' },
  { slug: 'penilee', name: 'Penilee', postcode: 'G52', lat: 55.8534, lng: -4.3512, distanceFromCentre: 4.2, nearestLandmark: 'Penilee Road' },
  { slug: 'cardonald', name: 'Cardonald', postcode: 'G52', lat: 55.8534, lng: -4.3312, distanceFromCentre: 3.8, nearestLandmark: 'Cardonald College' },
  { slug: 'hillington', name: 'Hillington', postcode: 'G52', lat: 55.8534, lng: -4.3712, distanceFromCentre: 4.9, nearestLandmark: 'Hillington Industrial Estate' },
  { slug: 'renfrew', name: 'Renfrew', postcode: 'PA4', lat: 55.8734, lng: -4.4012, distanceFromCentre: 5.9, nearestLandmark: 'Renfrew Town Centre' },
  { slug: 'clydebank', name: 'Clydebank', postcode: 'G81', lat: 55.9034, lng: -4.4012, distanceFromCentre: 7.2, nearestLandmark: 'Clydebank Shopping Centre' },
  { slug: 'dalmuir', name: 'Dalmuir', postcode: 'G81', lat: 55.9134, lng: -4.4312, distanceFromCentre: 8.4, nearestLandmark: 'Dalmuir Station' },
  { slug: 'uddingston', name: 'Uddingston', postcode: 'G71', lat: 55.8234, lng: -4.0978, distanceFromCentre: 7.1, nearestLandmark: 'Bothwell Castle' },
  { slug: 'bothwell', name: 'Bothwell', postcode: 'G71', lat: 55.8134, lng: -4.0778, distanceFromCentre: 8.1, nearestLandmark: 'Bothwell Castle' },
  { slug: 'bellshill', name: 'Bellshill', postcode: 'ML4', lat: 55.8198, lng: -4.0278, distanceFromCentre: 9.2, nearestLandmark: 'Bellshill Town Centre' },
  { slug: 'viewpark', name: 'Viewpark', postcode: 'G71', lat: 55.8198, lng: -4.0578, distanceFromCentre: 8.4, nearestLandmark: 'Viewpark Station' },
  { slug: 'blantyre', name: 'Blantyre', postcode: 'G72', lat: 55.7998, lng: -4.1178, distanceFromCentre: 8.9, nearestLandmark: 'David Livingstone Centre' },
  { slug: 'coatbridge', name: 'Coatbridge', postcode: 'ML5', lat: 55.8634, lng: -4.0178, distanceFromCentre: 9.8, nearestLandmark: 'Coatbridge Town Centre' },
  { slug: 'airdrie', name: 'Airdrie', postcode: 'ML6', lat: 55.8634, lng: -3.9778, distanceFromCentre: 11.2, nearestLandmark: 'Airdrie Town Centre' },
  { slug: 'old-kilpatrick', name: 'Old Kilpatrick', postcode: 'G60', lat: 55.9234, lng: -4.4512, distanceFromCentre: 9.8, nearestLandmark: 'Erskine Bridge' },
  { slug: 'west-end', name: 'West End', postcode: 'G12', lat: 55.8734, lng: -4.2912, distanceFromCentre: 1.5, nearestLandmark: 'Byres Road' },
  { slug: 'city-centre', name: 'City Centre', postcode: 'G1', lat: 55.8617, lng: -4.2518, distanceFromCentre: 0, nearestLandmark: 'George Square' },
  { slug: 'east-end', name: 'East End', postcode: 'G31', lat: 55.8534, lng: -4.2012, distanceFromCentre: 1.9, nearestLandmark: 'Parkhead Cross' },
  { slug: 'southside', name: 'Southside', postcode: 'G42', lat: 55.8398, lng: -4.2612, distanceFromCentre: 2.2, nearestLandmark: 'Queens Park' },
];

export const edinburghAreas: Area[] = [
  { slug: 'leith', name: 'Leith', postcode: 'EH6', lat: 55.9768, lng: -3.1736, distanceFromCentre: 2.1, nearestLandmark: 'Leith Walk' },
  { slug: 'portobello', name: 'Portobello', postcode: 'EH15', lat: 55.9534, lng: -3.1098, distanceFromCentre: 3.8, nearestLandmark: 'Portobello Beach' },
  { slug: 'musselburgh', name: 'Musselburgh', postcode: 'EH21', lat: 55.9434, lng: -3.0478, distanceFromCentre: 5.9, nearestLandmark: 'Musselburgh Racecourse' },
  { slug: 'dalkeith', name: 'Dalkeith', postcode: 'EH22', lat: 55.8934, lng: -3.0678, distanceFromCentre: 7.8, nearestLandmark: 'Dalkeith Palace' },
  { slug: 'bonnyrigg', name: 'Bonnyrigg', postcode: 'EH19', lat: 55.8734, lng: -3.1012, distanceFromCentre: 9.2, nearestLandmark: 'Bonnyrigg Town Centre' },
  { slug: 'loanhead', name: 'Loanhead', postcode: 'EH20', lat: 55.8734, lng: -3.1512, distanceFromCentre: 8.4, nearestLandmark: 'Loanhead Town Centre' },
  { slug: 'penicuik', name: 'Penicuik', postcode: 'EH26', lat: 55.8298, lng: -3.2212, distanceFromCentre: 13.1, nearestLandmark: 'Penicuik Town Centre' },
  { slug: 'south-queensferry', name: 'South Queensferry', postcode: 'EH30', lat: 55.9898, lng: -3.3912, distanceFromCentre: 9.8, nearestLandmark: 'Forth Bridge' },
  { slug: 'cramond', name: 'Cramond', postcode: 'EH4', lat: 55.9798, lng: -3.2998, distanceFromCentre: 6.2, nearestLandmark: 'Cramond Island' },
  { slug: 'corstorphine', name: 'Corstorphine', postcode: 'EH12', lat: 55.9434, lng: -3.2798, distanceFromCentre: 4.1, nearestLandmark: 'Edinburgh Zoo' },
  { slug: 'morningside', name: 'Morningside', postcode: 'EH10', lat: 55.9198, lng: -3.2012, distanceFromCentre: 2.8, nearestLandmark: 'Morningside Road' },
  { slug: 'newington', name: 'Newington', postcode: 'EH9', lat: 55.9298, lng: -3.1812, distanceFromCentre: 1.9, nearestLandmark: 'Holyrood Park' },
  { slug: 'bruntsfield', name: 'Bruntsfield', postcode: 'EH10', lat: 55.9298, lng: -3.2012, distanceFromCentre: 1.8, nearestLandmark: 'The Meadows' },
  { slug: 'stockbridge', name: 'Stockbridge', postcode: 'EH3', lat: 55.9598, lng: -3.2098, distanceFromCentre: 1.4, nearestLandmark: 'Water of Leith' },
  { slug: 'canonmills', name: 'Canonmills', postcode: 'EH3', lat: 55.9598, lng: -3.1978, distanceFromCentre: 1.2, nearestLandmark: 'Inverleith Park' },
  { slug: 'gorgie', name: 'Gorgie', postcode: 'EH11', lat: 55.9298, lng: -3.2398, distanceFromCentre: 2.4, nearestLandmark: 'Tynecastle Stadium' },
  { slug: 'dalry', name: 'Dalry', postcode: 'EH11', lat: 55.9398, lng: -3.2298, distanceFromCentre: 2.1, nearestLandmark: 'Dalry Road' },
  { slug: 'slateford', name: 'Slateford', postcode: 'EH11', lat: 55.9198, lng: -3.2498, distanceFromCentre: 2.8, nearestLandmark: 'Union Canal' },
  { slug: 'juniper-green', name: 'Juniper Green', postcode: 'EH14', lat: 55.9034, lng: -3.3012, distanceFromCentre: 5.2, nearestLandmark: 'Water of Leith' },
  { slug: 'currie', name: 'Currie', postcode: 'EH14', lat: 55.8934, lng: -3.3212, distanceFromCentre: 6.5, nearestLandmark: 'Currie Kirk' },
  { slug: 'balerno', name: 'Balerno', postcode: 'EH14', lat: 55.8834, lng: -3.3612, distanceFromCentre: 8.2, nearestLandmark: 'Water of Leith' },
  { slug: 'ratho', name: 'Ratho', postcode: 'EH28', lat: 55.9234, lng: -3.3912, distanceFromCentre: 7.8, nearestLandmark: 'Union Canal' },
  { slug: 'granton', name: 'Granton', postcode: 'EH5', lat: 55.9834, lng: -3.2198, distanceFromCentre: 3.1, nearestLandmark: 'Granton Harbour' },
  { slug: 'trinity', name: 'Trinity', postcode: 'EH5', lat: 55.9734, lng: -3.2098, distanceFromCentre: 2.4, nearestLandmark: 'Newhaven Harbour' },
  { slug: 'newhaven', name: 'Newhaven', postcode: 'EH6', lat: 55.9834, lng: -3.1978, distanceFromCentre: 2.8, nearestLandmark: 'Newhaven Harbour' },
  { slug: 'pilton', name: 'Pilton', postcode: 'EH5', lat: 55.9734, lng: -3.2498, distanceFromCentre: 2.9, nearestLandmark: 'Ferry Road' },
  { slug: 'muirhouse', name: 'Muirhouse', postcode: 'EH4', lat: 55.9834, lng: -3.2712, distanceFromCentre: 4.1, nearestLandmark: 'Silverknowes Golf Course' },
  { slug: 'silverknowes', name: 'Silverknowes', postcode: 'EH4', lat: 55.9834, lng: -3.2898, distanceFromCentre: 4.8, nearestLandmark: 'Silverknowes Beach' },
  { slug: 'davidsons-mains', name: "Davidson's Mains", postcode: 'EH4', lat: 55.9698, lng: -3.2998, distanceFromCentre: 4.9, nearestLandmark: 'Lauriston Castle' },
  { slug: 'barnton', name: 'Barnton', postcode: 'EH4', lat: 55.9698, lng: -3.3212, distanceFromCentre: 5.4, nearestLandmark: 'Cramond Brig' },
  { slug: 'blackhall', name: 'Blackhall', postcode: 'EH4', lat: 55.9598, lng: -3.2712, distanceFromCentre: 3.9, nearestLandmark: 'Ravelston Golf Club' },
  { slug: 'marchmont', name: 'Marchmont', postcode: 'EH9', lat: 55.9298, lng: -3.1912, distanceFromCentre: 1.4, nearestLandmark: 'The Meadows' },
  { slug: 'edinburgh-tollcross', name: 'Tollcross', postcode: 'EH3', lat: 55.9398, lng: -3.2012, distanceFromCentre: 0.8, nearestLandmark: 'Tollcross Clock' },
  { slug: 'haymarket', name: 'Haymarket', postcode: 'EH12', lat: 55.9434, lng: -3.2198, distanceFromCentre: 1.2, nearestLandmark: 'Haymarket Station' },
  { slug: 'fountainbridge', name: 'Fountainbridge', postcode: 'EH3', lat: 55.9398, lng: -3.2112, distanceFromCentre: 1.1, nearestLandmark: 'Union Canal' },
  { slug: 'gilmerton', name: 'Gilmerton', postcode: 'EH17', lat: 55.8998, lng: -3.1512, distanceFromCentre: 5.2, nearestLandmark: 'Gilmerton Cove' },
  { slug: 'liberton', name: 'Liberton', postcode: 'EH16', lat: 55.9098, lng: -3.1612, distanceFromCentre: 4.1, nearestLandmark: 'Liberton Tower' },
  { slug: 'craigmillar', name: 'Craigmillar', postcode: 'EH16', lat: 55.9198, lng: -3.1498, distanceFromCentre: 3.2, nearestLandmark: 'Craigmillar Castle' },
  { slug: 'niddrie', name: 'Niddrie', postcode: 'EH15', lat: 55.9298, lng: -3.1298, distanceFromCentre: 3.4, nearestLandmark: 'Niddrie Castle' },
  { slug: 'duddingston', name: 'Duddingston', postcode: 'EH15', lat: 55.9398, lng: -3.1498, distanceFromCentre: 2.8, nearestLandmark: 'Duddingston Loch' },
  { slug: 'prestonfield', name: 'Prestonfield', postcode: 'EH16', lat: 55.9298, lng: -3.1612, distanceFromCentre: 2.4, nearestLandmark: 'Prestonfield House' },
  { slug: 'fairmilehead', name: 'Fairmilehead', postcode: 'EH10', lat: 55.8998, lng: -3.2012, distanceFromCentre: 4.9, nearestLandmark: 'Hillend Ski Centre' },
  { slug: 'colinton', name: 'Colinton', postcode: 'EH13', lat: 55.9034, lng: -3.2612, distanceFromCentre: 4.8, nearestLandmark: 'Colinton Dell' },
  { slug: 'oxgangs', name: 'Oxgangs', postcode: 'EH13', lat: 55.9098, lng: -3.2398, distanceFromCentre: 3.8, nearestLandmark: 'Oxgangs Road' },
  { slug: 'lasswade', name: 'Lasswade', postcode: 'EH18', lat: 55.8798, lng: -3.1212, distanceFromCentre: 8.4, nearestLandmark: 'Lasswade High School' },
  { slug: 'roslin', name: 'Roslin', postcode: 'EH25', lat: 55.8598, lng: -3.1612, distanceFromCentre: 10.2, nearestLandmark: 'Rosslyn Chapel' },
  { slug: 'tranent', name: 'Tranent', postcode: 'EH33', lat: 55.9434, lng: -2.9578, distanceFromCentre: 11.2, nearestLandmark: 'Tranent Town Centre' },
  { slug: 'haddington', name: 'Haddington', postcode: 'EH41', lat: 55.9534, lng: -2.7778, distanceFromCentre: 16.8, nearestLandmark: 'Haddington Town Centre' },
  { slug: 'kirkliston', name: 'Kirkliston', postcode: 'EH29', lat: 55.9598, lng: -3.3912, distanceFromCentre: 8.9, nearestLandmark: 'Kirkliston Village' },
  { slug: 'broxburn', name: 'Broxburn', postcode: 'EH52', lat: 55.9334, lng: -3.4712, distanceFromCentre: 10.8, nearestLandmark: 'Broxburn Town Centre' },
  { slug: 'bathgate', name: 'Bathgate', postcode: 'EH48', lat: 55.9034, lng: -3.6412, distanceFromCentre: 15.2, nearestLandmark: 'Bathgate Town Centre' },
  { slug: 'linlithgow', name: 'Linlithgow', postcode: 'EH49', lat: 55.9734, lng: -3.5912, distanceFromCentre: 15.8, nearestLandmark: 'Linlithgow Palace' },
  { slug: 'old-town', name: 'Old Town', postcode: 'EH1', lat: 55.9487, lng: -3.1890, distanceFromCentre: 0.2, nearestLandmark: 'Edinburgh Castle' },
  { slug: 'new-town', name: 'New Town', postcode: 'EH2', lat: 55.9534, lng: -3.1978, distanceFromCentre: 0.4, nearestLandmark: 'Princes Street' },
];

export const dundeeAreas: Area[] = [
  { slug: 'broughty-ferry', name: 'Broughty Ferry', postcode: 'DD5', lat: 56.4698, lng: -2.8712, distanceFromCentre: 3.8, nearestLandmark: 'Broughty Castle' },
  { slug: 'monifieth', name: 'Monifieth', postcode: 'DD5', lat: 56.4798, lng: -2.8212, distanceFromCentre: 6.2, nearestLandmark: 'Monifieth Beach' },
  { slug: 'carnoustie', name: 'Carnoustie', postcode: 'DD7', lat: 56.5034, lng: -2.7112, distanceFromCentre: 11.8, nearestLandmark: 'Carnoustie Golf Course' },
  { slug: 'arbroath', name: 'Arbroath', postcode: 'DD11', lat: 56.5598, lng: -2.5812, distanceFromCentre: 16.8, nearestLandmark: 'Arbroath Abbey' },
  { slug: 'forfar', name: 'Forfar', postcode: 'DD8', lat: 56.6434, lng: -2.8912, distanceFromCentre: 14.2, nearestLandmark: 'Forfar Loch' },
  { slug: 'scone', name: 'Scone', postcode: 'PH2', lat: 56.4198, lng: -3.4312, distanceFromCentre: 24.8, nearestLandmark: 'Scone Palace' },
  { slug: 'coupar-angus', name: 'Coupar Angus', postcode: 'PH13', lat: 56.5498, lng: -3.2712, distanceFromCentre: 17.4, nearestLandmark: 'Coupar Angus Abbey' },
  { slug: 'blairgowrie', name: 'Blairgowrie', postcode: 'PH10', lat: 56.5934, lng: -3.3312, distanceFromCentre: 20.8, nearestLandmark: 'River Ericht' },
  { slug: 'lochee', name: 'Lochee', postcode: 'DD2', lat: 56.4734, lng: -3.0012, distanceFromCentre: 2.1, nearestLandmark: 'Lochee Park' },
  { slug: 'downfield', name: 'Downfield', postcode: 'DD3', lat: 56.4898, lng: -2.9812, distanceFromCentre: 2.8, nearestLandmark: 'Camperdown Park' },
  { slug: 'menzieshill', name: 'Menzieshill', postcode: 'DD2', lat: 56.4734, lng: -3.0212, distanceFromCentre: 2.4, nearestLandmark: 'Menzieshill Community Centre' },
  { slug: 'charleston', name: 'Charleston', postcode: 'DD2', lat: 56.4634, lng: -3.0312, distanceFromCentre: 2.9, nearestLandmark: 'Charleston Primary School' },
  { slug: 'fintry', name: 'Fintry', postcode: 'DD4', lat: 56.4898, lng: -2.9412, distanceFromCentre: 3.4, nearestLandmark: 'Fintry Road' },
  { slug: 'whitfield', name: 'Whitfield', postcode: 'DD4', lat: 56.4898, lng: -2.9212, distanceFromCentre: 3.8, nearestLandmark: 'Whitfield Park' },
  { slug: 'douglas', name: 'Douglas', postcode: 'DD4', lat: 56.4798, lng: -2.9312, distanceFromCentre: 3.2, nearestLandmark: 'Douglas Community Centre' },
  { slug: 'stobswell', name: 'Stobswell', postcode: 'DD4', lat: 56.4698, lng: -2.9412, distanceFromCentre: 2.1, nearestLandmark: 'Stobswell Park' },
  { slug: 'hilltown', name: 'Hilltown', postcode: 'DD3', lat: 56.4698, lng: -2.9712, distanceFromCentre: 1.2, nearestLandmark: 'Hilltown Tower' },
  { slug: 'invergowrie', name: 'Invergowrie', postcode: 'DD2', lat: 56.4598, lng: -3.0912, distanceFromCentre: 4.8, nearestLandmark: 'River Tay' },
  { slug: 'longforgan', name: 'Longforgan', postcode: 'DD2', lat: 56.4334, lng: -3.2012, distanceFromCentre: 8.9, nearestLandmark: 'Longforgan Village' },
  { slug: 'errol', name: 'Errol', postcode: 'PH2', lat: 56.3998, lng: -3.2512, distanceFromCentre: 12.8, nearestLandmark: 'Errol Village' },
  { slug: 'inchture', name: 'Inchture', postcode: 'PH14', lat: 56.4234, lng: -3.2812, distanceFromCentre: 11.4, nearestLandmark: 'Inchture Village' },
  { slug: 'dundee-west-end', name: 'West End', postcode: 'DD1', lat: 56.4634, lng: -2.9912, distanceFromCentre: 1.4, nearestLandmark: 'University of Dundee' },
  { slug: 'barnhill', name: 'Barnhill', postcode: 'DD5', lat: 56.4798, lng: -2.9012, distanceFromCentre: 3.1, nearestLandmark: 'Barnhill Rock Garden' },
  { slug: 'tayport', name: 'Tayport', postcode: 'DD6', lat: 56.4498, lng: -2.8912, distanceFromCentre: 5.4, nearestLandmark: 'Tay Road Bridge' },
  { slug: 'newport-on-tay', name: 'Newport-on-Tay', postcode: 'DD6', lat: 56.4398, lng: -2.9412, distanceFromCentre: 6.8, nearestLandmark: 'Newport-on-Tay Village' },
  { slug: 'wormit', name: 'Wormit', postcode: 'DD6', lat: 56.4234, lng: -3.0012, distanceFromCentre: 8.2, nearestLandmark: 'Tay Bridge' },
  { slug: 'brechin', name: 'Brechin', postcode: 'DD9', lat: 56.7298, lng: -2.6612, distanceFromCentre: 24.8, nearestLandmark: 'Brechin Cathedral' },
  { slug: 'montrose', name: 'Montrose', postcode: 'DD10', lat: 56.7134, lng: -2.4712, distanceFromCentre: 28.4, nearestLandmark: 'Montrose Basin' },
  { slug: 'kirriemuir', name: 'Kirriemuir', postcode: 'DD8', lat: 56.6698, lng: -3.0112, distanceFromCentre: 18.2, nearestLandmark: 'Kirriemuir Town Centre' },
  { slug: 'mid-craigie', name: 'Mid Craigie', postcode: 'DD4', lat: 56.4798, lng: -2.9512, distanceFromCentre: 2.4, nearestLandmark: 'Craigie Park' },
  { slug: 'strathmartine', name: 'Strathmartine', postcode: 'DD3', lat: 56.5034, lng: -2.9712, distanceFromCentre: 4.8, nearestLandmark: 'Strathmartine Castle' },
  { slug: 'city-quay', name: 'City Quay', postcode: 'DD1', lat: 56.4598, lng: -2.9612, distanceFromCentre: 0.4, nearestLandmark: 'V&A Dundee' },
  { slug: 'caird-park', name: 'Caird Park', postcode: 'DD4', lat: 56.4798, lng: -2.9212, distanceFromCentre: 2.8, nearestLandmark: 'Caird Park Golf Course' },
];

export function getAreasForCity(citySlug: string): Area[] {
  switch (citySlug) {
    case 'glasgow': return glasgowAreas;
    case 'edinburgh': return edinburghAreas;
    case 'dundee': return dundeeAreas;
    default: return [];
  }
}

export function getAreaBySlug(citySlug: string, areaSlug: string): Area | undefined {
  return getAreasForCity(citySlug).find((a) => a.slug === areaSlug);
}

export function getServiceBySlug(slug: string): ServiceSEO | undefined {
  return services.find((s) => s.slug === slug);
}

export const serviceCities = ['glasgow', 'edinburgh', 'dundee'] as const;
