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
      'Glasgow is our home. Our workshop is at 3 Gateside Street, Parkhead — a real tyre workshop you can visit, not a call centre or booking platform. Every fitter who comes to your car is employed directly by Tyre Rescue, trained in tyre safety, and carries our public liability insurance. We cover every area from Bearsden in the north to Castlemilk in the south, Clydebank in the west to Baillieston in the east — in our own branded vans, with our own people.',
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
  inverness: {
    name: 'Inverness',
    slug: 'inverness',
    postcodes: 'IV1–IV12',
    nearbyRoads: ['A9', 'A82', 'A96', 'A862'],
    avgResponseMin: 90,
    workshopDistance: 'Scheduled service — advance booking recommended for Highland areas',
    uniqueIntro:
      'Inverness is the capital of the Scottish Highlands, and Tyre Rescue covers the full IV1–IV12 postcode area including the city itself, the Black Isle, Nairn and the Beauly corridor. As Scotland\'s northernmost large city, Inverness is a hub for Highland motorists — and tyre damage on the A9 approach, the A96 coastal road and the rural B-roads around the Black Isle is a common occurrence. Our average response time in Inverness city is 90 minutes; we recommend calling ahead for outlying areas.',
    uniqueBody:
      'Inverness drivers face Highland-specific tyre hazards: potholed single-track roads, gravel verges, and seasonal damage from frost and standing water. We carry a broad range of sizes suited to the mix of SUVs, 4x4s, campervans and commercial vehicles that dominate Highland traffic. Raigmore Hospital, the Retail Park on Eastfield Way, and the A9 Kessock Bridge approaches are frequent service locations. We also cover Nairn (IV12), the Black Isle villages of Fortrose and Avoch (IV9–IV10), Beauly (IV4) and Muir of Ord (IV6) from the same dispatch.',
    neighborCities: ['dingwall', 'elgin'],
  },
  dingwall: {
    name: 'Dingwall',
    slug: 'dingwall',
    postcodes: 'IV14–IV27',
    nearbyRoads: ['A9', 'A835', 'A836', 'A862'],
    avgResponseMin: 95,
    workshopDistance: 'Scheduled service — advance booking recommended for Ross-shire and Sutherland',
    uniqueIntro:
      'Dingwall is the county town of Ross-shire and our service hub for the IV14–IV27 postcode corridor, covering the Cromarty Firth industrial towns and the west Highland coast all the way to Ullapool. Our average response time in Dingwall is 95 minutes. The A9 north through Alness, Invergordon and Tain is a major haulage route where tyre failures are common, and we serve these communities with the same pricing as our central-belt coverage.',
    uniqueBody:
      'Ross-shire presents unique tyre challenges: the A835 Ullapool road crosses open moorland where help can be 30 minutes or more away; the A9 through Invergordon serves heavy port traffic from the Cromarty Firth refineries; and seasonal tourist traffic on routes to the North Coast 500 keeps demand high. We carry heavy-load tyre sizes for vans and commercials as well as all-season options popular in this climate. Dornoch (IV25), Ullapool (IV26) and Lairg (IV27) are covered on an advance-booking basis.',
    neighborCities: ['inverness', 'elgin'],
  },
  elgin: {
    name: 'Elgin',
    slug: 'elgin',
    postcodes: 'IV30–IV36',
    nearbyRoads: ['A96', 'A941', 'A98', 'B9013'],
    avgResponseMin: 90,
    workshopDistance: 'Scheduled service — advance booking recommended for Moray areas',
    uniqueIntro:
      'Elgin is the largest town in Moray and our coverage hub for the IV30–IV36 postcode band, taking in Lossiemouth, Fochabers, Forres and the Findhorn Bay coastal stretch. Our average response time in Elgin is 90 minutes. The A96 Aberdeen–Inverness trunk road runs through the town and generates regular callouts from lorry and car drivers alike. RAF Lossiemouth and the distilleries around Rothes and Craigellachie also bring steady commercial tyre demand to this part of Moray.',
    uniqueBody:
      'Elgin sits at the heart of the whisky-distillery belt and the Moray Coast tourist trail, meaning summer traffic spikes on the B9013 coast road and on narrow single-track routes through the forest roads west of Forres. We stock sizes suited to the campervan and touring caravan market as well as standard passenger car tyres. Lossiemouth (IV31), Fochabers (IV32), Forres (IV36) and the Findhorn Bay area are all covered from the same dispatch, with Burghead and Hopeman served as local villages.',
    neighborCities: ['inverness', 'dingwall'],
  },
  'fort-william': {
    name: 'Fort William',
    slug: 'fort-william',
    postcodes: 'PH33–PH50',
    nearbyRoads: ['A82', 'A830', 'A86', 'A87', 'B8004'],
    avgResponseMin: 95,
    workshopDistance: 'Scheduled service — advance booking recommended for Lochaber and Road to the Isles areas',
    uniqueIntro:
      'Fort William is the Outdoor Capital of the UK — the gateway to Ben Nevis, the Great Glen, Glencoe and the Road to the Isles. Tyre Rescue covers the full PH33–PH50 Lochaber postcode area including Glencoe (PH49), Spean Bridge (PH34), Mallaig (PH41) and Kinlochleven (PH50). Our average response time in Fort William is 95 minutes. The A82 Great Glen road and the A830 Road to the Isles are our primary routes, carrying some of the highest tourist volumes in Scotland.',
    uniqueBody:
      'Lochaber draws millions of visitors annually for Ben Nevis climbs, the West Highland Way, Glencoe and the Glenfinnan Viaduct — made famous by the Jacobite Steam Train. The combination of narrow single-track roads, cattle grids on the B8004 and the A830, steep mountain passes through Glencoe and the sheer volume of campervans, motorhomes and hire cars means tyre damage is a daily occurrence in season. We stock all-terrain and all-season tyres suited to mountain driving, run-flats for hire vehicles and heavy-duty sizes for motorhomes. Mallaig (PH41) at the end of the Road to the Isles is covered with advance notice, as are the Ardnamurchan peninsula (PH36) and Glenelg (IV40) on the approach to the Skye ferry.',
    neighborCities: ['inverness', 'oban', 'isle-of-skye'],
  },
  'st-andrews': {
    name: 'St Andrews',
    slug: 'st-andrews',
    postcodes: 'KY9–KY16',
    nearbyRoads: ['A91', 'A917', 'A915', 'A92', 'B939'],
    avgResponseMin: 75,
    workshopDistance: 'Scheduled service — advance booking recommended for East Fife and East Neuk areas',
    uniqueIntro:
      'St Andrews is the home of golf and one of Scotland\'s most visited towns, with the University of St Andrews, the Old Course and the cathedral ruins attracting visitors year-round. Tyre Rescue covers the KY9–KY16 East Fife postcode area including the East Neuk fishing villages of Anstruther, Crail and Elie, as well as Cupar (KY15) and Leuchars (KY16). Our average response time in St Andrews is 75 minutes.',
    uniqueBody:
      'St Andrews and the East Neuk of Fife sit on a peninsula with limited road access — the A91 from Cupar, the A917 coastal road and the A915 from Leven are the main approaches. Summer golf-week traffic and the Old Course hotel visitors bring high-end vehicles including BMW, Mercedes and Porsche to roads that include narrow coastal B-roads prone to punctures from gravel and kerb strikes. Leuchars has an RAF station that generates military and civilian vehicle traffic on the B945. The East Neuk villages — Anstruther, Crail, Pittenweem — are popular tourist destinations with narrow cobbled streets where slow punctures from kerb damage are common.',
    neighborCities: ['dundee', 'kirkcaldy', 'perth'],
  },
  pitlochry: {
    name: 'Pitlochry',
    slug: 'pitlochry',
    postcodes: 'PH8–PH18, FK21',
    nearbyRoads: ['A9', 'A924', 'A827', 'A826', 'B8019'],
    avgResponseMin: 80,
    workshopDistance: 'Scheduled service — advance booking recommended for Highland Perthshire areas',
    uniqueIntro:
      'Pitlochry is the gateway to Highland Perthshire — a major tourist town on the A9 surrounded by lochs, glens and whisky distilleries. Tyre Rescue covers the PH8–PH18 postcode area including Dunkeld (PH8), Aberfeldy (PH15), Blair Atholl (PH18) and Killin (FK21) at the head of Loch Tay. Our average response time in Pitlochry is 80 minutes. The A9 through Pitlochry is one of Scotland\'s busiest trunk roads, with the Pass of Killiecrankie immediately to the north.',
    uniqueBody:
      'Highland Perthshire is a major touring destination — Dunkeld Cathedral, Blair Castle, the Falls of Dochart at Killin and the Birks of Aberfeldy draw visitors on A-roads and single-track B-roads throughout the season. The B8019 Loch Tummel road and the B846 to Kinloch Rannoch are both scenic but remote, with limited roadside assistance available. We carry tyre sizes suited to campervan, caravan and motorhome fitments as well as standard passenger cars. Dunkeld (PH8) at the Highland Boundary Fault is the southern edge of our Pitlochry coverage, and Blair Atholl (PH18) at the entrance to the Cairngorms marks the northern boundary.',
    neighborCities: ['perth', 'inverness', 'aberdeen'],
  },
  'east-lothian': {
    name: 'East Lothian',
    slug: 'east-lothian',
    postcodes: 'EH21, EH31–EH42',
    nearbyRoads: ['A1', 'A198', 'A199', 'A6093', 'B1377'],
    avgResponseMin: 55,
    workshopDistance: 'Covered from Edinburgh — competitive response times across East Lothian',
    uniqueIntro:
      'East Lothian is Edinburgh\'s coastal commuter belt — a string of market towns and seaside villages from Musselburgh (EH21) in the west to Dunbar (EH42) in the east, linked by the A1 and the scenic A198 coastal road. Tyre Rescue covers the full East Lothian postcode area: Musselburgh, Prestonpans, Tranent, Haddington, North Berwick, Gullane and Dunbar. Our average response time across East Lothian is 55 minutes.',
    uniqueBody:
      'East Lothian has one of the highest concentrations of golf courses in the world — Muirfield, North Berwick, Gullane and Dunbar are all Open Championship or qualifying venues, attracting premium vehicle traffic from around the world. The A1 Edinburgh–London road carries heavy lorry traffic through the county, and the B-roads connecting coastal villages to the A1 are narrow with grass verges that conceal kerb edges. Haddington (EH41) is the county town, and the A6093 through the Tyne valley carries agricultural vehicle traffic that deposits debris on the road surface. Musselburgh Racecourse and the East Lothian golf tourism economy keep vehicle numbers high throughout the year.',
    neighborCities: ['edinburgh', 'galashiels'],
  },
  arbroath: {
    name: 'Arbroath',
    slug: 'arbroath',
    postcodes: 'DD7–DD11',
    nearbyRoads: ['A92', 'A933', 'A94', 'A90', 'A935'],
    avgResponseMin: 70,
    workshopDistance: 'Scheduled service — advance booking recommended for Angus towns',
    uniqueIntro:
      'Arbroath is the Angus coast\'s main town, famous for the Declaration of Arbroath and its smokies. Tyre Rescue covers the DD7–DD11 Angus postcode area: Arbroath, Montrose (DD10), Forfar (DD8), Kirriemuir (DD8), Brechin (DD9) and Carnoustie (DD7). Our average response time in Arbroath is 70 minutes. The A92 Dundee–Arbroath coastal road and the A90 Dundee–Aberdeen trunk road are our primary routes through Angus.',
    uniqueBody:
      'Angus combines a productive agricultural hinterland with a scenic coastline — the cliff roads between Arbroath and Montrose are tourist routes where gravel from farm vehicles causes regular tyre damage. Carnoustie (DD7) hosts The Open Championship and attracts premium vehicle traffic from golf visitors worldwide. Montrose Basin is a nature reserve with narrow approach roads. Forfar (DD8) and Kirriemuir (DD8) — birthplace of J.M. Barrie, the creator of Peter Pan — are market towns connected by the A926 through the Strathmore valley. Brechin (DD9) with its unique round tower is one of Scotland\'s oldest cathedral cities, on the A935 between Forfar and Montrose.',
    neighborCities: ['dundee', 'perth', 'aberdeen'],
  },
  oban: {
    name: 'Oban',
    slug: 'oban',
    postcodes: 'PA20–PA80',
    nearbyRoads: ['A85', 'A816', 'A83', 'A819', 'A82'],
    avgResponseMin: 100,
    workshopDistance: 'Scheduled service — advance booking required for Argyll & Bute and island areas',
    uniqueIntro:
      'Oban is the Gateway to the Isles and our coverage hub for the PA20–PA80 postcode area, covering all of Argyll and Bute: Dunoon, Rothesay on the Isle of Bute, Lochgilphead, Inveraray, Campbeltown at the tip of the Kintyre peninsula, and island communities on Mull, Islay and Jura. Our average response time in Oban town is 100 minutes. The A85 from Crianlarich, the A83 Kintyre road and the A816 south from Oban to Lochgilphead are our primary routes.',
    uniqueBody:
      'Argyll and Bute is one of Scotland\'s most scenically varied regions, stretching from the Cowal Peninsula facing the Clyde Estuary to the remote shores of Kintyre and the Hebridean islands. The single-track roads across the Kintyre Peninsula, the forest roads around Lochgilphead and the seasonal tourist influx on the A83 and A816 all generate tyre damage from gravel surfaces, cattle grids and roadside debris. Island coverage for Mull (PA64–PA75), Islay (PA42–PA49) and Bute (PA20) requires ferry travel and is booked on a scheduled basis with minimum 48 hours\' notice. We stock tyres for motorhomes, campervans, 4x4s and the full range of passenger vehicles common in the touring market.',
    neighborCities: ['glasgow', 'inverurie', 'stirling'],
  },
  wick: {
    name: 'Wick',
    slug: 'wick',
    postcodes: 'KW1–KW17',
    nearbyRoads: ['A9', 'A99', 'A836', 'A882'],
    avgResponseMin: 120,
    workshopDistance: 'Scheduled service — advance booking essential for Caithness and Orkney',
    uniqueIntro:
      'Wick is Scotland\'s most northerly mainland town and our coverage hub for the KW postcode area — covering all of Caithness, northern Sutherland and Orkney. Our average response time in Wick is 120 minutes. We cover Thurso (KW14), John o\' Groats (KW1), Helmsdale (KW8), Golspie (KW10) and the entire Caithness coastal road. Orkney (KW15–KW17) is covered on a scheduled basis via the Pentland Firth ferry connection.',
    uniqueBody:
      'Caithness is characterised by open, windswept roads — the A9 north from Helmsdale, the A99 to John o\' Groats and the A836 across the Flow Country are all exposed routes where tyre damage from debris and road surface deterioration is more common than in sheltered central Scotland. The Dounreay nuclear site near Thurso generates steady commercial vehicle traffic, and tourist numbers on the North Coast 500 bring motorhomes, campervans and touring cars to these roads in volume. Orkney coverage for Kirkwall (KW15) and Stromness (KW16) requires advance booking with minimum 48 hours\' notice and is arranged via the NorthLink ferry or Pentland Ferries from Gills Bay.',
    neighborCities: ['inverness', 'dingwall'],
  },
  stornoway: {
    name: 'Stornoway',
    slug: 'stornoway',
    postcodes: 'HS1–HS9',
    nearbyRoads: ['A857', 'A858', 'A859', 'A865', 'A867'],
    avgResponseMin: 150,
    workshopDistance: 'Island service — minimum 48 hours advance booking required for all HS postcode areas',
    uniqueIntro:
      'Stornoway is the capital of the Western Isles (Na h-Eileanan Siar) and our service hub for the HS1–HS9 postcode area covering Lewis, Harris, North Uist, Benbecula, South Uist and Barra. Island service requires a minimum of 48 hours\' advance notice. Tyres are transported via CalMac ferry from Ullapool or Uig. Our response covers all Western Isles communities — from Stornoway (HS1) and the Harris township of Tarbert (HS3) to the remote Uist chain and Barra (HS9).',
    uniqueBody:
      'The Western Isles road network is characterised by single-track roads with passing places, cattle grids and exposed moorland routes where tyre damage from sharp-edged stones and road surface deterioration is common. Lewis and Harris carry the highest traffic volumes on the A857 and A859; the Uist spine road A865 connects the causeway islands and has limited tyre services locally. Benbecula Airport (HS7) provides an alternative logistics route for urgent tyre supplies in some cases. We stock sizes for the 4x4 and SUV vehicles common on island roads, as well as standard passenger car fitments. All island callouts are booked in advance — we do not offer same-day emergency service to HS postcodes.',
    neighborCities: ['inverness', 'dingwall'],
  },
  lerwick: {
    name: 'Lerwick',
    slug: 'lerwick',
    postcodes: 'ZE1–ZE3',
    nearbyRoads: ['A970', 'A971', 'A968', 'A969'],
    avgResponseMin: 180,
    workshopDistance: 'Island service — minimum 48 hours advance booking required for all ZE postcode areas',
    uniqueIntro:
      'Lerwick is the capital of Shetland and our northernmost service point, covering the ZE1–ZE3 postcode area across Shetland Mainland, Yell, Whalsay and the smaller islands. Island service requires a minimum of 48 hours\' advance notice. Tyres are transported via NorthLink ferry from Aberdeen to Lerwick. We cover Lerwick (ZE1), Scalloway (ZE1), Brae (ZE2) and the inter-island ferry routes to Yell and Whalsay.',
    uniqueBody:
      'Shetland\'s road network is compact and well-maintained for its remoteness, but the weather conditions — with winds regularly exceeding 60mph — and the concentration of heavy vehicles serving the oil and gas terminal at Sullom Voe (ZE2) mean tyre damage is a genuine and regular issue for residents and commercial operators. The oil terminal at Sullom Voe is one of Europe\'s largest crude oil handling facilities and generates significant lorry and tanker traffic on the A970 north road. We stock sizes suited to heavy commercial vehicles as well as passenger cars. All Shetland callouts are booked in advance and we recommend ordering replacement tyres at the same time as booking, to avoid waiting on the next ferry.',
    neighborCities: ['aberdeen'],
  },
  aberdeen: {
    name: 'Aberdeen',
    slug: 'aberdeen',
    postcodes: 'AB10–AB56',
    nearbyRoads: ['A90', 'A96', 'A92', 'A944', 'A93', 'A947'],
    avgResponseMin: 75,
    workshopDistance: 'Scheduled service — advance booking recommended for Aberdeen and Aberdeenshire',
    uniqueIntro:
      'Aberdeen is Scotland\'s third largest city and the energy capital of Europe. Tyre Rescue covers the full AB postcode area — from Union Street in the city centre (AB10) to Peterhead (AB42), Fraserburgh (AB43), Inverurie (AB51) and Royal Deeside (AB35). Our average response time in Aberdeen city is 75 minutes. The A90 north and south, the A96 Inverness road and the A93 Deeside road are the main arteries we cover daily.',
    uniqueBody:
      'Aberdeen\'s oil and gas industry means a high concentration of premium vehicles, 4x4s and heavy commercial traffic — and a tyre market that values fast, professional service. The city\'s granite-sett roads in Old Aberdeen and the A90 dual carriageway both generate very different tyre stress patterns. We carry run-flat tyres common on BMW and Mercedes fleet vehicles used by the energy sector, as well as all-season fitments popular in the northeast\'s climate. Aberdeen Airport at Dyce (AB21), the Westhill technology park (AB32), the Bridge of Don industrial estate (AB22) and Portlethen (AB12) to the south are all covered. Royal Deeside including Banchory (AB31) and Ballater (AB35) near Balmoral are served on an advance-booking basis.',
    neighborCities: ['elgin', 'inverness'],
  },
  galashiels: {
    name: 'Galashiels',
    slug: 'galashiels',
    postcodes: 'TD1–TD15',
    nearbyRoads: ['A7', 'A68', 'A72', 'A698', 'A6105'],
    avgResponseMin: 80,
    workshopDistance: 'Scheduled service — advance booking recommended for Borders areas',
    uniqueIntro:
      'Galashiels is the commercial hub of the Scottish Borders and our coverage base for the TD postcode area — taking in Melrose, Selkirk, Hawick, Jedburgh, Kelso and the Berwickshire coast at Eyemouth. Our average response time in Galashiels is 80 minutes. The A7 Edinburgh–Carlisle road and the A68 are the main trunk routes through the Borders, with the Borders Railway connecting Galashiels to Edinburgh.',
    uniqueBody:
      'The Scottish Borders has a mix of quiet market towns and exposed rural roads where tyre damage from gravel verges, potholes on farm routes and the occasional kerb strike in narrow town centres is common. The A68 over Carter Bar and the A7 through Teviotdale are known for debris on the carriageway following agricultural activity. We cover all Borders towns: Hawick (TD9), the knitwear capital of Scotland; Kelso (TD5), with its racecourse and abbey; Jedburgh (TD8) on the A68 tourist route; and Eyemouth (TD14) on the Berwickshire coast. Peebles (EH45), although technically an EH postcode, sits in the Borders and is covered from the same Galashiels dispatch.',
    neighborCities: ['edinburgh', 'dumfries'],
  },
  'isle-of-skye': {
    name: 'Isle of Skye',
    slug: 'isle-of-skye',
    postcodes: 'IV40–IV56',
    nearbyRoads: ['A87', 'A850', 'A863', 'A855'],
    avgResponseMin: 120,
    workshopDistance: 'Scheduled service — advance booking essential for Skye and Lochalsh',
    uniqueIntro:
      'The Isle of Skye is Scotland\'s most visited island, and Tyre Rescue covers the full IV40–IV56 postcode area including Portree, Broadford, Dunvegan and the Kyle of Lochalsh gateway on the mainland. Our average response time in Portree is 120 minutes — advance booking is essential for island callouts. The Skye Bridge (A87) and the single-track roads across the Trotternish Peninsula and the Cuillins are challenging terrain where tyre damage from gravel edges and cattle grids is a regular occurrence.',
    uniqueBody:
      'Skye\'s road network is heavily tourist-dependent, with millions of visitors arriving each summer in vehicles of all sizes — from motorhomes to hire cars. Tyre sizes common on the island include run-flat fitments on BMW and Mercedes hire cars, plus all-season tyres on campervans. Dunvegan Castle, the Old Man of Storr layby, Kilt Rock and the Fairy Pools car parks are frequent service locations during the season. We carry stock for Skye callouts from our Highland network and prioritise island bookings to avoid customers being stranded on remote single-track roads.',
    neighborCities: ['inverness', 'dingwall'],
  },
};
