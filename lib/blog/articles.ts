export interface BlogArticle {
  slug: string;
  title: string;
  description: string;
  category: 'emergency' | 'maintenance' | 'fitting' | 'safety';
  publishDate: string;
  lastModified: string;
  readingTime: number;
  keywords: string[];
  relatedSlugs: string[];
  featured: boolean;
  content: string;
}

const CATEGORIES = {
  emergency: 'Emergency',
  maintenance: 'Maintenance',
  fitting: 'Fitting',
  safety: 'Safety',
} as const;

export { CATEGORIES };

export const articles: BlogArticle[] = [
  {
    slug: 'emergency-tyre-fitting-glasgow-complete-guide',
    title: 'Emergency Tyre Fitting in Glasgow: The Complete Guide',
    description:
      'Flat tyre in Glasgow? Call 0141 266 0690. This guide covers emergency tyre fitting costs, response times, what happens when we arrive, and how to stay safe while you wait.',
    category: 'emergency',
    publishDate: '2026-03-20',
    lastModified: '2026-03-20',
    readingTime: 7,
    keywords: [
      'emergency tyre fitting glasgow',
      'flat tyre Glasgow',
      '24/7 tyre fitting',
      'roadside tyre change Glasgow',
    ],
    relatedSlugs: [
      'what-to-do-flat-tyre-motorway',
      'mobile-tyre-fitting-vs-garage',
    ],
    featured: true,
    content: `## What Is Emergency Tyre Fitting?

Emergency tyre fitting is a mobile service where a certified fitter drives to your exact location — roadside, driveway, car park, or motorway hard shoulder — and replaces your damaged tyre on the spot. In Glasgow, Tyre Rescue provides this service 24 hours a day, 7 days a week, 365 days a year.

**The short answer:** Call 0141 266 0690, tell us where you are, and a fitter reaches you in approximately 45 minutes with the right tyre for your vehicle.

## How Much Does Emergency Tyre Fitting Cost in Glasgow?

Emergency tyre fitting in Glasgow costs **£49 callout fee** plus the price of the tyre:

| Tyre Type | Price Range | Total (with callout) |
|-----------|------------|---------------------|
| Budget | £40–£60 | £89–£109 |
| Mid-range | £60–£100 | £109–£149 |
| Premium | £100–£150 | £149–£199 |

These prices cover a single tyre replacement including professional fitting, safety check, and old tyre disposal. There are no hidden charges — your fitter confirms the full price before starting work.

## How Fast Is the Response Time?

Our average emergency response times across Glasgow:

- **Glasgow City Centre** (G1–G4): 30 minutes
- **West End / Partick / Kelvingrove** (G11–G13): 35 minutes
- **Southside / Shawlands / Govan** (G41–G52): 35 minutes
- **East End / Dennistoun / Parkhead** (G31–G34): 25 minutes (closest to our base)
- **North / Maryhill / Springburn** (G20–G22): 40 minutes

Response times may vary during peak hours (8–9am, 5–7pm) and severe weather.

## What Happens When the Fitter Arrives?

1. **Assessment** — The fitter inspects the damaged tyre to confirm whether it needs replacement or can be repaired (puncture repairs from £25)
2. **Quote** — You receive the exact price before any work begins
3. **Fitting** — Professional tyre change using a hydraulic jack and torque wrench, typically 15–20 minutes per tyre
4. **Safety check** — Tyre pressure set to manufacturer spec, wheel bolts torqued correctly, visual check on remaining tyres
5. **Disposal** — Old tyre removed and disposed of responsibly at no extra charge
6. **Payment** — Card, Apple Pay, or Google Pay accepted on-site

## How to Stay Safe While Waiting

If you have a flat tyre on a road or motorway:

1. **Pull over** to the left as far as possible — hard shoulder on motorways, side street in the city
2. **Hazard lights on** — make yourself visible immediately
3. **Exit carefully** — leave the vehicle from the side furthest from traffic
4. **Stand behind the barrier** on motorways, or well away from the carriageway in town
5. **Call us** on 0141 266 0690 — stay on the line and we dispatch a fitter while you talk
6. **Do not attempt** to change the tyre yourself on a live road or motorway

## When Should You Call for Emergency Tyre Fitting?

Call immediately if:

- Your tyre is flat or losing pressure quickly
- You hear a loud bang or feel sudden vibration while driving
- You notice a bulge, crack, or exposed cords on the tyre sidewall
- Your tyre pressure warning light is on and the tyre looks visibly low
- You're stranded anywhere and cannot safely drive to a garage

## Emergency Tyre Fitting vs Breakdown Cover

| Feature | Tyre Rescue Emergency | Typical Breakdown Cover |
|---------|----------------------|------------------------|
| Response time | 45 min average | 1–3 hours |
| Tyre carried | Yes, fitted on-site | Usually towed to garage |
| 24/7 availability | Yes | Yes |
| Cost | £49 callout + tyre | Annual membership + potential extras |
| Tyre choice | Full range available | No choice (whatever garage has) |

## Frequently Asked Questions

### Do you fit run-flat tyres in emergencies?
Yes. We carry common run-flat sizes for BMW, Mercedes, and Mini. Let us know your vehicle when calling so we can confirm stock before dispatching.

### Can you come to a motorway hard shoulder?
Yes. Our fitters are trained for roadside work and carry full safety equipment including high-visibility clothing, warning triangles, and LED beacons.

### What if you don't have my tyre size?
We stock over 200 common sizes on our vans. For unusual sizes, we can source and fit same-day in most cases. We'll always tell you before dispatching if there's a stock issue.

### Is there a charge if the puncture is repairable?
If we can repair the puncture instead of replacing the tyre, you pay £25 for the repair — no callout fee on top. We always try the cheaper option first.`,
  },
  {
    slug: 'what-to-do-flat-tyre-motorway',
    title: 'What to Do If You Get a Flat Tyre on the Motorway',
    description:
      'Flat tyre on the M8 or M74? Call 0141 266 0690. Step-by-step safety guide for motorway tyre blowouts in Scotland, plus how to get emergency tyre fitting fast.',
    category: 'safety',
    publishDate: '2026-03-20',
    lastModified: '2026-03-20',
    readingTime: 5,
    keywords: [
      'flat tyre motorway',
      'tyre blowout M8',
      'roadside tyre change Scotland',
      'emergency tyre motorway Glasgow',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'signs-you-need-new-tyres',
    ],
    featured: false,
    content: `## Stay Calm — Here's Exactly What to Do

A flat tyre on the motorway is frightening but manageable. Follow these steps in order and you'll be safe.

**Immediate answer:** Do NOT brake hard. Grip the steering wheel firmly, ease off the accelerator, signal left, and coast to the hard shoulder or emergency refuge area. Then call 0141 266 0690 for emergency tyre fitting.

## Step-by-Step: Flat Tyre on a Scottish Motorway

### Step 1: Get Off the Carriageway Safely

- **DO NOT slam the brakes** — this can cause a skid, especially with a rear blowout
- Grip the steering wheel with both hands to counteract any pulling
- Ease off the accelerator gradually
- Signal left and move to the hard shoulder or nearest emergency refuge area
- Stop as far left as possible, ideally on a straight section where other drivers can see you

### Step 2: Make Yourself Visible

- Turn on hazard lights immediately
- If it's dark, keep sidelights on
- If you have a warning triangle, place it 45 metres behind your vehicle (but only if it's safe to walk along the hard shoulder)

### Step 3: Exit the Vehicle Safely

- **Exit from the passenger (left) side** — never step out into live traffic
- All passengers should exit from the left side
- Move behind the motorway barrier if one exists
- Walk up the embankment away from the carriageway
- Take pets with you but leave luggage

### Step 4: Call for Emergency Tyre Fitting

Call Tyre Rescue on **0141 266 0690**. We need:

1. Your exact location (motorway name + direction + nearest junction or marker post)
2. Your vehicle make, model, and registration
3. Which tyre is flat (front/rear, left/right)
4. Your contact number

We dispatch a fitter immediately — average arrival time is 45 minutes on Glasgow motorways.

### Step 5: Wait Safely

- Stand well back from the hard shoulder behind the barrier
- Do NOT sit in your vehicle — in a collision, vehicles on the hard shoulder are hit from behind
- Keep your phone charged and available
- If conditions worsen (rain, dark), stay visible with reflective clothing if you have it

## Which Motorways Do We Cover?

| Motorway | Route | Coverage |
|----------|-------|----------|
| M8 | Glasgow–Edinburgh | Full coverage |
| M74 | Glasgow–Carlisle | Full coverage to Abington |
| M77 | Glasgow–Kilmarnock | Full coverage |
| M80 | Glasgow–Stirling | Full coverage |
| M73 | Maryville–Mollinsburn | Full coverage |
| M9 | Edinburgh–Stirling | Full coverage |
| A720 | Edinburgh City Bypass | Full coverage |

## Should You Change the Tyre Yourself?

**On a motorway: No.** The hard shoulder is one of the most dangerous places on the road network. Highways England data shows that 1 in 12 motorway deaths involve someone stopped on the hard shoulder.

Unless you are completely confident and conditions are safe (dry, daylight, wide hard shoulder, no Smart Motorway section), wait for a professional.

On a quiet residential street? A tyre change is straightforward if you have a jack and spare. But if you're unsure, calling a mobile fitter is the safer choice.

## How to Prevent Motorway Tyre Failures

1. **Check tyre pressure monthly** — underinflation is the leading cause of blowouts
2. **Inspect tread depth** — legal minimum is 1.6mm but replace at 3mm for safety
3. **Look for damage** — bulges, cracks, or embedded objects mean the tyre needs attention
4. **Don't overload** — check your vehicle's weight limits, especially before long trips
5. **Replace old tyres** — even with good tread, tyres over 5 years old lose structural integrity

## Frequently Asked Questions

### How much does motorway emergency tyre fitting cost?
£49 callout plus the tyre cost (£40–£150 depending on size and brand). No extra charge for motorway callouts.

### Can you come to a Smart Motorway section?
Yes, but you must be in an emergency refuge area. If you're stuck in a live lane, call 999 first, then call us once you're safe.

### How long will I wait on the hard shoulder?
Our average response on Glasgow motorways is 45 minutes. We'll give you an accurate ETA when you call.`,
  },
  {
    slug: 'mobile-tyre-fitting-vs-garage',
    title: 'Mobile Tyre Fitting vs Going to a Garage: Which Is Better?',
    description:
      'Comparing mobile tyre fitting to garage visits. Cost, convenience, speed, and quality compared for Glasgow drivers. Call 0141 266 0690 for mobile fitting.',
    category: 'fitting',
    publishDate: '2026-03-20',
    lastModified: '2026-03-20',
    readingTime: 6,
    keywords: [
      'mobile tyre fitting vs garage',
      'mobile tyre fitter near me',
      'tyre fitting at home Glasgow',
      'best way to get tyres fitted',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-maintenance-checklist-scotland',
    ],
    featured: true,
    content: `## The Short Answer

Mobile tyre fitting is better if you value convenience and time. A garage is better if you need complex wheel work (alignment, balancing machines) or have an unusual vehicle. For standard tyre replacement, mobile fitting delivers the same quality at comparable cost — at your location.

## Side-by-Side Comparison

| Factor | Mobile Tyre Fitting | Garage Visit |
|--------|-------------------|--------------|
| **Location** | Your home, work, or roadside | You drive to them |
| **Wait time** | 15-20 mins per tyre (you watch) | 30-90 mins (you wait inside) |
| **Scheduling** | Same-day, often within hours | May need to book days ahead |
| **24/7 availability** | Yes (emergency) | Typically Mon-Sat daytime |
| **Travel required** | None — fitter comes to you | You drive there and back |
| **Fitting cost** | From £20 per tyre | From £10-15 per tyre |
| **Tyre choice** | Range on van + can source | Full showroom range |
| **Equipment** | Professional portable gear | Fixed workshop equipment |
| **Wheel alignment** | Not usually available | Available |
| **Convenience** | Very high | Low-moderate |

## When Mobile Fitting Wins

### 1. You Can't Drive to a Garage
Flat tyre, blowout, or tyre damage that makes the vehicle undrivable. This is the most common reason people call us — and it's not even close. If your tyre is flat, driving to a garage on the rim damages the wheel.

### 2. You Don't Have Time to Sit in a Waiting Room
A mobile fitter works at your location. While they fit your tyres, you're at home having coffee, or at your desk working. No lost afternoon.

### 3. You Need Tyres Fitted Outside Business Hours
Most garages close at 5-6pm and aren't open on Sundays. Tyre Rescue operates 24/7 including bank holidays.

### 4. Fleet Vehicles
If you manage vehicles for a business, having a mobile fitter come to your yard is dramatically more efficient than sending each vehicle to a garage.

### 5. You Have Young Children or Mobility Issues
Loading kids into a car to sit in a waiting room, or negotiating a garage forecourt with mobility aids — mobile fitting eliminates all of this.

## When a Garage Wins

### 1. Wheel Alignment
After fitting new tyres, alignment is recommended — especially if you hit a pothole. Mobile fitters don't carry alignment rigs. Most garages do.

### 2. Complex Wheel Work
Bent alloys, tyre balancing with precision machines, or TPMS sensor programming — these sometimes need workshop equipment.

### 3. Budget Fitting Cost
Garage labour rates for fitting-only (you supply the tyre) can be £10-15 per tyre. Mobile is typically £20. The difference is the convenience premium.

### 4. Browsing Tyres in Person
Some drivers prefer to see the tyre before buying. Garages have showroom displays. With mobile fitting, you choose online or by phone.

## Quality: Is Mobile Fitting as Good?

Yes. Mobile fitters use:

- **Hydraulic jacks** rated for your vehicle weight
- **Calibrated torque wrenches** to manufacturer specifications
- **TPMS sensors** — we reset your tyre pressure monitoring system
- **Professional tyre changers** — portable but professional-grade

The tyre is the same product. The fitting process is identical. The only difference is the location.

At Tyre Rescue, all fitters are fully insured and trained. The job comes with the same warranty whether done in a workshop or your driveway.

## Cost Breakdown: Real Numbers

**Scenario:** You need 2 new 205/55R16 tyres (common size for Ford Focus, VW Golf, etc.)

### Mobile Fitting (Tyre Rescue)
- 2x mid-range tyres: £140
- Fitting (£20 x 2): £40
- Old tyre disposal: Free
- **Total: £180**
- Time away from your day: **0 minutes** (fitter works while you continue your routine)

### Garage Visit (Typical Glasgow)
- 2x mid-range tyres: £130
- Fitting + balancing (£15 x 2): £30
- Old tyre disposal: £2 x 2 = £4
- **Total: £164**
- Time away from your day: **90-120 minutes** (drive there, wait, drive back)

The £16 difference buys you back 2 hours of your day. For most people, that's a clear win for mobile.

## Frequently Asked Questions

### Can a mobile fitter balance my wheels?
Basic balancing is possible with portable equipment, but for precision balancing we'd recommend a garage. Most tyre replacements don't require separate balancing — the tyre is pre-balanced during manufacture.

### Do mobile fitters offer the same tyre brands?
Yes. We carry Hankook, Continental, Michelin, Bridgestone, Pirelli, and quality budget brands. If we don't have your exact size on the van, we source it same-day.

### Is it safe to have tyres fitted on a driveway?
Completely safe. We assess the ground surface before starting. A level driveway or car park is an ideal working surface — often better than a cramped garage ramp.

### Can I book a specific time for mobile fitting?
Yes. For non-emergency fittings, you choose a time slot that works for you. We confirm a 2-hour window and call 30 minutes before arrival.`,
  },
  {
    slug: 'tyre-maintenance-checklist-scotland',
    title: 'Tyre Maintenance Checklist for Scottish Drivers',
    description:
      'Keep your tyres safe in Scottish weather. Monthly checks, legal tread depth, pressure guide, and when to replace. Expert advice from Glasgow mobile tyre fitters.',
    category: 'maintenance',
    publishDate: '2026-03-20',
    lastModified: '2026-03-20',
    readingTime: 6,
    keywords: [
      'tyre maintenance checklist',
      'tyre pressure check Scotland',
      'tyre tread depth UK law',
      'when to replace tyres',
    ],
    relatedSlugs: [
      'signs-you-need-new-tyres',
      'mobile-tyre-fitting-vs-garage',
    ],
    featured: false,
    content: `## Your Monthly Tyre Check in 5 Minutes

Scottish roads, rain, and temperature swings are hard on tyres. A 5-minute monthly check prevents blowouts, improves fuel economy, and keeps you legal. Here's what to check.

**Quick answer:** Check pressure, tread depth, and visual condition once a month and before any long journey. It takes 5 minutes and could save your life.

## 1. Tyre Pressure

### Why It Matters
Underinflated tyres are the single biggest cause of blowouts. They also:
- Increase fuel consumption by up to 3%
- Wear unevenly (edges wear faster)
- Handle poorly in wet conditions
- Increase braking distance

### How to Check
1. Find your vehicle's recommended pressure — it's on a sticker inside the driver's door or in the owner's manual
2. Check when the tyres are **cold** (not driven for 2+ hours)
3. Use a digital gauge (more accurate than pencil-type)
4. Check all four tyres **and the spare**
5. Adjust to the correct PSI at a petrol station air pump

### Scottish-Specific Tip
Temperature drops of 10°C can reduce tyre pressure by 1-2 PSI. In Scotland, where temperatures can swing 15°C between day and night in spring/autumn, check more frequently during seasonal changes.

## 2. Tread Depth

### Legal Requirements
The UK legal minimum tread depth is **1.6mm** across the central three quarters of the tyre. However:

- **1.6mm is the bare legal minimum** — braking performance is significantly worse
- **3mm is the safety threshold** — we recommend replacing at this point
- **Below 3mm in wet conditions** increases stopping distance by up to 44%

### How to Check
**The 20p test:**
1. Insert a 20p coin into the main tread grooves
2. If you can see the outer band of the coin, your tread is below 3mm
3. Check at three points across the tyre width
4. Check at several points around the circumference

### Penalty for Illegal Tyres
- **£2,500 fine per tyre**
- **3 penalty points per tyre**
- 4 illegal tyres = 12 points = automatic ban

## 3. Visual Inspection

Look for these warning signs every time you walk to your car:

| What to Look For | What It Means | Action |
|-----------------|---------------|--------|
| Bulge on sidewall | Internal structural damage | Replace immediately — tyre could blow |
| Cracks in rubber | Age or UV degradation | Replace soon, especially if deep |
| Embedded objects | Nail, screw, glass | May be repairable — call for assessment |
| Uneven wear (inner edge) | Alignment issue | Get alignment checked + consider new tyres |
| Uneven wear (centre) | Over-inflation | Adjust pressure and monitor |
| Uneven wear (both edges) | Under-inflation | Adjust pressure and monitor |
| Flat spots | Brake lockup or sitting too long | Usually temporary; replace if persistent |

## 4. Seasonal Considerations for Scotland

### Winter (November–March)
- Check pressure more frequently (cold reduces PSI)
- Consider winter tyres if you regularly drive in Highlands or rural areas
- All-season tyres are a good compromise for Glasgow/Edinburgh city driving
- Watch for pothole damage after freeze-thaw cycles

### Summer (April–October)
- Hot tarmac increases tyre temperature — don't over-inflate
- Check for cracking if tyres are over 3 years old
- UV exposure degrades rubber — inspect sidewalls

### Year-Round Scotland Issues
- Potholes — Glasgow and Edinburgh roads are notoriously potholed. After any impact, check for bulges
- Standing water — worn tyres aquaplane easily on Scotland's wet roads
- Debris — country roads often have sharp stones, hedge cuttings, and farm equipment remnants

## 5. When to Replace Your Tyres

Replace immediately if:
- Tread depth is at or below 1.6mm anywhere
- There's a bulge or blister on the sidewall
- You can see cords or metal through the rubber
- The tyre is over 10 years old (check the DOT date code)

Replace soon if:
- Tread is at 3mm or below
- Cracking is visible on the sidewall
- The tyre is over 5 years old regardless of tread
- You notice vibration or pulling when driving

## Frequently Asked Questions

### How often should I check my tyres?
Monthly and before any journey over 100 miles. It takes 5 minutes.

### Where can I get my tyres checked in Glasgow?
Tyre Rescue offers free tyre condition assessments with any mobile fitting appointment. Call 0141 266 0690 to book.

### Do I need winter tyres in Glasgow?
For city driving, all-season tyres are usually sufficient. If you regularly drive to the Highlands or rural areas in winter, dedicated winter tyres provide significantly better grip below 7°C.

### How do I find my tyre size?
Look on the tyre sidewall — you'll see markings like **205/55R16 91V**. This tells us everything we need to match the correct replacement.`,
  },
  {
    slug: 'signs-you-need-new-tyres',
    title: '7 Signs You Need New Tyres (Don\'t Ignore These)',
    description:
      'How to tell if your tyres need replacing. 7 clear warning signs every Glasgow driver should know. Expert advice from certified mobile tyre fitters.',
    category: 'safety',
    publishDate: '2026-03-20',
    lastModified: '2026-03-20',
    readingTime: 5,
    keywords: [
      'signs need new tyres',
      'when to replace tyres UK',
      'tyre wear indicators',
      'bald tyres Glasgow',
    ],
    relatedSlugs: [
      'tyre-maintenance-checklist-scotland',
      'mobile-tyre-fitting-vs-garage',
    ],
    featured: false,
    content: `## 7 Warning Signs Your Tyres Need Replacing

Your tyres are the only part of your vehicle touching the road. When they're worn, everything suffers — braking, cornering, fuel economy, and safety. Here are the signs you need new tyres.

**Quick answer:** If your tread is at or below 3mm, you have sidewall damage, or your tyres are over 5 years old, it's time for replacements. Call 0141 266 0690 for mobile tyre fitting in Glasgow.

## 1. Low Tread Depth

The most obvious sign. UK law requires a minimum of 1.6mm, but braking performance drops significantly below 3mm — especially in wet Scottish conditions.

**How to check:** Insert a 20p coin into the tread grooves. If you can see the outer band, you're at or below the replacement threshold.

Modern tyres also have **tread wear indicators** — small raised bars inside the grooves. When the tread surface is level with these bars, the tyre is legally worn out.

## 2. Sidewall Bulges or Blisters

A bulge on the tyre sidewall means the internal structure has been damaged — usually from hitting a pothole or kerb. This is a tyre failure waiting to happen.

**Action:** Replace immediately. A bulging tyre cannot be repaired and could blow out at any speed.

## 3. Visible Cracks

Small cracks in the sidewall rubber indicate age or UV degradation. The rubber compound dries out over time, losing its flexibility and grip.

**When to worry:** Surface crazing is cosmetic. Deep cracks that you can feel with a fingernail mean the tyre needs replacing, even if tread depth is still good.

## 4. Vibration While Driving

Some vibration is normal on rough roads. But if you feel new, persistent vibration through the steering wheel or seat:

- **At all speeds:** Could be a tyre defect or internal damage
- **Only at high speed (60mph+):** Likely a balance issue
- **When braking:** Could be a flat spot from a brake lockup

Any new vibration warrants a tyre inspection.

## 5. Uneven Wear Patterns

| Wear Pattern | Cause | Fix |
|-------------|-------|-----|
| Centre worn, edges fine | Over-inflation | Reduce pressure to recommended PSI |
| Edges worn, centre fine | Under-inflation | Increase pressure to recommended PSI |
| One edge worn | Alignment problem | Get alignment checked |
| Patchy/cupping wear | Suspension fault | Check suspension + replace tyre |
| Feathered edges | Toe alignment issue | Alignment check needed |

Uneven wear means the tyre isn't making proper contact with the road. Even if tread depth looks adequate, the wear pattern means reduced grip.

## 6. Age (Over 5 Years)

Even if a tyre looks fine and has plenty of tread, the rubber compound degrades over time. After 5 years, the rubber loses elasticity and grip — particularly in cold, wet Scottish conditions.

**How to check the age:** Look for the DOT code on the sidewall. The last four digits indicate the week and year of manufacture. For example, **2321** means week 23 of 2021.

Tyres over 10 years old should be replaced regardless of condition.

## 7. Your Car Pulls to One Side

If your vehicle drifts left or right when driving straight on a flat road, it could indicate:

- Uneven tyre wear
- Different tread depths front-to-rear
- Internal tyre damage
- Alignment issues

First check that all four tyres are at the correct pressure. If the pull persists, a tyre inspection will identify the cause.

## What to Do Next

If you've spotted any of these signs, don't wait. Driving on damaged or worn tyres in Scotland's wet conditions is dangerous and potentially illegal.

**For Glasgow and Edinburgh:** Call Tyre Rescue on 0141 266 0690. We'll come to your location, assess all four tyres, and replace whatever's needed. Mobile fitting from £20 per tyre + the tyre price (varies by size and brand), available 24/7.

## Frequently Asked Questions

### Can I just replace one tyre?
Yes, if only one tyre is worn or damaged. We recommend fitting the new tyre on the rear axle for better stability — we'll move existing tyres around if needed.

### How many miles do tyres last?
Typically 20,000–40,000 miles depending on driving style, vehicle weight, and tyre quality. Front tyres wear faster on front-wheel-drive vehicles (most cars).

### Are part-worn tyres safe?
We don't recommend part-worn tyres. You don't know their history — they may have been run flat, overheated, or improperly stored. The small cost saving isn't worth the safety risk.`,
  },
  {
    slug: 'best-mobile-tyre-fitting-services-scotland',
    title: 'Best Mobile Tyre Fitting Services in Scotland (2026 Guide)',
    description:
      'Looking for the best mobile tyre fitting in Scotland? We compare services, pricing, response times and coverage areas to help you choose the right provider in Glasgow, Edinburgh & beyond.',
    category: 'fitting',
    publishDate: '2025-06-20',
    lastModified: '2026-08-01',
    readingTime: 12,
    keywords: [
      'best mobile tyre fitting scotland',
      'mobile tyre fitting near me',
      'mobile tyre fitter glasgow',
      'mobile tyre fitting edinburgh',
      'cheapest mobile tyre fitting',
      'tyre fitting comparison',
      'mobile tyre fitting reviews',
    ],
    relatedSlugs: ['mobile-tyre-fitting-vs-garage', 'emergency-tyre-fitting-glasgow-complete-guide'],
    featured: false,
    content: `Getting a flat tyre is stressful enough without having to figure out which tyre fitting service to call. With so many options in Scotland — from national chains to independent mobile fitters — choosing the right provider matters.

This guide compares the top mobile tyre fitting services available in Scotland, focusing on what matters most: response times, pricing, coverage, and customer satisfaction.

## What Is Mobile Tyre Fitting?

Mobile tyre fitting is a service where a qualified fitter comes to your location — home, work, or roadside — to replace, repair, or fit new tyres on your vehicle. Instead of driving to a garage (which is often impossible with a flat tyre), the garage comes to you.

### Benefits of Mobile Tyre Fitting
- **No recovery needed** — the fitter comes to you, wherever you are
- **Time saving** — no waiting in a garage queue
- **Emergency availability** — some providers offer 24/7 callout
- **Same professional equipment** — hydraulic jacks, torque wrenches, balancing machines
- **Convenience** — fitting at your home or workplace while you carry on with your day

## Key Factors When Choosing a Mobile Tyre Fitter

### 1. Response Time
This is crucial, especially in emergencies. The best mobile fitters offer average response times under an hour. Some appointment-based services require booking a day or more in advance.

### 2. Coverage Area
Not all providers cover the whole of Scotland. Check whether they serve your specific area — especially if you're outside Glasgow or Edinburgh.

### 3. 24/7 Availability
Flat tyres don't wait for business hours. If emergency service matters to you, check whether the provider offers genuine round-the-clock callout.

### 4. Pricing Transparency
Look for providers with clear, upfront pricing. Beware of hidden callout fees, fitting charges, or surge pricing during unsociable hours.

### 5. Customer Reviews
Trustpilot, Google Reviews, and word of mouth are your best guides. Look for recent reviews that mention the specific service you need.

## Top Mobile Tyre Fitting Services in Scotland

### Tyre Rescue
- **Coverage:** All of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Stirling, Perth, Falkirk, Paisley, Highlands, Islands and every postcode from G to ZE
- **Hours:** 24/7, 365 days a year
- **Response Time:** 45 minutes average (Central Belt), 90 minutes (Aberdeen/Inverness)
- **Starting Price:** Callout from £49 + tyre price (emergency)
- **Trustpilot:** 4.8/5 stars
- **Key Features:** Live GPS tracking of your fitter, instant online booking, budget to premium tyre range
- **Best For:** Emergency callouts, out-of-hours fitting, anyone who values convenience

Tyre Rescue is Scotland's dedicated mobile tyre fitting service. Unlike national chains that bolt on mobile service as an afterthought, Tyre Rescue was built from the ground up for mobile fitting. Their Scotland-wide coverage, 24/7 availability and real-time fitter tracking set them apart.

### Kwik Fit
- **Coverage:** Nationwide garage network
- **Hours:** Standard business hours (garages)
- **Response Time:** Appointment-based
- **Starting Price:** From £45 (garage visit)
- **Trustpilot:** 3.7/5 stars
- **Best For:** In-store fitting during business hours

Kwik Fit is the UK's most recognisable tyre brand. Their strengths are brand trust and nationwide availability. However, their mobile service is limited, and their Trustpilot rating is significantly lower than specialist mobile fitters.

### National Tyres and Autocare
- **Coverage:** UK-wide with some mobile options
- **Hours:** Business hours
- **Response Time:** Pre-booked, usually next day
- **Starting Price:** From £50 (with mobile surcharge)
- **Trustpilot:** 4.3/5 stars
- **Best For:** Planned tyre replacements

National Tyres offers a competent service with growing mobile capabilities. Mobile fitting availability varies by location and requires advance booking.

### ATS Euromaster
- **Coverage:** Nationwide, limited Scottish centres
- **Hours:** Business hours
- **Response Time:** Appointment-based
- **Starting Price:** From £45 (in-centre)
- **Trustpilot:** 4.1/5 stars
- **Best For:** Fleet and commercial vehicles

ATS Euromaster excels in commercial and fleet tyre management. For individual consumer mobile tyre fitting in Scotland, they're not the natural choice.

### Halfords Autocentres
- **Coverage:** Nationwide garages, limited mobile
- **Hours:** Garage hours
- **Response Time:** Pre-booked
- **Starting Price:** From £40 (tyre only, in-store)
- **Trustpilot:** 3.5/5 stars
- **Best For:** Budget in-store tyre fitting

Halfords offers competitive in-store pricing and the convenience of a high street location. Their mobile service (Halfords Mobile Expert) has limited coverage in Scotland.

## Comparison Summary

| Feature | Tyre Rescue | Kwik Fit | National Tyres | ATS | Halfords |
|---------|------------|----------|---------------|-----|----------|
| 24/7 Service | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mobile-First | ✅ | ❌ | Partial | Fleet | Limited |
| Avg Response | 45 min | N/A | Next day | N/A | N/A |
| GPS Tracking | ✅ | ❌ | ❌ | ❌ | ❌ |
| Trustpilot | 4.8★ | 3.7★ | 4.3★ | 4.1★ | 3.5★ |
| From Price | £49 | £45 | £50 | £45 | £40 |

## When to Use Mobile Tyre Fitting vs a Garage

**Choose mobile tyre fitting when:**
- You have a flat tyre and can't drive to a garage
- It's outside normal business hours (evening, weekend, bank holiday)
- You want the convenience of fitting at home or work
- You need emergency callout
- Your vehicle can't be moved (wheel damage, no spare)

**Choose a garage when:**
- You need complex wheel alignment or tracking
- You want to browse tyres in person before buying
- You're already near a garage and it's during business hours

## How to Book Mobile Tyre Fitting

With Tyre Rescue, booking takes under 2 minutes:

1. **Visit tyrerescue.uk/book** or call 0141 266 0690
2. **Enter your tyre size** (found on tyre sidewall, e.g. 205/55 R16)
3. **Choose your tyre** from budget, mid-range, or premium options
4. **Pick a time** or select emergency callout for immediate service
5. **Enter your location** and pay securely online
6. **Track your fitter** with live GPS via your booking confirmation link

## Frequently Asked Questions

### How much does mobile tyre fitting cost in Scotland?
Prices typically start at a £49 emergency callout fee plus the tyre price. The total cost depends on the tyre brand and size you choose. Budget tyres for standard cars start from around £55, so a typical emergency replacement is from around £104 (£49 callout + £55 tyre).

### How quickly can a mobile tyre fitter get to me?
Tyre Rescue averages 45-minute response times in Glasgow and Edinburgh. Most appointment-based services require at least a few hours' notice or next-day booking.

### Do mobile tyre fitters carry all tyre sizes?
Most mobile fitters carry common sizes. For unusual sizes, you may need to give a few hours' notice. Tyre Rescue stocks the most popular sizes on vans and can source specialist tyres within a few hours.

### Is mobile tyre fitting as good as garage fitting?
Yes. Mobile fitters use the same professional equipment — hydraulic jacks, torque wrenches, and portable balancing machines. The quality of fitting is identical to a garage.

### Can you repair a puncture at the roadside?
Yes, if the puncture is in the repairable area of the tyre (the central tread). Sidewall damage cannot be safely repaired. Tyre Rescue carries puncture repair kits on every van.

## The Bottom Line

For mobile tyre fitting in Scotland, the choice depends on your priorities. If you need 24/7 emergency service, fast response times, and the convenience of a mobile-first provider, Tyre Rescue is the standout option. For planned, in-store fitting during business hours, national chains like Kwik Fit or Halfords offer a familiar experience.

**Need a tyre fitted now?** Call Tyre Rescue on **0141 266 0690** or book online at **tyrerescue.uk/book**. We're available 24/7 and cover all of Scotland — 45-minute response times in the Central Belt, 90 minutes to Aberdeen and Inverness.`,
  },
  {
    slug: 'tyre-fitting-costs-scotland-pricing-guide',
    title: 'Tyre Fitting Costs in Scotland: Complete Pricing Guide (2026)',
    description:
      'How much does tyre fitting cost in Scotland? Full breakdown of mobile tyre fitting prices, garage costs, emergency callout fees & ways to save. Updated for 2026.',
    category: 'fitting',
    publishDate: '2025-06-20',
    lastModified: '2026-08-01',
    readingTime: 10,
    keywords: [
      'tyre fitting cost scotland',
      'how much does mobile tyre fitting cost',
      'tyre fitting prices glasgow',
      'cheap tyre fitting near me',
      'emergency tyre fitting cost',
      'tyre fitting price comparison',
    ],
    relatedSlugs: ['best-mobile-tyre-fitting-services-scotland', 'signs-you-need-new-tyres'],
    featured: false,
    content: `One of the most common questions we get at Tyre Rescue is "how much does tyre fitting cost?" The answer depends on several factors — tyre brand, size, vehicle type, and whether you need mobile or in-garage service.

This guide breaks down tyre fitting costs across Scotland for 2025, so you know exactly what to expect before you book.

## What Affects Tyre Fitting Costs?

### 1. Tyre Size
Larger tyres cost more. A 205/55 R16 (common on family cars) will cost significantly less than a 275/35 R21 (common on SUVs and performance cars).

### 2. Tyre Brand
- **Budget** (e.g. Hifly, Roadstone): £40–£65 per tyre
- **Mid-range** (e.g. Firestone, Falken): £60–£100 per tyre
- **Premium** (e.g. Michelin, Continental, Bridgestone): £90–£180 per tyre

### 3. Fitting Type
- **Garage fitting:** Usually £10–£20 per tyre fitting fee (on top of tyre cost)
- **Mobile fitting:** Often included in the total price, or £15–£25 per tyre
- **Emergency mobile callout:** Callout fee from £49, plus the tyre price

### 4. Vehicle Type
Standard passenger cars are cheapest to fit. SUVs, 4x4s, and vans cost more due to heavier wheels and larger tyres. Run-flat tyres can also add £5–£10 per tyre.

## Average Tyre Fitting Prices in Scotland (2025)

### Standard Car (e.g. Ford Fiesta, VW Golf)

| Service | Budget Tyre | Mid-Range | Premium |
|---------|-----------|-----------|---------|
| Single tyre (garage) | £55–£75 | £75–£110 | £110–£180 |
| Single tyre (mobile) | £65–£85 | £85–£120 | £120–£190 |
| Set of 4 (garage) | £200–£280 | £280–£420 | £420–£700 |
| Set of 4 (mobile) | £240–£320 | £320–£460 | £460–£740 |

### SUV / 4x4 (e.g. Nissan Qashqai, Range Rover Sport)

| Service | Budget Tyre | Mid-Range | Premium |
|---------|-----------|-----------|---------|
| Single tyre (garage) | £75–£100 | £100–£150 | £150–£250 |
| Single tyre (mobile) | £85–£110 | £110–£160 | £160–£260 |
| Set of 4 (garage) | £280–£380 | £380–£580 | £580–£980 |
| Set of 4 (mobile) | £320–£420 | £420–£620 | £620–£1020 |

### Van (e.g. Ford Transit, VW Transporter)

| Service | Budget Tyre | Mid-Range | Premium |
|---------|-----------|-----------|---------|
| Single tyre (garage) | £65–£90 | £90–£130 | £130–£200 |
| Single tyre (mobile) | £75–£100 | £100–£140 | £140–£210 |

*All prices include fitting. VAT is not added separately. Prices are estimates for Central Scotland.*

## Mobile Tyre Fitting vs Garage: Cost Comparison

At first glance, garage fitting appears cheaper. But factor in the hidden costs:

### Hidden Costs of Garage Visits
- **Fuel:** £5–£15 driving to/from the garage
- **Time off work:** Average 2–3 hours for a garage visit including travel
- **Recovery cost:** If you can't drive there (flat tyre) — £50–£100 for recovery
- **Parking:** If the garage is in a city centre

### The True Cost Comparison

For a single tyre replacement with a mid-range tyre on a standard car:

| | Garage | Mobile |
|---|--------|--------|
| Tyre + fitting | £85 | £95 |
| Fuel to/from | £8 | £0 |
| Time (2.5 hrs × £15/hr) | £37.50 | £0 |
| Recovery (if flat) | £75 | £0 |
| **Total** | **£130–£205** | **£95** |

When you can't drive to a garage, mobile fitting isn't just more convenient — it's often cheaper.

## Emergency Tyre Fitting Costs

Emergency callouts (outside standard hours, or immediate response) typically cost more:

- **Emergency callout fee:** £49–£79
- **Tyre cost:** Same as standard pricing
- **Fitting:** Usually included in the callout fee
- **No surge pricing with Tyre Rescue** — our emergency callout fee is a flat £49 (tyre price extra)

### What Counts as an Emergency?
- Flat tyre where you can't drive
- Tyre blowout on a motorway or road
- Damaged tyre with no spare
- Late-night or early-morning breakdown
- Any situation where you need a tyre fitter urgently

## Ways to Save on Tyre Fitting

### 1. Buy 2 or 4 Tyres Together
Most providers (including Tyre Rescue) offer better per-tyre pricing for multiple tyres. Fitting 2 or 4 at once also reduces callout fees per tyre.

### 2. Choose Mid-Range Over Budget
Counter-intuitive, but mid-range tyres often last 50–80% longer than budget tyres. The cost per mile is often lower.

### 3. Check Tread Regularly
Catching wear early lets you plan a replacement at a good time — avoiding emergency callout fees and giving you time to compare prices.

### 4. Ask About Puncture Repair
If the puncture is in the repairable zone, repair costs £25–£35 compared to £60–£150 for a new tyre. Always ask your fitter to check first.

### 5. Book Online
Online booking often comes with transparent, locked-in pricing. No surprise charges when the job is done.

## Puncture Repair Costs

Not all flat tyres need replacing. A puncture repair is much cheaper:

| Service | Garage | Mobile |
|---------|--------|--------|
| Standard puncture repair | £20–£30 | £25–£40 |
| Emergency puncture repair | N/A | £49–£65 |

Puncture repairs are only safe when the damage is in the central tread area. Sidewall punctures, large cuts, or multiple punctures in the same area require a new tyre.

## Tyre Fitting Costs by Scottish City

Prices vary slightly across Scotland:

### Glasgow
Glasgow has the most competitive tyre fitting market in Scotland. Mobile services are widely available, and prices tend to be at the lower end of the ranges shown above. Tyre Rescue is based in Glasgow and offers the fastest response times here.

### Edinburgh
Edinburgh prices are slightly higher on average, particularly for in-centre fitting where overheads are higher. Mobile fitting prices are comparable to Glasgow.

### Dundee
Fewer providers means slightly less competition, but mobile services from Tyre Rescue cover Dundee with competitive pricing.

### Stirling & Falkirk
Central Belt coverage is good. Some national chains have limited presence, making mobile fitting a particularly strong option here.

## Frequently Asked Questions

### How much does it cost to fit 4 tyres on a car?
For a standard car with mid-range tyres, expect to pay £280–£460 including fitting at a garage, or £320–£460 with mobile fitting. Premium tyres will cost more.

### Is mobile tyre fitting more expensive?
The tyre cost is the same. Mobile fitting adds a small premium (typically £10–£25 per tyre) for the convenience of coming to your location. However, when you factor in travel time and fuel, mobile fitting often works out cheaper.

### Do tyre fitters charge a callout fee?
Some do, some don't. Tyre Rescue includes the callout in the quoted price — no hidden fees. Always ask before booking whether there's a separate callout charge.

### Can I bring my own tyres for mobile fitting?
Yes, most mobile fitters (including Tyre Rescue) will fit customer-supplied tyres. The fitting-only charge is typically £20–£30 per tyre.

### How much does run-flat tyre fitting cost?
Run-flat tyres typically add £5–£10 to the fitting cost per tyre because they require TPMS sensor resets and more careful handling. The tyres themselves cost 15–25% more than standard tyres.

## Get a Quote Now

For an instant, transparent quote on mobile tyre fitting in Scotland, visit **tyrerescue.uk/book** or call **0141 266 0690**. No hidden fees, no surprises — just honest pricing and 24/7 availability.`,
  },
  {
    slug: 'mobile-tyre-fitting-edinburgh-guide',
    title: 'Mobile Tyre Fitting in Edinburgh: Prices, Response Times & How to Book',
    description:
      'Need a tyre fitter in Edinburgh? Complete guide to mobile tyre fitting in Edinburgh — costs, response times, areas covered, and how to get a fitter to you fast. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-07-10',
    lastModified: '2026-08-15',
    readingTime: 7,
    keywords: [
      'mobile tyre fitting edinburgh',
      'emergency tyre fitting edinburgh',
      'tyre fitter edinburgh',
      'flat tyre edinburgh',
      '24 hour tyre fitting edinburgh',
      'tyre repair edinburgh',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: true,
    content: `## Mobile Tyre Fitting in Edinburgh — What You Need to Know

Edinburgh is Scotland's capital and our second-busiest service city. Whether you have a flat tyre on Princes Street, a slow puncture in Leith, or a blowout on the A720 City Bypass, Tyre Rescue dispatches a mobile fitter to your exact location — 24 hours a day, 7 days a week.

**Quick answer:** Call 0141 266 0690. A fitter reaches most Edinburgh locations within 55 minutes. Fitting starts from £20 per tyre (plus tyre cost) and there's no hidden M8 surcharge.

## Response Times Across Edinburgh

Edinburgh's road network — the A720 ring road, the A8 corridor, and the Old Town's narrower streets — affects arrival times. Here's what to expect:

| Area | Postcode | Avg Response |
|------|----------|-------------|
| City Centre / Princes Street | EH1–EH2 | 55 min |
| Leith / Portobello | EH6–EH7 | 55 min |
| Morningside / Bruntsfield | EH10 | 60 min |
| Corstorphine / Murrayfield | EH12 | 60 min |
| Newington / Southside | EH9 | 55 min |
| A720 City Bypass | EH10–EH17 | 50 min |
| Musselburgh | EH21 | 60 min |
| Dalkeith | EH22 | 65 min |

We dispatch from our Glasgow base via the M8, and our fitters know the Edinburgh road network well.

## Areas We Cover in Edinburgh

We cover all EH postcodes including:

- **EH1–EH4:** City centre, New Town, Dean Village, Stockbridge
- **EH5–EH7:** Newhaven, Leith, Easter Road, Broughton
- **EH8–EH9:** Holyrood, Newington, Sciennes, Marchmont
- **EH10:** Morningside, Bruntsfield, Greenbank, Fairmilehead
- **EH11–EH12:** Gorgie, Dalry, Corstorphine, Murrayfield
- **EH13–EH14:** Colinton, Juniper Green, Currie, Balerno
- **EH15–EH16:** Portobello, Duddingston, Craigmillar
- **EH17:** Liberton, Gilmerton, Gracemount

We also cover Musselburgh (EH21), Dalkeith (EH22), Loanhead (EH20), and Penicuik (EH26).

## How Much Does Mobile Tyre Fitting Cost in Edinburgh?

Our Edinburgh pricing is identical to Glasgow — no extra charge for crossing the M8.

| Service | Price |
|---------|-------|
| Scheduled tyre fitting (fitting fee) | £20 per tyre |
| Emergency callout fee | £49 |
| Puncture repair | £25 |
| Budget tyre (e.g. 205/55 R16) | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

All prices include professional fitting, wheel torqueing to manufacturer spec, and old tyre disposal.

## Common Edinburgh Tyre Emergency Locations

Our Edinburgh fitters attend call-outs regularly at:

- **A720 City Bypass** — one of Edinburgh's busiest and most pothole-affected roads
- **Princes Street / The Mound** — high tourist footfall and complex parking
- **Royal Mile / Old Town** — cobbled surfaces create sidewall damage
- **Leith Walk** — regular punctures from road debris and tramlines
- **Meadows car parks** — flat tyres found after events and concerts
- **Edinburgh Airport approach (A8)** — travellers and hire cars frequently need assistance
- **Newbridge Industrial Estate (EH28)** — commercial van callouts

## Edinburgh-Specific Tyre Advice

Edinburgh's road surfaces create specific tyre problems:

**Cobblestones:** The Royal Mile, Cockburn Street, and Victoria Street put unusual stress on tyre sidewalls. Check your sidewalls for bulges after driving on cobbled routes regularly.

**Tram tracks:** Leith Walk, Princes Street, and St Andrew Square have tram infrastructure that can catch tyres, especially on motorcycles and narrow-tyred vehicles.

**The A720:** Edinburgh's ring road is heavily used by HGVs and often has road debris. Tyre damage is common, particularly near Hermiston Gait and the Sheriffhall junction.

**Winter potholes:** Edinburgh's freeze-thaw cycle creates potholes every spring. Check your tyres for bulges and impact damage after any hard winter.

## How to Book

**Emergency:** Call 0141 266 0690 — available 24/7. Give us your location, vehicle details, and which tyre is affected.

**Scheduled fitting:** Book online at tyrerescue.uk/book. Choose your tyre size, pick a time slot, and we confirm a 2-hour arrival window.

## Frequently Asked Questions

### Do you charge extra for Edinburgh compared to Glasgow?
No. Our Edinburgh prices are identical — no M8 surcharge or distance fee.

### Can you reach the Edinburgh Old Town?
Yes. Our fitters are experienced with the Old Town's restricted access zones and can advise on where best to meet us if your street is a controlled zone.

### Do you carry run-flat tyres for Edinburgh BMWs and Mercedes?
Yes. EH postcodes have a high proportion of German premium cars. We carry common run-flat sizes and TPMS reset equipment on every van.

### What if I'm at Edinburgh Airport?
We cover the airport approach roads and the rental car areas. If you're at the terminal building, give us your precise location and we'll advise on the best meeting point.`,
  },
  {
    slug: 'puncture-repair-glasgow-when-replace',
    title: 'Puncture Repair in Glasgow: When Can It Be Fixed & When Do You Need a New Tyre?',
    description:
      'Got a puncture in Glasgow? Find out whether your tyre can be repaired or needs replacing. Expert mobile puncture repair from £25. Call 0141 266 0690 — 24/7.',
    category: 'emergency',
    publishDate: '2026-07-15',
    lastModified: '2026-08-15',
    readingTime: 6,
    keywords: [
      'puncture repair glasgow',
      'mobile puncture repair glasgow',
      'tyre repair vs replace',
      'can puncture be repaired',
      'puncture repair near me',
      'flat tyre repair glasgow',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'signs-you-need-new-tyres',
    ],
    featured: false,
    content: `## Can Your Puncture Be Repaired?

Not every flat tyre needs a new tyre. A proper puncture repair costs £25 — significantly less than a new tyre at £45–£150. But not every puncture is repairable. Here's how to know.

**Quick answer:** If the puncture is in the central tread area and caused by an object under 6mm in diameter, it can usually be repaired. Sidewall punctures, large cuts, and run-flat damage require a new tyre.

## The Rules: What Can and Cannot Be Repaired

British Standard BS AU 159 defines what is and isn't a safe tyre repair. Our fitters follow these rules on every job.

### Repairable

- Punctures in the **central tread zone** (the middle three-quarters of the tread width)
- Objects up to **6mm diameter** (nails, screws, small bolts)
- Single puncture — no previous repairs in the same area
- Tyre that **has not been run flat** (running flat even briefly destroys the internal structure)
- Damage that does not extend to the sidewall

### Not Repairable

| Issue | Why It Can't Be Repaired |
|-------|--------------------------|
| Sidewall puncture | Sidewalls flex too much — a patch would fail |
| Tread/sidewall junction | High-stress area — repair won't hold |
| Run flat damage | Internal structure is broken, even if tyre looks ok |
| Object over 6mm | Too large for a safe plug-and-patch |
| Multiple punctures close together | Weakens the tyre beyond repair |
| Bulge or blister | Internal structural damage — replace immediately |
| Tread below 2mm | Not worth repairing a nearly worn tyre |

## How a Proper Puncture Repair Works

There's a right way and a wrong way to repair a puncture. The wrong way — using a tyre plug kit from a petrol station — is a temporary roadside fix only. A proper repair involves:

1. **Tyre removed from the wheel** — the fitter cannot assess internal damage without taking the tyre off
2. **Internal inspection** — checks for run-flat damage, internal cracks, and lining separation
3. **Repair from inside** — a mushroom plug-patch is inserted through the hole and bonded to the inner liner
4. **Buffing and sealing** — the inner surface around the repair is buffed, the patch is cemented and vulcanised
5. **Reinflation and check** — tyre inflated and leak-tested before going back on the vehicle

This is the only method endorsed by tyre manufacturers. Tyre Rescue fitters carry full puncture repair kits on every van.

## Common Glasgow Puncture Causes

Glasgow's road network creates specific puncture hazards:

**The M8 corridor:** Road debris from lorry loads, metal fragments, and blown truck tyres are common on Glasgow's main motorway.

**Byres Road / Sauchiehall Street:** Broken glass from the night-time economy is a frequent cause of slow punctures in the West End.

**East End industrial routes:** Duke Street, Gallowgate, and London Road carry heavy commercial traffic, depositing screws, nails, and metal fragments.

**Pothole damage:** Unlike nail punctures, pothole impacts can cause instant sidewall blowouts that are not repairable. Glasgow City Council's road maintenance backlog means pothole-related tyre damage is common.

**Roadworks:** Temporary surfaces and construction debris around Glasgow's ongoing infrastructure projects (M8 improvements, Clyde Waterfront, various utility works) cause regular punctures.

## How Much Does Puncture Repair Cost in Glasgow?

| Type | Tyre Rescue | Typical Garage |
|------|------------|----------------|
| Standard puncture repair | £25 | £20–£35 |
| Emergency roadside repair | £49 callout + £25 repair | N/A |
| Repair kit (temporary, petrol station) | £5–£15 | N/A |

If the puncture is not repairable, we'll tell you before doing any work and quote for a replacement tyre. You're never committed to a new tyre until you've agreed the price.

## What to Do When You Get a Puncture

1. **Don't panic** — if the tyre deflates gradually, you have time to pull over safely
2. **Hazard lights on** and move to a safe location
3. **Do not drive on a flat** — even a short distance can destroy the tyre and damage the wheel
4. **Call 0141 266 0690** — we'll dispatch a fitter to your location
5. **Wait safely** away from traffic while we're on the way

## Frequently Asked Questions

### Can I use a tyre inflator (fix-a-flat) instead of repair?
Temporary inflators are for genuine emergencies when you cannot safely stop. They seal punctures temporarily but contaminate the tyre internally, making proper repair impossible. Use them as a last resort only.

### How long does a puncture repair take?
Typically 20–30 minutes including removing and refitting the tyre. Our fitters are fast — most puncture jobs are done and dusted in under 30 minutes from arrival.

### Will a repaired tyre be as strong as before?
A correctly performed puncture repair to BS AU 159 standard is as strong as the original tyre in the repaired area. The mushroom plug-patch bonds permanently to the inner liner. We don't offer temporary or partial repairs.

### My TPMS warning light is on — do I need a puncture repair or new sensor?
A TPMS warning can mean a slow puncture, low pressure, or a faulty sensor. Our fitters check the tyre pressure and inspect for punctures first. If the light is on and the tyre looks normal, it may be a sensor fault rather than a puncture.`,
  },
  {
    slug: 'mobile-tyre-fitting-hamilton-lanarkshire',
    title: 'Mobile Tyre Fitting in Hamilton & Lanarkshire: Fast Local Service',
    description:
      'Mobile tyre fitting in Hamilton, Motherwell, East Kilbride and all ML postcodes. Emergency and scheduled service — 30 min average response. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-08-01',
    lastModified: '2026-08-15',
    readingTime: 6,
    keywords: [
      'mobile tyre fitting hamilton',
      'tyre fitting lanarkshire',
      'mobile tyre fitting motherwell',
      'tyre fitter ml postcodes',
      'emergency tyre hamilton',
      'mobile tyre fitting east kilbride',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting Across Lanarkshire

Lanarkshire is one of our busiest service areas outside Glasgow. With easy M74 and M8 access from our Parkhead depot, we cover Hamilton, Motherwell, East Kilbride, Wishaw, Bellshill, and all surrounding ML and G74 postcodes.

**Quick answer:** Call 0141 266 0690. Most Lanarkshire locations are reached within 30 minutes. Prices are the same as Glasgow — no distance surcharge.

## Areas Covered in Lanarkshire

### Hamilton (ML3)
Hamilton is 25 minutes from our base via the M74. We cover the town centre, Motherwell Road, Blantyre, Bothwell, Stonehouse and all ML3 postcodes. The M74/A725 junction near Hamilton is one of our most frequent emergency call-out locations.

### Motherwell (ML1)
Motherwell is 25 minutes via M74/M8. We cover the town centre, Wishaw (ML2), Bellshill (ML4), Uddingston, Viewpark and surrounding areas.

### East Kilbride (G74–G75)
East Kilbride is 25 minutes via M77 and A725. We cover the town centre, Hairmyres, Calderwood, Westwood, Nerston, Jackton and Chapelton.

### Other Lanarkshire Areas
- **Carluke (ML8):** 35 minutes via M74
- **Larkhall (ML9):** 35 minutes via M74/A72
- **Rutherglen (G73):** 20 minutes via M74
- **Cambuslang (G72):** 20 minutes via M74

## Response Times by Lanarkshire Area

| Town | Distance from Base | Avg Response |
|------|------------------|--------------|
| Rutherglen | 4 miles | 20 min |
| Cambuslang | 6 miles | 20 min |
| Hamilton | 11 miles | 30 min |
| Motherwell | 12 miles | 30 min |
| Bellshill | 10 miles | 28 min |
| East Kilbride | 10 miles | 28 min |
| Wishaw | 15 miles | 35 min |
| Carluke | 18 miles | 35 min |
| Larkhall | 17 miles | 35 min |

## Tyre Fitting Prices in Lanarkshire

No distance surcharge applies across Lanarkshire. Our prices are:

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre (205/55 R16) | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

## Common Lanarkshire Tyre Hazards

**M74 Corridor:** The M74 between Glasgow and Hamilton is one of Scotland's busiest motorway sections. Tyre debris from lorries is common, particularly near the Bothwell services and the Hamilton Interchange.

**Hamilton Racecourse Approach:** The A725 near Hamilton Park Racecourse generates high traffic volumes on race days. Flat tyres in car parks and access roads are common.

**East Kilbride Ring Road:** The A725 expressway and the town's roundabout-heavy road system create regular kerb-strike damage.

**Wishaw / Newmains:** The A71 through Wishaw is used heavily by commuters and has rough patches that cause slow punctures.

## Frequently Asked Questions

### How quickly can you reach Hamilton from Glasgow?
Our average response time in Hamilton is 30 minutes. We dispatch the nearest available fitter from our Parkhead base via the M74.

### Do you cover Lanarkshire villages?
Yes — we cover Stonehouse, Quarter, Larkhall, Strathaven, Forth, Lanark and Carstairs on request. Response times for outlying areas are typically 40–50 minutes.

### Can you fit tyres at the Strathclyde Country Park?
Yes — we regularly assist drivers at Strathclyde Park and the Hamilton Water Palace. Just give us your exact parking location.

### Do you cover commercial vans in Lanarkshire?
Yes. We carry van tyres for Transit, Sprinter, Vivaro, Transporter, and other common commercial vehicles across all Lanarkshire postcodes.`,
  },
  {
    slug: 'mobile-tyre-fitting-livingston-west-lothian',
    title: 'Mobile Tyre Fitting in Livingston & West Lothian: Same-Day Service',
    description:
      'Mobile tyre fitting in Livingston, Bathgate, Broxburn and all EH54 postcodes. 45 min average response. Emergency and scheduled. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-08-05',
    lastModified: '2026-08-15',
    readingTime: 5,
    keywords: [
      'mobile tyre fitting livingston',
      'tyre fitting west lothian',
      'tyre fitter eh54',
      'emergency tyre livingston',
      'mobile tyre bathgate',
      'flat tyre livingston',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-edinburgh-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting in Livingston and West Lothian

Livingston sits midway along the M8 between Glasgow and Edinburgh, making it one of the easiest Tyre Rescue dispatch points in central Scotland. We typically reach Livingston in 45 minutes from our Glasgow base — and the same fitters who cover Edinburgh can reach West Lothian from the east.

**Quick answer:** Call 0141 266 0690. We cover all of Livingston and West Lothian with no distance surcharge.

## Areas Covered in West Lothian

### Livingston (EH54)
Full coverage of Livingston town centre, Almondvale, Deans, Craigshill, Howden, Knightsridge and Murieston.

### Bathgate (EH47–EH48)
20 minutes from Livingston. We cover the town centre, Boghall and Whitburn.

### Broxburn (EH52)
15 minutes from Livingston via the M8. We cover Broxburn, Uphall and East Calder.

### Other West Lothian Areas
- **Linlithgow (EH49):** 35 minutes from Glasgow via M9
- **Armadale (EH48):** 50 minutes from Glasgow
- **Fauldhouse (EH47):** 55 minutes from Glasgow
- **Winchburgh (EH52):** 45 minutes from Glasgow

## Why Livingston Drivers Call Us

Livingston's road network generates frequent tyre call-outs:

**The M8 slip roads:** The fast on/off ramps at Livingston (Junction 3) regularly produce tyre blowouts from road debris.

**Almondvale Retail Park:** One of Scotland's busiest retail parks — flat tyres from car park kerbs and trolley damage are common.

**Livingston Designer Outlet:** Tourist traffic and large car park volumes mean tyre incidents are frequent year-round.

**A899 Dual Carriageway:** The main spine road through Livingston town has sections prone to debris and pothole damage.

**Seafield Law Industrial Estate:** Van and lorry traffic creates nail and screw punctures for other road users.

## Prices in Livingston and West Lothian

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

No additional charge for West Lothian — same pricing as Glasgow.

## How to Book

**Emergency:** Call 0141 266 0690 — 24/7. Tell us your location (street address or nearest junction), vehicle details, and which tyre is flat.

**Scheduled:** Book at tyrerescue.uk/book. Choose your tyre size, time, and we confirm a 2-hour arrival window.

## Frequently Asked Questions

### Can you reach Linlithgow?
Yes — Linlithgow is 35 minutes from our Glasgow depot via the M9. We cover the town and the surrounding villages including Bo'ness (reached via the M9/A904).

### Do you service commercial vehicles in Livingston?
Yes. Livingston's industrial estates mean van and commercial tyre callouts are common. We carry tyres for Transit, Sprinter, Vivaro, Transporter and other commercial vehicles.

### Is the service the same from Glasgow as from Edinburgh?
We dispatch whichever fitter is closer and available. During busy periods, West Lothian may be reached from either Glasgow or Edinburgh — you get the nearest available fitter.`,
  },
  {
    slug: 'mobile-tyre-fitting-aberdeen-guide',
    title: 'Mobile Tyre Fitting in Aberdeen: Emergency & Scheduled Service',
    description:
      'Need a tyre fitter in Aberdeen? Complete guide to mobile tyre fitting in Aberdeen — costs, response times, AB postcode coverage and how to get a fitter to you fast. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    keywords: [
      'mobile tyre fitting aberdeen',
      'emergency tyre fitting aberdeen',
      'tyre fitter aberdeen',
      'flat tyre aberdeen',
      '24 hour tyre fitting aberdeen',
      'tyre repair aberdeen',
      'mobile tyre aberdeen',
      'ab postcode tyre fitting',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: true,
    content: `## Mobile Tyre Fitting in Aberdeen — Fast, Professional, Scotland-Wide

Aberdeen is Scotland's third-largest city and one of our major service hubs in the north-east. Whether you have a flat tyre on the A90, a slow puncture in Westhill, or a blowout on the A96 out of the city, Tyre Rescue dispatches a mobile fitter to your exact location — 24 hours a day, 7 days a week.

**Quick answer:** Call 0141 266 0690. A fitter reaches most Aberdeen city centre locations within 90 minutes. Fitting starts from £20 per tyre (plus tyre cost) with no Aberdeen surcharge.

## Response Times Across Aberdeen

Aberdeen's road network — the A90 dual carriageway, the Western Peripheral Route (AWPR), and the city's busy harbour approach roads — affects arrival times. Here's what to expect:

| Area | Postcode | Avg Response |
|------|----------|-------------|
| City Centre / Union Street | AB10–AB11 | 90 min |
| West End / Rubislaw | AB15 | 90 min |
| Bridge of Don / Danestone | AB22–AB23 | 95 min |
| Dyce / Airport area | AB21 | 95 min |
| Westhill (Aberdeenshire) | AB32 | 100 min |
| Stonehaven | AB39 | 110 min |
| Inverurie | AB51 | 110 min |
| Banchory | AB31 | 115 min |
| Peterhead | AB42 | 130 min |
| Fraserburgh | AB43 | 140 min |

Response times may vary during the morning and evening rush hours on the A90 and AWPR.

## Areas We Cover in Aberdeen and Aberdeenshire

We cover all AB postcodes including:

- **AB10–AB16:** City centre, Old Aberdeen, Woodside, Midstocket, Cults, Mannofield, Garthdee
- **AB21–AB23:** Dyce, Bridge of Don, Danestone, Tillydrone
- **AB24–AB25:** Seaton, King Street, Pittodrie area, Rosemount
- **AB31–AB35:** Banchory, Aboyne, Ballater, Braemar (Royal Deeside)
- **AB39:** Stonehaven and Mearns coast
- **AB41:** Ellon and surroundings
- **AB42–AB45:** Peterhead, Fraserburgh, Macduff, Banff
- **AB51–AB56:** Inverurie, Huntly, Keith, Elgin corridor

We also cover the Aberdeenshire towns of Westhill (AB32), Portlethen (AB12), and Kintore (AB51).

## How Much Does Mobile Tyre Fitting Cost in Aberdeen?

Our Aberdeen pricing is the same as Glasgow — no surcharge for the AB postcode.

| Service | Price |
|---------|-------|
| Scheduled tyre fitting (fitting fee) | £20 per tyre |
| Emergency callout fee | £49 |
| Puncture repair | £25 |
| Budget tyre (e.g. 205/55 R16) | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

All prices include professional fitting, tyre pressure set to manufacturer spec, wheel torque to correct specification, and old tyre disposal.

## Common Aberdeen Tyre Emergency Locations

Our Aberdeen fitters attend call-outs regularly at:

- **A90 / AWPR junction areas** — Aberdeen's new bypass generates significant HGV traffic and road debris
- **Harbour and industrial areas** — nails and screws from construction and port traffic are the most common puncture cause in AB11
- **Union Street and Broad Street** — city centre cobbles and utility covers cause sidewall scuffs and slow punctures
- **Dyce industrial estate (AB21)** — oil industry vehicle traffic means commercial van callouts are frequent
- **A96 Inverurie road** — high-speed commuter route with regular debris damage
- **A93 Royal Deeside** — scenic but narrow road surfaces cause kerb strikes and debris punctures

## Aberdeen-Specific Tyre Advice

Aberdeen's road conditions create specific tyre problems:

**Granite setts:** Union Street and many city-centre side streets use granite paving. These create vibration that can loosen TPMS sensors and cause unusual wear patterns.

**North Sea weather:** Aberdeen is exposed to some of Scotland's harshest coastal weather. Salt air accelerates rubber degradation on older tyres. If your vehicle is frequently parked near the harbour, check sidewall condition regularly.

**AWPR (Aberdeen Western Peripheral Route):** This new dual carriageway has dramatically changed traffic patterns. High-speed sections mean tyre damage from road debris happens faster — a piece of metal at 70mph causes more damage than at 30mph.

**Oil industry vehicles:** Dyce and the Altens industrial estates see heavy commercial traffic. If you drive in these areas regularly, check your tyres for embedded debris monthly.

## How to Book in Aberdeen

**Emergency:** Call 0141 266 0690 — available 24/7. Give us your location (street, industrial estate, or nearest A road junction), vehicle details, and which tyre is affected.

**Scheduled fitting:** Book online at tyrerescue.uk/book. Choose your tyre size, pick a time slot, and we confirm a 2-hour arrival window. Advance booking recommended for Aberdeen to ensure stock is on the van.

## Frequently Asked Questions

### How long does it take to get a tyre fitter to Aberdeen from Glasgow?
Our fitters based in or near Aberdeen typically respond within 90 minutes for city centre locations. For outlying AB postcodes like Peterhead or Fraserburgh, response may be 2+ hours — we always give an accurate ETA when you call.

### Do you cover Royal Deeside?
Yes — Banchory (AB31), Aboyne, Ballater and even Braemar are in our coverage area. Response times for rural Deeside locations are typically 2–2.5 hours. For locations beyond Braemar, we recommend advance scheduling.

### Do you carry run-flat tyres for Aberdeen BMWs?
Yes. Aberdeen has a high proportion of BMW and Land Rover vehicles (oil industry) — we carry common run-flat sizes and TPMS reset equipment on our vans.

### Can you come to Aberdeen harbour or an offshore base?
We cover landside addresses at or near the harbour. If you're on a vessel or offshore installation, you'll need to arrange transportation to a land address first.

### What if I'm on the AWPR with a flat tyre?
Pull onto the hard shoulder or the next emergency refuge and call 0141 266 0690. The AWPR is one of our most frequent emergency call-out routes. Give us the nearest junction number or mile marker.`,
  },
  {
    slug: 'mobile-tyre-fitting-inverness-highlands',
    title: 'Mobile Tyre Fitting in Inverness & the Highlands: What to Expect',
    description:
      'Mobile tyre fitting in Inverness, the Scottish Highlands and beyond. Response times, IV postcode coverage, Highland-specific advice and how to book. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 8,
    keywords: [
      'mobile tyre fitting inverness',
      'tyre fitting inverness',
      'emergency tyre fitting inverness',
      'mobile tyre highlands',
      'tyre fitter highlands scotland',
      'flat tyre highlands',
      'iv postcode tyre fitting',
      'mobile tyre fitting highland',
    ],
    relatedSlugs: [
      'what-to-do-flat-tyre-motorway',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: true,
    content: `## Mobile Tyre Fitting in Inverness and the Scottish Highlands

Inverness is the capital of the Highlands and our northernmost major service hub. From the city itself to the Great Glen, the Black Isle, and the shores of Loch Ness, Tyre Rescue covers the Highlands with professional mobile tyre fitting — available 24 hours a day.

**Quick answer:** Call 0141 266 0690. Inverness city centre locations typically reached within 90–120 minutes. For remote Highland locations, advance booking is recommended. No extra charge for IV postcodes.

## Response Times Across Inverness and the Highlands

The Highlands have long distances and some single-track roads. We're honest about response times for remote areas:

| Area | Postcode | Avg Response |
|------|----------|-------------|
| Inverness City Centre | IV1–IV2 | 90 min |
| Inverness Crown / Dalneigh | IV2–IV3 | 95 min |
| Culloden / Balloch | IV2 | 95 min |
| Beauly / Muir of Ord | IV4–IV6 | 105 min |
| Dingwall | IV15 | 110 min |
| Nairn | IV12 | 100 min |
| Forres | IV36 | 105 min |
| Aviemore / Cairngorms | PH22 | 110 min |
| Drumnadrochit (Loch Ness) | IV63 | 115 min |
| Fort Augustus | PH32 | 130 min |
| Grantown-on-Spey | PH26 | 120 min |
| Thurso | KW14 | 3+ hours |

For very remote locations such as Thurso, Wick, Cape Wrath or the far north-west, we recommend booking in advance (minimum 24 hours notice).

## Areas We Cover in the Highlands

### Inverness City and Suburbs (IV1–IV3)
Full coverage across the city including: Crown, Dalneigh, Merkinch, Raigmore, Kinmylies, Lochardil, Drakies, Culloden, Westhill, Balloch, Milton of Leys.

### Black Isle and Easter Ross (IV6–IV18)
Muir of Ord, Beauly, Strathpeffer, Dingwall, Invergordon, Alness, Tain, Fearn.

### Speyside and Cairngorms (PH21–PH26)
Aviemore, Kingussie, Newtonmore, Grantown-on-Spey, Carrbridge, Boat of Garten, Nethy Bridge.

### Great Glen and Loch Ness (IV63, PH34–PH35)
Drumnadrochit, Lewiston, Fort Augustus, Invermoriston.

### Nairn and Moray Coast (IV12, IV36)
Nairn, Forres, Findhorn, Kinloss.

### Sutherland and Caithness (IV27–IV28, KW14)
Bonar Bridge, Golspie, Brora, Helmsdale, Wick and Thurso — advance booking required.

## How Much Does Mobile Tyre Fitting Cost in Inverness?

| Service | Price |
|---------|-------|
| Scheduled tyre fitting (fitting fee) | £20 per tyre |
| Emergency callout fee | £49 |
| Puncture repair | £25 |
| Budget tyre (e.g. 205/55 R16) | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

No additional charge applies for Inverness or Highland postcodes. For extremely remote locations (more than 30 miles from Inverness), a travel surcharge may apply — we'll always confirm the total price before sending a fitter.

## Highland-Specific Tyre Hazards

Driving in the Highlands presents unique tyre challenges:

**Single-track roads:** The A832, A835, B roads through Torridon, Ardnamurchan, and Wester Ross are narrow with rough edges. Kerb strikes and shoulder drop-offs are a common cause of sidewall damage.

**Highland road surfaces:** Many rural Highland roads have surfaces that wouldn't be out of place in a developing country — particularly after winter. Potholes, loose chippings, and frost heaves all increase tyre puncture risk.

**NC500 (North Coast 500):** This popular tourist route passes through some of the most remote road surfaces in the UK. Visitors in rental cars and campervans frequently experience tyre problems on the route. If you're driving the NC500, we recommend:
- Checking all four tyres before setting off
- Carrying a can of tyre sealant as a temporary backup in the most remote sections
- Having our number saved: 0141 266 0690

**Red deer and livestock:** Highland roads see regular deer and sheep collisions, especially at dawn and dusk. Post-collision tyre and wheel inspections are advisable.

**Winter driving:** The A9 through the Cairngorms, the A82 through the Great Glen, and many B roads can be treacherous in winter. Consider winter tyres if you drive in the Highlands regularly between November and March.

## Driving the NC500? Essential Tyre Prep

The North Coast 500 is spectacular but remote. Some sections of the route are 30+ miles from the nearest petrol station, let alone a tyre fitter. Before setting off:

1. **Check all four tyres** — tread depth minimum 3mm recommended for Highland driving
2. **Check spare wheel** — some modern cars don't have one; check for run-flat tyres or inflator kit
3. **Save our number:** 0141 266 0690 — available 24/7 for NC500 emergencies
4. **Consider your route** — some of the most remote sections (Durness to Thurso) have very limited mobile signal

We have dispatched fitters to NC500 emergencies on the A838 near Durness, the A894 in Assynt, and the A835 through Ullapool. Call us — we'll do our best to get to you wherever you are.

## How to Book in Inverness

**Emergency:** Call 0141 266 0690 — 24/7. Tell us your exact location (postcode, road name, or nearest landmark), vehicle details, and which tyre is affected. For remote Highland locations, a GPS pin is very helpful.

**Scheduled fitting:** Book at tyrerescue.uk/book. For Inverness and nearby areas, same-day booking is often possible. For locations beyond 30 miles from Inverness, please book at least 24 hours in advance to ensure stock availability.

## Frequently Asked Questions

### How do I get a tyre fitted if I'm on a remote Highland road?
Call 0141 266 0690 immediately. Pull safely off the road, turn on hazard lights, and tell us your exact location as precisely as possible — postcode, road number, nearest village, or what3words address. We'll dispatch the nearest available fitter and give you a realistic ETA.

### Do you cover Aviemore and the Cairngorm National Park?
Yes — Aviemore, Kingussie, Newtonmore, and the Cairngorm ski resort area are within our coverage. Response times from Inverness are typically 60–90 minutes.

### Can you fit winter tyres in Inverness?
Yes. We stock winter tyres for common sizes. Winter tyre fitting appointments are recommended for September–October before winter conditions arrive.

### What if my car breaks down on the A82 through Glencoe?
The A82 is one of our most scenic and most hazardous routes. Pull off the road as far as possible, turn on hazard lights, and call 0141 266 0690. The A82 has limited stopping places in some sections — stay with your vehicle and await assistance.

### Do you cover the Black Isle and Cromarty?
Yes — Muir of Ord, Fortrose, Rosemarkie, Cromarty, and the Cromarty ferry crossing area are in our coverage. Response time is approximately 105–115 minutes.`,
  },
  {
    slug: 'mobile-tyre-fitting-dundee-guide',
    title: 'Mobile Tyre Fitting in Dundee: Emergency & Scheduled Service',
    description:
      'Mobile tyre fitting in Dundee and Angus. Fast response across all DD postcodes — emergency and scheduled. Call 0141 266 0690 for Dundee tyre fitting 24/7.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    keywords: [
      'mobile tyre fitting dundee',
      'emergency tyre fitting dundee',
      'tyre fitter dundee',
      'flat tyre dundee',
      'tyre repair dundee',
      'dd postcode tyre fitting',
      'mobile tyre angus',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting in Dundee and Tayside

Dundee is Scotland's fourth-largest city and a key centre for our east Scotland operations. From the Waterfront and city centre to Broughty Ferry, Monifieth, and the Angus commuter belt, Tyre Rescue dispatches a mobile fitter to your exact location — 24 hours a day, 7 days a week.

**Quick answer:** Call 0141 266 0690. Most Dundee city locations reached within 60–75 minutes. Fitting from £20 per tyre plus tyre cost, no DD postcode surcharge.

## Response Times Across Dundee and Angus

| Area | Postcode | Avg Response |
|------|----------|-------------|
| City Centre / Overgate | DD1 | 65 min |
| West End / Ninewells | DD2 | 65 min |
| Lochee / Menzieshill | DD2 | 70 min |
| Stobswell / Craigie | DD3–DD4 | 65 min |
| Broughty Ferry | DD5 | 70 min |
| Monifieth | DD5 | 75 min |
| Arbroath | DD11 | 85 min |
| Forfar | DD8 | 90 min |
| Kirriemuir | DD8 | 95 min |

## Areas We Cover in Dundee

**DD1:** City centre, Dundee Waterfront, Dens Road, Hilltown, Stobswell
**DD2:** Broughty Road, West End, Ninewells, Lochee, Balgay, Menzieshill
**DD3:** Stobswell, Forfar Road corridor, Craigie, Beechwood
**DD4:** Douglas and Angus, Craigiebank, Fintry, Whitfield, Linlathen
**DD5:** Broughty Ferry, Monifieth, Barnhill, Balmossie
**DD11:** Arbroath and Carnoustie
**DD8:** Forfar and Kirriemuir

## Dundee Tyre Fitting Prices

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

No surcharge for Dundee or Angus postcodes.

## Common Dundee Tyre Hazards

**Kingsway dual carriageway:** Dundee's main arterial road carries high volumes of HGV traffic. Tyre debris is common, particularly near the Kingsway retail parks.

**Riverside Drive:** The A85 along the Tay waterfront is narrow in sections and prone to edge damage where the road surface meets the harbour infrastructure.

**Arbroath Road (A92):** The main Dundee–Arbroath corridor is one of the busiest roads in Angus and generates regular emergency callouts near the Claypotts junction.

**Discovery Quay and Waterfront:** The new Dundee Waterfront development has created complex road surfaces including granite setts similar to those in Edinburgh.

**Ninewells Hospital:** One of Scotland's largest hospitals creates 24-hour traffic. Emergency flat tyre callouts at hospital car parks are among our most common Dundee jobs.

## How to Book in Dundee

**Emergency:** Call 0141 266 0690 — 24/7. Tell us your location, vehicle registration, and which tyre is flat or damaged.

**Scheduled:** Book at tyrerescue.uk/book. Same-day slots often available for Dundee city locations.

## Frequently Asked Questions

### How quickly can you reach Dundee city centre?
Our average response time for Dundee DD1 is 65 minutes from dispatch. We dispatch via the A90 from our Central Belt base, or from available fitters already working in the Tayside area.

### Do you cover Arbroath and Forfar?
Yes — Arbroath (DD11) and Forfar (DD8) are in our coverage area. Response times are typically 85–95 minutes.

### Can you fit tyres at Ninewells Hospital car park?
Yes — we regularly assist patients and hospital staff at Ninewells. The large hospital car parks provide ideal safe working conditions for mobile fitting.

### Do you cover Carnoustie and the Angus coast?
Yes — Carnoustie, Monifieth and the Angus coastal towns as far as Arbroath are covered. Response from our nearest available fitter is typically 75–90 minutes.

### What about the V&A Dundee area?
Yes — the Waterfront, Slessor Gardens and the V&A car parks are easily accessible. Parking arrangements in the Waterfront area can be complex; tell us your exact position when booking.`,
  },
  {
    slug: 'mobile-tyre-fitting-ayr-ayrshire',
    title: 'Mobile Tyre Fitting in Ayr, Kilmarnock & Ayrshire: Fast Local Service',
    description:
      'Mobile tyre fitting across Ayrshire — Ayr, Kilmarnock, Irvine, Troon and all KA postcodes. Emergency and scheduled service, 24/7. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    keywords: [
      'mobile tyre fitting ayr',
      'tyre fitting ayrshire',
      'mobile tyre kilmarnock',
      'emergency tyre ayr',
      'tyre fitter ka postcode',
      'mobile tyre fitting irvine',
      'mobile tyre troon',
      'flat tyre ayrshire',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting Across Ayrshire

Ayrshire is one of our busiest service areas south of Glasgow. With quick M77 access from our Parkhead depot, we cover Kilmarnock, Ayr, Irvine, Troon, Prestwick and all KA postcodes — typically within 40–55 minutes.

**Quick answer:** Call 0141 266 0690. Most Ayrshire locations are reached within 40–55 minutes. Prices are the same as Glasgow — no distance surcharge.

## Response Times Across Ayrshire

| Town | Postcode | Avg Response |
|------|----------|-------------|
| Kilmarnock | KA1–KA3 | 40 min |
| Irvine | KA11–KA12 | 45 min |
| Troon | KA10 | 50 min |
| Prestwick | KA9 | 50 min |
| Ayr Town Centre | KA7–KA8 | 55 min |
| Saltcoats / Ardrossan | KA21–KA22 | 50 min |
| Largs | KA30 | 60 min |
| Girvan | KA26 | 75 min |

## Areas Covered in Ayrshire

### Kilmarnock (KA1–KA3)
Kilmarnock town centre, Crosshouse, Hurlford, Galston, Darvel, Stewarton, Fenwick, Kilmaurs and all East Ayrshire towns.

### Irvine and North Ayrshire (KA11–KA13)
Irvine new town, Dreghorn, Bourtreehill, Springside, Beith, Dalry, Saltcoats (KA21), Ardrossan (KA22), Stevenston.

### Ayr and South Ayrshire (KA7–KA9)
Ayr town centre, Prestwick, Alloway, Annbank, Mossblown, Coylton, Dalmellington, Maybole.

### Troon and Coastal Towns (KA10, KA30)
Troon, Barassie, Largs, Fairlie, West Kilbride.

## Tyre Fitting Prices in Ayrshire

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

No surcharge for any Ayrshire postcode.

## Common Ayrshire Tyre Hazards

**A77 / M77 Corridor:** The main Glasgow–Ayr road is heavily used by both commuters and tourists heading to the Ayrshire coast. Tyre debris from HGV traffic is a common cause of emergency callouts near the Kilmarnock interchange.

**Burns Memorial routes:** The A71, A78 and coastal A routes see high tourist traffic in summer. Rental car callouts near Alloway, Culzean Castle and the Ayrshire golf courses (Troon, Turnberry, Prestwick) are frequent.

**Ayr Racecourse approaches:** Race days at Ayr generate exceptional traffic volumes on the A77 and A719. Tyre damage from car park debris and congestion incidents is common.

**Irvine Beach Park:** The A78 coastal route and Irvine beach approaches suffer from salt air corrosion on older vehicles' TPMS sensors.

**Mining heritage roads:** East Ayrshire's former mining communities — Dalmellington, New Cumnock, Muirkirk — have rural road surfaces that can be rough. Regular tyre checks are advisable for drivers in these areas.

## Golf Courses — Ayrshire Coverage

Ayrshire is home to some of the world's finest golf courses, and we regularly assist visiting golfers and club members:

- **Royal Troon** (KA10) — average response 50 minutes
- **Turnberry / Trump Turnberry** (KA26) — average response 75 minutes
- **Prestwick Golf Club** (KA9) — average response 50 minutes
- **Western Gailes** (KA11) — average response 48 minutes

If you're at a golf club with a flat tyre, we can usually meet you at the club car park while you continue your round.

## Frequently Asked Questions

### How quickly can you get to Ayr from Glasgow?
Most Ayr locations are reached in 55 minutes via the M77 and A77. Our fastest Ayr response times are to Prestwick and Ayr town centre.

### Do you cover Girvan and south Ayrshire?
Yes — Girvan (KA26) is in our coverage area at approximately 75 minutes. For Ballantrae and south of Girvan, response may be longer. Call us for a realistic ETA.

### Can you come to Ayr Racecourse?
Yes — race day callouts at Ayr are among our regular Ayrshire jobs. The racecourse car parks are large and flat — ideal for mobile tyre fitting.

### Do you cover the ferry port at Ardrossan?
Yes — Ardrossan Harbour and the surrounding KA22 postcode are covered. If you have a flat tyre before or after the Arran ferry, call us at 0141 266 0690.

### What about Largs and the Clyde Coast?
Largs (KA30) and the entire North Ayrshire Clyde coast from Fairlie to Saltcoats are in our coverage. Response times are typically 55–65 minutes from Glasgow.`,
  },
  {
    slug: 'mobile-tyre-fitting-perth-perthshire',
    title: 'Mobile Tyre Fitting in Perth & Perthshire: Local & Rural Coverage',
    description:
      'Mobile tyre fitting in Perth, Pitlochry, Crieff and across Perthshire. Emergency and scheduled service for PH postcodes. Call 0141 266 0690, 24/7.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    keywords: [
      'mobile tyre fitting perth',
      'tyre fitting perthshire',
      'emergency tyre perth scotland',
      'mobile tyre pitlochry',
      'tyre fitter ph postcode',
      'flat tyre perth scotland',
      'mobile tyre crieff',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-inverness-highlands',
      'tyre-fitting-costs-scotland-pricing-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting in Perth and Perthshire

Perth is the gateway to the Scottish Highlands, and Tyre Rescue serves the city and the wide county of Perthshire — from the M90 to Pitlochry, from Crieff to the outskirts of the Cairngorms. Whether you're on the A9 northbound, exploring Loch Lomond and The Trossachs, or driving through Strathtay, our mobile fitters reach you with professional tyres and equipment.

**Quick answer:** Call 0141 266 0690. Perth city centre typically reached within 70 minutes. Pitlochry and mid-Perthshire within 100–120 minutes.

## Response Times Across Perthshire

| Area | Postcode | Avg Response |
|------|----------|-------------|
| Perth City Centre | PH1–PH2 | 70 min |
| Scone / Bridgend | PH2 | 72 min |
| Kinnoull / Cherrybank | PH2 | 72 min |
| Crieff | PH7 | 85 min |
| Auchterarder | PH3 | 80 min |
| Dunkeld | PH8 | 90 min |
| Pitlochry | PH16 | 105 min |
| Aberfeldy | PH15 | 110 min |
| Kenmore / Loch Tay | PH15 | 115 min |
| Killin | FK21 | 95 min |
| Blairgowrie | PH10 | 85 min |
| Coupar Angus | PH13 | 80 min |

## Areas We Cover in Perthshire

### Perth City (PH1–PH2)
Full coverage across Tulloch, Letham, Kinnoull, Cherrybank, Scone, Bridgend, Huntingtower, Almondbank, Luncarty.

### Strathearn (PH3, PH7)
Auchterarder, Crieff, Comrie, St Fillans, Muthill, Braco.

### Strathmore (PH10, PH13)
Blairgowrie, Rattray, Coupar Angus, Meigle, Alyth.

### Highland Perthshire (PH15–PH16)
Pitlochry, Aberfeldy, Kenmore, Killin, Fortingall — advance booking recommended for remote locations.

### Trossachs Edge (FK21)
Killin, Lix Toll, Lochearnhead — we're among the only mobile tyre services covering these remote areas.

## Tyre Fitting Prices in Perth and Perthshire

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

No surcharge for Perth or central Perthshire postcodes. A travel supplement may apply for the most remote Highland Perthshire locations — always confirmed before dispatch.

## Perthshire-Specific Tyre Hazards

**A9 Perthshire section:** The A9 between Perth and Inverness is one of Scotland's most notorious roads for tyre incidents. HGV traffic deposits debris regularly, and the high-speed sections mean damage happens quickly. New average speed cameras have changed driving patterns — but tyre incidents remain frequent.

**Glenshee ski road (A93):** The route to the Glenshee ski centre climbs to nearly 700m. Winter driving on this road can result in sidewall damage from roadside ice ridges and pothole impacts from frost heave.

**Single-track roads in Highland Perthshire:** The road to Kenmore around Loch Tay, the B846 to Tummel Bridge, and many other scenic routes are narrow with rough edges. Kerb strike and shoulder drop damage are common.

**Auchterarder and Gleneagles approach:** The local roads around Gleneagles Hotel carry luxury vehicles from around the world. We provide a discreet, professional service for golfers and hotel guests.

## Gleneagles and Golf — Perth Coverage

Perthshire is home to Gleneagles, one of the world's finest golf and resort destinations:

- **Gleneagles Hotel and Golf Courses** (PH3) — average response 80 minutes
- **Blairgowrie Golf Club** (PH10) — average response 85 minutes
- **Dunkeld & Birnam Golf Club** (PH8) — average response 90 minutes

## How to Book in Perth

**Emergency:** Call 0141 266 0690 — 24/7. Tell us your location, vehicle, and which tyre needs attention.

**Scheduled:** Book at tyrerescue.uk/book. Same-day appointments often available for Perth city. For Highland Perthshire, 24 hours' advance notice is preferred.

## Frequently Asked Questions

### How long does it take to reach Perth from Glasgow?
Perth city centre is typically 70 minutes from our Glasgow depot via the M9/M90. In peak traffic (particularly on the M90 south of Perth), allow 90 minutes.

### Do you cover Gleneagles Hotel?
Yes — Gleneagles and the surrounding PH3 area are in our regular coverage. We provide a professional, discreet service appropriate for the setting.

### Can you reach Pitlochry on the same day?
Usually yes for Pitlochry (PH16) — response time is approximately 105 minutes. For locations beyond Pitlochry (Blair Atholl, Killiecrankie, Calvine), please allow additional time or book in advance.

### What about the route to Glenshee ski centre?
The A93 Glenshee road is in our coverage area. In winter, please be aware that road conditions may affect our fitters' travel time and ability to work safely at altitude. We'll always give you a realistic assessment when you call.`,
  },
  {
    slug: 'mobile-tyre-fitting-stirling-falkirk',
    title: 'Mobile Tyre Fitting in Stirling & Falkirk: Central Scotland Service',
    description:
      'Mobile tyre fitting in Stirling, Falkirk, Alloa and across Central Scotland. Fast emergency response — 35 to 50 minutes. Call 0141 266 0690, available 24/7.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    keywords: [
      'mobile tyre fitting stirling',
      'tyre fitting falkirk',
      'emergency tyre stirling',
      'mobile tyre fk postcode',
      'tyre fitter central scotland',
      'flat tyre stirling',
      'mobile tyre alloa',
    ],
    relatedSlugs: [
      'emergency-tyre-fitting-glasgow-complete-guide',
      'mobile-tyre-fitting-edinburgh-guide',
    ],
    featured: false,
    content: `## Mobile Tyre Fitting in Stirling and Falkirk

Stirling and Falkirk sit at the heart of Scotland's motorway network — the M9, M80, M876 and A9 all meet near Stirling, making it one of our fastest dispatch points in Central Scotland. Whether you're on the M80 near Bonnybridge, driving through Stirling's historic centre, or stuck on the Kincardine Bridge road, we reach you quickly.

**Quick answer:** Call 0141 266 0690. Falkirk is typically 35 minutes from our base. Stirling city centre 40–45 minutes. Alloa 50 minutes. No surcharge for FK or Central Scotland postcodes.

## Response Times Across Central Scotland

| Area | Postcode | Avg Response |
|------|----------|-------------|
| Falkirk Town Centre | FK1–FK2 | 35 min |
| Grangemouth | FK3 | 35 min |
| Bo'ness | FK4 | 40 min |
| Stenhousemuir / Larbert | FK5 | 35 min |
| Denny | FK6 | 38 min |
| Stirling City Centre | FK7–FK8 | 42 min |
| Bridge of Allan | FK9 | 45 min |
| Alloa | FK10 | 50 min |
| Tillicoultry / Clackmannan | FK13–FK14 | 52 min |
| Callander | FK17 | 65 min |
| Trossachs | FK17–FK21 | 75 min |

## Areas Covered

### Falkirk District (FK1–FK6)
Falkirk town centre, Grangemouth, Bo'ness, Stenhousemuir, Larbert, Bonnybridge, Denny, Dunipace, Carronshore, Bainsford, Grahamston.

### Stirling City and Surroundings (FK7–FK9)
Stirling castle area, St Ninians, Bannockburn, Cambusbarron, Bridge of Allan, Dunblane, Kippen, Gartmore.

### Clackmannanshire (FK10–FK14)
Alloa, Tillicoultry, Dollar, Menstrie, Sauchie, Clackmannan, Tullibody.

### Trossachs and Loch Lomond Edge (FK17–FK21)
Callander, Aberfoyle, Strathyre, Lochearnhead, Killin. These locations are in a beautiful but more remote area — response times are longer.

## Tyre Fitting Prices

| Service | Price |
|---------|-------|
| Fitting fee (per tyre) | £20 |
| Emergency callout | £49 |
| Puncture repair | £25 |
| Budget tyre | From £45 |
| Mid-range tyre | From £65 |
| Premium tyre | From £90 |

## Central Scotland Motorway Coverage

This area has Scotland's densest motorway network outside Glasgow. We cover emergency callouts on:

| Road | Route | Coverage |
|------|-------|----------|
| M9 | Dunblane–Edinburgh | Full |
| M80 | Glasgow–Stirling | Full |
| M876 | Kincardine–Falkirk | Full |
| A9 | Stirling–Perth | Full to Perth |
| A80 | Glasgow–Stirling (non-motorway) | Full |
| A811 | Stirling–Dumbarton | Full |

**Grangemouth Refinery:** The industrial area around Grangemouth Petrochemical Complex generates significant HGV and tanker traffic. Debris punctures on the A904 and Grangemouth road network are common — and we cover them all.

**Kincardine Bridge:** The crossing between Kincardine (FK10) and Falkirk/Grangemouth is a pinch point where tyre damage from road joints and debris is frequent.

## Frequently Asked Questions

### How quickly can you reach Falkirk?
Falkirk town centre is typically 35 minutes from our Glasgow base via the M80. Grangemouth is similar — 35 minutes.

### Do you cover the Falkirk Wheel?
Yes — the Falkirk Wheel and the Helix (with the Kelpies) are popular visitor destinations. Tyre incidents in the car parks and approach roads are covered. Tell us your exact parking location when calling.

### Can you reach Stirling Castle area?
Yes — Stirling historic centre and the castle esplanade car parks are covered. The old town area has some narrow streets; our fitters know how to navigate to you efficiently.

### Do you cover Callander and the Trossachs?
Yes — Callander (FK17) is in our coverage at approximately 65 minutes. For locations deeper in the Trossachs (Brig o'Turk, Glen Finglas), call us and we'll advise on realistic response times.

### What about Dunblane?
Dunblane (FK15) is 45 minutes from our base — we cover the town and surrounding areas. The A9 Dunblane junction is one of our most frequent Central Scotland emergency locations.`,
  },
];

export function getArticle(slug: string): BlogArticle | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getRelatedArticles(article: BlogArticle): BlogArticle[] {
  return article.relatedSlugs
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter((a): a is BlogArticle => a !== undefined);
}

export function getArticlesByCategory(category: BlogArticle['category']): BlogArticle[] {
  return articles.filter((a) => a.category === category);
}

export function getFeaturedArticles(): BlogArticle[] {
  return articles.filter((a) => a.featured);
}
