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
  'fort-william': {
    name: 'Fort William',
    description:
      'Fort William and the Lochaber PH33–PH50 postcode area — Glencoe, Spean Bridge, Mallaig, Ballachulish and Kinlochleven. The A82 Great Glen road and the A830 Road to the Isles are our main routes. We carry all-terrain, all-season and run-flat tyres suited to mountain roads and hire vehicles. Advance booking recommended for remote Lochaber and Ardnamurchan areas.',
    depotDistance: 105,
    coordinates: { lat: 56.8198, lng: -5.1052 },
    postcodeHint: 'PH33',
  },
  'st-andrews': {
    name: 'St Andrews',
    description:
      'St Andrews and the East Fife KY9–KY16 postcode area — Anstruther, Crail, Elie, Cupar and Leuchars. We cover golf week, graduation and year-round tourist traffic on the A91 and A917 coast road. Run-flat tyres for premium vehicles are carried as standard. Advance booking recommended for East Neuk villages.',
    depotDistance: 51,
    coordinates: { lat: 56.3398, lng: -2.7967 },
    postcodeHint: 'KY16',
  },
  pitlochry: {
    name: 'Pitlochry',
    description:
      'Pitlochry and the Highland Perthshire PH8–PH18 area — Dunkeld, Aberfeldy, Blair Atholl, Kenmore and Killin. We cover the full A9 corridor and the remote B-roads of Breadalbane and Rannoch. Motorhome, campervan and caravan tyre sizes carried as standard. Advance booking recommended for Rannoch and remote areas.',
    depotDistance: 72,
    coordinates: { lat: 56.7078, lng: -3.7340 },
    postcodeHint: 'PH16',
  },
  'east-lothian': {
    name: 'East Lothian',
    description:
      'East Lothian covering EH21 (Musselburgh) and EH31–EH42 — Prestonpans, Tranent, Haddington, Gullane, North Berwick and Dunbar. We reach most of East Lothian within 55 minutes from Edinburgh. Run-flat tyres for premium golf-tourism vehicles carried as standard. No hidden distance surcharges across the EH postcode area.',
    depotDistance: 50,
    coordinates: { lat: 55.9570, lng: -2.7791 },
    postcodeHint: 'EH41',
  },
  arbroath: {
    name: 'Arbroath',
    description:
      'Arbroath and the Angus coast DD7–DD11 postcode area — Montrose, Forfar, Kirriemuir, Brechin and Carnoustie. The A92 coast road and A90 Aberdeen trunk are our primary routes. We carry premium vehicle fitments for Carnoustie Open Championship golf visitors and commercial sizes for the Montrose offshore supply industry.',
    depotDistance: 75,
    coordinates: { lat: 56.5611, lng: -2.5868 },
    postcodeHint: 'DD11',
  },
  oban: {
    name: 'Oban',
    description:
      'Oban and the full PA postcode area — covering Dunoon (PA23), Rothesay/Bute (PA20), Lochgilphead (PA31), Inveraray (PA32), Campbeltown (PA28), and island communities on Mull (PA64–PA75) and Islay (PA42–PA49). The A83 and A85 are our primary routes through Argyll. Island callouts require advance booking of minimum 48 hours. No hidden distance surcharges across mainland PA postcodes.',
    depotDistance: 95,
    coordinates: { lat: 56.4154, lng: -5.4714 },
    postcodeHint: 'PA34',
  },
  wick: {
    name: 'Wick',
    description:
      'Wick and the full KW postcode area — Caithness, northern Sutherland, and Orkney. We cover Thurso (KW14), John o\' Groats (KW1), Helmsdale (KW8), Golspie (KW10), and Kirkwall in Orkney (KW15–KW17). Orkney callouts require advance booking via the Pentland Firth ferry. We carry sizes for campervans, 4x4s and commercial vehicles common on NC500 and Caithness roads.',
    depotDistance: 280,
    coordinates: { lat: 58.4381, lng: -3.0886 },
    postcodeHint: 'KW1',
  },
  stornoway: {
    name: 'Stornoway',
    description:
      'Stornoway and the Western Isles HS1–HS9 postcode area — covering Lewis, Harris, North Uist, Benbecula, South Uist and Barra. Island service requires a minimum 48 hours\' advance booking. Tyres are transported via CalMac ferry from Ullapool or Uig. We stock sizes suited to 4x4s and SUVs common on Western Isles single-track roads.',
    depotDistance: 220,
    coordinates: { lat: 58.2093, lng: -6.3890 },
    postcodeHint: 'HS1',
  },
  lerwick: {
    name: 'Lerwick',
    description:
      'Lerwick and the Shetland ZE1–ZE3 postcode area. Island service requires a minimum 48 hours\' advance booking — tyres are transported via NorthLink ferry from Aberdeen. We cover Lerwick (ZE1), Scalloway, Brae near Sullom Voe oil terminal, and inter-island routes to Yell and Whalsay. We stock commercial vehicle sizes for the oil industry as well as passenger car fitments.',
    depotDistance: 400,
    coordinates: { lat: 60.1547, lng: -1.1490 },
    postcodeHint: 'ZE1',
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
  dundee: {
    name: 'Dundee',
    description:
      'Dundee and the full DD postcode area — covering the city centre, Broughty Ferry, Monifieth, Lochee, Barnhill, Carnoustie and the Angus coast. The Kingsway dual carriageway and Riverside Drive are our main approach routes. We carry a full range of tyres for commuter cars, SUVs and commercial vehicles. No hidden surcharges for any DD postcode.',
    depotDistance: 59,
    coordinates: { lat: 56.4620, lng: -2.9707 },
    postcodeHint: 'DD1',
  },
  stirling: {
    name: 'Stirling',
    description:
      'Stirling and the surrounding FK postcode area — covering Bridge of Allan, Dunblane, Bannockburn, St Ninians, Cambusbarron and the Trossachs gateway. We arrive via M9 or M80, typically within 40–45 minutes. We carry a full tyre range for the mix of commuter vehicles, tourist cars and commercial traffic on the A9 and M9 corridors.',
    depotDistance: 26,
    coordinates: { lat: 56.1165, lng: -3.9369 },
    postcodeHint: 'FK8',
  },
  perth: {
    name: 'Perth',
    description:
      'Perth and the surrounding PH1–PH2 area — covering Scone, Kinnoull, Bridgend, Huntingtower, Almondbank, Luncarty and the Strathearn villages. The A9, M90 and A93 are our main routes into the city. We carry a wide range including premium fitments for vehicles visiting Gleneagles and the Perthshire golf trail.',
    depotDistance: 62,
    coordinates: { lat: 56.3958, lng: -3.4342 },
    postcodeHint: 'PH1',
  },
  hamilton: {
    name: 'Hamilton',
    description:
      'Hamilton and the surrounding ML3 postcode area — covering Blantyre, Bothwell, Larkhall, Stonehouse and the Clyde Valley towns. Just 11 miles from our Glasgow base via the M74, Hamilton is one of our fastest Lanarkshire response areas. We carry van tyres as well as passenger car fitments for this busy commuter and retail hub.',
    depotDistance: 11,
    coordinates: { lat: 55.7774, lng: -4.0375 },
    postcodeHint: 'ML3',
  },
  motherwell: {
    name: 'Motherwell',
    description:
      'Motherwell and the ML1 postcode area — covering Wishaw, Bellshill, Uddingston, Viewpark and the Caledonian Road corridor. Just 12 miles from our Glasgow base via the M74/M8. We regularly cover the retail parks on Hamilton Road and emergency callouts on the M74 near the Motherwell interchange.',
    depotDistance: 12,
    coordinates: { lat: 55.7919, lng: -3.9965 },
    postcodeHint: 'ML1',
  },
  kirkcaldy: {
    name: 'Kirkcaldy',
    description:
      'Kirkcaldy and the full KY1–KY2 Fife postcode area — covering Glenrothes, Leven, Methil, Kennoway and the Fife coastal towns. The M90 and A92 Fife coastal route are our primary access roads. We carry a full tyre range for commuter and industrial vehicles in this busy Fife hub.',
    depotDistance: 43,
    coordinates: { lat: 56.1132, lng: -3.1615 },
    postcodeHint: 'KY1',
  },
  cumbernauld: {
    name: 'Cumbernauld',
    description:
      'Cumbernauld and the G67–G68 postcode area — covering Condorrat, Carbrain, Abronhill, Kildrum, Greenfaulds and the Cumbernauld Village area. Just 12 miles from Glasgow via the A80/M80, Cumbernauld is one of our fastest Central Belt response areas. We cover the town centre, the retail park and the Wardpark industrial estate.',
    depotDistance: 12,
    coordinates: { lat: 55.9452, lng: -3.9941 },
    postcodeHint: 'G67',
  },
  dumfries: {
    name: 'Dumfries',
    description:
      'Dumfries and the DG1–DG2 postcode area — covering Annan, Lockerbie, Moffat, Sanquhar and the Nithsdale towns. The A74(M) is our main route south. We carry tyres suited to rural DG postcode roads as well as the mix of commuter, agricultural and touring vehicles common across Dumfries and Galloway.',
    depotDistance: 72,
    coordinates: { lat: 55.0709, lng: -3.6052 },
    postcodeHint: 'DG1',
  },
  greenock: {
    name: 'Greenock',
    description:
      'Greenock and the PA15–PA16 postcode area — covering Port Glasgow, Gourock, Inverkip and the Inverclyde coast. The A8 and M8 extension bring us from Glasgow in 30 minutes. We carry a full range of fitments for this Clyde coastal community and serve the commercial vehicle operators at Greenock Ocean Terminal.',
    depotDistance: 22,
    coordinates: { lat: 55.9459, lng: -4.7658 },
    postcodeHint: 'PA15',
  },
  dunfermline: {
    name: 'Dunfermline',
    description:
      'Dunfermline and the KY11–KY12 postcode area — covering Rosyth, Inverkeithing, Charlestown, Crossford and the Dunfermline Business Park. We reach Dunfermline in 45–50 minutes via the M9/M90 Forth crossing. We carry a full range of passenger and van tyres for this busy commuter town and the nearby Rosyth dockyard.',
    depotDistance: 40,
    coordinates: { lat: 56.0718, lng: -3.4530 },
    postcodeHint: 'KY11',
  },
  kilmarnock: {
    name: 'Kilmarnock',
    description:
      'Kilmarnock and the KA1–KA3 postcode area — covering Crosshouse, Hurlford, Galston, Darvel, Stewarton, Fenwick and Kilmaurs. Just 20 miles via M77, we are one of Ayrshire\'s fastest response services. We cover the Galleon Retail Park, the Asda distribution centre and residential driveways across East Ayrshire.',
    depotDistance: 21,
    coordinates: { lat: 55.6107, lng: -4.4955 },
    postcodeHint: 'KA1',
  },
  ayr: {
    name: 'Ayr',
    description:
      'Ayr and the KA7–KA8 postcode area — covering Prestwick, Alloway, Annbank, Mossblown and the Ayr racecourse corridor. We reach Ayr in 55 minutes via the M77 and A77. Race day and festival season sees high demand for tyre services near the racecourse and Prestwick Airport. We carry run-flat tyres for premium golf resort vehicles.',
    depotDistance: 32,
    coordinates: { lat: 55.4590, lng: -4.6292 },
    postcodeHint: 'KA7',
  },
  irvine: {
    name: 'Irvine',
    description:
      'Irvine and the KA11–KA12 postcode area — covering Dreghorn, Bourtreehill, Springside, Girdle Toll and the Irvine Beach Park area. Just 26 miles via M77 and A77/A71, we are one of North Ayrshire\'s primary tyre services. We cover the Rivergate Shopping Centre, the Harbour Arts Centre and Irvine\'s large residential areas.',
    depotDistance: 26,
    coordinates: { lat: 55.6105, lng: -4.6659 },
    postcodeHint: 'KA11',
  },
  dingwall: {
    name: 'Dingwall',
    description:
      'Dingwall and the IV15–IV18 postcode area — covering Invergordon, Alness, Tain, Evanton and the Easter Ross peninsula. We dispatch via the A9 from Inverness, typically arriving in 110–120 minutes. We carry fitments for SUVs and commercial vehicles common on the Easter Ross oil industry roads and the A9 north corridor.',
    depotDistance: 174,
    coordinates: { lat: 57.5952, lng: -4.4255 },
    postcodeHint: 'IV15',
  },
  'isle-of-skye': {
    name: 'Isle of Skye',
    description:
      'Isle of Skye and the IV41–IV56 postcode area — covering Portree, Broadford, Dunvegan, Uig and the Sleat peninsula. Skye is accessible via the Skye Bridge from Kyle of Lochalsh. Advance booking of minimum 24 hours is required. We carry 4x4 and SUV fitments suited to the single-track roads of Skye\'s remote peninsulas and the high tourist vehicle volumes in season.',
    depotDistance: 200,
    coordinates: { lat: 57.3000, lng: -6.2000 },
    postcodeHint: 'IV51',
  },
};

export const priceCitySlugs = Object.keys(cityData);

export function getCityPriceData(slug: string): CityPriceData | undefined {
  return cityData[slug];
}
