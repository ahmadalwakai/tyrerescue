/**
 * Unique city content for SEO service/city pages.
 * Every city has genuinely unique copy — no duplicated content.
 */

export interface CityContent {
  name: string;
  slug: string;
  postcodes: string;
  nearbyRoads: string[];
  avgResponseMin: number;
  workshopDistance: string;
  uniqueIntro: string;
  uniqueBody: string;
  neighborCities: string[];
}

export const cityContent: Record<string, CityContent> = {
  glasgow: {
    name: 'Glasgow',
    slug: 'glasgow',
    postcodes: 'G1–G78',
    nearbyRoads: ['M8', 'M74', 'M77', 'M80', 'A8'],
    avgResponseMin: 35,
    workshopDistance: 'Based in Parkhead, 10 min from city centre',
    uniqueIntro:
      'Our workshop is based at 3 Gateside Street in Parkhead (G31 1PD), giving us rapid access to all Glasgow postcodes from G1 through G78. Whether you are stuck on the M8, parked up in the West End, or at home in Shawlands, our average response time across Glasgow is 35 minutes.',
    uniqueBody:
      'Glasgow is our home base. Duke Street Tyres has been serving Glasgow drivers since 2014 from our East End workshop. We cover every area from Bearsden in the north to Castlemilk in the south, Clydebank in the west to Baillieston in the east. Our fitters carry a full range of tyre sizes for cars, vans, and SUVs.',
    neighborCities: ['edinburgh', 'paisley', 'hamilton', 'east-kilbride', 'motherwell', 'cumbernauld'],
  },
  edinburgh: {
    name: 'Edinburgh',
    slug: 'edinburgh',
    postcodes: 'EH1–EH17',
    nearbyRoads: ['M8', 'M9', 'A1', 'A720', 'A8'],
    avgResponseMin: 55,
    workshopDistance: 'Dispatched from Glasgow, approx 50 min via M8',
    uniqueIntro:
      'We cover Edinburgh seven days a week, dispatching from our Glasgow base along the M8 corridor. From Leith and Portobello in the east to Corstorphine and Balerno in the west, our fitters navigate the city daily. Whether you are on Princes Street, stuck on the A720 City Bypass, or at home in Morningside, we aim to reach you within 55 minutes of your call.',
    uniqueBody:
      'Edinburgh drivers face unique challenges — the Old Town cobbles, the congested A8 approach, and the notorious A720 ring road all put extra strain on tyres. Our fitters carry a full range of sizes for hatchbacks, estate cars, SUVs and vans, including run-flat replacements for BMW and Mercedes drivers common in the EH postcode area. Prices to Edinburgh include the full callout with no hidden M8 surcharge. We also serve Musselburgh, Dalkeith, Loanhead and Penicuik from the same dispatch.',
    neighborCities: ['glasgow', 'livingston', 'dunfermline', 'kirkcaldy', 'falkirk'],
  },
  dundee: {
    name: 'Dundee',
    slug: 'dundee',
    postcodes: 'DD1–DD11',
    nearbyRoads: ['A90', 'A92', 'A85', 'A972'],
    avgResponseMin: 70,
    workshopDistance: 'Dispatched from Glasgow, approx 80 min via M80/A90',
    uniqueIntro:
      'Tyre Rescue covers Dundee via the M80 and A90, typically arriving within 70 minutes of your call. We serve the city centre, Broughty Ferry, Monifieth, Lochee, and the Kingsway corridor. If you are stuck on the A90 dual carriageway north of the city or parked in the Seagate, our fitters come to your exact location.',
    uniqueBody:
      'Dundee sits at the northern edge of our Scotland-wide coverage, and we recommend calling ahead for planned fittings to confirm availability. Emergency callouts are accepted 24 hours a day. The Tay Road Bridge approach and the A92 coastal route to Arbroath are roads we cover regularly. We stock a wide range of sizes suited to the mix of family saloons, SUVs and commercial vans in Dundee. Nearby towns including Forfar, Arbroath and Carnoustie can also be reached on request.',
    neighborCities: ['perth', 'kirkcaldy', 'stirling'],
  },
  stirling: {
    name: 'Stirling',
    slug: 'stirling',
    postcodes: 'FK1–FK21',
    nearbyRoads: ['M9', 'M80', 'A84', 'A91', 'A9'],
    avgResponseMin: 45,
    workshopDistance: 'Dispatched from Glasgow, approx 35 min via M80',
    uniqueIntro:
      'Stirling is one of our most accessible Scottish cities outside Glasgow, sitting just 35 minutes along the M80. Our fitters cover the city centre, Bridge of Allan, Bannockburn, Cambusbarron and the surrounding FK postcodes. Whether you are near Stirling Castle, on the M9 motorway, or parked at the Thistles Shopping Centre, we reach you in around 45 minutes.',
    uniqueBody:
      'Stirling acts as a hub for Central Scotland, and its road network — including the busy M9/M80 interchange — means tyre incidents are common year-round. Our vans carry everything from small hatchback tyres to larger SUV and van sizes. We regularly cover the University of Stirling campus, the Stirling Gateway business park, and the A84 route towards Callander. Planned fittings in Stirling receive priority scheduling with a confirmed two-hour arrival window.',
    neighborCities: ['falkirk', 'glasgow', 'perth', 'dunfermline'],
  },
  falkirk: {
    name: 'Falkirk',
    slug: 'falkirk',
    postcodes: 'FK1–FK7',
    nearbyRoads: ['M9', 'M80', 'M876', 'A803', 'A9'],
    avgResponseMin: 40,
    workshopDistance: 'Dispatched from Glasgow, approx 30 min via M80',
    uniqueIntro:
      'Falkirk sits at the crossroads of Central Scotland, where the M9, M80 and M876 converge — making it both a high-traffic area and one of our quickest destinations outside Glasgow. Our average response time in Falkirk is 40 minutes. We cover the town centre, Grangemouth, Larbert, Denny, Bonnybridge and the full FK1–FK7 postcode range.',
    uniqueBody:
      'The Falkirk area is one of Scotland\'s busiest industrial and commuter corridors. Lorries, vans and commuter cars use the M876 Kincardine Bridge route daily, and tyre damage from road debris is common. Our fitters are equipped for car, van and light commercial vehicles. The Helix Park, Falkirk Wheel, and Grangemouth refinery approach roads are all within our regular service zone. We also cover Bo\'ness and Polmont with the same pricing and no extra call-out charge.',
    neighborCities: ['stirling', 'livingston', 'edinburgh', 'cumbernauld', 'glasgow'],
  },
  paisley: {
    name: 'Paisley',
    slug: 'paisley',
    postcodes: 'PA1–PA4',
    nearbyRoads: ['M8', 'M77', 'A737', 'A726'],
    avgResponseMin: 25,
    workshopDistance: 'Dispatched from Glasgow, approx 20 min via M8',
    uniqueIntro:
      'Paisley is one of our fastest-response areas, sitting just seven miles from our Glasgow depot via the M8. Our average arrival time in Paisley is 25 minutes — one of the quickest responses we offer outside Glasgow. We cover Paisley town centre, Renfrew, Linwood, Johnstone and Elderslie, all within the PA1–PA4 postcode range.',
    uniqueBody:
      'The M8 westbound approach to Glasgow Airport passes through Paisley, and tyre incidents on this stretch are among our most common callouts. Our fitters know the Paisley road network well — from the A737 Johnstone bypass to the residential streets off the High Street. Prices in Paisley are identical to Glasgow: no additional callout distance charge. We also serve the Glasgow Airport business park and the retail parks along the A726 Linwood corridor regularly.',
    neighborCities: ['glasgow', 'greenock', 'kilmarnock', 'irvine'],
  },
  hamilton: {
    name: 'Hamilton',
    slug: 'hamilton',
    postcodes: 'ML3',
    nearbyRoads: ['M74', 'M8', 'A72', 'A723', 'A725'],
    avgResponseMin: 30,
    workshopDistance: 'Dispatched from Glasgow, approx 25 min via M74',
    uniqueIntro:
      'Hamilton is a quick 25-minute drive from our Glasgow base along the M74, making it one of our most responsive areas in Lanarkshire. We cover Hamilton town centre, Motherwell Road, Blantyre, Bothwell and the surrounding ML3 postcodes. Whether you have a flat on the M74 near Chatelherault or a slow puncture on Cadzow Street, our fitters come to you.',
    uniqueBody:
      'The M74 corridor between Glasgow and Hamilton is one of Scotland\'s busiest motorway sections, and tyre damage from road debris near the Bothwell services is a regular callout for our team. Hamilton Racecourse, the Palace Grounds retail park and the Wheatlands business area are all within our regular service footprint. We carry a full range of tyres for family cars, SUVs and commercial vans. Emergency callouts are accepted any time, day or night.',
    neighborCities: ['glasgow', 'motherwell', 'east-kilbride', 'kilmarnock'],
  },
  'east-kilbride': {
    name: 'East Kilbride',
    slug: 'east-kilbride',
    postcodes: 'G74–G75',
    nearbyRoads: ['M77', 'A725', 'A726', 'A749'],
    avgResponseMin: 28,
    workshopDistance: 'Dispatched from Glasgow, approx 25 min via M77',
    uniqueIntro:
      'East Kilbride is Scotland\'s largest new town and one of our busiest service areas outside Glasgow. Just 25 minutes from our depot via the M77 and A725, we typically arrive within 28 minutes. We cover the town centre, Hairmyres, Calderwood, Westwood, Nerston and the full G74–G75 postcode range.',
    uniqueBody:
      'East Kilbride\'s road network centres on the A725 expressway and the busy town centre ring road system. Tyre damage from kerb strikes in the multi-storey car parks and from debris on the A726 is common. Our fitters are familiar with Peel Park, Kingsgate Retail Park and the Village Theatre area. We also cover Jackton and Chapelton to the south. All fittings include balancing and a post-fit safety check at no extra cost.',
    neighborCities: ['glasgow', 'hamilton', 'motherwell', 'kilmarnock'],
  },
  motherwell: {
    name: 'Motherwell',
    slug: 'motherwell',
    postcodes: 'ML1',
    nearbyRoads: ['M74', 'M8', 'A721', 'A723', 'A725'],
    avgResponseMin: 30,
    workshopDistance: 'Dispatched from Glasgow, approx 25 min via M74/M8',
    uniqueIntro:
      'Motherwell is a core Lanarkshire service area for us, reachable in around 25 minutes via the M74 and M8 interchange. We cover Motherwell town centre, Wishaw, Bellshill, Uddingston, Viewpark and the ML1 postcodes. Tyre incidents on the M74 and the busy A721 Carluke Road are regular callouts for our team.',
    uniqueBody:
      'The Motherwell area sits at the junction of several major routes connecting Glasgow to the south of Scotland. Our fitters service everything from compact city cars to larger SUVs and work vans used by the area\'s many tradespeople and commuters. Ravenscraig Regional Sports Facility, Motherwell FC\'s Fir Park, and the Brandon Shopping Centre are all landmarks within our regular service zone. We extend coverage to Carluke and Larkhall on request.',
    neighborCities: ['glasgow', 'hamilton', 'cumbernauld', 'east-kilbride'],
  },
  livingston: {
    name: 'Livingston',
    slug: 'livingston',
    postcodes: 'EH54',
    nearbyRoads: ['M8', 'A71', 'A899', 'A779'],
    avgResponseMin: 45,
    workshopDistance: 'Dispatched from Glasgow, approx 35 min via M8',
    uniqueIntro:
      'Livingston sits mid-way along the M8 between Glasgow and Edinburgh, making it a natural stop for our westbound and eastbound fitters. Our average response time in Livingston is 45 minutes. We cover the town centre, Almondvale, Deans, Craigshill, Howden and the full EH54 postcode, along with Bathgate and Broxburn nearby.',
    uniqueBody:
      'Livingston is West Lothian\'s commercial hub, with Livingston Designer Outlet, the Centre retail park and several large business parks generating steady tyre callouts. The A899 dual carriageway and the M8 slip roads are frequent locations for our emergency visits. Our fitters carry a wide range of tyre sizes to cover the mix of family cars, delivery vans and company fleet vehicles that dominate the local roads. Same pricing applies whether you are in Livingston town centre or the outlying villages.',
    neighborCities: ['edinburgh', 'falkirk', 'glasgow'],
  },
  kirkcaldy: {
    name: 'Kirkcaldy',
    slug: 'kirkcaldy',
    postcodes: 'KY1–KY2',
    nearbyRoads: ['A92', 'A910', 'A921'],
    avgResponseMin: 65,
    workshopDistance: 'Dispatched from Glasgow, approx 70 min via M8/A92',
    uniqueIntro:
      'Kirkcaldy is covered by our Fife service zone, with fitters dispatched via the M8 and A92 coastal route. Our typical response time in Kirkcaldy is 65 minutes. We cover the town centre, Dysart, Burntisland, Kinghorn, and the KY1–KY2 postcode range. Emergency callouts take priority and are accepted 24 hours a day.',
    uniqueBody:
      'The A92 Fife Coastal Route is the main artery through Kirkcaldy, and tyre damage from the road\'s surface transitions and roadworks is a common callout. The Mercat Shopping Centre, Gallatown retail areas and the Ravenscraig Hospital approach are all within our regular service footprint. We also cover Glenrothes and Leslie to the north on request. All prices quoted for Kirkcaldy include the full callout — no Forth Bridge toll surcharges.',
    neighborCities: ['edinburgh', 'dundee', 'dunfermline', 'perth'],
  },
  perth: {
    name: 'Perth',
    slug: 'perth',
    postcodes: 'PH1–PH2',
    nearbyRoads: ['M90', 'A9', 'A85', 'A93'],
    avgResponseMin: 65,
    workshopDistance: 'Dispatched from Glasgow, approx 65 min via M80/A9',
    uniqueIntro:
      'Perth is our gateway to Highland Scotland, reachable in around 65 minutes via the M80 and A9. We cover Perth city centre, Scone, Crieff Road, Friarton and the PH1–PH2 postcode area. The A9 northbound — Scotland\'s busiest A-road — passes through Perth, and roadside callouts on this stretch are handled as a priority.',
    uniqueBody:
      'Perth\'s position at the junction of the A9 and M90 makes it a high-frequency area for tyre emergencies, particularly for drivers heading to or from Inverness, Pitlochry and Aviemore. Our fitters carry a broad range of tyre sizes suited to the mix of touring cars, camper vans and SUVs that use this route. St John\'s Shopping Centre, the Perth Leisure Pool area and the A85 Crieff road are all within our regular coverage. We recommend booking planned fittings in advance to ensure availability.',
    neighborCities: ['dundee', 'stirling', 'dunfermline'],
  },
  cumbernauld: {
    name: 'Cumbernauld',
    slug: 'cumbernauld',
    postcodes: 'G67–G68',
    nearbyRoads: ['M80', 'M73', 'A80', 'A8011'],
    avgResponseMin: 25,
    workshopDistance: 'Dispatched from Glasgow, approx 20 min via M80',
    uniqueIntro:
      'Cumbernauld is one of our closest service areas outside Glasgow, just 20 minutes along the M80. Our average response time in Cumbernauld is 25 minutes. We cover the town centre, Condorrat, Kildrum, Seafar, Abronhill and the full G67–G68 postcode range. The M80/M73 interchange sits right on the edge of Cumbernauld and is a common emergency callout location.',
    uniqueBody:
      'Cumbernauld was built around its dual carriageway network, and the town\'s distinctive road layout — with elevated sections and roundabouts — means tyre damage from kerbs and debris is frequent. Cumbernauld Shopping Centre, the Wardpark North business estate and the Tryst Sports Centre are all regular locations for our call-outs. We also serve Kilsyth and Mollinsburn on the same dispatch with no additional charge. Our fitters are familiar with the town\'s unusual road system and navigate it quickly.',
    neighborCities: ['glasgow', 'falkirk', 'motherwell', 'stirling'],
  },
  dumfries: {
    name: 'Dumfries',
    slug: 'dumfries',
    postcodes: 'DG1–DG2',
    nearbyRoads: ['A75', 'A76', 'A701'],
    avgResponseMin: 90,
    workshopDistance: 'Dispatched from Glasgow, approx 80 min via M74/A76',
    uniqueIntro:
      'Dumfries is the furthest regular service point on our southern Scotland route, reached via the M74 and A76 in approximately 80 minutes from our Glasgow depot. Our typical response time for Dumfries callouts is 90 minutes. We cover Dumfries town centre, Summerhill, Locharbriggs, Maxwelltown and the DG1–DG2 postcode area.',
    uniqueBody:
      'The A75 Euroroute — connecting the ferry ports at Stranraer and Cairnryan with the M74 — is one of Scotland\'s most important freight corridors and a frequent location for tyre emergencies involving HGVs, caravans and loaded vans. Dumfries\'s town centre roads, including the busy Irish Street and King Street, are also common callout locations. We cover Annan and Lockerbie on the same M74 route, and Sanquhar via the A76 on request. We strongly recommend calling ahead for planned fittings to confirm fitter availability.',
    neighborCities: ['kilmarnock', 'ayr', 'hamilton'],
  },
  greenock: {
    name: 'Greenock',
    slug: 'greenock',
    postcodes: 'PA15–PA16',
    nearbyRoads: ['M8', 'A8', 'A78', 'A770'],
    avgResponseMin: 40,
    workshopDistance: 'Dispatched from Glasgow, approx 35 min via M8/A8',
    uniqueIntro:
      'Greenock sits on the south bank of the Clyde, reachable in around 35 minutes from our Glasgow depot via the M8 and A8. We cover Greenock town centre, Port Glasgow, Gourock, Inverkip and the PA15–PA16 postcode area. The A8 Clydeside route is one of Scotland\'s most scenic but also one of the most demanding on tyres due to its surface conditions.',
    uniqueBody:
      'Greenock\'s waterfront location and hilly road network create specific tyre wear patterns, and kerb damage on the town\'s steep residential streets is a common callout. The Oak Mall Shopping Centre, the IBM Spango Valley business park and the Greenock Container Terminal approach roads are regular service locations. We also cover Wemyss Bay and Skelmorlie to the south on the A78 coastal route. Ferry passengers heading to or from Gourock pier are among our regular emergency callout customers.',
    neighborCities: ['glasgow', 'paisley', 'irvine'],
  },
  dunfermline: {
    name: 'Dunfermline',
    slug: 'dunfermline',
    postcodes: 'KY11–KY12',
    nearbyRoads: ['M90', 'A985', 'A907', 'A823'],
    avgResponseMin: 55,
    workshopDistance: 'Dispatched from Glasgow, approx 50 min via M8/M90',
    uniqueIntro:
      'Dunfermline is reached via the Forth Road Bridge and M90 in around 50 minutes from our Glasgow base. Our average response time in Dunfermline is 55 minutes. We cover the town centre, Rosyth, Inverkeithing, Crossgates, Kelty and the KY11–KY12 postcode range. The M90 junction near Admiralty Road is a frequent emergency callout point.',
    uniqueBody:
      'Dunfermline is Fife\'s largest town and a major commuter hub for Edinburgh via the Forth bridges. The Kingsgate Shopping Centre, Duloch Park retail area and the Rosyth naval dockyard approach roads are all within our regular service zone. The A985 Crombie Point route and the Queensferry Crossing approach roads are common tyre incident locations for heavy commercial vehicles and coaches. We extend coverage to Cowdenbeath, Lochgelly and Oakley on request.',
    neighborCities: ['edinburgh', 'kirkcaldy', 'stirling', 'perth'],
  },
  kilmarnock: {
    name: 'Kilmarnock',
    slug: 'kilmarnock',
    postcodes: 'KA1–KA3',
    nearbyRoads: ['M77', 'A71', 'A77', 'A76'],
    avgResponseMin: 35,
    workshopDistance: 'Dispatched from Glasgow, approx 30 min via M77',
    uniqueIntro:
      'Kilmarnock is one of our most active Ayrshire service areas, just 30 minutes from Glasgow via the M77. Our average response time in Kilmarnock is 35 minutes. We cover the town centre, Riccarton, Onthank, New Farm Loch, Bellfield and the KA1–KA3 postcode range. The A77 and A71 routes into town are common emergency callout locations.',
    uniqueBody:
      'Kilmarnock\'s position on the M77/A77 corridor — one of Scotland\'s main routes to the Ayrshire coast and Cairnryan ferry port — means our fitters are dispatched here regularly for both emergency and planned fittings. The Kilmarnock Centre, Shortlees roundabout area and the Burns Mall car parks are frequent service locations. We also cover Stewarton and Galston on the A71 with the same pricing. Heavy goods vehicles heading to the A77 ferry route are among our regular commercial clients.',
    neighborCities: ['glasgow', 'ayr', 'irvine', 'hamilton', 'east-kilbride'],
  },
  ayr: {
    name: 'Ayr',
    slug: 'ayr',
    postcodes: 'KA7–KA8',
    nearbyRoads: ['A77', 'A78', 'A70', 'A719'],
    avgResponseMin: 50,
    workshopDistance: 'Dispatched from Glasgow, approx 45 min via M77/A77',
    uniqueIntro:
      'Ayr is our most southerly regular Ayrshire service area, reached via the M77 and A77 in around 45 minutes. Our average response time in Ayr is 50 minutes. We cover Ayr town centre, Newton-on-Ayr, Prestwick, Troon and the KA7–KA8 postcode range. Prestwick Airport is within our coverage area, making us a useful call for hire car drivers and airport-bound travellers.',
    uniqueBody:
      'The A77 Stranraer corridor through Ayr is one of Scotland\'s busiest tourist and freight routes, particularly in summer when caravans and motorhomes are common. Tyre damage on the Ayr seafront road and the A719 coastal route to Culzean Castle is a regular callout. The Ayr Racecourse, the Riverside Retail Park and the Low Green seafront area are all within our service footprint. We also cover Maybole and Girvan to the south on request, with advance booking recommended for outlying areas.',
    neighborCities: ['kilmarnock', 'irvine', 'paisley', 'glasgow'],
  },
  irvine: {
    name: 'Irvine',
    slug: 'irvine',
    postcodes: 'KA11–KA12',
    nearbyRoads: ['A78', 'A71', 'A737'],
    avgResponseMin: 40,
    workshopDistance: 'Dispatched from Glasgow, approx 35 min via M77/A71',
    uniqueIntro:
      'Irvine is an Ayrshire new town with a strong industrial and retail base, reachable in around 35 minutes from Glasgow via the M77 and A71. Our average response time in Irvine is 40 minutes. We cover Irvine town centre, Bourtreehill, Dreghorn, Springside and the KA11–KA12 postcode area, along with Ardrossan and Saltcoats on the A78 coast road.',
    uniqueBody:
      'The Irvine Development Corporation road network centres on the A71 and A78 expressways, and the town\'s many roundabouts generate regular kerb-strike callouts. The Rivergate Shopping Centre, Harbourside and the ICI Irvine industrial estate are frequent service locations. Ardrossan Harbour — a busy ferry terminal for Arran — means we regularly assist travellers with tyre emergencies before catching sailings. We carry sizes suited to ferry-route traffic including large SUVs, people carriers and light commercials.',
    neighborCities: ['kilmarnock', 'ayr', 'paisley', 'greenock'],
  },
};
