/**
 * Rich neighborhood data for key areas — used to enhance ServiceAreaContent
 * with AI-optimized sections, landmarks, and character descriptions.
 */

export interface NeighborhoodEnrichment {
  description: string;
  characterDescription: string;
  landmarks: string[];
  popularServices: string[];
  parkingNotes: string;
  /** Key roads/junctions frequently served */
  keyRoads: string[];
}

type EnrichmentMap = Record<string, Record<string, NeighborhoodEnrichment>>;

export const neighborhoodEnrichments: EnrichmentMap = {
  glasgow: {
    'city-centre': {
      description: 'Glasgow City Centre is the commercial heart of Scotland\'s largest city, home to major shopping streets, offices, and entertainment venues. Our mobile tyre fitters regularly serve motorists in multi-storey car parks, hotel car parks, and on-street parking bays throughout the city centre grid.',
      characterDescription: 'Busy urban core with tight parking and one-way streets. Our fitters know every multi-storey and side street.',
      landmarks: ['Buchanan Street', 'George Square', 'Glasgow Central Station', 'Queen Street Station', 'St Enoch Centre', 'Merchant City'],
      popularServices: ['emergency-tyre-fitting', 'puncture-repair', 'mobile-tyre-fitting'],
      parkingNotes: 'We fit tyres in multi-storey car parks, hotel car parks, and metered bays. Let us know your exact bay or level.',
      keyRoads: ['M8 Motorway', 'High Street', 'Argyle Street', 'Sauchiehall Street', 'Bath Street'],
    },
    'west-end': {
      description: 'Glasgow\'s West End is a vibrant area surrounding the University of Glasgow, known for its Victorian architecture, Byres Road restaurants, and Ashton Lane. We frequently attend call-outs in the residential tenement streets where parking can be tight.',
      characterDescription: 'Tree-lined terraces and cobbled lanes with a student-friendly atmosphere. Tight on-street parking throughout.',
      landmarks: ['University of Glasgow', 'Byres Road', 'Ashton Lane', 'Kelvingrove Art Gallery', 'Botanic Gardens', 'Kelvin Walkway'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Mostly permit parking zones. We can fit tyres on your street — just tell us the nearest junction.',
      keyRoads: ['Great Western Road', 'Byres Road', 'University Avenue', 'Dumbarton Road', 'Hyndland Road'],
    },
    'southside': {
      description: 'Glasgow\'s Southside encompasses diverse neighbourhoods from Queens Park to Pollokshields and Shawlands. The area has a strong community feel with independent shops, cafés, and excellent parks. Our fitters cover the entire Southside from the M77 corridor to Cathcart.',
      characterDescription: 'Residential and multicultural with Victorian tenements and interwar semis. Good kerb-side access in most streets.',
      landmarks: ['Queens Park', 'Pollok Country Park', 'Hampden Park', 'Shawlands Arcade', 'Tramway Arts Centre'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Plenty of residential street parking. Driveways and quiet side streets give us easy access.',
      keyRoads: ['Pollokshaws Road', 'Victoria Road', 'Cathcart Road', 'Kilmarnock Road', 'Shawlands Cross'],
    },
    'east-end': {
      description: 'Glasgow\'s East End runs from the Barras and Glasgow Green through to Parkhead and Bridgeton. The area has seen major regeneration since the 2014 Commonwealth Games and now includes the Emirates Arena, the Athletes\' Village, and revitalised high streets.',
      characterDescription: 'Historic and rapidly regenerating. Wide roads and newer housing estates provide excellent fitting access.',
      landmarks: ['Celtic Park', 'Glasgow Green', 'The Barras', 'Emirates Arena', 'People\'s Palace', 'Dalmarnock'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Wide streets and new-build areas with good access. Matchday call-outs near Celtic Park are common.',
      keyRoads: ['Gallowgate', 'London Road', 'Duke Street', 'Tollcross Road', 'Springfield Road'],
    },
    'govan': {
      description: 'Govan sits on the south bank of the River Clyde, with deep shipbuilding heritage and growing cultural significance. The Govan Cross area, Ibrox Stadium nearby, and the new Queen Elizabeth University Hospital make this one of our busiest call-out areas in south-west Glasgow.',
      characterDescription: 'Working-class heritage area with excellent riverside access. Mix of tenements and new builds near the QEUH.',
      landmarks: ['Ibrox Stadium', 'Queen Elizabeth University Hospital', 'Govan Cross', 'Govan Old Church', 'Elder Park'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Hospital car park call-outs are frequent. Street parking in residential areas is straightforward.',
      keyRoads: ['Govan Road', 'Moss Road', 'Helen Street', 'Edmiston Drive', 'Paisley Road West'],
    },
    'partick': {
      description: 'Partick is a lively neighbourhood between the West End and the Clyde, centred around Partick Cross and Dumbarton Road. With Partick railway and subway stations, the area sees heavy commuter traffic and our fitters regularly attend to vehicles along the busy Dumbarton Road corridor.',
      characterDescription: 'Dense urban village with pubs, shops, and excellent transport links. On-street parking with good fitter access.',
      landmarks: ['Partick Cross', 'Partick Station', 'Kelvingrove Park', 'River Kelvin', 'Dumbarton Road'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Metered and permit zones. Side streets off Dumbarton Road are the easiest fitting spots.',
      keyRoads: ['Dumbarton Road', 'Byres Road', 'Crow Road', 'Castlebank Street', 'Benalder Street'],
    },
    'shawlands': {
      description: 'Shawlands is Glasgow\'s café quarter on the Southside, with a buzzing independent food scene along Kilmarnock Road. The residential streets radiating from Shawlands Cross are popular with young professionals, and we frequently fit tyres here during evening and weekend call-outs.',
      characterDescription: 'Trendy Southside hub with sandstone tenements and a thriving high street. Moderate parking density.',
      landmarks: ['Shawlands Cross', 'Shawlands Arcade', 'Queens Park (south entrance)', 'Langside Halls', 'Pollokshaws Road'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Permit zones near the Cross but free parking on side streets. Easy same-day bookings.',
      keyRoads: ['Kilmarnock Road', 'Pollokshaws Road', 'Minard Road', 'Deanston Drive', 'Langside Avenue'],
    },
    'dennistoun': {
      description: 'Dennistoun is one of Glasgow\'s most up-and-coming areas, with affordable tenement living close to the city centre. Duke Street — one of Glasgow\'s longest roads — runs through the heart of the area, and our fitters know every side street and lane.',
      characterDescription: 'Red sandstone tenements and converted buildings with a growing creative community. Good street access.',
      landmarks: ['Alexandra Park', 'Dennistoun\'s Duke Street', 'Haghill', 'Alexandra Parade', 'Bellgrove Station'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Mostly unmetered residential streets with easy kerb-side access for our vans.',
      keyRoads: ['Duke Street', 'Alexandra Parade', 'Cumbernauld Road', 'Onslow Drive', 'Whitevale Street'],
    },
    'maryhill': {
      description: 'Maryhill in north Glasgow is a large residential area stretching from the Forth and Clyde Canal to the Maryhill Corridor. The area includes both traditional tenements and modern new-build estates, and our fitters cover everything from Maryhill Road to the Wyndford.',
      characterDescription: 'Large north Glasgow neighbourhood with a mix of housing types. Canal-side roads and wide residential streets.',
      landmarks: ['Maryhill Locks', 'Forth and Clyde Canal', 'Maryhill Road', 'Wyndford Estate', 'Queen Margaret Drive'],
      popularServices: ['mobile-tyre-fitting', 'emergency-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Driveway and on-street fitting in most areas. New estates have generous parking.',
      keyRoads: ['Maryhill Road', 'Queen Margaret Drive', 'Garscube Road', 'Bilsland Drive', 'Kelvindale Road'],
    },
    'bearsden': {
      description: 'Bearsden is an affluent suburb to the north-west of Glasgow, popular with families for its excellent schools and village atmosphere. The area has wide tree-lined streets with driveways, making it one of the easiest places for our fitters to work.',
      characterDescription: 'Prosperous suburban village with detached homes, gardens, and driveways. Premium area with high tyre-size demand.',
      landmarks: ['Bearsden Cross', 'Kilmardinny Loch', 'Roman Bathhouse', 'New Kilpatrick Church', 'Hillfoot'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Most homes have driveways. We can work on your drive — no need to move the car.',
      keyRoads: ['Drymen Road', 'Milngavie Road', 'Roman Road', 'Switchback Road', 'Canniesburn Road'],
    },
    'rutherglen': {
      description: 'Rutherglen — Scotland\'s oldest royal burgh — sits just south-east of Glasgow city centre. Well connected by the M74 and Rutherglen station, the area mixes Victorian tenements with modern estates. Our fitters are regularly in the area, especially along Main Street and near Burnhill.',
      characterDescription: 'Historic burgh with strong community identity. Mix of older and newer housing with good access.',
      landmarks: ['Rutherglen Main Street', 'Overtoun Park', 'Burnhill', 'Rutherglen Town Hall', 'Stonelaw Road'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Residential streets with easy access. M74 junction nearby for fast fitter arrival.',
      keyRoads: ['Main Street', 'Stonelaw Road', 'Farmeloan Road', 'Glasgow Road', 'Burnside Road'],
    },
    'cambuslang': {
      description: 'Cambuslang is a south-east Glasgow suburb along the River Clyde, with excellent rail links and proximity to the M74. The area includes Cambuslang Main Street, Westburn, and the Hallside residential estates. Our fitters reach Cambuslang quickly from the motorway.',
      characterDescription: 'Suburban family area with good motorway access. Driveways and quiet residential streets throughout.',
      landmarks: ['Cambuslang Main Street', 'Cambuslang Park', 'Hallside', 'Westburn', 'Cambuslang Station'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'emergency-tyre-fitting'],
      parkingNotes: 'Driveways common in newer estates. On-street parking available in older areas.',
      keyRoads: ['Main Street', 'Hamilton Road', 'Greenlees Road', 'Brownside Road', 'East Kilbride Road'],
    },
    'clydebank': {
      description: 'Clydebank is a former shipbuilding town on the north bank of the Clyde, now known for the Clydebank Shopping Centre and the Titan Crane. The area benefits from the A82 and Great Western Road access, making response times from our base fast.',
      characterDescription: 'Post-industrial town with regeneration areas and strong community. Good road access throughout.',
      landmarks: ['Titan Crane', 'Clydebank Shopping Centre', 'Dalmuir Park', 'Kilbowie Road', 'Singer Station'],
      popularServices: ['mobile-tyre-fitting', 'emergency-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Shopping centre car park and residential street fitting available.',
      keyRoads: ['Dumbarton Road', 'Kilbowie Road', 'Glasgow Road', 'Great Western Road', 'Boulevard'],
    },
    'pollokshields': {
      description: 'Pollokshields is one of Glasgow\'s most architecturally distinguished areas, with grand sandstone villas and a thriving South Asian community along Albert Drive. We regularly serve customers in both Pollokshields East and West, where wide avenues make tyre fitting straightforward.',
      characterDescription: 'Grand Victorian villas with tree-lined avenues. One of Glasgow\'s most diverse neighbourhoods.',
      landmarks: ['Albert Drive', 'Maxwell Park', 'Pollokshields East Station', 'Haggs Castle', 'Shields Road Subway'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Wide avenues and driveways make for easy fitting. Permit zones on some streets.',
      keyRoads: ['Albert Drive', 'Nithsdale Road', 'St Andrews Drive', 'Shields Road', 'Maxwell Drive'],
    },
  },
  edinburgh: {
    'leith': {
      description: 'Leith is Edinburgh\'s historic port district, now one of the city\'s most vibrant areas with waterfront restaurants, the Royal Yacht Britannia, and a thriving creative scene. Our fitters regularly serve customers along Leith Walk, in the Shore area, and in the modern Ocean Terminal car park.',
      characterDescription: 'Historic port turned trendy neighbourhood. Mix of Georgian tenements and waterfront new builds.',
      landmarks: ['Royal Yacht Britannia', 'Ocean Terminal', 'Leith Walk', 'The Shore', 'Leith Links', 'Water of Leith'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Permit zones on residential streets. Ocean Terminal car park is ideal for fitting.',
      keyRoads: ['Leith Walk', 'Great Junction Street', 'Constitution Street', 'Commercial Street', 'Easter Road'],
    },
    'morningside': {
      description: 'Morningside is one of Edinburgh\'s most desirable residential areas, known for its independent shops along Morningside Road, the Dominion Cinema, and leafy Victorian streets. Driveways and quiet crescents make this an easy area for our mobile fitters to work in.',
      characterDescription: 'Upmarket residential village within the city. Wide streets with gardens and driveways.',
      landmarks: ['Morningside Road', 'Dominion Cinema', 'The Canny Man\'s Pub', 'Morningside Clock', 'Braid Hills'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Most properties have driveways or private parking. Quiet streets with easy access.',
      keyRoads: ['Morningside Road', 'Comiston Road', 'Braid Road', 'Cluny Drive', 'Canaan Lane'],
    },
    'newington': {
      description: 'Newington sits south of Edinburgh\'s Old Town and is popular with students and young professionals due to its proximity to the University of Edinburgh. The area centres on the busy Clerk Street and Newington Road corridor, and we frequently attend call-outs here.',
      characterDescription: 'Busy student area with Georgian and Victorian tenements. High density but good side-street access.',
      landmarks: ['Clerk Street', 'Newington Road', 'The Meadows (south)', 'Summerhall', 'Minto Street'],
      popularServices: ['puncture-repair', 'mobile-tyre-fitting', 'emergency-tyre-fitting'],
      parkingNotes: 'Permit zones are common. Side streets off Minto Street and Mayfield offer the best fitting spots.',
      keyRoads: ['Clerk Street', 'Newington Road', 'Minto Street', 'Mayfield Road', 'Dalkeith Road'],
    },
    'stockbridge': {
      description: 'Stockbridge is a characterful neighbourhood in Edinburgh\'s New Town, centred around the Water of Leith and its famous Sunday market. The area has attractive Georgian architecture and a village feel. Our fitters navigate the area\'s mix of narrow streets and wider crescents.',
      characterDescription: 'Georgian village feel with independent shops and a Sunday market. Tight parking but well-known to our team.',
      landmarks: ['Stockbridge Market', 'Water of Leith', 'Inverleith Park', 'Royal Botanic Garden (nearby)', 'Raeburn Place'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Permit parking predominates. Residential side streets are the best spots for fitting.',
      keyRoads: ['Raeburn Place', 'Comely Bank Road', 'Hamilton Place', 'Dean Street', 'Inverleith Row'],
    },
    'gorgie': {
      description: 'Gorgie is a working-class neighbourhood in west Edinburgh, home to Tynecastle Park (Heart of Midlothian FC) and a busy stretch of Gorgie Road with shops and takeaways. The area is well connected by bus routes and our fitters reach Gorgie quickly via the A71 corridor.',
      characterDescription: 'Working-class west Edinburgh area with a strong football identity. Busy main road with quieter residential side streets.',
      landmarks: ['Tynecastle Park', 'Gorgie Road', 'Gorgie City Farm', 'Saughton Park', 'Dalry Road'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'puncture-repair'],
      parkingNotes: 'On-street parking on side roads. Matchday restrictions near Tynecastle.',
      keyRoads: ['Gorgie Road', 'Dalry Road', 'Robertson Avenue', 'Westfield Road', 'Ardmillan Terrace'],
    },
    'portobello': {
      description: 'Portobello is Edinburgh\'s seaside suburb, famous for its sandy beach, promenade, and outdoor swimming pool. The area is popular with families and has a thriving high street. Our fitters often work along the promenade car parks and in the residential streets behind the beach.',
      characterDescription: 'Seaside suburb with a promenade, beach, and Victorian charm. Relaxed atmosphere with good parking access.',
      landmarks: ['Portobello Beach', 'Portobello Promenade', 'Portobello High Street', 'Figgate Park', 'Portobello Swim Centre'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Free parking along the promenade and in residential streets. Seafront car parks available.',
      keyRoads: ['Portobello High Street', 'Joppa Road', 'Milton Road', 'Seafield Road', 'King\'s Road'],
    },
    'corstorphine': {
      description: 'Corstorphine is a popular residential suburb in west Edinburgh, home to Edinburgh Zoo and close to the Edinburgh Gateway interchange. The area\'s wide streets and driveways make it excellent for mobile tyre fitting, and we\'re often in the area serving regulars.',
      characterDescription: 'Family-friendly suburb with driveways and gardens. Close to the zoo and airport with excellent road access.',
      landmarks: ['Edinburgh Zoo', 'Corstorphine Hill', 'St John\'s Road', 'Edinburgh Gateway Station', 'Murrayfield (nearby)'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Driveways and wide streets. Ideal conditions for mobile tyre fitting.',
      keyRoads: ['St John\'s Road', 'Corstorphine Road', 'Clermiston Road', 'Drum Brae', 'Glasgow Road'],
    },
    'old-town': {
      description: 'Edinburgh\'s Old Town runs along the Royal Mile from Edinburgh Castle to Holyrood Palace. The medieval street layout with narrow closes and wynds can be challenging, but our experienced fitters know the accessible parking spots around the Grassmarket, Cowgate, and Pleasance.',
      characterDescription: 'Medieval city centre with narrow streets and limited vehicle access. Our fitters know the accessible spots.',
      landmarks: ['Edinburgh Castle', 'Royal Mile', 'Grassmarket', 'Holyrood Palace', 'St Giles\' Cathedral', 'Arthur\'s Seat'],
      popularServices: ['emergency-tyre-fitting', 'puncture-repair', 'mobile-tyre-fitting'],
      parkingNotes: 'Very limited. Grassmarket and Holyrood Road car parks are the best options. Call us for advice.',
      keyRoads: ['Royal Mile', 'Grassmarket', 'Cowgate', 'Pleasance', 'Holyrood Road'],
    },
    'bruntsfield': {
      description: 'Bruntsfield is a sought-after Edinburgh neighbourhood south of the Meadows, known for its independent shops, brunch cafés, and the Bruntsfield Links park. The area is densely residential with mostly tenement flats, and our fitters regularly serve customers on the quieter side streets.',
      characterDescription: 'Desirable south Edinburgh neighbourhood with cafés, delis, and leafy parks. Moderate parking density.',
      landmarks: ['Bruntsfield Links', 'The Meadows', 'Bruntsfield Place', 'Tollcross', 'Viewforth'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Permit parking zones throughout. Side streets off Bruntsfield Place offer the best access.',
      keyRoads: ['Bruntsfield Place', 'Leven Street', 'Viewforth', 'Whitehouse Loan', 'Warrender Park Road'],
    },
    'haymarket': {
      description: 'Haymarket is Edinburgh\'s second railway hub, a busy west-central area connecting the city centre to Murrayfield and beyond. The area around Haymarket station sees heavy traffic, and our fitters frequently attend emergency call-outs for commuters and residents alike.',
      characterDescription: 'Major transport hub with hotels, offices, and residential tenements. High demand for emergency services.',
      landmarks: ['Haymarket Station', 'Murrayfield Stadium', 'Haymarket Terrace', 'Dalry', 'West End'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Metered and permit zones. Hotel car parks and Murrayfield side streets provide fitting access.',
      keyRoads: ['Haymarket Terrace', 'Morrison Street', 'Dalry Road', 'West Maitland Street', 'Roseburn Terrace'],
    },
    'cramond': {
      description: 'Cramond is a picturesque coastal village in north-west Edinburgh, known for the Cramond Island causeway, the River Almond, and Roman heritage. This quiet residential area has generous driveways and tree-lined streets, making it ideal for mobile tyre fitting.',
      characterDescription: 'Affluent coastal village with sea views and historic character. Spacious properties with driveways.',
      landmarks: ['Cramond Island', 'River Almond', 'Cramond Kirk', 'Lauriston Castle', 'Silverknowes Beach'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Driveways and quiet streets throughout. Easy fitting conditions.',
      keyRoads: ['Cramond Road North', 'Whitehouse Road', 'Barnton Avenue', 'Gamekeepers Road', 'Silverknowes Road'],
    },
    'marchmont': {
      description: 'Marchmont is a popular Edinburgh neighbourhood between the Meadows and Blackford Hill, home to many university students and young professionals. The grand Victorian tenements line wide streets, and our fitters have excellent access throughout the area.',
      characterDescription: 'Grand Victorian tenement area popular with students. Wide streets with good on-street access.',
      landmarks: ['The Meadows', 'Blackford Hill', 'Marchmont Crescent', 'Warrender Park', 'Sciennes'],
      popularServices: ['mobile-tyre-fitting', 'puncture-repair', 'tyre-repair'],
      parkingNotes: 'Permit zones but wide streets allow easy kerb-side fitting.',
      keyRoads: ['Marchmont Road', 'Warrender Park Road', 'Thirlestane Road', 'Strathearn Road', 'Arden Street'],
    },
  },
  dundee: {
    'city-centre': {
      description: 'Dundee City Centre has been transformed by the V&A Dundee museum and waterfront regeneration. The compact centre is easy to navigate, and our fitters regularly serve customers in the Overgate and Wellgate centre car parks, as well as on Discovery Quay.',
      characterDescription: 'Compact regenerating city centre with the iconic V&A museum. Easy to navigate with good parking.',
      landmarks: ['V&A Dundee', 'Discovery Point', 'Overgate Centre', 'Caird Hall', 'The McManus Gallery', 'Dundee Waterfront'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'puncture-repair'],
      parkingNotes: 'Multi-storey car parks at Overgate and Wellgate. Waterfront parking also available.',
      keyRoads: ['Nethergate', 'Reform Street', 'Commercial Street', 'Dock Street', 'Marketgait'],
    },
    'broughty-ferry': {
      description: 'Broughty Ferry is Dundee\'s upmarket seaside suburb, known for its castle, sandy beach, and excellent independent restaurants along Brook Street and Gray Street. The area has wide residential streets with driveways, making it perfect for mobile tyre fitting.',
      characterDescription: 'Affluent seaside suburb with castle views and a village high street. Spacious streets with driveways.',
      landmarks: ['Broughty Castle', 'Broughty Ferry Beach', 'Brook Street', 'Barnhill Rock Garden', 'Forthill'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Driveways and wide residential streets. Easy fitting access throughout.',
      keyRoads: ['Brook Street', 'Gray Street', 'King Street', 'Fort Street', 'Beach Crescent'],
    },
    'lochee': {
      description: 'Lochee is a distinct community in west Dundee with its own high street and strong local identity. The area mixes traditional tenements with newer housing, and our fitters reach Lochee quickly via the Kingsway dual carriageway.',
      characterDescription: 'Traditional Dundee community with its own identity and high street. Good road access from Kingsway.',
      landmarks: ['Lochee High Street', 'Cox\'s Stack (former jute mill chimney)', 'Lochee Park', 'Camperdown Park (nearby)'],
      popularServices: ['mobile-tyre-fitting', 'emergency-tyre-fitting', 'puncture-repair'],
      parkingNotes: 'On-street parking on residential roads. Newer estates have driveways.',
      keyRoads: ['Lochee Road', 'High Street Lochee', 'Whorterbank', 'South Road', 'Ancrum Road'],
    },
    'west-ferry': {
      description: 'West Ferry is a residential area between Dundee city centre and Broughty Ferry along the Tay waterfront. The area has a mix of Victorian villas and modern developments with stunning river views. Our fitters appreciate the quiet, spacious streets.',
      characterDescription: 'Quiet residential area with river views. Mix of Victorian villas and newer builds.',
      landmarks: ['Dundee Law (nearby)', 'River Tay', 'Invergowrie Bay', 'Dundee & Angus College'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Driveways and generous parking throughout. Excellent fitting conditions.',
      keyRoads: ['Perth Road', 'Riverside Drive', 'Blackness Road', 'Hawkhill', 'Magdalen Yard Road'],
    },
    'whitfield': {
      description: 'Whitfield is a large residential area in north-east Dundee, built primarily in the 1960s and 70s. The area has undergone significant regeneration with new housing and community facilities. Wide roads and parking areas make tyre fitting straightforward.',
      characterDescription: 'Regenerating residential estate with wide roads and good parking. Fast fitter access from Kingsway.',
      landmarks: ['Whitfield Community Centre', 'Finlathen Park', 'Ballumbie Castle', 'Kingsway'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Wide roads and dedicated parking areas. Easy access for our vans.',
      keyRoads: ['Whitfield Drive', 'Summerfield Avenue', 'Lothian Crescent', 'Dunbar Park', 'Old Craigie Road'],
    },
  },
  stirling: {
    'bridge-of-allan': {
      description: 'Bridge of Allan is a charming spa town just north of Stirling, home to the University of Stirling campus. The tree-lined Henderson Street serves as the main thoroughfare, and our fitters regularly attend to vehicles near the university and in the town\'s quiet residential streets.',
      characterDescription: 'Pretty spa town with a university campus. Wide residential streets with good access.',
      landmarks: ['University of Stirling', 'Henderson Street', 'Allan Water', 'Mine Road Bridge', 'Sunnylaw Road'],
      popularServices: ['mobile-tyre-fitting', 'tyre-fitting', 'tyre-repair'],
      parkingNotes: 'Driveways and on-street parking. University car parks also accessible.',
      keyRoads: ['Henderson Street', 'Keir Street', 'Fountain Road', 'Kenilworth Road', 'University Road'],
    },
    'bannockburn': {
      description: 'Bannockburn is famous for the 1314 battle and sits just south of Stirling city centre. The area is well-connected by the M80 and M9 motorways, making it a quick response area for our mobile fitters. Residential estates and the heritage centre attract steady call-out demand.',
      characterDescription: 'Historic suburb with good motorway access. Mix of older and newer residential areas.',
      landmarks: ['Bannockburn Heritage Centre', 'Borestone', 'Pirnhall', 'M80/M9 Junction'],
      popularServices: ['mobile-tyre-fitting', 'emergency-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Driveways in residential areas. Motorway proximity means fast fitter arrival.',
      keyRoads: ['Main Street', 'Quakerfield', 'Pirnhall Road', 'Bannockburn Road', 'Hillpark Road'],
    },
  },
  falkirk: {
    'grangemouth': {
      description: 'Grangemouth is Scotland\'s petrochemical hub and one of Falkirk\'s largest towns. The industrial area and busy port generate constant commercial vehicle traffic, while the residential areas have good, wide streets. Our fitters are well-versed in both domestic and commercial tyre work here.',
      characterDescription: 'Industrial port town with both commercial and residential areas. Steady demand for commercial vehicle tyres.',
      landmarks: ['Grangemouth Refinery', 'Zetland Park', 'Grangemouth Stadium', 'Kelpies (nearby)'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Industrial estates have ample space. Residential areas have driveways and wide streets.',
      keyRoads: ['Bo\'ness Road', 'Kersiebank Avenue', 'Talbot Street', 'Newlands Road', 'Abbots Road'],
    },
  },
  paisley: {
    'renfrew-paisley': {
      description: 'Renfrew sits at the confluence of the Clyde and Cart rivers, close to Glasgow Airport and the Braehead shopping complex. Our fitters frequently attend to vehicles at Glasgow Airport car parks and in Renfrew\'s residential streets, benefiting from excellent M8 motorway access.',
      characterDescription: 'Clydeside town near Glasgow Airport with excellent motorway access. Mix of old town and new developments.',
      landmarks: ['Glasgow Airport (nearby)', 'Braehead Arena', 'Renfrew Ferry', 'Blythswood', 'King\'s Inch Road'],
      popularServices: ['emergency-tyre-fitting', 'mobile-tyre-fitting', 'tyre-fitting'],
      parkingNotes: 'Airport car park call-outs common. Good residential street access throughout.',
      keyRoads: ['Renfrew Road', 'King\'s Inch Road', 'Inchinnan Road', 'Paisley Road', 'Ferry Road'],
    },
  },
};

/**
 * Look up enrichment data for a given city and area slug.
 * Returns undefined if no enrichment exists for that combination.
 */
export function getNeighborhoodEnrichment(
  citySlug: string,
  areaSlug: string,
): NeighborhoodEnrichment | undefined {
  return neighborhoodEnrichments[citySlug]?.[areaSlug];
}
