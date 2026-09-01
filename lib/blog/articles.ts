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
    lastModified: '2026-09-01',
    readingTime: 14,
    keywords: [
      'best mobile tyre fitting scotland',
      'mobile tyre fitting near me',
      'mobile tyre fitter glasgow',
      'mobile tyre fitting edinburgh',
      'cheapest mobile tyre fitting',
      'tyre fitting comparison',
      'mobile tyre fitting reviews',
      'tyres on the drive alternative',
      'black circles alternative scotland',
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

### Arnold Clark Tyres
- **Coverage:** Multiple Scottish branches — must drive to a centre
- **Hours:** Standard business hours
- **Response Time:** Appointment-based
- **Starting Price:** Competitive in-branch
- **Best For:** Customers already at an Arnold Clark dealership

Arnold Clark is Scotland's largest car dealer and also offers tyre services at many branches. For mobile fitting or emergencies, you would need to use a specialist mobile provider like Tyre Rescue.

### Protyre
- **Coverage:** UK-wide, limited Scottish branches
- **Hours:** Business hours
- **Response Time:** Appointment-based
- **Trustpilot:** 4.2/5 stars
- **Best For:** Planned tyre replacements at a nearby centre

Protyre operates autocare centres across the UK with some Scottish locations. Good for planned work if you're near a centre; not suitable for emergencies.

### Tyres on the Drive
- **Coverage:** England-focused; limited Scottish coverage
- **Hours:** Daytime and some evenings
- **Response Time:** Pre-booked only (24–72 hours notice typical)
- **Starting Price:** From £70 including fitting
- **Trustpilot:** 4.5/5 stars
- **Best For:** Planned tyre replacements at home or work (England)

Tyres on the Drive is a mobile tyre fitting service that sends a fitter to your home or workplace. Their service is well-regarded in England, but Scottish coverage is limited. They do not offer emergency 24/7 callout — all bookings are pre-arranged. For planned fitting in Scotland, they may not have a local fitter available. For emergency or same-day service anywhere in Scotland, a Scotland-specific provider like Tyre Rescue is the better choice.

[Full comparison: Tyre Rescue vs Tyres on the Drive](/compare/tyre-rescue-vs-tyres-on-the-drive)

### Black Circles
- **Coverage:** UK-wide (online platform)
- **Hours:** Garage partners — business hours
- **Response Time:** Appointment-based (book online, attend garage)
- **Starting Price:** From £25 fitting fee
- **Trustpilot:** 4.5/5 stars
- **Best For:** Buying tyres online at competitive prices; price-conscious drivers with time to plan

Black Circles is an online tyre marketplace — you buy the tyre at a competitive price, then book a fitting appointment at a local partner garage. It is not a mobile service: you drive to the garage. This makes it unsuitable for emergencies or if your tyre is flat. Black Circles is a strong choice if you have time to plan, want to compare tyre prices, and can drive to a garage. For emergencies, 24/7 callout, or mobile fitting at your location, Tyre Rescue is the right call.

[Full comparison: Tyre Rescue vs Black Circles](/compare/tyre-rescue-vs-black-circles)

## Comparison Summary

| Feature | Tyre Rescue | Kwik Fit | Tyres on the Drive | Black Circles | Arnold Clark |
|---------|------------|----------|--------------------|---------------|--------------|
| 24/7 Service | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mobile-First | ✅ | ❌ | ✅ | ❌ | ❌ |
| Scotland-Wide | ✅ | Nationwide | Limited | UK partner garages | Scottish branches |
| Emergency Callout | ✅ | ❌ | ❌ | ❌ | ❌ |
| Avg Response | 45 min | N/A | 24–72 hrs | Next day+ | Appointment |
| GPS Tracking | ✅ | ❌ | ❌ | ❌ | ❌ |
| Trustpilot | 4.8★ | 3.7★ | 4.5★ | 4.5★ | Varies |
| From Price | £49 callout | £45 | £70 all-in | £25 fit only | In-branch |

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

*All prices include fitting. VAT is not added separately. Prices are estimates for Scotland.*

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
We cover the airport approach roads and the rental car areas. If you're at the terminal building, give us your precise location and we'll advise on the best meeting point.

## Book Mobile Tyre Fitting in Edinburgh

Visit our [Edinburgh mobile tyre fitting](/mobile-tyre-fitting/edinburgh) page for EH postcode coverage and local booking, or call **0141 266 0690** for immediate emergency service.`,
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
Pull onto the hard shoulder or the next emergency refuge and call 0141 266 0690. The AWPR is one of our most frequent emergency call-out routes. Give us the nearest junction number or mile marker.

## Book Mobile Tyre Fitting in Aberdeen

Ready to book? Visit our [Aberdeen mobile tyre fitting](/mobile-tyre-fitting/aberdeen) page for local pricing, area coverage and same-day booking, or call **0141 266 0690** for immediate emergency service.`,
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
Yes — Muir of Ord, Fortrose, Rosemarkie, Cromarty, and the Cromarty ferry crossing area are in our coverage. Response time is approximately 105–115 minutes.

## Book Mobile Tyre Fitting in Inverness

Visit our [Inverness mobile tyre fitting](/mobile-tyre-fitting/inverness) page for local response times, Highland coverage details and advance booking, or call **0141 266 0690** for immediate emergency assistance.`,
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
Yes — the Waterfront, Slessor Gardens and the V&A car parks are easily accessible. Parking arrangements in the Waterfront area can be complex; tell us your exact position when booking.

## Book Mobile Tyre Fitting in Dundee

Visit our [Dundee mobile tyre fitting](/mobile-tyre-fitting/dundee) page for local pricing, DD postcode coverage and same-day booking, or call **0141 266 0690** for immediate help.`,
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
  {
    slug: '24-hour-emergency-tyre-fitting-scotland',
    title: '24-Hour Emergency Tyre Fitting in Scotland: What to Expect & How to Book',
    description: 'Emergency tyre fitting available 24 hours a day across all of Scotland. Average 45-minute response in Glasgow and Edinburgh. Call 0141 266 0690 anytime — day or night.',
    category: 'emergency',
    publishDate: '2025-08-01',
    lastModified: '2025-08-01',
    readingTime: 7,
    featured: true,
    relatedSlugs: ['emergency-tyre-fitting-glasgow-complete-guide', 'what-to-do-flat-tyre-motorway', 'mobile-tyre-fitting-aberdeen-guide'],
    keywords: ['24 hour tyre fitting scotland', 'emergency tyre fitting near me', 'mobile tyre fitting 24 7', 'emergency tyre change scotland', '24 hour puncture repair', 'night time tyre fitting', 'out of hours tyre service'],
    content: `# 24-Hour Emergency Tyre Fitting in Scotland: What to Expect

Getting a flat tyre is stressful enough. Getting one at 3am on the M8, or on a dark Highland road, adds another layer of anxiety. The good news: Tyre Rescue operates a genuine 24/7 emergency mobile tyre fitting service across all of Scotland — no after-hours surcharge, no answerphone, just a real fitter dispatched to your location.

**Quick answer:** Call **0141 266 0690**. We answer 24 hours a day, 7 days a week, 365 days a year. Give your location, tyre size (or vehicle registration), and we'll dispatch a fitter immediately.

## What Does "24-Hour Tyre Fitting" Actually Mean?

Many companies advertise "24-hour service" but rely on a callback system, an answerphone, or a third-party call centre. With Tyre Rescue, 24-hour means:

- **Live call answering** — a real person picks up, not a machine
- **Immediate dispatch** — your fitter is sent while you're still on the phone
- **Same pricing** — no emergency or out-of-hours surcharge (unlike some competitors who charge 50–100% more after 10pm)
- **Fully stocked vans** — our vans carry a comprehensive range of tyre sizes so we rarely need to order in

## Response Times Across Scotland

Response times vary by location. Here are realistic averages at different times of day:

| Location | Peak hours (7am–9am, 4pm–7pm) | Off-peak / night |
|---|---|---|
| Glasgow city centre | 40–55 min | 35–45 min |
| Edinburgh city centre | 45–60 min | 40–50 min |
| Dundee | 55–70 min | 50–65 min |
| Perth | 60–75 min | 55–70 min |
| Stirling | 40–55 min | 35–45 min |
| Aberdeen | 85–110 min | 75–95 min |
| Inverness | 90–120 min | 90–110 min |
| Fort William | 100–130 min | 95–120 min |
| Isle of Skye | 120–180 min | 120–180 min |

*Night-time response is often faster than peak hours because there is less traffic. A 3am callout in Glasgow often reaches you in 35–40 minutes.*

## What Happens When You Call

1. **Call 0141 266 0690** — lines open 24/7/365
2. Give your **exact location** — a postcode, Google Maps share, or a road number and direction
3. Give your **vehicle registration** — we'll look up the tyre size (or you can read it from the sidewall: e.g. 205/55R16)
4. We **confirm availability** and give you an accurate ETA
5. The nearest fitter is **dispatched immediately**
6. You'll receive a **text with the fitter's name and a live tracking link** (where available)
7. The fitter arrives, confirms the job, fits the tyre, and you pay by card or Apple/Google Pay at the van

## What Does 24-Hour Emergency Tyre Fitting Cost?

Pricing is the same day or night:

- **Standard callout fee:** £49 (covers the visit; tyre cost is additional)
- **Tyre cost:** from £55 (budget) to £200+ (premium) depending on size and brand
- **Puncture repair:** from £35 (if the tyre can be repaired — many punctures can be)
- **TPMS sensor reset:** included when fitting
- **Wheel balancing:** included in the fitting price

*No hidden out-of-hours charges. No fuel surcharge. What we quote is what you pay.*

## Do You Cover My Location?

We cover all of Scotland, including:

- All Greater Glasgow postcodes (G1–G78)
- Edinburgh and the Lothians (EH postcodes)
- Dundee and Tayside (DD postcodes)
- Aberdeen and Aberdeenshire (AB postcodes)
- Inverness and the Highlands (IV, PH, KW postcodes)
- Fife (KY postcodes)
- Ayrshire (KA postcodes)
- Scottish Borders (TD, DG postcodes)
- Western Isles, Orkney, Shetland (HS, KW, ZE postcodes — advance booking recommended)

For very remote locations, we'll always tell you honestly whether we can reach you and what the realistic ETA is. We never take a booking we can't fulfil.

## Common Scenarios We Handle at Night

**Motorway breakdown:** If you're on the M8, M74, M77, M80, M9 or A9, call us immediately. Use your hazard lights and move to the hard shoulder if possible. We carry full safety equipment including traffic warning cones.

**Driveway or car park:** A flat discovered in the morning before work is one of the most common callouts. We'll come to your home or workplace — even at 6am.

**Airport flat tyre:** Glasgow Airport (PA3) and Edinburgh Airport (EH12) are two of our most frequent after-hours locations. Business travellers returning from late flights often find a flat tyre waiting for them.

**Festival and event venues:** T in the Park (historically), TRNSMT, Edinburgh Fringe — we cover major venues and respond even during late-night crowd dispersal periods.

**Holiday cottage / Airbnb:** Stranded in a rural cottage in Perthshire or Argyll? We'll come to you. Give the exact postcode of the property.

## Tips for a Faster Callout

1. **Share your location via Google Maps** — open Maps, tap your location dot, tap "Share," and send us the link via WhatsApp (0141 266 0690)
2. **Note your tyre size** — it's on the sidewall of your current tyre and in your owner's manual
3. **Stay with your vehicle** if it's safe to do so — but move well away from traffic if you're on a motorway or A-road
4. **Switch on your hazard lights** and if you have a warning triangle, place it 45 metres behind the car
5. **Check your locking wheel nut key** is accessible — tell us if you don't have one and we can advise

## Frequently Asked Questions

### Is there an extra charge for night-time callouts?
No. We charge the same price whether you call at noon or 3am. The £49 callout fee and tyre prices are fixed regardless of time of day or day of week.

### How do I pay?
By card (Visa, Mastercard, AmEx) or contactless / Apple Pay / Google Pay at the van. We do not accept cash. A receipt is emailed automatically.

### What if you don't carry my tyre size?
Our vans carry hundreds of tyre sizes. The vast majority of cars have common sizes (195/65R15, 205/55R16, 225/45R17 etc.) which we always carry. For unusual sizes — very large SUV tyres, run-flats, or specialist performance fitments — we'll advise honestly when you call.

### Do you replace run-flat tyres at night?
Yes, but run-flat tyres have more limited size availability. We recommend calling ahead so we can confirm stock before dispatching.

### Can you come to a multi-storey car park?
Yes — we regularly attend indoor car parks. Height clearance is sometimes an issue for our larger vans. Just tell us the location and floor when you call.

## Book 24-Hour Emergency Tyre Fitting Now

Call **0141 266 0690** — we answer 24 hours a day, every day of the year. For non-urgent bookings, you can also book online at [tyrerescue.uk/book](/book).

Covering all of Scotland — from Glasgow to Shetland.`,
  },
  {
    slug: 'winter-tyres-scotland-guide',
    title: 'Winter Tyres in Scotland: When to Fit, Best Brands & Where to Buy',
    description: 'Complete guide to winter tyres in Scotland. When to switch, best brands for Scottish conditions, cost comparison, and mobile winter tyre fitting across all of Scotland.',
    category: 'maintenance',
    publishDate: '2025-08-10',
    lastModified: '2025-08-10',
    readingTime: 9,
    featured: true,
    relatedSlugs: ['tyre-maintenance-checklist-scotland', 'mobile-tyre-fitting-inverness-highlands', 'mobile-tyre-fitting-aberdeen-guide'],
    keywords: ['winter tyres scotland', 'when to fit winter tyres scotland', 'best winter tyres scotland', 'winter tyre fitting scotland', 'do i need winter tyres scotland', 'winter tyres vs all season tyres scotland', 'winter tyre cost scotland'],
    content: `# Winter Tyres in Scotland: Complete 2025 Guide

Scotland has some of the most challenging driving conditions in the UK. The A9 through Drumochter Pass closes under heavy snow several times each winter. The roads around Inverness and Aberdeen can be treacherous from October onwards. Even in Glasgow and Edinburgh, black ice, heavy rain, and near-freezing temperatures make winter driving genuinely hazardous.

This guide answers the key questions Scottish drivers ask about winter tyres — when to switch, which tyres suit Scottish conditions, how much it costs, and how to get them fitted without driving to a garage in icy conditions.

## Do I Need Winter Tyres in Scotland?

The honest answer: **it depends where you drive**.

If you live in:
- **Glasgow, Edinburgh, or Dundee** — all-season tyres or high-quality summer tyres are often sufficient for city driving. You'll see snow on the roads occasionally, but gritting is generally effective.
- **Aberdeen, Inverness, Perth, or Stirling** — winter tyres are strongly recommended. These cities see significant snowfall and ice, often earlier than the Central Belt.
- **Highland, Aberdeenshire, or Perthshire (rural)** — winter tyres are practically essential. Roads may not be gritted for days after snowfall. Temperatures regularly drop below -10°C in Glen areas.
- **Working on the NC500 or driving remotely** — winter tyres and snow chains may both be advisable.

Even if you only drive in the city, winter tyres improve braking in the wet and cold. They're engineered for temperatures below 7°C — not just for snow.

## When to Fit Winter Tyres in Scotland

The standard rule: **fit when temperatures regularly fall below 7°C**. In Scotland, that means:

| Region | Fit winter tyres by | Remove winter tyres after |
|---|---|---|
| Highland, Aberdeenshire | Late September/early October | Late April |
| Edinburgh, Dundee | Late October | Late March/early April |
| Glasgow, Central Belt | November | March |

Don't wait for the first snowfall — winter tyres work on cold, wet roads too, not just snow.

## Winter Tyres vs All-Season Tyres: Which Is Right for Scotland?

**Winter tyres** offer the best cold-weather performance. They have more sipes (tiny grooves) in the tread, a softer rubber compound that remains flexible below 7°C, and a deeper tread depth designed to disperse water and grip snow.

**All-season tyres** (also called all-weather tyres) offer a middle ground. They're marked with the Three Peak Mountain Snowflake (3PMSF) symbol, meaning they meet minimum winter performance standards. They're a good option if you can't or don't want to store a second set of tyres.

**Summer tyres** should not be used for year-round driving in Scotland. Their rubber compound hardens in cold temperatures, significantly increasing stopping distances.

### Comparison for Scottish Conditions

| Tyre Type | Dry grip (warm) | Wet grip (cold) | Snow/ice | Storage needed |
|---|---|---|---|---|
| Summer | Excellent | Adequate | Poor | No |
| All-season | Good | Good | Adequate | No |
| Winter (seasonal) | Adequate | Excellent | Excellent | Yes (summer set) |

For most Scottish drivers, especially those in Aberdeen, Inverness or Highland areas, **dedicated winter tyres fitted on a second set of steel wheels** offer the best combination of performance and cost-effectiveness over several seasons.

## Best Winter Tyre Brands for Scotland

These brands consistently rank top in independent Scottish and UK winter tyre tests:

**Premium (best performance, highest cost):**
- **Michelin Pilot Alpin 5 / CrossClimate 2** — superb wet and snow grip, long-lasting
- **Continental WinterContact TS 870** — excellent braking on ice and snow
- **Bridgestone Blizzak LM005** — outstanding ice performance; popular in Nordic countries
- **Goodyear UltraGrip Performance+** — strong all-round winter performer

**Mid-range (good performance, lower cost):**
- **Hankook Winter i*cept RS3** — strong value, especially for smaller city cars
- **Falken Eurowinter HS02** — good snow grip, popular in Scotland
- **Nokian Wetproof / Snowproof** — Finnish brand; excellent for Scottish conditions

**Budget (adequate for urban Scotland):**
- **Tyfoon Wintersport** — acceptable for Central Belt cities
- **Barum Polaris 5** — entry-level winter option

*Tyre Rescue stocks a wide range of winter tyres across budget, mid-range and premium brands. Call 0141 266 0690 for a quote on your specific size.*

## How Much Do Winter Tyres Cost in Scotland?

Typical prices per tyre (supply and mobile fitting included):

| Size | Budget | Mid-range | Premium |
|---|---|---|---|
| 185/60R15 | £80–95 | £100–130 | £130–165 |
| 195/65R15 | £85–100 | £105–135 | £135–170 |
| 205/55R16 | £90–110 | £115–145 | £145–185 |
| 225/45R17 | £100–125 | £130–165 | £165–220 |
| 235/55R18 | £120–145 | £155–195 | £195–260 |

**A full set of four winter tyres (fitted mobile):** typically £320–£750 depending on size and brand.

**Storing your summer tyres:** Tyre Rescue does not offer tyre storage, but many local garages in Glasgow and Edinburgh offer seasonal storage from £30–£80 for a set.

## Why Mobile Winter Tyre Fitting Makes Sense in Scotland

The irony of winter tyre fitting: you need them most when the roads are worst. Driving to a garage on icy roads on your summer tyres is exactly the situation you're trying to avoid.

With Tyre Rescue's mobile winter tyre fitting:
- We come to your **home, work, or driveway** — no driving on summer tyres to a garage
- We can **swap from your summer set to your winter set** if you've stored them on a spare set of wheels
- We work **in all weathers** — our fitters are fully equipped for outdoor fitting year-round
- Available **throughout Scotland** — including Aberdeen, Inverness and the Highlands where winter tyres are most critical

Book your winter tyre swap before the first frost — our diary fills up fast in October and November.

## Frequently Asked Questions

### Are winter tyres compulsory in Scotland?
No, they are not legally required. However, in some Highland Perthshire and Aberdeenshire areas, roads may be impassable without them. Check your travel insurance and breakdown cover — some policies require "appropriate tyres for conditions."

### Can I fit just two winter tyres on the drive wheels?
This is not recommended and can be dangerous. Fitting winter tyres only on the front creates understeer in rear-wheel-drive vehicles; fitting only on the rear creates oversteer in front-wheel-drive vehicles. Always fit a full set of four.

### Do winter tyres affect fuel economy?
Yes, slightly. Winter tyres have higher rolling resistance than summer tyres, which can reduce fuel economy by 1–3%. For most drivers, the safety benefit far outweighs this cost — especially in Scotland.

### Will winter tyres damage my alloy wheels?
No, but many drivers choose to keep winter tyres on steel wheels (often cheaper than alloys) to protect their alloys from road salt and winter grit. Ask us about winter-ready steel wheels when you book.

### Can I use winter tyres year-round in Scotland?
Technically, but not advisable. Winter tyres wear faster in warmer weather (above 7°C) and their softer compound reduces handling precision in summer. For year-round use, consider all-season tyres instead.

## Book Winter Tyre Fitting Across Scotland

Don't wait until the first snowfall. Book your winter tyre fitting now:

- **Call:** 0141 266 0690 (24/7)
- **Online:** [tyrerescue.uk/book](/book)

We cover all of Scotland — [Glasgow](/mobile-tyre-fitting/glasgow), [Edinburgh](/mobile-tyre-fitting/edinburgh), [Aberdeen](/mobile-tyre-fitting/aberdeen), [Inverness](/mobile-tyre-fitting/inverness), [Dundee](/mobile-tyre-fitting/dundee), [Perth](/mobile-tyre-fitting/perth) and everywhere in between.`,
  },
  {
    slug: 'mobile-tyre-fitting-paisley-renfrewshire',
    title: 'Mobile Tyre Fitting in Paisley & Renfrewshire: Same-Day Service, PA Postcodes',
    description: 'Mobile tyre fitting in Paisley, Renfrew, Johnstone, Linwood and all Renfrewshire PA postcodes. Same-day fitting, 24/7 emergency callout. Typically 30 minutes from Glasgow base. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-08-15',
    lastModified: '2025-08-15',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['emergency-tyre-fitting-glasgow-complete-guide', 'mobile-tyre-fitting-vs-garage', 'puncture-repair-glasgow-when-replace'],
    keywords: ['mobile tyre fitting paisley', 'tyre fitting renfrewshire', 'emergency tyre paisley', 'mobile tyre renfrew', 'puncture repair paisley', '24 hour tyre paisley', 'mobile tyre fitting johnstone', 'mobile tyre fitting linwood'],
    content: `# Mobile Tyre Fitting in Paisley & Renfrewshire

Paisley is one of our busiest service areas — just 7 miles from Glasgow, it's a fast dispatch from our base. We cover all of Renfrewshire including Paisley town centre, Renfrew, Johnstone, Linwood, Erskine, Bridge of Weir and Bishopton.

**Call 0141 266 0690** for immediate emergency response, or [book online](/book) for same-day or scheduled fitting.

## Response Times in Renfrewshire

We dispatch from our Glasgow base and reach most of Renfrewshire quickly:

| Location | Average Response |
|---|---|
| Paisley town centre (PA1) | 25–35 minutes |
| Renfrew (PA4) | 20–30 minutes |
| Johnstone (PA5) | 30–40 minutes |
| Linwood (PA3) | 25–35 minutes |
| Erskine (PA8) | 30–40 minutes |
| Glasgow Airport / PA3 | 25–35 minutes |
| Bridge of Weir (PA11) | 40–50 minutes |
| Bishopton (PA7) | 35–45 minutes |

*Response times are approximate. Traffic on the M8/M77 can add 10–15 minutes during peak hours (7–9am, 4–7pm).*

## Glasgow Airport Tyre Emergencies

Glasgow Airport sits in the PA3 postcode area — one of our most frequent callout locations. Whether you're:
- Returning from a flight to find a flat tyre in long-stay parking
- Heading to the airport with a warning light on
- Picking up a hire car with a tyre problem

We cover the airport car parks, pickup areas, and surrounding roads. For terminal car parks, meet us at the barrier or in a bay — our fitters can squeeze through most multi-storey height restrictions.

## Areas We Cover in Renfrewshire

**PA1 — Paisley East:** Town centre, Castlehead, Ferguslie Park, Blackhall
**PA2 — Paisley South:** Foxbar, Lochfield, Potterhill, Glenburn
**PA3 — Paisley / Glasgow Airport:** Linwood, Ferguslie, Shortroods, Airport area
**PA4 — Renfrew:** Town centre, Yoker area, Braehead Shopping Centre
**PA5 — Johnstone:** Town centre, Cartside, Johnstone Castle
**PA6 — Howwood**
**PA7 — Bishopton:** Including Dargavel Village
**PA8 — Erskine:** All of the Erskine peninsula
**PA10 — Linwood**
**PA11 — Bridge of Weir**
**PA12 — Lochwinnoch**
**PA13 — Kilmacolm**
**PA14 — Port Glasgow:** (see also our [Greenock](/mobile-tyre-fitting/greenock) coverage)

## Why Use Mobile Tyre Fitting in Paisley?

Paisley's road network — the M8, M77, A737 and A726 — means high tyre puncture frequency. Common callout locations include:

- **Braehead Shopping Centre** car parks (PA4) — one of our most frequent retail park callouts
- **Paisley High Street and Gilmour Street** area — town centre parking
- **A737 Johnstone bypass** — fast A-road punctures
- **Erskine Bridge approaches** — busy commuter route
- **M8 hard shoulder** — between Glasgow and Paisley (Junction 28–30)

## What We Fit

All standard car tyre sizes for hatchbacks, saloons, SUVs, MPVs and light vans. We stock:
- Budget tyres from £55 (supply + mobile fit)
- Mid-range tyres from £75
- Premium (Michelin, Continental, Bridgestone) from £100
- All-season tyres available year-round
- Winter tyres (October–April)

We also carry TPMS sensors and can reset your tyre pressure monitoring system after fitting.

## Frequently Asked Questions

### Do you cover Braehead Shopping Centre?
Yes — we regularly attend Braehead's outdoor and covered car parks. Give the bay number or meet us at the entrance.

### Can you come to Glasgow Airport at night?
Yes. We operate 24/7 including overnight. Airport callouts are common from 10pm onwards when late flights arrive.

### Do you cover the A737 and M77?
Yes — for motorway and fast A-road breakdowns, call us immediately, move to the hard shoulder if safe, and switch on hazards. Give us your road number and direction (northbound/southbound).

### Is there a surcharge for Renfrewshire vs Glasgow?
No. Paisley and Renfrewshire are within our standard callout area. The £49 callout fee is the same as for Glasgow.

## Book Mobile Tyre Fitting in Paisley

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Mobile tyre fitting in Glasgow](/mobile-tyre-fitting/glasgow) | [Greenock & Inverclyde](/mobile-tyre-fitting/greenock) | [All service areas](/service-areas)`,
  },
  {
    slug: 'tyre-blowout-emergency-guide-scotland',
    title: 'Tyre Blowout: What to Do, How to Stay Safe & When to Call for Help',
    description: 'What to do if a tyre blows out on a Scottish road or motorway. Step-by-step safety guide plus how to get emergency mobile tyre fitting across Scotland in under 90 minutes. Call 0141 266 0690.',
    category: 'safety',
    publishDate: '2025-08-20',
    lastModified: '2025-08-20',
    readingTime: 6,
    featured: false,
    relatedSlugs: ['what-to-do-flat-tyre-motorway', 'emergency-tyre-fitting-glasgow-complete-guide', '24-hour-emergency-tyre-fitting-scotland'],
    keywords: ['tyre blowout what to do', 'tyre blowout scotland', 'blown tyre motorway', 'tyre burst emergency', 'tyre blowout driving', 'emergency tyre help scotland', 'motorway tyre blowout', 'tyre blowout A9'],
    content: `# Tyre Blowout Emergency Guide: What to Do

A tyre blowout at motorway speeds can feel catastrophic. The car pulls violently to one side, the steering wheel judders, and there's a loud bang followed by a rhythmic thumping noise. Your instinct may be to slam the brakes — **don't**. That's the single most dangerous thing you can do.

This guide explains exactly what to do if a tyre blows out on a Scottish road, how to stay safe on the hard shoulder, and how to get help fast.

## Step-by-Step: What to Do in a Blowout

### 1. Do NOT brake sharply
Grip the steering wheel firmly with both hands. Resist the urge to brake hard. The car will decelerate on its own due to increased rolling resistance from the flat tyre.

### 2. Hold your course
Keep the steering wheel straight. If a front tyre blew, the car will try to pull toward that side — hold firm against it. If a rear tyre blew, the rear of the car may fishtail — again, hold the wheel straight and don't counter-steer aggressively.

### 3. Accelerate briefly (counter-intuitive but effective)
Especially at motorway speeds: a brief, gentle acceleration can help stabilise the vehicle while you slow down gradually. This is the professional driving advice — it feels wrong, but it works.

### 4. Slow down gradually
Once the car is stable, ease off the accelerator and let the car slow down naturally. Only apply gentle braking once you are below 50mph.

### 5. Signal and move to safety
Put on your hazard lights immediately. Signal left and move to the hard shoulder (on a motorway) or the nearest safe stopping point. Don't attempt to drive far on a blown tyre — the rim will be damaged.

### 6. Get away from the car
On a motorway, exit via the left-side door (never the right — traffic side), climb the embankment or stand behind the barrier. On a standard road, move well away from traffic. **Stationary vehicles on hard shoulders are at high risk of being struck from behind.**

### 7. Call for help
From a motorway: use an emergency SOS phone (every 1 mile) or call 999 if unsafe, then call Tyre Rescue on **0141 266 0690**. From a standard road, call Tyre Rescue directly.

## Blowout vs. Slow Puncture: How to Tell

| Symptom | Blowout | Slow puncture |
|---|---|---|
| Onset | Sudden, violent | Gradual over minutes |
| Sound | Loud bang or pop | Hissing (if audible at all) |
| Steering | Sudden pull | Gradual drift |
| Warning light | Immediate | May appear after miles |
| Safe to drive? | No — stop immediately | Low speed, short distance only |

A tyre pressure warning light that appears while driving at normal speed is almost always a slow puncture. **Do not ignore it.** Pull over when safe, check the tyre visually, and call us.

## Common Causes of Tyre Blowouts in Scotland

- **Potholes:** Scotland's roads have a persistent pothole problem, especially on A-roads in Highland and Aberdeenshire. The A9, A82, and A87 are frequent culprits.
- **Under-inflation:** A tyre running at low pressure generates excess heat. At motorway speeds, this can cause catastrophic failure.
- **Overloading:** SUVs and MPVs with maximum loads on long journeys (e.g., holiday routes north) put extra strain on tyres.
- **Age:** Tyres older than 6 years become brittle even if they appear to have tread. The rubber degrades internally.
- **Kerb damage:** A sharp impact with a kerb (common in city centre parking) can cause internal damage that's invisible externally — but leads to a blowout days or weeks later.
- **Road debris:** Broken glass, metal fragments, and loose gravel are all common on Scottish roads after storms.

## High-Risk Blowout Locations in Scotland

Based on our callout data, these routes generate the most blowout emergencies:

- **M8 (Glasgow–Edinburgh)** — high traffic volume, deteriorating surface near M8/M73 interchange
- **A9 (Perth–Inverness)** — long straights at high speed, pothole risk after winter
- **A82 (Glasgow–Fort William)** — narrow, poorly maintained surface in places, especially Glen Coe
- **A77 (Glasgow–Stranraer)** — heavy HGV traffic causes surface damage
- **M74 (Glasgow southbound)** — high speed, heavy goods traffic
- **A90 (Dundee–Aberdeen)** — long-distance carriageway, frequent debris after wind storms

## After a Blowout: Do I Need a New Tyre?

Almost always, yes. Unlike a puncture (which may be repairable), a blowout causes structural damage to the tyre sidewall. The tyre must be replaced. If you drove even a short distance on the rim, the rim may also need assessment.

Tyre Rescue can assess both the tyre and the rim at the roadside. In most cases, we carry a suitable replacement and will have you back on the road within 30–60 minutes of arriving.

## Emergency Tyre Fitting After a Blowout

Call **0141 266 0690** — we operate 24/7 across all of Scotland:
- Average 45-minute response in Glasgow and Edinburgh
- Average 60–70 minutes in Dundee, Perth, and Stirling
- Average 90 minutes in Aberdeen and Inverness
- Coverage on all Scottish motorways and major A-roads

We carry full roadside safety equipment, warning cones, and a comprehensive range of tyre sizes. No appointment needed — just call.

For motorway emergencies, you may also be assisted by the Motorway Incident Detection and Automatic Signalling (MIDAS) system and Traffic Scotland. Call **0800 028 1414** for Traffic Scotland updates on motorway conditions.

## Frequently Asked Questions

### Can I drive on a run-flat tyre after a blowout?
Run-flat tyres (marked RFT or SSR on the sidewall) can be driven at up to 50mph for up to 50 miles after a puncture. However, a true blowout — where the tyre delaminated or the sidewall failed — may still require immediate stopping. Check the tyre visually if safe to do so.

### How do I know if my rim is damaged?
A bent or cracked rim may be visible, or you may notice vibration after the tyre is replaced. Tyre Rescue fitters will inspect your rim when fitting the new tyre and advise if you need a replacement.

### Is blowout damage covered by insurance?
Many comprehensive policies cover tyre damage as part of accidental damage. Check your policy or call your insurer after the immediate emergency is resolved.

### Can I prevent a blowout?
Yes — check tyre pressures monthly (including the spare), inspect for cracks or bulges regularly, replace tyres older than 6 years regardless of tread depth, and avoid potholes where possible.

## Emergency Tyre Help Across Scotland

[Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Glasgow emergency](/emergency-tyre-fitting/glasgow/city-centre) | [Edinburgh emergency](/emergency-tyre-fitting/edinburgh/city-centre) | [Aberdeen emergency](/emergency-tyre-fitting/aberdeen/city-centre) | [All service areas](/service-areas)

**Call now: 0141 266 0690 — 24 hours a day, 7 days a week.**`,
  },
  {
    slug: 'mobile-tyre-fitting-east-kilbride',
    title: 'Mobile Tyre Fitting in East Kilbride: Fast Response, G74 & G75 Coverage',
    description: 'Mobile tyre fitting in East Kilbride, Nerston, Hairmyres and all G74/G75 postcodes. Fast dispatch from Glasgow — typically 35–45 minutes. 24/7 emergency callout. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-08-25',
    lastModified: '2025-08-25',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['emergency-tyre-fitting-glasgow-complete-guide', 'mobile-tyre-fitting-hamilton-lanarkshire', 'mobile-tyre-fitting-paisley-renfrewshire'],
    keywords: ['mobile tyre fitting east kilbride', 'tyre fitting east kilbride', 'emergency tyre east kilbride', 'mobile tyre G74', 'puncture repair east kilbride', '24 hour tyre east kilbride', 'mobile tyre fitting south lanarkshire'],
    content: `# Mobile Tyre Fitting in East Kilbride

East Kilbride is Scotland's largest new town with a population of around 75,000 — and one of our busiest service areas south of Glasgow. We cover the full G74 and G75 postcode area including the town centre, Nerston, Hairmyres, Westwood, Calderwood and St Leonards.

**Call 0141 266 0690** for immediate emergency response, or [book online](/book) for same-day or scheduled fitting.

## Response Times in East Kilbride

| Location | Average Response |
|---|---|
| East Kilbride town centre (G74 1) | 35–45 minutes |
| Hairmyres / Kingsgate (G75 8) | 35–45 minutes |
| Nerston / Stewartfield (G74 4) | 40–50 minutes |
| Calderwood / St Leonards (G74 3) | 40–50 minutes |
| Westwood (G75 9) | 40–50 minutes |

*East Kilbride bypasses (A726, A749) can add 10 minutes during peak hours (7–9am, 4–7pm).*

## Areas We Cover

**G74 1 — Town Centre:** Kingsgate Retail Park, Bus Station area, Town Centre
**G74 2 — Peel Park / Murray / The Village**
**G74 3 — Calderwood / St Leonards / Whitehills**
**G74 4 — Nerston / Stewartfield / Whitehills industrial**
**G74 5 — East Kilbride Business Park area**
**G75 8 — Hairmyres / Jackton / Thorntonhall**
**G75 9 — Westwood / Busby approach**

## Common Callout Locations in East Kilbride

East Kilbride's road layout — a combination of ring roads, dual carriageways and residential cul-de-sacs — means specific locations generate regular callouts:

- **Kingsgate Retail Park** (G74) — large multi-storey and surface car parks
- **The Village shopping area** — town centre parking
- **A726 East Kilbride Expressway** — fast road connecting to M74/M77
- **Hairmyres Hospital** (G75) — we cover the hospital car parks and staff areas
- **East Kilbride Business Parks** (Kelvin Industrial, Peel Park) — fleet vehicle callouts

## Tyre Fitting for South Lanarkshire

East Kilbride is our primary dispatch point for South Lanarkshire. From here we also cover:
- **Strathaven** (ML10): +20 minutes
- **Lesmahagow** (ML11): +30 minutes
- **Biggar** (ML12): +45 minutes
- **Lanark** (ML11): +40 minutes

For [Hamilton and Lanarkshire](/blog/mobile-tyre-fitting-hamilton-lanarkshire) callouts, see our dedicated Hamilton coverage page.

## Frequently Asked Questions

### Is there a callout surcharge for East Kilbride compared to Glasgow?
No. East Kilbride is within our standard Glasgow callout area. The £49 callout fee applies the same as for central Glasgow.

### Do you cover Hairmyres Hospital car park?
Yes. Hospital car parks are a frequent callout. Let us know the car park section or meeting point when you call.

### Can you come to Kingsgate Retail Park?
Yes — surface car parks and multi-storey (check height clearance for our larger vans). Give the bay or section when you call.

### What if my tyre warning light came on driving on the A726?
If safe, pull off the A726 expressway at the nearest junction or layby. Call us with your location. If you're on the carriageway with a flat, switch on hazards and we'll advise.

## Book Mobile Tyre Fitting in East Kilbride

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Mobile tyre fitting in Glasgow](/mobile-tyre-fitting/glasgow) | [Hamilton & Lanarkshire](/mobile-tyre-fitting/hamilton) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-greenock-inverclyde',
    title: 'Mobile Tyre Fitting in Greenock & Inverclyde: PA15–PA19 Coverage',
    description: 'Mobile tyre fitting in Greenock, Port Glasgow, Gourock, Inverkip and all Inverclyde PA15–PA19 postcodes. Fast dispatch, 24/7 emergency callout. Typically 40–55 minutes from Glasgow. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-08-28',
    lastModified: '2025-08-28',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-paisley-renfrewshire', 'emergency-tyre-fitting-glasgow-complete-guide', 'what-to-do-flat-tyre-motorway'],
    keywords: ['mobile tyre fitting greenock', 'tyre fitting inverclyde', 'emergency tyre greenock', 'mobile tyre port glasgow', 'puncture repair greenock', '24 hour tyre greenock', 'mobile tyre fitting gourock'],
    content: `# Mobile Tyre Fitting in Greenock & Inverclyde

Tyre Rescue covers all of Inverclyde — Greenock, Port Glasgow, Gourock, Inverkip and Wemyss Bay. Dispatching from Glasgow via the A8/M8 and the A78 coastal road, we typically reach Greenock town centre in 40–50 minutes.

**Call 0141 266 0690** for immediate emergency response, or [book online](/book) for same-day fitting.

## Response Times in Inverclyde

| Location | Average Response |
|---|---|
| Greenock town centre (PA15/PA16) | 40–50 minutes |
| Port Glasgow (PA14) | 35–45 minutes |
| Gourock (PA19) | 50–60 minutes |
| Inverkip (PA16) | 55–65 minutes |
| Wemyss Bay (PA18) | 55–65 minutes |
| Kilmacolm (PA13) | 40–50 minutes |

## Postcode Coverage

**PA14 — Port Glasgow:** Town centre, Devol, Woodhall
**PA15 — Greenock East:** Larkfield, Fancy Farm
**PA16 — Greenock West / Inverkip:** Town centre, Cartsdyke, Inverkip village
**PA17 — Skelmorlie / Wemyss Bay approaches**
**PA18 — Wemyss Bay / Skelmorlie**
**PA19 — Gourock:** Town, pier area, Ashton

## The A78 Coastal Route

The A78 between Greenock and Largs is a popular commuter and tourist route. It runs along the Firth of Clyde through Gourock, Inverkip and Wemyss Bay. We cover callouts on this road regularly — debris from the seafront and the heavily worn surface between Gourock and Inverkip cause frequent punctures.

If you break down on the A78, pull off at a layby (there are several between Gourock and Inverkip). Call us with your exact location — use What3Words or share your Google Maps pin.

## Common Callout Locations in Greenock

- **Greenock town centre** and Oak Mall shopping area
- **Greenock Central and West stations** (car parks)
- **James Watt Dock** marina and development area
- **Custom House Quay** area
- **A8 Port Glasgow road** — frequent commercial vehicle callouts
- **Battery Park, Gourock** — popular seafront parking

## What We Carry for Inverclyde Callouts

Standard tyre range for hatchbacks, saloons, SUVs and light vans. Popular sizes for the Inverclyde area include 195/65R15, 205/55R16 and 225/45R17 — common on family cars and SUVs driven in the area. We also carry run-flat replacements.

## Frequently Asked Questions

### Do you cover Wemyss Bay and the Rothesay ferry area?
Yes — we reach Wemyss Bay (PA18) in approximately 55–65 minutes. We cover the ferry terminal car park and the surrounding roads. If you're catching the Rothesay ferry and have a tyre problem, call us as soon as possible.

### Can you come to James Watt Dock?
Yes — the development and marina area are accessible and a regular callout location.

### Is Kilmacolm covered?
Yes. Kilmacolm (PA13) is approximately 40–50 minutes. The A761 approach can add time in morning traffic.

### Is there a surcharge for Inverclyde vs Glasgow?
No surcharge. The standard £49 callout fee applies throughout Inverclyde.

## Book Mobile Tyre Fitting in Greenock

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Paisley & Renfrewshire](/mobile-tyre-fitting/greenock) | [Glasgow](/mobile-tyre-fitting/glasgow) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-kirkcaldy-fife',
    title: 'Mobile Tyre Fitting in Kirkcaldy & Fife: KY Postcodes, Fast Response',
    description: 'Mobile tyre fitting in Kirkcaldy, Glenrothes, Dunfermline, St Andrews and all Fife KY postcodes. Fast dispatch — typically 55–70 minutes. 24/7 emergency callout. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-edinburgh-guide', 'mobile-tyre-fitting-dundee-guide', 'what-to-do-flat-tyre-motorway'],
    keywords: ['mobile tyre fitting kirkcaldy', 'tyre fitting fife', 'emergency tyre kirkcaldy', 'mobile tyre glenrothes', 'puncture repair fife', '24 hour tyre kirkcaldy', 'mobile tyre fitting st andrews', 'mobile tyre fitting dunfermline'],
    content: `# Mobile Tyre Fitting in Kirkcaldy & Fife

Tyre Rescue covers the whole of Fife — all KY postcodes from KY1 (Kirkcaldy) to KY16 (St Andrews). We dispatch from Glasgow via the Kincardine Bridge or from Edinburgh via the Queensferry Crossing, making Fife one of our most flexible coverage zones.

**Call 0141 266 0690** for immediate emergency response, or [book online](/book) for same-day fitting.

## Response Times Across Fife

| Location | Average Response |
|---|---|
| Kirkcaldy town centre (KY1) | 55–70 minutes |
| Glenrothes (KY6–KY7) | 60–75 minutes |
| Dunfermline (KY11–KY12) | 50–65 minutes |
| St Andrews (KY16) | 75–90 minutes |
| Cupar (KY15) | 70–85 minutes |
| Burntisland (KY3) | 55–70 minutes |
| Leven / Methil (KY8) | 65–80 minutes |
| Anstruther / Pittenweem (KY10) | 80–95 minutes |

## Fife Postcode Coverage

**KY1 — Kirkcaldy:** Town centre, Dysart, Linktown, Templehall
**KY2 — Kirkcaldy North:** Kinghorn, Kinghorn Road, Abbotshall
**KY3 — Burntisland / Aberdour / Inchcolm**
**KY4 — Cowdenbeath / Kelty / Lochgelly**
**KY5 — Lochgelly / Cardenden / Bowhill**
**KY6 — Glenrothes South:** Thornton, Markinch
**KY7 — Glenrothes town / Kinglassie**
**KY8 — Leven / Methil / Buckhaven / Lundin Links**
**KY9 — Largo / Elie / Earlsferry**
**KY10 — Anstruther / Pittenweem / Crail / St Monans**
**KY11 — Dunfermline / Rosyth / Inverkeithing / Dalgety Bay**
**KY12 — Dunfermline West / Crossford / Saline**
**KY13 — Kinross / Milnathort**
**KY14 — Ladybank / Auchtermuchty / Strathmiglo**
**KY15 — Cupar / Springfield / Ceres**
**KY16 — St Andrews / Guardbridge / Leuchars**

## Kirkcaldy Coverage

Kirkcaldy is the Fife county town and our primary Fife dispatch. The A92 Kirkcaldy bypass and the A915 coastal road are the main routes generating callouts. Kirkcaldy town centre, The Postings shopping area, and the Esplanade seafront are frequent locations.

## St Andrews Coverage

St Andrews (KY16) is in our coverage at approximately 80–90 minutes. The historic town attracts significant tourist traffic and golf visitors, many in hire cars. We're a frequent callout for visitors who have driven from Edinburgh or Glasgow and encountered a puncture on Fife's rural roads.

The A91 between St Andrews and Cupar, and the A917 coastal road through Crail and Anstruther, are common puncture locations due to the road surface condition and rural debris.

## Dunfermline — Fastest Fife Response

Dunfermline (KY11/KY12) is our quickest Fife dispatch — accessible in 50–65 minutes via the M90/Queensferry Crossing from Glasgow, or 30–35 minutes from Edinburgh. Carnegie Shopping Centre, the town centre, and the Dunfermline Industrial Estate are regular callout locations.

## The Kincardine Bridge Route

The Kincardine Bridge (A876) connects Stirling to Fife and is an alternative to the Queensferry Crossing during congestion. We use this route for Central Fife callouts (Cowdenbeath, Lochgelly, Kelty area). If you're broken down between Kincardine and Glenrothes, call us — response times from this direction are typically 60–75 minutes.

## Frequently Asked Questions

### Do you cover the East Neuk of Fife?
Yes — Anstruther (KY10), Pittenweem, St Monans, Crail and Elie are all covered. Response times are 80–95 minutes from Glasgow. Advance booking is recommended if you know you'll be in the East Neuk.

### Can you come to St Andrews Golf Course hotels?
Yes — we cover all St Andrews hotels, B&Bs and the Old Course Hotel car park area. Golf visitors with hire car tyre problems are a regular callout.

### Is there a surcharge for Fife?
No. Fife is within our standard coverage. The £49 callout fee applies throughout the KY postcode area.

### Do you cover Kinross (KY13)?
Yes. Kinross is at the junction of the M90 and sits between Glasgow and Perth. Response time is approximately 60–75 minutes.

## Book Mobile Tyre Fitting in Kirkcaldy & Fife

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Mobile tyre fitting in Dunfermline](/mobile-tyre-fitting/dunfermline) | [Edinburgh](/mobile-tyre-fitting/edinburgh) | [Dundee](/mobile-tyre-fitting/dundee) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-dumfries-galloway',
    title: 'Mobile Tyre Fitting in Dumfries & Galloway: DG Postcodes, SW Scotland',
    description: 'Mobile tyre fitting in Dumfries, Stranraer, Castle Douglas, Newton Stewart and all DG postcodes across Dumfries & Galloway. Advance booking recommended. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-ayr-ayrshire', '24-hour-emergency-tyre-fitting-scotland', 'tyre-maintenance-checklist-scotland'],
    keywords: ['mobile tyre fitting dumfries', 'tyre fitting galloway', 'emergency tyre dumfries', 'mobile tyre stranraer', 'puncture repair dumfries', 'mobile tyre DG postcodes', 'tyre fitting south scotland'],
    content: `# Mobile Tyre Fitting in Dumfries & Galloway

Tyre Rescue covers the whole of Dumfries & Galloway — all DG postcodes from DG1 (Dumfries town) to DG16 (Gretna area). Dispatching from our Glasgow base via the A74(M), we reach Dumfries town in approximately 80 minutes. For more remote areas of the region — Stranraer, Newton Stewart, Kirkudbright — advance booking is strongly recommended.

**Call 0141 266 0690** for emergency response or [book online](/book) for scheduled fitting.

## Response Times Across Dumfries & Galloway

| Location | Average Response |
|---|---|
| Dumfries town centre (DG1) | 80–95 minutes |
| Annan (DG12) | 75–90 minutes |
| Lockerbie (DG11) | 70–85 minutes |
| Gretna / Gretna Green (DG16) | 70–80 minutes |
| Castle Douglas (DG7) | 90–110 minutes |
| Kirkcudbright (DG6) | 95–115 minutes |
| Newton Stewart (DG8) | 100–120 minutes |
| Stranraer (DG9) | 110–130 minutes |

*For Stranraer and the Rhins of Galloway, advance booking is essential. Same-day emergency service may not always be possible in very remote areas.*

## Postcode Coverage in Dumfries & Galloway

**DG1 — Dumfries town:** Centre, Lochside, Heathhall, Maxwelltown
**DG2 — Dumfries rural west:** Dumfries Castle area, Troqueer
**DG3 — Thornhill / Sanquhar:** A76 corridor
**DG4 — Sanquhar / Upper Nithsdale**
**DG5 — Dalbeattie**
**DG6 — Kirkcudbright / Gatehouse of Fleet**
**DG7 — Castle Douglas / New Galloway**
**DG8 — Newton Stewart / Wigtown / Whithorn**
**DG9 — Stranraer / Port Patrick / Drummore**
**DG10 — Moffat**
**DG11 — Lockerbie / Ecclefechan**
**DG12 — Annan / Eastriggs**
**DG13 — Langholm / Canonbie**
**DG14 — Canonbie / Longtown border area**
**DG16 — Gretna / Gretna Green / Springfield**

## The A74(M) and M74

The A74(M) / M74 is Scotland's main southbound motorway, running from Glasgow through Lockerbie to the English border at Gretna. It's one of Scotland's busiest freight routes and generates a significant number of tyre callouts, especially from HGVs and motorhomes.

If you break down on the A74(M), use a motorway emergency phone or call 999 first if in immediate danger. Then call us on 0141 266 0690. Response from Glasgow to the Lockerbie area is typically 70–85 minutes.

## Stranraer and the Cairnryan Ferry

The P&O and Stena Line ferries from Cairnryan (DG9) to Belfast serve thousands of passengers each week. We cover the ferry terminal and Stranraer town, though response times here are 110–130 minutes. If you're heading for an early ferry, we recommend booking the night before to ensure your vehicle is road-ready.

## Gretna Green — A Special Location

Gretna Green (DG16) is just over the Scottish border and one of Scotland's most visited tourist destinations. Located right on the A74(M)/M6 junction, response time is approximately 70–80 minutes. Hire car and motorhome callouts are particularly common here.

## Frequently Asked Questions

### Can you come to Stranraer for a ferry connection?
We can, but with a 110–130 minute response time. If you have a ferry booking, call us as soon as you discover the problem and we will do our best to get to you in time. If there's a risk of missing the ferry, we'll tell you honestly.

### Do you cover the A75 Euroroute?
Yes. The A75 from Dumfries to Stranraer passes through Castle Douglas, Newton Stewart and Glenluce. This road — Scotland's main ferry route to Northern Ireland — is covered. Callouts on the A75 are common, particularly near Castle Douglas and Newton Stewart.

### Is there a surcharge for Dumfries & Galloway?
For standard callouts to Dumfries and Annan, the £49 callout fee applies. For more remote locations — Stranraer, Kirkcudbright, Whithorn — there may be an additional distance charge. We always confirm the full price before dispatching.

## Book Mobile Tyre Fitting in Dumfries & Galloway

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Ayrshire coverage](/mobile-tyre-fitting/ayr) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-fort-william-highlands',
    title: 'Mobile Tyre Fitting in Fort William & Lochaber: PH33 & Highland Coverage',
    description: 'Mobile tyre fitting in Fort William, Spean Bridge, Glencoe, Ballachulish and Lochaber. Fast response for Ben Nevis visitors, NC500 travellers and Highland residents. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-inverness-highlands', 'mobile-tyre-fitting-perth-perthshire', '24-hour-emergency-tyre-fitting-scotland'],
    keywords: ['mobile tyre fitting fort william', 'tyre fitting lochaber', 'emergency tyre fort william', 'mobile tyre PH33', 'puncture repair fort william', 'tyre fitting glencoe', 'tyre fitting ben nevis', 'mobile tyre NC500 start'],
    content: `# Mobile Tyre Fitting in Fort William & Lochaber

Fort William is the gateway to the Scottish Highlands — Ben Nevis, Glencoe, the Great Glen, and the start of the North Coast 500 tourist route. It's also one of Scotland's most important outdoor recreation centres, drawing hundreds of thousands of visitors each year in campervans, motorhomes, and hire cars on narrow Highland roads.

Tyre Rescue covers Fort William and the full Lochaber area. Our response time to Fort William town centre is approximately 100–120 minutes from our Glasgow base.

**Call 0141 266 0690** or [book in advance](/book) — advance booking is recommended for this area.

## Response Times in Lochaber

| Location | Average Response |
|---|---|
| Fort William town centre (PH33 6) | 100–120 minutes |
| Spean Bridge (PH34) | 110–130 minutes |
| Roy Bridge / Tulloch (PH31) | 115–135 minutes |
| Glencoe village (PH49) | 90–110 minutes |
| Ballachulish (PH49) | 90–115 minutes |
| Kinlochleven (PH50) | 105–125 minutes |
| Mallaig (PH41) | 130–160 minutes |
| Acharacle (PH36) | 120–150 minutes |

*For Mallaig, Acharacle and the more remote parts of Ardnamurchan and Morvern, advance booking is essential and same-day emergency service may not always be achievable.*

## The A82 — Scotland's Most Challenging Road

The A82 from Glasgow to Inverness via Glencoe and Fort William is one of Scotland's most scenic — and most challenging — roads for tyres. Narrow sections, loose gravel edges, and the notorious Glencoe Pass road surface make tyre damage common. We cover the full A82 length:

- Glasgow → Balloch → Loch Lomond (A82)
- Tarbet → Crianlarich → Tyndrum (A82)
- Glencoe Pass and the A82 Devil's Staircase section
- Ballachulish Bridge → Fort William (A82)

If you break down on the A82 in Glencoe, pull into one of the layby areas, switch on hazards, and call us. Response from Glasgow to Glencoe is approximately 90–110 minutes.

## Ben Nevis Visitor Area

The Ben Nevis visitor car park and the Glen Nevis approach road are frequent callout locations, especially during summer. Rough car park surfaces and the volume of heavy campervans and motorhomes mean tyre incidents are common. We cover the Glen Nevis road (PH33) and the surrounding area.

## Fort William as NC500 Gateway

While the NC500 officially starts and ends in Inverness, many drivers begin their NC500 adventure from Fort William via the A82 north. We cover this approach route through Invergarry, Fort Augustus, and on to Inverness. See our [Inverness and Highlands guide](/blog/mobile-tyre-fitting-inverness-highlands) for full NC500 coverage.

## The Road to the Isles (A830)

The A830 from Fort William to Mallaig serves the Jacobite Steam Train route and the Skye and Outer Hebrides ferry connections at Mallaig. It's a single-track road for much of its length and a frequent location for tyre incidents with hire cars unaccustomed to passing places.

We cover the A830 corridor. For Mallaig callouts, response time is 130–160 minutes — advance booking is strongly recommended.

## Frequently Asked Questions

### Do you cover Glencoe Pass?
Yes. We cover the full A82 through Glencoe including the National Trust for Scotland ranger station area. If broken down in Glencoe, use a safe layby and switch on hazards. Response is approximately 90–110 minutes from Glasgow.

### Can you come to the Ben Nevis car park?
Yes. The Glen Nevis car parks and Ben Nevis visitor area are accessible for our vans. Response time is approximately 100–120 minutes.

### What about Ardnamurchan and Morvern?
These very remote peninsulas are covered but with longer response times (140–180 minutes). Advance booking is strongly recommended. We'll always give you an honest assessment of what's achievable.

### Is there a surcharge for Fort William?
Yes — for the Fort William area and beyond, there is a distance supplement of approximately £20–40 on top of the standard £49 callout fee. We confirm all costs before dispatching.

## Book Mobile Tyre Fitting in Fort William

Call **0141 266 0690** — 24 hours a day, every day.
Or [book in advance](/book) for scheduled Highland fitting.

[Inverness & Highlands](/mobile-tyre-fitting/inverness) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-east-lothian',
    title: 'Mobile Tyre Fitting in East Lothian: EH39–EH42 Postcodes, Fast Edinburgh Dispatch',
    description: 'Mobile tyre fitting in Haddington, North Berwick, Dunbar, Musselburgh and all East Lothian EH postcodes. Fast 40–60 minute response from Edinburgh. 24/7 emergency callout. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 4,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-edinburgh-guide', 'mobile-tyre-fitting-kirkcaldy-fife', 'what-to-do-flat-tyre-motorway'],
    keywords: ['mobile tyre fitting east lothian', 'tyre fitting haddington', 'emergency tyre north berwick', 'mobile tyre dunbar', 'puncture repair east lothian', 'mobile tyre EH postcodes', 'tyre fitting musselburgh'],
    content: `# Mobile Tyre Fitting in East Lothian

East Lothian is Edinburgh's eastern commuter belt — a mix of affluent coastal towns, golf resorts, retail parks and busy main roads. Tyre Rescue covers all of East Lothian dispatching from Edinburgh, typically reaching Haddington in 40–50 minutes and North Berwick in 50–65 minutes.

**Call 0141 266 0690** for immediate emergency response, or [book online](/book) for same-day fitting.

## Response Times in East Lothian

| Location | Average Response |
|---|---|
| Musselburgh (EH21) | 35–45 minutes |
| Tranent (EH33) | 40–50 minutes |
| Prestonpans (EH32) | 40–50 minutes |
| Haddington (EH41) | 45–55 minutes |
| North Berwick (EH39) | 50–65 minutes |
| Dunbar (EH42) | 55–70 minutes |
| East Linton (EH40) | 50–60 minutes |
| Gullane / Aberlady (EH31/EH32) | 50–65 minutes |

## Postcode Coverage

**EH21 — Musselburgh:** Town centre, Wallyford, Whitecraig, Whitecraig, Stoneyhill
**EH22 — Dalkeith / Mayfield / Newtongrange** (South Midlothian, also covered)
**EH31 — Gullane / Aberlady / Longniddry**
**EH32 — Prestonpans / Cockenzie / Port Seton / Longniddry**
**EH33 — Tranent / Ormiston / Pencaitland**
**EH34 — Tranent East / Humbie / Gifford**
**EH35 — Pencaitland / East Saltoun**
**EH36 — Gifford / Yester / Garvald**
**EH37 — Pathhead / Fala / Soutra Hill**
**EH38 — Heriot / Stow**
**EH39 — North Berwick / Dirleton / Gullane East**
**EH40 — East Linton / Whittingehame / Tyninghame**
**EH41 — Haddington / Athelstaneford / Bolton**
**EH42 — Dunbar / Belhaven / Innerwick**

## The A1 East Lothian Corridor

The A1 between Edinburgh and the English border runs through East Lothian via Musselburgh, Haddington and Dunbar. It's a busy dual carriageway and a frequent source of tyre emergencies. If you break down on the A1, move to the hard shoulder or nearest layby, switch on hazards, and call us. We cover the full A1 East Lothian section.

## North Berwick Golf Clubs

North Berwick is home to some of Scotland's finest golf courses — North Berwick Golf Club, Renaissance Club, and Muirfield at Gullane. Regular visitors arrive in hire cars and prestige vehicles. We cover all North Berwick postcodes (EH39) and the golf club approaches.

## Musselburgh — Eastern Edinburgh Gateway

Musselburgh (EH21) is East Lothian's largest town and sits on Edinburgh's eastern boundary. The A1 flyover, the Newcraighall Retail Park, and Musselburgh Racecourse are common callout locations. Response from Edinburgh to Musselburgh is 35–45 minutes — among our fastest East Lothian responses.

## Frequently Asked Questions

### Do you cover Musselburgh from Edinburgh or from Glasgow?
Primarily from Edinburgh — response is 35–45 minutes. From Glasgow it would be longer (75–90 minutes). We dispatch from the nearest available fitter.

### Can you come to Dunbar for A1 motorway breakdowns?
Yes. Dunbar (EH42) is typically 55–70 minutes. The A1 dual carriageway section near Dunbar is a common callout location.

### Do you cover Gifford and Humbie in the Lammermuirs?
Yes — Gifford (EH41) and Humbie (EH36) are in our coverage area. Response is 60–75 minutes. Advance booking is recommended for very rural East Lothian locations.

### Is there a surcharge for East Lothian compared to Edinburgh?
No. East Lothian is within our standard Edinburgh service area. The £49 callout fee applies throughout.

## Book Mobile Tyre Fitting in East Lothian

Call **0141 266 0690** — 24 hours a day, every day.
Or [book online](/book) for same-day or next-day scheduled fitting.

[Mobile tyre fitting in Edinburgh](/mobile-tyre-fitting/edinburgh) | [Fife coverage](/mobile-tyre-fitting/kirkcaldy) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-elgin-moray',
    title: 'Mobile Tyre Fitting in Elgin & Moray: IV30 and AB Postcode Coverage',
    description: 'Mobile tyre fitting in Elgin, Forres, Keith, Buckie and all Moray IV30-IV36 postcodes. Advance booking recommended. Emergency response 80–100 minutes from Aberdeen. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 5,
    featured: false,
    relatedSlugs: ['mobile-tyre-fitting-aberdeen-guide', 'mobile-tyre-fitting-inverness-highlands', '24-hour-emergency-tyre-fitting-scotland'],
    keywords: ['mobile tyre fitting elgin', 'tyre fitting moray', 'emergency tyre elgin', 'mobile tyre IV30', 'puncture repair elgin', 'mobile tyre fitting forres', 'tyre fitting keith', 'mobile tyre moray'],
    content: `# Mobile Tyre Fitting in Elgin & Moray

Elgin is the principal town of Moray — an area of outstanding natural beauty and some of Scotland's finest whisky country. Tyre Rescue covers the Moray region including Elgin, Forres, Keith, Buckie, Lossiemouth and the full IV30–IV36 postcode area.

Dispatch is from both our Aberdeen base (A96 route, ~80 minutes to Elgin) and our Inverness network (A96 westbound, ~55 minutes to Elgin). We always dispatch from whichever is faster for your location.

**Call 0141 266 0690** or [book in advance](/book) — advance booking is recommended for the Moray area.

## Response Times Across Moray

| Location | Approx. Response (Aberdeen route) |
|---|---|
| Elgin town centre (IV30) | 80–100 minutes |
| Forres (IV36) | 75–95 minutes |
| Keith (AB55) | 70–90 minutes |
| Buckie (AB56) | 80–100 minutes |
| Lossiemouth (IV31) | 85–105 minutes |
| Burghead / Hopeman (IV30) | 85–105 minutes |
| Aberlour / Craigellachie (AB38) | 80–95 minutes |
| Rothes (AB38) | 85–100 minutes |

## Postcode Coverage

**IV30 — Elgin:** Town centre, Lossiemouth road, Linkwood area
**IV31 — Lossiemouth:** Town, RAF Lossiemouth surrounds
**IV32 — Fochabers**
**IV33 — Urquhart / Alves**
**IV34 — Forres East / Kinloss**
**IV35 — Forres West**
**IV36 — Forres / Findhorn / Kinloss / Brodie**
**AB38 — Craigellachie / Aberlour / Rothes** (Speyside)
**AB55 — Keith / Dufftown / Huntly approaches**
**AB56 — Buckie / Cullen / Findochty / Portknockie**

## The A96 Aberdeen–Inverness Corridor

The A96 is Moray's main artery, connecting Aberdeen to Inverness via Keith, Elgin, Forres and Nairn. It's a busy two-lane A-road with a high proportion of lorry traffic. Regular improvements and patchy road surfaces make tyre incidents more common than on motorways. We cover the full A96 through Moray.

## Moray's Whisky Distilleries

Moray is home to over 50 single malt whisky distilleries including Glenfiddich (Dufftown), Glen Grant (Rothes), and Cardhu (Knockando). Many are off narrow B-roads. Tourism traffic to the Speyside Way and distillery trails is year-round, and punctures on gravel access roads are not uncommon. We cover distillery areas including Dufftown (AB55), Rothes (AB38) and Craigellachie.

## RAF Lossiemouth Area

RAF Lossiemouth (IV31) is one of Scotland's busiest military airbases. Civilian callouts in the Lossiemouth and Covesea area are covered. For callouts near the base perimeter, meet us at a public road — do not ask us to attend restricted areas.

## Frequently Asked Questions

### Can you come to the Speyside distillery trail?
Yes — we cover the Dufftown (AB55), Rothes (AB38) and Craigellachie areas. For very remote distillery access roads (single-track, no passing places), meet us at the nearest public road.

### Do you cover Burghead and Findhorn?
Yes. Burghead (IV30) and Findhorn (IV36) are in our coverage. Findhorn Bay and the Findhorn Village area are covered — response approximately 90–105 minutes.

### Is there a surcharge for Moray?
For Elgin and Forres, the standard £49 callout fee applies. For more remote Moray locations — Dufftown, Tomintoul — there may be a small distance supplement. We always confirm before dispatching.

### Do you cover Keith and the AB55 area?
Yes. Keith sits between Aberdeen and Elgin and is accessible from both directions. Response time is approximately 70–90 minutes.

## Book Mobile Tyre Fitting in Elgin & Moray

Call **0141 266 0690** — 24 hours a day, every day.
Or [book in advance](/book) for scheduled Moray fitting.

[Aberdeen coverage](/mobile-tyre-fitting/aberdeen) | [Inverness & Highlands](/mobile-tyre-fitting/inverness) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-motherwell-north-lanarkshire',
    title: 'Mobile Tyre Fitting in Motherwell & North Lanarkshire',
    description:
      'Mobile tyre fitting in Motherwell, Wishaw, Coatbridge, Airdrie and across North Lanarkshire. ML1–ML6 postcodes covered. Emergency callout or advance booking available.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting motherwell',
      'mobile tyre fitter wishaw',
      'tyre fitting coatbridge',
      'tyre fitting airdrie',
      'north lanarkshire mobile tyres',
      'ML1 tyre fitting',
      'ML2 tyre fitting',
      'emergency tyre motherwell',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-east-kilbride',
      'emergency-tyre-fitting-glasgow-complete-guide',
      'mobile-tyre-fitting-hamilton-lanarkshire',
    ],
    content: `# Mobile Tyre Fitting in Motherwell & North Lanarkshire

Tyre Rescue provides mobile tyre fitting across Motherwell, Wishaw, Coatbridge, Airdrie, Bellshill, and the wider North Lanarkshire area — covering all ML1 to ML6 postcodes.

## Areas We Cover in North Lanarkshire

**Motherwell & Wishaw (ML1–ML2)**
Both towns and surrounding residential areas are within our core coverage zone. Whether you're on Motherwell town centre or the Ravenscraig development, we'll come to you.

**Coatbridge & Airdrie (ML5–ML6)**
We cover both towns fully — including industrial estates and retail parks where flat tyres are common.

**Bellshill & Uddingston (ML4)**
Just off the M74 corridor — ideal for drivers who pick up a puncture on the motorway and need roadside help quickly.

**Shotts & Carluke (ML7–ML8)**
More rural parts of North Lanarkshire are covered too. We serve these areas with the same tyres and service as central Motherwell.

## Why North Lanarkshire Drivers Choose Tyre Rescue

North Lanarkshire sits at the junction of the M8 and M74 — two of Scotland's busiest motorways. A blowout or slow puncture on these routes is stressful. Tyre Rescue responds faster than a traditional garage because we come to you — no towing, no waiting room.

### Response Times in North Lanarkshire
- **Motherwell/Wishaw**: typically 40–55 minutes
- **Coatbridge/Airdrie**: typically 45–60 minutes
- **Bellshill**: typically 35–50 minutes (close to M74 junction)
- **Shotts/Carluke**: typically 60–75 minutes

All times are indicative and depend on traffic conditions on the M74, M8, and A723.

## What We Bring to You

Every callout includes:
- Full tyre stock — budget, mid-range, and premium brands
- Torque wrench for correct wheel nut tightening
- TPMS reset tool if your car has a tyre pressure monitoring system
- Proper disposal of your old tyre

We work on cars, SUVs, vans, and 4x4s. If you're not sure we stock your tyre size, call before we dispatch and we'll confirm availability.

## Emergency Callout in Motherwell

If you have a flat or blowout right now, call **0141 266 0690** — available 24 hours a day. We'll confirm the callout fee upfront (from £49) before dispatch.

For a slow puncture or minor damage, we can often repair the tyre from £25, saving you the cost of a full replacement.

## Common Locations We're Called To

- Motherwell town centre (Motherwell Shopping Centre, Brandon Street)
- Ravenscraig Sports Facility / Dalziel Park area
- Coatbridge Retail Park (ML5)
- Airdrie town centre (ML6)
- Eurocentral Business Park (M8/M74 junction)
- Strathclyde Country Park

## Book a Tyre Fitting in North Lanarkshire

For a scheduled appointment, [book online](/book) or call **0141 266 0690**. We'll confirm your tyre size, quote a price including tyre and fitting, and come to your home, workplace, or any safe location.

[Hamilton & Lanarkshire](/mobile-tyre-fitting/hamilton) | [East Kilbride](/mobile-tyre-fitting/east-kilbride) | [Glasgow](/mobile-tyre-fitting/glasgow) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-dunfermline-fife',
    title: 'Mobile Tyre Fitting in Dunfermline & West Fife',
    description:
      'Mobile tyre fitting in Dunfermline, Inverkeithing, Rosyth, Cowdenbeath and across West Fife. KY11 and KY12 postcodes covered. Same-day and emergency fitting available.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting dunfermline',
      'tyre fitting rosyth',
      'mobile tyre fitter fife',
      'KY11 tyre fitting',
      'KY12 tyre fitting',
      'emergency tyre dunfermline',
      'tyre fitting inverkeithing',
      'cowdenbeath tyre fitting',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-kirkcaldy-fife',
      'mobile-tyre-fitting-edinburgh-guide',
      'mobile-tyre-fitting-perth-perthshire',
    ],
    content: `# Mobile Tyre Fitting in Dunfermline & West Fife

Tyre Rescue covers Dunfermline, Rosyth, Inverkeithing, Cowdenbeath, and the surrounding West Fife area — including KY11 and KY12 postcodes.

## Areas We Cover in West Fife

**Dunfermline (KY11–KY12)**
Scotland's former capital is our main base for West Fife coverage. From the town centre to the Pitreavie Business Park and Carnegie Shopping Centre, we come to wherever you are.

**Rosyth (KY11)**
The naval dockyard town and its surrounding residential streets are all covered. Many drivers in Rosyth find us when returning from cross-Forth commuting.

**Inverkeithing (KY11)**
Close to the Forth Road Bridge — we regularly attend callouts from drivers who noticed a problem shortly after crossing.

**Cowdenbeath (KY4)**
The former mining town and its surrounding communities are within our West Fife service area.

**Lochgelly & Kelty (KY5–KY4)**
Both communities are covered as part of our Fife-wide operations.

## The Forth Crossing Problem

Dunfermline drivers face a specific challenge: if you notice a slow puncture while crossing the Forth Road Bridge or Queensferry Crossing, you need help fast. Tyre Rescue can meet you:

- At the Inverkeithing slip roads (A90)
- At the north end of the Queensferry Crossing (A90)
- At any safe layby on the A823 through Dunfermline
- At your home or workplace once you've reached it safely

## Why Choose Mobile Over a Garage?

Dunfermline has several tyre garages — but mobile fitting offers:
- **No appointment needed** for emergency callouts
- **You don't move the car** — we come to the flat tyre
- **Price transparency** — we quote before we arrive
- **Faster turnaround** — typically 30–45 minutes on site

## Response Times in West Fife

- **Dunfermline town centre**: typically 45–60 minutes
- **Rosyth / Inverkeithing**: typically 50–65 minutes
- **Cowdenbeath / Lochgelly**: typically 60–75 minutes

Times depend on traffic through the Forth crossing and on the M90.

## Emergency Tyre Fitting Dunfermline

For immediate help, call **0141 266 0690** — available 24 hours a day. We'll confirm a callout fee from £49 before sending our fitter.

Slow puncture that hasn't fully deflated? We can often repair it from £25 if the damage is in the legal repair zone.

## Book in Advance

Planning ahead is always better than an emergency. [Book online](/book) for a scheduled fitting at your Dunfermline address — we'll bring the tyre to you, fit it, and be gone in under an hour.

[Kirkcaldy & East Fife](/mobile-tyre-fitting/kirkcaldy) | [Edinburgh](/mobile-tyre-fitting/edinburgh) | [Perth & Perthshire](/mobile-tyre-fitting/perth) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-irvine-north-ayrshire',
    title: 'Mobile Tyre Fitting in Irvine & North Ayrshire',
    description:
      'Mobile tyre fitting in Irvine, Kilwinning, Saltcoats, Ardrossan, Largs and across North Ayrshire. KA11–KA30 postcodes covered. Emergency callout or scheduled fitting.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting irvine',
      'mobile tyre fitter north ayrshire',
      'tyre fitting kilwinning',
      'tyre fitting saltcoats',
      'tyre fitting largs',
      'KA11 tyre fitting',
      'emergency tyre irvine',
      'ardrossan tyre fitting',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-ayr-ayrshire',
      'emergency-tyre-fitting-glasgow-complete-guide',
      'mobile-tyre-fitting-greenock-inverclyde',
    ],
    content: `# Mobile Tyre Fitting in Irvine & North Ayrshire

Tyre Rescue serves Irvine, Kilwinning, Saltcoats, Ardrossan, Stevenston, Largs, and the wider North Ayrshire coast — covering KA11 to KA30 postcodes.

## Areas We Cover in North Ayrshire

**Irvine (KA11–KA12)**
Irvine New Town and the Irvine harbourside area are fully covered. Whether you're at the Rivergate Shopping Centre or on a residential estate, we'll come to you.

**Kilwinning (KA13)**
Just north of Irvine, Kilwinning is covered as part of our Ayrshire operations.

**Saltcoats & Stevenston (KA21–KA20)**
These coastal towns are within our coverage zone. Useful for drivers returning from Arran ferry crossings who need a tyre before the journey home.

**Ardrossan (KA22)**
The ferry port town is covered — flat tyres in car parks near the Arran ferry terminal are a common callout.

**Largs (KA30)**
Largs and the Cumbraes ferry area are covered as part of our Clyde coast service.

## Arran Ferry & Island Connections

Ardrossan is the mainland terminal for the Arran ferry. If you discover a flat tyre at the ferry terminal or while waiting in the queue, we can come to you — don't miss your crossing because of a puncture. Call as early as possible and we'll do our best to get there before your sailing.

## A78 Coastal Road Coverage

The A78 runs from Greenock to Ayr along the Firth of Clyde coast. It's a busy commuter and tourist route where tyre damage from debris and potholes is common. We cover the full A78 corridor through North Ayrshire.

## Response Times in North Ayrshire

- **Irvine**: typically 40–55 minutes
- **Kilwinning**: typically 45–60 minutes
- **Saltcoats / Ardrossan**: typically 50–65 minutes
- **Largs**: typically 60–75 minutes

Traffic on the A737 and A78 affects response times.

## Emergency Callout in North Ayrshire

For immediate help with a flat or blowout, call **0141 266 0690** — 24 hours a day. We confirm the callout fee (from £49) before dispatch and arrive with your tyre on board.

Can't identify the exact fault? We'll check the tyre on arrival and advise whether a repair (from £25) or replacement is the right option.

## Book a Scheduled Fitting

Not an emergency? [Book in advance](/book) to get a fixed price for your tyre size and a time slot that suits you — we'll arrive at your home, workplace, or any safe location across North Ayrshire.

[Kilmarnock & Ayr](/mobile-tyre-fitting/kilmarnock) | [Greenock & Inverclyde](/mobile-tyre-fitting/greenock) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-isle-of-skye',
    title: 'Mobile Tyre Fitting on the Isle of Skye',
    description:
      'Flat tyre on Skye? Tyre Rescue covers the Isle of Skye including Portree, Broadford, Dunvegan and the A87 tourist route. IV41–IV55 postcodes. Remote island specialist.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mobile tyre fitting isle of skye',
      'tyre fitting portree',
      'flat tyre skye',
      'emergency tyre skye',
      'IV41 tyre fitting',
      'IV49 tyre fitting',
      'tyre fitter broadford skye',
      'skye bridge tyre',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-inverness-highlands',
      'mobile-tyre-fitting-fort-william-highlands',
      'mobile-tyre-fitting-elgin-moray',
    ],
    content: `# Mobile Tyre Fitting on the Isle of Skye

Tyre Rescue covers the Isle of Skye — including Portree, Broadford, Kyle of Lochalsh, Uig, Dunvegan, and the full A87 and A850 tourist route. We serve IV41 to IV55 postcodes.

## Why Skye Needs a Specialist Mobile Tyre Fitter

The Isle of Skye presents unique challenges for drivers:
- **Single-track roads** with passing places — easy to clip a kerb or pothole
- **High tourist volumes** in summer — hire cars are particularly prone to damage on unfamiliar roads
- **Remote locations** — you may be far from any help when a tyre fails
- **Limited local options** — there are few garages on the island and most can't do roadside callouts

Tyre Rescue bridges this gap. We stock the common tyre sizes used by hire cars and tourists visiting Skye and can reach most parts of the island.

## Areas We Cover on Skye

**Portree (IV51)**
The island's capital and most populous town. We respond to callouts in Portree and surrounding villages.

**Broadford (IV49)**
The second-largest village, at the junction of the A87 and A851. A common stopping point where tyre issues are diagnosed.

**Kyle of Lochalsh (IV40)**
The mainland gateway to Skye via the Skye Bridge. Callouts near the bridge are common for drivers who notice damage just as they cross.

**Uig (IV51)**
The ferry terminal for the Outer Hebrides. If you have a flat before catching the ferry to Harris or Uist, call us first.

**Dunvegan (IV55)**
The northwest of the island near Dunvegan Castle. We cover this area, though response times are longer.

**Sleat Peninsula (IV43–IV44)**
The southern tip of Skye is covered. Home to Armadale and the Mallaig ferry terminal.

## Response Times on Skye

Due to the island's geography, response times are longer than on the mainland:
- **Portree**: typically 90–120 minutes from dispatch
- **Broadford**: typically 75–100 minutes
- **Kyle of Lochalsh**: typically 60–90 minutes
- **Dunvegan / Uig**: typically 110–140 minutes

We'll always give you an honest estimate when you call. Response times depend on traffic on the A87 and ferry availability.

## Emergency Tyre Help on Skye

If you have a flat on Skye right now, call **0141 266 0690**. We're available 24 hours a day. Given the distances involved, please call as soon as you notice a problem rather than waiting to see if the tyre deflates further.

We'll confirm the callout fee before dispatch and aim to reach you with a replacement tyre.

## Tips for Driving on Skye

1. **Check tyre pressures before you cross the Skye Bridge** — the island's roads are harder on tyres
2. **Carry a good-quality spare or foam sealant** as a backup while you wait for us
3. **Note your exact location** — many Skye locations are named in Gaelic and grid references help
4. **Book a scheduled check** if you're doing a multi-day road trip on Skye

## Pre-Journey Tyre Check

Heading to Skye for a holiday? Book a tyre safety check before you leave the mainland. We can come to your home in Glasgow, Edinburgh, or anywhere else and inspect tread depth, pressure, and sidewall condition.

[Fort William & Lochaber](/mobile-tyre-fitting/fort-william) | [Inverness & Highlands](/mobile-tyre-fitting/inverness) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-galashiels-scottish-borders',
    title: 'Mobile Tyre Fitting in Galashiels & the Scottish Borders',
    description:
      'Mobile tyre fitting in Galashiels, Hawick, Peebles, Melrose, Jedburgh and across the Scottish Borders. TD1–TD15 postcodes covered. Fast response to remote border towns.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mobile tyre fitting galashiels',
      'mobile tyre fitter scottish borders',
      'tyre fitting hawick',
      'tyre fitting peebles',
      'TD1 tyre fitting',
      'emergency tyre borders scotland',
      'tyre fitter melrose',
      'jedburgh tyre fitting',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-edinburgh-guide',
      'mobile-tyre-fitting-dumfries-galloway',
      'tyre-maintenance-checklist-scotland',
    ],
    content: `# Mobile Tyre Fitting in Galashiels & the Scottish Borders

Tyre Rescue covers Galashiels, Hawick, Peebles, Melrose, Jedburgh, Kelso, Duns, and the wider Scottish Borders region — serving all TD postcodes from TD1 to TD15.

## Why Border Drivers Need a Mobile Tyre Service

The Scottish Borders is a large, thinly-populated region. Traditional tyre garages are scarce outside Galashiels and Hawick, and most can't come to you roadside. When you get a flat on the A68, A7, or A72, your options are limited — unless you call Tyre Rescue.

## Areas We Cover in the Scottish Borders

**Galashiels (TD1)**
The Borders' largest town and our primary base for the region. We cover Galashiels town centre, the retail park, and surrounding areas.

**Hawick (TD9)**
The knitwear capital of Scotland. We cover Hawick and the surrounding Teviotdale area, including the A7 corridor south towards Carlisle.

**Peebles (EH45)**
The upper Tweed Valley market town is within our coverage zone, accessible via the A703 or A72.

**Melrose (TD6)**
Home to Melrose Abbey and the famous rugby sevens. We cover Melrose and the Eildon Hills area.

**Jedburgh (TD8)**
The historic border town on the A68 Edinburgh to Newcastle route — a common transit road where tyre damage occurs.

**Kelso (TD5)**
The Tweed Junction town, including its racecourse and surrounding farmland.

**Duns & Berwickshire (TD11–TD15)**
The eastern Borders and Berwickshire coast, including Eyemouth, are within our extended coverage.

## A68 and A7 Route Coverage

These two routes are the main arteries of the Scottish Borders:

- **A68**: Edinburgh → Jedburgh → Darlington (English border). We cover the Scottish section fully.
- **A7**: Carlisle → Hawick → Galashiels → Edinburgh. The full Scottish section is covered.

Tyre damage from road debris and agricultural vehicles is common on these routes, especially in autumn and winter.

## Response Times in the Scottish Borders

- **Galashiels**: typically 60–80 minutes from Glasgow/Edinburgh dispatch
- **Peebles**: typically 50–65 minutes
- **Hawick**: typically 75–95 minutes
- **Jedburgh / Kelso**: typically 80–100 minutes
- **Duns / Eyemouth**: typically 90–110 minutes

The A68 and A7 are generally clear roads, but winter conditions and agricultural vehicles can slow progress.

## Emergency Help in the Borders

Call **0141 266 0690** any time — 24 hours a day. We serve the Borders from both our Glasgow and Edinburgh-area operations, whichever is closer to your location.

If you're broken down on a rural road with no reception, try to drive slowly to the nearest town or layby before calling. Many single-track roads in the Borders have no mobile coverage.

## Scheduled Tyre Fitting Across the Borders

For non-emergency fitting, [book online](/book) and we'll come to your home or workplace in any Borders town. This is especially useful for residents of smaller villages where garage access is difficult.

[Edinburgh mobile tyres](/mobile-tyre-fitting/edinburgh) | [Dumfries & Galloway](/mobile-tyre-fitting/dumfries) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-oban-argyll',
    title: 'Mobile Tyre Fitting in Oban & Argyll',
    description:
      'Mobile tyre fitting in Oban, Lochgilphead, Inveraray, Campbeltown and across Argyll & Bute. PA21–PA38 postcodes covered. Gateway to the Western Isles ferry routes.',
    category: 'fitting',
    publishDate: '2025-09-01',
    lastModified: '2025-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mobile tyre fitting oban',
      'tyre fitting argyll',
      'flat tyre oban',
      'emergency tyre argyll',
      'PA21 tyre fitting',
      'tyre fitter lochgilphead',
      'campbeltown tyre fitting',
      'inveraray tyre fitting',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-fort-william-highlands',
      'mobile-tyre-fitting-inverness-highlands',
      'mobile-tyre-fitting-isle-of-skye',
    ],
    content: `# Mobile Tyre Fitting in Oban & Argyll

Tyre Rescue covers Oban, Lochgilphead, Inveraray, Campbeltown, Ardrishaig, and the wider Argyll & Bute region — serving PA21 to PA38 postcodes.

## Oban: Scotland's Seafood Capital and Ferry Gateway

Oban sits at the heart of Argyll, connecting the mainland to multiple island ferry routes including Mull, Islay, Colonsay, Coll, Tiree, and Barra. Drivers arriving for ferry connections often discover tyre damage after long A-road journeys — and need help fast.

## Areas We Cover in Argyll

**Oban (PA34)**
The main town, ferry terminal area, and surrounding roads. We cover the full PA34 postcode including the ring road and seafront.

**Inveraray (PA32)**
The historic royal burgh on Loch Fyne, on the A83 route from Glasgow. Popular with tourists, especially visitors to Inveraray Castle.

**Lochgilphead (PA31)**
The administrative centre of Argyll. We cover the town and surrounding Mid Argyll communities.

**Ardrishaig & Tarbert (PA29–PA30)**
These Kintyre gateway towns are within our coverage. Tarbert connects the A83 to the Kintyre Peninsula.

**Campbeltown (PA28)**
The southernmost major town in Argyll, at the tip of the Kintyre Peninsula. Response times are longer but we do cover Campbeltown.

**Dunoon & Cowal (PA23)**
The Cowal Peninsula town, accessible via the Gourock–Dunoon ferry or the A815/A83 route. We cover Dunoon and surrounding Cowal communities.

## The A83 and A85 Routes

These are the main roads through Argyll:
- **A83**: Glasgow → Inveraray → Lochgilphead → Tarbert → Campbeltown. The "Rest and Be Thankful" mountain pass on the A83 is known for debris and winter road damage.
- **A85**: Glasgow → Tyndrum → Crianlarich → Oban. This route through the Southern Highlands is scenic but exposed.

We cover both routes and respond to roadside callouts along them.

## Response Times in Argyll

- **Oban**: typically 90–120 minutes from Glasgow
- **Inveraray**: typically 60–80 minutes
- **Lochgilphead**: typically 90–110 minutes
- **Campbeltown**: typically 150–180 minutes (very remote — please call ahead)
- **Dunoon**: typically 70–90 minutes

We always give an honest ETA when you call. For Campbeltown, we recommend calling as soon as a fault is noticed.

## Ferry Terminal Callouts

If you're heading to an Oban ferry and discover a problem, call immediately. We'll do our best to reach you before your sailing, but please don't delay calling. The Oban ferry terminal car park is a known callout location for us.

## Emergency Help in Argyll

Call **0141 266 0690** — 24 hours a day. We cover Argyll from our Glasgow operations and can coordinate with our Highland team for northern Argyll areas.

For slow leaks on long Argyll journeys, foam tyre sealant can buy you extra miles to reach a safer location — but always call us to arrange a proper repair or replacement.

## Book in Advance

Planning a trip through Argyll? Get your tyres checked before you set out. [Book online](/book) and we'll come to your Glasgow or Central Scotland address for a pre-journey inspection.

[Fort William & Lochaber](/mobile-tyre-fitting/fort-william) | [Inverness & Highlands](/mobile-tyre-fitting/inverness) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-cumbernauld-north-lanarkshire',
    title: 'Mobile Tyre Fitting in Cumbernauld & Falkirk District',
    description:
      'Mobile tyre fitting in Cumbernauld, Kilsyth, Falkirk, Bonnybridge and the M80 corridor. G67–G68 and FK postcode areas. Fast response for commuter towns east of Glasgow.',
    category: 'fitting',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mobile tyre fitting cumbernauld',
      'tyre fitting cumbernauld',
      'G67 tyre fitting',
      'G68 tyre fitting',
      'tyre fitter kilsyth',
      'emergency tyre cumbernauld',
      'M80 tyre breakdown',
      'cumbernauld shopping centre tyre',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-stirling-falkirk',
      'mobile-tyre-fitting-motherwell-north-lanarkshire',
      'emergency-tyre-fitting-glasgow-complete-guide',
    ],
    content: `# Mobile Tyre Fitting in Cumbernauld & Falkirk District

Tyre Rescue covers Cumbernauld, Kilsyth, and the wider North Lanarkshire east district — including the M80 corridor that links Glasgow to Stirling. We serve G67, G68, and adjoining FK postcodes.

## Areas We Cover

**Cumbernauld (G67–G68)**
Scotland's largest post-war new town. We cover all of Cumbernauld — the town centre, residential estates (Condorrat, Kildrum, Seafar, Balloch), and the Westfield Retail Park area.

**Kilsyth (G65)**
Just north of Cumbernauld on the A803. We cover Kilsyth town and surrounding villages.

**Bonnybridge & Denny (FK4)**
These Falkirk district towns at the junction of the M876 and A88 are within our coverage. Close to the Falkirk Wheel visitor area.

## The M80 Motorway

The M80 is the main link between Glasgow and Stirling, passing through Cumbernauld. It's a high-speed, high-volume route where blowouts are dangerous. If you have a tyre emergency on the M80:

1. Move to the hard shoulder or emergency refuge area
2. Exit the vehicle on the left side (away from traffic)
3. Call **0141 266 0690** and give your motorway location reference
4. We'll coordinate with the relevant motorway management

**Never attempt to change a tyre on a live motorway carriageway.**

## Response Times

- **Cumbernauld town centre**: typically 30–45 minutes
- **Kilsyth**: typically 35–50 minutes
- **Bonnybridge**: typically 45–60 minutes

Cumbernauld's proximity to Glasgow makes it one of our faster response areas outside the city.

## Emergency Callout in Cumbernauld

Flat tyre right now? Call **0141 266 0690** — 24 hours a day. We'll confirm the callout fee (from £49) and dispatch a fitter with your tyre size if we can confirm it from your registration.

For a slow puncture that hasn't fully deflated, we may be able to repair it from £25 rather than replace the whole tyre.

## Schedule a Tyre Fitting

Not an emergency? [Book online](/book) for a daytime appointment. We'll bring your chosen tyre to your home or workplace in Cumbernauld — no need to drive to a garage.

[Motherwell & North Lanarkshire](/mobile-tyre-fitting/motherwell) | [Stirling & Falkirk](/mobile-tyre-fitting/stirling) | [Glasgow](/mobile-tyre-fitting/glasgow) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-wick-caithness',
    title: 'Mobile Tyre Fitting in Wick & Caithness',
    description:
      'Flat tyre in Wick, Thurso, or Caithness? Tyre Rescue covers Scotland\'s far north including KW1–KW14 postcodes. NC500 route specialist. Remote Highlands callouts available.',
    category: 'fitting',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mobile tyre fitting wick',
      'tyre fitting caithness',
      'tyre fitting thurso',
      'KW1 tyre fitting',
      'KW14 tyre fitting',
      'NC500 tyre help',
      'flat tyre far north scotland',
      'emergency tyre wick',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-inverness-highlands',
      'mobile-tyre-fitting-elgin-moray',
      'mobile-tyre-fitting-fort-william-highlands',
    ],
    content: `# Mobile Tyre Fitting in Wick & Caithness

Tyre Rescue covers Wick, Thurso, and the wider Caithness region — Scotland's far north, including KW1 to KW14 postcodes. We're one of the few mobile tyre services that will travel this far north.

## Why Caithness Needs a Dedicated Mobile Tyre Service

Caithness sits at the very tip of mainland Scotland — further north than parts of Denmark. The challenges here are unique:

- **Long distances from major centres** — Inverness is 104 miles from Wick
- **Single-track roads** with passing places and sharp verges
- **NC500 tourist traffic** — particularly heavy in summer, with unfamiliar drivers on challenging roads
- **Minimal local tyre options** — most garages are small and can't do roadside callouts
- **Exposed A99 coast road** — debris and weather damage are common

## Areas We Cover in Caithness

**Wick (KW1)**
The main town and county seat. We cover Wick town centre, Riverside Drive, and surrounding residential areas.

**Thurso (KW14)**
Scotland's most northerly major town. We cover the town centre and the route to Scrabster ferry terminal.

**Scrabster & John o'Groats (KW1, KW14)**
The northern ferry terminals are covered. John o'Groats is an NC500 endpoint — drivers who've completed the route often discover tyre wear here.

**Lybster & Dunbeath (KW3, KW6)**
These south Caithness coastal villages on the A9 are within our extended coverage.

**Halkirk & Watten (KW12)**
Inland Caithness villages accessible via the A882.

## The NC500 in Caithness

The North Coast 500 route passes through Caithness along the A99 and A836. The coastal section from John o'Groats to Tongue is particularly demanding — narrow roads, gravel edges, and spectacular but isolated scenery.

If you pick up a tyre fault on the NC500 in Caithness:
- Pull off the road where safe — many stretches have no hard shoulder
- Call **0141 266 0690** immediately and describe your location (nearest village or kilometre marker)
- We'll give you an honest ETA and advise on next steps

## The Orkney Ferry Connection

Thurso is the gateway for the NorthLink ferry to Orkney from Scrabster. If you're heading to the Orkney ferry and discover a tyre problem, call us immediately — we'll do our best to reach Thurso before your sailing. With sufficient notice, we can often intervene.

## Response Times in Caithness

Due to the extreme distance from our dispatch centres:
- **Wick / Thurso**: typically 150–180 minutes (driving from Inverness area)
- **John o'Groats**: typically 160–200 minutes
- **Dunbeath / Lybster**: typically 130–160 minutes

We're transparent about these times. For remote callouts, we recommend calling the moment you notice a fault rather than waiting.

## Emergency Help in the Far North

Call **0141 266 0690** — 24 hours a day. For Caithness callouts, we coordinate through our Highland operations to dispatch the nearest available fitter.

We always confirm the callout fee before dispatch. For very remote locations, a premium distance surcharge may apply — we'll always tell you before sending anyone.

## Travel Tips for Caithness

1. **Check tyres before leaving Inverness** — the last major town before the far north
2. **Carry basic tools** — a good foam tyre sealant can be invaluable on remote stretches
3. **Know your tyre size** — it's on the sidewall and in your handbook
4. **Download offline maps** — mobile coverage drops in many Caithness glens

[Inverness & Highlands](/mobile-tyre-fitting/inverness) | [Elgin & Moray](/mobile-tyre-fitting/elgin) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-arbroath-angus',
    title: 'Mobile Tyre Fitting in Arbroath & Angus',
    description:
      'Mobile tyre fitting in Arbroath, Forfar, Montrose, Brechin and across Angus. DD11 and DD8 postcodes covered. Same-day fitting between Dundee and Aberdeen.',
    category: 'fitting',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting arbroath',
      'tyre fitting angus',
      'tyre fitting forfar',
      'tyre fitting montrose',
      'DD11 tyre fitting',
      'DD8 tyre fitting',
      'emergency tyre arbroath',
      'brechin tyre fitting',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-dundee-guide',
      'mobile-tyre-fitting-aberdeen-guide',
      'mobile-tyre-fitting-perth-perthshire',
    ],
    content: `# Mobile Tyre Fitting in Arbroath & Angus

Tyre Rescue covers Arbroath, Forfar, Montrose, Brechin, Carnoustie, and the wider Angus region — serving DD11, DD8, and DD10 postcodes on the A90 corridor between Dundee and Aberdeen.

## Areas We Cover in Angus

**Arbroath (DD11)**
Scotland's Declaration of Independence town and Angus's largest community. We cover Arbroath town centre, the harbour area, and surrounding residential streets.

**Forfar (DD8)**
The county town of Angus. We cover Forfar and the surrounding Strathmore area including the A90 and A926 routes.

**Montrose (DD10)**
The eastern Angus coastal town. We cover Montrose and the offshore oil support industry area around the port.

**Brechin (DD9)**
On the A935 route from Forfar to Montrose. We cover Brechin and surrounding Esk valley communities.

**Carnoustie (DD7)**
The world-famous golf links town between Dundee and Arbroath. We cover Carnoustie and the A92 coastal route.

## The A90 Dundee to Aberdeen Corridor

Angus sits on the main A90 route between Dundee and Aberdeen — one of Scotland's busiest trunk roads. The dual carriageway carries high volumes of commuter and freight traffic. Tyre damage on this route is common, and getting to a garage safely is often impossible without first getting the tyre fixed.

Tyre Rescue responds to A90 callouts between the Dundee bypass and Stonehaven. If you have a tyre emergency on the A90 in Angus:

1. Slow down immediately — drive on the rim only as a last resort
2. Use the nearest layby or slip road
3. Call **0141 266 0690** with your location (nearest junction or signpost)

## Offshore and Industrial Callouts

Montrose has a significant offshore oil support sector. Workers and supply vehicles often need quick tyre help to meet logistics schedules. We prioritise these callouts and carry the commercial vehicle tyre sizes common in this industry.

## Response Times in Angus

- **Carnoustie / Arbroath**: typically 45–65 minutes from Dundee area
- **Forfar**: typically 55–75 minutes
- **Montrose**: typically 65–85 minutes
- **Brechin**: typically 70–90 minutes

Traffic on the A90 and A92 affects all times.

## Emergency Callout in Angus

Flat tyre in Angus right now? Call **0141 266 0690** — available 24 hours a day. We dispatch from both Dundee and Aberdeen to cover Angus, ensuring the nearest fitter reaches you.

Can the tyre be repaired? We check on arrival. A repair costs from £25 and is only done where the tyre meets legal safety standards.

## Book in Advance

Planning a trip through Angus or need a replacement tyre before a long journey north to Aberdeen? [Book online](/book) and we'll come to your Angus address with the tyre pre-fitted.

[Dundee mobile tyres](/mobile-tyre-fitting/dundee) | [Aberdeen mobile tyres](/mobile-tyre-fitting/aberdeen) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-stornoway-western-isles',
    title: 'Mobile Tyre Fitting in Stornoway & the Western Isles',
    description:
      'Flat tyre in Stornoway or the Outer Hebrides? Tyre Rescue covers Lewis, Harris, North Uist, South Uist and Barra. HS postcodes. Island specialist with ferry coordination.',
    category: 'fitting',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mobile tyre fitting stornoway',
      'tyre fitting western isles',
      'tyre fitting lewis harris',
      'HS1 tyre fitting',
      'flat tyre outer hebrides',
      'emergency tyre stornoway',
      'tyre fitting north uist',
      'tyre fitting south uist',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-inverness-highlands',
      'mobile-tyre-fitting-isle-of-skye',
      'mobile-tyre-fitting-oban-argyll',
    ],
    content: `# Mobile Tyre Fitting in Stornoway & the Western Isles

Tyre Rescue covers Stornoway and the Western Isles (Outer Hebrides) — including Lewis, Harris, North Uist, Benbecula, South Uist, and Barra. We serve HS1 to HS9 postcodes.

## The Challenge of Island Tyre Emergencies

The Western Isles present some of the most logistically challenging tyre emergencies in Scotland:

- **No fixed link to the mainland** — all vehicles reach the islands by ferry
- **Long distances between communities** — Lewis alone is 60 miles from north to south
- **Single-track roads** throughout most of the island chain
- **Seasonal tourism peaks** — summer NC500 spillover and Hebridean tourism brings many unfamiliar drivers

We coordinate with Caledonian MacBrayne ferry schedules to provide the most effective service possible.

## Islands We Cover

**Lewis (HS1–HS2)**
The largest island in the Outer Hebrides. Stornoway is our operational base for Lewis. We cover the full island including Carloway, Ness, Point, and the Butt of Lewis area.

**Harris (HS3, HS5)**
The southern part of the Lewis-Harris island. The Golden Road (B8083) along Harris's east coast is particularly demanding on tyres — a popular tourist route with sharp rocks close to the road surface.

**North Uist (HS6)**
Accessible via the Harris ferry to Berneray and causeway. We cover Lochmaddy and surrounding North Uist communities.

**Benbecula (HS7)**
The central island linked by causeways to North and South Uist. Home to an airport — useful for drivers who need tyres before a flight connection.

**South Uist (HS8)**
Connected to Benbecula by causeway. We cover Lochboisdale and surrounding South Uist communities.

**Barra (HS9)**
The southernmost inhabited island. Reachable via the Oban ferry to Castlebay. Response times here are the longest in our network — please call as early as possible.

## Coordinating with CalMac Ferries

If you need tyres brought to an island, we work with CalMac's freight booking system where required. For scheduled (non-emergency) tyre orders, we can pre-ship tyres to island destinations and arrange fitting with local partners.

For emergency callouts on Lewis or Harris, we aim to have a fitter on the ferry or on-island within the same day where possible.

## Response Times in the Western Isles

Response times vary significantly depending on ferry availability:
- **Stornoway (Lewis)**: typically same-day with morning call, next-day for late calls
- **Harris**: add 1–2 hours to Stornoway times
- **North Uist / Benbecula / South Uist**: typically 24 hours from booking
- **Barra**: typically 24–48 hours from booking

We'll always give you an honest timeline when you call. Ferry schedules and weather can affect these times significantly.

## Emergency Help in the Western Isles

Call **0141 266 0690** — 24 hours a day. For island callouts, we'll assess the quickest route (whether that's dispatching via Stornoway airport or the Ullapool–Stornoway ferry) and give you a realistic timeline.

For drivers on Lewis or Harris who know a local tyre fitter, we recommend combining a local repair with our supply of the correct tyre size if stocking is limited on-island.

## Tips for Outer Hebrides Driving

1. **Check tyre tread** before you take the ferry — the islands' roads are unforgiving
2. **Carry a spare** — for remote island driving, a spare or foam sealant is strongly advised
3. **Know your ferry times** — a tyre issue near a CalMac terminal can sometimes be coordinated with our on-island team
4. **The Golden Road** (Harris): reduce speed on the east coast route — rock edges and cattle grids cause damage

[Inverness & Highlands](/mobile-tyre-fitting/inverness) | [Isle of Skye](/mobile-tyre-fitting/isle-of-skye) | [All service areas](/service-areas)`,
  },
  {
    slug: 'mobile-tyre-fitting-lerwick-shetland',
    title: 'Mobile Tyre Fitting in Lerwick & Shetland',
    description:
      'Flat tyre in Lerwick or anywhere on Shetland? Tyre Rescue covers Lerwick, Scalloway, Lerwick Harbour and across the Shetland Islands. ZE postcodes. Scotland\'s northernmost mobile tyre service.',
    category: 'fitting',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting lerwick',
      'tyre fitting shetland',
      'ZE1 tyre fitting',
      'flat tyre shetland',
      'emergency tyre lerwick',
      'tyre fitter shetland islands',
      'scalloway tyre fitting',
      'shetland mobile tyres',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-stornoway-western-isles',
      'mobile-tyre-fitting-inverness-highlands',
      'mobile-tyre-fitting-elgin-moray',
    ],
    content: `# Mobile Tyre Fitting in Lerwick & Shetland

Tyre Rescue covers Lerwick and the Shetland Islands — Scotland's northernmost territory, serving ZE1 postcodes. We provide Scotland's most northerly mobile tyre service.

## Shetland: Unique Tyre Challenges

Shetland sits 170 miles north of mainland Scotland, closer to Bergen than to Edinburgh. Driving conditions here are extreme:

- **High winds** — Shetland has the highest average wind speeds in the UK, affecting tyre wear and stability
- **Single-track roads** for most of the island network
- **Exposed cliff-edge routes** where stopping is dangerous
- **Remote peninsula roads** with no phone coverage
- **NorthLink ferry dependency** — no fixed link to the mainland

Despite these challenges, Shetland residents and visitors need tyres just like anyone else — and have even fewer options when something goes wrong.

## Areas We Cover in Shetland

**Lerwick (ZE1)**
The capital and our primary base on Shetland. We cover Lerwick town centre, the Viking Bus Station area, Lerwick Harbour, and residential areas to the north and south.

**Scalloway (ZE1)**
Shetland's former capital on the west coast, connected to Lerwick by the A970. We cover Scalloway and the Whiteness and Weisdale valleys.

**Brae & Voe (ZE2)**
The north mainland communities accessible via the A970. We cover these areas, though response times are longer.

**Sumburgh & South Mainland (ZE3)**
The southern tip of Shetland, including Sumburgh Airport and the Jarlshof archaeological site. We cover the south mainland.

**Yell, Unst & Fetlar**
For the outer islands accessible by inter-island ferry from Toft, we can coordinate supply and fitting — please contact us in advance to arrange.

## NorthLink Ferry and Aberdeen Connection

Shetland is connected to Aberdeen and Orkney via the NorthLink ferry (Aberdeen–Lerwick, approximately 12 hours). We can coordinate tyre supply via the ferry for pre-arranged orders. For emergency callouts, we dispatch via the quickest route available.

## Response Times in Shetland

Shetland callouts have the longest response times in our network:
- **Lerwick town**: typically same-day with a morning call (via scheduled ferry or flight charter for genuine emergencies)
- **South Mainland**: add 30–60 minutes to Lerwick times
- **North Mainland**: add 60–90 minutes to Lerwick times
- **Outer islands (Yell, Unst)**: 24–48 hours — please plan in advance

We will always give you an honest assessment when you call. For genuine breakdowns, we explore all options including local partnerships.

## Emergency Tyre Help in Shetland

Call **0141 266 0690** — 24 hours a day. For Shetland callouts, we'll assess the fastest route to you (we maintain a local partner network for island emergencies) and give you a realistic timeline.

For drivers in Lerwick itself, response is typically fastest as we maintain a local stock presence in the capital.

## Tips for Driving in Shetland

1. **Pre-trip tyre check** — before heading to Shetland on the ferry, get your tyres inspected on the mainland
2. **Carry a foam sealant** — for remote Shetland roads, a temporary fix can get you to Lerwick safely
3. **Avoid driving on deflated tyres** — on Shetland's exposed roads, a damaged rim adds major cost
4. **Know the postcode** — Shetland has limited addressing; knowing ZE1 or ZE2 helps our dispatch team

[Inverness & Highlands](/mobile-tyre-fitting/inverness) | [Stornoway & Western Isles](/blog/mobile-tyre-fitting-stornoway-western-isles) | [All service areas](/service-areas)`,
  },
  {
    slug: 'pothole-damage-tyres-scotland',
    title: 'Pothole Damage to Tyres in Scotland: What to Do & Can You Claim?',
    description:
      'Hit a Scottish pothole? Here\'s how to check for tyre damage, whether to claim compensation from the council, and how to get emergency tyre replacement quickly.',
    category: 'emergency',
    publishDate: '2025-12-01',
    lastModified: '2025-12-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'pothole damage tyres scotland',
      'hit pothole tyre damage scotland',
      'pothole claim scotland council',
      'pothole tyre bulge',
      'pothole flat tyre scotland',
      'council pothole claim uk',
      'pothole damage car scotland',
      'emergency tyre fitting pothole scotland',
    ],
    relatedSlugs: [
      'what-to-do-flat-tyre-motorway',
      'tyre-tread-depth-guide-scotland',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Pothole Damage to Tyres in Scotland: What to Do & Can You Claim?

Scotland's roads contain some of the worst potholes in the UK. Transport Scotland and local councils receive thousands of pothole reports annually, and the combination of freeze-thaw cycles, heavy rainfall, and Highland frost damage means Scottish potholes are often deeper and more damaging than their English equivalents.

If you have just hit a pothole — or suspect your tyres were damaged by one — here is exactly what to do.

## Immediate Steps After Hitting a Pothole

### 1. Find a safe place to stop
If you feel a sudden change in handling, steering, or a thumping noise, reduce speed and find a safe place to stop. Do not continue driving on a damaged tyre — a slowly deflating tyre can fail completely without warning.

### 2. Inspect all four tyres
Look for:
- **Bulges or lumps**: A bulge in the sidewall is a sign of internal structural failure — the tyre must be replaced immediately. Do not drive on it.
- **Flat or rapidly deflating tyre**: Check whether any tyre is visibly lower than the others.
- **Cuts or tears**: Any cut in the sidewall exposing white cord beneath the rubber.
- **Wheel rim damage**: Buckled or cracked rims can also occur after pothole impacts and may cause slow air loss even with an intact tyre.

### 3. Check for handling changes
Even if the tyres look visually undamaged, a severe pothole impact can knock your wheel alignment out — causing the car to pull to one side, a vibration at speed, or uneven tyre wear. Get a four-wheel alignment check after any significant pothole impact.

## Types of Pothole Tyre Damage

### Tyre Bulge (Bubble)
The most common pothole injury. The impact breaks cords inside the tyre wall, causing a bubble or lump on the sidewall. A bulging tyre is structurally compromised and cannot be repaired — it must be replaced immediately. Driving on a bulging tyre risks a blowout.

### Sidewall Cut
A sharp pothole edge can slice the sidewall. Even a small sidewall cut that exposes cord material requires immediate replacement — sidewall damage cannot be repaired.

### Flat Tyre
Pothole impacts can drive the tyre onto the rim hard enough to cause an immediate flat, or create a slow puncture in the tread area.

### Wheel Damage
Alloy wheels are particularly vulnerable to pothole impacts. A buckled wheel causes air loss around the bead (where the tyre seats) and cannot be properly sealed even with a new tyre until the wheel is straightened or replaced.

## Can You Claim for Pothole Damage in Scotland?

Yes — local authorities have a legal duty to maintain roads in a safe condition. If a pothole caused tyre or wheel damage and the authority was aware of it (or should have been), you may have a valid claim.

### How to Make a Pothole Claim in Scotland

**Step 1: Document everything at the scene**
- Photograph the pothole, showing its size and depth (use a coin or your hand for scale)
- Photograph your tyre damage
- Note the exact road name, direction of travel, and nearest landmark or road number
- Record the date and time

**Step 2: Report the pothole**
- Glasgow and Central Belt: [mygov.scot](https://www.mygov.scot/report-a-pothole) or the relevant local council website
- Rural Scotland: your regional council (Highland Council, Dumfries & Galloway Council, etc.)
- Trunk roads (A9, A74, A82 etc.): Transport Scotland via the trunk road operator

**Step 3: Gather evidence of costs**
Keep receipts for tyre replacement and any other damage (wheel straightening, alignment check). Get a written assessment from a tyre fitter.

**Step 4: Submit your claim to the council**
Contact the roads department of the relevant local authority in writing. Include your photographs, the pothole report reference number, and your cost receipts. Most councils have a compensation claim form.

**Important**: Councils can reject claims if they can show the pothole was reported and they had not yet had a reasonable time to repair it, or if their road inspection interval was within policy. Claims success rates vary — the RAC estimates around 30–40% of pothole claims succeed in Scotland. Small claims court (up to £5,000) is an option if a legitimate claim is rejected.

### Scottish Trunk Road Pothole Claims
For damage on trunk roads (A9, A82, M8, M74 etc.), the claim goes to Transport Scotland's trunk road operating company — Amey, Bear Scotland, or Ringway Jacobs depending on the area. Report and claim via Transport Scotland's website.

## Emergency Tyre Replacement After a Pothole

If your tyre is damaged beyond use and you cannot drive, call **0141 266 0690**. Tyre Rescue attends pothole-related tyre emergencies across all of Scotland — from city streets to remote Highland roads. We carry replacement tyres and will assess whether the wheel itself needs attention before fitting.

**Typical response times after a pothole emergency:**
- Glasgow and Central Belt: 30–50 minutes
- Edinburgh: 55–70 minutes
- Dundee and Perth: 65–85 minutes
- Aberdeen and Inverness: 90 minutes

[Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland)`,
  },
  {
    slug: 'part-worn-tyres-scotland-are-they-safe',
    title: 'Part-Worn Tyres in Scotland: Are They Safe? The Honest Answer',
    description:
      'Are part-worn tyres a safe choice in Scotland? We look at the evidence, the risks, the legal requirements, and when — if ever — a part-worn tyre is acceptable.',
    category: 'safety',
    publishDate: '2025-12-01',
    lastModified: '2025-12-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'part worn tyres scotland',
      'part worn tyres safe scotland',
      'part worn tyres legal uk',
      'are part worn tyres worth it scotland',
      'second hand tyres glasgow',
      'part worn vs new tyres scotland',
      'cheap tyres glasgow scotland',
      'part worn tyre risks uk',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'tyre-age-when-to-replace-scotland',
      'best-tyres-scottish-roads-guide',
    ],
    content: `# Part-Worn Tyres in Scotland: Are They Safe? The Honest Answer

With the cost of living increasing, part-worn tyres are an appealing option for budget-conscious Scottish drivers. But are they safe? This guide gives an honest, evidence-based answer — not a sales pitch.

## What Are Part-Worn Tyres?

Part-worn tyres are used tyres removed from other vehicles and sold on. They can come from:
- Vehicles written off in accidents
- Fleet vehicle replacements (often replaced at 3–4mm tread rather than the legal minimum)
- Continental imports (where minimum tread requirements differ)
- Tyre wholesalers who buy in bulk from European markets

## The Legal Requirements for Part-Worn Tyres in the UK

Part-worn tyres are legal to sell in the UK, but they must meet specific requirements under the Motor Vehicle Tyres (Safety) Regulations 1994:

- Tread depth: minimum **2mm** across the full tread width (not the 1.6mm legal minimum for cars)
- No bulges, lumps, or exposed cords
- No deep cuts on the sidewall (over 25mm or 10% of section width)
- Must be marked **'PART WORN'** in letters at least 4mm high

## The Problem: Most Part-Worn Tyres on Sale Do Not Meet Legal Requirements

This is the most important fact in this guide.

**Two major undercover investigations — by TyreSafe in 2014 and Which? in 2020 — found that over 50% of part-worn tyres tested failed to meet legal requirements.** Common failures:
- Tread below 2mm or unevenly worn
- Bulges or internal damage not visible externally
- Missing 'PART WORN' marking
- Tyres that had been run flat and were structurally compromised
- Regrooved treads (illegal on UK passenger cars)

When buying a part-worn tyre, you cannot know its history. It may have been:
- Run flat (internal damage invisible from the outside)
- Repaired improperly
- Past the age at which rubber degrades
- Previously on an overloaded vehicle

## The Performance Reality

Even a legal, well-selected part-worn tyre starts life with less tread than a new tyre. A part-worn tyre sold at 3mm tread will need replacing after far fewer miles than a new tyre at 8mm. The total cost of ownership over the tyre's remaining usable life is often worse than buying new.

**Wet braking performance** also correlates directly with tread depth. A part-worn at 3mm on Scotland's wet roads offers significantly worse braking than a new tyre. For context:
- New tyre at 8mm: baseline stopping distance
- 3mm tread: 27% longer stopping distance in wet conditions
- 1.6mm (legal limit): 44% longer

## When Part-Worn Tyres Are and Are Not Acceptable

### Never acceptable:
- Sidewall damage or any internal unknown history
- Tyres from unmarked or informal sellers with no provenance
- Tyres where the seller cannot provide the original tyre size, age, or vehicle history
- Tyres for regular use on Highland roads, the NC500, or remote routes where a blowout could be life-threatening

### Potentially acceptable (with serious caveats):
- A quality fleet removal from a reputable seller, at 4mm+ tread, where age is confirmed under 5 years
- Temporary use while waiting for a new tyre order
- Secondary vehicle with low mileage and urban-only use

Even in these cases, a budget new tyre from a reputable brand (Nexen, Hankook, Falken) costs only marginally more and comes with known history, full tread depth, and manufacturer guarantee.

## Tyre Rescue's Position on Part-Worn Tyres

We stock and can supply part-worn tyres as a service option, and we follow all legal requirements when selling them. However, our honest recommendation to most Scottish drivers is:

**Buy the cheapest new tyre you can afford before considering a part-worn.**

Budget new tyres from Nexen, Hankook, Falken, or Toyo start from approximately £40–£55 for common sizes. This is not dramatically more than a quality part-worn, and it buys you: full tread depth, known age and history, a manufacturer guarantee, and EU tyre label ratings.

For Scottish roads — particularly in wet conditions, on the NC500, or in winter — we believe the additional cost is worth it.

## Get an Honest Quote for New Tyres

Call **0141 266 0690** or [book online](/book) and tell us your tyre size. We will quote both new tyre options (budget, mid-range, premium) and let you make an informed decision.

[Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'spare-tyre-uk-law-scotland',
    title: 'Spare Tyres: UK Law, Your Rights & What to Do Without One',
    description:
      'Is it illegal to drive without a spare tyre in the UK? What are your options — space-saver, run-flat, tyre repair kit? And what to do when you get a flat with no spare in Scotland.',
    category: 'safety',
    publishDate: '2025-11-15',
    lastModified: '2025-11-15',
    readingTime: 6,
    featured: false,
    keywords: [
      'spare tyre law uk',
      'is it illegal to drive without spare tyre uk',
      'no spare tyre what to do',
      'space saver spare tyre scotland',
      'tyre repair kit vs spare tyre',
      'flat tyre no spare scotland',
      'run flat spare tyre',
      'breakdown without spare tyre scotland',
    ],
    relatedSlugs: [
      'what-to-do-flat-tyre-motorway',
      'run-flat-tyres-scotland-guide',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Spare Tyres: UK Law, Your Rights & What to Do Without One

Many modern cars no longer include a full-size spare tyre. If you are not sure what your car has — or does not have — read this guide before you get a flat tyre in rural Scotland.

## Is It Illegal to Drive Without a Spare Tyre in the UK?

**No. There is no legal requirement to carry a spare tyre in the UK.**

Unlike some European countries (Germany, for example, requires a spare or run-flat system), UK law does not mandate that vehicles carry a spare. You can legally drive without one.

However, if your vehicle is designed for run-flat tyres and you have fitted conventional tyres without run-flat capability, and you then get a flat in a remote location, you are responsible for the consequences — there is no legal cover for that.

## What Modern Cars Have Instead of a Spare Tyre

### Option 1: Run-Flat Tyres
Many BMWs, MINIs, and Mercedes models come fitted with run-flat tyres. These reinforced tyres allow limited driving (50mph, 50 miles) on zero pressure. There is no spare wheel at all.

Advantage: no space or weight penalty from a spare.
Disadvantage: run-flat tyres cost more to replace, cannot typically be repaired, and the 50-mile range is insufficient for remote Scottish locations.

### Option 2: Space-Saver Spare (Temporary Use Spare)
A smaller, lighter spare wheel designed for short-term use. Usually stored in the boot well. Identified by its narrower profile and typically yellow or orange markings.

Rules for space-saver use:
- Maximum speed: 50mph (80km/h)
- Maximum distance: 50 miles recommended (though not legally enforced)
- Do not use for long journeys or at motorway speed
- Replace with a full-size tyre as soon as possible

A space-saver is suitable for reaching the nearest tyre fitter after a flat, which in the Central Belt of Scotland is rarely more than 10–15 miles. For Highland and remote routes, be aware that the nearest fitter could be further.

### Option 3: Tyre Inflation / Repair Kit
Many modern cars include only a can of tyre sealant and a portable compressor. This is the manufacturer's compromise to save weight.

The inflation kit works for:
- Small punctures in the tread area (not sidewall damage)
- Slow leaks where the tyre is not fully flat

The kit does NOT work for:
- Blowouts
- Sidewall damage
- Punctures larger than approximately 4mm
- Tyres that have been driven flat

**If you use sealant, tell the tyre fitter** — sealant inside the tyre must be cleaned out before a new tyre is fitted. It also makes the puncture non-repairable.

### Option 4: Full-Size Spare (Matching Spare)
The traditional solution. Some vehicles — particularly large SUVs and pickup trucks — still include a full-size spare identical to the fitted tyres. This allows normal driving speed and distance without restriction.

## What to Do When You Have a Flat and No Spare in Scotland

1. **Assess the tyre**: Is it slowly losing air (puncture) or rapidly flat (blowout/sidewall)?
2. **Check for a repair kit**: If your car has one and the puncture is in the tread, attempt inflation and sealant
3. **Do not drive on a flat tyre**: Driving even 100 metres on a completely flat tyre can destroy the tyre, the rim, and potentially the brake caliper
4. **Call Tyre Rescue**: 0141 266 0690 — we come to you anywhere in Scotland, 24 hours a day

If you are on a remote Highland road, Argyll coast, or island route, call immediately. Do not wait to see if the sealant works on a serious puncture — losing pressure on a remote road is the more dangerous outcome.

## Should You Buy a Spare Tyre for Your Car?

If your vehicle does not include a space-saver or full-size spare, you can purchase one. Options:

- **Space-saver spare + correct jack and wrench**: Typically £80–£150. Requires checking that the space-saver is the correct bolt pattern for your vehicle.
- **Full-size spare**: £150–£350 for tyre + matching steel wheel. Requires boot space for storage.
- **Continue with run-flat/sealant and rely on mobile tyre fitting**: The correct choice for most Central Belt drivers where response times are 30–50 minutes.

For **Highland and remote Scottish drivers**, carrying a space-saver spare is strongly recommended if your vehicle does not include one. 50 miles from help is a very different situation from 5 miles.

## Emergency Tyre Help Anywhere in Scotland

Whether you have a spare tyre or not, Tyre Rescue can reach you with a replacement tyre anywhere in Scotland. Call **0141 266 0690** — 24 hours a day, 7 days a week.

[Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Run-flat tyres guide](/blog/run-flat-tyres-scotland-guide) | [What to do flat tyre motorway](/blog/what-to-do-flat-tyre-motorway)`,
  },
  {
    slug: 'tyre-age-when-to-replace-scotland',
    title: 'Tyre Age: When Should You Replace Old Tyres in Scotland?',
    description:
      'How old is too old for a tyre? The DOT date code explained, why age matters even with good tread, and the recommended replacement timeline for Scottish conditions.',
    category: 'safety',
    publishDate: '2025-11-15',
    lastModified: '2025-11-15',
    readingTime: 5,
    featured: false,
    keywords: [
      'how old are my tyres',
      'tyre age scotland',
      'when to replace old tyres',
      'dot date code tyre',
      'tyre expiry date uk',
      'old tyres dangerous scotland',
      'tyre age limit uk',
      'tyre condition check scotland',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'tyre-maintenance-checklist-scotland',
      'signs-you-need-new-tyres',
    ],
    content: `# Tyre Age: When Should You Replace Old Tyres in Scotland?

A tyre with plenty of tread can still be dangerous. As rubber ages, it degrades — becoming brittle, losing elasticity, and developing microscopic cracks that are not always visible to the naked eye. This is particularly relevant in Scotland's climate, where temperature extremes and UV exposure accelerate ageing.

## The DOT Date Code: How to Find Your Tyre's Age

Every tyre manufactured for sale in the EU and UK has a DOT (Department of Transportation) code moulded into one of its sidewalls. The date of manufacture is the last four digits of this code.

**Example**: If you see **DOT ... 3218**, the tyre was manufactured in **week 32 of 2018** — that is approximately August 2018.

To read the code:
1. Look for the letters 'DOT' on the tyre sidewall
2. Find the sequence of numbers that follows
3. The last four digits are the week (first two) and year (last two) of manufacture

Some tyres show the DOT code on the inner sidewall — check both sides if you cannot find it on the outer face.

## How Old Is Too Old?

There is no single legal limit on tyre age in the UK for private cars (HGVs and coaches have stricter rules — tyres over 10 years old on front axles are prohibited).

However, the industry consensus and the recommendations of major tyre manufacturers are:

| Tyre Age | Recommendation |
|----------|----------------|
| Under 5 years | Normal use — monitor condition |
| 5–10 years | Annual inspection by a qualified fitter recommended |
| Over 10 years | Replace regardless of visual condition or tread depth |

**In Scotland's conditions** — temperature extremes from -15°C in the Highlands to 25°C+ in summer, significant rainfall, UV exposure on highland routes — the timeline shifts slightly:

- Annual inspection from **5 years**
- Replacement at **7–8 years** if the vehicle is driven frequently or on demanding routes

## Why Does Tyre Age Matter?

Rubber compounds contain anti-oxidants and anti-ozonants that slow degradation. As these compounds are depleted over time, the rubber becomes less elastic. The effects include:

- **Micro-cracking**: Tiny cracks develop in the tread and sidewall, often not visible without close inspection
- **Hardening**: The tyre loses its ability to conform to road surface irregularities, reducing grip
- **Reduced wet performance**: A hardened tyre sheds water less effectively, increasing aquaplaning risk
- **Increased blowout risk**: Aged rubber is less able to withstand sudden pressure changes, particularly at motorway speeds

On Scotland's roads — where rain is frequent and motorway sections of the A9, M8, and M74 see high speeds — these risks are more acute than for low-speed urban driving.

## Visible Signs of Tyre Ageing

In addition to the date code, inspect for:

- **Surface cracking**: Fine cracks in the tread groove walls or sidewall, often described as 'crazing' or 'checking'
- **Sidewall cracking**: Cracks that run parallel to the tyre's circumference on the sidewall
- **Bulging**: Any bulge or deformation, regardless of age
- **Discolouration**: Excessive yellowing or greying of the rubber

Any visible cracking beyond superficial surface marks warrants immediate replacement, regardless of tread depth.

## Caravan and Trailer Tyres

Caravan and trailer tyres age faster than vehicle tyres because they are typically stored for months each year, often in exposed conditions. The industry recommendation for caravan tyres is **replacement at 5 years**, regardless of condition or tread. Scotland's camping and touring season means many caravans are stored from October to March — the UV and temperature cycles during storage accelerate ageing even when the caravan is not moving.

## How to Check Your Tyres' Age

1. Locate the DOT code on each tyre sidewall
2. Calculate the age from the four-digit date code
3. If any tyre is over 10 years old, book replacement immediately
4. If 5–10 years, arrange a professional inspection

Tyre Rescue will assess tyre age and condition at the time of any callout. If we identify aged tyres during a fitting visit, we will advise — and can fit replacements at the same visit.

**Call 0141 266 0690** to arrange a tyre age check and replacement across Scotland.

[Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Signs you need new tyres](/blog/signs-you-need-new-tyres) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'winter-tyres-when-to-switch-scotland',
    title: 'Winter Tyres in Scotland: When to Switch and Is It Worth It?',
    description:
      'Should you fit winter tyres in Scotland? When to switch, which areas benefit most, cost comparison, and whether all-season tyres are a better option for most Scottish drivers.',
    category: 'safety',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'winter tyres scotland',
      'when to switch winter tyres scotland',
      'winter tyres worth it scotland',
      'winter tyres glasgow',
      'winter tyres highlands scotland',
      'all season vs winter tyres scotland',
      'winter tyres vs summer tyres',
      'mobile winter tyre fitting scotland',
    ],
    relatedSlugs: [
      'winter-tyres-scotland-guide',
      'best-tyres-scottish-roads-guide',
      'tyre-pressure-guide-scotland',
    ],
    content: `# Winter Tyres in Scotland: When to Switch and Is It Worth It?

Scotland's climate makes this a more relevant question than in most of England. The Highlands can see significant snow and ice from October; even the Central Belt experiences dozens of sub-zero mornings per winter. This guide helps you decide whether winter tyres are worth the investment and, if so, when to make the switch.

## The Seven Degree Rule

The switch to winter tyres is not primarily about snow — it is about temperature. Winter tyres use a softer rubber compound that remains pliable and grippy in cold temperatures. That threshold is **7°C (44°F)**.

Below 7°C:
- Summer tyre compound hardens, reducing wet grip and increasing braking distance
- Winter tyre compound stays flexible, maintaining grip levels similar to summer tyres at higher temperatures

In Scotland, average daily temperatures regularly fall below 7°C from **late October**, with some Highland and northern areas seeing sub-7°C temperatures from mid-September. The switch should be made before you regularly experience temperatures at or below this threshold — not after the first frost.

## When to Switch: Scotland by Region

| Region | Typical Switch Date | Typical Switch Back |
|--------|---------------------|---------------------|
| Shetland, Orkney | Mid-September | Mid-May |
| Caithness, Sutherland | Late September | Early May |
| Inverness, Highlands | Early October | Late April |
| Aberdeen, Dundee | Mid-October | Mid-April |
| Perth, Stirling | Late October | Early April |
| Glasgow, Edinburgh | Late October | Late March |
| Ayrshire, Borders | Early November | Late March |

These are approximate guidelines. In any year, early autumn cold snaps or mild winters may shift these dates by 2–3 weeks.

## The Case for Winter Tyres in Scotland

### Highlands and Remote Areas
For drivers in the Highlands, Argyll, Caithness, or the Scottish islands, winter tyres are strongly advisable. The combination of:
- More sub-zero days
- More snowfall (A9 over Drumochter, A82 through Glencoe)
- Longer distances from help

...makes the safety case clear. A tyre blowout or loss of control on a remote Highland road in January has much more serious consequences than the same incident on a suburban road.

### NC500 and Touring Routes
If you drive the NC500 between October and April, winter tyres (or at minimum, good all-season tyres with the Three Peak Mountain Snowflake symbol) are strongly recommended. The route covers some of Scotland's highest and most exposed roads.

### Central Belt Commuters
For city drivers in Glasgow and Edinburgh, winter tyres offer measurable safety benefits on wet winter roads — even without snow. The question is cost versus benefit.

**With winter tyres**: 10–30% shorter wet braking distances; better grip in cold, damp conditions; confidence in sub-zero temperatures.

**Without winter tyres**: Manageable in most years with good quality summer or all-season tyres; but significant risk in the event of a sudden cold snap, early snow, or icy morning commute.

## The Case Against: All-Season Tyres as a Compromise

For many Scottish drivers — particularly those in the Central Belt who do not want to manage two sets of tyres — **all-season tyres** offer a compelling middle ground.

Premium all-season tyres from Michelin (CrossClimate 2), Continental (AllSeasonContact 2), or Goodyear (Vector 4Seasons Gen 3) carry the Three Peak Mountain Snowflake symbol, meaning they meet genuine winter performance standards. They are:
- Usable year-round
- No storage or seasonal swap required
- Typically 30–50% cheaper over 3 years than running two full sets
- Approved by insurers as acceptable year-round tyres

The compromise: they do not perform quite as well as dedicated winter tyres in extreme cold (-10°C and below) or deep snow. For most Central Belt drivers who rarely encounter extreme conditions, this compromise is acceptable.

**Our recommendation for Scotland:**
- **Central Belt drivers**: Premium all-season tyres (CrossClimate 2 / AllSeasonContact 2)
- **Highland drivers**: Dedicated winter tyres October to April; summer tyres the rest of the year
- **NC500 / remote rural drivers**: Same as Highland recommendation

## Cost of Winter Tyre Fitting in Scotland

A set of four winter tyres fitted by Tyre Rescue, including mounting and balancing:

- **Budget winter tyres** (Nexen, Falken): from approximately £280–£360 per set fitted
- **Mid-range** (Hankook, Kumho): from approximately £360–£460 per set fitted
- **Premium** (Michelin, Continental, Bridgestone): from approximately £500–£700 per set fitted

If you already own a set of steel winter wheels, switching between summer and winter rubber costs approximately **£60–£80** (dismount, mount, balance, four wheels) each time — about £120–£160 per year.

## Insurance and Winter Tyres in Scotland

Winter tyres are legal in the UK. Fitting them does not invalidate your insurance. However, you should inform your insurer that you are using winter tyres, as some policies note this. No reputable UK insurer charges a premium for winter tyres — if anything, you may be able to negotiate a small discount as a safety improvement.

## Book Winter Tyre Fitting

Tyre Rescue fits winter tyres across all of Scotland — at your home, work, or roadside. We carry a range of winter tyres and can supply and fit at short notice.

**Call 0141 266 0690** or [book online](/book) to arrange winter tyre fitting before the cold weather arrives.

[Winter tyres Scotland guide](/blog/winter-tyres-scotland-guide) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'van-tyre-fitting-scotland',
    title: 'Van Tyre Fitting Scotland: Commercial Vehicles & Fleets',
    description:
      'Mobile van tyre fitting across Scotland for tradespeople, delivery drivers, and fleets. Load-rated tyres for Transit, Sprinter, Vivaro and more. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2025-11-01',
    lastModified: '2025-11-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'van tyre fitting scotland',
      'commercial tyre fitting scotland',
      'transit van tyres scotland',
      'sprinter tyres scotland',
      'fleet tyre fitting scotland',
      'mobile van tyre fitting glasgow',
      'commercial vehicle tyres scotland',
      'van tyre replacement near me scotland',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-vs-garage',
      '24-hour-emergency-tyre-fitting-scotland',
      'best-tyres-scottish-roads-guide',
    ],
    content: `# Van Tyre Fitting Scotland: Commercial Vehicles & Fleets

A flat tyre on a van is not just an inconvenience — it is a lost job, a missed delivery, and a day's revenue gone. Tyre Rescue operates across all of Scotland with vans equipped to fit commercial vehicle tyres, including load-rated tyres for Ford Transit, Mercedes Sprinter, Vauxhall Vivaro, VW Crafter, Renault Trafic, Citroën Dispatch, and similar vehicles.

## Why Commercial Tyres Are Different

Vans and light commercial vehicles require tyres with higher load ratings than equivalent passenger cars. A fully loaded Transit Custom can weigh over 3,500kg — and each tyre must support a quarter of that weight, plus cornering and braking forces.

Commercial tyres carry a **C-rating** designation (e.g., 195/70R15C) and are designed for:
- Higher load indices (typically 104/102 load rating for twin rear fitment)
- Reinforced sidewalls to resist damage from kerbing and loading dock impacts
- Higher inflation pressures to support maximum payload
- Stiffer carcass construction to resist deformation under heavy loads

Fitting a standard passenger car tyre on a van — even one with a similar size — is dangerous and potentially illegal if the load index is insufficient.

## Common Commercial Tyre Sizes We Stock

Tyre Rescue carries common commercial tyre sizes for the most popular vans in Scotland:

- **Ford Transit Custom**: 215/65R16C, 205/75R16C
- **Ford Transit (large)**: 235/65R16C, 215/75R16C
- **Mercedes Sprinter**: 215/65R16C, 225/65R16C, 235/65R16C
- **Vauxhall Vivaro / Renault Trafic**: 195/65R16C, 215/60R17C
- **VW Crafter / MAN TGE**: 235/65R16C, 225/75R16C
- **Citroën Dispatch / Peugeot Expert**: 215/60R17C, 235/60R17C
- **Nissan NV200**: 185R14C, 195R14C

For less common sizes, call **0141 266 0690** with your registration number. We can check your exact size and source it within a few hours if not on our vans.

## Emergency Van Tyre Fitting Scotland

For tradespeople, delivery drivers, and anyone whose income depends on their van being on the road, waiting until the next day for a tyre is not an option. Tyre Rescue provides 24/7 emergency van tyre fitting across Scotland.

**Typical response times:**
- Glasgow and Central Belt: 30–50 minutes
- Edinburgh: 55–70 minutes
- Aberdeen: 90 minutes
- Inverness: 90–120 minutes
- Highlands and rural Scotland: 2–3 hours (call ahead)

We come to your van — whether you are at a job site, a delivery stop, a motorway lay-by, or your home depot.

## Fleet Tyre Management Scotland

For businesses running multiple vans or commercial vehicles, Tyre Rescue can provide:

- **Scheduled fleet tyre checks**: We attend your depot and inspect, rotate, or replace tyres on a planned schedule
- **Priority response for fleet vehicles**: Faster dispatch and priority parts sourcing for contract customers
- **Fleet billing**: Monthly invoicing available for businesses with multiple vehicles

Contact us on **0141 266 0690** to discuss fleet tyre management arrangements for your Scotland operation.

## Tyre Quality Options for Commercial Vehicles

### Budget Commercial Tyres
Brands including Nexen, Hankook, Falken, and Toyo offer commercial-rated tyres at significantly lower prices than premium brands. Suitable for lower-mileage van operators and secondary vehicles. Load ratings match the spec; longevity and rolling resistance are lower than premium.

### Premium Commercial Tyres
Michelin Agilis, Continental VanContact, and Bridgestone Duravis offer superior mileage (often 40,000+ miles in controlled conditions), lower rolling resistance (better fuel economy on long Scottish routes), and better wet braking performance. For high-mileage Scottish delivery fleets and tradespeople who do significant motorway mileage, the higher upfront cost is typically recovered in tyre longevity and fuel savings.

## Van Tyre Fitting at Your Location

Whether you are a sole trader in Glasgow, a courier operation running vans from Edinburgh to Aberdeen, or a Highland trade contractor — call **0141 266 0690** and we will dispatch the right van with the right tyres for your vehicle.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Tyre fitting costs Scotland](/blog/tyre-fitting-costs-scotland-pricing-guide)`,
  },
  {
    slug: 'electric-vehicle-tyres-scotland',
    title: 'Electric Vehicle Tyres in Scotland: What You Need to Know',
    description:
      'EV tyres are different from standard tyres — heavier cars, instant torque, regenerative braking. Here\'s what to know about EV tyre replacement and mobile fitting in Scotland.',
    category: 'maintenance',
    publishDate: '2025-11-01',
    lastModified: '2025-11-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'electric vehicle tyres scotland',
      'ev tyres scotland',
      'tesla tyres scotland',
      'electric car tyres uk',
      'ev tyre replacement scotland',
      'mobile tyre fitting ev scotland',
      'electric car tyre wear',
      'ev tyre cost scotland',
    ],
    relatedSlugs: [
      'best-tyres-scottish-roads-guide',
      'run-flat-tyres-scotland-guide',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# Electric Vehicle Tyres in Scotland: What You Need to Know

Electric vehicles are increasingly common on Scottish roads. If you drive an EV or are planning to switch, there are important things to know about tyres specifically — EV tyres are not identical to standard tyres, and the wrong choice can affect range, handling, and safety.

## Why EV Tyres Are Different

### Heavier Vehicles
Electric vehicles are significantly heavier than equivalent petrol cars. A Tesla Model 3 weighs approximately 1,850kg; a comparable BMW 3 Series petrol weighs 1,500kg. The extra weight — almost entirely from the battery pack — demands tyres with higher load ratings. Fitting a tyre with an inadequate load index on an EV is a safety risk.

### Instant Torque
Electric motors deliver maximum torque immediately — no build-up through gear changes. This places greater stress on the rear (or all-wheel drive) tyres during acceleration. Tyre wear rates can be higher than petrol equivalents if the driver uses full torque frequently.

### Regenerative Braking
EVs use regenerative braking to recover energy. This means the mechanical brakes are used less frequently, which can change wear patterns. Front tyres may wear faster than rear tyres compared to petrol cars in some EV configurations.

### Noise Sensitivity
Petrol engine noise masks road noise from conventional tyres. In the near-silent cabin of an EV, tyre noise becomes very noticeable. Many EV-specific tyres include foam or resonator technology inside the tyre to reduce this cabin noise.

## EV-Specific Tyre Markings

Look for these markings on tyres suitable for electric vehicles:

- **Michelin**: 'EL' (Electric) or 'Acoustic' — includes foam noise-absorbing layer
- **Continental**: 'ContiSilent' — acoustic foam technology; 'ContiRe.Tex' — sustainable compound
- **Bridgestone**: 'Enliten' — low rolling resistance; 'Ologic' — narrower profile for reduced drag
- **Goodyear**: 'EfficientGrip Performance 2 EV' — reinforced for EV load and torque
- **Pirelli**: 'Elect' — specifically engineered for EVs

Tyres not specifically designed for EVs can still be fitted — the key is matching the correct load index and speed rating. However, EV-specific tyres optimise for the three key EV factors: low rolling resistance (to maximise range), high load capacity, and acoustic comfort.

## Tyre Choice and Range

Rolling resistance directly affects battery range. A low rolling resistance tyre can improve EV range by 5–10% compared to a high rolling resistance equivalent. Over a year of Scottish driving, this can represent a meaningful reduction in charging costs.

On Scotland's longer routes — the A9 to Inverness, the A82 through Glencoe, or inter-island ferry connections — maximising range is particularly valuable. Choose tyres with an A or B EU label fuel efficiency rating.

## EV Tyre Wear in Scotland

EVs tend to wear tyres faster than petrol cars of similar size, due to weight and torque. Scottish roads add to this: the frequent urban stop-start of Glasgow and Edinburgh, combined with the twisting demands of rural Highland roads, create a more demanding environment than motorway-focused driving in England.

Typical EV tyre life on Scottish roads: 20,000–35,000 miles, depending on driving style and tyre specification. This is broadly similar to petrol equivalents — the EV weight and torque disadvantage is partially offset by less aggressive use of mechanical brakes, which would otherwise cause front tyre wear.

## Run-Flat Tyres on EVs

Many EVs — particularly BMWs — do not include a spare wheel, and are supplied with run-flat tyres. This is more common on EVs than petrol cars because run-flat tyres eliminate the weight penalty of a spare wheel (valuable for range).

If your EV has run-flat tyres:
- The rules are the same: drive at maximum 50mph for maximum 50 miles when deflated
- In remote Scottish locations, this range may not be enough — call for help early
- Run-flat tyres on EVs can be harder to source than standard run-flats due to the specific load index requirements

## Mobile Tyre Fitting for EVs in Scotland

Tyre Rescue can fit tyres on all EV makes and models across Scotland, including:
- Tesla Model 3, Model Y, Model S, Model X
- BMW i3, i4, iX
- Nissan Leaf, Nissan Ariya
- Volkswagen ID.3, ID.4
- Hyundai Ioniq 5 and 6
- Kia EV6
- Polestar 2
- Renault Zoe

When calling **0141 266 0690**, mention that you drive an EV and your vehicle model. We will confirm the correct load index and speed rating for your specific car and let you know which EV-optimised tyres we have in stock.

Note: EV tyres are generally 10–30% more expensive than standard equivalent tyres due to their specialised construction. We stock budget, mid-range, and premium EV-compatible options.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Run-flat tyres Scotland guide](/blog/run-flat-tyres-scotland-guide) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide)`,
  },
  {
    slug: 'tyre-pressure-guide-scotland',
    title: 'Tyre Pressure Guide for Scotland: Correct PSI, Checking & Inflation',
    description:
      'What is the correct tyre pressure for your car? How to check and inflate tyres, why pressure matters more on Scottish roads, and what to do if you have a slow puncture.',
    category: 'maintenance',
    publishDate: '2025-11-01',
    lastModified: '2025-11-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'tyre pressure guide scotland',
      'correct tyre pressure uk',
      'how to check tyre pressure',
      'tyre pressure psi scotland',
      'low tyre pressure warning',
      'tyre pressure cold weather scotland',
      'slow puncture scotland',
      'where to inflate tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'tyre-maintenance-checklist-scotland',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# Tyre Pressure Guide for Scotland: Correct PSI, Checking & Inflation

Correct tyre pressure is one of the simplest and most impactful things you can do for vehicle safety, tyre longevity, and fuel economy. Yet UK government data consistently shows that around one in four cars has at least one significantly under-inflated tyre.

## Why Correct Tyre Pressure Matters in Scotland

### Safety
Under-inflated tyres flex more, generate more heat, and are more prone to blowout — particularly at motorway speeds. Over-inflated tyres have a smaller contact patch with the road, reducing grip. Both extremes increase wet braking distance.

On Scotland's wet roads, this is especially significant. Aquaplaning — where a tyre loses contact with the road on a thin film of water — is more likely on an under-inflated tyre.

### Tyre Life
A tyre 20% under its recommended pressure wears approximately 25% faster, primarily on the outer edges. A tyre 20% over-pressure wears faster in the centre of the tread. Correct pressure means even wear and maximum tyre lifespan.

### Fuel Economy
Rolling resistance increases significantly when tyres are under-inflated. UK government testing shows that driving on tyres 10 PSI below the correct pressure increases fuel consumption by approximately 2–3%. Over a year of driving, this is a meaningful cost.

## Finding Your Recommended Tyre Pressure

The recommended tyre pressure for your specific vehicle is found in three places:

1. **Driver's door placard**: A sticker on the inside of the driver's door (or sometimes the B-pillar). This is the most reliable source.
2. **Fuel cap sticker**: Some vehicles have the pressure information on the inside of the fuel cap.
3. **Vehicle handbook**: The specification or maintenance section.

**Important**: Pressures are typically given for cold tyres — tyres that have not been driven on for at least three hours. Driving warms the air inside the tyre, temporarily increasing pressure. Do not reduce the pressure to match a "cold" reading if the tyres are warm.

### Common Recommended Pressures by Vehicle Type

| Vehicle Type | Typical Front | Typical Rear | Note |
|--------------|---------------|--------------|------|
| Small hatchback (Fiesta, Polo) | 30–33 PSI | 28–32 PSI | Check door placard |
| Medium saloon/estate | 32–36 PSI | 30–35 PSI | Often different front/rear |
| Large SUV (RAV4, Tiguan) | 35–38 PSI | 35–38 PSI | Higher loads need higher pressure |
| EV (Tesla Model 3, BMW i4) | 42–45 PSI | 42–45 PSI | Higher than petrol equivalents |

These are indicative only — always use your vehicle's specific recommendation.

### Loaded vs Unloaded Pressure

Many door placards give two sets of pressures: normal load (one or two occupants, no luggage) and full load (maximum passengers and/or towing). If you regularly carry heavy loads — common in Scotland when camping, driving to the islands with luggage, or towing a caravan or boat — use the higher loaded pressure.

## How to Check Tyre Pressure

### Equipment
- **Tyre pressure gauge**: A basic digital or dial gauge costs from £5 and gives reliable readings. Available at any motorist's shop.
- **Petrol station air pump**: Most petrol stations have a combined pressure gauge and air pump. Some charge a small fee (typically 20–50p); most are free or included in fuel purchase.

### Procedure
1. Check the recommended pressure on your door placard
2. Remove the valve cap from the tyre (keep it safe)
3. Press the gauge firmly onto the valve — you will hear a brief hiss as it seals
4. Read the pressure (PSI or bar)
5. Compare to the recommended figure
6. Add air to increase pressure; press the pin inside the valve to release air if over-inflated
7. Recheck the pressure after adjusting
8. Replace the valve cap

Check all four tyres and the spare (if your vehicle has one).

## Tyre Pressure in Cold Scottish Weather

Temperature directly affects tyre pressure. For every 10°C drop in temperature, tyre pressure decreases by approximately 1 PSI. Scotland experiences significant temperature swings — it is not uncommon for temperatures to drop 15–20°C between a warm autumn afternoon and a cold winter morning.

This means:
- In October, pressures that were correct in August may be 2 PSI low
- Check pressures when the temperature changes significantly
- Do not rely on summer pressure checks carrying through to winter

If your TPMS warning light comes on in winter, cold weather pressure drop is often the cause — check pressures and inflate to the correct level before assuming a puncture.

## Slow Punctures: How to Tell

A slow puncture is a gradual air loss from a tyre — not immediately flat, but losing pressure over days or weeks. Signs include:
- One tyre consistently lower than the others when you check pressure
- TPMS warning light appearing repeatedly after you inflate the tyre
- Handling feeling slightly different (slight pull to one side, especially on corners)

A slow puncture is usually caused by a nail or screw embedded in the tread area (which does not cause instant deflation) or a faulty valve. Check the tyre surface for foreign objects and the valve for a leaking core.

**Do not ignore a slow puncture** — the object causing the leak will work deeper into the tyre with continued use, eventually causing rapid deflation or making the tyre unrepairable.

Tyre Rescue can diagnose and repair a slow puncture at your location across all of Scotland. Call **0141 266 0690**.

## Key Numbers to Remember

- Check pressure: monthly and before long journeys
- Pressure drops: approximately 1 PSI per 10°C temperature fall
- Under-inflation threshold: TPMS warns at 25% below recommended pressure
- Tyre life penalty: 25% faster wear for 20% under-inflation

[TPMS warning light guide](/blog/tpms-warning-light-scotland-guide) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Tyre maintenance checklist](/blog/tyre-maintenance-checklist-scotland)`,
  },
  {
    slug: 'how-to-read-tyre-size-markings',
    title: 'How to Read Tyre Size Markings: 205/55R16 Explained',
    description:
      'What do the numbers on a tyre mean? This guide explains every marking on your tyre sidewall — width, profile, rim size, load rating, speed rating — so you can buy the right tyre.',
    category: 'maintenance',
    publishDate: '2025-10-15',
    lastModified: '2025-10-15',
    readingTime: 6,
    featured: false,
    keywords: [
      'how to read tyre size',
      'tyre size explained',
      'what do tyre numbers mean',
      '205 55 r16 meaning',
      'tyre width profile rim size',
      'tyre load rating speed rating',
      'tyre markings explained uk',
      'what size tyres do i need',
    ],
    relatedSlugs: [
      'tyre-maintenance-checklist-scotland',
      'best-tyres-scottish-roads-guide',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# How to Read Tyre Size Markings: 205/55R16 Explained

Every tyre has a code printed on its sidewall — a sequence of numbers, letters, and symbols that defines its exact specification. Understanding these markings is essential when you need to replace a tyre, buy spares, or simply check whether the tyre on your vehicle is correct.

## The Main Size Code: 205/55R16

Using the example 205/55R16:

### 205 — Tyre Width (in millimetres)
This is the width of the tyre across its widest point, measured in millimetres. A wider tyre provides more road contact and can improve grip, but it also increases rolling resistance and fuel consumption. Common widths range from 135mm (small city cars) to 315mm (performance SUVs).

### 55 — Aspect Ratio (Profile)
This is the height of the tyre sidewall expressed as a percentage of the width. So for a 205/55 tyre, the sidewall height is 55% of 205mm = 112.75mm.

- A **lower profile** (e.g., 35 or 40) looks sportier and improves handling precision but gives a harsher ride and is more vulnerable to pothole damage — a significant consideration on Scottish Highland roads.
- A **higher profile** (e.g., 65 or 70) gives a more comfortable ride and better cushioning on rough surfaces.

### R — Radial Construction
The 'R' indicates radial tyre construction — the standard for all modern passenger car tyres. (The alternative, 'D' for diagonal/bias-ply, is now rare and used mainly on older vehicles and some motorcycles.)

### 16 — Rim Diameter (in inches)
This is the diameter of the wheel rim the tyre fits onto, measured in inches. This must match your wheel exactly — a 16-inch tyre will only fit a 16-inch rim.

## Additional Markings: Speed Rating and Load Index

After the main size code, you will typically see two more characters, e.g., **91V** or **88H**.

### Load Index (the number)
The load index tells you the maximum weight each tyre can carry. Common values:

| Load Index | Max Load per Tyre |
|------------|-------------------|
| 80         | 450 kg            |
| 88         | 560 kg            |
| 91         | 615 kg            |
| 95         | 690 kg            |
| 101        | 825 kg            |

Never fit a tyre with a lower load index than specified for your vehicle. The recommended load index is in your vehicle handbook and on the tyre placard (inside the driver's door or fuel cap).

### Speed Rating (the letter)
The speed rating indicates the maximum sustained speed the tyre is designed for. Common ratings:

| Letter | Max Speed |
|--------|-----------|
| S      | 180 km/h (112 mph) |
| T      | 190 km/h (118 mph) |
| H      | 210 km/h (130 mph) |
| V      | 240 km/h (149 mph) |
| W      | 270 km/h (168 mph) |
| Y      | 300 km/h (186 mph) |

In Scotland, national speed limit roads top out at 70mph (113 km/h), so any common speed rating is technically sufficient for legal road use. However, always match or exceed the speed rating specified for your vehicle.

## Other Tyre Sidewall Markings

### M+S or M&S
Mud and Snow. A tyre with this marking is designed for light winter conditions. Note: M+S alone does NOT mean it meets the Three Peak Mountain Snowflake (3PMSF) standard for severe winter performance.

### Three Peak Mountain Snowflake (3PMSF)
A mountain symbol with a snowflake inside indicates the tyre has passed tests for severe snow performance. This is the true winter tyre certification. For Scottish Highland drivers, look for this symbol.

### Run Flat Markings
Different manufacturers use different codes:
- BMW / MINI: **RSC** (Run-flat System Component)
- Bridgestone: **RFT** or **RUN FLAT**
- Continental: **SSR** (Self Supporting Runflat)
- Dunlop: **DSST** (Dunlop Self-Supporting Technology)
- Goodyear: **ROF** (Run On Flat)
- Michelin: **ZP** (Zero Pressure)
- Pirelli: **RF** or **RUN FLAT**

### XL or Extra Load
Indicates a reinforced tyre that can carry more weight than a standard tyre of the same size. Often found on SUVs and larger estate cars. If your vehicle spec requires XL tyres, only fit XL-rated replacements.

### EU Tyre Label Ratings
Look for a QR code or text indicating:
- **Fuel efficiency** (A–G): A is most efficient
- **Wet grip** (A–G): A is best braking performance in wet conditions
- **Noise** (dB): lower is quieter

## Where to Find Your Tyre Size

If you are unsure what size you need:

1. **On the tyre itself**: Look at the sidewall of any of your existing tyres
2. **Driver's door placard**: Sticker inside the driver's door frame
3. **Fuel cap sticker**: On some vehicles
4. **Vehicle handbook**: In the specification section
5. **Online lookup**: Your vehicle registration number can be used to check recommended tyre sizes

## Ordering Tyres Through Tyre Rescue

When you call **0141 266 0690** or [book online](/book), have your tyre size ready. We will confirm availability, quote a price for your chosen brand tier (budget, mid-range, or premium), and dispatch a fitter to your location across Scotland.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland)`,
  },
  {
    slug: 'mot-tyre-requirements-scotland',
    title: 'MOT Tyre Requirements in Scotland: What Will Fail Your MOT',
    description:
      'Everything you need to know about MOT tyre checks in Scotland — what inspectors check, what causes a fail, how to prepare, and how to get tyres fitted before your MOT.',
    category: 'safety',
    publishDate: '2025-10-15',
    lastModified: '2025-10-15',
    readingTime: 7,
    featured: false,
    keywords: [
      'MOT tyre requirements scotland',
      'MOT tyre check',
      'do tyres fail MOT',
      'MOT tyre tread depth',
      'MOT fail tyres',
      'tyre sidewall MOT fail',
      'prepare tyres for MOT',
      'mobile tyre fitting before MOT',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'signs-you-need-new-tyres',
      'tyre-maintenance-checklist-scotland',
    ],
    content: `# MOT Tyre Requirements in Scotland: What Will Fail Your MOT

Your MOT test includes a comprehensive tyre inspection. Tyre-related failures are among the most common reasons for MOT failures in Scotland — and most of them are easily avoidable with a pre-MOT check. Here is exactly what inspectors look for.

## What MOT Inspectors Check on Tyres

MOT testers check each tyre against the standards set in the DVSA (Driver and Vehicle Standards Agency) MOT inspection manual. The main checks are:

### 1. Tread Depth
The legal minimum is 1.6mm across the central three-quarters of the tyre, around the full circumference. Inspectors measure tread depth using calibrated gauges, typically at multiple points. Even one measurement below 1.6mm in the checked area results in an immediate fail.

### 2. Tread Pattern
The tread must be clearly visible and not excessively or unevenly worn. A tyre with tread worn smooth in places — even if the depth at other points exceeds 1.6mm — can fail.

### 3. Sidewall Condition
Inspectors check for:
- **Cuts or gashes**: Any cut exposing the ply or cord beneath the rubber is an automatic fail
- **Bulges or lumps**: Indicate internal structural failure — automatic fail
- **Cracks**: Deep cracking or crazing in the sidewall, particularly if cords are visible
- **Deformation**: Any area of the sidewall that appears misshapen under load

### 4. Mixing Tyres
Mixing radial and cross-ply tyres on the same axle is an automatic fail. On vehicles with more than two wheels on an axle, all tyres on that axle must be the same type.

### 5. Type Suitability
The tyre must be appropriate for the vehicle — correct size, sufficient load index and speed rating for the vehicle specification. Non-standard or incorrectly sized tyres can result in a fail.

### 6. Condition of Bead Area
The bead (where the tyre seats on the rim) is inspected for damage or separation. A damaged bead cannot form an airtight seal.

### 7. Tyre Security
Tyres must be properly seated on the rim with no signs of slippage or separation.

## What Causes an Automatic MOT Tyre Fail?

The following result in an immediate fail with no advisory — the vehicle cannot legally be driven from the test centre on that tyre:

- Tread depth below 1.6mm at any measured point in the checked zone
- Bulge, lump, or deformation in the tyre
- Cut exposing plies or cords
- Tyre that is clearly not in contact with the road (separated bead)
- Mixing radial and cross-ply tyres on the same axle

## What Gets an Advisory Note?

Advisory notes do not cause a fail but indicate that attention will be needed before the next MOT:

- Tread depth between 1.6mm and approximately 2–3mm (not an automatic fail, but inspector will note it)
- Minor surface cracking in the sidewall without cord exposure
- Slight but not severe uneven wear

## How to Check Your Tyres Before MOT

1. **Tread depth**: Use a gauge or the 20p coin test. Check across the full tread width and around the circumference. Replace anything approaching 2mm or below.
2. **Visual inspection**: Walk around the car and inspect each tyre for bulges, cuts, or obvious cracks. Check both the outer and inner sidewalls if you can see them.
3. **Age**: Tyres over 10 years old can fail — check the DOT date code on the sidewall (last four digits: week and year of manufacture). A tyre marked 3218 was made in week 32 of 2018.
4. **Inflation**: Properly inflated tyres are less likely to show deformation and show wear patterns more clearly. Check pressures against the vehicle placard.

## Getting Tyres Fitted Before Your MOT in Scotland

If your tyres are borderline or failing, the most cost-effective approach is to get them replaced before you attend the MOT — a tyre fail means you will pay for the test again plus the tyre fitting.

Tyre Rescue can fit new tyres at your home, workplace, or even at the MOT centre before your appointment:

- **Call 0141 266 0690** with your tyre size
- **Same-day or emergency fitting** available if your MOT is imminent
- **Budget options from approximately £55–£70 fitted** for common sizes

It is often quicker and cheaper to have tyres fitted at home before the MOT than to deal with a fail and re-test fee (typically £30–£60) plus rushed fitting on the day.

## MOT Tyre Checklist

Before presenting your vehicle for MOT, verify:

- [ ] Tread depth above 2mm (ideally 3mm) across all four tyres
- [ ] No visible bulges, cuts, or sidewall damage
- [ ] All four tyres are the same type (all radial, or all cross-ply)
- [ ] Tyre sizes match the vehicle specification
- [ ] No visible tread wear indicators exposed
- [ ] Tyre age under 10 years (check DOT date code)

**Call 0141 266 0690** to book pre-MOT tyre fitting anywhere in Scotland. We will bring the right tyres to you and have you ready for your appointment.

[Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Signs you need new tyres](/blog/signs-you-need-new-tyres) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'tyre-tread-depth-guide-scotland',
    title: 'Tyre Tread Depth: Legal Limit, Checking Guide & When to Replace',
    description:
      'What is the legal tyre tread depth in Scotland? How to check it, why the 1.6mm limit is not safe enough for Scottish roads, and when to replace your tyres.',
    category: 'safety',
    publishDate: '2025-10-15',
    lastModified: '2025-10-15',
    readingTime: 6,
    featured: false,
    keywords: [
      'tyre tread depth scotland',
      'legal tyre tread depth uk',
      'how to check tyre tread',
      'tyre tread depth checker',
      'when to replace tyres scotland',
      'minimum tyre tread uk',
      'tyre tread depth test',
      'tyre tread depth 1.6mm',
    ],
    relatedSlugs: [
      'signs-you-need-new-tyres',
      'tyre-maintenance-checklist-scotland',
      'best-tyres-scottish-roads-guide',
    ],
    content: `# Tyre Tread Depth: Legal Limit, Checking Guide & When to Replace

Tyre tread depth is one of the most safety-critical factors on your vehicle — and one of the most commonly neglected. For Scottish drivers dealing with wet roads for much of the year, understanding tread depth matters more than almost anywhere else in the UK.

## What Is the Legal Minimum Tyre Tread Depth in the UK?

The UK legal minimum tyre tread depth is **1.6mm** across the central three-quarters of the tyre, around the full circumference.

Driving on tyres below 1.6mm tread depth is a criminal offence. The penalty is up to a £2,500 fine and 3 penalty points **per tyre**. Four bald tyres can cost you up to £10,000 in fines and 12 points — an automatic driving ban.

## Is 1.6mm Safe Enough for Scotland?

The legal minimum is not a safety recommendation — it is a legal floor. Independent testing by TyreSafe and the MIRA research institute consistently shows that tyre performance degrades significantly before you reach 1.6mm.

**Wet stopping distance comparison (at 50mph):**

| Tread Depth | Wet Stopping Distance |
|-------------|----------------------|
| 8mm (new)   | Baseline             |
| 3mm         | +27% longer          |
| 1.6mm       | +44% longer          |

On Scotland's wet roads, a tyre at 1.6mm takes nearly half as long again to stop as a new tyre. At 50mph on a wet Glasgow road, that difference is approximately 12 metres — enough to hit a pedestrian or the vehicle in front.

**Tyre Rescue recommendation**: Replace tyres when tread reaches **3mm** on Scottish roads. This is the threshold used by many professional fleet operators and endorsed by road safety charities.

## How to Check Your Tyre Tread Depth

### Method 1: The 20p Coin Test
Insert a 20p coin into the tread groove. If you can see the outer rim of the coin (the raised band), your tread is below 3mm and approaching replacement territory. If the entire outer rim is hidden, you have more than 3mm of tread.

### Method 2: Tread Wear Indicators (TWI)
All tyres have small rubber bars moulded into the tread grooves. These bars sit at exactly 1.6mm. If the tread surface is level with these bars, the tyre is at the legal minimum and must be replaced immediately. Look for a small triangle or 'TWI' marking on the tyre shoulder to locate where these bars are in each tread groove.

### Method 3: Tread Depth Gauge
A simple tread depth gauge costs from £3 at a garage or online. Insert the probe into the tread groove and read the depth in millimetres. Check at least three points across the tyre width in each of four positions around the circumference (12, 3, 6, and 9 o'clock positions).

### What to Check For

Beyond depth, inspect tyres for:
- **Uneven wear** across the width (may indicate alignment or inflation problems)
- **Feathering** — tread blocks worn on one edge only (alignment issue)
- **Centre wear** — excessive wear in the middle (over-inflation)
- **Edge wear** — worn on both outer edges (under-inflation)
- **Cracks or bulges** in the sidewall (tyre must be replaced immediately)

## How Often Should You Check Tread Depth?

Check tyre tread depth at least once a month and before any long journey. In Scotland, check after periods of particularly bad weather, after driving on gravel roads or farm tracks, and after any kerbing incident.

## When to Replace Tyres in Scotland

Replace immediately if:
- Tread depth is at or below 1.6mm (legal minimum)
- Sidewall cracks, cuts, or bulges are visible
- Tyre age exceeds 10 years (tyres degrade regardless of tread)
- The tyre has been run flat (even briefly)

Replace soon if:
- Tread depth is at or below 3mm (Scottish road safety threshold)
- Tyre age is 5–7 years (rubber compound begins to harden)
- Uneven wear indicates alignment or suspension issues

## Tyre Replacement in Scotland

Need new tyres fitted? Tyre Rescue brings the tyres and fitting equipment to your location — home, work, or roadside — across all of Scotland.

- **Call 0141 266 0690** to check tyre availability and get a quote
- **[Book online](/book)** to schedule a fitting at your convenience
- **[Emergency callout](/emergency-tyre-fitting-near-me)** if you need immediate assistance

[Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Signs you need new tyres](/blog/signs-you-need-new-tyres)`,
  },
  {
    slug: 'wheel-balancing-vs-alignment-scotland',
    title: 'Wheel Balancing vs Wheel Alignment: What\'s the Difference?',
    description:
      'Confused about wheel balancing and wheel alignment? This guide explains what each service does, the symptoms of each problem, costs in Scotland, and when you need each one.',
    category: 'maintenance',
    publishDate: '2025-10-15',
    lastModified: '2025-10-15',
    readingTime: 7,
    featured: false,
    keywords: [
      'wheel balancing vs alignment scotland',
      'wheel alignment scotland',
      'wheel balancing scotland',
      'tyre balancing near me scotland',
      'wheel tracking scotland',
      'steering wheel vibration cause',
      'car pulling to one side scotland',
      'wheel alignment cost scotland',
    ],
    relatedSlugs: [
      'tyre-maintenance-checklist-scotland',
      'signs-you-need-new-tyres',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# Wheel Balancing vs Wheel Alignment: What's the Difference?

Two of the most commonly confused car maintenance services are wheel balancing and wheel alignment. Both affect tyre wear and vehicle handling, but they address completely different problems. This guide explains both, the symptoms of each, and when you need them.

## Wheel Balancing

### What Is It?
Wheel balancing corrects for uneven weight distribution around the tyre and wheel assembly. Even tiny weight variations — a few grams — cause the wheel to vibrate at speed as it spins.

### What Is Done?
A technician mounts the tyre and wheel on a balancing machine that spins the assembly and measures vibration. Small lead or zinc weights are clipped or stuck to the inside of the rim to counterbalance any heavy spots.

### Symptoms of an Out-of-Balance Tyre
- **Vibration through the steering wheel** at certain speeds (typically 50–70mph)
- **Vibration felt through the seat or floor** (rear wheel balance issue)
- **Uneven or patchy tread wear** — often a cupped or scalloped pattern
- **Increased road noise** at motorway speeds

### When Should You Balance?
- Any time a new tyre is fitted
- After a puncture repair
- If you notice vibration at speed
- Every 12,000–15,000 miles as a precaution
- After hitting a significant pothole (potholes are common on Scottish roads, especially in rural areas)

### Cost in Scotland
Wheel balancing: approximately **£8–£15 per wheel**. Tyre Rescue includes wheel balancing as standard when fitting new tyres — it is part of the fitting process, not an extra charge.

## Wheel Alignment

### What Is It?
Wheel alignment (also called tracking or geometry) adjusts the angles of your tyres relative to each other and to the road. When wheels are misaligned, tyres do not point in the correct direction — causing wear, poor handling, and increased fuel consumption.

### The Three Alignment Angles
- **Toe**: Whether the front of the tyres point inward (toe-in) or outward (toe-out) relative to each other. This is the most common adjustment needed.
- **Camber**: The angle of the tyre when viewed from the front — whether it tilts inward or outward at the top.
- **Caster**: The angle of the steering axis when viewed from the side — affects straight-line stability.

### What Is Done?
Alignment requires a four-wheel alignment machine that uses laser or camera sensors to measure all four tyre angles simultaneously. Adjustments are made to suspension components to bring angles back within the manufacturer's specified range.

### Symptoms of Misaligned Wheels
- **Car pulling to one side** when you release the steering wheel on a straight, flat road
- **Steering wheel sits at an angle** even when driving straight
- **Excessive or uneven tread wear** — particularly on the inner or outer edge of the tyre
- **Increased fuel consumption** — misaligned tyres create more rolling resistance

### When Should You Align?
- After hitting a significant kerb or pothole
- After suspension work or steering component replacement
- When fitting new tyres (worth checking alignment at the same time)
- If you notice any of the symptoms above
- Annually as a precaution for high-mileage drivers

### Cost in Scotland
Two-wheel (front axle) alignment: approximately **£40–£60**. Four-wheel alignment: approximately **£60–£90**. These prices are for specialist garage alignment — alignment requires a fixed alignment rack and cannot be done at the roadside by a mobile fitter.

## Key Differences at a Glance

| | Wheel Balancing | Wheel Alignment |
|---|---|---|
| Problem | Uneven weight distribution | Incorrect tyre angles |
| Symptom | Vibration at speed | Pulling; uneven tread wear |
| Equipment | Balancing machine | Four-wheel alignment rack |
| Can be mobile? | ✅ Yes | ❌ No (needs fixed rack) |
| Cost per axle | £16–£30 | £40–£90 |
| When needed | Every tyre fit | After impacts, annually |

## Can Tyre Rescue Help?

Tyre Rescue carries balancing equipment on every van. When we fit a new tyre, balancing is included. If you need balancing only (no new tyre), call **0141 266 0690** and we can come to you.

For wheel alignment, you will need a specialist garage with a four-wheel alignment rig. If you are unsure whether your issue is balancing or alignment, call us — the symptoms usually make it clear, and we will advise honestly even if it means sending you to a garage.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Tyre maintenance checklist](/blog/tyre-maintenance-checklist-scotland) | [Signs you need new tyres](/blog/signs-you-need-new-tyres)`,
  },
  {
    slug: 'tpms-warning-light-scotland-guide',
    title: 'TPMS Warning Light: What It Means & What to Do in Scotland',
    description:
      'Your TPMS (Tyre Pressure Monitoring System) warning light has come on. Here\'s what it means, when it\'s safe to keep driving, and what to do if you\'re in rural Scotland or the Highlands.',
    category: 'safety',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'tpms warning light scotland',
      'tyre pressure warning light',
      'tpms light on what to do',
      'tyre pressure monitoring system scotland',
      'tpms sensor replacement scotland',
      'tpms reset scotland',
      'low tyre pressure scotland',
      'tpms light after tyre change',
    ],
    relatedSlugs: [
      'run-flat-tyres-scotland-guide',
      'tyre-maintenance-checklist-scotland',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# TPMS Warning Light: What It Means & What to Do in Scotland

Your TPMS warning light — the horseshoe-shaped symbol with an exclamation mark — has appeared on your dashboard. Here is exactly what it means and what you should do, especially if you are driving in Scotland.

## What Is TPMS?

The Tyre Pressure Monitoring System (TPMS) is a mandatory safety system on all new cars sold in the UK since 2014. It monitors tyre pressure in real time and alerts you when pressure drops significantly below the recommended level.

There are two types:
- **Direct TPMS**: Each wheel has a sensor inside the tyre that transmits pressure data wirelessly to the dashboard. Accurate and immediate.
- **Indirect TPMS**: Uses wheel speed sensors (the ABS sensors) to detect when one wheel rotates faster than others — indicating lower pressure and smaller circumference. Less precise but no sensors to replace.

## What Does the Warning Light Mean?

When the TPMS light comes on, it means at least one tyre is 25% or more below its recommended pressure.

**If the light is solid (stays on)**: One or more tyres are significantly under-inflated.

**If the light flashes for 60–90 seconds then stays on**: This indicates a fault with the TPMS sensor itself — not necessarily a pressure problem. This often happens after a tyre has been changed without resetting the system, or when a sensor battery has died.

## What to Do When the TPMS Light Comes On

### Step 1: Do not ignore it
Low tyre pressure increases the risk of blowout, reduces fuel efficiency, and causes uneven tyre wear. A 25% pressure drop (what triggers the light) is significant.

### Step 2: Check your speed and handling
If you notice any unusual vibration, pulling to one side, or sluggish steering, reduce speed immediately. You may have a flat or rapidly deflating tyre.

### Step 3: Find a safe location to stop
In Scotland, roadside lay-bys are common on most trunk roads. On the motorway, use the hard shoulder or emergency refuge area. On single-track Highland roads, use a passing place.

### Step 4: Visually inspect the tyres
Check all four tyres for obvious flat spots. Even if a tyre looks inflated, it may be 25% low without appearing visibly flat.

### Step 5: Check pressure if you have a gauge
Many petrol stations have air pumps with built-in pressure gauges. Your recommended pressure is on a sticker inside the driver's door, in the handbook, or on the fuel cap. Inflate the low tyre to the correct pressure.

### Step 6: If you cannot inflate or the tyre is flat, call for help
In Scotland, this is where remote location matters. Whether you are on the A9 north of Inverness, the NC500 near Tongue, or on the road to Applecross — Tyre Rescue can reach you. Call **0141 266 0690** and give your location.

## TPMS and Tyre Changes in Scotland

One of the most common reasons the TPMS light stays on after a tyre change is that the sensor was not reset properly. When a new tyre is fitted, the TPMS system must be recalibrated to the new sensor (on direct systems) or the wheel speed reference must be reset (on indirect systems).

If your TPMS light came on after a recent tyre change, it is almost certainly a reset issue rather than a pressure problem. Tyre Rescue carries TPMS reset tools for all common vehicles and will reset your TPMS at the time of fitting at no additional charge.

## TPMS Sensor Replacement in Scotland

Direct TPMS sensors have a battery life of approximately 7–10 years. When a sensor battery dies, the light will flash continuously before remaining on. The sensor must be replaced — they cannot be recharged.

Replacement TPMS sensors cost from approximately £25–£70 per wheel depending on the vehicle make. For premium vehicles (BMW, Mercedes, Audi), OEM sensors cost more. Aftermarket sensors are available and work with most vehicles.

Tyre Rescue carries and can fit TPMS sensors across Scotland. If you are unsure whether your TPMS light indicates a pressure problem or a sensor fault, call **0141 266 0690** and we will help you diagnose it.

## Driving with the TPMS Light On: Is It Safe?

**If the tyre pressure is just slightly low**: You can drive slowly and carefully to the nearest petrol station to inflate the tyre. Do not drive long distances.

**If one tyre is visibly flat or very low**: Do not drive on it. Driving on a flat tyre damages the tyre, the wheel rim, and potentially the brake caliper. Stop and call for assistance.

**If you have run-flat tyres**: You can drive at a maximum of 50mph for up to 50 miles. But in Scotland's remote areas, 50 miles may not be enough to reach a tyre fitter — call ahead to Tyre Rescue so we can meet you en route.

**If the light is flashing**: This indicates a sensor fault, not a pressure problem. Your tyres may be fine. Check the pressures manually, and if they are correct, the sensor needs diagnosis or replacement.

## Key Facts

- TPMS warning threshold: 25% below recommended pressure
- Legal minimum tyre pressure: check your vehicle handbook — typically 32–36 PSI for standard cars
- Sensor battery life: 7–10 years
- Sensor replacement cost: from £25 per corner
- TPMS reset after tyre change: included free with all Tyre Rescue fittings

Need help with a TPMS warning, flat tyre, or tyre pressure issue in Scotland? Call **0141 266 0690** — 24/7, all of Scotland.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Run-flat tyres guide](/blog/run-flat-tyres-scotland-guide) | [Emergency tyre fitting](/emergency-tyre-fitting-near-me)`,
  },
  {
    slug: 'best-tyres-scottish-roads-guide',
    title: 'Best Tyres for Scottish Roads: A Complete Guide',
    description:
      'Which tyres perform best on Scotland\'s wet roads, Highland passes, and island routes? Our guide to choosing the right tyre for Scottish conditions — all-season vs summer vs winter.',
    category: 'maintenance',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 8,
    featured: false,
    keywords: [
      'best tyres scottish roads',
      'tyres for scotland',
      'all season tyres scotland',
      'winter tyres scotland',
      'tyres for wet roads',
      'highland roads tyres',
      'best tyre brands scotland',
      'michelin vs continental scotland',
    ],
    relatedSlugs: [
      'winter-tyres-scotland-guide',
      'tyre-maintenance-checklist-scotland',
      'signs-you-need-new-tyres',
    ],
    content: `# Best Tyres for Scottish Roads: A Complete Guide

Scotland's roads are among the most challenging in the UK. From rain-soaked motorways to single-track Highland passes, from the frost-prone A9 to the salt-air coastal routes of the NC500 — choosing the right tyre for Scottish conditions matters more here than almost anywhere else in Britain.

## What Makes Scottish Roads Different

**Rain**: Scotland is one of the wettest parts of the UK. Glasgow averages 1,100mm of rain per year; the west Highlands can reach 3,000mm. Wet grip rating is the most important tyre performance factor for Scottish drivers.

**Temperature**: Scotland experiences more sub-zero mornings than most of England. Even at sea level, freezing overnight temperatures occur regularly from October to March.

**Road surfaces**: Many Scottish roads — particularly in the Highlands and islands — have rougher surfaces, sharper edges from frost damage, and loose chippings after resurfacing. Tyre sidewall strength matters more here.

**Distance**: Journeys on Highland and island routes can be long with limited fuel stops. Tyres with low rolling resistance reduce fuel consumption on these long, open stretches.

## The Three Tyre Options for Scotland

### Summer Tyres
Standard summer tyres are designed for temperatures above 7°C. Their compound hardens in cold weather, reducing grip and braking performance significantly. In Glasgow and Edinburgh, where temperatures rarely fall below -5°C, good-quality summer tyres are acceptable for year-round use — provided you are careful in the winter months. For the Highlands and islands, summer tyres are a risk from October to April.

**Verdict**: Acceptable in Central Belt cities; not recommended for Highland and rural Scotland from late autumn to spring.

### Winter Tyres
Winter tyres use a softer compound that remains flexible below 7°C, with a more aggressive tread pattern that evacuates water and soft snow more effectively. Braking distances on a wet Scottish road in November can be 10–30% shorter on winter tyres compared to summer tyres.

Winter tyres are not a legal requirement in Scotland, but they are strongly advisable for:
- Highland drivers
- NC500 and remote route users
- Drivers in Caithness, Sutherland, or elevated areas above 300m
- Anyone who regularly drives on rural roads from October to March

**Verdict**: Highly recommended for rural Scotland and the Highlands. Optional but valuable for city drivers.

### All-Season Tyres
All-season (or all-weather) tyres are a genuine compromise that works well for Scottish conditions. They carry the Three Peak Mountain Snowflake (3PMSF) symbol, meaning they meet winter performance standards, but they are usable year-round without the seasonal swap.

For most Scottish drivers who do not want the hassle and cost of keeping two sets of tyres, high-quality all-season tyres from brands like Michelin (CrossClimate), Continental (AllSeasonContact), or Goodyear (Vector 4Seasons) represent excellent value.

**Verdict**: The recommended option for most Scottish drivers — especially those who drive both city and rural routes.

## Best Tyre Brands for Scottish Conditions

### Michelin
Consistently top-rated for wet grip and longevity. The CrossClimate 2 (all-season) and Pilot Sport 4S (summer) are benchmark products. Michelin tyres tend to last longer, making the higher upfront cost worthwhile over 40,000+ miles.

### Continental
Continental's PremiumContact 7 (summer) and AllSeasonContact (all-season) score highly in independent tests for wet braking. Made in Europe and well-suited to the UK's wet climate. A strong choice for Scottish drivers.

### Bridgestone
Bridgestone's Weather Control (all-season) and Turanza (summer) are solid performers. Generally slightly cheaper than Michelin and Continental while maintaining high wet grip scores.

### Goodyear
The EfficientGrip Performance 2 (summer) and Vector 4Seasons Gen 3 (all-season) are frequently recommended by independent testers. Goodyear's EV-specific tyres are also worth considering for electric vehicle drivers.

### Budget Alternatives
Budget tyre brands such as Nexen, Hankook, Falken, and Toyo offer significantly lower prices while still passing EU tyre labelling standards. For lower-mileage drivers or secondary vehicles, these can represent good value. They typically score lower on wet braking and longevity tests than premium brands.

## Tyre Ratings to Check for Scotland

When buying any tyre, check the EU tyre label ratings:

- **Wet Grip (A–G)**: For Scotland, aim for A or B. This is the most important rating.
- **Fuel Efficiency (A–G)**: A or B reduces fuel cost on long Highland drives.
- **Noise (dB)**: Less important in Scotland, but lower is more comfortable on long journeys.

## When to Replace Your Tyres

The legal minimum tread depth in the UK is 1.6mm across the central three-quarters of the tyre. For Scottish roads, especially in wet and cold conditions, consider replacing when tread reaches 3mm — wet braking performance degrades sharply below this level.

Signs to replace sooner:
- Cracks or bulges in the sidewall
- Uneven tread wear (check across the full width)
- Persistent slow punctures
- Age over 5 years regardless of tread depth

## Mobile Tyre Supply and Fitting in Scotland

Need new tyres fitted without going to a garage? Tyre Rescue brings the tyre to you — home, work, or roadside — across all of Scotland.

**Call 0141 266 0690** to check which brands and sizes we carry for your vehicle, or [book online](/book) for a scheduled fitting.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Tyre fitting costs guide](/blog/tyre-fitting-costs-scotland-pricing-guide) | [Winter tyres guide](/blog/winter-tyres-scotland-guide)`,
  },
  {
    slug: 'run-flat-tyres-scotland-guide',
    title: 'Run-Flat Tyres in Scotland: What You Need to Know',
    description:
      'Everything about run-flat tyres for Scottish drivers — can they be repaired, what distance can you drive, what\'s the cost of replacement, and which mobile tyre fitters carry run-flats?',
    category: 'safety',
    publishDate: '2025-10-01',
    lastModified: '2025-10-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'run flat tyres scotland',
      'run flat tyre replacement scotland',
      'run flat tyre repair',
      'bmw run flat tyres scotland',
      'mini run flat tyres',
      'can run flat tyres be repaired',
      'mobile tyre fitting run flat',
      'run flat tyre cost scotland',
    ],
    relatedSlugs: [
      'best-tyres-scottish-roads-guide',
      '24-hour-emergency-tyre-fitting-scotland',
      'tyre-maintenance-checklist-scotland',
    ],
    content: `# Run-Flat Tyres in Scotland: What You Need to Know

Run-flat tyres are now standard on many vehicles — particularly BMWs, MINIs, Mercedes, and some Volkswagen models. If you drive one of these vehicles and get a flat in Scotland, the rules are different from conventional tyres.

## What Are Run-Flat Tyres?

Run-flat tyres have reinforced sidewalls that support the weight of the vehicle even when the tyre has zero air pressure. This allows you to continue driving at reduced speed (typically 50mph maximum) for a limited distance (typically 50 miles) to reach a safe location.

The benefit is clear: no need to change a tyre at the roadside, no spare wheel required. The downside becomes apparent in Scotland: the nearest tyre fitter may be more than 50 miles away if you are in the Highlands, on Skye, or in rural Galloway.

## How Far Can You Drive on a Run-Flat Tyre?

The general guidance is:
- **Maximum speed**: 50mph (80km/h)
- **Maximum distance**: 50 miles (80km)

However, this assumes:
- The tyre is not damaged structurally (no blowout, no sidewall cut)
- You are driving on normal roads (not demanding terrain)
- You do not exceed the 50mph limit

**For Scottish Highland drivers**: 50 miles may not be enough to reach a tyre fitter, particularly if you are on the NC500 north of Thurso, in the Outer Hebrides, or on a remote Argyll road. Call Tyre Rescue (0141 266 0690) as soon as you notice the fault.

## Can Run-Flat Tyres Be Repaired?

This is one of the most common questions about run-flat tyres, and the answer is:

**Usually no.**

The British Standard (BSAU159f) guidance on tyre repair explicitly states that a run-flat tyre that has been driven while deflated should not be repaired. The reason is that the sidewall reinforcement may have been damaged internally — and this damage is not always visible externally.

Exceptions are rare: a run-flat tyre that was noticed immediately (before being driven deflated) and has a clean puncture in the central tread area may sometimes be assessed for repair. A qualified fitter will inspect the tyre and advise honestly.

**In Scotland, if you have driven any distance on a deflated run-flat, assume it needs replacement.**

## Run-Flat Tyre Replacement in Scotland

Replacing a run-flat tyre requires stocking the correct size — and run-flat sizes (indicated by BMW's 'RSC', Bridgestone's 'RFT', Continental's 'SSR' etc.) are not always carried in standard stock.

Tyre Rescue carries common run-flat sizes for popular Scottish vehicles including BMW 1, 3, 4, 5 Series, MINI Hatch, Countryman, and others. If your size is less common, call **0141 266 0690** before we dispatch and we will confirm availability.

## Cost of Run-Flat Tyre Replacement in Scotland

Run-flat tyres cost more than equivalent conventional tyres — typically 30–60% more. For a common size (e.g., 225/45R18 for a BMW 3 Series):

- **Budget run-flat**: from approximately £80–£100
- **Mid-range (Hankook, Nexen, Falken)**: from approximately £110–£140
- **Premium (Bridgestone, Continental, Michelin)**: from approximately £150–£220

These prices are for the tyre only. Add our fitting fee from £20 and our emergency callout from £49 if it is an emergency.

## TPMS and Run-Flat Tyres

All vehicles fitted with run-flat tyres from the factory also have a TPMS (Tyre Pressure Monitoring System). The TPMS warning light is how you know the tyre has lost pressure — since the reinforced sidewall means you may not feel it in the handling.

After fitting a replacement run-flat tyre, the TPMS sensor must be reset or replaced. Tyre Rescue carries TPMS reset tools for all common vehicles. If your TPMS light remains on after a tyre change, we can reset it at the time of fitting at no additional charge.

## Key Advice for Scottish Drivers with Run-Flat Tyres

1. **Act immediately** when the TPMS warning light comes on — call us before driving further than necessary
2. **Do not exceed 50mph** on a flat run-flat — ever
3. **Call ahead** to check run-flat stock availability for your exact size
4. **Consider keeping a spare** if you regularly drive very remote routes — a space-saver spare or even a full-size conventional spare can be a lifesaver beyond the 50-mile run-flat range
5. **Don't assume it's repairable** — have it assessed before insisting on repair

Need run-flat tyre replacement in Scotland? Call **0141 266 0690** and confirm your tyre size. We'll tell you what we have in stock and give you an accurate ETA to your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Emergency tyre fitting](/emergency-tyre-fitting-near-me) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide)`,
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
