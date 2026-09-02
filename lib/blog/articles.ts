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
    slug: 'caravan-motorhome-tyres-scotland',
    title: 'Caravan & Motorhome Tyres Scotland: What You Need to Know',
    description:
      'Caravan and motorhome tyre guide for Scottish touring. When to replace, age limits, motorhome tyre sizes, and what to do if you get a flat on a Scottish touring route.',
    category: 'safety',
    publishDate: '2026-04-01',
    lastModified: '2026-04-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'caravan tyres scotland',
      'motorhome tyres scotland',
      'caravan tyre replacement scotland',
      'caravan tyre age limit scotland',
      'motorhome flat tyre scotland',
      'nc500 caravan tyres',
      'touring caravan tyres uk',
      'caravan tyre fitting scotland mobile',
    ],
    relatedSlugs: [
      'tyre-age-when-to-replace-scotland',
      'spare-tyre-uk-law-scotland',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Caravan & Motorhome Tyres Scotland: What You Need to Know

Scotland is one of the UK's premier caravan and motorhome touring destinations. The NC500, the Hebridean Way, the Scottish Borders, and Galloway attract hundreds of thousands of touring vehicles each year. Caravan and motorhome tyres have specific requirements and failure modes that differ from car tyres — and the consequences of a blowout while towing on a Highland route are more serious.

## The Most Important Fact About Caravan Tyres

**Caravans are parked for months at a time, often outdoors.** During this storage period, the tyres:
- Are exposed to UV radiation (even in Scottish overcast conditions, UV degrades rubber)
- Experience temperature cycling (freeze-thaw)
- Carry the static weight of the caravan
- May have flat spots develop if not moved

The industry standard recommendation is to replace caravan tyres at **5 years**, regardless of tread depth. This is more conservative than car tyres (10 years) specifically because of the storage degradation factor. Many caravan insurers and the Caravan and Motorhome Club recommend this same 5-year threshold.

## Motorhome Tyres: Different Rules

Motorhome tyres are more like commercial vehicle tyres. Motorhomes are heavier than caravans (a large motorhome can exceed 7,500kg MTPLM), are driven more frequently, and their tyres need to handle both driving loads and the continuous weight of a heavy vehicle in storage.

Motorhome tyres should be:
- Rated for the vehicle's maximum permissible mass (check the plate on the vehicle)
- Replaced at 7 years maximum (more frequent for high-mileage motorhomes)
- Checked for age via the DOT date code on every pre-season inspection

## How to Check Caravan and Motorhome Tyre Age

The DOT date code on the tyre sidewall gives the week and year of manufacture. The last four digits: first two = week, last two = year.

**Example**: DOT ... 1819 = manufactured in week 18 of 2019 = approximately May 2019.

If your caravan's tyres were made in 2019 or earlier, they should be replaced now.

## Pre-Season Tyre Inspection for Scotland Touring

Before your Scottish touring season (typically Easter to October), inspect all caravan or motorhome tyres:

1. **Check the DOT age code** on every tyre — replace if over 5 years (caravan) or 7 years (motorhome)
2. **Check tread depth** — minimum 1.6mm, but we recommend 3mm for touring routes that include wet Highland roads
3. **Check sidewall condition** — any cracking, bubbling, or discolouration warrants replacement
4. **Check inflation pressure** — inflate to the recommended cold pressure (caravan: typically 45–55 PSI; check your handbook)
5. **Look for flat spots** — roll the caravan forward 2–3 feet and re-inspect the contact patch

## Common Caravan and Motorhome Tyre Sizes in Scotland

Caravan tyres are typically narrower than car tyres and use a different aspect ratio:

### Common Caravan Sizes
- 185R14C — most common UK touring caravan size
- 195/70R14C — widespread on mid-size caravans
- 195/70R15C — used on larger caravans
- 225/75R16C — some large twin-axle caravans

The **C** designation indicates commercial rating — these are caravan-specific tyres designed for static loads and intermittent use.

### Common Motorhome Sizes
- 225/75R16C (smaller motorhomes — Fiat Ducato, Peugeot Boxer based)
- 235/65R16C (Volkswagen Crafter, Mercedes Sprinter based)
- 225/70R15C (older motorhomes)
- 235/75R15 (some American and large European motorhomes)

## What to Do If You Have a Caravan Flat Tyre in Scotland

### If you have a spare wheel on the caravan
Many older caravans have a spare wheel. If you have one and know how to use it safely (without destabilising the caravan during jacking), this is the quickest solution. Always use proper caravan-rated axle stands, not just a scissor jack.

### If you do not have a spare (many modern caravans do not)
Call **0141 266 0690** immediately. We carry common caravan tyre sizes and can attend to the site of the breakdown. Give your location as precisely as possible — a postcode, the nearest village, or a what3words address on remote routes.

### On the NC500 or remote Highland roads
Caravanning the NC500 with a flat is one of the most challenging rural breakdown scenarios in the UK. Very few local businesses carry caravan tyre sizes. Call us as soon as you notice the problem — the earlier you call, the better the ETA we can give.

## Towing Vehicle Tyres

The tyres on the car towing your caravan are at least as important as the caravan tyres. Towing places significant additional load on the rear axle of the tow car, accelerates rear tyre wear, and demands tyres rated for the towball weight. Check:

- Your tow car tyres are at correct pressure for laden/towing use (typically higher than unladen pressure — check your car's door placard for the loaded pressure)
- The rear tyres are in good condition (tyre wear is faster on the rear when towing)
- Load index is adequate for the car's maximum gross weight

## Book Mobile Caravan Tyre Fitting in Scotland

Tyre Rescue can attend to caravan breakdowns across Scotland including remote Highland and island routes. We carry common caravan sizes and can source less common ones with advance notice.

**Call 0141 266 0690** to confirm stock of your specific caravan tyre size, especially for the NC500 or island routes where advance planning is important.

[Tyre age guide](/blog/tyre-age-when-to-replace-scotland) | [Spare tyre law Scotland](/blog/spare-tyre-uk-law-scotland) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'land-rover-range-rover-tyres-scotland',
    title: 'Land Rover & Range Rover Tyre Fitting Scotland: All Models',
    description:
      'Mobile Land Rover and Range Rover tyre fitting across Scotland. Large-size tyres for Defender, Discovery, Range Rover Sport and Velar. All-terrain options. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-03-01',
    lastModified: '2026-03-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'land rover tyres scotland',
      'range rover tyres scotland',
      'land rover defender tyres scotland',
      'range rover sport tyres scotland',
      'discovery tyres scotland',
      'mobile land rover tyre fitting glasgow',
      'all terrain tyres land rover scotland',
      'freelander tyres scotland',
    ],
    relatedSlugs: [
      '4x4-suv-tyres-scotland-highlands',
      'electric-vehicle-tyres-scotland',
      'mobile-tyre-fitting-glasgow',
    ],
    content: `# Land Rover & Range Rover Tyre Fitting Scotland: All Models

Land Rover and Range Rover vehicles are more common in Scotland than anywhere else in the UK — particularly in rural Perthshire, the Highlands, Argyll, and Galloway, where 4x4 capability is genuinely needed year-round. Scotland's agricultural estates, forestry roads, and Highland terrain are Land Rover country.

Tyre Rescue fits tyres on all Land Rover and Range Rover models across Scotland, from common urban Range Rover Sports to Defenders working on Highland estates.

## What Makes Land Rover/Range Rover Tyre Fitting Different

### Large and Specialist Sizes
Land Rover models use some of the largest tyres fitted to civilian vehicles in the UK. A Range Rover L460 on 22-inch wheels takes 285/35R22 tyres — a size not carried by most local garages. Defender 110 variants range from 255/60R18 to 285/40R22 depending on specification.

Tyre Rescue carries common Land Rover and Range Rover sizes on our larger service vans. For very large or unusual sizes (21" or 22" rims), call ahead to confirm stock.

### High Load Index
Range Rovers and Defenders are heavy vehicles. A Range Rover L460 can weigh over 2,600kg. The load index required per tyre is correspondingly high — typically 108–113 for large Range Rover variants. Using a tyre with insufficient load index on a heavy Land Rover is a safety risk.

### All-Terrain vs Road Tyre Choice
Land Rover vehicles can typically accept either road tyres (for urban and motorway use) or all-terrain tyres (for off-road and rough track use). See our [4x4 and SUV tyres Scotland guide](/blog/4x4-suv-tyres-scotland-highlands) for a full comparison.

### TPMS
Modern Land Rover and Range Rover models (from approximately 2010 onwards) have direct TPMS. After a tyre change, the TPMS must be reset. Tyre Rescue carries Land Rover compatible TPMS reset tools. Reset is included with every fitting.

## Models We Service in Scotland

### Defender (L663 — current model)
The current Defender has become Scotland's most popular agricultural and adventure 4x4. Common tyre sizes:
- 255/60R18 (standard 18-inch spec)
- 255/55R19 (optional 19-inch)
- 265/45R20 (optional 20-inch)
- 285/40R22 (optional 22-inch)

All-terrain tyre fitment is common for Defenders used on estate roads, forestry, or the NC500.

### Range Rover (L460 — current model)
Scotland's premium large SUV. Common sizes:
- 255/55R20 (standard)
- 285/45R21 (optional 21-inch)
- 285/35R22 (optional 22-inch)

### Range Rover Sport (L461)
Common sizes: 255/50R20, 275/45R21, 285/40R22.

### Range Rover Velar
Common sizes: 235/55R19, 255/50R19, 265/45R20.

### Discovery (L462)
Common sizes: 235/65R17, 255/55R18, 255/50R20.

### Discovery Sport (L550)
Common sizes: 215/65R17, 235/60R18, 255/50R20.

### Freelander 2 / Discovery Sport (older)
Common sizes: 215/65R17, 235/60R18 — widely stocked.

### Defender 90/110 (classic — pre-2020)
Classic Defenders often use 235/85R16 (mud terrain) or 265/75R16 — less common sizes. Call ahead to confirm stock.

## Emergency Land Rover Tyre Fitting in Scotland

Highland breakdown? Estate road flat? We cover all of Scotland — from the M8 to the NC500. Land Rover and Range Rover breakdowns on remote routes are a common callout for our team.

- **Glasgow and Edinburgh**: 25–40 minutes
- **Aberdeen and Inverness**: 90 minutes
- **Highland and remote routes**: Call immediately and we will confirm an accurate ETA

Call **0141 266 0690** — 24 hours a day, all of Scotland.

[4x4 and SUV tyres Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me)`,
  },
  {
    slug: 'bmw-tyre-fitting-scotland',
    title: 'BMW Tyre Fitting Scotland: Run-Flats, TPMS & All Models',
    description:
      'Specialist mobile BMW tyre fitting across Scotland. Run-flat tyres, TPMS reset, load-rated tyres for all BMW models — 1 Series, 3 Series, 5 Series, X5, iX and more. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-03-01',
    lastModified: '2026-03-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'bmw tyre fitting scotland',
      'bmw tyre replacement scotland',
      'bmw run flat tyres scotland',
      'bmw tpms reset scotland',
      'mobile bmw tyre fitting glasgow',
      'bmw 3 series tyres scotland',
      'bmw x5 tyres scotland',
      'bmw i4 tyres scotland',
    ],
    relatedSlugs: [
      'run-flat-tyres-scotland-guide',
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
    ],
    content: `# BMW Tyre Fitting Scotland: Run-Flats, TPMS & All Models

BMW is one of the most popular premium car brands in Scotland — particularly in Glasgow, Edinburgh, and Aberdeen. BMW vehicles have specific tyre requirements that differ from most other cars, and getting the right tyres matters for both safety and preserving your vehicle's performance.

Tyre Rescue provides specialist mobile BMW tyre fitting across all of Scotland, covering all current and recent BMW models.

## What Makes BMW Tyres Different

### Run-Flat Tyres (RSC)
Most modern BMW models — 1 Series, 2 Series, 3 Series, 4 Series, 5 Series — come factory-fitted with run-flat tyres marked **RSC** (Run-flat System Component). These allow driving at up to 50mph for up to 50 miles when deflated.

**Critical**: BMW run-flat tyres must be replaced with run-flat tyres. Fitting a conventional tyre on a BMW designed for run-flats affects TPMS calibration and handling. Always use RSC-marked replacements.

### TPMS Reset
All modern BMWs have direct TPMS. After any tyre change, the TPMS must be reset using a BMW-compatible diagnostic tool. Without a reset, the TPMS warning light stays on permanently. Tyre Rescue carries TPMS reset tools compatible with all BMW models. Reset is included at no extra charge with every fitting.

### Load Index Requirements
BMW SUV models (X3, X5, X7) require tyres with high load indices. Check your current tyre sidewall and ensure any replacement matches or exceeds the load index.

## Common BMW Models We Serve in Scotland

| Model | Common Tyre Size | Type |
|-------|-----------------|------|
| BMW 3 Series (G20) | 225/45R17, 245/40R18 | RSC run-flat |
| BMW 5 Series (G30) | 225/55R17, 245/40R19 | RSC run-flat |
| BMW X3 (G01) | 225/55R18, 245/45R19 | Standard or run-flat |
| BMW X5 (G05) | 275/40R20, 275/35R21 | Standard or run-flat |
| BMW i4 (EV) | 245/45R18, 255/40R19 | EV-specific load index |
| BMW iX (EV) | 245/55R19, 285/40R22 | EV acoustic recommended |
| MINI Hatch (F56) | 205/45R17, 225/45R17 | RSC run-flat |

## TPMS Warning Light After BMW Tyre Change

If your BMW TPMS light came on after a tyre change, the sensor was not reset — the most common BMW-specific call we receive. Call **0141 266 0690** and we will come to reset the TPMS at your location.

## Emergency BMW Tyre Fitting in Scotland

Flat BMW tyre on the M8, M74, A9, or anywhere else in Scotland? Call **0141 266 0690** — we carry RSC run-flat tyres for all major BMW models, 24 hours a day.

[Run-flat tyres Scotland guide](/blog/run-flat-tyres-scotland-guide) | [TPMS warning light guide](/blog/tpms-warning-light-scotland-guide) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me)`,
  },
  {
    slug: 'tesla-tyre-fitting-scotland',
    title: 'Tesla Tyre Fitting Scotland: Model 3, Y, S & X',
    description:
      'Mobile Tesla tyre replacement across Scotland. EV load-rated tyres for all Tesla models. TPMS guide, no-spare-wheel advice, emergency callout. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-03-01',
    lastModified: '2026-03-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'tesla tyre fitting scotland',
      'tesla tyre replacement scotland',
      'mobile tesla tyre fitting glasgow',
      'tesla model 3 tyres scotland',
      'tesla model y tyres scotland',
      'tesla flat tyre scotland',
      'tesla ev tyre scotland',
      'tesla no spare wheel scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'tpms-warning-light-scotland-guide',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Tesla Tyre Fitting Scotland: Model 3, Y, S & X

Tesla is Scotland's most popular electric vehicle, with high adoption particularly in Edinburgh, Glasgow, and Aberdeen. Teslas have specific tyre requirements that differ from conventional cars — higher load ratings, acoustic foam, and no spare wheel. Getting the wrong tyre on a Tesla is a safety risk.

Tyre Rescue fits tyres on all Tesla models across Scotland, 24 hours a day.

## Why Tesla Tyres Are Different

### High Load Requirements
Teslas are significantly heavier than petrol equivalents due to battery packs. A Tesla Model Y weighs approximately 2,000kg. Each tyre must carry more weight, requiring a higher load index — typically 97–107 depending on model. Fitting an under-rated tyre is dangerous and voids the tyre warranty.

### No Spare Wheel
Teslas do not include a spare wheel. If you have a flat, you cannot change it yourself. Mobile tyre fitting is the only resolution — there is no run-flat contingency and no on-board spare.

### Acoustic Foam
Many Tesla-spec tyres include acoustic foam on the inner surface to reduce tyre noise in the near-silent cabin. Common options: Michelin 'Acoustic', Continental 'ContiSilent', Pirelli 'Seal Inside'. You can fit a standard tyre — the correct load index is mandatory, the foam is recommended.

## Common Tesla Tyre Sizes

| Model | Common UK Tyre Size |
|-------|---------------------|
| Model 3 Standard Range | 235/45R18 |
| Model 3 Long Range | 235/45R18 or 235/40R19 |
| Model 3 Performance | 235/35R20 (front), 255/35R20 (rear) |
| Model Y (most common in Scotland) | 255/45R19 |
| Model Y Performance | 255/40R20 (front), 275/35R20 (rear) |
| Model S | 245/45R19 or 265/35R20 |
| Model X | 265/45R20 or 275/35R21 |

## Tesla Flat Tyre: What to Do in Scotland

1. Do not drive on a flat — Teslas have no run-flat capability
2. Pull to a safe location as soon as it is safe to do so
3. Call **0141 266 0690** — state you have a Tesla and your model
4. We will confirm stock of your specific size and give an accurate ETA
5. After fitting, reset TPMS via Tesla touchscreen: Controls > Service > Tyre Pressure Reset

Tyre Rescue covers all of Scotland — from Edinburgh and Glasgow where Tesla ownership is highest, to the A9, A82, and Highland routes where Teslas are increasingly common.

[Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'mobile-tyre-fitting-falkirk-central-scotland',
    title: 'Mobile Tyre Fitting in Falkirk & Central Scotland | Tyre Rescue',
    description:
      'Mobile tyre fitting across Falkirk, Grangemouth, Bo\'ness, Larbert and Central Scotland. Fast response via M9 and M80. Emergency 24/7 cover. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-02-01',
    lastModified: '2026-02-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mobile tyre fitting falkirk',
      'tyre fitting falkirk',
      'emergency tyre fitting falkirk',
      'mobile tyre fitter grangemouth',
      'flat tyre falkirk',
      'tyre fitting larbert',
      'mobile tyre fitting central scotland',
      'tyre rescue falkirk',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-stirling-central-scotland',
      'mobile-tyre-fitting-glasgow',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Mobile Tyre Fitting in Falkirk & Central Scotland

Falkirk sits at the exact centre of Scotland's motorway network — the M9, M80, and A9 all converge within a few miles of the town centre. Every vehicle travelling between Glasgow and Edinburgh via the M80 passes through or near Falkirk, making it one of our busiest callout areas.

## Coverage: Falkirk and Surrounding Area

**Falkirk town** (FK1, FK2): Town centre, Camelon, Grahamston, Tamfourhill, Stenhousemuir, Larbert.

**Grangemouth** (FK3): Scotland's major petrochemical port and industrial area — high commercial vehicle volume.

**Bo'ness** (EH51): South Forth bank, 5 miles east of Falkirk.

**Denny and Dunipace** (FK6): North of Falkirk via A872.

**Polmont** (FK2): East Falkirk, adjacent to M9 junction.

## M9 and M80 Motorway Coverage

The M9 (Edinburgh–Stirling) and M80 (Glasgow–Stirling) both pass through the Falkirk area. We attend motorway breakdowns across the full Falkirk section of both routes.

For M9 or M80 callouts: move to the hard shoulder at the first safe opportunity, exit left, stand behind the barrier, then call **0141 266 0690**. Response to M9/M80 Falkirk sections is typically 35–55 minutes.

## Response Times

| Location | Typical Response |
|----------|-----------------|
| Falkirk town centre (FK1) | 35–45 min |
| Grangemouth (FK3) | 35–50 min |
| Larbert, Stenhousemuir | 35–45 min |
| Bo'ness (EH51) | 40–55 min |
| Denny (FK6) | 40–50 min |
| Polmont (FK2) | 40–50 min |

**Call 0141 266 0690** for immediate tyre fitting in Falkirk and Central Scotland, or [book online](/book).

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Stirling coverage](/blog/mobile-tyre-fitting-stirling-central-scotland)`,
  },
  {
    slug: 'mobile-tyre-fitting-hamilton-south-lanarkshire',
    title: 'Mobile Tyre Fitting in Hamilton & South Lanarkshire | Tyre Rescue',
    description:
      'Mobile tyre fitting across Hamilton, East Kilbride, Rutherglen and South Lanarkshire. Response from 25 minutes via M74. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-02-01',
    lastModified: '2026-02-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mobile tyre fitting hamilton',
      'tyre fitting hamilton south lanarkshire',
      'emergency tyre fitting hamilton',
      'mobile tyre fitter east kilbride',
      'flat tyre hamilton scotland',
      'tyre fitting motherwell',
      'mobile tyre fitting rutherglen',
      'tyre rescue south lanarkshire',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-motherwell-north-lanarkshire',
      'mobile-tyre-fitting-glasgow',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Mobile Tyre Fitting in Hamilton & South Lanarkshire

Hamilton sits just 12 miles south-east of Glasgow via the M74 — one of Scotland's most heavily used motorway sections. Tyre Rescue covers all of South Lanarkshire, from Rutherglen and Cambuslang to Hamilton, East Kilbride, Wishaw, and Lanark.

## Coverage: Hamilton and South Lanarkshire

**Hamilton** (ML3): Town centre, Ferniegair, Burnbank, Blantyre, Uddingston.

**East Kilbride** (G74–G75): Scotland's largest new town — extensive retail and residential coverage.

**Rutherglen** (G73) and **Cambuslang** (G72): Just south of Glasgow, fast access via M74.

**Motherwell** (ML1), **Wishaw** (ML2): See also [Motherwell & North Lanarkshire guide](/blog/mobile-tyre-fitting-motherwell-north-lanarkshire).

**Carluke** (ML8), **Larkhall** (ML9), **Lanark** (ML11), **Strathaven** (ML10): All covered.

## M74 Motorway Coverage

The M74 between Glasgow and Hamilton (Junction 5) is among the busiest sections of Scottish motorway. Smart motorway sections have dynamic hard shoulders — if breaking down, look for the nearest Emergency Refuge Area (blue sign with orange SOS phone).

| Location | Typical Response |
|----------|-----------------|
| Hamilton town centre (ML3) | 25–35 min |
| East Kilbride (G74–G75) | 25–40 min |
| Rutherglen (G73) | 20–30 min |
| Motherwell (ML1) | 30–40 min |
| Wishaw (ML2) | 30–45 min |
| Lanark (ML11) | 45–55 min |

**Call 0141 266 0690** for immediate emergency tyre fitting in Hamilton and South Lanarkshire. [Book online](/book) for scheduled appointments.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Motherwell & North Lanarkshire](/blog/mobile-tyre-fitting-motherwell-north-lanarkshire) | [Emergency tyre fitting](/emergency-tyre-fitting-near-me)`,
  },
  {
    slug: 'mobile-tyre-fitting-kilmarnock-ayrshire',
    title: 'Mobile Tyre Fitting in Kilmarnock & Ayrshire | Tyre Rescue',
    description:
      'Mobile tyre fitting across Kilmarnock, Ayr, Irvine, Troon and all of Ayrshire. Response from 40 minutes via M77. Emergency 24/7 cover. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-02-01',
    lastModified: '2026-02-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mobile tyre fitting kilmarnock',
      'tyre fitting ayrshire',
      'emergency tyre fitting kilmarnock',
      'mobile tyre fitter ayr',
      'flat tyre ayrshire',
      'tyre fitting troon',
      'mobile tyre fitting irvine',
      'tyre rescue kilmarnock',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-irvine-north-ayrshire',
      'mobile-tyre-fitting-glasgow',
      '24-hour-emergency-tyre-fitting-scotland',
    ],
    content: `# Mobile Tyre Fitting in Kilmarnock & Ayrshire

Kilmarnock is East Ayrshire's largest town and the commercial centre for a region that stretches from the M77 motorway to the Ayrshire coast. Tyre Rescue covers all of Ayrshire — Kilmarnock, Ayr, Irvine, Troon, Prestwick, Stewarton, Galston and beyond — dispatching via the M77.

## Response Times from Glasgow to Ayrshire

The M77 gives direct motorway access from Glasgow to the Ayrshire towns. Our typical response times:

| Location | Typical Response |
|----------|-----------------|
| Kilmarnock (KA1–KA3) | 40–55 min |
| Ayr (KA7–KA8) | 45–60 min |
| Troon (KA10) | 45–55 min |
| Prestwick (KA9) | 45–55 min |
| Irvine (KA11–KA12) | 40–55 min |
| Stewarton (KA3) | 45–55 min |
| Galston (KA4) | 50–60 min |
| Maybole (KA19) | 55–65 min |
| Girvan (KA26) | 65–80 min |
| Largs (KA30) | 55–65 min |

## Ayrshire Road Coverage

### A77 and M77 Corridor
The main Ayrshire artery runs from Glasgow through Kilmarnock to Ayr and down to Stranraer. We cover the full length — including the M77 smart motorway sections near Glasgow and the A77 through Ayr, Maybole, and Girvan.

### A71 and East Ayrshire
The A71 connects Kilmarnock with Irvine and the coast, and runs east through Hurlford, Galston, and Darvel to the Strathaven corridor. Fully covered.

### Ayrshire Coast
Largs, Fairlie, Ardrossan, Saltcoats (KA22), Stevenston, Irvine, Troon, Prestwick, Ayr — the entire Ayrshire coast is within our response area. Many coastal locations require vehicle ferry travel (Arran island service from Ardrossan) — we cover the mainland Ardrossan side.

## Common Ayrshire Callout Locations

Our Ayrshire callouts frequently include:
- **Kilmarnock town centre and retail parks**: King Street, Bellfield Retail Park
- **Ayr town centre and racecourse**: particularly on race days when parking is at full capacity
- **Prestwick Airport** (KA9): common callout location for returning travellers
- **Irvine Beach and Harbourside**: seasonal footfall location
- **Motorway service areas**: Kilmarnock services on the M77

## Tyre Stock for Ayrshire Vehicles

Ayrshire vehicle types include a high proportion of:
- Family hatchbacks and crossovers (Ford Focus, Kia Sportage, Hyundai Tucson)
- Vans for tradespeople (Ayrshire has significant construction and agricultural trade)
- Coastal driving vehicles (frequently road-salted in winter)

We carry common sizes for all these vehicles and can source less common sizes within a few hours.

## Book Ayrshire Mobile Tyre Fitting

Call **0141 266 0690** for immediate emergency fitting anywhere in Kilmarnock and Ayrshire. [Book online](/book) for a scheduled appointment at your home or workplace.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me) | [Tyre fitting Irvine North Ayrshire](/blog/mobile-tyre-fitting-irvine-north-ayrshire)`,
  },
  {
    slug: 'best-budget-tyres-scotland-2026',
    title: 'Best Budget Tyres for Scottish Roads: Value Picks for 2026',
    description:
      'Which budget tyres perform best on Scotland\'s wet roads? We compare Nexen, Hankook, Falken, Toyo and more — honest recommendations for drivers who want safety without overspending.',
    category: 'maintenance',
    publishDate: '2026-01-01',
    lastModified: '2026-01-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'best budget tyres scotland',
      'cheap tyres scotland',
      'budget tyres glasgow',
      'affordable tyres edinburgh',
      'nexen tyres scotland',
      'hankook tyres scotland',
      'falken tyres scotland',
      'cheap tyres good quality scotland',
    ],
    relatedSlugs: [
      'best-tyres-scottish-roads-guide',
      'tyre-fitting-costs-scotland-pricing-guide',
      'part-worn-tyres-scotland-are-they-safe',
    ],
    content: `# Best Budget Tyres for Scottish Roads: Value Picks for 2026

Not every driver needs premium tyres — but every driver needs tyres that are safe on Scotland's wet roads. This guide cuts through the marketing and gives honest recommendations for budget-conscious Scottish drivers who still want tyres that perform when it rains.

## What 'Budget' Actually Means

Budget tyres typically cost 40–60% less than premium equivalents. The trade-offs are real: shorter tread life, slightly longer wet braking distances, and less refined road noise. But the best budget brands have improved dramatically over the past decade, and many now score adequately — if not excellently — in independent tests.

For Scottish conditions, the key test for any tyre is **wet grip performance**. Check the EU tyre label wet grip rating (A is best, G is worst). A budget tyre with a B or C wet grip rating is acceptable. A budget tyre with a D or E rating on Scotland's wet roads is a false economy.

## Top Budget Tyre Brands for Scotland

### Nexen (Recommended)
Nexen is a South Korean manufacturer that consistently scores well in independent tests relative to price. Their **N'Blue HD Plus** (summer) and **N'Blue 4Season** (all-season) regularly outperform similarly priced competitors in wet braking tests.

- **Wet grip**: B to C rating on most common sizes
- **Typical cost**: £45–£75 for common passenger car sizes
- **Best for**: Central Belt drivers wanting reliable year-round performance on a budget
- **All-season option**: N'Blue 4Season with 3PMSF symbol

### Hankook
Another South Korean brand with a strong mid-budget reputation. The **Ventus Prime 4** (summer) and **Kinergy 4S2** (all-season) are frequently recommended by independent tyre reviewers.

- **Wet grip**: B to C rating
- **Typical cost**: £48–£80
- **Best for**: Good balance of longevity and wet performance; tread life is above average for the price
- **All-season option**: Kinergy 4S2 with 3PMSF symbol

### Falken
Japanese-owned, Falken has a solid reputation particularly for SUV and 4x4 applications. The **Sincera SN110** (summer) and **Euroall Season AS210** (all-season) are reliable choices.

- **Wet grip**: B to C rating
- **Typical cost**: £45–£70
- **Best for**: 4x4 and SUV drivers on a budget; also a strong choice for performance-oriented budget options

### Toyo
Another Japanese manufacturer with better-than-average build quality for the price. The **Proxes CF2** and **Nanoenergy 3** are competitive budget summer tyres.

- **Wet grip**: B to C rating
- **Typical cost**: £45–£75
- **Best for**: Drivers who prioritise longevity — Toyo tyres tend to last longer per pound spent

### Kumho
Korean brand occupying the true budget end of the market. Adequate for low-mileage and city drivers.

- **Wet grip**: C rating typical
- **Typical cost**: £38–£60
- **Best for**: Very low-mileage vehicles or as a budget secondary car tyre

## Budget Tyres to Avoid

Not all budget brands are equal. Some tyre brands from Eastern European and Chinese manufacturers have limited test data, inconsistent quality control, or very poor wet grip ratings. As a rule, avoid unfamiliar brands with no independent test history, any tyre with a D or lower EU wet grip rating, and tyres that cannot be traced to a major named manufacturer.

When in doubt, stick to the brands above. They are all from established manufacturers with consistent quality standards.

## Do Budget Tyres Pass MOT?

Yes — any tyre that is legally manufactured and properly fitted can pass MOT. The MOT checks tread depth, condition, and fitment (correct size and load rating) — not the brand. A new budget tyre from Nexen or Hankook at 8mm tread passes MOT just as easily as a premium Michelin.

## Budget Tyres and Wet Braking: The Real Numbers

Independent tyre tests (ADAC, Auto Bild, Tyre Reviews) consistently show that budget tyres stop approximately 3–6 metres further than premium brands from 80km/h on wet roads. For a Scottish city driver stopping at a pedestrian crossing, this is the difference between stopping in time and not.

This is why we recommend:
- Budget tyres: acceptable for city and urban use at normal speeds
- Premium tyres: recommended for motorway use, Highland routes, and anyone covering high annual mileage in Scotland
- All-season budget tyres: a good compromise for most Scottish drivers who do not want seasonal swaps

## Tyre Prices at Tyre Rescue

When you call **0141 266 0690** or [book online](/book), we will quote options across all three price tiers:
- **Budget**: from approximately £40–£60 per tyre fitted
- **Mid-range**: from approximately £65–£90 per tyre fitted
- **Premium**: from approximately £90–£150+ per tyre fitted

We do not push you toward premium if budget fits your needs and usage. We give you the options and you decide.

[Tyre fitting costs Scotland](/blog/tyre-fitting-costs-scotland-pricing-guide) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'tyre-rotation-guide-scotland',
    title: 'Tyre Rotation Scotland: How Often, Why It Matters, and How to Do It',
    description:
      'Should you rotate your tyres in Scotland? How often, which pattern, and does it matter for FWD vs AWD? Complete guide for Scottish drivers.',
    category: 'maintenance',
    publishDate: '2026-01-01',
    lastModified: '2026-01-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'tyre rotation scotland',
      'how often rotate tyres uk',
      'tyre rotation fwd scotland',
      'tyre rotation pattern uk',
      'rotating tyres scotland',
      'mobile tyre rotation scotland',
      'tyre rotation cost scotland',
      'when to rotate tyres',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'tyre-maintenance-checklist-scotland',
      'wheel-balancing-vs-alignment-scotland',
    ],
    content: `# Tyre Rotation Scotland: How Often, Why It Matters, and How to Do It

Tyre rotation is one of the simplest and most cost-effective ways to extend tyre life — yet many Scottish drivers have never done it. This guide explains exactly what it is, why it matters on Scottish roads, and how often you should do it.

## What Is Tyre Rotation?

Tyre rotation means moving each tyre to a different position on the vehicle on a regular schedule. For example, the front-left tyre moves to the rear-left, the rear-right moves to the front-right, and so on. This ensures all four tyres wear at a more even rate.

## Why Tyres Wear Unevenly

Different positions on a vehicle experience very different stresses:

### Front-Wheel Drive (FWD) — Most Common in Scotland
Front tyres on FWD cars (Ford Focus, VW Golf, Vauxhall Astra, most Hyundais and Kias) wear significantly faster than rear tyres. The front tyres handle:
- Driving force (propulsion)
- Steering
- The majority of braking load (front tyres take 60–70% of braking force)

Result: Front tyres often wear 2–3 times faster than rear tyres on FWD vehicles. Without rotation, you may find front tyres at 2mm while rears are still at 5mm.

### Rear-Wheel Drive (RWD) — Sports, Performance, Larger Saloons
The opposite problem: rear tyres take the driving load and wear faster, while front tyres wear from steering and braking.

### All-Wheel Drive (AWD) and Four-Wheel Drive (4WD)
More even wear overall, but imbalances still occur. Many AWD systems send more torque to one axle, creating uneven wear over time. Without rotation, tyre diameter differences between axles can stress the AWD drivetrain.

## Benefits of Tyre Rotation for Scottish Drivers

**Longer tyre life**: Even wear across all four tyres typically extends total tyre set life by 15–25%.

**Better wet performance**: All four tyres maintain adequate tread depth simultaneously. Without rotation, you may be running two worn front tyres and two nearly-new rears — a dangerous combination on Scotland's wet roads.

**Cost savings**: Replacing one worn axle's worth of tyres at a time (because the other two are still good) sounds economical but is actually more expensive than running all four through their lifecycle together.

**AWD protection**: For Subarus, Audi Quattros, Range Rovers, and other AWD/4WD vehicles, keeping all four tyres at similar tread depths protects the drivetrain from strain caused by diameter differences.

## How Often to Rotate Tyres

The standard recommendation is every **6,000–8,000 miles**, or every 6 months — whichever comes first.

For Scottish drivers:
- **City drivers** (stop-start, frequent cornering): every 5,000–6,000 miles due to higher front tyre stress
- **Motorway commuters**: every 8,000 miles
- **FWD cars**: err toward the more frequent end — front tyre wear is rapid
- **AWD/4WD**: at every tyre check or at least once a year

A good rule: rotate at every other oil change, or whenever you have your tyres inspected.

## Rotation Patterns

The correct pattern depends on your tyre specification:

### Standard Cross Rotation (FWD — most common)
- Front-left → Rear-right
- Front-right → Rear-left
- Rear-left → Front-right
- Rear-right → Front-left

### Rearward Cross Rotation (RWD)
- Rear-left → Front-left (straight back to front)
- Rear-right → Front-right
- Front-left → Rear-right
- Front-right → Rear-left

### Forward Cross Rotation (AWD/4WD)
- Front-left → Rear-right
- Front-right → Rear-left
- (Opposite to FWD pattern)

### Directional Tyres
If your tyres are directional (they have a specific rotation direction marked on the sidewall — an arrow or "rotation" marking), they can only move front-to-rear on the same side. They cannot be crossed. Some performance cars have asymmetric directional tyres that cannot be rotated at all — check your handbook.

## Can Tyre Rescue Rotate Tyres?

Yes — rotation is included when we visit for any tyre change. If you want rotation only (no new tyres), this requires removing and remounting existing tyres on different positions. Call **0141 266 0690** and we will advise whether a mobile rotation visit is practical for your vehicle and tyres.

**Cost of tyre rotation at Tyre Rescue**: from approximately £30–£40 for a full set (four wheels), included in any tyre fitting visit.

[Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Tyre maintenance checklist](/blog/tyre-maintenance-checklist-scotland) | [Wheel balancing vs alignment](/blog/wheel-balancing-vs-alignment-scotland)`,
  },
  {
    slug: 'aquaplaning-prevention-scotland',
    title: 'Aquaplaning in Scotland: What It Is, How to Prevent It, What to Do',
    description:
      'Aquaplaning is a real risk on Scotland\'s wet roads. Learn what causes it, how proper tyres and tread depth reduce the risk, and what to do if your car aquaplanes.',
    category: 'safety',
    publishDate: '2025-12-01',
    lastModified: '2025-12-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'aquaplaning scotland',
      'aquaplaning prevention uk',
      'hydroplaning car scotland',
      'aquaplaning what to do',
      'wet road safety scotland',
      'aquaplaning tyres scotland',
      'motorway flooding scotland',
      'tyre aquaplaning risk',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'tyre-pressure-guide-scotland',
      'best-tyres-scottish-roads-guide',
    ],
    content: `# Aquaplaning in Scotland: What It Is, How to Prevent It, What to Do

Scotland's high rainfall makes aquaplaning one of the most important driving hazards to understand. The country experiences over 1,000mm of rain annually in many areas — some western Highland locations exceed 3,000mm. On motorways and fast A-roads, standing water can form rapidly, making aquaplaning a real risk throughout the year.

## What Is Aquaplaning?

Aquaplaning (also called hydroplaning) occurs when a tyre cannot displace water fast enough to maintain contact with the road surface. A thin layer of water builds between the tyre and the road, and the tyre effectively floats on this film. When this happens:

- The tyre loses traction almost completely
- Steering input has little effect
- Braking is severely compromised
- The car continues in whatever direction it was heading

It can happen without warning. One moment you are driving normally; the next, the steering feels light and unresponsive — a sensation experienced drivers recognise immediately.

## What Causes Aquaplaning?

### 1. Speed
The faster you drive through standing water, the less time a tyre has to displace water through its tread grooves. The risk increases dramatically above 50mph.

### 2. Water depth
Deeper standing water is harder to displace. Scotland's roads — particularly rural roads with poor drainage — can develop significant standing water quickly during heavy rain.

### 3. Tread depth
This is the single most important preventable factor. Tyre tread grooves exist specifically to channel water away from the contact patch. A new tyre at 8mm can displace approximately 8 litres of water per second at 50mph. A tyre at 1.6mm (the legal limit) displaces far less — making aquaplaning far more likely.

### 4. Tyre pressure
Under-inflated tyres have a smaller contact patch and less rigid carcass, making aquaplaning more likely. Over-inflated tyres have a smaller contact patch for a different reason — both extremes are worse than correct pressure.

### 5. Road surface and drainage
Motorway surfaces (typically smooth tarmac) are more prone to aquaplaning than textured road surfaces with better drainage.

## Aquaplaning Risk on Scottish Roads

### Motorways (M8, M74, M77, M80, M9)
Scottish motorways, like English ones, can develop lanes of standing water in heavy rain. The M8 between Glasgow and Edinburgh is particularly prone to standing water in its lower sections during heavy rain events. Reduce speed in heavy rain even if the road looks clear.

### Highland A-roads (A9, A82, A87, NC500)
Highland roads often lack central reservations and have poor drainage camber in places. Standing water can appear rapidly during rain. The A9 through Drumochter has a history of flooding in autumn.

### Urban roads
Glasgow and Edinburgh experience flash flooding during heavy downpours. Low-lying roads near rivers (Clyde, Forth, Tay tributaries) are most vulnerable.

## How to Prevent Aquaplaning

### 1. Maintain tyre tread above 3mm
On Scotland's wet roads, 3mm is the practical safety minimum, not 1.6mm. The difference in water displacement between 3mm and 1.6mm tread is significant. Check your tread monthly.

### 2. Maintain correct tyre pressure
Check pressures monthly and before long journeys. See your door placard for the correct figure. Correct pressure maximises the tyre's ability to channel water.

### 3. Reduce speed in heavy rain
The Highway Code recommends doubling your stopping distance in wet conditions. At 50mph with good tyres on a wet Scottish motorway, this is sound advice. At 70mph in standing water with worn tyres, it is essential.

### 4. Avoid sudden steering or braking in standing water
Approach standing water gradually, reducing speed smoothly before you enter it. Sudden steering or braking in water dramatically increases aquaplaning risk.

### 5. Avoid driving through unknown depths of standing water
Water as shallow as 15cm can cause control loss. If you cannot see the road surface through flood water, do not drive through it.

## What to Do If Your Car Aquaplanes

1. **Do not panic**: Aquaplaning is temporary — as speed reduces, the tyres regain contact with the road.
2. **Do not brake sharply**: This can make the vehicle unstable and extend the aquaplaning period.
3. **Ease off the accelerator gently**: Allow the car to slow through engine braking.
4. **Hold the steering wheel straight**: Keep it pointing in your intended direction of travel. Do not attempt to steer while the tyres have no grip.
5. **Wait for grip to return**: You will feel the steering firm up as the tyres regain road contact. Only then gently steer if correction is needed.
6. **Check your tyres**: After a severe aquaplaning incident, stop and check for tyre damage. The sustained sliding can cause unusual wear.

## After an Aquaplaning Incident

If the aquaplaning was severe, or your tyres are worn (below 3mm), call Tyre Rescue on **0141 266 0690**. We can assess your tyres and fit replacements at your location across Scotland.

[Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Tyre pressure guide](/blog/tyre-pressure-guide-scotland) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide)`,
  },
  {
    slug: '4x4-suv-tyres-scotland-highlands',
    title: '4x4 and SUV Tyres in Scotland: Highland Routes & Off-Road Guide',
    description:
      'Driving a 4x4 or SUV in Scotland? Here\'s what to know about tyre choice for Highland routes, NC500, farm tracks, and winter conditions — all-terrain vs all-season vs road tyres.',
    category: 'maintenance',
    publishDate: '2025-12-01',
    lastModified: '2025-12-01',
    readingTime: 7,
    featured: false,
    keywords: [
      '4x4 tyres scotland',
      'suv tyres scotland',
      'all terrain tyres scotland highlands',
      '4x4 tyre fitting scotland',
      'land rover tyres scotland',
      'range rover tyres scotland',
      'off road tyres scotland nc500',
      'highland 4x4 tyre guide',
    ],
    relatedSlugs: [
      'best-tyres-scottish-roads-guide',
      'winter-tyres-when-to-switch-scotland',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# 4x4 and SUV Tyres in Scotland: Highland Routes & Off-Road Guide

Scotland is arguably the best country in the UK for 4x4 owners. From the NC500 to the Knoydart peninsula, from the Galloway Forest to the single-track roads of Argyll, Scotland's terrain rewards genuine off-road capability — but only with the right tyres.

## The Three Tyre Categories for Scottish 4x4s

### Road Tyres (HT — Highway Terrain)
Standard road tyres designed for tarmac. These come fitted to most new SUVs — Range Rover Sport, BMW X5, Porsche Cayenne, Mercedes GLE — because manufacturers prioritise comfort, fuel economy, and noise on roads. They offer good performance on wet tarmac and motorways, but limited traction on soft ground, mud, or deep snow.

**Best for**: SUVs used primarily on roads — urban and motorway driving with occasional rural tarmac.
**Not suitable for**: Anything beyond sealed roads.

### All-Season Tyres (AS)
All-season SUV tyres balance road comfort with winter capability. Premium options (Michelin CrossClimate SUV, Continental AllSeasonContact SUV) carry the Three Peak Mountain Snowflake symbol, meaning they meet winter traction standards.

**Best for**: Central Belt SUV owners who want year-round performance without seasonal tyre swaps. Good for the NC500 when driven on sealed roads year-round.
**Limitations**: Significantly less capable than all-terrain tyres on unpaved surfaces; not suitable for agricultural tracks, muddy forest roads, or genuine off-road.

### All-Terrain Tyres (AT)
The hybrid — a more aggressive tread pattern that performs well on both tarmac and unpaved surfaces. Brands include BF Goodrich All-Terrain T/A KO2, Toyo Open Country A/T, Falken Wildpeak AT, Cooper Discoverer AT3.

All-terrain tyres have:
- Larger tread blocks with more spacing for self-cleaning in mud and loose surfaces
- Reinforced sidewalls for resistance to rock cuts and kerbing damage
- Adequate wet road performance (though not as good as road tyres)
- Acceptable road noise (modern AT tyres are significantly quieter than older designs)

**Best for**: Regular use on Highland forestry roads, farm tracks, unpaved access roads; NC500 drivers who go off the main road; any 4x4 used in agricultural or estate work.
**Trade-offs**: Slightly higher fuel consumption, more road noise, slightly longer wet braking distance than road tyres.

### Mud-Terrain Tyres (MT)
The most aggressive option — designed for deep mud, rock crawling, and serious off-road use. Very large, widely spaced tread blocks.

**Best for**: Land Rover Defenders, agricultural use, green-laning, dedicated off-road driving.
**Not suitable for**: Primary road use — loud, shorter lifespan on tarmac, significantly worse wet braking.

## What Scottish Terrain Requires

### NC500 Sealed Tarmac
The NC500 is entirely on sealed (though often narrow) roads. Standard road tyres or all-season tyres are perfectly adequate for the NC500. The roads are tarmac throughout. All-terrain tyres are not necessary — though they cause no harm.

### Highland Single-Track Roads
Scotland's network of single-track roads with passing places is tarmac (often patched and repaired) with soft verges. Standard road tyres handle these fine, but if you regularly pull onto verges for passing places in wet conditions, all-terrain tyres provide more confidence.

### Forestry Roads and Estate Tracks
Scotland has thousands of miles of unsealed forestry roads and estate tracks — the domain of all-terrain tyres. If you access any of these regularly, all-terrain tyres are worth the investment.

### Winter Highland Driving
Any 4x4 driven on Highland roads from October to April benefits from winter or all-season tyres. The A9 Drumochter, A82 Glencoe, A939 through the Lecht, and the A93 through Glenshee all see significant snowfall in winter. Four-wheel drive with summer road tyres is not the same as two-wheel drive with winter tyres on snow — both matter.

## Load and Speed Ratings for SUVs

Many SUVs carry significant weight — passengers, luggage, roof boxes, tow bars. Check that any tyre you fit has adequate load index. A Range Rover Defender 110 can weigh over 2,500kg fully loaded, requiring tyres with very high load ratings (102–107 or above per tyre).

When calling **0141 266 0690** about 4x4 or SUV tyres, give your vehicle make, model, and trim. We will confirm the correct load index and speed rating before supplying.

## Mobile 4x4 Tyre Fitting in Scotland

Tyre Rescue fits all tyre types for 4x4s and SUVs across Scotland, including all-terrain tyres. We carry common 4x4 sizes (16", 17", 18", 20" rims) and can source specialist sizes within a few hours.

For Highland breakdowns — including Land Rovers and Defenders on estate roads — call **0141 266 0690**. We cover all of Scotland including Argyll, the far Highlands, and island routes accessible by road.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Winter tyres Scotland](/blog/winter-tyres-when-to-switch-scotland) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide)`,
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
  {
    slug: 'ford-tyre-fitting-scotland',
    title: 'Ford Tyre Fitting Scotland: Focus, Fiesta, Kuga, Puma & Transit',
    description:
      'Mobile Ford tyre fitting across Scotland. Correct tyre sizes for every Ford model — Focus, Fiesta, Kuga, Puma, EcoSport, Mustang Mach-E, Transit and Transit Connect. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'ford tyre fitting scotland',
      'ford focus tyres scotland',
      'ford fiesta tyres scotland',
      'ford kuga tyres scotland',
      'ford transit tyres scotland',
      'ford puma tyres scotland',
      'ford mustang mach-e tyres scotland',
      'mobile ford tyre fitting glasgow',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'mobile-tyre-fitting-glasgow',
    ],
    content: `# Ford Tyre Fitting Scotland: Every Model Covered

Ford is the best-selling car brand in the UK. From the iconic Ford Fiesta to the popular Ford Focus, Kuga, Puma, and Transit vans, there are more Fords on Scottish roads than any other make. Tyre Rescue provides mobile Ford tyre fitting across all of Scotland — with the right tyre size for every model, loaded on the van before we arrive.

## Ford Focus Tyre Sizes

The Ford Focus (2018–present, fourth generation) uses these factory-standard tyre sizes:

| Focus Trim | Tyre Size |
|---|---|
| Focus Style / Trend | 205/55R16 |
| Focus Active | 215/55R17 |
| Focus ST-Line | 235/40R18 |
| Focus ST | 235/35R19 |

Older Focus models (2011–2018, Mk3): 195/65R15 on base trims, 205/55R16 on mid-spec, 225/40R18 on Focus ST.

**TPMS**: Fourth-generation Ford Focus has standard TPMS. A reset is included with every tyre replacement.

## Ford Fiesta Tyre Sizes

The Ford Fiesta (discontinued 2023 but still the most common Ford on Scottish roads) uses:

| Fiesta Trim | Tyre Size |
|---|---|
| Fiesta Style (1.0 EcoBoost) | 175/65R14 |
| Fiesta Zetec | 185/60R15 |
| Fiesta ST-Line | 195/55R15 or 205/40R17 |
| Fiesta ST | 215/40R17 |

**Note**: The Fiesta was discontinued in July 2023. However, replacement tyres remain widely needed — it was UK car of the year for multiple consecutive years.

## Ford Puma Tyre Sizes

The Ford Puma (2019–present) is now one of Ford's bestsellers:

| Puma Trim | Tyre Size |
|---|---|
| Puma Titanium | 195/65R15 |
| Puma ST-Line | 215/45R17 |
| Puma ST-Line X | 215/45R17 |
| Puma ST | 235/40R18 |

## Ford Kuga Tyre Sizes

The Ford Kuga (third generation, 2019–present) — available as PHEV and mild hybrid:

| Kuga Trim | Tyre Size |
|---|---|
| Kuga Titanium | 215/65R16 |
| Kuga ST-Line | 235/50R18 |
| Kuga ST-Line X / Vignale | 235/45R19 |

**PHEV models**: The Kuga PHEV adds weight (hybrid battery) so load index is important — Tyre Rescue always matches the correct load index for hybrid and plug-in Ford models.

## Ford Mustang Mach-E Tyre Sizes

The fully electric Ford Mustang Mach-E uses high-load-index tyres to handle EV weight:

| Mach-E Trim | Tyre Size |
|---|---|
| Standard Range | 225/55R19 (load index 103+) |
| Extended Range | 235/50R20 |
| GT | 255/45R20 |

All Mach-E models have TPMS. The Mach-E has no spare wheel — a flat tyre requires immediate mobile fitting. Call us and we'll confirm stock for your exact EV tyre specification.

## Ford EcoSport Tyre Sizes

The Ford EcoSport (discontinued 2022 in UK):

- 195/60R16 (base trims)
- 215/55R17 (Titanium trim)

## Ford Galaxy & S-MAX Tyre Sizes

Popular family MPVs:

| Model | Tyre Size |
|---|---|
| Galaxy / S-MAX (2015+) | 215/55R17 or 235/45R18 |
| Galaxy / S-MAX (2006–2015) | 215/55R16 or 225/45R18 |

## Ford Transit & Transit Connect Van Tyre Sizes

Ford Transit vans require C-rated commercial tyres capable of carrying heavy loads:

| Transit Model | Common Tyre Size |
|---|---|
| Transit Custom PHEV | 215/65R16C |
| Transit (L2/L3 panel van) | 215/75R16C or 235/65R16C |
| Transit (heavy duty) | 215/75R16C or LT235/85R16 |
| Transit Connect | 205/65R15C or 195/70R15C |
| Transit Courier | 175/65R14C |

**Commercial fit note**: Transit vans require high load index commercial-rated (C-rated) tyres. Fitting a standard passenger tyre on a Transit is unsafe and illegal. Tyre Rescue carries the correct C-rated stock for all Transit variants.

## Ford TPMS Reset

All Ford models from 2013 onward have TPMS (Tyre Pressure Monitoring System). After any tyre replacement or rotation, the Ford TPMS system requires a reset — otherwise the warning light stays on permanently.

**Ford TPMS reset methods vary by model**:
- **Indirect TPMS (older models)**: Reset via the vehicle information menu in the instrument cluster — press and hold the button while driving over 25mph
- **Direct TPMS (2018+ Focus, Kuga, Puma, Mach-E)**: Requires a TPMS diagnostic tool to read and reset each sensor

Tyre Rescue carries TPMS reset tools for all Ford models. Reset is included at no additional charge with every tyre fitting.

## Emergency Ford Tyre Fitting in Scotland

If you have a flat Ford tyre anywhere in Scotland:

1. **Move off the road** safely — hard shoulder, car park, layby
2. **Do not drive on a flat** — it will destroy the tyre and potentially the wheel
3. **Call 0141 266 0690** — we'll confirm your tyre size from your registration number and give you an ETA
4. We carry Focus, Fiesta, Kuga, Puma, and Transit tyres on every van

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Ford?

- **Correct tyre size every time** — we look up your reg and confirm before ordering
- **TPMS reset included** — no warning light after we've finished
- **Commercial Ford Transit tyres in stock** — C-rated commercial tyres ready
- **All of Scotland covered** — from your driveway in Glasgow to a layby in the Highlands

Call **0141 266 0690** or [book online](/book) to arrange mobile Ford tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland) | [Van tyre fitting Scotland](/blog/van-tyre-fitting-scotland)`,
  },
  {
    slug: 'volkswagen-tyre-fitting-scotland',
    title: 'Volkswagen Tyre Fitting Scotland: Golf, Polo, Passat, Tiguan & More',
    description:
      'Mobile VW tyre fitting across Scotland. Correct tyre sizes for every Volkswagen model — Golf, Polo, Passat, Tiguan, T-Roc, ID.3, ID.4, Transporter. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'volkswagen tyre fitting scotland',
      'vw golf tyres scotland',
      'vw polo tyres scotland',
      'vw tiguan tyres scotland',
      'vw passat tyres scotland',
      'vw id.4 tyres scotland',
      'volkswagen transporter tyres scotland',
      'mobile vw tyre fitting glasgow',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'tesla-tyre-fitting-scotland',
    ],
    content: `# Volkswagen Tyre Fitting Scotland: Every VW Model Covered

Volkswagen is one of the most popular car brands in Scotland, particularly in Glasgow, Edinburgh, and Aberdeen. From the VW Polo and Golf to the Tiguan SUV and ID.4 electric, Tyre Rescue provides specialist mobile VW tyre fitting across all of Scotland — with the right tyre for your exact model, already on the van when we arrive.

## VW Golf Tyre Sizes

The Golf (Mk8, 2020–present) is one of the most-fitted tyre models in Scotland:

| Golf Trim | Tyre Size |
|---|---|
| Golf Life / Style | 205/55R16 or 215/50R17 |
| Golf R-Line | 225/45R17 or 235/35R19 |
| Golf GTI | 225/40R18 or 225/35R19 |
| Golf GTE (PHEV) | 205/55R16 or 225/45R17 |
| Golf R | 235/35R19 |
| Golf Alltrack | 215/60R17 |

VW Golf Mk7 (2012–2020): 195/65R15 base, 205/55R16 mid, 225/40R18 GTI/R.

**GTE PHEV note**: The Golf GTE carries extra battery weight — the correct load index is critical. Tyre Rescue confirms load index compatibility before fitting any PHEV model.

## VW Polo Tyre Sizes

The Polo (Mk6, 2017–present):

| Polo Trim | Tyre Size |
|---|---|
| Polo Life / Style | 185/65R15 or 195/55R16 |
| Polo R-Line | 215/40R17 |
| Polo GTI | 215/40R17 |

Older Polo (2009–2017, Mk5): 175/65R14 base, 185/60R15 mid-spec.

## VW Passat Tyre Sizes

The Passat (B8, 2014–2023; now replaced by Passat Estate):

| Passat Trim | Tyre Size |
|---|---|
| Passat SE | 215/55R17 |
| Passat SEL / Elegance | 225/45R17 or 245/40R18 |
| Passat Alltrack | 235/55R18 |
| Passat Estate R-Line | 245/40R18 |

The Passat GTE PHEV uses 235/45R17 with enhanced load rating.

## VW Tiguan Tyre Sizes

The Tiguan (Mk2, 2016–present) is VW's bestselling SUV:

| Tiguan Trim | Tyre Size |
|---|---|
| Tiguan Life | 215/65R17 |
| Tiguan Style / R-Line | 235/50R19 |
| Tiguan R | 235/45R20 |
| Tiguan Allspace | 235/55R18 |

**eHybrid note**: The Tiguan eHybrid has additional kerb weight — the correct load index (typically 103+) is mandatory.

## VW T-Roc Tyre Sizes

| T-Roc Trim | Tyre Size |
|---|---|
| T-Roc Life / Style | 215/55R17 |
| T-Roc R-Line | 235/45R18 or 235/40R19 |
| T-Roc R | 235/40R19 |
| T-Roc Cabriolet | 235/45R18 |

## VW ID.3 & ID.4 Electric Tyre Sizes

VW electric vehicles have specific tyre requirements due to their weight and instant torque:

**VW ID.3** (2020–present):
- Standard: 215/50R20 or 215/55R18
- Plus: 235/40R20
- All ID.3 tyres have acoustic foam inside the liner to reduce EV road noise

**VW ID.4** (2021–present):
- Standard / Pro: 235/50R20 or 235/55R19
- GTX (4Motion): 235/50R20 or 255/45R20
- All load index 104+

**EV tyre fitting note**: ID.3 and ID.4 do not come with spare wheels. A flat requires immediate mobile tyre fitting. Call us and we'll confirm stock for your exact VW EV tyre specification. We stock acoustic foam-lined VW OE-approved tyres for ID models.

## VW Touareg Tyre Sizes

| Touareg Trim | Tyre Size |
|---|---|
| Touareg SEL | 255/55R18 |
| Touareg R-Line | 275/45R20 or 285/45R20 |
| Touareg eHybrid | 275/45R20 |

The Touareg eHybrid is one of the heaviest VW models — load index requirements are stringent (typically 109+).

## VW Transporter & Caravelle Van Tyre Sizes

The Transporter T6.1 (2019–present) requires C-rated commercial tyres:

| Model | Common Tyre Size |
|---|---|
| Transporter T6.1 (panel van) | 215/65R16C or 235/65R16C |
| Transporter T6.1 (high roof) | 215/65R16C |
| Caravelle | 235/55R17 (passenger-rated) |
| Multivan | 235/55R17 |

**Van note**: Transporter panel vans used commercially require C-rated tyres. Tyre Rescue carries correct C-rated commercial stock for all Transporter variants.

## VW Caddy Tyre Sizes

The Caddy (Mk5, 2020–present):
- 195/75R16C (cargo van)
- 215/60R17 (Life people carrier)

## VW TPMS Reset

All VW models from 2015 onward have mandatory TPMS. After any tyre change on a Volkswagen:

- **Indirect TPMS (most models)**: Reset via the infotainment menu — Car → Tyres → Store
- **Direct TPMS (ID.3, ID.4, Touareg)**: Requires a diagnostic tool to reset each sensor

Tyre Rescue carries VW-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency VW Tyre Fitting in Scotland

If you have a flat tyre on your Volkswagen anywhere in Scotland:

1. **Move off the road safely** — car park, layby, or hard shoulder
2. **Do not drive on a completely flat tyre** — you will damage the wheel rim
3. **Call 0141 266 0690** — we confirm tyre size from your VW registration and give you an ETA
4. We carry Golf, Polo, Tiguan, ID.4, and Transporter tyres across all service areas

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

## Why Use Tyre Rescue for Your Volkswagen?

- **VW-specific tyre expertise** — we know the differences between Golf GTI, GTE, and R tyre specs
- **EV tyre specialists** — acoustic foam-lined tyres for ID.3 and ID.4 in stock
- **Commercial Transporter stock** — C-rated van tyres ready to fit
- **TPMS reset included** — your VW warning light won't stay on after we've finished
- **All of Scotland covered** — from Glasgow to the Highlands

Call **0141 266 0690** or [book online](/book) for mobile VW tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland)`,
  },
  {
    slug: 'vauxhall-tyre-fitting-scotland',
    title: 'Vauxhall Tyre Fitting Scotland: Corsa, Astra, Mokka, Insignia & Vivaro',
    description:
      'Mobile Vauxhall tyre fitting across Scotland. Correct tyre sizes for every Vauxhall model — Corsa, Astra, Mokka, Crossland, Grandland, Insignia, and Vivaro van. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'vauxhall tyre fitting scotland',
      'vauxhall corsa tyres scotland',
      'vauxhall astra tyres scotland',
      'vauxhall mokka tyres scotland',
      'vauxhall insignia tyres scotland',
      'vauxhall vivaro tyres scotland',
      'vauxhall grandland tyres scotland',
      'mobile vauxhall tyre fitting glasgow',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'ford-tyre-fitting-scotland',
    ],
    content: `# Vauxhall Tyre Fitting Scotland: Every Model Covered

Vauxhall (known as Opel outside the UK) has been one of the UK's most popular car brands for decades. The Vauxhall Corsa, Astra, and Mokka are among the most-driven cars in Scotland, and the Vivaro is a fixture on Scottish worksites and driveways. Tyre Rescue provides mobile Vauxhall tyre fitting across all of Scotland — the right tyre for your model, fitted at your location.

## Vauxhall Corsa Tyre Sizes

The Vauxhall Corsa F (2019–present) — now available as electric (Corsa-e):

| Corsa Trim | Tyre Size |
|---|---|
| Corsa SE / Elite | 195/55R16 |
| Corsa GS / Ultimate | 205/45R17 |
| Corsa-e (electric) | 195/55R16 or 215/45R17 (load index 91+) |

Corsa E (2014–2019): 175/65R14 base, 185/65R15 mid, 195/55R16 upper trims.

**Corsa-e note**: Electric Corsa-e models have no spare wheel. A flat requires immediate mobile fitting.

## Vauxhall Astra Tyre Sizes

The Vauxhall Astra L (2022–present, sixth generation):

| Astra Trim | Tyre Size |
|---|---|
| Astra Design / GS | 225/45R17 or 235/40R18 |
| Astra GSe PHEV | 235/40R18 (load index 95+) |
| Astra Sports Tourer | 225/45R17 or 235/40R18 |

Astra K (2015–2022): 195/65R15 base, 205/55R16 mid, 235/40R18 on OPC line.

**PHEV note**: The Astra GSe plug-in hybrid requires tyres with a load index of 95+ to accommodate the battery weight. We always verify load index before fitting PHEV models.

## Vauxhall Mokka Tyre Sizes

The Vauxhall Mokka B (2021–present) and Mokka-e:

| Mokka Trim | Tyre Size |
|---|---|
| Mokka SE / GS | 215/65R16 or 215/55R17 |
| Mokka GS Line | 225/50R17 |
| Mokka Ultimate | 215/45R18 |
| Mokka-e (electric) | 215/50R17 (load index 95+) or 215/45R18 |

Older Mokka A (2012–2019): 215/60R17 base, 225/55R17 upper trims.

## Vauxhall Crossland Tyre Sizes

The Crossland (2017–present) — compact crossover:

- 195/65R15 (base trims)
- 205/60R16 (mid trims)
- 215/55R17 (upper trims)

## Vauxhall Grandland Tyre Sizes

The Grandland (2021–present, refreshed generation):

| Grandland Trim | Tyre Size |
|---|---|
| Grandland GS | 235/55R18 |
| Grandland GS Line | 235/50R19 |
| Grandland GSe PHEV | 235/50R19 (load index 103+) |
| Grandland Ultimate | 235/50R19 |

The Grandland GSe is one of Vauxhall's heaviest models — correct load index is essential.

## Vauxhall Insignia Tyre Sizes

The Insignia Grand Sport and Sports Tourer (2017–2022 and older Mk1):

| Insignia Trim | Tyre Size |
|---|---|
| Insignia Design | 215/60R16 |
| Insignia SRi / Elite | 235/45R17 or 245/40R18 |
| Insignia GSi | 245/40R18 |
| Insignia Country Tourer | 235/55R17 |

Older Insignia A (2008–2017): 215/55R16 base, 235/45R18 on upper trims.

## Vauxhall Vivaro & Combo Van Tyre Sizes

The Vauxhall Vivaro C (2019–present) requires C-rated commercial tyres:

| Vivaro / Combo Model | Tyre Size |
|---|---|
| Vivaro (L1 standard) | 215/65R16C |
| Vivaro (L2 long wheelbase) | 215/65R16C or 235/60R17C |
| Vivaro-e (electric) | 215/65R16C (high load index) |
| Combo Cargo (small panel van) | 195/70R15C |

**Van fitting note**: Vivaro vans require C-rated tyres — passenger tyres are unsafe on commercial vehicles. The Vivaro-e electric van also requires C-rated tyres with appropriate load index (typically 104+) to handle the additional EV battery weight.

## Vauxhall TPMS Reset

All Vauxhall models from 2016 onward have TPMS. After any tyre replacement:

- **Indirect TPMS (most Vauxhall models)**: Reset via the vehicle information display — navigate to tyre pressure settings and select "Reset"
- **Direct TPMS (Astra L, Grandland, Mokka-e)**: Requires a TPMS diagnostic tool to communicate with each wheel sensor

Tyre Rescue carries Vauxhall-compatible TPMS reset tools. Reset is included with every fitting — your warning light will be cleared before we leave.

## Emergency Vauxhall Tyre Fitting in Scotland

If you have a flat tyre on your Vauxhall anywhere in Scotland:

1. **Pull off the road safely** — do not drive on a flat rim
2. **Call 0141 266 0690** — give us your registration number and we'll identify the correct tyre size
3. We'll confirm an ETA and price before dispatching
4. We carry Corsa, Astra, Mokka, Grandland, and Vivaro tyres across all areas

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Vauxhall?

- **Vauxhall PHEV expertise** — correct load index for Astra GSe, Grandland GSe, and Mokka-e
- **Commercial Vivaro stock** — C-rated van tyres ready to fit across Scotland
- **TPMS reset included** — dashboard warnings cleared at the time of fitting
- **All Scottish postcodes covered** — G to ZE
- **No hidden fees** — we quote the total price before any work begins

Call **0141 266 0690** or [book online](/book) for mobile Vauxhall tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Van tyre fitting Scotland](/blog/van-tyre-fitting-scotland) | [Ford tyre fitting Scotland](/blog/ford-tyre-fitting-scotland)`,
  },
  {
    slug: 'nissan-tyre-fitting-scotland',
    title: 'Nissan Tyre Fitting Scotland: Qashqai, Juke, Leaf & X-Trail',
    description:
      'Mobile Nissan tyre fitting across Scotland. Correct tyre sizes for every Nissan model — Qashqai, Juke, X-Trail, Leaf, Micra, Navara. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'nissan tyre fitting scotland',
      'nissan qashqai tyres scotland',
      'nissan juke tyres scotland',
      'nissan leaf tyres scotland',
      'nissan x-trail tyres scotland',
      'nissan micra tyres scotland',
      'mobile nissan tyre fitting glasgow',
      'nissan navara tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'volkswagen-tyre-fitting-scotland',
    ],
    content: `# Nissan Tyre Fitting Scotland: Every Model Covered

The Nissan Qashqai is the second best-selling car in the UK — and across Scotland, the Qashqai, Juke, and X-Trail are fixtures in every city, town, and village. Tyre Rescue provides specialist mobile Nissan tyre fitting across all of Scotland, with the right tyre size for every model loaded on the van before we arrive.

## Nissan Qashqai Tyre Sizes

The Nissan Qashqai J12 (2021–present, third generation):

| Qashqai Trim | Tyre Size |
|---|---|
| Qashqai Visia / Acenta | 215/65R17 |
| Qashqai N-Connecta | 225/55R18 |
| Qashqai Tekna | 225/50R19 |
| Qashqai e-Power | 225/55R18 or 225/50R19 |

Qashqai J11 (2013–2021, second generation): 205/60R16 base, 215/55R17 mid, 225/45R19 on top trims.

**e-Power note**: The Qashqai e-Power self-charges its battery from the petrol engine but drives on electricity only — it weighs more than the standard petrol Qashqai. Correct load index (typically 99+) is important.

## Nissan Juke Tyre Sizes

The Nissan Juke (2019–present, second generation):

| Juke Trim | Tyre Size |
|---|---|
| Juke Visia / Acenta | 205/60R16 |
| Juke N-Connecta | 215/55R17 |
| Juke Tekna | 225/45R18 |
| Juke Hybrid | 215/55R17 or 225/45R18 |

Nissan Juke (2010–2019, first generation): 195/60R16 base, 215/55R17 upper trims.

## Nissan X-Trail Tyre Sizes

The Nissan X-Trail T33 (2022–present):

| X-Trail Trim | Tyre Size |
|---|---|
| X-Trail Visia / Acenta | 225/65R17 |
| X-Trail N-Connecta | 235/55R18 |
| X-Trail Tekna | 255/45R20 |
| X-Trail e-Power / e-4ORCE | 235/55R18 or 255/45R20 |

X-Trail T32 (2013–2022): 215/65R17 base, 235/55R18 upper trims.

**e-4ORCE AWD note**: The X-Trail e-4ORCE all-wheel drive has significant extra weight. The correct load index is critical — Tyre Rescue checks this before every fitting.

## Nissan Leaf Tyre Sizes

The Nissan Leaf is the UK's bestselling fully electric car:

| Leaf Generation | Tyre Size |
|---|---|
| Leaf (Mk2, 2018–present) | 205/55R16 (SV) or 215/50R17 (Tekna) |
| Leaf e+ (62kWh) | 215/50R17 (load index 95+) |
| Leaf (Mk1, 2010–2017) | 195/65R15 |

**Leaf fitting note**: The Mk2 Leaf has no spare wheel. A flat tyre means calling for mobile fitting immediately. The heavier e+ 62kWh battery pack requires a higher load index — we always verify this before fitting.

## Nissan Micra Tyre Sizes

The Micra K14 (2017–2022, fifth generation — discontinued UK):

- 185/65R15 (base trims)
- 195/55R16 (Tekna)

Older Micra K13 (2010–2016): 175/65R14 base, 185/60R15 upper trims.

## Nissan Navara Tyre Sizes

The Nissan Navara (D40/D23 pick-up) is popular on Scottish farms and estates:

| Navara Model | Tyre Size |
|---|---|
| Navara NP300 (2016–present) | 255/65R17 |
| Navara NP300 (some trims) | 265/60R18 |
| Navara D40 (older) | 265/65R17 |

**Navara fitting note**: The Navara is a one-tonne rated pick-up. Its tyres are light-truck rated (LT designation or reinforced) — not standard passenger tyres. We carry correct Navara-spec tyres.

## Nissan Ariya (Electric SUV) Tyre Sizes

The Nissan Ariya (2022–present):

- 235/55R19 (standard)
- 255/45R20 (Advance / e-4ORCE trims)

All Ariya models have no spare wheel and require acoustic foam-lined or similarly quiet EV-specification tyres where possible. The e-4ORCE AWD Ariya carries additional weight — load index 104+ required.

## Nissan TPMS Reset

All Nissan models from 2014 onward have TPMS. After any tyre change:

- **Indirect TPMS (Qashqai, Juke, Micra)**: Reset via the vehicle info menu — press and hold the TPMS reset button (usually located in the glovebox or under the dash) with the ignition on
- **Direct TPMS (Leaf, Ariya, X-Trail e-4ORCE)**: Requires a TPMS diagnostic tool to communicate with each wheel sensor

Tyre Rescue carries Nissan-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Nissan Tyre Fitting in Scotland

If you have a flat tyre on your Nissan anywhere in Scotland:

1. **Stop safely** — hard shoulder, layby, or car park
2. **Do not drive on the rim** — it will destroy the wheel
3. **Call 0141 266 0690** — give your registration number; we will identify the tyre spec instantly
4. **Nissan Leaf / Ariya owners**: No spare wheel in the car — mobile fitting is your only option

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Nissan?

- **Qashqai specialists** — we carry the most common Qashqai sizes (215/65R17 and 225/55R18) on every van
- **EV expertise** — correct load index and acoustic tyres for Leaf and Ariya
- **TPMS reset included** — dashboard warnings cleared before we leave
- **Commercial Navara stock** — light-truck rated tyres for the Navara pick-up
- **All of Scotland** — 34 cities and areas covered

Call **0141 266 0690** or [book online](/book) for mobile Nissan tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland) | [VW tyre fitting Scotland](/blog/volkswagen-tyre-fitting-scotland)`,
  },
  {
    slug: 'toyota-tyre-fitting-scotland',
    title: 'Toyota Tyre Fitting Scotland: Yaris, Corolla, RAV4, Hilux & More',
    description:
      'Mobile Toyota tyre fitting across Scotland. Correct tyre sizes for every Toyota model — Yaris, Corolla, RAV4, C-HR, Yaris Cross, GR Yaris, Hilux. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'toyota tyre fitting scotland',
      'toyota yaris tyres scotland',
      'toyota corolla tyres scotland',
      'toyota rav4 tyres scotland',
      'toyota c-hr tyres scotland',
      'toyota hilux tyres scotland',
      'toyota gr yaris tyres scotland',
      'mobile toyota tyre fitting glasgow',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'nissan-tyre-fitting-scotland',
    ],
    content: `# Toyota Tyre Fitting Scotland: Every Model Covered

Toyota is the world's largest car manufacturer and consistently one of the UK's top five best-selling brands. In Scotland, the Toyota Yaris, Corolla, RAV4, and Hilux are common sights from Glasgow to the Highlands. Tyre Rescue provides specialist mobile Toyota tyre fitting across all of Scotland — the right tyre for your exact model, loaded before we arrive.

## Toyota Yaris Tyre Sizes

The Toyota Yaris (Mk4, 2020–present) — available as petrol hybrid only:

| Yaris Trim | Tyre Size |
|---|---|
| Yaris Active / Icon | 185/65R15 |
| Yaris Design / Excel | 195/50R16 or 215/40R17 |
| Yaris GR Sport | 215/40R17 |
| Yaris Cross (2021–present) | 215/60R17 (standard) or 225/50R18 (Adventure) |

**Hybrid note**: All Mk4 Yaris are hybrid. The load index is slightly higher than a comparable non-hybrid supermini — always confirmed before fitting.

## Toyota GR Yaris Tyre Sizes

The GR Yaris (2020–present) — performance hot hatch, 4WD:

- 225/40R18 (standard)
- 225/35R19 (Circuit Pack)

**GR Yaris note**: The GR Yaris uses staggered or fitment-critical performance tyres. If you need emergency tyre replacement on a GR Yaris, call us and we will check stock for your specific spec before dispatching.

## Toyota Corolla Tyre Sizes

The Toyota Corolla (E210, 2018–present) — all hybrid in UK:

| Corolla Body Style | Tyre Size |
|---|---|
| Corolla Hatchback (Icon) | 205/55R16 |
| Corolla Hatchback (Design) | 225/45R17 |
| Corolla Touring Sports | 215/45R17 or 225/40R18 |
| Corolla GR Sport | 225/40R18 |

**Hybrid load index**: The Corolla hybrid adds weight compared to an equivalent petrol — we check the manufacturer's load index specification before fitting.

## Toyota RAV4 Tyre Sizes

The Toyota RAV4 (Mk5, 2019–present) — UK's bestselling Toyota:

| RAV4 Trim | Tyre Size |
|---|---|
| RAV4 Icon / Business | 225/65R17 |
| RAV4 Design | 235/55R18 |
| RAV4 Excel | 235/55R18 or 235/45R19 |
| RAV4 PHEV | 235/55R18 (load index 104+) |
| RAV4 Adventure | 225/60R18 |

**RAV4 PHEV note**: The plug-in hybrid RAV4 is significantly heavier than the self-charging hybrid or petrol version. A minimum load index of 104 is typically required. Tyre Rescue always verifies this before fitting a PHEV.

## Toyota C-HR Tyre Sizes

The Toyota C-HR (Mk2, 2023–present):

| C-HR Trim | Tyre Size |
|---|---|
| C-HR Design | 225/50R18 |
| C-HR GR Sport | 235/45R19 |
| C-HR Plug-in Hybrid | 225/50R18 (load index 99+) |

C-HR (Mk1, 2016–2022): 215/60R17 base, 225/50R18 upper trims.

## Toyota Prius Tyre Sizes

The Toyota Prius (Mk5, 2023–present):

- 195/60R17 (standard — unusual narrow rim for aerodynamic efficiency)
- 215/45R19 (larger wheels option)

Older Prius (Mk4, 2015–2022): 195/65R15 base, 215/45R17 upper.

**Prius note**: The Prius 195/60R17 is an unusual size — we check stock for this specifically before dispatching. Call ahead on 0141 266 0690.

## Toyota Land Cruiser Tyre Sizes

The Land Cruiser is popular on Scottish farms, estates, and for towing:

| Land Cruiser Model | Tyre Size |
|---|---|
| Land Cruiser 300 (2021–present) | 285/60R18 or 265/65R17 |
| Land Cruiser 200 (older) | 285/60R18 or 275/55R19 |
| Land Cruiser 90/120 (older) | 265/70R16 or 265/65R17 |

## Toyota Hilux Tyre Sizes

The Toyota Hilux is the UK's bestselling pick-up truck — particularly popular on Scottish farms and estates:

| Hilux Generation | Tyre Size |
|---|---|
| Hilux Revo (2016–present) | 265/65R17 |
| Hilux (some trim levels) | 255/70R16 |

**Hilux note**: The Hilux uses light-truck rated tyres (LT265/65R17 or similar). Standard passenger tyres are unsuitable. Tyre Rescue carries Hilux-spec tyres.

## Toyota TPMS Reset

All Toyota models from 2015 onward have TPMS. After any tyre change:

- **Indirect TPMS (Yaris, Corolla, C-HR)**: Reset via the multi-information display — navigate to Vehicle Settings → Tyre Pressure → Reset
- **Direct TPMS (RAV4 PHEV, Land Cruiser, Hilux)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Toyota-compatible TPMS reset tools. Reset is included with every fitting.

## Emergency Toyota Tyre Fitting in Scotland

If you have a flat tyre on your Toyota anywhere in Scotland:

1. **Yaris, Corolla, C-HR**: These may have a space-saver spare — check your boot first. If no spare, call us.
2. **RAV4, Prius**: Check for a spare tyre kit or space-saver in the boot before calling.
3. **GR Yaris**: No conventional spare — call us immediately.
4. **Hilux, Land Cruiser**: These often carry a full-size spare mounted underneath — attempt the change only if it's safe to do so and you're off a busy road.

Call **0141 266 0690** — give us your registration number and we will identify your tyre specification and confirm an ETA.

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Toyota?

- **Hybrid specialists** — we understand load index requirements for hybrid and PHEV Toyota models
- **Hilux and Land Cruiser stock** — light-truck and all-terrain tyres for Scotland's working vehicles
- **TPMS reset included** — dashboard warnings cleared at the time of fitting
- **GR Yaris performance tyres** — we stock and fit performance spec where available
- **All of Scotland covered** — from your driveway in Glasgow to a layby on the NC500

Call **0141 266 0690** or [book online](/book) for mobile Toyota tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland) | [Nissan tyre fitting Scotland](/blog/nissan-tyre-fitting-scotland)`,
  },
  {
    slug: 'audi-tyre-fitting-scotland',
    title: 'Audi Tyre Fitting Scotland: A3, A4, Q3, Q5, Q7 & e-tron',
    description:
      'Mobile Audi tyre fitting across Scotland. Correct tyre sizes for every Audi model — A1, A3, A4, A6, Q3, Q5, Q7, e-tron, RS models. TPMS reset included. Glasgow, Edinburgh, Aberdeen covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'audi tyre fitting scotland',
      'audi a3 tyres scotland',
      'audi q5 tyres scotland',
      'audi q7 tyres scotland',
      'audi e-tron tyres scotland',
      'audi rs tyres scotland',
      'mobile audi tyre fitting glasgow',
      'audi a4 tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'bmw-tyre-fitting-scotland',
    ],
    content: `# Audi Tyre Fitting Scotland: Every Model Covered

Audi is one of the most popular premium car brands in Scotland, particularly in Glasgow, Edinburgh, and Aberdeen. Audi vehicles often use staggered fitments, run-flat tyres, and high-load-index specifications that differ from mainstream cars. Tyre Rescue provides specialist mobile Audi tyre fitting across all of Scotland — correct spec, first time, every time.

## Audi A1 Tyre Sizes

The Audi A1 (GB8, 2019–present):

| A1 Trim | Tyre Size |
|---|---|
| A1 Sport | 195/60R15 or 205/55R16 |
| A1 S Line | 215/45R17 or 225/35R18 |
| A1 Citycarver | 205/60R16 |

Older A1 (2010–2018): 195/65R15 base, 205/55R16 mid, 225/35R18 on S Line sport.

## Audi A3 Tyre Sizes

The Audi A3 (8Y, 2020–present) — includes A3 Sportback, Saloon, and 45 TFSI e PHEV:

| A3 Trim | Tyre Size |
|---|---|
| A3 Sport / Technik | 225/50R17 |
| A3 S Line | 225/40R18 or 245/35R19 |
| A3 S3 | 245/35R19 |
| A3 RS3 | 255/35R19 (front), 255/35R19 (rear) |
| A3 45 TFSI e (PHEV) | 225/40R18 (load index 92+) |

Audi A3 (8V, 2012–2020): 205/55R16 base, 225/45R17 mid, 235/35R19 S3/RS3.

**PHEV note**: The A3 45 TFSI e plug-in hybrid adds significant weight. Load index must be verified before fitting.

## Audi A4 & A5 Tyre Sizes

The Audi A4 B9 (2015–present):

| A4 Trim | Tyre Size |
|---|---|
| A4 Sport | 225/55R16 or 235/45R17 |
| A4 S Line | 245/40R18 |
| A4 S4 | 255/35R19 |
| A4 Allroad | 235/55R17 or 245/45R18 |
| A4 45 TFSI e PHEV | 245/40R18 (load index 97+) |

Audi A5 (F5, 2016–present): Similar sizes to A4 — 245/40R18 base, 265/30R20 on RS5.

## Audi Q3 Tyre Sizes

The Audi Q3 (F3, 2019–present):

| Q3 Trim | Tyre Size |
|---|---|
| Q3 Sport | 215/65R16 or 235/50R18 |
| Q3 S Line | 235/45R19 or 255/40R19 |
| Q3 45 TFSI e PHEV | 235/45R19 (load index 95+) |
| Q3 RS Q3 | 255/40R20 |

## Audi Q5 Tyre Sizes

The Audi Q5 (FY, 2017–present) — UK's bestselling Audi model:

| Q5 Trim | Tyre Size |
|---|---|
| Q5 Sport | 235/65R17 or 255/50R19 |
| Q5 S Line | 255/45R20 |
| Q5 SQ5 | 255/45R20 or 265/40R21 |
| Q5 55 TFSI e PHEV | 255/45R20 (load index 105+) |
| Q5 Sportback | 255/45R20 |

**Q5 PHEV**: The Q5 55 TFSI e is a heavier vehicle — load index requirements are stringent. Never fit a standard-load-index tyre on a Q5 PHEV.

## Audi Q7 & Q8 Tyre Sizes

| Model | Tyre Size |
|---|---|
| Q7 Sport | 235/65R19 |
| Q7 S Line | 255/50R20 or 285/45R20 |
| Q7 SQ7 | 285/40R21 or 285/45R20 |
| Q8 / SQ8 | 285/45R20 or 295/40R21 |
| Q8 e-tron | 255/50R20 (front) / 255/45R21 |

## Audi e-tron, Q4 e-tron & e-tron GT

Audi's electric vehicle range has specific tyre requirements:

**Audi Q4 e-tron (2021–present)**:
- 215/55R19 (standard) or 235/50R20 or 255/45R21
- High load index required (98+ for AWD)
- Acoustic foam-lined tyres recommended to reduce EV road noise

**Audi e-tron (now Q8 e-tron, 2019–present)**:
- 265/45R20 (standard) or 265/40R21
- Minimum load index 108 (the vehicle weighs ~2.6 tonnes)
- OE-approved Pirelli, Michelin, or Continental EV tyres recommended

**Audi e-tron GT & RS e-tron GT**:
- 265/35R20 (front), 305/30R20 (rear) — staggered fitment
- **Important**: Staggered fitments cannot be rotated. Call us to confirm front and rear specs separately.

**EV tyre fitting note**: Audi electric models do not carry spare tyres. Mobile fitting is the only solution for a flat EV tyre. We carry EV-specification stock for all Audi electric models.

## Audi RS Models — Performance Tyre Sizes

| RS Model | Tyre Size |
|---|---|
| RS3 | 255/35R19 |
| RS4 Avant | 265/35R19 or 275/30R20 |
| RS6 Avant | 275/30R21 or 285/25R22 |
| RS Q3 | 255/40R20 |
| RS Q8 | 285/40R22 or 295/35R22 |

**RS performance note**: RS models use Michelin Pilot Sport 4S, Continental SportContact 6, or Pirelli P Zero as OE tyres. We carry performance-grade equivalents for RS models — call ahead on 0141 266 0690 to confirm stock for your specific size.

## Audi TPMS Reset

All Audi models have TPMS (Tyre Pressure Monitoring System), typically:

- **Indirect TPMS (A1, A3, Q3)**: Reset via MMI — Car → Servicing & Checks → Tyres → Store Current Settings
- **Direct TPMS (Q7, Q8, e-tron, RS models)**: Requires a TPMS diagnostic tool to relearn each sensor position

Tyre Rescue carries Audi-compatible TPMS reset tools for all models. Reset is included at no additional charge with every fitting.

## Emergency Audi Tyre Fitting in Scotland

If you have a flat tyre on your Audi anywhere in Scotland:

1. **A3, A4, Q3, Q5**: Check if your Audi has a run-flat tyre (marked DSST or ROF on the sidewall) — if so, you can drive carefully to a safe location at no more than 50mph
2. **e-tron, Q4 e-tron**: No spare wheel — call immediately
3. **RS models**: Performance tyres are not run-flats; stop safely and call us
4. **Call 0141 266 0690** — give your registration number for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

## Why Use Tyre Rescue for Your Audi?

- **Premium brand expertise** — we understand staggered fitments, RS performance specs, and PHEV load index requirements
- **Audi EV specialists** — OE-approved and EV-optimised tyres for Q4 e-tron, e-tron GT, and Q8 e-tron
- **TPMS reset included** — your Audi's MMI warning cleared before we leave
- **All of Scotland covered** — from your garage in Edinburgh's New Town to the A9 in Perthshire
- **No surprise fees** — full itemised quote before any work begins

Call **0141 266 0690** or [book online](/book) for mobile Audi tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland) | [Tesla tyre fitting Scotland](/blog/tesla-tyre-fitting-scotland)`,
  },
  {
    slug: 'mercedes-tyre-fitting-scotland',
    title: 'Mercedes Tyre Fitting Scotland: A-Class, C-Class, E-Class, GLE & EQS',
    description:
      'Mobile Mercedes tyre fitting across Scotland. Correct tyre sizes for every Mercedes model — A-Class, C-Class, E-Class, GLC, GLE, EQA, EQC, EQS, AMG. Run-flat and TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'mercedes tyre fitting scotland',
      'mercedes c class tyres scotland',
      'mercedes glc tyres scotland',
      'mercedes eqs tyres scotland',
      'mercedes amg tyres scotland',
      'mercedes e class tyres scotland',
      'mobile mercedes tyre fitting glasgow',
      'mercedes a class tyres scotland',
    ],
    relatedSlugs: [
      'run-flat-tyres-scotland-guide',
      'tpms-warning-light-scotland-guide',
      'bmw-tyre-fitting-scotland',
    ],
    content: `# Mercedes Tyre Fitting Scotland: Every Model Covered

Mercedes-Benz is one of the most popular premium car brands in Scotland, and Mercedes tyres often carry specific requirements — run-flat extended mobility tyres (MOExtended / EMT), staggered fitments on AMG models, and high-load-index EV specifications. Tyre Rescue provides specialist mobile Mercedes tyre fitting across all of Scotland.

## Mercedes A-Class & B-Class Tyre Sizes

The Mercedes A-Class (W177, 2018–present) and B-Class (W247, 2018–present):

| Model / Trim | Tyre Size |
|---|---|
| A-Class Sport | 205/55R16 or 225/45R17 |
| A-Class AMG Line | 225/40R18 |
| A 35 AMG | 235/35R19 (front), 255/35R19 (rear) |
| A 45 AMG | 235/35R19 (front), 255/35R19 (rear) |
| B-Class Sport | 205/55R16 |
| B-Class AMG Line | 225/45R17 or 235/40R18 |

**A 35/45 AMG staggered note**: The AMG A-Class uses different front and rear tyre sizes. These cannot be rotated. When calling, specify whether you need front or rear tyres.

## Mercedes C-Class Tyre Sizes

The Mercedes C-Class (W206, 2022–present):

| C-Class Trim | Tyre Size |
|---|---|
| C 180 / C 200 Sport | 225/55R17 or 225/45R18 |
| C-Class AMG Line | 245/40R18 or 245/35R19 |
| C 300 e PHEV | 245/40R18 (load index 93+) |
| C 63 AMG | 255/35R19 (front), 275/35R19 (rear) |

C-Class (W205, 2014–2022): 205/55R16 base, 225/45R17 mid, 255/35R19 AMG.

**C 300 e PHEV note**: The plug-in hybrid C-Class carries additional battery weight — load index is higher than the standard C-Class.

## Mercedes E-Class Tyre Sizes

The Mercedes E-Class (W214, 2023–present) and W213 (2016–2023):

| E-Class Trim | Tyre Size |
|---|---|
| E 200 / E 220 Sport | 235/55R17 or 245/45R18 |
| E-Class AMG Line | 245/40R19 or 265/35R19 |
| E 53 AMG | 265/35R19 (front), 285/30R20 (rear) |
| E 63 AMG | 265/35R19 (front), 295/30R20 (rear) |
| E All-Terrain | 245/50R18 |

## Mercedes GLC Tyre Sizes

The Mercedes GLC (X254, 2022–present) — UK's bestselling Mercedes model:

| GLC Trim | Tyre Size |
|---|---|
| GLC 200 / 300 Sport | 235/60R18 or 255/50R19 |
| GLC AMG Line | 255/45R20 |
| GLC 300 e PHEV | 255/45R20 (load index 105+) |
| AMG GLC 43 / 63 | 265/40R21 (front), 295/35R21 (rear) |

**GLC PHEV**: The GLC 300 e plug-in hybrid requires load index 105+ minimum. We verify this before every fitting.

## Mercedes GLE Tyre Sizes

The Mercedes GLE (V167, 2019–present):

| GLE Trim | Tyre Size |
|---|---|
| GLE 300d / 350 Sport | 265/50R19 |
| GLE AMG Line | 265/45R20 or 285/40R21 |
| GLE 350 de PHEV | 265/45R20 (load index 108+) |
| AMG GLE 53 / 63 | 285/40R21 (front), 325/35R21 (rear) |

## Mercedes EQA, EQB & EQC Electric Tyre Sizes

**Mercedes EQA (2021–present)**:
- 235/50R19 or 235/45R20
- Load index 99+ required

**Mercedes EQB (2021–present)**:
- 235/50R18 (SWB) or 235/45R19
- Load index 99+

**Mercedes EQC (2019–present)**:
- 235/50R19 (standard) or 235/45R20
- Minimum load index 103 — the EQC weighs 2.4 tonnes

All Mercedes EVs have no spare wheel. Mobile tyre fitting is the only solution for a flat. Call us immediately.

## Mercedes EQS & EQE Electric Tyre Sizes

**Mercedes EQS (V297, 2021–present)** — full-size electric flagship:
- 265/40R21 (standard)
- 265/35R22 or 285/35R22 (larger wheels)
- Acoustic foam-lined tyres — mandatory for EQS to maintain the vehicle's near-silent interior

**Mercedes EQE (V295, 2022–present)**:
- 235/50R19 (standard) or 265/40R21

**EQS fitting note**: The EQS uses special low-rolling-resistance, acoustic foam-lined tyres. Fitting a standard non-OE-type tyre will increase cabin noise significantly. We carry EQS-specification tyres or OE-equivalent alternatives.

## Mercedes AMG & AMG GT Tyre Sizes

| AMG Model | Front | Rear |
|---|---|---|
| AMG A 45 | 235/35R19 | 255/35R19 |
| AMG C 63 | 255/35R19 | 275/35R19 |
| AMG GT (C190) | 265/35R19 | 295/30R20 |
| AMG GT 4-Door | 255/35R20 | 285/30R21 |

All AMG staggered fitments require separate front and rear tyre orders. Call us to specify front or rear when ordering.

## Mercedes Run-Flat Tyres (MOExtended / EMT)

Many Mercedes models — particularly C-Class, E-Class, and S-Class — come factory-fitted with run-flat tyres marked **MOExtended** or **EMT** (Extended Mobility Technology). These allow driving at up to 50mph for up to 50 miles when flat.

**Important**: Like BMW RSC run-flats, Mercedes EMT run-flat tyres must be replaced with run-flats. Fitting a conventional tyre on a Mercedes designed for run-flats affects TPMS calibration and handling.

Tyre Rescue stocks MOExtended and EMT run-flat tyres for all Mercedes models.

## Mercedes TPMS Reset

All Mercedes models have TPMS. After any tyre change:

- **Indirect TPMS (A-Class, B-Class, GLA)**: Reset via MBUX — Settings → Service → Tyre Pressure Monitor → Confirm New Tyre Pressures
- **Direct TPMS (E-Class, GLC, GLE, EQ models, AMG)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Mercedes-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Mercedes Tyre Fitting in Scotland

If you have a flat tyre on your Mercedes anywhere in Scotland:

1. **Check for run-flat (MOExtended/EMT) markings on the tyre sidewall** — if present, you can drive carefully at no more than 50mph for up to 50 miles
2. **C-Class, E-Class, S-Class run-flats**: Move to a safe location then call us
3. **EQC, EQS, EQE**: No spare wheel — call us immediately
4. **AMG staggered fitments**: Confirm whether you need front or rear when you call
5. **Call 0141 266 0690** — give your registration number for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

## Why Use Tyre Rescue for Your Mercedes?

- **Run-flat specialists** — we stock and fit MOExtended/EMT run-flat tyres for all Mercedes models
- **EV tyre specialists** — acoustic foam-lined tyres for EQS, EQE, and EQA
- **AMG staggered fitment expertise** — we understand front/rear split specs
- **TPMS reset included** — MBUX tyre warnings cleared before we leave
- **PHEV load index compliance** — we always check and confirm load index for PHEV models
- **All of Scotland** — from Glasgow's West End to Highland estates

Call **0141 266 0690** or [book online](/book) for mobile Mercedes tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland) | [Audi tyre fitting Scotland](/blog/audi-tyre-fitting-scotland)`,
  },
  {
    slug: 'kia-tyre-fitting-scotland',
    title: 'Kia Tyre Fitting Scotland: Sportage, EV6, Niro, Sorento & Ceed',
    description:
      'Mobile Kia tyre fitting across Scotland. Correct tyre sizes for every Kia model — Sportage, EV6, Niro EV, Sorento, Ceed, Rio, Picanto, Stinger. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'kia tyre fitting scotland',
      'kia sportage tyres scotland',
      'kia ev6 tyres scotland',
      'kia niro tyres scotland',
      'kia sorento tyres scotland',
      'kia ceed tyres scotland',
      'mobile kia tyre fitting glasgow',
      'kia stinger tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'hyundai-tyre-fitting-scotland',
    ],
    content: `# Kia Tyre Fitting Scotland: Every Model Covered

The Kia Sportage was the third best-selling car in the UK in 2023, and Kia's range of SUVs, EVs, and family cars has grown enormously in Scotland over the last five years. Tyre Rescue provides specialist mobile Kia tyre fitting across all of Scotland — the right tyre for your exact model, every time.

## Kia Sportage Tyre Sizes

The Kia Sportage (NQ5, 2021–present) — UK's most popular Korean car:

| Sportage Trim | Tyre Size |
|---|---|
| Sportage 2 / GT-Line | 225/65R17 |
| Sportage 3 / 4 | 235/55R18 |
| Sportage GT-Line S | 255/45R19 |
| Sportage Plug-in Hybrid | 235/55R18 (load index 104+) |
| Sportage HEV | 235/55R18 |

Sportage (QL, 2016–2021): 215/65R16 base, 235/55R18 upper trims.

**PHEV note**: The Sportage plug-in hybrid carries a large battery — load index 104+ is required. We always verify this before fitting.

## Kia EV6 Tyre Sizes

The Kia EV6 (2021–present) is Kia's flagship electric crossover and one of the best-reviewed EVs in the UK:

| EV6 Variant | Tyre Size |
|---|---|
| EV6 Standard Range | 235/55R19 |
| EV6 Long Range AWD | 235/55R19 or 255/45R20 |
| EV6 GT-Line | 255/45R20 |
| EV6 GT | 265/40R21 (front) / 275/40R21 (rear) |

**EV6 GT staggered**: The EV6 GT uses different front and rear sizes. When ordering, specify whether you need front or rear.

**EV tyre fitting note**: The EV6 has no spare wheel. A flat requires immediate mobile fitting. We carry EV6 tyre sizes in stock — call ahead to confirm your exact specification.

## Kia Niro Tyre Sizes

The Kia Niro (SG2, 2022–present) — available as HEV, PHEV, and full EV:

| Niro Variant | Tyre Size |
|---|---|
| Niro HEV (2 / 3) | 205/60R16 |
| Niro HEV (4 / GT-Line) | 215/55R17 |
| Niro PHEV | 215/55R17 (load index 98+) |
| Niro EV | 215/55R17 or 215/45R18 |

Niro (DE, 2016–2022): 205/60R16 base, 215/55R17 upper.

## Kia Sorento Tyre Sizes

The Kia Sorento (MQ4, 2020–present) — 7-seat family SUV:

| Sorento Trim | Tyre Size |
|---|---|
| Sorento 2 / GT-Line | 235/65R17 |
| Sorento 3 / 4 | 255/45R20 |
| Sorento GT-Line S | 255/45R20 |
| Sorento Plug-in Hybrid | 255/45R20 (load index 105+) |

## Kia Ceed Tyre Sizes

The Kia Ceed (CD, 2018–present) — hatchback, Sportswagon, and ProCeed shooting brake:

| Ceed Trim | Tyre Size |
|---|---|
| Ceed 2 / 3 | 195/65R15 |
| Ceed GT-Line | 205/55R16 or 225/45R17 |
| Ceed GT | 225/40R18 |
| ProCeed GT-Line | 225/45R17 or 245/40R18 |

## Kia Rio Tyre Sizes

The Kia Rio (YB, 2017–present):

- 175/65R15 (1 / 2 trim)
- 195/55R16 (3 / GT-Line)

## Kia Picanto Tyre Sizes

The Kia Picanto (JA, 2017–present):

- 175/65R14 (X-Line: 175/60R15)
- 185/55R15 (GT-Line)

## Kia Stinger Tyre Sizes

The Kia Stinger (CK, discontinued 2023 but still on Scottish roads):

- 225/45R18 (2.0T RWD)
- 255/35R19 (3.3T V6)

The Stinger V6 uses summer performance tyres — Scottish climate advice: consider all-season tyres for year-round use.

## Kia TPMS Reset

All Kia models from 2016 onward have TPMS. After any tyre change:

- **Indirect TPMS (Rio, Picanto, Ceed, Niro HEV)**: Reset via the instrument cluster — Vehicle Info → Tyre → Reset
- **Direct TPMS (EV6, Sorento, Sportage PHEV)**: Requires a TPMS diagnostic tool to relearn each sensor

Tyre Rescue carries Kia-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Kia Tyre Fitting in Scotland

If you have a flat tyre on your Kia anywhere in Scotland:

1. **EV6, Niro EV**: No spare wheel — call us immediately
2. **Sportage, Sorento, Ceed**: May have a space-saver spare — check your boot
3. **Call 0141 266 0690** — give your registration number and we will identify your tyre specification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Kia?

- **Sportage specialists** — we carry the most popular Sportage sizes on every van
- **EV6 staggered fitments** — we understand front/rear split specs for the EV6 GT
- **PHEV load index compliance** — correct load index for Sportage PHEV and Niro PHEV
- **TPMS reset included** — dashboard warnings cleared before we leave
- **All of Scotland** — from Glasgow to the Highlands

Call **0141 266 0690** or [book online](/book) for mobile Kia tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Hyundai tyre fitting Scotland](/blog/hyundai-tyre-fitting-scotland) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland)`,
  },
  {
    slug: 'hyundai-tyre-fitting-scotland',
    title: 'Hyundai Tyre Fitting Scotland: Tucson, Ioniq 5, Ioniq 6, i30 & Kona',
    description:
      'Mobile Hyundai tyre fitting across Scotland. Correct tyre sizes for every Hyundai model — Tucson, Ioniq 5, Ioniq 6, i30, Kona, Santa Fe, i10, i20. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'hyundai tyre fitting scotland',
      'hyundai tucson tyres scotland',
      'hyundai ioniq 5 tyres scotland',
      'hyundai ioniq 6 tyres scotland',
      'hyundai i30 tyres scotland',
      'hyundai kona tyres scotland',
      'hyundai santa fe tyres scotland',
      'mobile hyundai tyre fitting glasgow',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'kia-tyre-fitting-scotland',
    ],
    content: `# Hyundai Tyre Fitting Scotland: Every Model Covered

Hyundai has transformed from a budget brand into one of Scotland's most popular car choices. The Hyundai Tucson, i30, and Ioniq 5 are now common on Scottish roads from Glasgow to the Highlands. Tyre Rescue provides mobile Hyundai tyre fitting across all of Scotland — the right tyre specification for every model.

## Hyundai Tucson Tyre Sizes

The Hyundai Tucson (NX4, 2021–present) — Hyundai's bestselling model in Scotland:

| Tucson Trim | Tyre Size |
|---|---|
| Tucson SE Connect | 225/60R17 |
| Tucson Premium | 235/55R18 |
| Tucson Ultimate | 235/45R19 |
| Tucson PHEV | 235/55R18 or 235/45R19 (load index 104+) |
| Tucson HEV | 235/55R18 |

Tucson (TL, 2015–2021): 215/65R16 base, 235/55R18 upper trims.

**PHEV note**: The Tucson PHEV is significantly heavier than the HEV — load index 104+ is required. We verify this before every fitting.

## Hyundai Ioniq 5 Tyre Sizes

The Hyundai Ioniq 5 (NE1, 2021–present) — one of the most popular EVs in Scotland:

| Ioniq 5 Variant | Tyre Size |
|---|---|
| Ioniq 5 Standard Range | 235/55R19 |
| Ioniq 5 Long Range RWD | 235/55R19 |
| Ioniq 5 Long Range AWD | 255/45R20 |
| Ioniq 5 N | 275/35R21 |

**Ioniq 5 N note**: The Ioniq 5 N uses a high-performance summer tyre (Pirelli P Zero PZ4 or similar). For year-round Scottish use, consider all-season tyres — but consult us first for load index and speed rating compatibility.

**EV tyre note**: The Ioniq 5 has no spare wheel. A flat requires immediate mobile fitting. We carry Ioniq 5 sizes in stock.

## Hyundai Ioniq 6 Tyre Sizes

The Hyundai Ioniq 6 (CE1, 2023–present) — electric saloon:

| Ioniq 6 Variant | Tyre Size |
|---|---|
| Ioniq 6 Standard Range | 245/45R18 |
| Ioniq 6 Long Range RWD | 245/45R18 or 245/40R19 |
| Ioniq 6 Long Range AWD | 245/40R19 |
| Ioniq 6 SE Connect | 245/45R18 |

**Ioniq 6 note**: The Ioniq 6 uses a distinctive wide-but-short-profile tyre. The unusual combination of high load index and low profile means not all retailers carry these in stock — call ahead on 0141 266 0690 to confirm stock.

## Hyundai i30 Tyre Sizes

The Hyundai i30 (PD facelift, 2020–present):

| i30 Trim | Tyre Size |
|---|---|
| i30 SE Connect | 195/65R15 |
| i30 Premium | 205/55R16 |
| i30 N Line | 225/45R17 |
| i30 N (Performance) | 235/40R18 or 245/35R19 |
| i30 Fastback | 205/55R16 or 225/40R18 |

**i30 N note**: The Hyundai i30 N uses summer performance tyres. Scottish climate advice: all-season tyres for year-round driving are worth considering — we can advise on compatible specs.

## Hyundai Kona Tyre Sizes

The Hyundai Kona (SX2, 2023–present):

| Kona Trim | Tyre Size |
|---|---|
| Kona SE Connect | 205/65R16 |
| Kona Premium / Ultimate | 225/45R18 |
| Kona Electric | 215/55R17 or 225/45R18 (load index 95+) |

Kona (OS, 2017–2023): 205/60R16 base, 215/55R17 upper, 215/50R18 on Electric.

## Hyundai Santa Fe Tyre Sizes

The Hyundai Santa Fe (MX5, 2024–present) — 7-seat family SUV:

| Santa Fe Trim | Tyre Size |
|---|---|
| Santa Fe Premium | 235/60R18 |
| Santa Fe Ultimate | 255/45R20 |
| Santa Fe PHEV | 255/45R20 (load index 105+) |

Santa Fe (TM, 2018–2023): 225/65R17 base, 235/60R18 upper, 235/55R19 top.

## Hyundai i10 Tyre Sizes

The Hyundai i10 (AC3, 2019–present):

- 175/65R14 (SE Connect / Premium)
- 195/45R16 (N Line)

## Hyundai i20 Tyre Sizes

The Hyundai i20 (BC3, 2020–present):

- 185/65R15 (SE Connect)
- 205/45R17 (N Line)
- 215/40R18 (i20 N)

## Hyundai TPMS Reset

All Hyundai models from 2016 onward have TPMS. After any tyre change:

- **Indirect TPMS (i10, i20, i30, Kona, Tucson HEV)**: Reset via the cluster menu or reset button — usually located in the glovebox or under the dashboard
- **Direct TPMS (Ioniq 5, Ioniq 6, Tucson PHEV, Santa Fe PHEV)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Hyundai-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Hyundai Tyre Fitting in Scotland

If you have a flat tyre on your Hyundai anywhere in Scotland:

1. **Ioniq 5, Ioniq 6**: No spare wheel — call us immediately
2. **Tucson, Santa Fe, Kona**: Check your boot for a space-saver spare
3. **i30, i10, i20**: Likely has a space-saver spare — check before calling
4. **Call 0141 266 0690** — give your registration for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

## Why Use Tyre Rescue for Your Hyundai?

- **Ioniq 5 and Ioniq 6 specialists** — we carry and fit Hyundai EV tyre specifications
- **PHEV load index compliance** — correct load index for Tucson, Santa Fe, and Kona PHEV
- **TPMS reset included** — dashboard warnings cleared before we leave
- **All of Scotland** — 34 cities and service areas covered
- **No surprises** — full itemised quote before we start

Call **0141 266 0690** or [book online](/book) for mobile Hyundai tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Kia tyre fitting Scotland](/blog/kia-tyre-fitting-scotland) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland)`,
  },
  {
    slug: 'peugeot-tyre-fitting-scotland',
    title: 'Peugeot Tyre Fitting Scotland: 208, 2008, 3008, 308 & e-208',
    description:
      'Mobile Peugeot tyre fitting across Scotland. Correct tyre sizes for every Peugeot model — 208, e-208, 2008, e-2008, 3008, 308, 508, Rifter, Partner. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'peugeot tyre fitting scotland',
      'peugeot 208 tyres scotland',
      'peugeot 3008 tyres scotland',
      'peugeot 2008 tyres scotland',
      'peugeot 308 tyres scotland',
      'peugeot e-208 tyres scotland',
      'mobile peugeot tyre fitting glasgow',
      'peugeot 508 tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'vauxhall-tyre-fitting-scotland',
    ],
    content: `# Peugeot Tyre Fitting Scotland: Every Model Covered

Peugeot is one of the most popular car brands in Scotland. The Peugeot 208, 2008, and 3008 are found in every city, and the Peugeot Partner and Rifter are common working vans across Scottish trades. Tyre Rescue provides specialist mobile Peugeot tyre fitting across all of Scotland.

## Peugeot 208 Tyre Sizes

The Peugeot 208 (P21, 2019–present) and e-208 electric:

| 208 Trim | Tyre Size |
|---|---|
| 208 Active Premium | 185/65R15 |
| 208 Allure | 205/55R16 |
| 208 GT | 205/45R17 or 215/40R18 |
| e-208 (Electric) | 205/55R16 or 215/45R17 (load index 91+) |

Older 208 (A9, 2012–2019): 185/65R15 base, 205/50R17 on GTi.

**e-208 note**: The electric 208 has no spare wheel. A flat requires immediate mobile fitting.

## Peugeot 2008 Tyre Sizes

The Peugeot 2008 (P24, 2019–present) and e-2008 electric:

| 2008 Trim | Tyre Size |
|---|---|
| 2008 Active Premium | 205/60R16 |
| 2008 Allure | 215/55R17 |
| 2008 GT | 215/50R18 or 225/45R18 |
| e-2008 (Electric) | 215/55R17 or 215/50R18 (load index 95+) |

## Peugeot 3008 Tyre Sizes

The Peugeot 3008 (P84, 2016–2024) — Peugeot's bestselling SUV in Scotland:

| 3008 Trim | Tyre Size |
|---|---|
| 3008 Active Premium | 215/65R16 |
| 3008 Allure | 225/55R17 |
| 3008 GT / GT Premium | 235/50R18 or 235/45R19 |
| 3008 Hybrid / Hybrid4 | 235/50R18 (load index 99+) |

The new 3008 (E3008, 2024–present, electric):
- 235/50R19 (standard)
- 255/45R20 (long range / AWD)

## Peugeot 308 Tyre Sizes

The Peugeot 308 (P51, 2021–present) — hatchback and SW estate:

| 308 Trim | Tyre Size |
|---|---|
| 308 Active Premium | 205/55R16 |
| 308 Allure | 225/45R17 |
| 308 GT | 235/40R18 |
| 308 GT e-PHEV | 235/40R18 (load index 95+) |

Older 308 (T9, 2013–2021): 205/55R16 base, 225/45R17 GT, 245/35R19 GTi.

## Peugeot 508 Tyre Sizes

The Peugeot 508 (R8, 2018–present) — fastback and SW:

- 225/50R17 (Allure)
- 235/40R19 (GT)
- 245/35R20 (508 SW GT Premium)

The 508 Hybrid: 235/40R19 (load index 96+).

## Peugeot Rifter & Partner Van Tyre Sizes

| Model | Tyre Size |
|---|---|
| Rifter (passenger) | 205/65R15 or 215/60R16 |
| Partner Van (cargo) | 195/65R15C or 205/60R16C |
| Partner Electric | 215/60R16C (load index 99+) |

**Van fitting note**: Peugeot Partner cargo vans require C-rated commercial tyres. We carry correct C-rated commercial stock.

## Peugeot TPMS Reset

All Peugeot models from 2017 onward have TPMS. After any tyre change:

- **Indirect TPMS (208, 2008, older 3008/308)**: Reset via the touchscreen — Settings → Vehicle → Tyre Pressure → Reinitialise
- **Direct TPMS (E3008, 508, newer models)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Peugeot-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Peugeot Tyre Fitting in Scotland

1. **e-208, e-2008, E3008**: No spare wheel — call us immediately
2. **208, 2008, 3008, 308**: May have a space-saver spare or tyre inflation kit — check your boot
3. **Call 0141 266 0690** — we identify your tyre specification from your registration number

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Peugeot tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Vauxhall tyre fitting Scotland](/blog/vauxhall-tyre-fitting-scotland) | [Ford tyre fitting Scotland](/blog/ford-tyre-fitting-scotland)`,
  },
  {
    slug: 'renault-dacia-tyre-fitting-scotland',
    title: 'Renault & Dacia Tyre Fitting Scotland: Clio, Captur, Duster & Sandero',
    description:
      'Mobile Renault and Dacia tyre fitting across Scotland. Correct tyre sizes for Renault Clio, Captur, Megane E-TECH, Zoe, Kadjar, and Dacia Duster, Sandero, Jogger. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'renault tyre fitting scotland',
      'dacia duster tyres scotland',
      'renault clio tyres scotland',
      'renault captur tyres scotland',
      'renault megane tyres scotland',
      'dacia sandero tyres scotland',
      'mobile renault tyre fitting glasgow',
      'renault zoe tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'peugeot-tyre-fitting-scotland',
    ],
    content: `# Renault & Dacia Tyre Fitting Scotland: Every Model Covered

Renault and its budget subsidiary Dacia are both popular in Scotland. The Renault Clio and Captur are city favourites, while the Dacia Duster has become the go-to choice for rural Scotland — affordable, practical, and capable on rough Highland terrain. Tyre Rescue provides mobile tyre fitting for all Renault and Dacia models across Scotland.

## Renault Clio Tyre Sizes

The Renault Clio V (BH, 2019–present) — with E-TECH full hybrid option:

| Clio Trim | Tyre Size |
|---|---|
| Clio Evolution | 185/65R15 |
| Clio Techno | 195/60R16 |
| Clio RS Line | 195/55R16 or 205/45R17 |
| Clio E-TECH Hybrid | 185/65R15 or 195/60R16 (load index 88+) |

Older Clio IV (2012–2019): 185/65R15 base, 205/45R17 on RS Line.

## Renault Captur Tyre Sizes

The Renault Captur II (HJB, 2019–present):

| Captur Trim | Tyre Size |
|---|---|
| Captur Evolution / Techno | 205/60R16 |
| Captur RS Line | 215/55R17 or 225/45R18 |
| Captur E-TECH PHEV | 215/55R17 (load index 94+) |
| Captur E-TECH Hybrid | 215/55R17 |

**PHEV note**: The Captur E-TECH plug-in hybrid carries a heavier battery — we verify load index before fitting.

## Renault Megane E-TECH Electric

The Renault Megane E-TECH Electric (2022–present):

| Megane E-TECH Trim | Tyre Size |
|---|---|
| Megane E-TECH Techno | 215/50R18 |
| Megane E-TECH RS Line | 235/45R19 |
| Megane E-TECH EV60 | 235/45R19 (load index 95+) |

**Megane EV note**: No spare wheel. A flat requires immediate mobile fitting.

## Renault Zoe Tyre Sizes

The Renault Zoe (ZE50, 2019–present) — one of Europe's bestselling EVs:

- 205/55R16 (standard)
- 185/60R15 (some variants)

The Zoe has no spare wheel. Call us immediately for mobile fitting.

## Renault Kadjar Tyre Sizes

The Renault Kadjar (HFE, discontinued 2022 but still common on Scottish roads):

- 215/65R16 base
- 225/55R17 mid
- 235/50R18 top trim

## Renault Arkana Tyre Sizes

The Renault Arkana (2021–present) — coupe SUV:

- 215/55R17 (base)
- 225/45R18 (RS Line)

## Dacia Duster Tyre Sizes

The Dacia Duster (D4F, 2024–present) and Duster (HM, 2017–2024) — hugely popular in rural Scotland for its low cost and 4x4 capability:

| Duster Version | Tyre Size |
|---|---|
| Duster Essential / Expression (2WD) | 215/65R16 |
| Duster Extreme (4x4) | 215/65R16 |
| Duster Journey (2024+) | 215/60R17 |
| New Duster TCe (2024+) | 215/60R17 |

**Duster 4x4 note**: The Duster 4x4 uses the same tyre size as the 2WD version — 215/65R16. However, the 4x4 drivetrain means even tyre wear is more critical. Always replace in pairs on the same axle.

## Dacia Sandero & Stepway Tyre Sizes

The Dacia Sandero III (BMA, 2020–present):

- 185/65R15 (Sandero Essential)
- 195/60R16 (Sandero Stepway, Sandero Extreme)
- 215/55R17 (Stepway Extreme — winter/all-terrain optional)

## Dacia Jogger Tyre Sizes

The Dacia Jogger (2021–present) — 7-seat estate, also available as Hybrid:

- 205/60R16 (standard)
- 215/55R17 (Extreme / Hybrid)

## Dacia Spring Electric Tyre Sizes

The Dacia Spring (2021–present) — Europe's most affordable EV:

- 165/70R14 (standard)

**Spring note**: The Spring uses a very small tyre size unusual in modern EVs. We carry this in stock — call ahead to confirm availability.

## TPMS Reset for Renault & Dacia

**Renault**: All models from 2018 onward have TPMS. Reset via EASY LINK touchscreen → Settings → Vehicle → Tyre Pressure → Initialise.

**Dacia**: Duster and Sandero use indirect TPMS — reset button usually located in the glovebox. Dacia Spring EV has direct TPMS requiring a diagnostic tool.

Tyre Rescue carries compatible TPMS reset tools for all Renault and Dacia models. Reset is included with every fitting.

## Emergency Renault/Dacia Tyre Fitting in Scotland

1. **Zoe, Megane E-TECH**: No spare wheel — call us immediately
2. **Duster 4x4**: Check beneath the vehicle for the spare (mounted underneath on some models)
3. **Clio, Captur, Sandero**: Likely has a tyre inflation kit only — call us for a proper fitting
4. **Call 0141 266 0690** — give your registration number for instant identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Renault or Dacia tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Peugeot tyre fitting Scotland](/blog/peugeot-tyre-fitting-scotland) | [Vauxhall tyre fitting Scotland](/blog/vauxhall-tyre-fitting-scotland)`,
  },
  {
    slug: 'volvo-tyre-fitting-scotland',
    title: 'Volvo Tyre Fitting Scotland: XC40, XC60, XC90, C40 Recharge & EX30',
    description:
      'Mobile Volvo tyre fitting across Scotland. Correct tyre sizes for every Volvo model — XC40, XC60, XC90, V60, V90, C40 Recharge, EX30, EX40. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'volvo tyre fitting scotland',
      'volvo xc40 tyres scotland',
      'volvo xc60 tyres scotland',
      'volvo xc90 tyres scotland',
      'volvo c40 tyres scotland',
      'volvo ex30 tyres scotland',
      'mobile volvo tyre fitting glasgow',
      'volvo v60 tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'audi-tyre-fitting-scotland',
    ],
    content: `# Volvo Tyre Fitting Scotland: Every Model Covered

Volvo is one of the most popular premium car brands in Scotland, valued for safety, quality, and practicality in Scottish conditions. The XC40, XC60, and XC90 are common in Scottish cities and on Highland roads alike. Tyre Rescue provides specialist mobile Volvo tyre fitting across all of Scotland.

## Volvo XC40 Tyre Sizes

The Volvo XC40 (2018–present) — Volvo's bestselling model:

| XC40 Trim | Tyre Size |
|---|---|
| XC40 Core / Plus | 235/50R18 |
| XC40 Ultimate | 235/45R19 or 245/40R20 |
| XC40 R-Design | 235/40R20 |
| XC40 Recharge (EV) | 235/50R18 (load index 101+) or 235/45R19 |

The **XC40 Recharge** (electric) has no spare wheel. A flat tyre requires immediate mobile fitting.

## Volvo C40 Recharge Tyre Sizes

The Volvo C40 Recharge (2021–present) — electric coupe SUV:

- 235/50R19 (standard)
- 255/40R20 (longer range / performance)

Load index 99+ required on all C40 Recharge variants.

## Volvo EX30 Tyre Sizes

The Volvo EX30 (2023–present) — compact electric SUV:

- 215/55R18 (Twin Motor — standard)
- 235/45R19 (Twin Motor Performance)

The EX30 is Volvo's smallest and lightest EV — tyre load index requirements are lower than XC40/C40 Recharge.

## Volvo EX40 & EC40 Tyre Sizes

The Volvo EX40 (rebadged XC40 Recharge, 2023–present):
- Identical tyre sizes to XC40 Recharge: 235/50R18 or 235/45R19

## Volvo XC60 Tyre Sizes

The Volvo XC60 (2017–present) — Volvo's bestselling SUV globally:

| XC60 Trim | Tyre Size |
|---|---|
| XC60 Core / Plus | 235/60R18 |
| XC60 Plus Dark / Ultimate | 245/50R19 or 255/40R20 |
| XC60 R-Design | 255/40R20 |
| XC60 T8 PHEV | 235/60R18 or 245/50R19 (load index 102+) |

**PHEV note**: The XC60 T8 plug-in hybrid requires a minimum load index of 102 on most trims. We always verify this before fitting.

## Volvo XC90 Tyre Sizes

The Volvo XC90 (2015–present) — 7-seat flagship SUV:

| XC90 Trim | Tyre Size |
|---|---|
| XC90 Core | 235/60R19 |
| XC90 Plus / Ultimate | 265/45R20 or 275/35R21 |
| XC90 R-Design | 275/35R21 |
| XC90 T8 PHEV | 265/45R20 (load index 108+) |

The XC90 is one of the heaviest non-commercial vehicles on the road. Correct load index is critical — especially on PHEV variants.

## Volvo V60 & V90 Estate Tyre Sizes

**V60 (Z59, 2018–present)**:
- 235/50R18 (R-Design base)
- 235/45R19 (R-Design Plus)
- 235/40R20 (Polestar Engineered)

**V90 (2016–present)**:
- 245/45R19 (Cross Country)
- 255/40R20 (R-Design)

## Volvo TPMS Reset

All Volvo models have direct or indirect TPMS. After any tyre change:

- **Older XC40, XC60, XC90**: Reset via the car menu on the center screen — Settings → My Car → Tyres → Calibrate
- **New EX30, EX40, C40**: Digital TPMS via Volvo app — requires TPMS diagnostic tool for full reset

Tyre Rescue carries Volvo-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Volvo Tyre Fitting in Scotland

1. **XC40 Recharge, C40, EX30, EX40**: No spare wheel — call us immediately
2. **XC60, XC90, V60, V90**: May have a space-saver spare or puncture kit — check your boot
3. **Call 0141 266 0690** — give your registration number for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Volvo tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland) | [Audi tyre fitting Scotland](/blog/audi-tyre-fitting-scotland)`,
  },
  {
    slug: 'skoda-tyre-fitting-scotland',
    title: 'Skoda Tyre Fitting Scotland: Octavia, Fabia, Karoq, Kodiaq & Enyaq',
    description:
      'Mobile Skoda tyre fitting across Scotland. Correct tyre sizes for every Skoda model — Octavia, Fabia, Karoq, Kodiaq, Scala, Enyaq iV. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'skoda tyre fitting scotland',
      'skoda octavia tyres scotland',
      'skoda karoq tyres scotland',
      'skoda kodiaq tyres scotland',
      'skoda enyaq tyres scotland',
      'skoda fabia tyres scotland',
      'mobile skoda tyre fitting glasgow',
      'skoda octavia vrs tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'volkswagen-tyre-fitting-scotland',
    ],
    content: `# Skoda Tyre Fitting Scotland: Every Model Covered

Skoda is one of the most popular car brands in Scotland. Part of the Volkswagen Group, Skoda offers the quality of a VW platform at a more affordable price — which is why the Skoda Octavia is one of the most common cars on Scottish roads. Tyre Rescue provides specialist mobile Skoda tyre fitting across all of Scotland.

## Skoda Octavia Tyre Sizes

The Skoda Octavia (NX, 2020–present) — the UK's most practical family car:

| Octavia Trim | Tyre Size |
|---|---|
| Octavia SE | 205/55R16 |
| Octavia SE Technology | 215/50R17 |
| Octavia SE L | 225/45R17 |
| Octavia vRS | 225/40R18 or 245/40R18 |
| Octavia vRS iV (PHEV) | 225/40R18 (load index 92+) |
| Octavia Scout | 215/60R17 |

Skoda Octavia (5E, 2013–2020): 195/65R15 base, 205/55R16 mid, 225/45R17 vRS.

**vRS iV note**: The PHEV Octavia requires load index 92+ — heavier than the standard Octavia.

## Skoda Fabia Tyre Sizes

The Skoda Fabia (PJ, 2021–present):

| Fabia Trim | Tyre Size |
|---|---|
| Fabia Colour Edition | 185/65R15 |
| Fabia SE | 195/65R15 |
| Fabia Monte Carlo | 205/45R17 |
| Fabia Sportline | 215/40R18 |

Older Fabia (NJ, 2014–2021): 185/65R15 base, 205/45R17 Monte Carlo.

## Skoda Karoq Tyre Sizes

The Skoda Karoq (NU7, 2017–present):

| Karoq Trim | Tyre Size |
|---|---|
| Karoq SE | 215/65R17 |
| Karoq SE L | 235/50R18 |
| Karoq Sportline | 235/45R19 |
| Karoq Scout | 225/55R17 |

## Skoda Kodiaq Tyre Sizes

The Skoda Kodiaq (NS7, 2024–present) and older Kodiaq (NS, 2016–2023):

| Kodiaq Trim | Tyre Size |
|---|---|
| Kodiaq SE (2024+) | 225/60R18 |
| Kodiaq SE L | 235/50R19 |
| Kodiaq Sportline | 255/40R20 or 255/45R20 |
| Kodiaq vRS | 255/45R20 |
| Older Kodiaq SE | 215/65R17 |
| Older Kodiaq vRS | 235/45R20 |

## Skoda Scala Tyre Sizes

The Skoda Scala (NW, 2019–present):

- 205/55R16 (SE)
- 225/45R17 (Monte Carlo)

## Skoda Enyaq iV Tyre Sizes

The Skoda Enyaq iV (AC8, 2021–present) — Skoda's first purpose-built EV:

| Enyaq Variant | Tyre Size |
|---|---|
| Enyaq 60 | 235/55R19 |
| Enyaq 80 / 85 | 255/45R20 |
| Enyaq 85x (AWD) | 255/45R20 (load index 105+) |
| Enyaq vRS | 235/45R21 |
| Enyaq Coupé RS | 235/45R21 |

**Enyaq note**: The Enyaq iV has no spare wheel. A flat requires immediate mobile fitting. We carry Enyaq tyre specifications in stock — call ahead to confirm.

## Skoda Superb Tyre Sizes

The Skoda Superb (B8/2B, 2015–present):

- 215/55R16 (SE)
- 235/45R17 (SE L)
- 245/40R18 (Laurin & Klement, Sportline)

## Skoda TPMS Reset

All Skoda models share TPMS technology with the Volkswagen Group:

- **Indirect TPMS (Fabia, Scala, older Karoq)**: Reset via the driver information display — press and hold the TPMS reset button
- **Direct TPMS (Octavia vRS, Kodiaq, Enyaq, Superb)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Skoda-compatible (VW Group) TPMS reset tools. Reset is included at no additional charge.

## Emergency Skoda Tyre Fitting in Scotland

1. **Enyaq iV, Enyaq Coupé**: No spare wheel — call us immediately
2. **Octavia, Karoq, Kodiaq**: May have a space-saver spare — check your boot
3. **Call 0141 266 0690** — give your registration number for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Skoda tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Volkswagen tyre fitting Scotland](/blog/volkswagen-tyre-fitting-scotland) | [Audi tyre fitting Scotland](/blog/audi-tyre-fitting-scotland)`,
  },
  {
    slug: 'mini-tyre-fitting-scotland',
    title: 'MINI Tyre Fitting Scotland: MINI Hatchback, Countryman, Convertible & Electric',
    description:
      'Mobile MINI tyre fitting across Scotland. Correct tyre sizes for every MINI model — MINI Hatchback, Countryman, Convertible, Clubman, Electric. JCW performance tyres. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mini tyre fitting scotland',
      'mini countryman tyres scotland',
      'mini hatchback tyres scotland',
      'mini electric tyres scotland',
      'mini jcw tyres scotland',
      'mini convertible tyres scotland',
      'mobile mini tyre fitting glasgow',
      'mini cooper tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'bmw-tyre-fitting-scotland',
    ],
    content: `# MINI Tyre Fitting Scotland: Every Model Covered

MINI is a popular premium small car in Scotland, particularly in Glasgow and Edinburgh. MINIs use a variety of tyre sizes across the range, with JCW performance models requiring specific performance tyre specifications. Tyre Rescue provides mobile MINI tyre fitting across all of Scotland — MINI Cooper, JCW, Countryman, Convertible, Clubman, and Electric.

## MINI Hatchback (3-Door & 5-Door) Tyre Sizes

The MINI Hatchback F56 (2014–2023) and J01 (2024–present):

| MINI Trim | Tyre Size |
|---|---|
| MINI One / Cooper (base) | 175/65R15 or 195/55R16 |
| MINI Cooper S | 205/45R17 or 225/40R18 |
| MINI Cooper SE (Electric, F56) | 175/65R15 or 195/55R16 |
| MINI John Cooper Works (JCW) | 205/40R18 or 205/35R18 |

New MINI Hatchback J01 (2024+):
- 195/55R16 (Cooper)
- 215/40R18 (John Cooper Works)
- 195/60R17 (Electric)

**JCW note**: John Cooper Works uses performance summer tyres. For year-round use in Scotland, consider all-season alternatives — call us to discuss compatible specs.

## MINI Countryman Tyre Sizes

The MINI Countryman F60 (2017–2023):

| Countryman Trim | Tyre Size |
|---|---|
| Countryman Cooper | 205/60R16 |
| Countryman Cooper S | 225/50R17 |
| Countryman Cooper SE All4 (PHEV) | 205/55R17 (load index 95+) |
| Countryman JCW All4 | 225/40R18 |

New MINI Countryman U25 (2024–present):
- 225/55R17 (Cooper)
- 235/50R18 (Cooper S, JCW)
- 235/45R19 (JCW)
- 235/50R18 (Electric — load index 101+)

**Countryman PHEV/Electric note**: The Countryman Electric is heavier than the petrol — correct load index is required. No spare wheel on Electric variant.

## MINI Convertible Tyre Sizes

The MINI Convertible F57 (2016–present):

- 195/55R16 (Cooper base)
- 205/45R17 (Cooper S)
- 225/35R18 (JCW)

## MINI Clubman Tyre Sizes

The MINI Clubman F54 (2015–2024):

- 205/55R16 (Cooper)
- 225/45R17 (Cooper S)
- 225/35R19 (JCW All4)

## MINI Electric (Cooper SE) Tyre Sizes

**F56 Cooper SE Electric (2020–2023)**:
- 175/65R15 or 195/55R16
- Load index 87+ required

**J01 Electric (2024–present)**:
- 195/60R17

The MINI Electric has no spare wheel. A flat requires immediate mobile fitting.

## MINI TPMS Reset

All MINI models share BMW Group TPMS technology. After any tyre change:

- **Older MINI (2014–2022)**: Reset via the on-board computer — Settings → Tyre Pressure → Reset
- **New MINI (2023+, J01)**: Direct TPMS requires a compatible diagnostic tool

Tyre Rescue carries MINI/BMW-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency MINI Tyre Fitting in Scotland

1. **MINI Electric, Countryman Electric**: No spare wheel — call us immediately
2. **MINI Hatchback, Convertible, Clubman**: Most have a space-saver spare or inflation kit — check your boot
3. **JCW models**: Performance tyres are not run-flat — stop safely and call us
4. **Call 0141 266 0690** — give your registration for instant identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile MINI tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland)`,
  },
  {
    slug: 'honda-tyre-fitting-scotland',
    title: 'Honda Tyre Fitting Scotland: Civic, CR-V, Jazz, HR-V & ZR-V',
    description:
      'Mobile Honda tyre fitting across Scotland. Correct tyre sizes for every Honda model — Civic, CR-V e:HEV, Jazz, HR-V, ZR-V, Honda e. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'honda tyre fitting scotland',
      'honda civic tyres scotland',
      'honda cr-v tyres scotland',
      'honda jazz tyres scotland',
      'honda hr-v tyres scotland',
      'honda zr-v tyres scotland',
      'mobile honda tyre fitting glasgow',
      'honda e tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Honda Tyre Fitting Scotland: Every Model Covered

Honda cars are popular in Scotland for their reliability, practicality, and strong resale values. The Honda Jazz and CR-V are particularly common on Scottish roads, and the Honda Civic Type R has a dedicated following in Scottish cities. Tyre Rescue provides mobile Honda tyre fitting across all of Scotland.

## Honda Civic Tyre Sizes

The Honda Civic Mk11 (FL, 2022–present) — hatchback and estate:

| Civic Trim | Tyre Size |
|---|---|
| Civic i-VTEC (petrol) | 215/50R17 |
| Civic i-MMD Hybrid | 215/50R17 |
| Civic Advance / Sport | 235/40R18 |
| Civic Type R FL5 | 265/35R19 (front) / 265/35R19 (rear) — square fitment |

Civic Mk10 (FC/FK, 2017–2022): 215/50R17 standard, 235/40R18 Sport Line, 235/35R19 Type R.

**Type R note**: The Civic Type R uses a square fitment (same size front and rear) — tyres can be rotated. Call us to confirm stock for this performance specification.

## Honda CR-V Tyre Sizes

The Honda CR-V (RS, 2023–present) — available as e:HEV full hybrid:

| CR-V Trim | Tyre Size |
|---|---|
| CR-V e:HEV Standard | 235/60R18 |
| CR-V e:HEV Advance | 235/55R18 or 235/50R19 |
| CR-V e:HEV AWD | 235/60R18 (load index 107+) |

Older CR-V (RW2, 2018–2023): 225/60R18 (standard), 235/55R18 (EX / Black Edition).

**CR-V e:HEV AWD note**: The all-wheel-drive full hybrid CR-V requires a load index of 107+ to handle its weight. We always verify this before fitting.

## Honda Jazz Tyre Sizes

The Honda Jazz (GR, 2020–present) — always hybrid in UK:

| Jazz Trim | Tyre Size |
|---|---|
| Jazz i-MMD Standard | 185/60R15 |
| Jazz i-MMD Advance | 185/60R15 or 195/55R16 |
| Jazz Crosstar | 195/60R16 |

Jazz is one of the most popular cars among older Scottish drivers for its practicality and high seating position.

## Honda HR-V Tyre Sizes

The Honda HR-V (RS, 2022–present) — e:HEV hybrid:

- 215/60R16 (standard)
- 215/55R17 (Advance)

Older HR-V (RU, 2015–2021): 215/60R16 base, 215/55R17 EX/EX Navi.

## Honda ZR-V Tyre Sizes

The Honda ZR-V (2023–present) — coupe SUV, e:HEV:

- 225/55R17 (standard)
- 235/50R18 (Advance)

## Honda e Electric Tyre Sizes

The Honda e (ZC7, 2020–2024, discontinued):

- 195/65R15 (standard)
- 205/50R17 (Advance)

The Honda e has no conventional spare wheel. If you own a Honda e in Scotland and have a flat tyre, call us immediately.

## Honda TPMS Reset

All Honda models from 2017 onward have TPMS. After any tyre change:

- **Indirect TPMS (Jazz, HR-V, Civic base)**: Reset via the info button — Home → Settings → TYRE MONITOR → CALIBRATE
- **Direct TPMS (CR-V AWD, Civic Type R, ZR-V)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Honda-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Honda Tyre Fitting in Scotland

1. **Honda e**: No spare — call us immediately
2. **Jazz, HR-V, Civic**: Check for a space-saver spare or inflation kit in the boot
3. **CR-V**: Likely has a space-saver spare in the boot beneath the floor
4. **Call 0141 266 0690** — give your registration for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Honda tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Toyota tyre fitting Scotland](/blog/toyota-tyre-fitting-scotland) | [Nissan tyre fitting Scotland](/blog/nissan-tyre-fitting-scotland)`,
  },
  {
    slug: 'seat-cupra-tyre-fitting-scotland',
    title: 'SEAT & CUPRA Tyre Fitting Scotland: Ibiza, Leon, Ateca, Formentor & Born',
    description:
      'Mobile SEAT and CUPRA tyre fitting across Scotland. Correct tyre sizes for every model — SEAT Ibiza, Leon, Arona, Ateca, Tarraco; CUPRA Leon, Formentor, Born EV. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'seat tyre fitting scotland',
      'cupra tyres scotland',
      'seat ibiza tyres scotland',
      'seat leon tyres scotland',
      'cupra formentor tyres scotland',
      'cupra born tyres scotland',
      'mobile seat tyre fitting glasgow',
      'seat ateca tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'volkswagen-tyre-fitting-scotland',
    ],
    content: `# SEAT & CUPRA Tyre Fitting Scotland: Every Model Covered

SEAT and its performance sub-brand CUPRA are popular across Scotland, particularly among younger drivers. Both brands are part of the Volkswagen Group and share platforms with the VW Polo, Golf, and Tiguan — which means similar tyre specifications and TPMS reset procedures. Tyre Rescue provides mobile SEAT and CUPRA tyre fitting across all of Scotland.

## SEAT Ibiza Tyre Sizes

The SEAT Ibiza (KJ1, 2017–present):

| Ibiza Trim | Tyre Size |
|---|---|
| Ibiza Reference / Style | 185/65R15 |
| Ibiza FR | 205/45R17 |
| Ibiza FR Sport | 215/40R18 |

## SEAT Leon Tyre Sizes

The SEAT Leon (KL1, 2020–present) — hatchback, estate (Sportstourer), and estate:

| Leon Trim | Tyre Size |
|---|---|
| Leon Reference / Style | 215/55R16 or 205/55R16 |
| Leon FR | 225/45R17 |
| Leon e-HYBRID PHEV | 225/45R17 (load index 91+) |
| SEAT Leon Sportstourer | 215/55R16 or 225/45R17 |

Older Leon (5F, 2012–2020): 195/65R15 base, 205/55R16 mid, 235/35R19 Cupra.

**PHEV note**: The Leon e-HYBRID is heavier than the petrol Leon — load index 91+ required.

## SEAT Arona Tyre Sizes

The SEAT Arona (J1, 2021–present):

- 195/65R15 (Reference)
- 215/55R17 (FR, Xperience)

## SEAT Ateca Tyre Sizes

The SEAT Ateca (KHP, 2016–present):

| Ateca Trim | Tyre Size |
|---|---|
| Ateca Reference / Style | 215/65R17 |
| Ateca FR | 235/50R18 |
| Ateca Xperience | 235/50R18 or 245/45R19 |

## SEAT Tarraco Tyre Sizes

The SEAT Tarraco (KN2, 2018–present):

- 215/60R18 (Style)
- 235/50R19 (Xcellence / FR)
- 235/50R19 (Tarraco 4Drive, load index 103+)

**Tarraco 4Drive note**: The all-wheel-drive Tarraco is heavier and requires minimum load index 103.

## CUPRA Leon Tyre Sizes

The CUPRA Leon (KL8, 2020–present):

| CUPRA Leon Variant | Tyre Size |
|---|---|
| CUPRA Leon 2.0 TSI | 245/35R19 |
| CUPRA Leon VZ | 245/35R19 |
| CUPRA Leon e-HYBRID | 235/35R19 (load index 91+) |

## CUPRA Formentor Tyre Sizes

The CUPRA Formentor (KM7, 2021–present) — CUPRA's bestselling model:

| Formentor Trim | Tyre Size |
|---|---|
| Formentor 1.5 TSI | 215/55R17 or 235/45R18 |
| Formentor 2.0 TSI | 235/40R19 |
| Formentor VZ 4Drive | 255/40R19 or 255/35R20 |
| Formentor e-HYBRID | 235/40R19 (load index 96+) |

**VZ 4Drive note**: The high-performance Formentor VZ uses wide 255mm tyres — call ahead to confirm stock for your specific size.

## CUPRA Born Electric Tyre Sizes

The CUPRA Born (K11, 2022–present) — electric performance hatchback:

| Born Variant | Tyre Size |
|---|---|
| Born 58kWh | 235/45R19 |
| Born 77kWh (e-Boost) | 235/45R20 |
| Born VZ | 235/40R20 |

**Born note**: No spare wheel. A flat requires immediate mobile fitting. The Born is based on the VW ID.3 platform — we carry Born tyre specifications in stock.

## SEAT & CUPRA TPMS Reset

SEAT and CUPRA use VW Group TPMS systems:

- **Indirect TPMS (Ibiza, Leon, Arona)**: Reset via the infotainment — Car → Tyres → Store
- **Direct TPMS (CUPRA Formentor VZ, Born, Tarraco 4Drive)**: Requires a TPMS diagnostic tool

Tyre Rescue carries VW Group-compatible TPMS reset tools for all SEAT and CUPRA models. Reset is included at no additional charge.

## Emergency SEAT & CUPRA Tyre Fitting in Scotland

1. **CUPRA Born**: No spare wheel — call us immediately
2. **CUPRA Formentor, Leon**: May have a space-saver spare or inflation kit
3. **SEAT Ibiza, Arona, Leon**: Check boot for space-saver spare
4. **Call 0141 266 0690** — give your registration for instant identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile SEAT or CUPRA tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Volkswagen tyre fitting Scotland](/blog/volkswagen-tyre-fitting-scotland) | [Skoda tyre fitting Scotland](/blog/skoda-tyre-fitting-scotland)`,
  },
  {
    slug: 'citroen-tyre-fitting-scotland',
    title: 'Citroen Tyre Fitting Scotland: C3, C5 Aircross, Berlingo & ë-C3',
    description:
      'Mobile Citroen tyre fitting across Scotland. Correct tyre sizes for every Citroen model — C3, C3 Aircross, C5 Aircross, C5 X, ë-C3 electric, Berlingo, SpaceTourer van. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'citroen tyre fitting scotland',
      'citroen c3 tyres scotland',
      'citroen c5 aircross tyres scotland',
      'citroen berlingo tyres scotland',
      'citroen e-c3 tyres scotland',
      'citroen dispatch tyres scotland',
      'mobile citroen tyre fitting glasgow',
      'citroen c5 x tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'peugeot-tyre-fitting-scotland',
    ],
    content: `# Citroen Tyre Fitting Scotland: Every Model Covered

Citroen is a popular brand in Scotland, particularly for its affordable small cars and highly practical vans. The Berlingo van is a fixture on Scottish building sites and small businesses, while the C3 and C5 Aircross offer strong value for family drivers. Tyre Rescue provides mobile Citroen tyre fitting across all of Scotland.

## Citroen C3 Tyre Sizes

The Citroen C3 (B618, 2016–present):

| C3 Trim | Tyre Size |
|---|---|
| C3 Plus | 185/65R15 |
| C3 Shine | 205/45R17 |

New Citroen C3 (D51D, 2024–present):
- 195/65R15 (standard)

The new C3 is one of Europe's most affordable new cars — its 195/65R15 tyre is a common size we stock on every van.

## Citroen ë-C3 Electric Tyre Sizes

The Citroen ë-C3 (2024–present) — affordable electric hatchback:

- 195/65R15 (standard load index 91+)

**ë-C3 note**: No spare wheel. A flat requires mobile fitting. The ë-C3's 195/65R15 is one of the most common tyre sizes — we carry this on every van.

## Citroen C3 Aircross Tyre Sizes

The Citroen C3 Aircross (B96, 2017–2023 and successor, 2024+):

- 205/60R16 (standard)
- 215/55R17 (Flair trim)

New C3 Aircross (2024+):
- 205/55R17

## Citroen C5 Aircross Tyre Sizes

The Citroen C5 Aircross (A88, 2018–present):

| C5 Aircross Trim | Tyre Size |
|---|---|
| C5 Aircross Plus | 215/55R18 |
| C5 Aircross Flair | 235/45R18 or 235/50R18 |
| C5 Aircross PHEV | 235/45R18 (load index 98+) |

**PHEV note**: The C5 Aircross plug-in hybrid is heavier — correct load index is critical.

## Citroen C5 X Tyre Sizes

The Citroen C5 X (E43AHN, 2022–present) — fastback estate:

- 235/45R19 (standard)
- 255/40R20 (Shine Plus)
- PHEV: 235/45R19 (load index 99+)

## Citroen Berlingo Van Tyre Sizes

The Berlingo (K9 Mk3, 2018–present) — Scotland's most common small van:

| Berlingo Model | Tyre Size |
|---|---|
| Berlingo M (short) | 195/65R15C |
| Berlingo XL (long) | 205/60R16C or 215/60R16C |
| Berlingo Electric | 215/60R16C (load index 99+) |

**Berlingo van note**: The cargo Berlingo requires C-rated commercial tyres. Passenger-rated tyres are unsafe and illegal on a commercial Berlingo van. We carry the correct C-rated sizes.

## Citroen SpaceTourer & Dispatch Van Tyre Sizes

The SpaceTourer (passenger) and Dispatch (cargo) share a platform:

| Model | Tyre Size |
|---|---|
| Dispatch M panel van | 215/65R16C |
| Dispatch XL panel van | 215/65R16C or 225/65R16C |
| SpaceTourer (people carrier) | 215/60R17 (passenger-rated) |

## Citroen TPMS Reset

All Citroen models from 2017 onward have TPMS. Reset via the touchscreen:
- Settings → Vehicle → Tyre Pressure → Reinitialise

This is shared with the Peugeot/Stellantis group procedure. Tyre Rescue carries the compatible reset tool — included at no additional charge.

## Emergency Citroen Tyre Fitting in Scotland

1. **ë-C3 Electric**: No spare — call us immediately
2. **C3, C3 Aircross**: May have an inflation kit only — call us for a proper fitting
3. **Berlingo van**: Check if it has a spare under the floor panel
4. **Call 0141 266 0690** — give your registration for instant identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Citroen tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Peugeot tyre fitting Scotland](/blog/peugeot-tyre-fitting-scotland) | [Van tyre fitting Scotland](/blog/van-tyre-fitting-scotland)`,
  },
  {
    slug: 'mazda-tyre-fitting-scotland',
    title: 'Mazda Tyre Fitting Scotland: CX-5, CX-30, Mazda3, MX-5 & CX-60',
    description:
      'Mobile Mazda tyre fitting across Scotland. Correct tyre sizes for every Mazda model — CX-5, CX-30, CX-60, Mazda3, MX-5, MX-30 electric. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mazda tyre fitting scotland',
      'mazda cx-5 tyres scotland',
      'mazda cx-30 tyres scotland',
      'mazda3 tyres scotland',
      'mazda mx-5 tyres scotland',
      'mazda cx-60 tyres scotland',
      'mobile mazda tyre fitting glasgow',
      'mazda mx-30 tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Mazda Tyre Fitting Scotland: Every Model Covered

Mazda is a premium-positioned Japanese brand popular among Scottish drivers who value driving enjoyment and reliability. The Mazda CX-5 is one of the UK's most liked SUVs, and the MX-5 has a dedicated following in Scotland's scenic driving routes. Tyre Rescue provides specialist mobile Mazda tyre fitting across all of Scotland.

## Mazda CX-5 Tyre Sizes

The Mazda CX-5 (KF, 2017–present) — Mazda's bestselling model:

| CX-5 Trim | Tyre Size |
|---|---|
| CX-5 SE-L | 225/65R17 |
| CX-5 Sport | 225/55R19 |
| CX-5 GT Sport | 225/55R19 |
| CX-5 Exclusive-Line | 225/55R19 |
| CX-5 AWD trims | 225/55R19 (load index 99+) |

**AWD note**: All-wheel-drive CX-5 variants require correct load index — at minimum 99. We always verify before fitting.

## Mazda CX-30 Tyre Sizes

The Mazda CX-30 (DM, 2019–present):

| CX-30 Trim | Tyre Size |
|---|---|
| CX-30 SE-L | 215/55R18 |
| CX-30 Sport | 215/55R18 |
| CX-30 GT Sport | 215/55R18 or 225/45R19 |
| CX-30 GT Sport Tech | 225/45R19 |
| CX-30 e-SKYACTIV X MHEV | 215/55R18 |

## Mazda CX-60 Tyre Sizes

The Mazda CX-60 (KH, 2022–present) — flagship PHEV SUV:

| CX-60 Trim | Tyre Size |
|---|---|
| CX-60 Exclusive-Line | 235/55R19 |
| CX-60 Homura | 235/50R20 or 255/45R20 |
| CX-60 Takumi | 255/45R20 |
| CX-60 PHEV AWD | 235/55R19 or 255/45R20 (load index 105+) |

**CX-60 PHEV note**: The CX-60 plug-in hybrid is Mazda's heaviest passenger car. Load index 105+ is required on AWD variants.

## Mazda3 Tyre Sizes

The Mazda3 (BP, 2019–present) — hatchback and saloon:

| Mazda3 Trim | Tyre Size |
|---|---|
| Mazda3 SE-L | 205/55R16 |
| Mazda3 Sport | 215/45R18 |
| Mazda3 GT Sport | 215/45R18 |
| Mazda3 Exclusive-Line | 215/45R18 |

## Mazda2 Tyre Sizes

The Mazda2 (DJ, 2015–present):

- 185/60R15 (base)
- 185/55R15 (Sport)
- 195/50R16 (GT Sport)

The new Mazda2 Hybrid (rebadged Toyota Yaris Cross): 195/60R17.

## Mazda MX-5 Tyre Sizes

The Mazda MX-5 (ND, 2015–present) — Roadster and RF targa:

| MX-5 Trim | Tyre Size |
|---|---|
| MX-5 Sport | 195/50R16 |
| MX-5 Sport Tech / GT Sport | 205/45R17 |
| MX-5 GT Sport Tech | 205/45R17 |

**MX-5 note**: The MX-5 uses summer performance tyres as OE. For Scottish roads, all-season alternatives in 205/45R17 are available — call us to discuss options.

## Mazda MX-30 Electric Tyre Sizes

The Mazda MX-30 (DR, 2021–present):

- 215/55R18 (standard)
- Range Extender: 215/55R18

**MX-30 note**: No spare wheel. A flat requires immediate mobile fitting.

## Mazda TPMS Reset

All Mazda models from 2016 onward have TPMS. After any tyre change:

- **Indirect TPMS (Mazda2, Mazda3, CX-30)**: Reset via the MZD Connect screen — Settings → Vehicle Settings → Tyre Pressure Monitor → Set Pressure
- **Direct TPMS (CX-5, CX-60, MX-30)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Mazda-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Mazda Tyre Fitting in Scotland

1. **MX-30 Electric**: No spare — call us immediately
2. **CX-5, CX-30, Mazda3**: May have a space-saver spare or inflation kit — check your boot
3. **MX-5**: Typically has no spare due to the small boot — check for an inflation kit
4. **Call 0141 266 0690** — give your registration for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Mazda tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Toyota tyre fitting Scotland](/blog/toyota-tyre-fitting-scotland) | [Honda tyre fitting Scotland](/blog/honda-tyre-fitting-scotland)`,
  },
  {
    slug: 'suzuki-tyre-fitting-scotland',
    title: 'Suzuki Tyre Fitting Scotland: Jimny, Vitara, Swift, S-Cross & Ignis',
    description:
      'Mobile Suzuki tyre fitting across Scotland. Correct tyre sizes for every Suzuki model — Jimny, Vitara, Swift, S-Cross, Ignis, Across PHEV. TPMS reset included. Highlands coverage.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'suzuki tyre fitting scotland',
      'suzuki jimny tyres scotland',
      'suzuki vitara tyres scotland',
      'suzuki swift tyres scotland',
      'suzuki s-cross tyres scotland',
      'mobile suzuki tyre fitting glasgow',
      'suzuki jimny tyres highlands',
      'suzuki ignis tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      '4x4-suv-tyres-scotland-highlands',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Suzuki Tyre Fitting Scotland: Every Model Covered

Suzuki has a loyal following in Scotland, particularly among drivers who value compact practicality and genuine off-road capability. The Suzuki Jimny is iconic in the Scottish Highlands and on farms across Perthshire, Argyll, and Galloway — and the Swift is a popular first car in every Scottish city. Tyre Rescue provides mobile Suzuki tyre fitting across all of Scotland.

## Suzuki Jimny Tyre Sizes

The Suzuki Jimny (JB74, 2018–present) — iconic compact 4x4:

| Jimny Variant | Tyre Size |
|---|---|
| Jimny SZ3 / SZ5 | 195/80R15 |
| Jimny Professional (commercial) | 195/80R15 |

**Jimny tyre note**: The Jimny's 195/80R15 is an unusual size — tall-profile and narrow, designed for off-road grip and clearance. This size is specific to the Jimny and not common in all tyre ranges. We stock this size — call ahead on 0141 266 0690 to confirm availability before arriving.

**Highland & rural note**: The Jimny is Suzuki's genuine off-roader. For Scottish terrain — farm tracks, forest roads, Highland estates — consider all-terrain (A/T) tyres in 195/80R15 for better grip and durability on rough surfaces. We can advise on A/T options for your Jimny.

## Suzuki Vitara Tyre Sizes

The Suzuki Vitara (LY, 2015–present):

| Vitara Trim | Tyre Size |
|---|---|
| Vitara SZ3 | 215/65R16 |
| Vitara SZ-T | 225/55R17 |
| Vitara S (Sport) | 225/55R17 |
| Vitara SZ5 | 225/55R17 |
| Vitara AllGrip 4x4 | 225/55R17 (load index 97+) |
| Vitara Boosterjet Hybrid | 225/55R17 |

## Suzuki Swift Tyre Sizes

The Suzuki Swift (AZ, 2017–present) — hybrid and Sport versions:

| Swift Trim | Tyre Size |
|---|---|
| Swift SZ3 / SZ-T | 185/60R15 |
| Swift SZ5 | 195/55R16 |
| Swift Sport | 195/45R17 |
| Swift Hybrid | 185/60R15 |

**Swift Sport note**: The 195/45R17 is a less common size. We stock it but call ahead to confirm availability for your exact specification.

## Suzuki S-Cross Tyre Sizes

The Suzuki S-Cross (JY, 2022–present):

| S-Cross Trim | Tyre Size |
|---|---|
| S-Cross SZ-T | 215/60R17 |
| S-Cross SZ5 | 225/45R19 |
| S-Cross Hybrid | 215/60R17 |

Older S-Cross (JX6, 2013–2021): 215/55R17 standard.

## Suzuki Ignis Tyre Sizes

The Suzuki Ignis (FF21S, 2016–present) — small urban crossover:

- 185/60R15 (SZ3)
- 175/65R15 (SZ-T — some variants)

The Ignis AllGrip: 185/60R15 (same size, but with 4WD capability).

## Suzuki Across PHEV Tyre Sizes

The Suzuki Across (2020–present) — rebadged Toyota RAV4 PHEV:

- 235/55R18 (standard)
- 235/50R19 (higher trim)

**Across PHEV note**: The Across is based on the Toyota RAV4 PHEV platform. It requires a minimum load index of 104 on AWD variants — the same as the RAV4 PHEV.

## Suzuki Baleno Tyre Sizes

The Suzuki Baleno (2022–present):

- 185/65R15 (standard)

## Suzuki TPMS Reset

Suzuki models from 2015 onward have TPMS. After any tyre change:

- **Indirect TPMS (Swift, Ignis, Baleno)**: Press and hold the TPMS SET button (usually located in the glovebox) until the indicator flashes — then drive above 25mph for the calibration to complete
- **Direct TPMS (Vitara AllGrip, S-Cross, Across)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Suzuki-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Suzuki Tyre Fitting in Scotland

If you have a flat tyre on your Suzuki anywhere in Scotland:

1. **Jimny**: The Jimny often has a full-size spare mounted on the rear or underneath — check first before calling
2. **Vitara, S-Cross**: May have a space-saver spare in the boot
3. **Swift, Ignis**: Likely has an inflation kit only — call us for a proper replacement
4. **Across PHEV**: No spare wheel — call us immediately
5. **Call 0141 266 0690** — give your registration for instant identification

**Highlands note**: If you're in a remote Highland location with a flat Jimny, call us. We cover all of Scotland including rural areas. If you have a full-size spare, fit it safely off the road and then call us when you reach your destination for a replacement.

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

Call **0141 266 0690** or [book online](/book) for mobile Suzuki tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [4x4 and SUV tyres Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [Tyre fitting Inverness & Highlands](/mobile-tyre-fitting/inverness)`,
  },
  {
    slug: 'mitsubishi-tyre-fitting-scotland',
    title: 'Mitsubishi Tyre Fitting Scotland: Outlander PHEV, Eclipse Cross & L200',
    description:
      'Mobile Mitsubishi tyre fitting across Scotland. Correct tyre sizes for Mitsubishi Outlander PHEV, Eclipse Cross, ASX, Shogun, L200 Warrior pickup. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'mitsubishi tyre fitting scotland',
      'mitsubishi outlander tyres scotland',
      'mitsubishi eclipse cross tyres scotland',
      'mitsubishi l200 tyres scotland',
      'mitsubishi asx tyres scotland',
      'mitsubishi outlander phev tyres glasgow',
      'mobile mitsubishi tyre fitting scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      '4x4-suv-tyres-scotland-highlands',
      'electric-vehicle-tyres-scotland',
    ],
    content: `# Mitsubishi Tyre Fitting Scotland: Every Model Covered

Mitsubishi has a strong following in Scotland, particularly for the Outlander PHEV — which was the UK's bestselling plug-in hybrid vehicle for several consecutive years — and the L200 pickup truck, popular across Scottish farms and worksites. Tyre Rescue provides mobile Mitsubishi tyre fitting across all of Scotland.

## Mitsubishi Outlander PHEV Tyre Sizes

The Mitsubishi Outlander PHEV (2012–2023) and newer generation (2022+):

| Outlander Generation | Tyre Size |
|---|---|
| Outlander PHEV Mk3 (2020–2023) | 225/55R18 (load index 98+) |
| Outlander PHEV Mk2 (2015–2020) | 225/55R18 or 215/60R17 |
| Outlander PHEV Mk1 (2012–2015) | 225/55R18 |
| New Outlander PHEV (2022+) | 225/55R18 or 235/55R18 |

**PHEV load index note**: The Outlander PHEV is significantly heavier than a standard Outlander due to its battery pack. Minimum load index 98 on all PHEV variants — we always verify before fitting.

**TPMS note**: The Outlander PHEV has direct TPMS — a diagnostic tool is required to reset after tyre changes. This is included with every Tyre Rescue fitting.

## Mitsubishi Eclipse Cross Tyre Sizes

The Mitsubishi Eclipse Cross (GK1, 2018–present) and Eclipse Cross PHEV:

| Eclipse Cross Variant | Tyre Size |
|---|---|
| Eclipse Cross 2WD | 215/55R18 |
| Eclipse Cross 4WD | 215/55R18 (load index 99+) |
| Eclipse Cross PHEV | 215/55R18 (load index 99+) |

## Mitsubishi ASX Tyre Sizes

The Mitsubishi ASX (GA3W, 2022–present — now based on Renault Captur):
- 215/55R17 (standard)
- 225/45R18 (Diamond / Exceed)

Older ASX (GA2W, 2010–2022): 215/60R17 base, 225/55R17 upper.

## Mitsubishi Shogun Tyre Sizes

The Mitsubishi Shogun (V80/V90, discontinued 2021 — but still common on Scottish estates and farms):

| Shogun Variant | Tyre Size |
|---|---|
| Shogun Sport (2019–2021) | 265/60R18 |
| Shogun Warrior | 265/65R17 |
| Older Shogun | 245/65R17 |

The Shogun Sport uses highway terrain (H/T) or all-terrain (A/T) tyres depending on usage. For farm and estate use in Scotland, A/T tyres in 265/60R18 are a practical upgrade.

## Mitsubishi L200 Pickup Tyre Sizes

The Mitsubishi L200 (KK/KL, 2015–present) — popular Scottish farm/site vehicle:

| L200 Variant | Tyre Size |
|---|---|
| L200 Warrior | 265/65R17 |
| L200 Barbarian / Leader | 265/65R17 |
| L200 Animal (older) | 265/65R17 |

**L200 tyre note**: The L200 uses light-truck rated tyres (LT designation or reinforced construction). Standard passenger tyres are unsafe on a pick-up truck. We carry correct L200-specification tyres.

For Scottish farm use, consider all-terrain (A/T) rated tyres in 265/65R17 — they provide significantly better grip on mud, gravel, and farm tracks compared to factory highway terrain tyres.

## Mitsubishi TPMS Reset

Mitsubishi models with direct TPMS (Outlander PHEV, Eclipse Cross PHEV) require a diagnostic tool to reset. Indirect TPMS models (ASX) reset via the driver information display.

Tyre Rescue carries Mitsubishi-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Mitsubishi Tyre Fitting in Scotland

1. **Outlander PHEV**: May have a space-saver spare — check the boot floor. No spare on some variants.
2. **L200**: Usually has a full-size spare mounted under the truck bed
3. **ASX, Eclipse Cross**: Check boot for a space-saver spare
4. **Call 0141 266 0690** — give your registration for instant tyre identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

Call **0141 266 0690** or [book online](/book) for mobile Mitsubishi tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [4x4 and SUV tyres Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [Land Rover tyre fitting Scotland](/blog/land-rover-range-rover-tyres-scotland)`,
  },
  {
    slug: 'subaru-tyre-fitting-scotland',
    title: 'Subaru Tyre Fitting Scotland: Outback, Forester, XV, Impreza & WRX',
    description:
      'Mobile Subaru tyre fitting across Scotland. Correct tyre sizes for every Subaru model — Outback, Forester, XV/Crosstrek, Impreza, WRX STI, BRZ. Symmetrical AWD tyre advice. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 5,
    featured: false,
    keywords: [
      'subaru tyre fitting scotland',
      'subaru outback tyres scotland',
      'subaru forester tyres scotland',
      'subaru xv tyres scotland',
      'subaru impreza tyres scotland',
      'subaru wrx sti tyres scotland',
      'mobile subaru tyre fitting glasgow',
      'subaru tyre replacement scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      '4x4-suv-tyres-scotland-highlands',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Subaru Tyre Fitting Scotland: Every Model Covered

Subaru has a loyal following in Scotland, valued for its symmetrical all-wheel drive system that performs well in Scottish winter conditions, on rural roads, and in Highland terrain. The Outback and Forester are popular estate and SUV choices, while the WRX STI has a dedicated performance following. Tyre Rescue provides mobile Subaru tyre fitting across all of Scotland.

## Subaru Outback Tyre Sizes

The Subaru Outback (BS/BT, 2014–present):

| Outback Generation | Tyre Size |
|---|---|
| Outback 2.5i (2021+) | 225/60R18 |
| Outback Touring (2021+) | 225/60R18 |
| Outback 3.6R (older) | 225/60R17 |
| Outback 2.5i (2015–2020) | 225/60R17 |

**AWD tyre matching note**: Subaru's symmetrical AWD system is sensitive to tyre size differences between axles. If replacing fewer than all four tyres, the replacement must match the existing tyre's overall diameter within 5mm. Mixing brands or sizes risks damaging the AWD transfer case. Tyre Rescue always advises on this before fitting a single tyre on a Subaru AWD.

## Subaru Forester Tyre Sizes

The Subaru Forester (SK, 2018–present):

| Forester Variant | Tyre Size |
|---|---|
| Forester 2.0i / XE | 225/55R17 |
| Forester 2.0i SE / Sport | 225/55R17 |
| Forester e-Boxer | 225/55R17 |

Forester (SJ, 2012–2018): 225/55R17 base, 225/55R18 XT.

## Subaru XV / Crosstrek Tyre Sizes

The Subaru XV (GT, 2017–present) — also sold as Crosstrek:

- 225/60R17 (standard)
- 225/55R18 (some trims)

## Subaru Impreza Tyre Sizes

The Subaru Impreza (GK/GT, 2017–present):

- 205/50R17 (hatchback base)
- 225/45R18 (Sport trim)

Older Impreza: 205/55R16 (GD/GG generation).

## Subaru WRX & WRX STI Tyre Sizes

| WRX Model | Tyre Size |
|---|---|
| WRX (VA, 2014–2021) | 245/40R18 |
| WRX STI (VA) | 245/40R18 (Michelin Pilot Sport 4S OE) |
| WRX (VB, 2022+) | 245/40R18 |

**WRX STI tyre note**: The STI is fitted with Michelin Pilot Sport 4S as OE. We carry OE-equivalent performance replacements — call ahead to confirm stock for 245/40R18 in your required load rating.

**AWD matching**: The WRX STI's AWD system is particularly sensitive to tyre size differences. Always replace in sets of four or confirm that replacement tyres have an identical overall diameter to the remaining three.

## Subaru BRZ Tyre Sizes

The Subaru BRZ (ZD8, 2022–present) — rear-wheel-drive sports coupe:

- 215/45R18 (standard — Michelin Pilot Sport 4 OE)

**BRZ note**: The BRZ is rear-wheel drive — unusual for Subaru. Standard tyre-fitting advice applies without the AWD matching concern.

## Subaru TPMS Reset

All Subaru models from 2015 onward have TPMS:

- **Indirect TPMS (Forester, Outback, XV)**: Reset via the multi-information display — Settings → Tyre Pressure
- **Direct TPMS (WRX, WRX STI, BRZ)**: Requires a TPMS diagnostic tool to communicate with each wheel sensor

Tyre Rescue carries Subaru-compatible TPMS reset tools. Reset is included at no additional charge.

## Subaru AWD Tyre Replacement — Important Advice

Subaru's symmetrical AWD is one of the best systems in the market but requires careful tyre management:

1. **Ideally replace all four tyres at once** on any Subaru AWD model
2. **If replacing in pairs**: Only replace both tyres on the same axle (both fronts or both rears) — never just one tyre
3. **The new pair must match the remaining tyres exactly in overall diameter** — same brand, size, and ideally model is safest
4. **Tread depth difference should be less than 2/32"** between front and rear axles
5. **Mixing brands**: We advise against it on Subaru AWD — consult us before ordering

This applies to: Outback, Forester, XV, Legacy, Impreza AWD, Levorg, and WRX (not BRZ which is RWD).

## Emergency Subaru Tyre Fitting in Scotland

1. **Do not drive on a flat tyre** on any Subaru AWD — even briefly — as it will force different wheel speeds and stress the AWD system
2. **Check for a spare** — most Subaru models have a full-size or space-saver spare in the boot
3. **Call 0141 266 0690** — explain it's a Subaru AWD and we will advise on matching before ordering

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min, Inverness ~100 min.

Call **0141 266 0690** or [book online](/book) for mobile Subaru tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [4x4 and SUV tyres Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [Tyre rotation guide Scotland](/blog/tyre-rotation-guide-scotland)`,
  },
  {
    slug: 'all-season-tyres-scotland-guide',
    title: 'All-Season Tyres Scotland: Are They Worth It? Best Brands & When to Use',
    description:
      'Are all-season tyres worth it in Scotland? Honest guide to Michelin CrossClimate 2, Continental AllSeasonContact 2, Goodyear Vector 4Seasons. When to choose all-season vs dedicated winter tyres for Scottish roads.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 9,
    featured: false,
    keywords: [
      'all season tyres scotland',
      'all season tyres vs winter tyres scotland',
      'best all season tyres scotland',
      'michelin crossclimate 2 scotland',
      'continental allseasoncontact scotland',
      'goodyear vector 4seasons scotland',
      'are all season tyres good for scotland',
      'all weather tyres scotland',
    ],
    relatedSlugs: [
      'winter-tyres-when-to-switch-scotland',
      'best-tyres-scottish-roads-guide',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# All-Season Tyres Scotland: Are They Worth It?

All-season tyres — also called all-weather tyres — have become increasingly popular in Scotland over the last five years. They promise to eliminate the faff of seasonal tyre changes while still offering winter safety. But are they actually good enough for Scottish roads? This guide gives you an honest answer.

## What Are All-Season Tyres?

All-season tyres are a compromise tyre designed to work year-round. They use a tread compound that stays reasonably flexible in cold temperatures (unlike summer tyres, which harden below 7°C), and a tread pattern that can channel away both summer rain and light snow.

The critical marker to look for is the **Three Peak Mountain Snowflake (3PMSF)** symbol — a snowflake in a mountain outline on the tyre sidewall. This indicates the tyre has passed minimum winter performance standards. Without this, an "all-season" tyre is just a summer tyre with marketing.

**Most reputable all-season tyres carry the 3PMSF symbol** — if your all-season doesn't have it, treat it as a summer tyre.

## All-Season Tyres vs Winter Tyres: Which Is Better for Scotland?

| Factor | All-Season | Dedicated Winter |
|---|---|---|
| Snow grip | Good (3PMSF certified) | Excellent |
| Ice grip | Moderate | Excellent |
| Wet summer grip | Good | Poor — compound too soft |
| Dry summer grip | Good | Poor — wears faster |
| Cost per year | Lower (one set) | Similar (two sets, amortised) |
| Best for | Central Belt, cities | Highlands, frequent winter driving |

**Our verdict**: For most Scottish city and Central Belt drivers, all-season tyres are a very sensible choice. For Highland drivers, those on the NC500, or anyone who regularly encounters ice and heavy snow, dedicated winter tyres fitted from October to April will outperform any all-season tyre.

## The Best All-Season Tyres for Scotland

### Michelin CrossClimate 2

**Best all-round all-season tyre for Scotland.**

The CrossClimate 2 (2021–present) consistently leads independent tests for a reason: its summer performance on wet roads is close to a premium summer tyre, while its 3PMSF winter rating means it handles snow effectively. Tread life is excellent — many Scottish owners report 40,000+ miles per set.

Available from approximately £80–£180 per tyre depending on size.

**Good for**: Glasgow, Edinburgh, Central Belt, most Scottish cities. Summer holiday driving to the Highlands. Year-round commuting.

**Not ideal for**: Regular driving on uncleared Highland roads in heavy snow — a dedicated winter tyre is better here.

### Continental AllSeasonContact 2

**Best for wet-road performance.**

The AllSeasonContact 2 (2023–present) edges the Michelin on wet braking in some tests. It also has excellent aquaplaning resistance — particularly valuable in Scotland's rainy west coast weather. If you drive in heavy rain frequently (Glasgow, Greenock, Argyll), this tyre is an excellent choice.

Available from approximately £75–£170 per tyre.

### Goodyear Vector 4Seasons Gen-3

**Best balance of summer and winter performance.**

The Vector 4Seasons Gen-3 is notable for maintaining strong dry handling in summer — sometimes a weak point on all-season tyres — while also performing very well in snow and wet conditions. Goodyear's asymmetric tread design gives it a more car-like feel than some competitors.

Available from approximately £70–£160 per tyre.

### Bridgestone Weather Control A005 EVO

**Strong all-round performer, good value.**

The Weather Control A005 EVO performs particularly well in ice conditions for an all-season tyre — usually a weakness of the category. Scottish drivers in Perthshire, Stirlingshire, and Aberdeenshire who encounter occasional ice may prefer this to the Michelin on pure ice performance.

### Hankook Kinergy 4S2

**Best value all-season for Scotland.**

For drivers who want all-season protection without spending £150+ per tyre, the Kinergy 4S2 is consistently the top-rated budget all-season tyre. Performance is below the Michelin CrossClimate 2 but significantly better than no all-season protection at all.

Available from approximately £50–£100 per tyre.

## All-Season Tyres and Scottish Weather: The Reality

Scotland has more nuanced weather than a simple "summer/winter" split:

**Western Scotland (Glasgow, Argyll, Dumbarton, Ayrshire)**: Rarely sees severe snow but has heavy rainfall and mild but damp winters. All-season tyres are excellent here.

**Central Belt (Edinburgh, Falkirk, Stirling, Perth)**: Occasional snow, significant winter rainfall. All-season tyres are well-suited for most drivers.

**Aberdeenshire and Angus**: More frequent snow and harder frosts than the west. All-season tyres are adequate for town driving but winter tyres are better for rural routes.

**Highlands (Inverness, Fort William, Aviemore, NC500)**: Can experience severe snow, ice, and black ice from October to April. All-season tyres are a minimum — dedicated winter tyres are strongly recommended for anyone commuting on A-roads above 500m altitude.

**Shetland and Orkney**: Surprisingly mild due to Gulf Stream influence, rarely severe snow. All-season tyres are excellent here.

## When All-Season Tyres Are NOT Enough

All-season tyres have clear limits in Scotland:

1. **Heavy snow on uncleared roads** — dedicated winter tyres with deeper, more aggressive sipes will outperform any all-season tyre
2. **Ice** — even the best all-season tyres struggle on genuine ice compared to winter-rated tyres with high silica compound
3. **Performance driving** — if you have a sporty car (GR Yaris, Focus ST, Golf GTI), an all-season tyre will blunt handling noticeably versus summer tyres
4. **Very high mileage in summer** — all-season tyres wear faster in warm conditions than summer tyres; if you drive 20,000+ miles/year mostly in summer, summer tyres may be more economical

## Fitting All-Season Tyres in Scotland

Tyre Rescue can supply and fit all-season tyres at your home, workplace, or roadside across all of Scotland. We carry:

- Michelin CrossClimate 2
- Continental AllSeasonContact / AllSeasonContact 2
- Goodyear Vector 4Seasons
- Hankook Kinergy 4S2
- Bridgestone Weather Control

Call **0141 266 0690** or [book online](/book) to arrange fitting. Tell us your vehicle registration and we will quote the full price — tyre and fitting — before any work begins.

## All-Season Tyres: Summary for Scottish Drivers

- **Get all-season tyres if**: You're a city/Central Belt driver who wants year-round safety without seasonal tyre changes
- **Get winter tyres instead if**: You regularly drive in the Highlands, on rural A-roads, or encounter snow more than a few times a year
- **Look for 3PMSF marking** — without it, a tyre marketed as "all-season" won't perform in snow
- **Best choice for most Scottish drivers**: Michelin CrossClimate 2 or Continental AllSeasonContact 2

[Winter tyres Scotland guide](/blog/winter-tyres-when-to-switch-scotland) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Mobile tyre fitting Scotland](/mobile-tyre-fitting)`,
  },
  {
    slug: 'michelin-vs-continental-vs-pirelli-scotland',
    title: 'Michelin vs Continental vs Pirelli: Which Tyre Brand Is Best for Scotland?',
    description:
      'Honest comparison of Michelin, Continental, and Pirelli for Scottish roads. Wet braking, tread life, value for money, and which brand suits each type of Scottish driver. By Tyre Rescue Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 9,
    featured: false,
    keywords: [
      'michelin vs continental tyres scotland',
      'best tyre brand scotland',
      'michelin pilot sport 5 scotland',
      'continental premium contact 7 scotland',
      'pirelli p zero scotland',
      'michelin crossclimate vs continental allseasoncontact',
      'premium tyre comparison scotland',
      'which tyres are best for scotland',
    ],
    relatedSlugs: [
      'best-tyres-scottish-roads-guide',
      'all-season-tyres-scotland-guide',
      'best-budget-tyres-scotland-2026',
    ],
    content: `# Michelin vs Continental vs Pirelli: Which Is Best for Scottish Roads?

If you're about to spend £120–£200+ per tyre, you want to be confident it's the right choice. This guide compares the three dominant premium tyre brands — Michelin, Continental, and Pirelli — specifically in the context of Scottish roads, weather, and driving conditions.

## The Summary (If You're in a Hurry)

- **For wet performance**: Continental or Michelin — both exceptional, Continental sometimes wins on wet braking
- **For tread life**: Michelin — consistently outlasts competitors, especially the Michelin CrossClimate and Pilot Sport 5
- **For high-performance cars**: Pirelli — particularly for AMG, M Sport, and RS models where feel and handling precision matters
- **For all-round Scottish conditions**: Michelin CrossClimate 2 or Continental AllSeasonContact 2 — both are outstanding choices for year-round use
- **For value over time**: Michelin — higher upfront cost but often cheaper per mile

## Michelin — The Long Life, Wet Weather Specialist

### Who Michelin Is Best For
Michelin is the right choice if you prioritise:
- Long tyre life (Michelin consistently leads in tread life tests)
- Wet road performance (particularly in persistent Scottish rainfall)
- All-season use (CrossClimate range)
- Efficient hybrid and EV driving (Michelin e.Primacy, Pilot Sport EV)

### Key Michelin Tyres for Scotland

**Michelin CrossClimate 2**: The best all-season tyre on the market. Strong wet braking, 3PMSF winter rating, and remarkable longevity. This is the tyre we recommend most often to Central Belt drivers who want year-round safety.

**Michelin Pilot Sport 5**: The successor to the legendary PS4. Exceptional wet braking and precise handling — the go-to choice for GTI, ST, N, and RS performance cars. Tread life is impressive for a performance tyre.

**Michelin Pilot Sport 4 SUV**: Designed for large SUVs and crossovers. Available in the large sizes needed for Porsche Cayenne, BMW X5, Range Rover Sport.

**Michelin Primacy 4+**: High-quality touring tyre for executive saloons and estates — smooth, quiet, and safe in wet conditions. Popular on Volvo, Mercedes, and Audi.

### Michelin Weaknesses
- **Cost**: Typically 10–20% more expensive upfront than Continental
- **Dry handling feel**: Some drivers prefer Continental or Pirelli for dry road feel and steering response

## Continental — The Wet Braking King

### Who Continental Is Best For
Continental is the right choice if you prioritise:
- Stopping distance in the wet — Continental frequently wins or ties Michelin in wet braking tests
- Dry road feel and steering response
- Value versus Michelin (typically slightly cheaper for comparable performance)
- OEM fitments (Continental is the OE choice for many premium cars including BMW, Mercedes, and VW)

### Key Continental Tyres for Scotland

**Continental PremiumContact 7**: Continental's flagship summer tyre. Exceptional wet braking, strong dry handling. If you drive a BMW, Mercedes, or Audi with Continental as OE, the PremiumContact 7 is the ideal replacement.

**Continental AllSeasonContact 2**: Outstanding all-season tyre. Slightly edges the Michelin CrossClimate 2 on wet braking in some independent tests. One of our top recommendations for Scottish year-round driving.

**Continental SportContact 7**: High-performance summer tyre for AMG, M Power, and RS models. Pirelli P Zero's main competitor. Where Pirelli offers more feel, Continental offers more stability.

**Continental WinterContact TS870 P**: Premium winter tyre for Scottish Highland drivers who want dedicated seasonal tyres. Excellent on snow and ice.

### Continental Weaknesses
- **Tread life**: Slightly shorter tread life than Michelin on some compounds — more noticeable on performance tyres
- **Less innovative all-season range** than Michelin (though AllSeasonContact 2 is excellent)

## Pirelli — The Performance and OEM Specialist

### Who Pirelli Is Best For
Pirelli is the right choice if you prioritise:
- High-performance driving feel — Pirelli's compounds provide the most steering feedback of the three brands
- OEM replacement on performance cars — Pirelli supplies OE tyres to Ferrari, Lamborghini, McLaren, AMG, M Sport, and RS models
- Style — Pirelli P Zero and Cinturato are prestige choices
- Supercars and performance vehicles — the only real choice for Porsche, Ferrari, and high-end AMG

### Key Pirelli Tyres for Scotland

**Pirelli P Zero**: The benchmark for ultra-high-performance tyres. On a 911 GT3, M3, or AMG C63, there is no better tyre. However, P Zero tyres can be significantly more expensive than equivalent Michelin or Continental tyres.

**Pirelli P Zero All Season SF2**: Pirelli's all-season offering. Not as highly rated as Michelin CrossClimate 2 or Continental AllSeasonContact 2 in independent tests — but has 3PMSF certification and is the OE choice on many performance cars.

**Pirelli Cinturato All Season SF2**: More budget-focused all-season tyre, suitable for mainstream vehicles.

**Pirelli Scorpion Verde All Season SF**: For large SUVs — Range Rover, Porsche Cayenne, BMW X5. High load index and reliable in Scottish conditions.

### Pirelli Weaknesses
- **Tread life**: Pirelli performance tyres typically wear faster than Michelin or Continental equivalents
- **Wet performance**: Pirelli lags behind Michelin and Continental in wet braking tests on standard tyres
- **Price**: P Zero can be significantly more expensive

## Michelin vs Continental vs Pirelli: Side-by-Side Comparison

| Criterion | Michelin | Continental | Pirelli |
|---|---|---|---|
| Wet braking | ★★★★★ | ★★★★★ | ★★★★ |
| Dry handling | ★★★★ | ★★★★★ | ★★★★★ |
| Tread life | ★★★★★ | ★★★★ | ★★★ |
| All-season range | ★★★★★ | ★★★★★ | ★★★★ |
| Performance feel | ★★★★ | ★★★★ | ★★★★★ |
| Value per mile | ★★★★★ | ★★★★ | ★★★ |
| OEM fitment (premium) | ★★★★★ | ★★★★★ | ★★★★★ |

## Scotland-Specific Advice

**Glasgow, Edinburgh, Central Belt**: The rain-heavy west and the milder east both demand excellent wet performance. Michelin CrossClimate 2 or Continental AllSeasonContact 2 are the top choices for year-round driving. For summer-only tyres, Continental PremiumContact 7 or Michelin Pilot Sport 5.

**Highlands and rural areas**: Wet performance and all-season capability matter more than maximum dry handling. Michelin CrossClimate 2 is excellent. For drivers who also need winter capability, Continental WinterContact TS870 P (winter) combined with a summer tyre (changed seasonally) is the premium choice.

**Performance car drivers**: Pirelli P Zero (if this is your car's OE fitment and you want the optimal compound), or Michelin Pilot Sport 5 for better wet performance. Continental SportContact 7 if you want stability over feel.

**High-mileage drivers (15,000+ miles/year)**: Michelin. The tread life advantage becomes financially significant at high mileage.

## Getting the Right Tyre Fitted in Scotland

Tyre Rescue can supply and fit Michelin, Continental, and Pirelli tyres across all of Scotland. We source genuine product — not counterfeit or grey-market tyres — and carry the most popular sizes on our vans.

Call **0141 266 0690** or [book online](/book). Give us your registration number and we will confirm availability and quote the total price — tyre plus fitting — before any work begins.

[All-season tyres Scotland](/blog/all-season-tyres-scotland-guide) | [Best tyres for Scottish roads](/blog/best-tyres-scottish-roads-guide) | [Budget tyres Scotland](/blog/best-budget-tyres-scotland-2026)`,
  },
  {
    slug: 'fiat-alfa-romeo-tyre-fitting-scotland',
    title: 'Fiat & Alfa Romeo Tyre Fitting Scotland: 500, Panda, Giulia & Stelvio',
    description:
      'Mobile Fiat and Alfa Romeo tyre fitting across Scotland. Correct tyre sizes for Fiat 500, 500e, Panda, Tipo, Doblo van; Alfa Romeo Giulia, Stelvio, Tonale. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'fiat tyre fitting scotland',
      'alfa romeo tyre fitting scotland',
      'fiat 500 tyres scotland',
      'alfa romeo giulia tyres scotland',
      'alfa romeo stelvio tyres scotland',
      'fiat 500e tyres scotland',
      'mobile fiat tyre fitting glasgow',
      'alfa romeo tonale tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'peugeot-tyre-fitting-scotland',
    ],
    content: `# Fiat & Alfa Romeo Tyre Fitting Scotland: Every Model Covered

Fiat and Alfa Romeo — both part of the Stellantis group — have a combined presence on Scottish roads that is easy to overlook. The Fiat 500 and Panda are city staples in Glasgow and Edinburgh, while Alfa Romeo's Giulia and Stelvio attract buyers who want Italian style with premium performance. Tyre Rescue provides mobile tyre fitting for all Fiat and Alfa Romeo models across Scotland.

## Fiat 500 Tyre Sizes

The Fiat 500 (312, 2007–2023) and 500 Hatchback (332, 2020–present):

| 500 Variant | Tyre Size |
|---|---|
| 500 Pop / Lounge | 185/65R14 or 185/55R15 |
| 500 Sport | 195/45R16 |
| 500 Abarth | 195/45R17 |
| 500 Abarth 595 | 195/45R17 |
| 500C Convertible | 185/55R15 or 195/45R16 |

## Fiat 500e Electric Tyre Sizes

The new Fiat 500e (332, 2020–present) — electric only in new 500 body:

| 500e Variant | Tyre Size |
|---|---|
| 500e Action (24kWh) | 185/65R15 |
| 500e Passion / Icon (42kWh) | 195/55R16 |
| 500e La Prima | 195/55R16 |
| 500e Cabriolet | 195/55R16 |

**500e note**: The electric 500 has no spare wheel. A flat requires immediate mobile fitting. The 500e is a popular city EV in Glasgow and Edinburgh — we carry this tyre size on our Glasgow vans.

## Fiat Panda Tyre Sizes

The Fiat Panda (319, 2011–present) — including Cross and 4x4 variants:

- 175/65R14 (standard)
- 185/65R15 (Cross and 4x4)
- 195/60R16 (some higher trims)

**Panda 4x4 note**: The Panda 4x4 uses 185/65R15 — larger than the standard Panda to accommodate the all-wheel-drive system. Verify the exact size before ordering.

## Fiat Tipo Tyre Sizes

The Fiat Tipo (356, 2015–present) — hatchback, saloon, and estate:

- 195/65R15 (base)
- 205/55R16 (Street / City Cross)
- 215/45R18 (S-Design)

## Fiat Doblo Van Tyre Sizes

The Fiat Doblo (S10, 2022–present) and older Doblo van:

| Doblo Model | Tyre Size |
|---|---|
| Doblo Van (short wheelbase) | 195/75R16C |
| Doblo Van (long wheelbase) | 215/65R16C |
| Doblo Electric Van | 215/65R16C (load index 99+) |

**Doblo van note**: Commercial Doblo vans require C-rated tyres. We carry correct commercial sizes.

## Alfa Romeo Giulia Tyre Sizes

The Alfa Romeo Giulia (952, 2016–present):

| Giulia Trim | Tyre Size |
|---|---|
| Giulia Lusso | 225/55R17 |
| Giulia Sprint | 225/45R18 |
| Giulia Veloce | 225/40R19 |
| Giulia Quadrifoglio | 245/35R19 (front), 285/30R19 (rear) |

**Giulia Quadrifoglio note**: The Quadrifoglio uses a staggered fitment — wider rears. Front and rear tyres must be ordered and fitted separately. Specify whether you need front or rear when calling.

## Alfa Romeo Stelvio Tyre Sizes

The Alfa Romeo Stelvio (949, 2017–present):

| Stelvio Trim | Tyre Size |
|---|---|
| Stelvio Sprint | 235/55R18 |
| Stelvio Veloce | 255/45R19 or 265/40R20 |
| Stelvio Quadrifoglio | 255/35R21 (front), 285/30R21 (rear) |

**Stelvio Quadrifoglio note**: The 255/35R21 and 285/30R21 are very large, low-profile tyres — extremely limited stock availability. Call 0141 266 0690 well before you need them to confirm availability.

## Alfa Romeo Tonale Tyre Sizes

The Alfa Romeo Tonale (965, 2022–present) — PHEV and MHEV:

| Tonale Trim | Tyre Size |
|---|---|
| Tonale Sprint | 225/55R18 |
| Tonale Veloce | 235/50R19 |
| Tonale Quadrifoglio Line | 245/40R20 |
| Tonale PHEV | 235/50R19 (load index 99+) |

**Tonale PHEV note**: The PHEV Tonale requires correct load index — we verify this before every fitting.

## Fiat & Alfa Romeo TPMS Reset

Both brands use Stellantis group TPMS systems:

- **Indirect TPMS (Fiat 500, Panda, Tipo, Doblo)**: Reset via the settings menu — Settings → Safety → Tyre Pressure → Reinitialise
- **Direct TPMS (500e, Alfa Giulia, Stelvio, Tonale)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Stellantis-compatible TPMS reset tools. Reset is included at no additional charge.

## Emergency Fiat & Alfa Romeo Tyre Fitting in Scotland

1. **Fiat 500e**: No spare — call us immediately
2. **Alfa Giulia/Stelvio Quadrifoglio**: No spare on most variants; staggered fitments require care
3. **Fiat 500, Panda**: Often have a space-saver spare or inflation kit
4. **Call 0141 266 0690** — give your registration for instant identification

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Fiat or Alfa Romeo tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Peugeot tyre fitting Scotland](/blog/peugeot-tyre-fitting-scotland) | [Van tyre fitting Scotland](/blog/van-tyre-fitting-scotland)`,
  },
  {
    slug: 'porsche-tyre-fitting-scotland',
    title: 'Porsche Tyre Fitting Scotland: Cayenne, Macan, 911, Taycan & Panamera',
    description:
      'Mobile Porsche tyre fitting across Scotland. Correct tyre sizes for every Porsche model — Cayenne, Macan Electric, 911 (staggered), Taycan, Panamera, Boxster, Cayman. TPMS reset included.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'porsche tyre fitting scotland',
      'porsche cayenne tyres scotland',
      'porsche macan tyres scotland',
      'porsche 911 tyres scotland',
      'porsche taycan tyres scotland',
      'porsche panamera tyres scotland',
      'mobile porsche tyre fitting glasgow',
      'porsche macan electric tyres scotland',
    ],
    relatedSlugs: [
      'run-flat-tyres-scotland-guide',
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
    ],
    content: `# Porsche Tyre Fitting Scotland: Every Model Covered

Porsche is one of the most popular premium car brands in Scottish cities — the Cayenne and Macan are common in Glasgow's West End, Edinburgh's Morningside, and Aberdeen. Porsche vehicles require specific tyre expertise: staggered fitments on 911 and Taycan, run-flat N-rated tyres on many models, and precision tyre specification matching for optimal handling and safety. Tyre Rescue provides specialist mobile Porsche tyre fitting across all of Scotland.

## Porsche Cayenne Tyre Sizes

The Porsche Cayenne (E3, 2018–present):

| Cayenne Trim | Tyre Size |
|---|---|
| Cayenne S | 265/45R20 |
| Cayenne GTS | 285/40R21 or 295/35R22 |
| Cayenne Turbo | 285/40R21 or 295/35R22 |
| Cayenne Turbo GT | 285/35R22 (front), 305/30R22 (rear) |
| Cayenne Coupé | 265/45R20 or 295/35R22 |
| Cayenne E-Hybrid | 265/45R20 (load index 112+) |
| Cayenne Turbo E-Hybrid | 285/40R21 (load index 113+) |

**E-Hybrid note**: The Cayenne E-Hybrid is a very heavy vehicle — load index requirements are high (112+). Never substitute a standard-load tyre on a Cayenne E-Hybrid.

**Cayenne Turbo GT note**: The Turbo GT uses staggered fitments with very large, low-profile rear tyres. Call ahead to confirm stock — this specification is not carried on every van. We will source and deliver for your fitting.

## Porsche Macan Tyre Sizes

The Porsche Macan (95B, 2014–2023):

| Macan Trim | Tyre Size |
|---|---|
| Macan S | 235/55R19 |
| Macan GTS / Turbo | 265/45R20 or 265/40R21 |

**New Porsche Macan Electric (J1, 2024–present)**:
- 235/55R20 (standard)
- 265/40R21 (Turbo / Performance)

**Macan Electric note**: No spare wheel on the Macan Electric. A flat requires immediate mobile fitting. The Macan EV is significantly heavier than the petrol version — load index must be appropriate.

## Porsche 911 Tyre Sizes

The Porsche 911 uses staggered fitments — different front and rear sizes — across almost all variants:

| 911 Variant | Front Tyre | Rear Tyre |
|---|---|---|
| 911 Carrera (992) | 235/40R19 | 295/35R19 |
| 911 Carrera S | 245/35R20 | 305/30R20 |
| 911 Carrera 4S | 245/35R20 | 305/30R20 |
| 911 Turbo S | 255/35R20 | 315/30R21 |
| 911 GT3 | 245/35R21 | 305/30R21 |

**911 staggered fitment note**: Due to the staggered setup, 911 tyres cannot be rotated. When you replace, you order and fit front and rear separately. Always specify which axle when calling us.

The 911 uses N-rated tyres (Pirelli N0, Michelin *, Goodyear F) — tyres specifically tested and approved for Porsche applications. We stock N-rated 911 tyres. Call ahead to confirm stock for your exact specification.

## Porsche Taycan Tyre Sizes

The Porsche Taycan (J1, 2019–present) — fully electric performance saloon:

| Taycan Variant | Front | Rear |
|---|---|---|
| Taycan (base) | 225/55R19 | 275/45R19 |
| Taycan 4S | 245/45R20 | 285/40R20 |
| Taycan Turbo | 255/35R21 | 305/30R21 |
| Taycan Turbo S | 265/35R21 | 305/30R21 |
| Taycan Sport Turismo | Same as saloon equivalents | |
| Taycan Cross Turismo | 265/45R20 (all-terrain option) | |

**Taycan note**: The Taycan has no spare wheel. A flat on a Taycan requires immediate mobile fitting. The Turbo S staggered specification (265/35R21 front, 305/30R21 rear) is a specialist size — call ahead to confirm availability.

## Porsche Panamera Tyre Sizes

The Porsche Panamera (971, 2016–present):

| Panamera Variant | Front | Rear |
|---|---|---|
| Panamera | 245/50R18 or 245/45R19 | 275/40R19 |
| Panamera 4S | 275/35R19 | 305/30R20 |
| Panamera Turbo S | 275/30R21 | 325/25R21 |
| Panamera E-Hybrid | 275/35R19 (load index 100+) | 305/30R20 |

**Panamera Turbo S note**: The 325/25R21 rear tyre is extremely wide and low-profile — stock availability is limited. Call ahead.

## Porsche Boxster & Cayman Tyre Sizes

The Porsche Boxster (982) and Cayman (982):

| Boxster/Cayman Trim | Front | Rear |
|---|---|---|
| 718 Boxster / Cayman | 235/40R19 | 265/40R19 |
| 718 GTS / GT4 | 235/35R20 | 265/35R20 |
| 718 GT4 RS | 235/35R21 | 265/35R21 |

## Porsche TPMS Reset

All Porsche models have direct TPMS — a full diagnostic tool is always required to reset after any tyre change. TPMS resets cannot be done via a button or menu on Porsche models.

Tyre Rescue carries Porsche-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Porsche Tyre Fitting in Scotland

1. **Taycan, Macan Electric**: No spare wheel — call us immediately
2. **Cayenne, Panamera**: May have a space-saver spare — check the boot
3. **911, Boxster, Cayman**: Typically no spare — run-flat N-rated tyres on some models, otherwise call us
4. **Call 0141 266 0690** — give your registration number; we identify Porsche tyre specifications immediately

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

## Why Use Tyre Rescue for Your Porsche?

- **N-rated tyre stock** — we carry N0, N1, N2-rated Pirelli, Michelin, and Goodyear tyres for Porsche models
- **Staggered fitment expertise** — we understand 911, Taycan, Panamera front/rear split specs
- **TPMS reset included** — Porsche TPMS requires diagnostic tool; we carry it for every fitting
- **EV tyre specialists** — correct load index and acoustic tyres for Taycan and Macan Electric
- **All of Scotland** — from your Edinburgh driveway to a Highland hotel car park

Call **0141 266 0690** or [book online](/book) for mobile Porsche tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Audi tyre fitting Scotland](/blog/audi-tyre-fitting-scotland) | [BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland)`,
  },
  {
    slug: 'lexus-tyre-fitting-scotland',
    title: 'Lexus Tyre Fitting Scotland: RX, NX, UX, IS, LC & UX 300e Electric',
    description:
      'Mobile Lexus tyre fitting across Scotland. Correct tyre sizes for every Lexus model — RX 450h+, NX 350h, UX 300e electric, IS, LC, GS. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'lexus tyre fitting scotland',
      'lexus rx tyres scotland',
      'lexus nx tyres scotland',
      'lexus ux tyres scotland',
      'lexus is tyres scotland',
      'lexus ux 300e tyres scotland',
      'mobile lexus tyre fitting glasgow',
      'lexus rx 450h tyres scotland',
    ],
    relatedSlugs: [
      'tpms-warning-light-scotland-guide',
      'electric-vehicle-tyres-scotland',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Lexus Tyre Fitting Scotland: Every Model Covered

Lexus is a premium brand from Toyota with a loyal following in Scotland, particularly among older professional drivers and those who value quiet, refined motoring. The RX and NX hybrid SUVs are the most common Lexus models on Scottish roads, while the UX 300e electric is growing in popularity in Glasgow and Edinburgh. Tyre Rescue provides specialist mobile Lexus tyre fitting across all of Scotland.

## Lexus RX Tyre Sizes

The Lexus RX (AL30, 2022–present):

| RX Variant | Tyre Size |
|---|---|
| RX 350h | 235/55R20 or 235/50R21 |
| RX 450h+ (PHEV) | 235/55R20 (load index 105+) |
| RX 500h | 235/55R20 |

Older Lexus RX (AL20, 2016–2022): 235/55R20 base, 235/50R20 upper trims.

**RX 450h+ PHEV note**: The RX 450h+ plug-in hybrid is significantly heavier than the self-charging hybrid — minimum load index 105 is required.

## Lexus NX Tyre Sizes

The Lexus NX (AZ20, 2021–present):

| NX Variant | Tyre Size |
|---|---|
| NX 250 / 350h | 225/65R17 |
| NX 450h+ (PHEV) | 235/50R18 (load index 97+) or 235/45R20 |

Older NX (AZ10, 2014–2021): 225/65R17 base, 235/50R18 F Sport.

## Lexus UX Tyre Sizes

The Lexus UX (ZA10, 2019–present):

| UX Variant | Tyre Size |
|---|---|
| UX 250h | 215/55R17 |
| UX 250h F Sport | 225/50R18 |

## Lexus UX 300e Electric Tyre Sizes

The Lexus UX 300e (2021–present) — fully electric:

- 215/55R17 (standard — load index 94+)

**UX 300e note**: The electric UX has no spare wheel. A flat requires immediate mobile fitting. The 215/55R17 is a common size — we carry this on every van.

## Lexus IS Tyre Sizes

The Lexus IS (XE30, 2013–present) — sport saloon:

| IS Variant | Tyre Size |
|---|---|
| IS 300h | 215/55R17 |
| IS 300h F Sport | 225/45R18 |
| IS 500 F Sport Performance | 225/40R19 (front), 255/35R19 (rear) |

**IS 500 staggered note**: The IS 500 uses a staggered fitment. Specify front or rear when ordering.

## Lexus ES Tyre Sizes

The Lexus ES (XZ10, 2018–present) — executive saloon:

- 225/55R17 (ES 300h)
- 235/45R18 (F Sport)

## Lexus GS Tyre Sizes

The Lexus GS (L10, 2012–2020 — discontinued but still common):

- 225/45R18 (GS 450h)
- 245/40R18 (F Sport)

## Lexus LC Tyre Sizes

The Lexus LC 500 (Z100, 2017–present) — performance grand tourer:

| LC Variant | Front | Rear |
|---|---|---|
| LC 500 / 500h | 245/40R21 | 275/35R21 |

The LC 500 uses a staggered fitment. Front and rear tyres must be ordered and fitted separately.

## Lexus TPMS Reset

All Lexus models have TPMS. After any tyre change:

- **Indirect TPMS (UX 250h, NX 250, IS base)**: Reset via the multi-information display — Settings → Tyre Pressure Warning → Set Pressure
- **Direct TPMS (RX, NX PHEV, LC, IS F Sport Performance)**: Requires a TPMS diagnostic tool

Tyre Rescue carries Lexus-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Lexus Tyre Fitting in Scotland

1. **UX 300e Electric**: No spare wheel — call us immediately
2. **RX, NX, ES**: May have a space-saver spare in the boot — check before calling
3. **IS, LC**: Check boot for space-saver spare
4. **Call 0141 266 0690** — give your registration number; we identify your Lexus tyre specification immediately

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

## Why Use Tyre Rescue for Your Lexus?

- **Lexus hybrid expertise** — we understand load index requirements for RX 450h+ and NX 450h+ PHEV
- **Premium tyre stock** — Michelin Primacy 4+, Continental PremiumContact 7 for refined Lexus driving
- **TPMS reset included** — Lexus TPMS warnings cleared before we leave
- **Quiet fitting** — our mobile service is ideal for Lexus drivers who appreciate low disruption
- **All of Scotland** — Glasgow, Edinburgh, Aberdeen, Inverness, and beyond

Call **0141 266 0690** or [book online](/book) for mobile Lexus tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Toyota tyre fitting Scotland](/blog/toyota-tyre-fitting-scotland) | [Electric vehicle tyres Scotland](/blog/electric-vehicle-tyres-scotland)`,
  },
  {
    slug: 'jaguar-tyre-fitting-scotland',
    title: 'Jaguar Tyre Fitting Scotland: F-Pace, E-Pace, I-Pace, XE & XF',
    description:
      'Mobile Jaguar tyre fitting across Scotland. Correct tyre sizes for every Jaguar model — F-Pace, E-Pace, I-Pace electric, XE, XF, F-Type. TPMS reset included. All cities covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'jaguar tyre fitting scotland',
      'jaguar f-pace tyres scotland',
      'jaguar i-pace tyres scotland',
      'jaguar e-pace tyres scotland',
      'jaguar xf tyres scotland',
      'jaguar xe tyres scotland',
      'mobile jaguar tyre fitting glasgow',
      'jaguar f-type tyres scotland',
    ],
    relatedSlugs: [
      'run-flat-tyres-scotland-guide',
      'tpms-warning-light-scotland-guide',
      'land-rover-range-rover-tyres-scotland',
    ],
    content: `# Jaguar Tyre Fitting Scotland: Every Model Covered

Jaguar is one of the UK's premium car brands with a significant presence in Scottish cities — the F-Pace is a common sight in Edinburgh's New Town and Glasgow's West End, while the XE and XF appeal to Scottish professionals. Jaguar and Land Rover share the same ownership group (JLR) and many technical similarities. Tyre Rescue provides specialist mobile Jaguar tyre fitting across all of Scotland.

## Jaguar F-Pace Tyre Sizes

The Jaguar F-Pace (X761, 2016–present) — Jaguar's bestselling model:

| F-Pace Trim | Tyre Size |
|---|---|
| F-Pace R-Dynamic S | 235/55R19 |
| F-Pace R-Dynamic SE | 255/50R19 or 265/45R20 |
| F-Pace R-Dynamic HSE | 265/45R20 or 275/40R21 |
| F-Pace SVR | 255/40R21 (front), 285/35R21 (rear) |
| F-Pace P400e PHEV | 255/50R19 (load index 107+) |

**F-Pace SVR note**: Staggered fitment — wider rears. Specify front or rear when ordering.

**PHEV note**: The F-Pace P400e plug-in hybrid requires minimum load index 107 on most configurations.

## Jaguar E-Pace Tyre Sizes

The Jaguar E-Pace (X540, 2018–present):

| E-Pace Trim | Tyre Size |
|---|---|
| E-Pace S / SE | 235/55R18 or 235/50R19 |
| E-Pace HSE | 235/50R20 |
| E-Pace R-Dynamic S | 235/55R18 |
| E-Pace P300e PHEV | 235/55R18 (load index 100+) |

## Jaguar I-Pace Electric Tyre Sizes

The Jaguar I-Pace (X590, 2018–present) — fully electric performance SUV:

| I-Pace Variant | Front | Rear |
|---|---|---|
| I-Pace EV400 SE | 245/45R20 | 245/45R20 (square fitment) |
| I-Pace EV400 HSE | 255/40R20 | 285/40R20 (staggered) |
| I-Pace EV400 S | 245/45R20 | 245/45R20 |

**I-Pace note**: The HSE variant uses a staggered fitment. The base/SE uses a square fitment (same size front and rear, which can be rotated). Confirm your trim before ordering.

The I-Pace has no spare wheel. A flat requires immediate mobile fitting. The I-Pace weighs approximately 2.2 tonnes — load index requirements are high.

## Jaguar XE Tyre Sizes

The Jaguar XE (X760, 2015–present) — compact executive saloon:

| XE Trim | Tyre Size |
|---|---|
| XE SE | 225/55R17 |
| XE R-Dynamic SE | 225/45R18 |
| XE R-Dynamic HSE | 245/40R19 |
| XE P300 AWD | 245/40R18 |
| XE SV Project 8 | 265/35R19 (front), 305/30R20 (rear) |

## Jaguar XF Tyre Sizes

The Jaguar XF (X260, 2015–present) — executive saloon and Sportbrake estate:

| XF Trim | Tyre Size |
|---|---|
| XF SE | 235/50R18 |
| XF R-Dynamic SE | 245/40R19 or 255/35R20 |
| XF R-Dynamic HSE | 255/35R20 |
| XF Sportbrake | 235/55R18 or 245/40R19 |

## Jaguar F-Type Tyre Sizes

The Jaguar F-Type (X152, 2013–present) — rear-wheel and all-wheel drive sports car:

| F-Type Variant | Front | Rear |
|---|---|---|
| F-Type P300 | 245/40R18 | 275/35R18 |
| F-Type P450 R | 265/35R19 | 305/30R20 |
| F-Type P575 R | 265/35R19 | 305/30R20 |

**F-Type note**: The F-Type uses staggered fitments across all variants. Specify front or rear. High-performance summer tyres — Pirelli P Zero or Michelin Pilot Sport 4S as OE. For year-round Scottish use, we can advise on winter/all-season alternatives in the correct specification.

## Jaguar TPMS Reset

All Jaguar models have direct TPMS — a diagnostic tool is always required. Unlike some brands, Jaguar TPMS cannot be reset via a button or infotainment menu.

Tyre Rescue carries JLR-compatible TPMS reset tools. Reset is included at no additional charge with every fitting.

## Emergency Jaguar Tyre Fitting in Scotland

1. **I-Pace Electric**: No spare wheel — call us immediately
2. **F-Pace, E-Pace**: May have a space-saver spare or inflation kit — check the boot
3. **XE, XF, F-Type**: May have a run-flat (check for Jaguar run-flat marking on tyre sidewall) or a space-saver spare
4. **Call 0141 266 0690** — give your registration number; we identify your Jaguar's tyre specification immediately

Response times: Glasgow 25–40 min, Edinburgh 50–65 min, Aberdeen ~90 min.

Call **0141 266 0690** or [book online](/book) for mobile Jaguar tyre fitting at your location.

[Mobile tyre fitting Scotland](/mobile-tyre-fitting) | [Land Rover and Range Rover tyres Scotland](/blog/land-rover-range-rover-tyres-scotland) | [Audi tyre fitting Scotland](/blog/audi-tyre-fitting-scotland)`,
  },
  {
    slug: 'tyre-prices-scotland-guide-2026',
    title: 'Tyre Prices Scotland 2026: How Much Do Tyres Cost?',
    description:
      'How much do tyres cost in Scotland in 2026? Complete price guide — budget, mid-range, and premium brands. Mobile fitting costs, emergency callout fees, puncture repair prices. Updated September 2026.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 8,
    featured: false,
    keywords: [
      'tyre prices scotland',
      'how much do tyres cost scotland',
      'tyre fitting cost glasgow',
      'cheap tyres glasgow',
      'tyre prices 2026 scotland',
      'average tyre cost scotland',
      'mobile tyre fitting cost scotland',
      'budget tyre prices scotland',
    ],
    relatedSlugs: [
      'best-budget-tyres-scotland-2026',
      'best-tyres-scottish-roads-guide',
      'michelin-vs-continental-vs-pirelli-scotland',
    ],
    content: `# Tyre Prices Scotland 2026: Complete Price Guide

Wondering how much you should pay for new tyres in Scotland? Tyre costs vary enormously depending on the size, brand tier, and type of service you need. This guide gives honest price ranges for Scottish drivers, updated for September 2026.

## Summary: Typical Tyre Costs in Scotland (2026)

| Size Category | Budget | Mid-Range | Premium |
|---|---|---|---|
| Small car (175/65R14, 185/65R15) | £35–£55 | £55–£85 | £80–£120 |
| Medium car (205/55R16) | £45–£70 | £70–£100 | £95–£150 |
| Large car / SUV (225/45R17) | £60–£90 | £90–£130 | £120–£180 |
| Large SUV (235/55R18) | £75–£110 | £110–£160 | £150–£220 |
| Premium SUV (255/45R20+) | £100–£150 | £150–£200 | £200–£300+ |
| Performance tyre (245/35R19+) | £90–£130 | £130–£200 | £200–£350+ |
| Van tyre (215/65R16C) | £70–£100 | £100–£140 | £140–£200 |

*Prices are per tyre, supply only. Fitting fees are additional (see below).*

## Fitting Fees in Scotland

**Mobile tyre fitting fee**: from £20 per tyre
- This covers the fitting, balancing, and TPMS reset
- No garage overheads means our fitting fees are competitive with fixed garages
- Both tyres on an axle are fitted for the price of two individual fees

**Emergency callout**: from £49
- Confirmed before dispatch — you know the full cost before we arrive
- Applies on top of the per-tyre fitting fee
- Same rate day and night — no night-time premium with Tyre Rescue

**Puncture repair**: from £25
- Only where the tyre is legally repairable (no damage within 25mm of the shoulder, hole diameter below 6mm)
- Includes pressure check and rebalance after repair

## Why Mobile Tyre Fitting Costs More Than a Garage — And Why It's Worth It

A fixed garage typically charges a fitting fee of £8–£15 per tyre. Our mobile fitting fee starts from £20. The difference buys you:

- **Your time** — no drive to a garage, no wait, no drive back. If an hour of your time is worth £20+, mobile fitting already pays for itself.
- **Vehicle downtime** — for a flat tyre, mobile fitting gets you back on the road without a tow truck (£150–£300 for roadside recovery in Scotland).
- **Convenience** — fitting happens at your home, office, or roadside. No disruption to your day.
- **Emergency premium** — we dispatch to your location within 25–100 minutes depending on where in Scotland you are.

## Budget Tyre Brands in Scotland

Budget tyres (£35–£100 per tyre depending on size) offer acceptable safety for everyday driving. Reputable budget brands available in Scotland:

- **Falken** — Japanese brand, strong value
- **Hankook** — Korean brand, very popular in Scotland
- **Nexen** — Korean brand, particularly good for wet performance at budget price
- **Toyo** — Japanese brand, solid all-rounder
- **Landsail / Linglong** — Chinese brands, use only if budget is extremely tight; premium brands are safer

**When budget tyres are appropriate**:
- Very low annual mileage (under 5,000 miles/year)
- Older vehicles where the car's value is low
- Rental properties with communal vehicles

**When budget tyres are NOT appropriate**:
- High-performance cars (GTI, N, ST, AMG, M Sport, RS models) — handling is noticeably affected
- PHEVs and EVs where load index is critical
- Highland and rural driving where wet performance matters most

## Mid-Range Tyre Brands in Scotland

Mid-range tyres (£55–£160 per tyre) offer the best value for most Scottish drivers:

- **Goodyear EfficientGrip / Vector**: Reliable all-season performer
- **Bridgestone Turanza / Ecopia**: Solid choice for family cars
- **Dunlop Sport BluResponse**: Good wet performance
- **Firestone Roadhawk**: Budget from the Bridgestone stable — often excellent value

## Premium Tyre Brands in Scotland

Premium tyres (£80–£300+ per tyre) offer the best wet braking, tread life, and handling:

- **Michelin Pilot Sport 5 / CrossClimate 2 / Primacy 4+**: Best all-round choice
- **Continental PremiumContact 7 / AllSeasonContact 2**: Exceptional wet braking
- **Pirelli P Zero / Cinturato P7**: OEM choice for sports and premium cars
- **Bridgestone Potenza Sport**: Performance cars

## Price Examples: Common Cars in Scotland (September 2026)

| Vehicle | Tyre Size | Budget Price | Premium Price |
|---|---|---|---|
| Ford Fiesta (popular size) | 185/60R15 | £40 | £85 |
| VW Golf Mk8 | 205/55R16 | £45 | £100 |
| Nissan Qashqai | 225/55R18 | £75 | £155 |
| BMW 3 Series | 225/45R17 | £65 | £140 |
| Kia Sportage | 235/55R18 | £80 | £160 |
| Tesla Model 3 | 235/45R18 | £75 | £150 |
| Land Rover Discovery Sport | 235/55R19 | £95 | £195 |
| BMW X5 | 255/50R19 | £110 | £220 |

*All prices are approximate and subject to confirmation. Call 0141 266 0690 for your exact quote.*

## Getting the Total Cost Right

When budgeting for tyre replacement in Scotland, the total cost is:

**Tyre price + fitting fee [+ emergency callout if applicable]**

Example: Replacing both rear tyres on a Qashqai (225/55R18):
- 2 × mid-range tyres (e.g., Goodyear): 2 × £115 = £230
- 2 × mobile fitting fee: 2 × £20 = £40
- **Total: £270** — fitted at your home, including balancing and TPMS reset

Compare this to a fixed garage:
- Same tyres: £230
- 2 × fitting fee (at garage prices): 2 × £12 = £24
- Total: £254
- **But**: you need to drive to the garage and wait (time cost), plus arrange transport if the tyre is flat (recovery van £150–£300)

## When to Get a Quote

Tyre Rescue gives you a full itemised quote over the phone before we dispatch. We confirm:
- Tyre brand, size, and price
- Fitting fee
- Any emergency callout charge
- ETA to your location

No surprises when we arrive.

Call **0141 266 0690** or [book online](/book) to get your tyre price and fitting quote for anywhere in Scotland.

[Pricing guide](/pricing) | [Best budget tyres Scotland](/blog/best-budget-tyres-scotland-2026) | [Michelin vs Continental vs Pirelli](/blog/michelin-vs-continental-vs-pirelli-scotland)`,
  },
  {
    slug: 'mobile-tyre-fitting-glasgow-guide',
    title: 'Mobile Tyre Fitting Glasgow: Response Times, Prices & Coverage',
    description:
      'Mobile tyre fitting across all of Glasgow — home, office, car park, or roadside. Response times by area, prices, and coverage from G1 to G78. Emergency callout 24/7. Call 0141 266 0690.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 8,
    featured: true,
    keywords: [
      'mobile tyre fitting glasgow',
      'tyre fitting glasgow',
      'mobile tyre fitter glasgow',
      'emergency tyre fitting glasgow',
      'flat tyre glasgow',
      'tyre fitting near me glasgow',
      'cheap tyre fitting glasgow',
      '24 hour tyre fitting glasgow',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-edinburgh-guide',
      'emergency-tyre-fitting-guide',
      'mobile-tyre-fitting-vs-garage',
    ],
    content: `# Mobile Tyre Fitting Glasgow: Your Complete Guide

Glasgow is Tyre Rescue's home city — our operations are based here, and we cover every corner of Greater Glasgow faster than anywhere else in Scotland. Whether you're on the M8 at midnight or your tyre has gone down on your driveway in Bearsden, we come to you.

## Response Times in Glasgow

Response time depends on your precise location and current fitter availability. These are typical times:

| Glasgow Area | Typical Response |
|---|---|
| City centre (G1–G5, G11–G14) | 20–35 min |
| West End (G11, G12, G13) | 25–40 min |
| Southside (G41, G42, G43, G44) | 25–40 min |
| East End (G31, G32, G33, G40) | 25–40 min |
| North Glasgow (G20, G21, G22) | 30–45 min |
| Paisley / Renfrewshire (PA1–PA5) | 30–45 min |
| Bearsden / Milngavie (G61, G62) | 35–50 min |
| Newton Mearns (G77) | 30–45 min |
| Rutherglen / Cambuslang (G73) | 30–45 min |
| M8 motorway | 20–40 min (hard shoulder or junction layby) |
| M77 motorway | 25–40 min |
| M74 motorway | 25–40 min |

## Glasgow Postcodes We Cover

We cover all Greater Glasgow postcodes:

**G1–G5**: City centre, Merchant City, Anderston, Laurieston
**G11–G14**: Partick, Whiteinch, Scotstoun, Hyndland
**G12**: Hillhead, Kelvinside, Great Western Road
**G13**: Knightswood, Jordanhill, Broomhill
**G20–G22**: Maryhill, Ruchill, Springburn, Possilpark
**G23–G24**: Cadder, Bishopbriggs approach routes
**G31–G33**: Dennistoun, Shettleston, Baillieston
**G40–G45**: Bridgeton, Rutherglen approach, Castlemilk, Kings Park, Croftfoot
**G51–G53**: Govan, Ibrox, Cardonald, Mosspark
**G60–G62**: Erskine, Dalmuir, Dumbarton approach, Bearsden, Milngavie
**G66**: Kirkintilloch, Lenzie
**G71–G73**: Bothwell, Uddingston, Rutherglen, Cambuslang
**G74**: East Kilbride
**G77–G78**: Newton Mearns, Barrhead, Neilston

Also covering PA1–PA5 (Paisley, Renfrew), PA6–PA7 (Johnstone, Bridge of Weir).

## Common Glasgow Callout Locations

These are among our most frequent Glasgow callout locations:

**Motorways and dual carriageways**:
- M8 (from Junction 1 at St Enoch to Junction 29 at Bishopton)
- M77 (from Polmadie interchange to Malletsheugh)
- M74 (from Tollcross to Uddingston)
- M73 (Shawhead to Moodiesburn)
- A8 Expressway (Charing Cross to Greenock direction)
- Great Western Road (A82)

**Car parks**:
- Buchanan Galleries multi-storey
- St Enoch Centre car park
- NCP Waterloo Street
- SECC / SEC car parks
- Braehead Shopping Centre
- Silverburn Shopping Centre
- Glasgow Airport long-stay and short-stay

**Hotels and venues**:
- Erskine Bridge Hotel area
- Radisson Blu, Glasgow city centre
- Hilton Glasgow

## Glasgow Tyre Fitting Prices

All prices are subject to confirmation before dispatch. Guide prices for Glasgow:

| Service | Price |
|---|---|
| Mobile tyre fitting (per tyre) | from £20 |
| Emergency callout fee | from £49 |
| Puncture repair | from £25 |
| Budget tyres (175/65R14, 185/65R15) | from £35 |
| Mid-range tyres (205/55R16) | from £65 |
| Premium tyres (205/55R16, Michelin) | from £95 |
| Van tyres (215/65R16C) | from £80 |

We give you the full total — tyre, fitting, and callout — before we dispatch. No hidden fees.

## Glasgow's Most Common Tyre Problems

Our Glasgow callouts most commonly involve:

**Pothole damage** — Glasgow roads, particularly on the south side and around the M74 corridor, are notoriously hard on tyres. Pothole impacts at speed can cause sidewall bulges, cracked alloys, and internal tyre damage. If you have hit a pothole on a Glasgow road, you may be able to claim compensation from Glasgow City Council — read our [pothole damage guide](/blog/pothole-damage-tyres-scotland).

**Slow punctures** — nails, screws, and glass from Glasgow's city roads are a common cause. Many slow punctures can be repaired if the damage is in the central tread zone.

**Flat tyres in car parks** — a common callout, particularly from Silverburn, Braehead, and city centre multi-storeys. We come to your bay.

**Motorway blowouts** — the M8 and M74 are our most common motorway callout routes.

## What to Do When You Have a Flat Tyre in Glasgow

1. **Move your vehicle to a safe location** — if on the M8 or M74, use the hard shoulder. If in the city, pull into a car park or side street if possible.
2. **Turn on your hazard lights** immediately.
3. **Do not drive on a completely flat tyre** — it will destroy the wheel rim.
4. **Call 0141 266 0690** — we answer 24/7. Give your postcode or nearest landmark and your vehicle registration.
5. **For motorway breakdowns**, stand well away from the vehicle behind the Armco barrier until we arrive.

## Booking Mobile Tyre Fitting in Glasgow

**Emergency (immediate need)**: Call 0141 266 0690. We will give you an ETA and quote immediately.

**Scheduled (planned fitting)**: [Book online](/book) — choose your date, time, and location. We will confirm your tyre and arrive at the agreed time. Great for home, office, or planned replacements.

**WhatsApp**: Message us via WhatsApp for non-emergency enquiries and quotes.

## Why Glasgow Drivers Choose Tyre Rescue

- **Based in Glasgow** — we cover the city faster than any Scotland-wide service
- **No garage visit** — we come to your home, workplace, or roadside
- **24/7 availability** — including 2am M8 callouts and Christmas Day
- **Transparent pricing** — full quote before we dispatch, every time
- **TPMS reset included** — no warning lights left on your dashboard
- **Old tyre recycled** — we take the old tyre away for proper disposal

Call **0141 266 0690** or [book online](/book) for mobile tyre fitting anywhere in Glasgow.

[All Glasgow service areas](/mobile-tyre-fitting/glasgow) | [Emergency tyre fitting Glasgow](/emergency-tyre-fitting-near-me) | [24 hour tyre fitting](/24-hour-tyre-fitting)`,
  },
  {
    slug: 'tyre-buying-guide-scotland',
    title: 'How to Choose the Right Tyres for Your Car in Scotland: Complete Guide',
    description:
      'How to choose the right tyres for your car in Scotland. Speed ratings, load index, size markings, brand comparison, seasonal tyre advice — everything you need to make the right choice.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 12,
    featured: false,
    keywords: [
      'how to choose tyres scotland',
      'tyre buying guide scotland',
      'choosing the right tyre scotland',
      'what tyres do i need scotland',
      'tyre size explained scotland',
      'speed rating tyre scotland',
      'load index tyre scotland',
      'best tyre for my car scotland',
    ],
    relatedSlugs: [
      'how-to-read-tyre-size-markings',
      'best-tyres-scottish-roads-guide',
      'all-season-tyres-scotland-guide',
    ],
    content: `# How to Choose the Right Tyres for Your Car in Scotland

Choosing tyres can feel overwhelming — there are hundreds of options, confusing size markings, and strong opinions about brands. This guide cuts through the noise and helps you choose the right tyres for your car, your budget, and Scottish driving conditions.

## Step 1: Find Your Correct Tyre Size

Before you buy anything, you need the right size. There are three ways to find it:

**1. Look at your current tyre sidewall** — the size is printed there, like: **205/55 R16 91V**

**2. Check the sticker inside your driver's door** — most cars have this, listing recommended tyre sizes and pressures.

**3. Check your vehicle handbook** — specifies exact tyre requirements for your trim level.

**Understanding the tyre size code** (using 205/55 R16 91V as example):
- **205** — tyre width in mm
- **55** — aspect ratio (tyre height as % of width) — lower number = lower-profile tyre
- **R** — radial construction (all modern tyres)
- **16** — wheel rim diameter in inches
- **91** — load index (see below)
- **V** — speed rating (see below)

## Step 2: Confirm the Load Index

The load index (the number before the speed rating letter) tells you the maximum weight each tyre can carry. It must meet or exceed your vehicle manufacturer's requirement.

**Never fit a lower load index than specified** — this is illegal and dangerous.

| Load Index | Max Load per Tyre |
|---|---|
| 87 | 545 kg |
| 91 | 615 kg |
| 95 | 690 kg |
| 99 | 775 kg |
| 103 | 875 kg |
| 107 | 975 kg |
| 113 | 1150 kg |

**When load index matters most**: PHEVs (plug-in hybrids), EVs, large SUVs, and vans all require higher load indices than equivalent petrol cars due to battery or payload weight. Tyre Rescue always confirms load index before fitting any replacement.

## Step 3: Confirm the Speed Rating

The speed rating letter indicates the maximum sustained speed. Must match or exceed your vehicle's maximum capability.

| Rating | Max Speed |
|---|---|
| H | 210 km/h (130 mph) |
| V | 240 km/h (149 mph) |
| W | 270 km/h (168 mph) |
| Y | 300 km/h (186 mph) |
| ZR | Above 240 km/h (vehicles must use W or Y) |

**In practice**: Most Scottish cars need H or V rated tyres. For performance cars (BMW M, Audi RS, Mercedes AMG), W or Y may be specified. Never go lower than your vehicle requires.

## Step 4: Choose Your Tyre Season Type

Scotland's climate means this decision is important.

### Option A: Summer Tyres + Winter Tyre Change

Two sets of tyres, stored seasonally. Best performance year-round. More hassle and cost up-front but often the best choice for:
- Highland drivers
- Performance car owners
- Anyone who prioritises maximum safety in each season

### Option B: All-Season Tyres (Year-Round)

One set of tyres that works acceptably in all conditions. Best for:
- Glasgow, Edinburgh, and Central Belt city drivers
- Low-to-medium mileage drivers
- Anyone who wants simplicity without compromising safety

**Look for the Three Peak Mountain Snowflake (3PMSF) symbol** — mandatory for a genuine all-season tyre.

### Option C: Summer Tyres Only

Acceptable for:
- Very low mileage (under 5,000 miles/year)
- Drivers who genuinely never drive in cold/wet conditions
- NOT recommended for most Scottish drivers

## Step 5: Choose Your Brand Tier

### Budget Tyres (£35–£100 per tyre)
Good for: Low mileage, older vehicles, extreme budget constraints.
Reputable brands: Falken, Hankook, Nexen, Toyo.
Avoid on: Performance cars, EVs, large SUVs, vehicles where load index is critical.

### Mid-Range Tyres (£55–£160 per tyre)
Best value for most Scottish drivers. Strong safety margins, good wear.
Brands: Goodyear, Bridgestone, Dunlop, Firestone, Nokian.

### Premium Tyres (£80–£300+ per tyre)
Best safety, longest life, best wet grip.
Brands: Michelin, Continental, Pirelli, Bridgestone Potenza.
Worth choosing for: Performance cars, EVs/PHEVs, high-mileage drivers, safety-conscious drivers.

## Step 6: Consider Scottish-Specific Factors

**Wet performance matters most** — Scotland has some of the UK's highest rainfall. On Glasgow's streets, wet braking is more important than dry handling. Continental PremiumContact 7 and Michelin Pilot Sport 5 consistently lead wet braking tests.

**Tread life** — Scottish roads are rougher than English motorways, particularly north of Perth. Michelin tends to outlast other brands in tread life tests — worth the price premium if you drive 10,000+ miles/year.

**Winter vs all-season** — see our [detailed all-season vs winter tyre guide](/blog/all-season-tyres-scotland-guide).

**Run-flat tyres** — many premium cars (BMW, Mercedes, some Audi) are fitted with run-flat tyres from the factory. If your car uses run-flats, replacements must also be run-flat tyres (with the correct RSC, EMT, or SSR marking).

**EV and PHEV tyres** — higher load index required, often acoustic foam-lined for noise reduction. Our [EV tyre guide](/blog/electric-vehicle-tyres-scotland) covers this in detail.

## Step 7: Know the Rules on Mixing Tyres

**You can mix brands** across axles — perfectly legal. However:

- **Never mix radial and cross-ply** tyres on the same vehicle (this hasn't been an issue since the 1980s, but worth knowing)
- **Never fit different speed ratings** below the manufacturer's requirement
- **Never fit different load indices** below the manufacturer's requirement
- **On AWD vehicles** (Subaru, Audi Quattro, BMW xDrive), matching tyres or near-identical tread depth on all four wheels is strongly recommended to avoid AWD system stress
- **Best practice**: Replace in pairs (both tyres on an axle) — never just one, unless it's a puncture repair

## Step 8: Buy at the Right Time

**Best time to buy tyres in Scotland**:
- **August–September**: Before winter demand spikes; good availability of winter and all-season stock
- **March–April**: After winter; summer tyre availability is excellent, good deals on remaining winter stock

**Worst time**: October–November — winter tyre demand is high, stock runs low on popular sizes.

## Getting the Right Tyres Fitted in Scotland

Tyre Rescue can source and fit any of the tyres described in this guide, at your home, workplace, or roadside across all of Scotland. We confirm the correct specification — size, load index, speed rating, and season type — before fitting any tyre.

Call **0141 266 0690** or [book online](/book). Give us your vehicle registration and tell us what you need — we will quote the full price and arrange fitting at your convenience.

[Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026) | [All-season tyres guide](/blog/all-season-tyres-scotland-guide) | [Michelin vs Continental vs Pirelli](/blog/michelin-vs-continental-vs-pirelli-scotland)`,
  },
  {
    slug: 'mg-motor-tyre-fitting-scotland',
    title: 'MG Motor Tyre Fitting Scotland: MG4, MG ZS, MG5, MG HS Guide',
    description:
      'Mobile tyre fitting for MG Motor vehicles in Scotland. MG4 EV tyre sizes, MG ZS EV, MG5 EV, MG HS PHEV load index requirements, TPMS reset, and no-spare-wheel guidance.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'MG4 tyre size scotland',
      'MG ZS EV tyre fitting scotland',
      'MG motor tyres scotland',
      'MG4 tyre replacement scotland',
      'MG5 tyre fitting scotland',
      'MG HS tyre fitting scotland',
      'mobile tyre fitting MG scotland',
      'MG4 EV flat tyre scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'tyre-prices-scotland-guide-2026',
      'tpms-warning-light-scotland-guide',
    ],
    content: `# MG Motor Tyre Fitting Scotland

MG Motor's electric and plug-in hybrid range has rapidly become one of Scotland's most popular EV choices, with the MG4 EV consistently ranking among the UK's best-selling electric cars. As Scotland's mobile tyre fitting specialists, we stock and fit tyres for the full MG range across Glasgow, Edinburgh, Aberdeen, and all of Scotland.

## MG4 EV Tyre Guide (2022–present)

The MG4 EV is available in Standard Range, Long Range, and Trophy/Xpower variants. All share broadly similar tyre specifications but differ in wheel size:

| MG4 Variant | Tyre Size | Wheel |
|---|---|---|
| Standard Range 51kWh | 215/55R17 | 17" |
| Long Range 64kWh | 235/45R18 | 18" |
| Trophy Long Range | 235/45R18 | 18" |
| Xpower Dual Motor | 235/45R18 | 18" |

**Load index**: 98+ required on most MG4 variants due to battery weight. Do not fit 94 or lower.

**No spare wheel** — the MG4 EV does not carry a spare tyre. SAIC/MG supply a tyre inflation kit for minor punctures, but this cannot repair sidewall damage or large punctures. If your MG4 has a flat tyre that cannot be inflated, call Tyre Rescue immediately — do not drive on the damaged tyre.

**TPMS** — the MG4 uses an indirect TPMS (it calculates pressure from wheel speed differences). After fitting new tyres, TPMS is reset via: Settings > Vehicle > TPMS Reset (with the vehicle stationary). If the warning light persists after reset, drive at 20–30 mph for a few minutes and it should clear.

## MG ZS EV Tyre Guide (2019–present)

| MG ZS EV Variant | Tyre Size | Wheel |
|---|---|---|
| ZS EV Standard (pre-2022) | 215/55R17 | 17" |
| ZS EV Long Range (2022+) | 215/55R17 or 215/50R18 | 17" or 18" |
| ZS EV Trophy (2022+) | 215/50R18 | 18" |

**No spare wheel** — same as MG4. Inflation kit only. Call us for any non-repairable puncture.

**Load index**: 98+ recommended for all ZS EV variants.

## MG5 EV Tyre Guide (2021–present)

The MG5 is a battery-electric estate car — unique in its segment.

| MG5 EV Variant | Tyre Size |
|---|---|
| MG5 EV Standard Range | 215/55R16 |
| MG5 EV Long Range | 215/55R17 |
| MG5 EV Trophy Long Range | 215/55R17 |

**Load index**: 98+ required. **No spare wheel** — inflation kit supplied.

## MG HS Tyre Guide (Including PHEV)

| MG HS Variant | Tyre Size | Load Index Note |
|---|---|---|
| HS 1.5T petrol (2019–2022) | 215/55R18 | 95+ |
| HS 1.5T petrol (2022+) | 235/45R19 | 99+ |
| HS PHEV (plug-in hybrid) | 235/45R19 | 101+ required |
| HS Trophy PHEV | 235/45R19 | 101+ |

**PHEV load index**: the MG HS PHEV carries a significantly heavier battery pack than the standard petrol HS. Always use a minimum load index of 101 on the HS PHEV — do not fit standard-rated 95 or 99 tyres.

**HS does carry a spare** — a full-size spare or space-saver depending on trim level and year. Confirm with your handbook.

## MG Cyberster Tyre Guide (2024–present)

The MG Cyberster is MG's electric roadster, using staggered fitment:

- **Front**: 245/45R20
- **Rear**: 275/40R20

Staggered fitment means front and rear tyres are different sizes and **cannot be rotated**. Specify which axle needs replacement when calling. The Cyberster also uses direct TPMS sensors — replacement of a sensor requires a diagnostic reset.

## MG TPMS Reset Procedure

For most MG models (MG4, ZS EV, MG5, HS):
1. Inflate all tyres to the correct pressure (sticker inside driver's door)
2. Sit in the vehicle with ignition on
3. Navigate to: **Settings > Vehicle > TPMS Reset**
4. Confirm reset
5. Drive at 20+ mph for 5–10 minutes for the system to calibrate

If TPMS warning persists after the above, the sensor may need physical inspection. Call us — we carry replacement TPMS sensors for common MG sizes.

## Why MG Tyres Are Different

MG EVs are heavier than equivalent petrol cars (the MG4 Long Range weighs approximately 1,750 kg vs 1,200 kg for a comparable petrol hatchback). This heavier kerb weight:
- Requires higher load-index tyres
- Increases wear rate — expect 20–30% shorter tyre life than an equivalent petrol car
- Demands better wet-grip performance to stop the heavier mass

Our tyre recommendation for MG4 and MG ZS EV owners: **Michelin Pilot Sport EV** (specifically designed for EVs, OE fitment on many MG models), or **Continental EcoContact 6** (excellent efficiency and wet grip for Scottish rain).

## Book Mobile Tyre Fitting for Your MG in Scotland

Tyre Rescue carries MG4, ZS EV, and MG5 tyre sizes as standard van stock. Call **0141 266 0690** or [book online](/book) — we cover all of Scotland 24 hours a day.

[EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026) | [TPMS warning light guide](/blog/tpms-warning-light-scotland-guide)`,
  },
  {
    slug: 'used-tyres-scotland-are-they-safe',
    title: 'Used Tyres in Scotland: Are They Safe? What You Need to Know',
    description:
      'Secondhand tyres are legal but carry hidden risks — previous impacts, invisible internal damage, and unknown age. This guide explains the real risks of used tyres in Scotland and what to check before buying.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 5,
    featured: false,
    keywords: [
      'used tyres scotland',
      'secondhand tyres scotland',
      'are used tyres safe scotland',
      'second hand tyres glasgow',
      'part worn tyres scotland',
      'part worn tyre risks scotland',
      'buying used tyres scotland',
      'cheap used tyres scotland',
    ],
    relatedSlugs: [
      'tyre-age-limit-scotland',
      'budget-tyres-scotland-guide',
      'tyre-sidewall-damage-scotland',
    ],
    content: `# Used Tyres in Scotland: Are They Safe? What You Need to Know

Part-worn (used) tyres are widely available in Scotland — from eBay and Facebook Marketplace to small independent tyre shops. At £15–£30 each, they appear to offer significant savings.

The reality: part-worn tyres are legal but carry serious hidden risks that the tread depth alone cannot reveal.

---

## Are Part-Worn Tyres Legal in Scotland?

Yes — selling and fitting part-worn tyres is legal in the UK, provided they meet specific requirements under the Motor Vehicle Tyres (Safety) Regulations 1994:

- Tread depth must be at least **2mm** across the central three-quarters width
- No bulges, cuts that expose cord, or damage visible to the naked eye
- The tyre must be marked with "PART WORN" in letters at least 4mm high

**The enforcement problem**: Trading Standards investigations have repeatedly found that the majority of part-worn tyres sold in the UK do not meet even these minimum legal requirements. A 2014 TyreSafe investigation found that **98% of part-worn tyres examined had at least one dangerous defect**. A 2021 follow-up found similar results.

---

## The Hidden Risks of Used Tyres

### You Cannot See Internal Damage

A tyre that has been driven at low pressure, impacted by a pothole, or involved in a minor collision may have internal damage — delamination of the ply cords, broken internal beads, or partial sidewall tears — that is completely invisible from the outside.

When this internal damage causes a blowout at 70mph on the M8, the visual inspection you did before fitting the tyre tells you nothing about why it failed.

### Unknown History

A used tyre could have:
- Been driven flat (destroying internal structure)
- Been repaired with an illegal plug-only repair (now concealed inside)
- Been run significantly over- or under-inflated for years
- Experienced a kerb strike that compressed the sidewall bead area
- Already reached maximum repair zone repairs

None of this is visible once the tyre is cleaned up for resale.

### Unknown Age

Unless you can read and verify the DOT code on the tyre (and trust that the code has not been sanded off, which does happen), you do not know how old a used tyre is. A tyre that is 9 years old with 4mm of tread can look almost new but be approaching the end of its safe service life.

### No Quality Guarantee

New tyres from reputable brands come with manufacturer guarantees against defects. A used tyre has no guarantee, no warranty, and no recourse if it fails.

---

## The Actual Cost Comparison

Used tyres appear cheap at £15–£30 each. But consider the full picture:

**Used tyre scenario**: 4 × used 205/55R16 at £25 each = £100 + £20 per tyre fitting = £180 total. Average life remaining: 3,000–8,000 miles (usually purchased when worn to 3–4mm).

**New budget tyre scenario**: 4 × Nankang NS-2 205/55R16 at ~£45 each = £180 + £20 per tyre fitting = £260 total. Expected life: 18,000–25,000 miles. Cost per mile: significantly lower.

The "saving" on used tyres is often smaller than it appears, and disappears entirely when you account for shorter remaining tread life.

---

## If You Are Considering Used Tyres: Minimum Checks

If cost is genuinely the primary constraint, these are the minimum checks to perform before fitting any used tyre:

1. **Read the DOT code**: locate the four-digit date code on the sidewall. Reject any tyre manufactured more than 6 years ago.

2. **Check all four sidewall areas**: inner and outer, with good light and hands. Feel for any soft spots, bulges, or ridges. Reject anything that has any of these.

3. **Check the tread depth at the inner edge, centre, and outer edge**: if there is uneven wear (more than 2mm difference across the width), reject it — this tyre was run on a misaligned axle and the internal structure may be compromised.

4. **Look for repair plugs**: remove the tyre from the wheel and inspect the inside with a torch. Any visible plug-only repair (without an internal patch) means the tyre has been illegally repaired. Reject it.

5. **Do not accept any tyre where the seller cannot tell you why it was removed**: if they say "just replaced for new" that is plausible. If they cannot or will not say, reject it.

---

## Our Recommendation

At Tyre Rescue, we do not fit or sell used tyres. Our view is that the hidden risks — invisible internal damage, unknown history, unverifiable age — make used tyres an unacceptable safety risk for a vehicle that you, your family, and other road users depend on.

For Scottish drivers on tight budgets, we recommend good-quality budget new tyres (Nankang, Hankook, Nexen) over part-worn alternatives. The cost difference is much smaller than it appears, and the safety difference is significant.

Call **0141 266 0690** or [get a quote online](/book) for new tyre fitting across Scotland.

[Budget tyres Scotland](/blog/budget-tyres-scotland-guide) | [Tyre age limits Scotland](/blog/tyre-age-limit-scotland) | [Tyre sidewall damage](/blog/tyre-sidewall-damage-scotland)`,
  },
  {
    slug: 'tyre-age-limit-scotland',
    title: 'Tyre Age Limits in Scotland: How Old Is Too Old?',
    description:
      'How old can your tyres legally be in Scotland? The 10-year rule, caravan 5-year rule, how to read the DOT age code, and MOT implications of old tyres explained.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 5,
    featured: false,
    keywords: [
      'tyre age limit scotland',
      'how old can tyres be scotland',
      'tyre age limit uk',
      'old tyres safe scotland',
      'tyre dot code age scotland',
      'tyre age law scotland',
      '10 year tyre rule scotland',
      'when to replace old tyres scotland',
    ],
    relatedSlugs: [
      'how-long-do-tyres-last-scotland',
      'mot-tyre-requirements-scotland',
      'caravan-motorhome-tyre-fitting-scotland',
    ],
    content: `# Tyre Age Limits in Scotland: How Old Is Too Old?

Rubber degrades over time regardless of how much a tyre is used. A tyre stored in a garage for 10 years may have excellent tread depth but be structurally compromised — cracked, hardened, and dangerous.

This guide explains the rules on tyre age in Scotland and the UK, how to find out how old your tyres are, and what the MOT consequences are.

---

## How to Find Your Tyre's Age: The DOT Code

Every tyre manufactured since 2000 has a DOT code on the sidewall. The last four digits of this code indicate the week and year of manufacture.

**Example: DOT XXXX XX 2619**
- **26** = 26th week of the year
- **19** = 2019
- This tyre was manufactured in late June/early July 2019

The DOT code is usually found on the inner sidewall (the side facing the vehicle). You may need to look between the tyre and wheel arch or turn the wheel to see it fully.

**Tyres manufactured before 2000** have a three-digit code (week + single-digit year), which makes exact identification difficult — assume they are very old and replace immediately.

---

## Tyre Age Rules: Cars and Vans

**There is currently no specific UK law** stating a maximum age for passenger car or van tyres. However:

1. **MOT guidance**: DVSA guidance does not specify a maximum age but testers are instructed to note cracking and deterioration. A tyre showing significant age-related cracking can fail an MOT.

2. **Industry recommendation**: the British Tyre Manufacturers' Association (BTMA), the RAC, and most tyre manufacturers recommend replacing tyres **over 10 years old** regardless of condition or tread depth. Some manufacturers (including Michelin and Continental) recommend replacing any tyre over 5–6 years old on vehicles used as daily transport.

3. **Insurance implications**: if you are involved in an accident and your tyres are found to be over 10 years old, your insurer may dispute your claim. Old tyres can be considered evidence of vehicle neglect.

### What Actually Happens to Old Tyres?

Over time, tyre rubber oxidises and the plasticisers that keep rubber flexible migrate out of the compound. The result is:
- **Tread hardening**: hardened rubber loses grip, particularly in cold and wet conditions — critical on Scottish roads
- **Sidewall cracking**: fine cracks develop in the sidewall, indicating rubber degradation
- **Ply separation risk**: internal steel and fabric reinforcement can delaminate from degraded rubber, causing sudden blowout

These changes happen from the outside in — a tyre can look surface-fine while being internally compromised.

---

## Tyre Age Rules: Caravans and Trailers

**Caravans and trailers have much stricter industry-recommended age limits** because:
- They spend long periods in storage (often outside)
- Caravans are towed at speed, placing unique lateral stress on tyres
- A caravan tyre failure at speed causes jackknifing, which can be fatal

**Caravan and Motorhome Club recommendation**:
- Replace caravan tyres at **5 years** regardless of tread depth
- **Maximum 7 years** under the best conditions
- Never use tyres over 7 years old on any caravan or trailer

This is stricter than the car recommendation because of the storage and structural reasons above.

---

## Tyre Age Rules: Goods Vehicles and PSV

For vehicles over 3.5 tonnes GVW and public service vehicles (buses, coaches), UK legislation explicitly bans the use of retreaded tyres over 10 years old. While this applies to commercial vehicles specifically, the principle informs the industry-wide guidance for all vehicle types.

---

## Visual Signs of an Ageing Tyre

Look for these warning signs:

- **Sidewall cracking**: fine lines or cracks in the sidewall rubber, particularly in the tread groove walls
- **Surface crazing**: a network of fine surface cracks across the tread face
- **Tread hardening**: the tread feels brittle rather than slightly yielding when pressed firmly
- **Flat spots**: distortion in the tyre shape from prolonged static storage (often in garages in Scotland)
- **Bead area cracking**: cracks near where the tyre mounts on the rim

Any of these signs, or any tyre over 10 years old, should be replaced immediately regardless of tread depth.

---

## Scotland-Specific Factors

Scotland's climate accelerates tyre ageing in several ways:

- **UV exposure**: even Scotland's limited sun causes UV degradation of rubber compounds
- **Ozone**: Scottish coastal areas and areas near heavy traffic have elevated ozone levels; ozone attacks rubber and causes cracking
- **Temperature cycling**: Scotland's frequent freeze-thaw cycles stress tyre compounds differently from warmer climates
- **Road salt**: while salt does not directly affect tyres, it corrodes wheel rims, potentially affecting the tyre bead seal area

Classic car owners and caravan owners in Scotland should be particularly vigilant about tyre age given the extended storage periods typical of Scottish recreational vehicle ownership.

---

## What to Do

If you are unsure of your tyre age:
1. Locate the DOT code on each tyre (inner sidewall, may require a torch)
2. Decode the last four digits: first two = week, last two = year
3. If any tyre is over 6 years old, have it inspected
4. If any tyre is over 10 years old, replace it — regardless of tread depth or visual condition

Call **0141 266 0690** for mobile tyre replacement across Scotland. We will check the age codes on your existing tyres free of charge as part of any service visit.

[How long do tyres last Scotland](/blog/how-long-do-tyres-last-scotland) | [MOT tyre requirements Scotland](/blog/mot-tyre-requirements-scotland) | [Caravan motorhome tyres Scotland](/blog/caravan-motorhome-tyre-fitting-scotland)`,
  },
  {
    slug: 'classic-car-tyres-scotland',
    title: 'Classic Car Tyres Scotland: Finding the Right Fit for Vintage Vehicles',
    description:
      'Classic and vintage cars in Scotland need tyres that match original specifications, handling characteristics, and often obsolete sizes. This guide covers classic tyre sizes, crossply vs radial, and sourcing options in Scotland.',
    category: 'fitting',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 7,
    featured: false,
    keywords: [
      'classic car tyres scotland',
      'vintage car tyres scotland',
      'classic tyre fitting scotland',
      'crossply tyres scotland',
      'radial tyres classic car scotland',
      'morgan car tyres scotland',
      'series land rover tyres scotland',
      'triumph tyres scotland',
    ],
    relatedSlugs: [
      'tyre-buying-guide-scotland',
      'tyre-age-limit-scotland',
      'ineos-grenadier-tyre-fitting-scotland',
    ],
    content: `# Classic Car Tyres Scotland: Finding the Right Fit for Vintage Vehicles

Scotland has a thriving classic car community — from Highland tours to the many concours events across Central Scotland, Perthshire, and the Borders. But classic car tyres are one of the most specialist areas in the tyre industry, with sizing, construction, and performance characteristics that differ significantly from modern vehicles.

---

## Why Classic Car Tyres Are Different

### Crossply (Bias-Ply) vs Radial Construction

Modern tyres are radial construction — the ply cords run radially from bead to bead across the tyre. Most vehicles since the 1970s–80s use radial tyres.

Older vehicles were originally fitted with crossply (bias-ply) tyres, where the cords run diagonally. Crossply tyres:
- Have stiffer sidewalls that give a different, firmer feel
- Handle differently, particularly in cornering
- Are legally required on some older vehicles where mixing constructions on the same axle is not permitted

**Critical rule**: you must never mix radial and crossply tyres on the same axle. This is an MOT fail and is illegal. If you switch a classic to radials, all four must be radials.

### Unusual Sizes

Classic cars often use tyre sizes that are no longer standard in the modern market. Common examples:

- **5.20-13** or **155-13**: common on pre-1975 small cars (early Minis, Triumph Herald, Fiat 500)
- **165-14** or **175-14**: early Ford Cortinas, Vauxhall Victor
- **185-15**: early Range Rover, classic Land Rovers
- **600-16** or **700-16**: Series Land Rover, older commercial vehicles
- **185VR15** or **205VR15**: classic sports cars, older Porsches, MGB GT

These are still manufactured by specialist brands but availability is more limited than modern sizes.

---

## Classic Car Tyres by Vehicle Type

### Series Land Rover (Series I, II, IIA, III)
Series Land Rovers typically run **6.00-16** or **7.50-16** crossply tyres. Radial conversions are possible and many owners prefer them for improved road comfort and wet grip.

Recommended brands: Avon Ranger, Michelin XZX (for radial conversions), Blockley, or vintage-style tyres from Coker Tyre (for concours-correct appearance).

Modern 245/70R16 or 255/70R16 radials can be fitted on later Series III with wider wheel rims.

### Morgan
Morgans span several decades, with tyre requirements varying significantly:
- **3-Wheeler**: motorcycle tyres on the front, car tyre on the rear
- **Plus 4, Plus 8 (pre-2004)**: typically 185/70R15 or 195/65R15
- **Modern Morgan Plus Four/Plus Six**: 215/45R17 or larger

The Plus 8 with wire wheels requires special care — correct offset and tyre width is essential to avoid rubbing.

### MGB and MGB GT
- **Standard**: 165HR14
- **Later cars**: 175/70HR14 or 185/70HR14
- **V8 models**: wider fitments possible

Wire-wheeled MGBs require careful attention to offset. Overly wide modern tyres can foul the wheel arches on a standard-bodied MGB.

### Triumph (Herald, Vitesse, Spitfire, TR series)
- **Herald/Vitesse**: 155-13 or 155SR13
- **Spitfire 1-4**: 155/80R13 or 165/80R13
- **TR4/TR5**: 175SR15
- **TR6**: 185/70VR15
- **Stag**: 185/70VR15

### Classic Mini (pre-2001)
Original Mini sizing was **5.20-10** (crossply) or **145-10** radial. Wheel and tyre upgrades are extremely common — 12" or 13" wheel conversions to modern size tyres are popular and give significantly improved performance.

### Classic Porsche
- **356**: 165HR15 or 185HR15
- **911 (early)**: 165HR15 (front), 185/70VR15 (rear) — staggered
- **911 SC/Carrera (3.0/3.2)**: 185/70VR15 front, 215/60VR15 rear

Early 911 staggered fitments cannot be rotated. Front and rear tyres are different sizes and asymmetric across the axle on some variants.

---

## Tyre Age on Classic Cars: An Important Consideration

There is a tension with classic cars: many owners value period-correct tyre appearances (some even want to preserve original tyres for concours events). However, **tyre rubber degrades regardless of use**.

A tyre manufactured in 1995 is 30 years old and is structurally unsafe regardless of how little it has been driven or how good it looks. Classic tyres more than 10 years old should be replaced before road use.

This is particularly relevant for classic cars purchased at auction or from private sales — the previous owner may not have replaced tyres, and they can appear visually excellent while being dangerously compromised internally.

---

## What Tyre Rescue Can Do for Classic Car Owners in Scotland

Tyre Rescue can source and fit many classic and specialist tyre sizes across Scotland:
- We have access to specialist tyre distributors handling vintage and classic sizes
- We can advise on crossply vs radial crossover points for your specific vehicle
- We handle vintage steel wheel and wire wheel fitments (these require care to avoid damaging the wheel)

When you call, tell us:
- The year of your vehicle and original engine size
- The size currently on the vehicle (or the original factory size from the handbook)
- Whether you want crossply (original spec), radial (improved performance), or a period-look modern radial
- Your location in Scotland

Some very rare sizes may require ordering — allow 5–7 working days for sourcing.

Call **0141 266 0690** for classic car tyre sourcing and fitting across all of Scotland.

[Tyre buying guide Scotland](/blog/tyre-buying-guide-scotland) | [INEOS Grenadier tyre guide](/blog/ineos-grenadier-tyre-fitting-scotland) | [How long do tyres last](/blog/how-long-do-tyres-last-scotland)`,
  },
  {
    slug: 'fuel-efficient-tyres-scotland',
    title: 'Best Fuel-Efficient Tyres for Scottish Drivers: Save on Running Costs',
    description:
      'Tyres have a measurable impact on fuel economy — the right tyre choice can save Scottish drivers £30–£100 per year in fuel. This guide covers tyre rolling resistance, EU labels, and the best low-rolling-resistance tyres for Scottish roads.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'fuel efficient tyres scotland',
      'low rolling resistance tyres scotland',
      'eco tyres scotland',
      'tyres that save fuel scotland',
      'best economy tyres scotland',
      'tyre fuel efficiency scotland',
      'green tyres scotland',
      'tyres affect mpg scotland',
    ],
    relatedSlugs: [
      'tyre-buying-guide-scotland',
      'tyre-pressure-guide-scotland',
      'budget-tyres-scotland-guide',
    ],
    content: `# Best Fuel-Efficient Tyres for Scottish Drivers: Save on Running Costs

Tyres are responsible for approximately **20–30% of a vehicle's total fuel consumption** through rolling resistance — the energy lost as a tyre deforms under load. Choosing a low-rolling-resistance tyre can meaningfully reduce your fuel bill.

For Scottish drivers covering average distances (8,000–10,000 miles per year), the difference between a high-rolling-resistance tyre and a top-rated eco tyre can be **£30–£100 per year in fuel savings** depending on vehicle type and driving mix.

---

## What Is Rolling Resistance?

Rolling resistance is the energy required to keep a tyre moving. As a tyre rotates, it constantly deforms where it contacts the road surface and then reforms — this deformation generates heat, which represents energy lost from the engine/battery.

A tyre with low rolling resistance requires less energy to maintain speed. The fuel (or battery charge) saved by reduced rolling resistance is real and measurable.

**Rough rule**: every 10% reduction in rolling resistance improves fuel economy by approximately 1–2% for a typical car.

---

## The EU Tyre Fuel Efficiency Label

All tyres sold in the UK must display a fuel efficiency rating on the EU/UK tyre label:

- **A**: lowest rolling resistance (best for fuel economy)
- **B**: second best
- **C**: moderate — the minimum acceptable standard for most drivers
- **D/E**: higher rolling resistance — avoid for economy-focused driving

The label also shows:
- **Wet grip rating** (A–E, where A is shortest stopping distance)
- **External noise level** (dB)

The best eco tyres have **A rating for fuel efficiency** while maintaining **A or B rating for wet grip** — you do not have to sacrifice safety for economy.

---

## How Much Can You Save?

Example: a petrol car averaging 40 mpg, covering 9,000 miles per year at 140p per litre:

| Label rating | Typical rolling resistance | Estimated annual fuel saving vs E-rated |
|---|---|---|
| A-rated tyre | Very low | Save ~£80–£100/year |
| B-rated tyre | Low | Save ~£50–£70/year |
| C-rated tyre | Moderate | Save ~£20–£30/year |
| E-rated tyre | High | Baseline |

These savings compound across the life of the tyres — a set of A-rated tyres lasting 30,000 miles may save £300–£500 in fuel versus E-rated alternatives over their lifespan.

---

## Top Fuel-Efficient Tyre Choices for Scotland

### Premium — Best for Economy + Safety

**Michelin Energy Saver+ / Primacy 4+**
- Fuel efficiency: A | Wet grip: A or B
- Michelin's compound technology leads the market in combining low rolling resistance with excellent wet performance. A consistent top performer in ADAC and Auto Express tests.
- Particularly good for Scottish mixed-road driving (city + rural motorway)

**Continental EcoContact 7 / PremiumContact 7**
- Fuel efficiency: A | Wet grip: A
- Continental's latest generation eco compound. Outstanding wet braking alongside A-rated fuel efficiency.

**Bridgestone Turanza 6**
- Fuel efficiency: A | Wet grip: A
- Designed specifically for EVs and modern efficient petrol/diesel vehicles. Excellent noise isolation.

### Mid-Range — Good Economy Value

**Hankook Kinergy Eco2 / Ventus Prime 4**
- Fuel efficiency: A or B | Wet grip: B
- Very good economy performance at mid-range price. Popular choice for Scottish fleet operators.

**Falken Ziex ZE914 Ecorun**
- Fuel efficiency: A | Wet grip: B
- Falken's eco line performs well in independent tests at a significantly lower price than premium alternatives.

**Nexen N'Blue HD Plus**
- Fuel efficiency: A | Wet grip: B
- Good economy rating with competitive pricing.

---

## Important: Tyre Pressure and Fuel Economy

Even the best A-rated tyre will underperform if it is under-inflated.

A tyre inflated 6 PSI (0.4 bar) below the recommended pressure increases rolling resistance by approximately 3–5%, adding measurable fuel consumption.

**Check tyre pressures every four weeks.** This is the single easiest fuel-saving action any Scottish driver can take, and it costs nothing.

---

## EVs and Low Rolling Resistance Tyres

For electric vehicles, rolling resistance is even more important — the energy the tyre wastes directly reduces range.

Most EVs are fitted as standard with low-rolling-resistance tyres designed for EV use. When replacing EV tyres, always maintain A-rated or EV-specific tyres. Fitting a standard (non-EV-spec) tyre with B or C rolling resistance rating will measurably reduce your EV range.

Scottish EV drivers covering long Highland routes where charging stops are less frequent benefit particularly from low rolling resistance tyres.

---

## Scotland-Specific Note: Winter Driving and Rolling Resistance

Winter tyres and all-season tyres inherently have higher rolling resistance than summer tyres due to their softer, more flexible compounds. This is a necessary trade-off for cold-weather grip.

If you run winter tyres in Scotland (strongly recommended for Highland areas), expect a 5–8% fuel economy reduction during winter months regardless of tyre brand. This is normal and expected.

For Central Belt drivers who do not regularly encounter snow/ice, a high-quality all-season tyre with B-rated fuel efficiency is often the best balance.

---

Call **0141 266 0690** or [book online](/book) to order and fit eco tyres across Scotland. Our fitters can advise on the best economy option for your vehicle, driving profile, and budget.

[Tyre buying guide Scotland](/blog/tyre-buying-guide-scotland) | [Tyre pressure guide](/blog/tyre-pressure-guide-scotland) | [Summer vs winter vs all-season tyres Scotland](/blog/summer-vs-winter-vs-all-season-tyres-scotland)`,
  },
  {
    slug: 'nitrogen-vs-air-tyres-scotland',
    title: 'Nitrogen vs Air in Tyres: Is It Worth It for Scottish Drivers?',
    description:
      'Nitrogen inflation is offered as a premium upgrade at many tyre centres. This guide explains what nitrogen actually does, when it genuinely helps, and whether it is worth paying for in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 4,
    featured: false,
    keywords: [
      'nitrogen tyres scotland',
      'nitrogen vs air tyres scotland',
      'should I use nitrogen in tyres scotland',
      'nitrogen tyre inflation scotland',
      'is nitrogen better than air for tyres scotland',
      'nitrogen tyre filling scotland',
      'nitrogen car tyres scotland',
    ],
    relatedSlugs: [
      'tyre-pressure-guide-scotland',
      'tyre-buying-guide-scotland',
      'budget-tyres-scotland-guide',
    ],
    content: `# Nitrogen vs Air in Tyres: Is It Worth It for Scottish Drivers?

Many tyre centres offer nitrogen inflation as an upgrade — sometimes free, sometimes £5–£10 per tyre. The marketing claims are impressive: more stable pressures, better fuel economy, longer tyre life.

Here is an honest answer on whether nitrogen makes a real difference for most Scottish drivers.

---

## What Is the Difference?

Air is approximately 78% nitrogen, 21% oxygen, and 1% other gases. Dry nitrogen is 95–99% pure nitrogen.

When you inflate a tyre with nitrogen instead of air, you are primarily removing the oxygen fraction.

---

## What Does Nitrogen Actually Do?

### Pressure Stability
Oxygen is a slightly smaller molecule than nitrogen, and it diffuses through tyre rubber at a slightly faster rate. Nitrogen also expands and contracts less with temperature changes than oxygen does.

The result: nitrogen-inflated tyres lose pressure slightly more slowly over time (over months, not hours), and pressure changes less dramatically with temperature.

**Real-world impact for Scottish drivers**: a tyre inflated to 34 PSI with air might be at 32–33 PSI after 4–6 weeks. A nitrogen-filled tyre might retain 33–34 PSI over the same period. The difference is measurable but small.

### No Moisture
Air contains moisture. Moisture inside a tyre can cause minor corrosion of alloy rims and slightly larger pressure swings with temperature. Dry nitrogen has no moisture.

**Real-world impact**: on older or corrosion-prone alloy wheels (common in Scotland's wet, salted-road environment), nitrogen may slightly reduce internal rim corrosion over many years.

---

## Where Nitrogen Genuinely Helps

Nitrogen is genuinely beneficial in two situations:

1. **Aircraft**: aircraft tyres run at extremely high temperatures and loads. Nitrogen's non-flammability and minimal moisture content matter here.

2. **Motorsport and track use**: racing tyres experience very large temperature swings. Consistent pressure under heat is critical for handling predictability. All serious motorsport uses nitrogen.

---

## For Most Scottish Drivers: The Honest Assessment

**The benefit is real but small.** You will probably not notice any handling or economy difference in normal driving.

**The practical issue** with nitrogen for everyday drivers: when you need to top up your tyre at a petrol station, the pump uses compressed air — which partially undoes the nitrogen advantage. Unless you have access to nitrogen refills, you will inevitably end up with a mix.

**Our recommendation**:
- If a tyre centre offers nitrogen free as standard — fine, take it.
- If it costs £15–£30 extra to inflate all four tyres with nitrogen — the money is better spent on premium-brand tyres or an alignment check.
- Check your tyre pressures every four weeks regardless of what is in them. Regular pressure maintenance eliminates the main advantage nitrogen offers.

---

## One Scotland-Specific Point: Winter Tyres and Nitrogen

If you run separate winter wheels, nitrogen can be beneficial because winter wheels are often stored for 5–6 months. Nitrogen-filled winter tyres will lose less pressure during storage than air-filled alternatives, meaning fewer top-up adjustments at the start of the season.

This is the one scenario where nitrogen provides a practical, tangible benefit for Scottish drivers.

---

Tyre Rescue focuses on what actually makes a difference to tyre safety and longevity: correct pressure, correct tyre specification, BSAU159 repairs, and proper balancing. Call **0141 266 0690** or [book online](/book).

[Tyre pressure guide Scotland](/blog/tyre-pressure-guide-scotland) | [Winter tyre storage Scotland](/blog/winter-tyre-storage-scotland) | [Budget tyres Scotland](/blog/budget-tyres-scotland-guide)`,
  },
  {
    slug: 'run-flat-tyres-scotland-guide',
    title: 'Run-Flat Tyres Scotland: Can They Be Repaired and What Do They Cost?',
    description:
      'Everything Scottish drivers need to know about run-flat tyres — how far you can drive after deflation, whether they can be repaired, what they cost to replace, and which cars use them.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 7,
    featured: false,
    keywords: [
      'run flat tyres scotland',
      'run flat tyre repair scotland',
      'run flat tyre cost scotland',
      'can run flat tyres be repaired scotland',
      'run flat tyre replacement scotland',
      'BMW run flat tyres scotland',
      'Mercedes run flat tyre scotland',
      'run on flat tyres scotland',
    ],
    relatedSlugs: [
      'bmw-tyre-fitting-scotland',
      'mercedes-tyre-fitting-scotland',
      'can-i-drive-on-flat-tyre-scotland',
    ],
    content: `# Run-Flat Tyres Scotland: Can They Be Repaired and What Do They Cost?

Run-flat tyres are one of the most misunderstood products in the tyre industry. Scottish drivers with BMW, Mercedes, MINI, Lexus, and many other vehicles are often confused about what to do after a puncture — and whether the tyre can be saved or must be replaced.

This guide covers everything you need to know.

---

## What Is a Run-Flat Tyre?

A run-flat tyre (RFT) is designed to continue supporting your vehicle for a limited distance after losing air pressure. There are two main types:

**Self-supporting run-flats (SSR, RSC, EMT, MOExtended)**: the most common type. These have reinforced sidewalls (typically 3–5mm thick versus 1–2mm on standard tyres) that can bear the vehicle's weight without air pressure.

**Support ring systems (PAX, ContiSupportRing)**: a rigid ring inside the wheel supports the vehicle if the tyre deflates. Used on some Renault, Rolls-Royce, and older Michelin PAX applications. Rare in current production.

---

## Which Cars Use Run-Flat Tyres in Scotland?

Run-flat tyres are standard fitment on:

**BMW**: almost all current BMW models use run-flats (BMW RSC — Runflat System Component). This includes 1, 2, 3, 4, 5, 6, 7 Series, X1-X7, Z4, M models. BMW deleted the spare wheel on most models from around 2003.

**MINI**: all current MINI models use run-flats (also BMW RSC specification).

**Mercedes-Benz**: most current A, B, C, E, S Class, GLA, GLB, GLC, GLE, GLS use Mercedes Extended Tyres (MOExtended or EMT). Some older models use Bridgestone DriveGuard.

**Lexus**: IS, ES, UX, NX, RX models often use run-flats.

**Porsche**: many Porsche models specify run-flats for certain size combinations.

**If your car has no spare wheel**: check whether your tyres are marked with a sidewall code — BMW RSC, Mercedes MOExtended, EMT, or similar — indicating run-flat specification.

---

## How Far Can You Drive on a Run-Flat Tyre After Deflation?

The industry standard is **80km (50 miles) at a maximum of 80km/h (50mph)** after complete deflation.

**This is the maximum, not a target.** The actual achievable distance depends on:
- Vehicle weight (heavier = less distance)
- Speed (higher speed = more heat generation = faster deterioration)
- Road surface and conditions

**Important**: the run-flat distance guarantee is void if:
- You drove above 80km/h (50mph) after deflation
- You drove more than 80km after the TPMS warned of pressure loss
- You exceeded the run-flat range on a previous occasion (even if the tyre was then reinflated)

---

## Can a Run-Flat Tyre Be Repaired?

**In most cases, no.** This is the critical difference from standard tyres.

### Why Run-Flat Tyres Usually Cannot Be Repaired

1. **Internal damage is not visible**: when a run-flat tyre is driven on with zero pressure, the weight of the vehicle is transferred to the reinforced sidewall. This causes internal tearing and delamination that is invisible from outside. Even a tyre with no external damage may be internally compromised.

2. **Industry guidelines**: the UK NTDA (National Tyre Distributors Association), BSAU159, and most run-flat tyre manufacturers state that tyres driven at or near zero pressure should not be repaired.

3. **Insurance and liability**: repairing a run-flat that has been driven flat exposes the fitter to liability. Reputable fitters will refuse.

### The One Exception

A run-flat tyre that has suffered a small nail puncture, where:
- The vehicle TPMS alerted immediately and you stopped within a short distance (2–3 miles maximum)
- The tyre has not been driven with zero pressure for any meaningful distance
- The damage is in the repairable zone (central three-quarters of the tread, away from sidewall)

In this specific scenario, a BSAU159-compliant repair may be possible after careful internal inspection. However, most fitters will still recommend replacement for certainty.

**Always tell the fitter exactly what happened**: how far you drove after the TPMS alert, at what speed, and whether the car showed any handling changes.

---

## What Does Run-Flat Tyre Replacement Cost in Scotland?

Run-flat tyres cost more than standard tyres of the same size — typically **30–50% more**.

Common Scottish fitments and typical replacement costs:

| Vehicle | Size | Est. cost per tyre |
|---|---|---|
| BMW 3 Series (F30/G20) | 225/45R17 or 225/50R17 RFT | £100–£145 |
| BMW 5 Series (G30) | 245/45R18 or 275/35R19 RFT | £120–£180 |
| BMW X3 | 245/50R19 or 255/45R20 RFT | £130–£200 |
| MINI Hatch | 205/45R17 or 225/40R18 RFT | £90–£135 |
| Mercedes C Class (W206) | 225/45R18 or 245/40R19 MOExt | £110–£160 |
| Mercedes GLC | 235/60R18 or 255/45R20 MOExt | £130–£195 |

Brands available in run-flat specification: Bridgestone, Continental, Goodyear, Michelin, Pirelli, Falken, Hankook.

---

## Can You Switch from Run-Flat to Standard Tyres?

Yes, but with important caveats.

**You need to acquire a spare**: if you switch to standard tyres, you no longer have the run-flat as a backup. You must carry a spare tyre, a space-saver spare, or a tyre inflation kit.

**The car must have a TPMS**: run-flat vehicles rely entirely on TPMS to tell you the tyre has lost pressure (you cannot feel the pressure loss in a run-flat as you would with a standard deflating tyre). If you switch to standard tyres, the TPMS must be fully functional.

**Ride quality**: run-flat tyres have stiffer sidewalls that give a firmer ride. Switching to standard tyres on the same wheels often gives a noticeably softer, more comfortable ride — many BMW owners prefer this.

**Cost**: standard tyres in the same size are typically 30–50% less expensive than run-flat equivalents.

---

## Tyre Rescue and Run-Flat Tyres in Scotland

Tyre Rescue carries run-flat tyres in the most common BMW, MINI, and Mercedes sizes in our mobile units. We serve all of Scotland — from Glasgow and Edinburgh to Inverness, Dundee, and rural Perthshire and Aberdeenshire.

When you call, tell us:
- Your vehicle make, model, and year
- The tyre size (on the tyre sidewall)
- Whether you need run-flat or would consider switching to standard
- How far you drove after the TPMS warned (we will advise on repairability)

Call **0141 266 0690** or [book online](/book).

[BMW tyre fitting Scotland](/blog/bmw-tyre-fitting-scotland) | [Mercedes tyre fitting Scotland](/blog/mercedes-tyre-fitting-scotland) | [Can I drive on a flat tyre?](/blog/can-i-drive-on-flat-tyre-scotland)`,
  },
  {
    slug: 'budget-tyres-scotland-guide',
    title: 'Budget Tyres in Scotland: What to Buy, What to Avoid, and Real Costs',
    description:
      'Are budget tyres safe for Scottish roads? This guide explains the real difference between budget, mid-range, and premium tyres, which budget brands pass wet weather tests, and how to save without compromising safety.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 7,
    featured: false,
    keywords: [
      'budget tyres scotland',
      'cheap tyres scotland',
      'budget tyre brands scotland',
      'are budget tyres safe scotland',
      'cheap tyres glasgow',
      'affordable tyres scotland',
      'best budget tyres scotland',
      'cheap tyre fitting scotland',
    ],
    relatedSlugs: [
      'tyre-buying-guide-scotland',
      'michelin-vs-continental-vs-pirelli-scotland',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# Budget Tyres in Scotland: What to Buy, What to Avoid, and Real Costs

With tyre prices rising, many Scottish drivers ask whether budget tyres are safe — or whether they're compromising their safety to save money.

The honest answer: **it depends on which budget brand you choose.** Some budget tyres perform surprisingly well in independent tests. Others are dangerously poor in wet conditions. This guide shows you how to tell the difference.

---

## The Three Tyre Tiers

### Premium Tyres (£80–£160+ per tyre)
Brands: Michelin, Continental, Pirelli, Bridgestone, Goodyear

These manufacturers invest heavily in R&D. Independent testing organisations (ADAC, Auto Express, TÜV) consistently show premium tyres stopping 3–6 metres shorter in wet braking tests than budget alternatives at the same speed. At 60mph, 4 metres is the difference between stopping in time and a collision.

Premium tyres also wear more evenly, maintain performance longer, and resist aquaplaning better on Scotland's frequently wet roads.

### Mid-Range Tyres (£50–£90 per tyre)
Brands: Falken, Hankook, Nexen, Kumho, Cooper, Toyo, Uniroyal

Mid-range tyres often come from the same manufacturers or parent companies as premium brands. Falken is Sumitomo (a major Japanese manufacturer). Uniroyal is owned by Continental. Hankook supplies as OE to major German manufacturers.

Mid-range tyres offer 85–95% of premium tyre wet performance at 60–75% of the price. This is often the best value point for most Scottish drivers.

### Budget Tyres (£25–£55 per tyre)
Brands: Zeetex, Nankang, Landsail, Rotalla, Linglong, Austone, Maxxis (budget lines), Roadhog, Warrior

Budget tyres vary enormously. Some are manufactured in modern Chinese factories with recent technology and perform acceptably. Others are years-old designs with poor wet grip and high stopping distances.

**The key question is not price — it's test results.**

---

## Budget Tyre Testing Results: What the Data Shows

Independent tyre tests (Auto Express UK, TÜV SÜD, ADAC Germany) regularly include budget tyres alongside premium brands. Key findings relevant to Scottish drivers:

### Wet Braking
This is the most critical safety metric for Scotland's roads.

- **Premium average (80km/h to standstill)**: ~25–27 metres
- **Good budget (same test)**: ~28–31 metres (10–15% longer)
- **Poor budget (same test)**: ~34–40 metres (25–50% longer)

The worst-performing budget tyres in wet braking tests stop **13 metres longer** than the best premium tyres at 80km/h. On a wet Scottish road, 13 metres is the length of a large lorry.

### Aquaplaning Resistance
Scotland's rainfall makes this significant. Budget tyres with shallower initial tread depth and less sophisticated tread patterns aquaplane at lower speeds than premium equivalents.

### Tyre Life
Budget tyres typically last **20–30% fewer kilometres** than premium tyres of the same size. A budget tyre saving you £40 at purchase may cost more per kilometre driven.

---

## Which Budget Brands Are Acceptable?

These budget/mid-range brands have performed reasonably well in independent tests and are acceptable for normal Scottish driving:

**Acceptable budget/value brands:**
- **Nankang** — Taiwanese manufacturer, consistent test results, particularly their NS-2 and NS-20 lines
- **Maxxis** — Taiwanese, supplies OE to motorcycle and specialist vehicle manufacturers; passenger range is solid
- **Hankook** (mid-range) — South Korean, OE supplier to BMW, Mercedes, Audi; excellent value
- **Nexen** — South Korean, OE supplier to Audi and VW for some models
- **Falken** — Japanese/Sumitomo, technically mid-range but often priced in budget territory

**Brands to approach with caution:**
- Unknown Chinese brands with no independent test data
- Tyres significantly cheaper than the market average for the size
- Tyres with no visible EU/UK tyre label ratings (wet grip, fuel efficiency, noise)

---

## The EU/UK Tyre Label

All new tyres sold in the UK must carry a label showing:
- **Wet grip**: A (best) to E (worst) — never buy below C for Scottish driving
- **Fuel efficiency**: A to G
- **External noise**: shown in decibels

A budget tyre with **wet grip A or B** is safer than a budget tyre with **wet grip D or E**, regardless of price. Always check the label.

---

## Real Cost Comparison: Scotland

For a popular size like 205/55R16:

| Tier | Typical cost per tyre | Est. life | Cost per 1,000 miles |
|---|---|---|---|
| Premium (Michelin, Continental) | £95–£120 | 25,000–35,000 miles | £3.60–£4.80 |
| Mid-range (Hankook, Nexen) | £55–£75 | 20,000–28,000 miles | £2.70–£3.75 |
| Budget (Nankang, Maxxis) | £35–£55 | 15,000–22,000 miles | £2.30–£3.60 |

At typical Scottish mileage (8,000–10,000 miles/year), the cost-per-mile difference between premium and good budget tyres is often less than £50 per year. That is much less than most drivers assume.

---

## Our Recommendation for Scottish Drivers

**For regular urban and commuter driving**: mid-range tyres (Hankook, Nexen, Falken) offer the best value. You get 85–90% of premium performance at 60–70% of the cost.

**For Highland or rural driving**: go premium on the front axle at minimum. Scotland's rural roads are unforgiving in wet conditions, and the wet braking advantage of premium front tyres is real.

**For genuinely budget-constrained drivers**: choose budget tyres with wet grip A or B on the EU label. Avoid anything rated C or below for wet grip.

**Never do this**: buy tyres purely on price with no knowledge of the brand or test results.

---

Tyre Rescue supplies and fits tyres across all tiers — budget, mid-range, and premium — across all of Scotland. Call **0141 266 0690** or [get a quote online](/book) to find the best tyre for your budget and driving profile.

[Full tyre buying guide Scotland](/blog/tyre-buying-guide-scotland) | [Michelin vs Continental vs Pirelli Scotland](/blog/michelin-vs-continental-vs-pirelli-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'caravan-motorhome-tyre-fitting-scotland',
    title: 'Caravan and Motorhome Tyre Fitting Scotland: Complete Guide',
    description:
      'Caravan and motorhome tyres have specific requirements around age, load rating, and CP marking. Scotland-specific guide covering tyre age limits, caravan CP tyres, and mobile fitting across the Highlands.',
    category: 'fitting',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 8,
    featured: false,
    keywords: [
      'caravan tyre fitting scotland',
      'motorhome tyre fitting scotland',
      'caravan tyre age limit scotland',
      'CP tyres caravan scotland',
      'caravan tyre replacement scotland',
      'motorhome tyre change scotland',
      'caravan tyre scotland highlands',
      'motorhome mobile tyre fitting scotland',
    ],
    relatedSlugs: [
      'tyre-age-limit-scotland',
      'tyre-pressure-guide-scotland',
      'nc500-tyre-guide-scotland',
    ],
    content: `# Caravan and Motorhome Tyre Fitting Scotland: Complete Guide

Scotland is one of the UK's most popular caravan and motorhome destinations — from Loch Lomond to the NC500, Skye to the Cairngorms. But caravan and motorhome tyres have very different requirements from car tyres, and getting them wrong is dangerous.

This guide covers everything Scottish caravan and motorhome owners need to know about tyre fitting, age limits, load ratings, and mobile fitting services.

---

## Caravan Tyres: Different from Car Tyres

Caravans are towed, not driven, which creates unique tyre requirements:

**CP (Caravan/Camping/Passenger) tyres**: some manufacturers specify CP-rated tyres, which have stiffer sidewalls designed for the unique dynamics of a towed vehicle. A towed caravan experiences different lateral forces than a driven car. Standard car tyres can be used on many caravans, but check your handbook.

**High load index**: a caravan concentrated on two wheels (or four on twin-axle) carries significant weight. A 1,500kg caravan on single axle puts up to 750kg per tyre. Most caravans require load index 91 (615kg) or higher. Check your Caravan and Motorhome Club or manufacturer data for the minimum required load index.

**High speed rating**: even though caravans are limited to 60mph on UK single carriageways and 70mph on motorways, tyres rated for those speeds must be specified. Most caravan tyres are R (170km/h) rated — sufficient.

---

## The 5-Year Caravan Tyre Rule

**This is the most important rule Scottish caravan owners often don't know.**

The Caravan and Motorhome Club and major caravan manufacturers recommend replacing caravan tyres at 5 years regardless of tread depth and visual condition.

**Why caravans are different from cars**:
- Caravans spend months in storage each year, often outdoors in Scotland's damp climate
- UV degradation, ozone cracking, and surface hardening happen whether the tyre is used or not
- A caravan tyre used for 1,000 miles per year over 7 years may have excellent tread but be structurally compromised
- When a caravan tyre fails at 60mph on a motorway, the resulting swerve and jackknife can be fatal

The National Caravan Council recommends:
- Replace caravan tyres at **5 years** regardless of tread depth
- **Maximum 7 years** even if storage conditions were perfect and tyres appear excellent
- **Never use caravan tyres older than 7 years** under any circumstances

### Finding Your Tyre Age

The DOT code on the tyre sidewall ends with a 4-digit code — the week and year of manufacture. Example: **2619** = 26th week of 2019. A tyre manufactured in 2019 should be replaced by 2024 (5-year rule) or no later than 2026 (7-year maximum).

Check all four tyres on a twin-axle caravan — they can have different manufacture dates even if fitted at the same time.

---

## Motorhome Tyres: Weight is the Priority

Motorhomes are larger, heavier, and carry passengers and belongings — creating much higher load requirements than caravans.

### Common Motorhome Sizes and Tyre Requirements

| Motorhome class | Typical GVW | Required load index |
|---|---|---|
| VW-based (Transporter, Crafter) | 3,500–4,250kg | 104–107+ per tyre |
| Fiat Ducato-based (Swift, Autotrail, Autoquest) | 3,500–4,250kg | 104–107+ |
| Coach-built (5–7m, Trigano, Adria) | 4,000–5,000kg | 108–112+ |
| A-class (6–9m, large motorhomes) | 5,000kg+ | 112–118+ |

**Important**: the standard tyre fitted to a Fiat Ducato van may be insufficient for the same van converted to a motorhome at its maximum payload. Always check the motorhome manufacturer's tyre specification, not the base vehicle specification.

### Motorhome Single Rear Wheels vs Dual Rear Wheels

Most motorhomes up to 7m have single rear wheels. Larger A-class motorhomes may have dual rear wheels (dually). If you have dual rear wheels, tyre replacement must maintain matching tread depths — different tread depths between inner and outer rear tyres causes uneven wear and handling issues.

---

## Scottish Climate Considerations

### Storage in Damp Conditions
Scotland's climate is significantly more humid than southern England. Caravans stored outdoors over winter in Scotland are exposed to:
- Higher average humidity (accelerates ozone cracking)
- Longer periods of darkness (reduces UV but increases damp)
- Temperature cycling (freeze-thaw stresses tyre compounds)

**Recommendation**: if your caravan is stored outdoors in Scotland, apply tyre covers (opaque, UV-blocking) to reduce ozone and UV exposure. Still follow the 5-year replacement rule.

### A-Roads and Rural Tracks
The NC500 and many Highland routes include stretches with:
- Deep potholes near verges
- Passing places with rough gravel edges
- Cattle grids causing repeated impact

Inspect caravan and motorhome tyres carefully before and after any Highland tour, checking sidewalls for impact damage.

### Pre-Season Inspection Checklist

Before the Scottish touring season (typically April onward):
1. Check tyre age (DOT code) — replace if over 5 years
2. Check tread depth — minimum 2mm for caravans, aim for 3mm+
3. Check tyre pressure (caravans are often stored partially deflated — always inflate to correct cold pressure before touring)
4. Check sidewalls for cracking, bulging, or flat-spotting from storage
5. Check spare tyre (if fitted) — same age and condition rules apply

---

## Mobile Tyre Fitting for Caravans and Motorhomes in Scotland

Tyre Rescue provides mobile tyre fitting for caravans and motorhomes across Scotland.

**Why mobile fitting makes sense for motorhomes**: a 7m motorhome cannot simply be driven to a tyre centre. Our mobile units come to your campsite, storage facility, or home address — which is the safest and most convenient option.

**Caravans without a tow vehicle**: if your caravan is in storage and you cannot easily bring it anywhere, we can attend the storage site directly to replace tyres.

**What to tell us when you call**:
- Tyre size (printed on the tyre sidewall — e.g., 195/70R15C)
- Number of axles and tyres needing replacement
- Whether caravan or motorhome
- Location (campsite, home, storage facility)
- Any access restrictions at the location

**The C designation**: caravan and light commercial tyres are often marked with C at the end — e.g., 195/70R15**C**. This indicates a reinforced construction for load carrying. Do not replace a C-rated caravan tyre with a standard passenger tyre of the same size.

---

Call **0141 266 0690** for mobile caravan and motorhome tyre fitting across Scotland. We serve locations from Glasgow and Edinburgh north to Inverness, Aviemore, and the Highland routes.

[NC500 tyre guide Scotland](/blog/nc500-tyre-guide-scotland) | [Tyre pressure guide](/blog/tyre-pressure-guide-scotland) | [How long do tyres last](/blog/how-long-do-tyres-last-scotland)`,
  },
  {
    slug: 'wheel-alignment-vs-balancing-scotland',
    title: 'Wheel Alignment vs Wheel Balancing: What\'s the Difference in Scotland?',
    description:
      'Wheel alignment and wheel balancing fix completely different problems. Learn what each does, how to tell which one you need, and how much each costs in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'wheel alignment vs balancing scotland',
      'wheel alignment scotland',
      'wheel balancing scotland',
      'what is wheel alignment scotland',
      'what is wheel balancing scotland',
      'do i need alignment or balancing scotland',
      'four wheel alignment cost scotland',
      'tyre balancing scotland',
    ],
    relatedSlugs: [
      'uneven-tyre-wear-guide-scotland',
      'car-vibrating-after-new-tyres-scotland',
      'tyre-rotation-guide-scotland',
    ],
    content: `# Wheel Alignment vs Wheel Balancing: What's the Difference in Scotland?

Wheel alignment and wheel balancing are two completely different procedures that fix completely different problems. Confusing them — or assuming you need one when you need the other — leads to wasted money and persistent issues.

Here is a plain explanation of each, how to tell which one you need, and what each costs in Scotland.

---

## Wheel Alignment

**What it is**: adjusting the angles at which your tyres meet the road.

When your wheels are correctly aligned, each tyre is pointing in exactly the right direction relative to the car and to each other. The three main alignment angles are:

- **Camber**: the tilt of the tyre when viewed from the front — how far the top of the tyre leans in or out
- **Toe**: whether the tyres point slightly inward (toe-in) or outward (toe-out) when viewed from above
- **Caster** (on steered axles): the angle of the steering axis when viewed from the side

### Signs You Need Wheel Alignment

- **Car pulls to one side** while driving straight, even on a level road
- **Uneven tyre wear** — inner or outer edge wearing faster than the centre
- **Steering wheel is off-centre** when driving straight (rotated left or right while the car goes straight)
- **Steering feels loose or wanders** at motorway speeds
- **Vehicle recently hit a pothole** or kerb at speed

### What Causes Misalignment in Scotland?

- Potholes (very common on rural and B-roads in Scotland)
- Kerb strikes
- Suspension wear over time
- Accident or significant impact

### Wheel Alignment Cost Scotland

A four-wheel alignment (the full check and adjustment of all four wheels) typically costs **£40–£80** at a specialist tyre or alignment centre. This is an investment that pays for itself in tyre life — even 2° of misalignment can halve tyre life on the affected corner.

---

## Wheel Balancing

**What it is**: adding small weights to the wheel rim to equalise the weight distribution around the tyre and wheel assembly.

When a tyre is mounted on a wheel, tiny variations in weight across the tyre and wheel mean that when it spins, there are heavy spots that cause vibration. Balancing corrects this.

A balancing machine spins the wheel and identifies where and how much weight needs to be added. Stick-on or clip-on weights are placed precisely on the rim.

### Signs You Need Wheel Balancing

- **Steering wheel vibrates** at a specific speed (commonly 50–70 mph) then smooths out at higher speeds
- **Vibration through the floor or seat** at certain speeds
- **Vibration appeared after fitting new tyres** — this is the most common scenario
- **Flat spot feel** after the car has sat unused for a period (this often resolves after a few miles of driving)

### What Causes Imbalance?

- Normal tyre fitting — new tyres are always balanced when fitted but can develop slight imbalance over time
- A lost balance weight (common after driving on rough Scottish roads — weights can be knocked off kerbs or potholes)
- A tyre repair that changes the weight distribution
- Significant tyre wear or flat-spotting

### Wheel Balancing Cost Scotland

Individual wheel balancing (when not part of a fitting) typically costs **£8–£15 per wheel** at a tyre specialist. Tyre Rescue includes balancing as standard with every tyre fitted.

---

## Which One Do I Need?

Use this table to identify which service you need:

| Symptom | Likely cause |
|---|---|
| Car pulls to one side | Wheel alignment |
| Steering wheel off-centre | Wheel alignment |
| Uneven tyre wear (inner/outer edge) | Wheel alignment |
| Vibration in steering wheel at 50–70mph | Wheel balancing |
| Vibration in seat/floor at motorway speed | Wheel balancing |
| Vibration appeared after new tyres | Wheel balancing |
| Both pulling AND vibration | Possibly both needed |

### Can Both Be Needed at the Same Time?

Yes. It is common after a pothole impact or accident for both alignment to be knocked and for a balance weight to be lost. In this case, both procedures are needed.

When you have new tyres fitted, Tyre Rescue balances as part of the service. If you also notice pulling or uneven wear, we recommend booking an alignment check separately with a four-wheel alignment specialist — we can advise on recommended local alignment centres if required.

---

## Does Wheel Alignment Include Balancing?

No. They are completely separate procedures using different equipment:
- Alignment uses a wheel alignment rack with sensors on each wheel
- Balancing uses a balancing machine that spins the individual wheel

A four-wheel alignment check will not tell you anything about balance, and vice versa.

---

## Scotland-Specific Note: Pothole Damage

Scotland's roads — particularly rural A and B roads — are among the most pothole-prone in the UK. A hard pothole impact can:
- Knock wheel alignment out of specification in a single hit
- Knock off a balance weight
- Cause sidewall damage requiring tyre replacement

After any significant pothole impact, check your tyres for sidewall damage first, then arrange both an alignment and balance check if the car is pulling or vibrating.

---

Tyre Rescue provides mobile tyre fitting with balancing included across all of Scotland. Call **0141 266 0690** or [book online](/book).

[Uneven tyre wear guide](/blog/uneven-tyre-wear-guide-scotland) | [Vibration after new tyres](/blog/car-vibrating-after-new-tyres-scotland) | [Tyre rotation guide](/blog/tyre-rotation-guide-scotland)`,
  },
  {
    slug: 'tpms-warning-light-scotland',
    title: 'TPMS Warning Light On? What It Means and What to Do in Scotland',
    description:
      'Your TPMS warning light is on — should you stop immediately or can you keep driving? What causes the light, how to reset it, and when to call for tyre fitting in Scotland.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'tpms warning light scotland',
      'tyre pressure warning light scotland',
      'tpms light on scotland',
      'tyre pressure monitor system scotland',
      'what does tpms light mean',
      'tpms reset scotland',
      'tyre pressure light on scotland',
      'low tyre pressure warning light scotland',
    ],
    relatedSlugs: [
      'tyre-pressure-guide-scotland',
      'slow-puncture-causes-scotland',
      'can-i-drive-on-flat-tyre-scotland',
    ],
    content: `# TPMS Warning Light On? What It Means and What to Do in Scotland

The Tyre Pressure Monitoring System (TPMS) warning light — a horseshoe-shaped symbol with an exclamation mark — is one of the most commonly misunderstood dashboard lights. Here is exactly what to do when it comes on.

## What Does the TPMS Light Look Like?

The TPMS icon is a cross-section of a tyre with an exclamation point (!). Some vehicles show a light that:
- **Stays on solid**: one or more tyres is 25% or more below the recommended pressure
- **Flashes for 60–90 seconds then stays solid**: TPMS sensor malfunction, not a tyre pressure issue

## Can I Keep Driving?

**If the light comes on while driving**: do not panic. You do not need to stop immediately on the carriageway. Signal, find the nearest safe exit, and check your tyre pressures at a petrol station.

**If the light comes on and the car feels normal**: you likely have a slow puncture or gradual pressure loss. You can typically drive a short distance to safety or to check pressures.

**If the light comes on and the car feels different** — pulling to one side, steering feels heavy, ride feels strange — pull over safely and check immediately. Do not continue driving.

## Immediate Steps

1. **Stay calm** and do not brake sharply
2. **Find a safe place to stop** — a petrol station forecourt, car park, or layby
3. **Check all four tyre pressures** with a gauge (most petrol stations have one)
4. **Compare to your vehicle's recommended pressures** (driver's door sticker or fuel cap label)
5. **Inflate any low tyres** to the correct pressure
6. **Drive carefully** and monitor whether the light goes out

## What Causes the TPMS Light to Come On?

### 1. Gradual Pressure Loss — Most Common
Tyres naturally lose 1–2 PSI per month. In Scotland's variable temperatures, seasonal pressure drops are common. A tyre inflated to 32 PSI in summer may drop to 28–29 PSI in winter, enough to trigger the light.

**Fix**: inflate all four tyres to the recommended pressure. The light should go out automatically within a few miles on most vehicles.

### 2. Slow Puncture
A nail or screw in the tread causes gradual air loss — sometimes over hours or days. The TPMS will eventually trigger.

**Signs**: the affected tyre looks slightly lower than the others; pressure loss keeps recurring after inflation; you can sometimes hear a faint hissing.

**Fix**: call Tyre Rescue — we will identify the puncture and either repair (if BSAU159-compliant) or replace the tyre. Do not repeatedly reinflate a tyre that keeps losing pressure.

### 3. Temperature Drop
Cold weather causes air to contract, reducing tyre pressure. In Scotland, temperatures can drop 10–15°C overnight in autumn and winter, which lowers pressure by approximately 1 PSI per 10°F (5.5°C) drop.

**Fix**: inflate tyres to the manufacturer's recommended cold pressure. Scottish drivers should check pressures more frequently from October onward.

### 4. TPMS Sensor Battery Failure
Each wheel has a battery-powered sensor with a typical lifespan of 5–10 years. When the sensor battery fails, the system cannot report pressure and triggers the warning.

**Signs**: the light flashes for 60–90 seconds on startup before staying solid. The light is not going off after you inflate the tyres.

**Fix**: the sensor needs replacing. This is a job for a tyre fitter — the sensor is inside the wheel and requires dismounting the tyre.

### 5. TPMS Sensor Damage
Sensors can be damaged by:
- Aggressive tyre changes (non-specialist fitters)
- Pothole impacts
- Corrosion on older alloy wheels (common in Scotland due to salted winter roads)

**Fix**: sensor replacement. A new OEM-equivalent TPMS sensor typically costs £25–£50 plus fitting. We carry common TPMS sensors in our vans.

### 6. Wheel Change Without TPMS Reset
After changing winter or summer tyres, the TPMS must be recalibrated to the new sensor set. If this is not done, the light will remain on even though pressures are correct.

**Fix**: TPMS reset/relearn. Tyre Rescue performs this as standard after every seasonal changeover and new tyre fitment.

## TPMS Warning Light After New Tyres

If your TPMS light comes on after having new tyres fitted, the most likely cause is:
- The sensors were not reset after fitting (fix: TPMS relearn procedure)
- A sensor was damaged during the tyre change (fix: sensor replacement)
- The new tyre size is different from what the sensor is calibrated for (fix: TPMS recalibration)

This is why it matters who fits your tyres. Tyre Rescue always performs a TPMS check and reset after every fitting.

## TPMS and MOT

A faulty TPMS light that cannot be resolved will result in an MOT advisory or fail depending on when the vehicle was first registered:
- Vehicles first registered after **November 2012**: TPMS failure = MOT fail
- Vehicles registered before this date: advisory only

Scotland's MOT testers will check that the TPMS light illuminates during the bulb check and goes out when the engine is running with correct pressures.

## Quick Reference

| Light behaviour | Most likely cause | Action |
|---|---|---|
| Steady on, car feels normal | Low pressure / seasonal drop | Check and inflate all 4 tyres |
| Steady on, car pulls to one side | Significant loss / puncture | Stop safely, call Tyre Rescue |
| Flashing 60–90s then steady | Sensor battery / malfunction | Book sensor inspection |
| On after new tyre fitting | TPMS not reset | Call fitter for reset |
| On and off intermittently | Sensor fault or borderline pressure | Check pressures, book inspection |

---

Call **0141 266 0690** for mobile tyre fitting across Scotland — we handle TPMS sensor replacement, tyre fitting, and reset as a complete service.

[Tyre pressure guide Scotland](/blog/tyre-pressure-guide-scotland) | [Slow puncture causes](/blog/slow-puncture-causes-scotland) | [Can I drive on a flat tyre?](/blog/can-i-drive-on-flat-tyre-scotland)`,
  },
  {
    slug: 'do-i-need-to-change-all-4-tyres-scotland',
    title: 'Do I Need to Change All 4 Tyres at Once in Scotland?',
    description:
      'Do you have to replace all four tyres at the same time? When replacing one or two is fine, when all four are needed, and the rules for AWD, PHEV, and EV vehicles in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'do i need to change all 4 tyres scotland',
      'replace all tyres at once scotland',
      'change one tyre or two scotland',
      'tyre replacement rules scotland',
      'how many tyres do i need to change scotland',
      'replace two tyres or four scotland',
      'AWD tyre replacement scotland',
      'is it ok to replace one tyre scotland',
    ],
    relatedSlugs: [
      'tyre-rotation-guide-scotland',
      'uneven-tyre-wear-guide-scotland',
      'subaru-tyre-fitting-scotland',
    ],
    content: `# Do I Need to Change All 4 Tyres at Once in Scotland?

This is one of the most common questions we hear from Scottish drivers. The answer depends on your vehicle type, the condition of your existing tyres, and the reason for replacement.

## The Short Answer

**No — you do not always need to change all four tyres at once.** But there are rules about how many you must change to maintain safety and vehicle function.

---

## Rule 1: Always Replace Tyres in Pairs (Same Axle)

This is the most important rule. Whenever possible, replace both tyres on the same axle at the same time.

**Why**: tyres on the same axle must maintain similar traction in all conditions. If one tyre is new (8mm tread) and the other is old (2–3mm tread), the two tyres will behave differently in braking and cornering. This creates instability and longer stopping distances.

**The exception**: if only one tyre is damaged (e.g., a sidewall bubble or deep cut) and the other three tyres have reasonable tread depth (4mm+), replacing just the damaged tyre may be acceptable as a short-term measure. However:
- The replacement tyre should be the same brand, model, and size as the other tyre on that axle
- If there is a significant tread depth difference (over 3mm), replace both

---

## Rule 2: Better Tyres Go on the Rear

If you replace only two tyres (e.g., front axle due to higher wear), the newer tyres should be fitted to the rear, and the better existing tyres moved to the front.

**Why**: rear tyre loss of grip (oversteer) is harder to control than front tyre loss of grip (understeer). Newer, higher-tread tyres on the rear provide better stability in emergency situations.

This is a recommendation, not a legal requirement — but it is standard practice and the approach Tyre Rescue follows unless the vehicle is AWD (see below).

---

## Rule 3: AWD Vehicles — Replace in Sets of Four (or Matched Pairs)

All-wheel-drive vehicles have an important additional requirement.

On Subaru symmetrical AWD (Outback, Forester, XV, Impreza, WRX), replacing only two tyres can damage the centre differential and AWD system.

Subaru's AWD works by distributing torque based on tyre speed differences. If two tyres are significantly different in diameter from the other two (due to different tread wear), the system is constantly trying to correct an apparent difference that does not represent a real wheel slip. Over time, this stresses and can damage the differential.

**Subaru rule**: tyres must match within 1/32" (about 0.8mm) of diameter between all four. In practice, this means replacing in matched pairs from the same purchase batch, or replacing all four.

**Other AWD vehicles** (Quattro, xDrive, 4Motion, e-AWD): similar considerations apply but the specific tolerance varies. Consult your handbook. As a general rule, AWD vehicles should have matching tyres with similar tread depths across all four.

---

## Rule 4: EV and PHEV — Usually Replace in Axle Pairs

Most EVs and PHEVs are either RWD or AWD. For AWD electric vehicles, the same AWD rules as above apply.

For RWD EVs (Tesla Model 3 RWD, MG4 Standard Range), axle-pair replacement is standard.

EVs with instant torque delivery wear rear tyres faster than fronts. It is common to replace rear tyres twice for every front replacement on some high-torque EV models. This is normal.

---

## When You Should Replace All Four

**If all four tyres are approaching the end of their life**: if three tyres have 3–4mm and one has burst or failed, replacing all four makes financial sense — the other three will need replacing within a few thousand miles anyway.

**After a wheel alignment correction**: if your vehicle has been driven with significant misalignment and all four tyres show uneven wear, replacing all four ensures you start fresh with matched wear going forward.

**If your car is AWD (see above)**: for Subaru symmetrical AWD especially, replace in sets of four.

**For performance driving**: if you use your car for track days or spirited driving, matching all four tyres for consistent handling is important.

---

## Quick Reference Table

| Scenario | Minimum Replace |
|---|---|
| One tyre punctured / damaged | 1 (ideally replace paired axle tyre too) |
| One tyre worn below limit | 2 (both on that axle) |
| Both front tyres worn | 2 front (move best existing to rear) |
| AWD vehicle — one tyre damaged | 4 (Subaru) or 2 matched pair (other AWD) |
| All four worn | 4 |
| EV (RWD) — rear tyres worn | 2 rear |

---

## Cost Consideration

Tyre Rescue charges £20 per tyre for fitting and balancing. Tyre prices depend on brand and size.

If you are replacing two tyres, you save on the pair you do not replace — but if those tyres are in poor condition, they will need replacing again soon and you will pay the fitting fee again. Sometimes replacing four is better value over 12 months.

When you call or book online, tell us your existing tyre tread depths — we can advise on the most cost-effective approach for your specific situation.

Call **0141 266 0690** or [book online](/book) for mobile tyre fitting across Scotland.

[Tyre rotation guide Scotland](/blog/tyre-rotation-guide-scotland) | [Subaru AWD tyre guide](/blog/subaru-tyre-fitting-scotland) | [Uneven tyre wear guide](/blog/uneven-tyre-wear-guide-scotland)`,
  },
  {
    slug: 'can-i-drive-on-flat-tyre-scotland',
    title: 'Can I Drive on a Flat Tyre? What to Do in Scotland',
    description:
      'Can you drive on a flat tyre to a garage in Scotland? How far, how fast, and what damage it causes. What to do instead — plus when it is safer to drive slowly vs call for help.',
    category: 'emergency',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'can i drive on a flat tyre scotland',
      'driving on flat tyre scotland',
      'how far can you drive on a flat tyre',
      'flat tyre driving to garage scotland',
      'can you drive on a puncture scotland',
      'what to do flat tyre scotland',
      'flat tyre can i keep driving',
      'driving on deflated tyre scotland',
    ],
    relatedSlugs: [
      'tyre-sidewall-damage-scotland',
      'slow-puncture-causes-scotland',
      'what-to-do-flat-tyre-motorway',
    ],
    content: `# Can I Drive on a Flat Tyre in Scotland?

Getting a flat tyre is stressful, and the immediate instinct is often to keep moving — especially if you are on a busy road, late for something, or far from a garage. The short answer is: **driving on a completely flat tyre causes rapid, serious damage and should only be done for a very short distance in an emergency.**

Here is the complete picture.

## What Happens When You Drive on a Flat Tyre

A pneumatic tyre works because the air pressure inside supports the vehicle's weight. When a tyre is completely flat:

1. **The weight transfers to the tyre sidewall** — instead of distributing weight across the inflated tyre profile, the rim sits directly on the tyre's sidewall. The sidewall is not designed for this.

2. **The sidewall folds and creases with every rotation** — this rapidly destroys the internal cords and the rubber compound. A tyre driven flat for 200 metres often has significant internal damage.

3. **The rim contacts the road** — once the tyre is destroyed, the bare metal rim starts grinding against the tarmac. This permanently damages the rim and creates sparks.

4. **Braking and steering become severely impaired** — a flat tyre means dramatically longer stopping distances and imprecise steering. At speed, this is a serious safety risk.

5. **Risk of rim damage** — alloy wheels bent or cracked by driving flat are a significant additional cost (£150–£800+ to repair or replace).

## How Far Can You Drive on a Flat Tyre?

**The honest answer: almost no distance at all, at very low speed.**

| Speed | Distance | Outcome |
|---|---|---|
| Walking speed (5 mph) | 50–100 metres | Tyre possibly survivable |
| Slow road speed (10–15 mph) | 100–300 metres | Tyre likely destroyed |
| Normal road speed (30+ mph) | Even 50 metres | Tyre destroyed, rim at risk |
| Motorway speed (70 mph) | Do not attempt | Immediate loss of control risk |

If you are asking "can I drive to the next petrol station half a mile away" — the honest answer is: you can physically try, but by the time you get there, the tyre will be destroyed and you may have damaged the wheel too. A destroyed tyre costs more to replace than a repairable one would have.

## Exception: Run-Flat Tyres

**If your vehicle is fitted with run-flat tyres** (BMW RSC, Mercedes EMT/MOExtended, Pirelli Run-Flat), the situation is different. Run-flat tyres are specifically designed to continue operating after a puncture.

A run-flat tyre that has lost pressure can typically be driven at:
- **Maximum 50 mph (80 km/h)**
- **Maximum 50 miles (80 km)**

after which it must be replaced (run-flat tyres cannot be repaired after operating flat).

**How to know if you have run-flat tyres**: look for the marking on the sidewall — RSC (BMW), EMT or MOExtended (Mercedes-Benz), SSR (Goodyear), RF (Pirelli). Also, vehicles with run-flat tyres typically have no spare wheel.

If you are not sure whether your car has run-flat tyres, assume it does not — and treat the flat as requiring immediate stopping.

## What to Do Instead

**Option 1: If you have a spare tyre** — use it. A full-size spare can be fitted at the roadside. A space-saver spare is for temporary use only — maximum 50 mph, up to 50 miles. Replace with a proper tyre as soon as possible.

**Option 2: Call for mobile tyre fitting** — Tyre Rescue attends locations across all of Scotland. Response times in cities: 25–45 minutes. If you are on a safe verge, in a car park, or in a layby — calling for fitting is the right choice. You will have a fully functional tyre fitted at your location in under an hour.

**Option 3: Use an inflation kit** (if you have one and the puncture is in the tread area, not the sidewall) — inflate enough to reach a safe location. Maximum 50 mph after inflation. Get to a tyre centre or call Tyre Rescue as soon as possible.

## The Specific Scenarios

### Flat tyre on a live road or motorway
**Do not drive**. Put hazard lights on. Move to the hard shoulder (motorway) or as far left as possible. Call **0141 266 0690** or 999 if unsafe. Wait for help.

### Flat tyre in a car park or on your driveway
You are in the safest possible situation. Call for mobile fitting — Tyre Rescue will come to you. There is no need to drive anywhere.

### Slow puncture (tyre going flat gradually)
You have time to react. Inflate at a petrol station air pump and drive carefully to a tyre centre or call Tyre Rescue. Do not drive at motorway speed on a significantly underinflated tyre.

### Flat tyre on a single-track Highland road
Find the nearest passing place and stop safely. Call **0141 266 0690** and give us your location. We will advise on response time. Do not drive on a single-track road with a flat tyre — the uneven surface will destroy the tyre and rim within metres.

## The Bottom Line

Driving on a completely flat tyre causes expensive tyre and potentially wheel damage within a very short distance. The right call is almost always:

1. Stop safely
2. Call Tyre Rescue on **0141 266 0690** for mobile fitting

We come to you anywhere in Scotland — no need to risk the tyre, the wheel, or your safety by driving on flat.

[What to do with a flat tyre on a motorway](/blog/what-to-do-flat-tyre-motorway) | [Slow puncture guide Scotland](/blog/slow-puncture-causes-scotland) | [Run-flat tyres guide Scotland](/blog/run-flat-tyres-scotland-guide)`,
  },
  {
    slug: 'mobile-tyre-fitting-process-scotland',
    title: 'What Happens During Mobile Tyre Fitting in Scotland: Step by Step',
    description:
      'Not sure what to expect when you book mobile tyre fitting in Scotland? Complete guide to the booking process, what the technician does, how long it takes, and what you need to have ready.',
    category: 'fitting',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'mobile tyre fitting process scotland',
      'what happens during mobile tyre fitting',
      'how does mobile tyre fitting work scotland',
      'mobile tyre fitting what to expect scotland',
      'tyre fitting how long does it take scotland',
      'book mobile tyre fitting scotland',
      'mobile tyre fitting steps scotland',
    ],
    relatedSlugs: [
      'mobile-tyre-fitting-glasgow-guide',
      'tyre-prices-scotland-guide-2026',
      'tyre-buying-guide-scotland',
    ],
    content: `# What Happens During Mobile Tyre Fitting in Scotland

Mobile tyre fitting can seem mysterious if you have never used the service before — you may wonder what equipment turns up, how long it takes, whether you need to be present, and what condition your car needs to be in. This guide walks you through the entire process.

## Step 1: Booking

**Online or phone**: you can book via tyrerescue.uk/book or call **0141 266 0690**.

**What we need at booking**:
- Your vehicle registration (so we can confirm the correct tyre size and load index)
- Your location — home address, work postcode, or where your car is stranded
- Contact number so we can call when close
- Whether you want a specific brand or just the best available at your budget
- For emergency callouts: your exact location as a postcode + landmark description

**Response time**: emergency callouts (stranded) typically 30–60 minutes to most Scottish cities. Scheduled appointments can be booked same-day or in advance for a convenient time.

## Step 2: Technician Arrives

The Tyre Rescue technician arrives in a dedicated mobile fitting van carrying:

- A broad selection of tyres in common sizes
- A pneumatic impact wrench (to remove and fit wheel nuts quickly and accurately)
- A tyre mounting machine (to demount old tyres and mount new ones onto the wheel)
- A dynamic wheel balancing machine (to balance the wheel and tyre combination)
- Tyre levers and bead-seating equipment
- A torque wrench (calibrated to your vehicle's specification)
- TPMS reset tools (for vehicles with tyre pressure monitoring)
- Valve stems and TPMS sensors (common sizes)
- A compressor and gauges

**The van is self-contained**: unlike a garage, there is no fixed workshop. Everything needed to fit, balance, and check tyres is in the van.

## Step 3: Vehicle Assessment

Before removing any tyre, the technician will:

1. **Confirm your vehicle registration and verify the tyre size** — what is currently fitted will be confirmed against the manufacturer's specification
2. **Check the existing tyre** — assess the damage, confirm whether repair is possible or replacement is needed, and note any uneven wear patterns that might indicate an alignment issue
3. **Check the other three tyres** — a quick visual check for any safety concerns (sidewall bulges, very low tread)

**If you asked for a puncture repair**: the technician will assess whether the puncture location is in the repairable zone (central 75% of tread) and whether the hole is within the repairable diameter (up to 6mm). If it is not repairable, you will be told before any work begins.

## Step 4: Removing the Wheel

1. **Loosen wheel nuts** (slightly) before raising the vehicle — this prevents the wheel spinning
2. **Jack up the vehicle** on the correct jacking point (the technician knows where this is for your vehicle)
3. **Remove the wheel** and place it on a clean surface

**You do not need to help or touch anything** — just confirm the technician is ready and step back.

**If you have locking wheel nuts**: you will need to provide the locking wheel nut key. Most drivers keep it in the car boot or glovebox. If you cannot find it, some locksmiths offer locking nut removal — but this adds time.

## Step 5: Tyre Demounting and Inspection

The wheel is placed on the tyre mounting machine in the van:

1. **Deflate the tyre** completely
2. **Break the bead** (separate the tyre from the rim on both sides)
3. **Demount the tyre** from the rim using the mounting machine
4. **Inspect the inside of the tyre** — for puncture repair, or to confirm the old tyre can be disposed of

**For a puncture repair**: the inner liner is inspected, the penetration is marked and assessed for repairability. A BSAU159-compliant mushroom plug-patch is fitted (see our [repair standards guide](/blog/tyre-repair-standards-scotland-bsau159)).

**For a replacement**: the old tyre is set aside for disposal. New tyre is prepared.

## Step 6: Mounting the New Tyre

1. **Lubricate the bead** — tyre lubricant is applied to both bead edges of the new tyre and the rim, ensuring smooth seating without damage
2. **Mount the tyre** — the mounting machine presses the tyre onto the rim
3. **Seat the bead** — the tyre is inflated rapidly to seat the bead on both sides with an audible pop
4. **Inflate to the correct pressure** — the pressure is set to the manufacturer's specification for your vehicle and loading condition

**Correct pressure**: the technician inflates to the correct cold pressure listed on the door sticker. You do not need to do anything — this is handled.

## Step 7: Wheel Balancing

The wheel is placed on the balancing machine, which spins it at speed and measures imbalance.

1. **Spin test** — the machine identifies where imbalance exists and how severe
2. **Weight placement** — small counter-weights are clipped or attached to the rim at the precise position identified by the machine
3. **Re-spin** — the wheel is spun again to confirm balance is within tolerance

**Good balance is critical for smooth driving and tyre longevity.** Balancing is included in Tyre Rescue's standard fitting fee.

## Step 8: Fitting the Wheel Back on the Car

1. **Clean the hub face** — the technician wipes the hub face (where the wheel mates to the car) clean. Grit on the hub face can cause vibration.
2. **Fit and tighten the wheel** — wheel nuts are tightened in a star pattern by hand first, then with the impact wrench
3. **Torque to specification** — the torque wrench is set to the manufacturer's wheel nut torque (typically 100–140 Nm) and each nut is confirmed to specification
4. **Lower the vehicle** from the jack
5. **Final torque check** — some fitters re-torque after lowering, which is correct practice

## Step 9: TPMS Reset (If Applicable)

If your vehicle has TPMS (tyre pressure monitoring system), the system may need resetting after a tyre or sensor change. The technician will:

- Check whether TPMS reset is needed (most vehicles with indirect TPMS reset automatically when you drive)
- Use a TPMS reset tool or vehicle menu for vehicles with direct sensors
- Inform you of any additional steps needed while driving (some vehicles require driving 15+ mph for the system to calibrate)

## How Long Does Mobile Tyre Fitting Take?

| Work | Time |
|---|---|
| Single tyre replacement | 20–35 minutes |
| Two tyres (same axle) | 35–55 minutes |
| Four tyres (full set) | 60–90 minutes |
| Puncture repair | 20–30 minutes |

Add 5–10 minutes for arrival setup and an initial assessment on the first visit.

## Do You Need to Be Present?

For a scheduled appointment at your home or work: **ideally yes, but not always necessary.**

You do need to:
- Have confirmed the tyre to be fitted before the appointment
- Ensure the vehicle is accessible and on level ground
- Provide locking wheel nut keys if fitted
- Be available to confirm the work is complete and pay

For emergency roadside callouts: **yes, you should remain with the vehicle.**

## What You Need to Have Ready

- **Locking wheel nut key** (if your car has locking nuts)
- **Confirmation of your vehicle's correct tyre spec** (the technician will confirm this, but knowing your size helps)
- **Payment method** — card, Apple Pay, or bank transfer

Call **0141 266 0690** or [book online](/book) for mobile tyre fitting anywhere in Scotland.

[Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026) | [BSAU159 repair standards](/blog/tyre-repair-standards-scotland-bsau159) | [Mobile tyre fitting Glasgow guide](/blog/mobile-tyre-fitting-glasgow-guide)`,
  },
  {
    slug: 'hybrid-car-tyres-scotland',
    title: 'Hybrid Car Tyres Scotland: What You Need to Know for HEV, MHEV & PHEV',
    description:
      'Do hybrid cars need special tyres in Scotland? Guide to mild hybrid (MHEV), full hybrid (HEV), and plug-in hybrid (PHEV) tyre requirements, load index, and fitting advice.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 7,
    featured: false,
    keywords: [
      'hybrid car tyres scotland',
      'PHEV tyre load index scotland',
      'hybrid tyre requirements scotland',
      'plug in hybrid tyres scotland',
      'MHEV tyre scotland',
      'full hybrid tyres scotland',
      'do hybrids need special tyres scotland',
      'Toyota hybrid tyre scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'tyre-buying-guide-scotland',
      'toyota-tyre-fitting-scotland',
    ],
    content: `# Hybrid Car Tyres Scotland: HEV, MHEV, and PHEV

Hybrid vehicles now make up a significant proportion of new car sales in Scotland — and they come in three distinct types with different tyre implications. Many Scottish drivers are unsure whether their hybrid needs special tyres, or whether a standard tyre will do. This guide explains the differences.

## The Three Types of Hybrid: What They Mean for Tyres

### MHEV — Mild Hybrid Electric Vehicle

**Examples**: Ford Puma MHEV, Suzuki Swift MHEV, Vauxhall Corsa, VW Golf eTSI, Mercedes A-Class EQ Boost, Hyundai i30 MHEV.

**How it works**: a small 48V battery and motor-generator assist the engine briefly during acceleration. The battery recovers energy under braking but cannot power the car alone at any speed.

**Tyre implication**: **no special tyre needed**. MHEVs are only marginally heavier than their petrol equivalents. The standard tyres recommended for the petrol version of the same car are identical to those needed for the MHEV. No load index uplift is required.

**Bottom line**: treat your MHEV tyre the same as any petrol car of the same model.

---

### HEV — Full Hybrid (Self-Charging Hybrid)

**Examples**: Toyota Yaris Hybrid, Toyota Corolla Hybrid, Toyota RAV4 Hybrid, Honda Jazz e:HEV, Honda CR-V e:HEV, Lexus UX 300h, Kia Niro HEV.

**How it works**: a larger battery that can power the car at low speeds alone. Automatically switches between petrol and electric power. Cannot be plugged in.

**Tyre implication**: **load index is slightly higher than petrol equivalent**. The HEV carries a larger battery than the MHEV (though smaller than the PHEV), adding 80–150 kg. In most cases, the vehicle manufacturer has accounted for this in the standard tyre specification — but verify the load index on your specific model before fitting tyres.

**Toyota Yaris example**: the Yaris 1.0 petrol uses 195/55R16 tyre with load index 87. The Yaris Hybrid uses 195/55R16 with load index **91** (a 4-point increase). Same tyre size, different load index. Fitting the 87 LI tyre to a Yaris Hybrid is incorrect.

**Bottom line**: confirm your HEV's required load index before fitting — do not assume it is the same as the petrol version. Tyre Rescue checks this for every vehicle before fitting.

---

### PHEV — Plug-In Hybrid Electric Vehicle

**Examples**: Toyota RAV4 PHEV, Mitsubishi Outlander PHEV, Kia Sportage PHEV, Vauxhall Astra GSe PHEV, Ford Kuga PHEV, BMW 3 Series 330e, Volvo XC60 T8 PHEV, Audi Q5 TFSI e.

**How it works**: a large battery (8–20+ kWh) that can be plugged in and powers the car for 20–50 miles electrically before the petrol engine takes over.

**Tyre implication**: **significantly higher load index required**. PHEVs are substantially heavier than petrol or HEV equivalents — typically 200–400 kg heavier. This has a direct impact on tyre load index requirements.

**Specific examples**:

| Model | Petrol LI | PHEV LI Required |
|---|---|---|
| Kia Sportage petrol | 98 | 104 (PHEV) |
| Toyota RAV4 HEV | 100 | 104 (PHEV) |
| Volvo XC60 petrol | 99 | 102 (T8 PHEV) |
| Volvo XC90 petrol | 103 | 108 (T8 PHEV) |
| Audi Q5 petrol | 99 | 105 (55 TFSI e) |
| BMW 330e | 99 | 103 |
| Vauxhall Grandland GSe PHEV | 98 | 103 |

**Fitting a tyre with the petrol load index on a PHEV is illegal and dangerous.** The tyre cannot safely carry the vehicle's weight at maximum load.

**Bottom line**: always specify that your vehicle is a PHEV when ordering tyres or calling a tyre fitter. The load index must match the PHEV specification, not the petrol equivalent.

---

## How to Find the Correct Load Index for Your Hybrid

1. **Check your vehicle handbook** — lists the exact tyre specification including load index for your model
2. **Check the tyre pressure sticker** — usually inside the driver's door frame; shows the tyre size and sometimes load index
3. **Ask your tyre fitter** — Tyre Rescue confirms load index from the vehicle registration before fitting any tyre
4. **Do not rely on the existing tyre** — if a previous owner fitted the wrong load index, you would be copying that error

---

## Other Hybrid Tyre Considerations

**Tyre wear rate**: PHEVs and HEVs are heavier than petrol equivalents, so tyre wear is modestly higher. However, the regenerative braking used by most hybrids (which slows the car without applying the brake pads) actually reduces brake heat transfer to the tyres, which can partially offset the wear from extra weight.

**EV mode and tyre noise**: when a PHEV or HEV is running in electric mode (no petrol engine running), road and tyre noise become much more audible. If you notice your tyres sound loud in electric mode but quiet with the engine running — this is normal. The engine was masking the tyre noise. Acoustic foam-lined tyres reduce this.

**Tyre pressure for PHEV**: PHEV tyre pressures are often different from the petrol version due to the additional weight. The door sticker or handbook will specify PHEV pressures — confirm these after fitting.

## Book Mobile Tyre Fitting for Your Hybrid in Scotland

Tyre Rescue fits tyres for all hybrid types across Scotland. We confirm the correct load index before any fitting and carry a broad range of common hybrid sizes in our mobile vans.

Call **0141 266 0690** or [book online](/book) — cover all of Scotland 24 hours.

[EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland) | [Tyre buying guide Scotland](/blog/tyre-buying-guide-scotland) | [Kia tyre fitting Scotland](/blog/kia-tyre-fitting-scotland)`,
  },
  {
    slug: 'tyre-repair-standards-scotland-bsau159',
    title: 'Legal Tyre Repair Standards in Scotland: BSAU159 Explained',
    description:
      'Is your tyre puncture repair legal? BSAU159 defines the only legal repair standard in the UK. Plug-only repairs are illegal. What a compliant repair looks like and what to do if you have an illegal repair.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 7,
    featured: false,
    keywords: [
      'BSAU159 tyre repair scotland',
      'legal tyre repair scotland',
      'plug and patch tyre repair scotland',
      'is plug only repair legal scotland',
      'tyre repair standards uk',
      'permanent tyre repair scotland',
      'illegal tyre repair scotland',
      'mushroom plug tyre repair',
    ],
    relatedSlugs: [
      'slow-puncture-causes-scotland',
      'tyre-sealant-spray-vs-repair-scotland',
      'part-worn-tyres-scotland-are-they-safe',
    ],
    content: `# Legal Tyre Repair Standards in Scotland: BSAU159

When a tyre has a puncture, the only legal method of permanent repair in the UK is defined by British Standard **BSAU159** — the standard for the repair of pneumatic tyres used on motor vehicles. Understanding this matters because non-compliant repairs are common, and a tyre repaired incorrectly can fail catastrophically.

## What BSAU159 Requires

A compliant BSAU159 tyre repair must:

1. **Involve removing the tyre from the rim** — the tyre must be completely demounted so the inside can be inspected
2. **Inspect the interior** — the inner liner must be examined for damage. Many penetrations that look minor from the outside have caused internal cord damage that makes the tyre unrepairable
3. **Use a proper repair unit** — a combined plug-and-patch, also called a mushroom or combination repair. This consists of:
   - A **stem** (the plug) that fills the penetration hole from inside outward
   - A **cap** (the patch) that bonds to the inner liner, sealing the repair from the inside
4. **Be vulcanised** — the repair is bonded using heat or chemical vulcanisation, creating a permanent bond between the repair unit and the tyre liner
5. **Only be applied in the repairable zone** — the central 75% of the tread width

A repair that meets all these criteria is permanent, safe, and legal.

## The Illegal Repair: Plug-Only

The most common illegal repair in the UK is the **plug-only or string-plug repair**.

This involves inserting a rope or rubber string into the puncture hole from the outside of the tyre, without removing the tyre from the rim. It is:

- Quick (takes 2–5 minutes)
- Cheap (sometimes offered for £5–£10)
- Commonly offered at petrol stations, car washes, and some small garages
- **Illegal under BSAU159**
- **Dangerous**

Why is a plug-only repair dangerous?

1. **The interior cannot be inspected** — you cannot see whether the penetration has caused internal cord damage. A tyre with cord damage that looks externally repairable may fail.
2. **The stem seals the penetration but the inner liner is not patched** — air can migrate through the cord material inside the tyre body and escape around the plug stem over time.
3. **Plugs can pull out** — if the penetrating object caused a slightly irregular hole, the plug may not seal completely and can pull through at high speed.
4. **No record or traceability** — unlike a proper repair at a tyre centre, there is no documentation and no accountability if the repair fails.

**BSAU159 explicitly states that plug-only repairs do not meet the standard.** Any reputable tyre fitter in Scotland using the full mushroom plug-patch and vulcanisation method is BSAU159 compliant. Plug-only is not.

## What a BSAU159-Compliant Repair Looks Like

You will not see most of the repair from outside the vehicle — the stem fills the puncture hole and may be visible only as a small protrusion inside the tyre. What you should see from the tyre fitter:

1. **The tyre is removed from the rim** — you should see it taken off the wheel
2. **The inside is inspected** — the fitter looks inside with a torch and feels the liner
3. **The repair unit is fitted from inside** — not externally with a string
4. **The tyre is remounted and balanced**

If a "repair" is offered without removing the tyre from the rim, it is a plug-only repair and does not comply with BSAU159.

## When a Tyre Cannot Be Repaired

BSAU159 also defines when a tyre **cannot** be repaired:

**Location**: the penetration must be in the central three-quarters of the tread width. Penetrations in the shoulder or sidewall cannot be repaired.

**Size**: the penetration must be no more than 6mm in diameter for car tyres (up to 4mm for some high-speed-rated tyres).

**Depth**: the penetration must not have damaged the main structural cords of the tyre.

**Multiple repairs**: there are limits on the number of repairs permissible per tyre and minimum distances between repairs.

**Previous improper repair**: a tyre that has been previously plug-only repaired should be inspected carefully — the plug-only repair has damaged the inner liner and may have compromised the area. Many fitters will not repair a tyre with a previous string plug.

**Driven while flat**: if the tyre was driven on while flat (even briefly), internal damage from rim contact is likely, making repair unsafe.

## What to Do If You Have an Illegal Repair

If you received a plug-only repair and are concerned:

1. **Have the tyre inspected** — a BSAU159-compliant tyre fitter can remove the tyre and assess whether the internal damage is repairable or whether replacement is necessary.

2. **If the tyre shows no internal cord damage**: it is possible to do a proper repair on top of a plug — the plug is removed, the area cleaned, and a mushroom plug-patch installed properly.

3. **If the tyre shows cord damage**: the tyre must be replaced.

Do not drive at motorway speed or for extended distances on a plug-only repair if you are uncertain about its safety.

## Tyre Rescue Repair Standards

Every puncture repair carried out by Tyre Rescue follows BSAU159:

- Tyre removed from rim
- Full interior inspection
- Combination mushroom plug-patch repair unit
- Vulcanised bond
- Tyre remounted and balanced

**Cost**: £25 per tyre for a BSAU159-compliant puncture repair at your location across Scotland.

Call **0141 266 0690** or [book online](/book).

[Slow puncture guide Scotland](/blog/slow-puncture-causes-scotland) | [Tyre sealant vs repair guide](/blog/tyre-sealant-spray-vs-repair-scotland) | [Part-worn tyres safety guide](/blog/part-worn-tyres-scotland-are-they-safe)`,
  },
  {
    slug: 'driving-snow-ice-tyre-advice-scotland',
    title: 'Driving in Snow and Ice in Scotland: Tyre Advice and Safety Guide',
    description:
      'Preparing your tyres for snow and ice in Scotland. What tyre tread depth you need, snow driving technique, when to stay home, and what to do if you get stuck or have a flat in winter.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 8,
    featured: false,
    keywords: [
      'driving in snow scotland tyres',
      'winter driving scotland tyre advice',
      'driving on ice scotland',
      'tyre advice driving snow scotland',
      'scotland snow driving tips',
      'when not to drive in snow scotland',
      'safe driving winter tyres scotland',
      'tyres snow ice scotland guide',
    ],
    relatedSlugs: [
      'winter-tyres-scotland-buyers-guide-2026',
      'all-season-tyres-scotland-guide',
      'aquaplaning-prevention-scotland',
    ],
    content: `# Driving in Snow and Ice in Scotland: Tyre Advice

Scotland gets genuine winter conditions most years — not just in the Highlands, but in the Central Belt, Aberdeenshire, and coastal areas too. Snow in Glasgow is rare but real; snow on the A9, A82, and A702 is common from November to March.

Your tyres are the single most important factor in winter traction. This guide covers what your tyres need to handle Scottish winter conditions — and how to drive when they are not perfect.

## The Critical Threshold: 7°C and Below

The most important thing to understand about winter tyre safety is the **7°C temperature threshold**.

At 7°C and below, summer tyre compounds begin to harden significantly. The rubber loses flexibility, which means:
- Braking distance increases substantially — even on dry cold tarmac
- Wet grip deteriorates
- Any grip on snow or ice becomes minimal

This is why countries with cold winters mandate winter tyres from November: it is not just about snow. It is about what happens to summer compound rubber at cold temperatures.

In Glasgow and Edinburgh, you may see nights of -3°C to -5°C from November through March. On these mornings, summer tyres on cold dry tarmac have significantly less grip than they did in September.

**All-season 3PMSF tyres** maintain adequate grip below 7°C. **Dedicated winter tyres** have the greatest grip at low temperatures.

## Tyre Requirements for Scottish Winter Driving

### Minimum Tread Depth for Safe Winter Driving

The legal minimum in Scotland is 1.6mm — but this is insufficient for winter driving.

| Tread Depth | Safety Assessment |
|---|---|
| 6mm+ | Excellent. Full winter capability. |
| 4–6mm | Good. Adequate for all Scottish winter conditions. |
| 3–4mm | Acceptable. Reduced capability in deep snow. |
| 2–3mm | Limited. Consider replacing before winter. |
| Below 2mm | Poor. Do not drive in snowy/icy conditions. |
| 1.6mm (legal limit) | Minimum legal — replace immediately. |

If your tyres are below 4mm and winter is approaching, book a replacement. Call Tyre Rescue on **0141 266 0690** for mobile fitting at your home or work before the first snow arrives.

### Tyre Type in Snow

**Summer tyres** — inadequate in snow. Even with 8mm tread, summer compound does not grip snow. Dangerous.

**All-season 3PMSF** — adequate in moderate snow (slush, light covering). Not suitable for deep snow or sustained ice.

**Winter tyres** — best performance in all snow and ice conditions.

**General rule**: in Scotland, all-season 3PMSF tyres are the minimum for safe winter driving on most routes. Drivers who regularly use Highland roads in winter should fit dedicated winter tyres.

## Driving Technique in Snow and Ice

Good tyres reduce the challenge of winter driving, but technique still matters.

### Speed and Stopping Distance

In snow, stopping distances increase enormously:
- At 30 mph on snow: stopping distance 6–10× longer than dry road
- At 50 mph: you may need 200–400 metres to stop safely

**Drive at a speed where you can stop within the distance you can see to be clear.** On fog-covered winter roads in Scotland, this may mean 20–30 mph.

### Acceleration

**Pull away gently in second gear** (on a manual) to reduce wheelspin. Many modern automatics have a winter or snow mode that limits torque and may also pull away in second.

If you start to wheelspin, ease off the accelerator. Do not increase throttle — this makes wheelspin worse.

### Braking

**Brake early and progressively**. Begin braking much earlier than normal — give the ABS time to work.

**On ice**: ABS helps but does not eliminate the extended stopping distance. The ABS pulsing feel is normal — keep pressure on the pedal.

**On compacted snow**: braking distances are very long. ABS helps prevent lockup but cannot reduce the fundamental low grip.

### Steering

**Steer smoothly and progressively**. Sudden steering inputs on slippery surfaces cause slides.

**If you begin to slide (oversteer)**: steer into the slide (turn the wheel in the direction the rear is moving). Release or reduce accelerator. Do not brake sharply.

**If the front is ploughing straight (understeer)**: reduce speed. Do not try to force the car to turn by increasing steering angle — this makes understeer worse. Back off the throttle or apply gentle braking.

## When to Stay Home

Not all Scottish winter conditions are driveable — even with the right tyres.

**Consider not driving if**:
- Heavy snowfall is actively occurring and roads are not yet treated
- Ice has formed overnight and there are reports of accidents in your area
- The A9, A82, M74, or other key roads are closed or restricted by Traffic Scotland
- Your planned route includes Highland single-track roads in icy conditions
- Your tyres are summer-only with low tread depth

Traffic Scotland provides live updates on road conditions: **traffic.gov.scot** or **0800 028 1414**.

## If You Get Stuck in Snow in Scotland

1. **Do not spin the wheels** — this buries you deeper. Try rocking the car: reverse slightly, drive forward slightly, building momentum.
2. **Reduce tyre pressure slightly** (5–10 psi) — this widens the contact patch. Re-inflate at the earliest opportunity.
3. **Use traction boards, sand, or a mat under the drive wheels** — some Scottish drivers carry a bag of road grit in winter.
4. **Call for help if stuck on a road** — Police Scotland (101), rescue services, or a recovery truck.

## Flat Tyre in Winter Scotland

Getting a flat tyre in Scottish winter conditions is a more serious emergency than in summer:

1. Pull over safely — snow-covered hard shoulders can hide debris and drops. Use hazard lights.
2. Do not change a tyre on a live road in winter without appropriate warning equipment.
3. Call Tyre Rescue on **0141 266 0690** — we attend winter callouts across Scotland.
4. If you have a spare and feel safe to change it, be cautious of slippery conditions around the vehicle.

**Keep Tyre Rescue's number in your phone before you drive in winter conditions.** A few seconds of preparation is worth hours of waiting for help.

Call **0141 266 0690** or [book online](/book) for winter tyre fitting across Scotland before the season begins.

[Winter tyres Scotland 2026 guide](/blog/winter-tyres-scotland-buyers-guide-2026) | [All-season tyres Scotland](/blog/all-season-tyres-scotland-guide) | [What to do in a tyre blowout](/blog/tyre-blowout-emergency-guide-scotland)`,
  },
  {
    slug: 'summer-vs-winter-vs-all-season-tyres-scotland',
    title: 'Summer vs Winter vs All-Season Tyres: Which is Best for Scotland?',
    description:
      'Summer, winter, or all-season tyres for Scotland? Head-to-head comparison by region, season, driver type, and budget. Make the right choice for Glasgow, Edinburgh, Highlands, and Islands.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 9,
    featured: false,
    keywords: [
      'summer vs winter tyres scotland',
      'all season tyres vs winter tyres scotland',
      'best tyre type for scotland',
      'should i get winter tyres scotland',
      'summer tyres vs all season scotland',
      'year round tyres scotland',
      'which tyres for scottish weather',
      'all weather tyres vs winter tyres scotland',
    ],
    relatedSlugs: [
      'all-season-tyres-scotland-guide',
      'winter-tyres-scotland-buyers-guide-2026',
      'winter-tyres-when-to-switch-scotland',
    ],
    content: `# Summer vs Winter vs All-Season Tyres for Scotland

The three-way tyre type choice is confusing because there is no single right answer — it depends where in Scotland you drive, how far, and how much you are willing to spend. This guide gives you a clear, Scotland-specific comparison.

## What the Three Tyre Types Are

### Summer Tyres

Designed for temperatures above 7°C. The compound is optimised for warm-road grip, low rolling resistance, and handling precision.

**Strengths**: best dry and wet performance in warm conditions, longest tyre life in summer use, lowest rolling resistance (best fuel economy), sharpest handling.

**Weaknesses**: compound hardens below 7°C — grip degrades significantly even on dry cold tarmac. In snow or ice, they are essentially useless.

**Season**: April to October in most of Scotland.

---

### Winter Tyres

Designed for temperatures below 7°C. Use a silica-rich compound that remains pliable in the cold, plus a deeper tread pattern with sipes (tiny cuts that create thousands of grip edges in snow and ice).

**Strengths**: best cold-weather grip of all three types — both on dry cold tarmac and in snow/ice. The 7°C temperature threshold matters even on dry roads.

**Weaknesses**: wear faster in warm weather. Higher rolling resistance reduces fuel economy in warm conditions. More expensive if buying a second set of wheels.

**Season**: October to April in Scotland.

---

### All-Season (All-Weather) Tyres

A compromise design with a compound and tread pattern that works acceptably in both warm and cold conditions. The best ones carry the Three Peak Mountain Snowflake (3PMSF) symbol, indicating they meet minimum winter performance standards.

**Strengths**: one tyre set for the whole year — no seasonal swap. Good performance across a wide temperature range. 3PMSF-rated ones perform adequately in mild winter conditions.

**Weaknesses**: not as good as summer tyres in summer. Not as good as winter tyres in severe winter conditions. Not suitable for ice or heavy snow.

**Season**: year-round, Scotland.

---

## Head-to-Head Comparison for Scottish Conditions

| Condition | Summer Tyre | Winter Tyre | All-Season (3PMSF) |
|---|---|---|---|
| Dry road in summer (20°C+) | ★★★★★ | ★★★ | ★★★★ |
| Wet road in summer | ★★★★★ | ★★★ | ★★★★ |
| Dry road in cold (below 7°C) | ★★ | ★★★★★ | ★★★★ |
| Wet road in cold | ★★ | ★★★★★ | ★★★★ |
| Light snow / slush | ★ | ★★★★★ | ★★★★ |
| Heavy snow / ice | ★ | ★★★★★ | ★★★ |
| Fuel economy | ★★★★★ | ★★★ | ★★★★ |
| Tread life | ★★★★★ | ★★★★ (if seasonal) | ★★★ |

---

## What's Right for Different Scottish Drivers

### Highland / Aberdeenshire / Rural Perthshire Drivers

**Recommendation: Winter tyres + summer tyres (two sets)**

If you regularly drive rural roads north of Perth from October to April, winter tyres are the safest choice. The Braemar corridor, Rannoch Moor, Glencoe, and the Cairngorms regularly see conditions that all-season tyres handle poorly.

The cost of two sets of tyres (one summer, one winter) is offset by the fact that each set lasts longer — you only wear each set for six months.

---

### Glasgow and Edinburgh City Drivers (Low Mileage)

**Recommendation: All-season tyres (3PMSF rated)**

For city drivers who stay within the Central Belt, rarely venture onto A-roads in winter, and cover under 10,000 miles per year, all-season tyres are the most practical choice.

The Central Belt has mild winters compared to the rest of Scotland. Snow is infrequent in Glasgow city centre. Cold wet conditions — the dominant Scottish winter condition — are handled well by 3PMSF all-season tyres.

Best choices: Michelin CrossClimate 2, Continental AllSeasonContact 2, Goodyear Vector 4Seasons Gen-3.

---

### Edinburgh to Aberdeen or Perth Commuter (High Mileage)

**Recommendation: Winter tyres + summer tyres if budget allows; all-season tyres as minimum**

The A90 Edinburgh–Aberdeen route regularly sees fog, ice, and snow between November and March. A high-mileage commuter on this route has maximum benefit from winter tyres. Two sets also makes financial sense at high mileage since each set lasts longer.

If one set only: choose a premium all-season (Michelin CrossClimate 2 or Continental AllSeasonContact 2) rather than budget all-season.

---

### Motorway / M8 / M74 / M9 Commuter (Short Distances)

**Recommendation: All-season or summer tyres**

Major Scottish motorways are gritted and treated in winter. Snow rarely persists on motorways. For drivers who exclusively use motorways and dual carriageways, all-season tyres are appropriate and summer tyres are acceptable.

---

### EV and PHEV Owners

**Recommendation: All-season or winter tyres depending on location**

EV and PHEV owners should lean toward winter tyres or high-quality all-season tyres because:
- Heavier vehicles need more braking distance in cold conditions
- Instant torque on EVs means more opportunity for wheelspin in cold conditions
- Most EVs have no spare wheel — a blowout in a remote snowy area is a worse situation

Winter tyre recommendation for EVs: Continental WinterContact TS870 P (designed for EVs), Pirelli Sottozero 3, or Michelin Pilot Alpin PA4.

---

### Sports Car / Performance Car Drivers (BMW M, Audi RS, Porsche)

**Recommendation: Summer tyres + dedicated winter tyres (two sets)**

Performance cars with summer-optimised ultra-high performance (UHP) tyres need dedicated winter tyres in Scotland. A BMW M3 on summer Michelin Pilot Sport 5 tyres in January in Edinburgh is a significantly less safe vehicle than the same car on Continental WinterContact TS870 P.

High-performance all-season tyres exist (Michelin CrossClimate 2 in performance sizes) but do not match the winter performance of a dedicated winter tyre on a powerful car.

---

## The Cost Comparison

**Option 1: Summer tyres only**
- 1 set of tyres: £300–£600 for a typical hatchback
- Annual replacement: every 3–5 years
- Risk: inadequate grip in Scottish winter conditions

**Option 2: Two sets (summer + winter)**
- 2 sets of tyres: £600–£1,200
- Plus: second set of wheels recommended: £300–£600 (steel wheels)
- Plus: fitting × 2/year: £80–£120
- Each set lasts significantly longer as it is only used for half the year
- Total cost over 10 years: broadly comparable to or lower than summer-only due to tyre longevity

**Option 3: All-season tyres**
- 1 set: £350–£800
- Annual fitting: zero (no swap)
- Wear faster than summer-only in summer and winter-only in winter
- Total cost over 10 years: similar to or slightly higher than two-set approach

---

## Our Scotland-Wide Recommendation

For most Scottish drivers outside the Highlands: **all-season tyres with 3PMSF rating**. They remove the swap hassle, provide adequate safety year-round in most Scottish conditions, and cost less than two-set management.

For Highland, Aberdeenshire, and rural drivers: **two sets — summer and winter**. The safety benefit in the worst months justifies the cost.

Call **0141 266 0690** or [book online](/book) — we fit all three tyre types across Scotland.

[All-season tyres Scotland guide](/blog/all-season-tyres-scotland-guide) | [Winter tyres Scotland 2026–27 guide](/blog/winter-tyres-scotland-buyers-guide-2026) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'nc500-tyre-guide-scotland',
    title: 'Tyre Guide for the North Coast 500 (NC500): What You Need to Know',
    description:
      'Planning the NC500? Essential tyre advice before you go — road conditions, remote area tyre risks, spare tyre advice, nearest mobile tyre fitters, and what to do if you get a flat on the NC500.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 8,
    featured: true,
    keywords: [
      'NC500 tyre advice',
      'north coast 500 tyres',
      'nc500 flat tyre',
      'nc500 tyre guide',
      'driving nc500 tyre tips',
      'north coast 500 tyre emergency',
      'nc500 remote area breakdown',
      'tyre check before nc500',
    ],
    relatedSlugs: [
      '4x4-suv-tyres-scotland-highlands',
      'all-season-tyres-scotland-guide',
      'spare-tyre-uk-law-scotland',
    ],
    content: `# Tyre Guide for the NC500

The North Coast 500 (NC500) is Scotland's most famous driving route — 500 miles of spectacular Highland roads connecting Inverness around the north and west coast. It's a bucket-list route for motorcyclists and car drivers from across the world.

It is also one of the most challenging routes in Britain for tyres.

## Why the NC500 is Hard on Tyres

**Single-track roads**: much of the NC500 passes through single-track roads with passing places. Driving on the edge of the tarmac — often on loose gravel and grass edges — at normal speeds introduces significant sidewall scrape risk. The edge of tarmac on Highland roads often has sharp stone edges that cause pinch cuts to tyres.

**Road surface quality**: the NC500 varies enormously in surface quality. The main A838, A836, and A9 sections are well-maintained. But sections through Coigach (near Lochinver), the Bealach na Bà pass, and parts of Sutherland have surfaces that would not be out of place in a rally stage. Expect sharp stones, exposed aggregate, and sudden dips.

**Bealach na Bà**: the road through the Bealach na Bà (Pass of the Cattle) near Applecross is one of the steepest roads in Britain. It has a maximum gradient of 20%, multiple tight hairpin bends, and a rough, narrow surface. It is signposted as unsuitable for caravans and large vehicles. For cars, it is manageable but hard on tyres — particularly low-profile tyres on modern sports cars.

**Remote location**: this is the key tyre risk on the NC500. If you get a flat tyre in a remote area — say, between Tongue and Durness, or on the Bealach na Bà — professional help may be hours away. The nearest mobile tyre fitter may be in Inverness, 100+ miles distant.

## Essential Pre-NC500 Tyre Checks

Do not start the NC500 without completing these checks:

### 1. Tread Depth — All Four Tyres

Measure tread depth on all four tyres before departure. The legal minimum is 1.6mm, but for Highland road conditions, we strongly recommend a minimum of 4mm before starting the NC500. On single-track roads with loose stone edges, a tyre at 2mm tread is a puncture waiting to happen.

If any tyre is below 4mm, replace it before departure. Mobile tyre fitting is straightforward in Inverness (the start of the NC500) — this is by far the most convenient place to sort tyre problems.

### 2. Tyre Age

Check the DOT manufacture date on each tyre. If any tyre is over 6 years old, it should be replaced before the NC500 regardless of tread depth. Sidewall cracking on older tyres is much more likely to lead to a puncture on rough Highland roads.

### 3. Tyre Condition — Sidewalls

Examine all sidewalls carefully for existing cracks, cuts, or bulges. A tyre that has a small sidewall crack in Edinburgh will develop a larger one on the Bealach na Bà.

### 4. Tyre Pressure

Check pressure for the loaded condition if you are carrying luggage and passengers. Underinflated tyres are far more vulnerable to sidewall impact damage on Highland roads.

### 5. Spare Tyre or Emergency Kit

**This is critical for the NC500**.

If your vehicle carries a spare tyre: check it. Verify the spare is inflated to the correct pressure, check its tread depth and age, and make sure the jack and wheel brace are in the vehicle. A spare tyre with 1mm tread stored at 20 psi is not useful in an emergency.

If your vehicle has only an inflation kit (no spare): understand its limitations. On the NC500, where sidewall damage from sharp single-track road edges is the most common puncture type, a sealant kit will not help. Sidewall damage cannot be inflated or sealed.

**Recommendation**: if your vehicle normally carries no spare, consider renting a set of wheels for the NC500 trip or purchasing a compact spare. The cost of a tow truck from Durness or Kinlochbervie to Inverness is substantial.

## If You Get a Flat Tyre on the NC500

**Stay calm and pull over safely.** On single-track roads, pull into the nearest passing place.

**Assess the damage**: is it a slow puncture (valve, nail, slow deflation) or a sudden blowout/sidewall failure?

**If a slow puncture and you have tread-area penetration**: use your inflation kit or spare tyre and drive slowly to the nearest settlement.

**NC500 emergency tyre resources**:

| Area | Nearest Tyre Centre | Approximate Distance |
|---|---|---|
| Inverness | Multiple tyre centres | Start of NC500 |
| Dingwall | Local garages | 15 miles from Inverness |
| Tain / Dornoch | Local garages | 40 miles north |
| Golspie / Brora | Limited garages | 60 miles north |
| Wick / Thurso | Halfords/local garages | 120 miles north |
| Tongue / Durness | No tyre centres | Remote — allow 1–2 hours for response |
| Ullapool | Local garages | 57 miles from Inverness |
| Lochinver area | Very limited | Remote |
| Applecross / Torridon | No tyre centres | Remote — full recovery may be needed |
| Kyle of Lochalsh | Local garage | 80 miles from Inverness |

**Tyre Rescue NC500 coverage**: we cover all of Scotland, including the NC500 route. Response times for remote areas (Tongue, Durness, Lochinver, Bealach na Bà) are significant — plan for 90–150 minutes minimum. Call **0141 266 0690** and we will dispatch the nearest available technician.

**Practical tip**: if you are on the NC500 with a tyre problem in a remote area, call us and then continue driving slowly to the nearest settlement (5–15 mph on a damaged tyre will cause less damage than a 2-hour wait in place). Most tyre damage that cannot be repaired will not worsen significantly at very low speed.

## Tyre Recommendations for the NC500

**Standard cars (not modified)**:

All-season tyres with high sidewall height (aspect ratio 50 or above) are more resilient on single-track road edges. If you drive a very low-profile car (35 or 40 profile tyres), be extra careful on the Bealach na Bà and Coigach sections.

**SUVs and 4x4s**:

All-terrain or robust highway terrain tyres are ideal. The NC500 is one of Scotland's strongest arguments for the right all-terrain tyre on a capable vehicle.

**Motorcycles**:

If you are touring the NC500 on a motorcycle, carry a plug repair kit and CO2 inflators. Tubeless tyre plugs can be fitted roadside and enable limping to a garage. This is the most practical emergency solution for motorcyclists.

## Enjoying the NC500

Most NC500 drivers complete the route without any tyre problems. Prepared, correctly-maintained tyres at good tread depth are safe on the NC500.

Check your tyres before departure, carry a working spare or understand your inflation kit's limitations, and keep Tyre Rescue's number saved: **0141 266 0690**.

[4x4 and Highland tyre guide](/blog/4x4-suv-tyres-scotland-highlands) | [All-season tyres Scotland](/blog/all-season-tyres-scotland-guide) | [Spare tyre guide Scotland](/blog/spare-tyre-uk-law-scotland)`,
  },
  {
    slug: 'pothole-damage-claim-scotland',
    title: 'How to Claim for Pothole Tyre Damage from Scottish Councils',
    description:
      'Can you claim compensation for tyre damage caused by a pothole in Scotland? Step-by-step guide to claiming from local councils, what evidence you need, and how much you can recover.',
    category: 'safety',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 8,
    featured: false,
    keywords: [
      'pothole damage claim scotland',
      'claim for tyre damage pothole scotland',
      'pothole compensation scotland',
      'report pothole scotland',
      'claim from council pothole damage scotland',
      'pothole tyre damage compensation',
      'how to claim pothole damage scotland council',
      'pothole burst tyre claim scotland',
    ],
    relatedSlugs: [
      'pothole-damage-tyres-scotland',
      'tyre-sidewall-damage-scotland',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# How to Claim for Pothole Tyre Damage from Scottish Councils

Scotland's roads have a significant pothole problem. Transport Scotland and local councils acknowledge thousands of pothole complaints annually, and Scottish drivers suffer millions of pounds in tyre, wheel, and suspension damage each year.

What many drivers don't know: you may be entitled to claim compensation from the responsible council for the cost of repairs — including new tyres and wheel damage. This guide explains how.

## Can You Claim for Pothole Tyre Damage in Scotland?

**Yes — in some circumstances.**

Under the Roads (Scotland) Act 1984, local authorities have a duty to maintain roads in a safe condition. If a pothole damaged your vehicle and the council was aware of the pothole (or should have been), you may have a valid negligence claim.

**However, councils have a defence** — if they can show they have a reasonable inspection and repair programme in place, they may not be liable even if the pothole existed. This is called the "Section 58 defence" (equivalent in Scotland) — it acknowledges that councils cannot fix every pothole immediately, only that they must have a reasonable system in place.

**Success rates**: pothole claims in Scotland have mixed success rates. Well-documented claims on busy roads with large potholes that had been reported previously are more likely to succeed. Rural road claims on minor roads are harder.

## Who is Responsible for Your Road?

Before claiming, identify which authority is responsible for the road where the damage occurred.

**Type A roads (trunk roads)**: managed by Transport Scotland on behalf of the Scottish Government. Examples: A9, A82, M8/M74, A90.

**Local roads (including most B roads, residential streets, and unclassified roads)**: managed by your regional council:
- Glasgow: Glasgow City Council
- Edinburgh: City of Edinburgh Council
- Aberdeen: Aberdeen City Council
- Dundee: Dundee City Council
- Highland, Argyll, Borders etc.: respective regional council

**How to find responsibility**: use the government's Reporting Roads website (Transport Scotland) for trunk roads, or your regional council's online portal for local roads.

## Step-by-Step: How to Make a Pothole Claim in Scotland

### Step 1: Document Everything Immediately

On the day of the incident:

- **Photograph the pothole**: take multiple photos showing the pothole depth and width. Include a coin or ruler for scale. Take a wide shot showing road context and a close-up.
- **Record exact location**: note the road name, direction of travel, nearest junction, street number, or landmark. Postcode is ideal. Google Maps pin screenshot is useful.
- **Record the date and time**: exact timestamp.
- **Photograph your tyre**: sidewall damage, flat tyre, broken wheel — photograph all damage immediately after stopping safely.
- **Get a witness statement**: if a passenger was present, get their name and contact details.

### Step 2: Get the Damage Assessed and Repaired

Before your claim will be successful, you need documented evidence of the repair cost:

- **Mobile tyre fitting**: get a receipt from Tyre Rescue or whichever tyre fitter attended, specifying the tyre size, the reason for replacement (impact/pothole damage), and the cost.
- **Wheel damage**: if the wheel is bent or cracked, get a repair or replacement quote from a garage in writing.
- **Suspension damage**: if the impact damaged suspension components, get a garage inspection report and repair quote.

Keep all receipts and invoices — you cannot claim without them.

### Step 3: Report the Pothole

Report the pothole to the responsible authority as soon as possible:

**For trunk roads (A9, A82, M8, M74, A90, etc.)**:
- Online: Transport Scotland's reporting portal (search "Transport Scotland report pothole")
- Phone: Traffic Scotland on 0800 028 1414

**For local roads**:
- Glasgow: glasgow.gov.uk → My Glasgow → Report a road problem
- Edinburgh: edinburgh.gov.uk → Report a pothole
- Aberdeen: aberdeencity.gov.uk → Report a road defect
- Other councils: use FixMyStreet (fixmystreet.com) which routes reports to the correct council

**Note your report reference number** — you will need this when making your claim.

### Step 4: Make a Formal Claim

**For trunk roads**: write to Transport Scotland Claims Department. Include:
- Description of the incident
- Pothole location details and photographs
- Evidence that the pothole existed (your report, any prior reports by others)
- Evidence of damage (photographs)
- Evidence of repair costs (invoices)

**For local councils**: each council has a claims department (sometimes called Roads Claims or Liability Claims). Most can be contacted online or by letter.

**Time limit**: claims should be made within three years of the incident under the Prescription and Limitation (Scotland) Act 1984, but submit as soon as possible — evidence degrades and witness memories fade.

### Step 5: What Happens Next

The authority will investigate your claim, which typically involves:
1. Checking their road inspection records to see when the pothole was last assessed
2. Checking whether the pothole had been previously reported
3. Assessing whether their maintenance system meets the Section 58 defence standard

**If successful**: you will receive compensation for the verified repair costs (tyre, wheel, sometimes suspension).
**If rejected**: you can escalate to the Scottish Public Services Ombudsman (SPSO) or pursue the claim through the Small Claims Court (up to £5,000 in Scotland's Summary Cause procedure) if you believe the rejection is unjust.

## How Much Can You Claim?

You can claim the documented repair cost:
- **Tyre replacement**: typically £60–£300 depending on vehicle and tyre brand
- **Wheel repair/replacement**: £150–£800
- **Suspension repair**: if proven caused by the same impact, potentially £200–£2,000+

Most pothole claims are in the £100–£500 range for tyre and wheel damage.

**Claim filing tip**: include a receipt for any call-out or emergency fee paid (e.g., Tyre Rescue's £49 emergency callout) — this is a legitimate additional cost caused by the pothole.

## If Your Claim is Rejected

Common reasons for rejection:
- The pothole did not meet the authority's minimum defect threshold (some councils only repair potholes over 40mm deep)
- The authority had no prior knowledge of the pothole
- The maintenance inspection records show a recent inspection

If rejected, consider:
- Checking whether the pothole had been reported before your incident via FixMyStreet
- Submitting a Subject Access Request for their inspection records
- Seeking legal advice for higher-value claims (suspension damage over £1,000)
- Small Claims Court if you have strong evidence

## Bottom Line

Getting your tyres replaced quickly is the first priority — call Tyre Rescue on **0141 266 0690** and we will attend your location across Scotland with a replacement tyre. Keep your receipt as it is a key document in any subsequent pothole claim.

[Pothole tyre damage guide Scotland](/blog/pothole-damage-tyres-scotland) | [Tyre sidewall damage guide](/blog/tyre-sidewall-damage-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'car-vibrating-after-new-tyres-scotland',
    title: 'Car Vibrating After New Tyres? Causes and Fixes in Scotland',
    description:
      'Car shaking or vibrating after getting new tyres fitted? Here are the most common causes — wheel imbalance, incorrect fitting, tyre defect — and how to get it resolved in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'car vibrating after new tyres scotland',
      'steering wheel shaking after tyre change',
      'car shaking after tyres fitted scotland',
      'vibration after tyre fitting scotland',
      'new tyres causing vibration',
      'wheel imbalance scotland',
      'tyre fitting vibration scotland',
      'car pulling to one side new tyres scotland',
    ],
    relatedSlugs: [
      'wheel-balancing-vs-alignment-scotland',
      'uneven-tyre-wear-guide-scotland',
      'noisy-tyres-causes-scotland',
    ],
    content: `# Car Vibrating After New Tyres: Causes and Fixes

Getting new tyres fitted should result in a smoother, more confident drive. If your car is now vibrating, shaking, or pulling to one side after a tyre change, something has gone wrong — and it needs to be fixed before the new tyres are damaged.

This guide covers every possible cause of post-fitting vibration and what to do about it.

## Most Common Causes

### 1. Wheel Not Balanced After Fitting (Most Likely)

**What happened**: the new tyre was fitted but not properly balanced, or the balancing weights were applied incorrectly.

Every tyre and wheel combination has minor weight imbalances — manufacturing tolerances mean no tyre or wheel is perfectly uniform. Dynamic balancing using a balancing machine adds small counter-weights to cancel these imbalances out.

If this step was skipped or done incorrectly, the wheel will rotate with a rhythmic imbalance that creates vibration. Typically felt:
- As a vibration through the steering wheel (front tyres) or seat (rear tyres)
- At a specific speed band — often 50–70 mph
- Getting worse as speed increases up to the resonant speed, then sometimes improving above it

**Fix**: return to the tyre fitter for a rebalance. This should be done at no cost if the original fitting included balancing. Any reputable tyre fitter will correct this immediately.

---

### 2. Tyre Seated Incorrectly on the Rim

**What happened**: the tyre bead (the inner edge of the tyre that seals against the wheel rim) has not fully seated around the entire circumference of the rim.

When a tyre is mounted, the bead must seat uniformly all the way around. Partial or uneven seating creates a runout — the tyre is not perfectly round as it rotates. This causes vibration, and is most commonly due to:
- Not lubricating the bead during fitting
- Inflating too quickly so one side seats before the other
- A small stone or debris trapped between the bead and rim

**Symptoms**: vibration at lower speeds than wheel imbalance; may also cause a slow puncture.

**Fix**: the tyre must be demounted and remounted correctly. Do not attempt to re-seat by over-inflating — this is dangerous. Return to the tyre fitter.

---

### 3. Incorrect Wheel Torque (Wheel Not Properly Tightened)

**What happened**: the wheel nuts were not tightened to the correct torque, or were not tightened in the correct star pattern.

An undertorqued or overtorqued wheel causes vibration, can damage the hub, and in extreme cases can cause wheel loss. Symptoms include a vibration or knocking sound that may change at different speeds.

**What to do**: if you suspect undertorqued wheels, do not drive at speed. Have the torque checked at a garage or by the tyre fitter. Most mobile tyre fitters carry torque wrenches set to manufacturer specification.

**Note on retorquing**: many manufacturers recommend re-torquing wheels after 30–50 miles of driving following a wheel removal. If your tyre fitter offered this service, take them up on it.

---

### 4. Tyre Defect (Manufacturing Fault)

**What happened**: the new tyre itself has a manufacturing defect — a flat spot, imbalanced weight distribution, or ply splice that cannot be corrected by balancing.

Modern tyre manufacturing is very reliable, but defects do occur. A defective tyre typically:
- Cannot be balanced to an acceptable level (the machine shows a constantly shifting imbalance)
- Shows vibration even after multiple rebalancing attempts
- Has a visible deformation in the tyre profile when rotated by hand

**Fix**: the tyre should be replaced under warranty by the tyre supplier. Reputable tyre brands (Michelin, Continental, Pirelli, Goodyear) have straightforward warranty processes for manufacturing defects.

---

### 5. Alloy Wheel Damage (Pre-Existing)

**What happened**: the alloy wheel itself is bent, cracked, or out of round — likely from a pothole impact before or during the tyre change. The new tyre is not causing the vibration; the bent rim is.

If vibration existed before the tyre change (but was masked by the old tyres), or if a pothole was hit just before the change, this is a possibility.

**How to identify**: ask the tyre fitter to place the wheel on the balancing machine and observe the rim runout reading. Most machines can measure rim runout separately from tyre imbalance. A bent rim will show an out-of-round reading.

**Fix**: wheel refurbishment (a specialist can straighten minor bends) or wheel replacement.

---

### 6. Wheel Alignment Now Exposed

**What happened**: the old worn tyres masked a pre-existing wheel alignment problem. New tyres with full tread make the misalignment feel worse — the car now pulls noticeably to one side, or the steering vibrates.

This is not the tyre fitter's fault — the alignment problem existed before the tyre change. New tyres with consistent grip simply make it more obvious.

**Fix**: a four-wheel wheel alignment check (£40–£60 at most garages). The alignment issue must be corrected — fitting new tyres without sorting alignment will cause the same premature wear pattern that wore out the previous tyres.

---

## What to Do

1. **Call the tyre fitter who fitted the tyres** — describe the symptoms (vibration at what speed, steering wheel or seat, pulling or not pulling). A good tyre fitter will ask you back in and investigate at no charge.

2. **Don't drive far** — vibration after tyre fitting is usually a fitting issue. Driving on it long-distance can damage the new tyres or the balancing weights.

3. **If the fitter cannot resolve it** — get a second opinion. A vibration diagnostic at a garage or tyre specialist will typically cost £20–£40.

If your tyres were fitted by Tyre Rescue and you are experiencing post-fitting vibration, call **0141 266 0690** — we will attend and resolve the issue.

[Wheel balancing and alignment guide Scotland](/blog/wheel-balancing-vs-alignment-scotland) | [Noisy tyres guide Scotland](/blog/noisy-tyres-causes-scotland) | [Uneven tyre wear guide Scotland](/blog/uneven-tyre-wear-guide-scotland)`,
  },
  {
    slug: 'winter-tyre-storage-scotland',
    title: 'How to Store Winter Tyres in Scotland: Complete Guide',
    description:
      'How to store winter tyres and summer tyres when not in use. Cleaning, stacking vs hanging, temperature, UV protection, and tyre hotel services in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'winter tyre storage scotland',
      'how to store winter tyres',
      'tyre storage scotland',
      'summer tyre storage scotland',
      'tyre hotel scotland',
      'storing tyres at home scotland',
      'seasonal tyre swap scotland',
      'tyre storage tips scotland',
    ],
    relatedSlugs: [
      'winter-tyres-scotland-buyers-guide-2026',
      'winter-tyres-when-to-switch-scotland',
      'tyre-age-when-to-replace-scotland',
    ],
    content: `# How to Store Winter Tyres in Scotland

Running seasonal tyres — summer tyres from April to October, winter tyres from October to April — is the most effective way to maximise grip and tyre life in Scotland. But when one set is not in use, correct storage is critical. Badly stored tyres age faster, develop flat spots, and crack.

This guide covers everything you need to know about storing your seasonal tyres in Scotland.

## Why Tyre Storage Matters

Rubber degrades through:
- **UV exposure** — direct sunlight accelerates oxidation of rubber compounds
- **Ozone** — naturally occurring in air but higher in areas near electrical equipment; causes surface cracking
- **Temperature extremes** — very high and very low temperatures accelerate compound hardening
- **Incorrect loading** — stacking tyres incorrectly causes sidewall distortion

A well-stored tyre can last 10 years. A poorly stored tyre in a sunny garage on concrete near an electrical motor can show visible cracking within 2–3 years.

## Before You Store: Cleaning and Inspection

**Clean the tyres before storage**:
1. Wash with mild soap and water — remove road grime, brake dust, and tar
2. Rinse thoroughly and dry completely — moisture under storage can cause adhesion and mould
3. Do not apply tyre dressings (silicone-based shine products) before storage — these can soften rubber compounds over long periods

**Inspect before storing**:
- Check tread depth — record it so you know the starting depth for the next season
- Look for sidewall cracks, cuts, or bulges
- Check tyre age (DOT code) — if either set is over 6 years old, budget for replacement before next season
- Note any uneven wear patterns that will need a wheel alignment check before refitting

## On Wheels vs Off Wheels

**Mounted on wheels (most convenient)**:
If you have a second set of wheels (alloys or steels), your winter and summer tyres will be stored already mounted. This makes seasonal swaps fast, cheap (£20 per wheel remounting), and means no tyre demounting/remounting stress.

**Off wheels (tyre-only storage)**:
If you only have one set of wheels, you must have tyres dismounted from the wheels and store the tyres alone. This costs more at each season swap because mounting and balancing takes longer.

## Storage Position: Stacking vs Hanging

**Mounted on wheels**:
- **Stacked horizontally** — the most common approach. Stack wheels flat, one on top of another, with cardboard or wheel bags between to prevent scratching. Rotate the stack quarterly.
- **Hanging individually** — using tyre hooks, hang wheels vertically through the centre hole. This avoids any distortion from stacking.
- **Standing upright** — lean against a wall or hang in a wheel rack. Rotate 90° every few weeks.

**Unmounted tyres (tyre only)**:
- **Standing upright in a rack** is the best approach. Standing tyres upright reduces distortion to the bead.
- **Do not stack unmounted tyres flat** — this deforms the sidewall over time.
- Rotate slightly every few weeks if standing long-term.

## Ideal Storage Conditions in Scotland

**Temperature**: 15–25°C is ideal but rarely practical in a Scottish garage. A cool, stable environment (5–20°C) is adequate. Avoid locations where temperatures drop below -10°C regularly — garages in Highland areas may need insulation for tyre storage.

**Humidity**: dry storage is essential. Excessive moisture promotes mould on tyre surfaces and can accelerate rubber degradation. A dehumidifier in a damp Scottish garage is worth considering.

**UV protection**: store out of direct sunlight. A garage or shed is ideal. If storing outdoors, use opaque tyre bags or a cover.

**Ozone sources**: keep stored tyres away from electric motors, generators, or compressors — these generate ozone which attacks rubber. This is a common mistake in garages where a chest freezer or compressor sits next to the stored tyres.

**Chemicals**: petrol, oil, grease, and solvents all damage rubber. Do not store tyres near fuel storage or where chemicals are used.

## Tyre Bags

Airtight or near-airtight tyre bags (typically black polythene, sold specifically for tyre storage) provide UV protection and limit ozone exposure. They are inexpensive (£3–£8 per tyre) and make a significant difference in storage quality for outdoor or semi-outdoor storage.

## Tyre Hotel Services in Scotland

Several tyre centres and garages offer tyre hotel services — they store your seasonal tyres at their premises in climate-controlled conditions between seasons.

**Advantages**: professional storage environment, tyres inspected before each season, convenient collection when swapping. **Cost**: typically £40–£80 for a set of four per season.

If storage space at home is limited — a flat with no garage, or a small urban property — tyre hotel is a practical alternative.

## Preparing Tyres for Refitting

Before fitting seasonal tyres at the start of their season:

1. **Visual inspection** — recheck for any cracking, deformation, or damage that occurred during storage
2. **Inflate to road pressure** — tyres lose some pressure during storage; re-inflate before fitting
3. **Check tread depth** — confirm the stored tread depth matches what you recorded when storing
4. **Clean** — remove any storage residue or marking

If you notice cracking, deformation, or the tyre has been stored for over 7 years, have it inspected by a tyre professional before fitting.

## Book Seasonal Tyre Swaps in Scotland

Tyre Rescue can attend your home or work for seasonal tyre swaps. If you have a second set of wheels, we can remount and balance at your location.

**Recommended timing for 2026–27**:
- **Fit winter tyres**: October 1–15
- **Swap back to summer tyres**: April (post-frost risk)

Call **0141 266 0690** or [book online](/book) to arrange your seasonal swap.

[Winter tyres Scotland buyers guide 2026](/blog/winter-tyres-scotland-buyers-guide-2026) | [When to switch to winter tyres](/blog/winter-tyres-when-to-switch-scotland) | [Tyre age guide Scotland](/blog/tyre-age-when-to-replace-scotland)`,
  },
  {
    slug: 'tyre-sealant-spray-vs-repair-scotland',
    title: 'Tyre Sealant Spray vs Puncture Repair: Which to Use in Scotland',
    description:
      'When should you use tyre foam sealant spray vs calling for a proper puncture repair in Scotland? What sealant can and cannot fix, and when it can cause more damage than it solves.',
    category: 'emergency',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'tyre sealant spray scotland',
      'tyre foam spray puncture',
      'can tyre sealant fix a puncture scotland',
      'tyre puncture spray vs repair',
      'tyreweld scotland',
      'slime tyre sealant scotland',
      'tyre inflation kit scotland',
      'temporary tyre repair scotland',
    ],
    relatedSlugs: [
      'slow-puncture-causes-scotland',
      'tyre-sidewall-damage-scotland',
      'spare-tyre-uk-law-scotland',
    ],
    content: `# Tyre Sealant Spray vs Puncture Repair: What to Use in Scotland

Many modern cars — particularly EVs, PHEVs, and newer compact models — come without a spare wheel and instead include a tyre inflation kit (a can of sealant foam and a compressor). Many drivers also buy aftermarket sealant products like Tyreweld or Slime.

These products have their place. But they are frequently used in situations where they will not work, or where using them makes a permanent repair impossible later. This guide explains when tyre sealant is useful in Scotland and when you should call for proper mobile tyre fitting instead.

## What Tyre Sealant Spray Does

Tyre sealant (also sold as tyre foam, Tyreweld, Fix-a-Flat, or supplied as part of the manufacturer's inflation kit) works by:
1. Injecting a liquid foam or latex compound through the valve into the deflated tyre
2. The foam coats the inner surface of the tyre
3. The compressor re-inflates the tyre
4. As the tyre rotates, the sealant is centrifuged toward any puncture hole and partially seals it

**It works in specific, limited circumstances only.**

## When Tyre Sealant Can Work

**Scenario 1: Small nail or screw in the central tread area**
- The penetrating object is in the central three-quarters of the tread
- The hole is 4mm or smaller in diameter
- The tyre has not been driven flat (no internal damage from rim contact)

In this scenario, sealant can re-inflate the tyre sufficiently to drive slowly (maximum 50 mph) for up to 50 miles to find a professional repair. This is the intended use case.

**Scenario 2: Slow leak from a tread puncture while driving**
If you notice a gradual pressure loss and stop promptly before the tyre is fully flat, sealant may restore enough pressure to reach a tyre centre.

## When Tyre Sealant Cannot Work and Should Not Be Used

**Sidewall damage**: any puncture or cut in the sidewall cannot be sealed with foam. Sealant does not seal the sidewall — it is centrifuged to the tread area. Using sealant on a sidewall puncture waste time and makes the situation worse.

**Large holes (over 4–6mm)**: sealant cannot seal a hole caused by running over a sharp rock, a large nail, or a structural impact. The foam will simply escape through the hole.

**Tyre driven while flat**: if a tyre has been driven flat (even for 100 metres), the inner lining may have been damaged by the rim cutting into it. Sealant cannot repair internal damage. The tyre must be inspected before refitting.

**Run-flat tyres**: sealant SHOULD NOT be used in run-flat tyres (BMW RSC, Mercedes EMT/MOExtended, Pirelli run-flat). The reinforced sidewall of a run-flat tyre means sealant cannot coat the inner surface properly. Using foam in a run-flat tyre also makes the tyre impossible to inspect — the only proper response to a run-flat puncture is replacement.

**Winter tyres**: foam sealant works less effectively in cold temperatures — it becomes more viscous and may not coat the tyre properly at Scottish winter temperatures (below 5°C).

## The Problem with Sealant and Proper Repair

The biggest issue with tyre sealant in Scotland: **it can make a repairable tyre unrepairable**.

When a tyre fitter demounts the tyre to assess and repair a puncture, the sealant foam covers the inner liner, making it difficult or impossible to:
- Identify the puncture location precisely
- Clean the inner liner properly for a BSAU159 mushroom plug repair
- Bond the repair patch properly

Many tyre fitters will refuse to perform a standard puncture repair on a tyre that has had sealant used. Some will charge an additional fee to clean the tyre before repair. In the worst case, a tyre that was repairable becomes a write-off because sealant has been used, adding the full tyre replacement cost to the bill.

**Bottom line**: only use sealant if you have no alternative and need to move the car to a safe location. Never use it as a long-term solution or alternative to a proper repair.

## After Using Tyre Sealant

1. Drive at maximum 50 mph (80 km/h) — do not exceed this
2. Drive no more than 50 miles
3. Get to a tyre centre or call Tyre Rescue as soon as possible
4. Tell the tyre fitter that sealant has been used — this is important and will affect how they proceed
5. The sealant must be cleaned from the inside of the tyre before any repair is attempted

## The Better Alternative: Mobile Tyre Fitting

In most Scottish situations, calling Tyre Rescue for mobile tyre fitting is faster and simpler than using sealant:

| Sealant approach | Mobile tyre fitting |
|---|---|
| Works only for small tread punctures | Works for all puncture types |
| Maximum 50 mph after use | Full-speed capability immediately |
| May make repair impossible | Clean repair possible |
| Requires tyre centre visit afterward | Complete solution on-site |
| Response time: 0 minutes | Response time: 25–55 minutes |

If the tyre is still inflated or can be driven slowly to a safe stopping point, using sealant to move the car before calling us is reasonable. If the tyre is completely flat or if you are on a motorway or A-road, call immediately — do not attempt sealant on a live road.

Call **0141 266 0690** or [book online](/book) for mobile puncture repair or tyre replacement across all of Scotland.

[Slow puncture guide Scotland](/blog/slow-puncture-causes-scotland) | [Tyre sidewall damage guide](/blog/tyre-sidewall-damage-scotland) | [Spare tyre guide Scotland](/blog/spare-tyre-uk-law-scotland)`,
  },
  {
    slug: 'ds-automobiles-tyre-fitting-scotland',
    title: 'DS Automobiles Tyre Fitting Scotland: DS3, DS4, DS7, DS9 Guide',
    description:
      'Mobile tyre fitting for DS Automobiles in Scotland. DS3 E-Tense EV, DS4 PHEV load index, DS7 and DS9 sizes, run-flat options, TPMS reset for all DS models.',
    category: 'fitting',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 5,
    featured: false,
    keywords: [
      'DS Automobiles tyre fitting scotland',
      'DS3 tyre size scotland',
      'DS7 tyre fitting scotland',
      'DS4 PHEV tyres scotland',
      'DS9 tyre fitting scotland',
      'DS Automobiles tyres scotland',
      'mobile tyre fitting DS scotland',
      'DS3 E-Tense EV tyres scotland',
    ],
    relatedSlugs: [
      'citroen-tyre-fitting-scotland',
      'peugeot-tyre-fitting-scotland',
      'electric-vehicle-tyres-scotland',
    ],
    content: `# DS Automobiles Tyre Fitting Scotland

DS Automobiles is Stellantis's premium French brand, sitting above Citroën and Peugeot in terms of specification and price. The DS3, DS4, DS7, and DS9 are increasingly popular in Scotland, particularly in Edinburgh and Glasgow. Like other Stellantis PHEV models, DS vehicles have specific load index requirements that must be met.

## DS3 / DS3 E-Tense Tyre Guide

| DS3 Variant | Tyre Size | Load Index Note |
|---|---|---|
| DS3 1.2 PureTech (petrol) | 205/50R17 or 215/45R18 | 88+ |
| DS3 E-Tense EV (2023+) | 205/50R17 or 215/45R18 | 95+ (EV weight) |

**DS3 E-Tense no spare wheel**: the battery-electric DS3 does not carry a spare. Inflation kit only. For any non-repairable puncture, call Tyre Rescue.

**DS3 E-Tense load index**: the electric DS3 weighs approximately 1,550 kg — heavier than the petrol variant. Minimum load index 95. Do not fit standard 88-rated tyres.

## DS4 Tyre Guide (Including PHEV)

| DS4 Variant | Tyre Size | Load Index Note |
|---|---|---|
| DS4 1.2 PureTech 130 | 225/45R18 | 95+ |
| DS4 1.6 PureTech 225 | 235/40R19 | 96+ |
| DS4 E-Tense PHEV 225 | 225/45R18 | 99+ |
| DS4 E-Tense PHEV 300 | 235/40R19 | 99+ |

**DS4 PHEV load index**: both DS4 E-Tense PHEV variants carry a larger battery pack than the petrol DS4, adding significant kerb weight. Minimum load index 99 on PHEV models.

## DS7 Tyre Guide (Including PHEV)

| DS7 Variant | Tyre Size | Load Index Note |
|---|---|---|
| DS7 1.5 BlueHDi Diesel | 225/55R18 or 235/50R18 | 98+ |
| DS7 1.6 PureTech Petrol | 225/55R18 | 98+ |
| DS7 E-Tense PHEV 225 (AWD) | 235/50R18 or 235/45R19 | 101+ |
| DS7 E-Tense PHEV 300 (AWD) | 235/45R19 | 103+ |

**DS7 PHEV load index**: the dual-motor E-Tense 300 is significantly heavier than the diesel or petrol DS7. Minimum load index 103. Do not fit 98 or lower.

## DS9 Tyre Guide

| DS9 Variant | Tyre Size |
|---|---|
| DS9 PureTech petrol | 245/45R18 |
| DS9 E-Tense 4x4 PHEV 360 | 245/45R18, load index 100+ |
| DS9 E-Tense PHEV 225 | 245/45R18, load index 100+ |

**DS9 PHEV load index**: 100+ required on all DS9 PHEV variants.

## DS TPMS Reset

DS Automobiles shares the Stellantis TPMS architecture with Citroën, Peugeot, and Vauxhall. Most DS models use an indirect TPMS (pressure calculated from wheel speed sensors rather than in-wheel sensors).

After fitting new tyres:
1. Set all tyre pressures to the recommended values
2. Start the vehicle
3. Navigate to the tyre pressure reset in the DS Connected Touch (central touchscreen)
4. Select **Tyre Pressure: Reset** and confirm
5. Drive for 5+ minutes above 25 mph for calibration

If a warning persists after reset, a sensor inspection or replacement may be needed.

## Best Tyres for DS Automobiles in Scotland

DS Automobiles targets a premium driving experience with Peugeot Citroën Group's focus on comfort and refinement. Scotland's wet roads make wet-grip performance the most important attribute.

**DS3 E-Tense and DS4 PHEV**: Michelin Pilot Sport 4 or Continental PremiumContact 7 — both offer outstanding wet braking performance.

**DS7 and DS9 SUV/executive**: Michelin CrossClimate 2 for year-round Scottish use (3PMSF rated), or Pirelli P Zero for summer-focused performance.

**For Scottish winter (Oct–Apr)**: Continental WinterContact TS870 is available in most DS sizes and is strongly recommended for any DS owner who drives regularly on Scottish A-roads or rural routes.

## Book Mobile Tyre Fitting for Your DS in Scotland

Call **0141 266 0690** or [book online](/book). We cover Glasgow, Edinburgh, Aberdeen, and all of Scotland.

[Citroën tyre guide Scotland](/blog/citroen-tyre-fitting-scotland) | [Peugeot tyre guide Scotland](/blog/peugeot-tyre-fitting-scotland) | [EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland)`,
  },
  {
    slug: 'byd-tyre-fitting-scotland',
    title: 'BYD Tyre Fitting Scotland: Atto 3, Seal, Dolphin & Sealion 6 Guide',
    description:
      'Mobile tyre fitting for BYD electric vehicles in Scotland. BYD Atto 3, Seal, Dolphin, and Sealion 6 tyre sizes, load index requirements, no-spare guidance, and TPMS reset.',
    category: 'fitting',
    publishDate: '2026-09-02',
    lastModified: '2026-09-02',
    readingTime: 6,
    featured: false,
    keywords: [
      'BYD Atto 3 tyre size scotland',
      'BYD tyre fitting scotland',
      'BYD Seal tyres scotland',
      'BYD Dolphin tyre fitting scotland',
      'BYD EV tyre scotland',
      'BYD Atto 3 flat tyre scotland',
      'mobile tyre fitting BYD scotland',
      'BYD Sealion 6 tyres scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'mg-motor-tyre-fitting-scotland',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# BYD Tyre Fitting Scotland

BYD (Build Your Dreams) is China's largest EV manufacturer and one of the world's biggest electric vehicle producers. The BYD Atto 3, Seal, Dolphin, and Sealion range have launched in the UK market and are rapidly gaining registrations in Scotland. As EV-only vehicles, BYD cars have specific tyre requirements that differ from petrol equivalents.

Tyre Rescue fits tyres for all BYD models across Scotland, 24 hours a day.

## BYD Atto 3 Tyre Guide (2022–present)

The Atto 3 is BYD's mid-size crossover SUV — the most popular BYD model in Scotland.

| Atto 3 Variant | Tyre Size | Load Index |
|---|---|---|
| Atto 3 Standard Range | 215/55R18 | 99+ |
| Atto 3 Extended Range | 215/55R18 | 99+ |
| Atto 3 (some markets) | 235/50R18 | 101+ |

**No spare wheel** — the Atto 3 does not carry a spare tyre. BYD supply an inflation kit for minor tread punctures. Sidewall damage or large penetrations require a replacement tyre — call Tyre Rescue immediately.

**Load index**: the Atto 3 weighs approximately 1,750 kg. Minimum load index 99. Do not fit standard-rated 94 or 95 index tyres.

**OE fitment**: the Atto 3 is typically fitted with Hankook iON evo or Bridgestone Turanza T005 A EV tyres from factory. Both are EV-specific compounds optimised for the heavier load and regenerative braking patterns of electric vehicles.

## BYD Seal Tyre Guide (2023–present)

The Seal is BYD's electric fastback saloon, comparable to Tesla Model 3.

| Seal Variant | Front | Rear | Note |
|---|---|---|---|
| Seal Standard RWD | 235/45R18 | 235/45R18 | Square fitment |
| Seal Performance AWD | 235/40R19 (F) | 265/35R19 (R) | Staggered |

**Staggered fitment (Performance AWD)**: the Seal Performance uses wider rear tyres for enhanced traction. Tyres cannot be rotated. Specify front or rear when booking.

**No spare wheel** on either variant. Inflation kit only.

**Load index**: 103+ required on the Performance AWD due to dual motor weight.

## BYD Dolphin Tyre Guide (2023–present)

The Dolphin is BYD's smaller, more affordable EV hatchback.

| Dolphin Variant | Tyre Size | Load Index |
|---|---|---|
| Dolphin Standard | 195/55R16 | 91+ |
| Dolphin Dynamic | 205/50R17 | 93+ |

**No spare wheel** — inflation kit only. The Dolphin is a compact EV with no spare provision.

**Note**: the Dolphin uses smaller wheel sizes than most Chinese EVs, making tyre availability easier and costs lower than larger models. 195/55R16 and 205/50R17 are common sizes stocked by most tyre suppliers.

## BYD Sealion 6 / Sealion 7 Tyre Guide (2024–present)

| Sealion Model | Tyre Size | Load Index Note |
|---|---|---|
| Sealion 6 DM-i PHEV | 235/55R18 | 104+ (PHEV weight) |
| Sealion 6 EV | 235/55R18 | 101+ |
| Sealion 7 (SUV EV) | 235/50R19 | 103+ |
| Sealion 7 Performance AWD | 235/45R20 | 100+ |

**Sealion 6 DM-i PHEV load index**: the plug-in hybrid Sealion 6 is heavier than the pure EV version due to its dual powertrain. Minimum load index 104. Do not fit a lower rating.

**No spare wheel** on EV variants. The DM-i PHEV may carry a space-saver spare — check your specific vehicle handbook.

## BYD TPMS Reset

BYD models use direct TPMS sensors. After fitting new tyres:

1. Inflate all tyres to the correct pressure (driver's door sticker)
2. Start the vehicle
3. Navigate to: **Car Settings > Tyre Pressure > Reset TPMS** in the central touchscreen
4. Select the option to recalibrate and confirm
5. Drive at 25+ mph for 5–10 minutes

If the TPMS warning light persists, the sensor may require replacement. BYD uses standard TPMS sensor formats compatible with most diagnostic equipment — our technicians can reset and replace TPMS sensors for all BYD models.

## Why EV Tyres Matter More on a BYD

All BYD EVs deliver instant, full torque from a standstill. This is excellent for acceleration but significantly harder on tyres than a petrol car with progressive power delivery. Key implications:

- **Faster rear tyre wear** on RWD models — expect 20–25% shorter life vs petrol equivalent
- **Higher load index requirement** — heavier battery pack
- **Better wet grip needed** — heavier car requires more grip to stop safely on Scotland's wet roads

**Recommended tyres for BYD Atto 3 and Seal in Scotland**:
- **Hankook iON evo SUV** — OE on many Atto 3s; EV-optimised compound, good wet performance
- **Michelin Pilot Sport EV** — outstanding wet grip, premium option
- **Bridgestone Turanza T005 A** (Elect variant) — excellent efficiency and noise

## Book Mobile Tyre Fitting for Your BYD in Scotland

Tyre Rescue carries common BYD tyre sizes (215/55R18, 235/45R18) in our Scotland vans. For larger or performance sizes, call ahead to confirm same-day stock.

Call **0141 266 0690** or [book online](/book) for BYD tyre fitting across Scotland.

[EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland) | [MG Motor tyre guide Scotland](/blog/mg-motor-tyre-fitting-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'slow-puncture-causes-scotland',
    title: 'Slow Puncture: Causes, Diagnosis & What to Do in Scotland',
    description:
      'Tyre slowly losing pressure? A slow puncture can be caused by a nail, valve leak, corroded wheel, or bead seal failure. Scotland guide to diagnosing and fixing a slow puncture.',
    category: 'emergency',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'slow puncture scotland',
      'tyre losing pressure scotland',
      'tyre keeps going flat scotland',
      'slow puncture causes',
      'tyre slow leak scotland',
      'why does my tyre keep losing air',
      'nail in tyre scotland',
      'slow puncture repair scotland',
    ],
    relatedSlugs: [
      'tyre-sidewall-damage-scotland',
      'tpms-warning-light-scotland-guide',
      'tyre-pressure-guide-scotland',
    ],
    content: `# Slow Puncture: Causes, Diagnosis, and What to Do

A slow puncture is a tyre that loses air pressure gradually over hours or days, rather than suddenly. It is one of the most common tyre problems in Scotland — and also one of the most misdiagnosed, because several different causes produce the same symptom.

## How to Tell If You Have a Slow Puncture

**Signs**:
- TPMS warning light appearing regularly, especially in the morning when tyres are cold
- Tyre noticeably lower than the others after being parked overnight or for several hours
- Needing to top up one tyre repeatedly while others hold pressure
- Car pulling slightly to one side, suggesting one tyre is lower than the other three

**Confirming the diagnosis**:
1. Check all four tyre pressures when cold (after 3+ hours of standing)
2. Note which tyre(s) are lower than the recommended pressure
3. Inflate all to the correct pressure and check again after 24 hours

A loss of more than 3–4 psi per day is a slow puncture requiring attention. A loss of 1–2 psi over a week is within normal seasonal variation (especially in Scotland's temperature changes) and may not be a fault.

## Causes of Slow Punctures

### 1. Nail, Screw, or Road Debris Embedded in Tread

**How it happens**: you drive over a nail, screw, or sharp stone fragment. The object penetrates the tyre but remains embedded — creating a slow air leak around the object rather than an immediate flat.

**How to find it**: look carefully at the tread surface of the affected tyre. You may see the head of a nail, a screw, or a fragment of metal. Sometimes the object is small enough to be hard to spot — in this case, inflate the tyre and listen for a faint hiss, or apply soapy water to the tread and watch for bubbles.

**Can it be repaired?**: yes, if the penetration is in the central three-quarters of the tread and not through the sidewall. A British Standard BSAU159-compliant repair involves removing the object, inserting a mushroom plug-patch from the inside, and vulcanising the repair. This is a permanent fix that should last the life of the tyre.

**Cost**: puncture repairs cost approximately £20–£25 per tyre at Tyre Rescue.

**Scotland note**: nails and screws from construction sites and agricultural vehicles are a very common cause of slow punctures on Scottish roads — particularly on roads near building developments, farms, and industrial areas.

---

### 2. Valve Stem Leak

**How it happens**: the rubber or metal valve stem — the short nozzle you use to inflate the tyre — can develop a slow leak. Rubber valve stems perish over time, especially with UV exposure and Scottish winter frost. Metal valve stems develop leaks at the threaded insert point.

**How to find it**: remove the valve cap and listen for a faint hiss. Apply soapy water to the valve stem and look for bubbles. The leak may be at the body of the valve, the valve core (Schrader valve), or where the valve meets the wheel rim.

**Can it be fixed?**: often yes. A Schrader valve core can be replaced for £1–£2. A faulty valve stem may require the tyre to be removed and a new valve fitted — Tyre Rescue includes this as part of our fitting service when we attend.

---

### 3. Corroded or Damaged Wheel Rim (Bead Seal Failure)

**How it happens**: on alloy wheels, particularly older ones with surface corrosion, the tyre bead (the inner edge of the tyre that seals against the wheel rim) can lose its seal against a corroded rim surface. Air escapes along the bead.

**How to find it**: inflate the tyre and apply soapy water around the entire inner circumference where the tyre meets the wheel. Bubbles at the bead area indicate a bead seal leak.

**Fix**: requires the tyre to be dismounted, the corrosion wire-brushed and sealed, and the tyre remounted and re-inflated. This cannot be done without removing the wheel. Tyre Rescue handles bead seal repairs as part of our fitting service.

**Scotland note**: Scottish winters with road salt significantly accelerate alloy wheel corrosion. This is a particularly common cause of slow punctures in Scotland on vehicles over 4–5 years old.

---

### 4. TPMS Sensor Leak

**How it happens**: direct TPMS sensors are mounted inside the wheel, either on a separate valve or band-mounted. The seal between the TPMS sensor and the wheel or valve can fail, causing a leak.

**How to find it**: similar to valve stem leak detection — soapy water applied to the TPMS valve and sensor body will show bubbles if the seal is leaking.

**Fix**: TPMS sensor replacement or re-sealing. If the sensor battery has also died (they typically last 7–10 years), the sensor should be replaced entirely. Tyre Rescue carries common TPMS sensors for most vehicle brands.

---

### 5. Porous Alloy Wheel

**How it happens**: a rare but real phenomenon in older or damaged alloy wheels. The wheel material itself can develop tiny porosity — microscopic air paths through the metal structure. Air migrates through the wheel itself.

**How to find it**: if bead seal, valve, and tyre penetration are all ruled out, porous alloy is the remaining suspect. A specialist wheel reconditioner can test for porosity.

**Fix**: wheel reconditioning with porosity sealant, or wheel replacement.

---

## What to Do with a Slow Puncture in Scotland

**If the tyre is still safely inflated (losing less than 5 psi per day)**:
- Keep the tyre inflated to the correct pressure
- Do not drive at motorway speed on a tyre with a known slow puncture
- Book a repair or inspection within 48 hours
- Call Tyre Rescue on **0141 266 0690** for a convenient appointment at your home or work

**If the tyre is significantly underinflated (more than 10 psi below recommended)**:
- Inflate before driving if possible (petrol station air or portable compressor)
- Drive slowly and carefully to the nearest safe location
- Call for mobile fitting — do not drive at speed on a significantly underinflated tyre

**If the tyre is flat or near-flat**:
- Do not drive on it
- Call Tyre Rescue for roadside mobile fitting

## TPMS Light and Slow Punctures

Many Scottish drivers first notice a slow puncture via the TPMS warning light. The light illuminates when tyre pressure drops approximately 25% below the recommended level. If TPMS triggers:

1. Stop safely
2. Check all four tyre pressures
3. Identify which tyre(s) are low
4. Inflate and monitor
5. If the same tyre repeatedly triggers TPMS, book a repair

For more on TPMS, see our [TPMS warning light guide](/blog/tpms-warning-light-scotland-guide).

## Book Slow Puncture Repair in Scotland

Tyre Rescue can attend your location across all of Scotland to assess and repair slow punctures. We carry puncture repair equipment and can assess on-site whether a repair is possible or a replacement is required.

Call **0141 266 0690** or [book online](/book).

[TPMS warning light guide](/blog/tpms-warning-light-scotland-guide) | [Tyre sidewall damage guide](/blog/tyre-sidewall-damage-scotland) | [Tyre pressure guide Scotland](/blog/tyre-pressure-guide-scotland)`,
  },
  {
    slug: 'winter-tyres-scotland-buyers-guide-2026',
    title: 'Best Winter Tyres for Scotland 2026–27: Buyer\'s Guide & Recommendations',
    description:
      'Best winter tyres for Scotland in 2026-27. Top-rated winter tyres by size, price comparison, when to fit them, and where to get them fitted across Glasgow, Edinburgh, and Scotland.',
    category: 'safety',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 10,
    featured: true,
    keywords: [
      'best winter tyres scotland 2026',
      'winter tyres scotland 2026',
      'winter tyre recommendations scotland',
      'buy winter tyres scotland',
      'winter tyre fitting scotland',
      'top rated winter tyres 2026',
      'winter tyres glasgow edinburgh',
      'should i get winter tyres scotland 2026',
    ],
    relatedSlugs: [
      'winter-tyres-when-to-switch-scotland',
      'all-season-tyres-scotland-guide',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# Best Winter Tyres for Scotland 2026–27

With September here, now is the time to plan your winter tyres for the coming season. Scotland's roads from October to April present conditions that summer tyres are not designed for — not just snow, but cold tarmac below 7°C where summer tyre compounds harden and lose grip.

This guide covers the best winter tyres for Scotland in 2026–27, by size and use case, with pricing and fitting information.

## Do You Need Winter Tyres in Scotland?

**If you drive in the Highlands, Aberdeenshire, or rural Scotland**: yes. The risk of snow, ice, and frost is high enough that winter tyres or properly-rated all-season tyres are strongly recommended from October.

**If you drive in Glasgow, Edinburgh, or Central Belt cities**: it depends on your risk tolerance. Winter tyres will give you significantly better grip below 7°C even on dry tarmac. In mild city winters they are not essential — all-season tyres with 3PMSF rating are a good compromise.

**If you drive rural Perthshire, Angus, Stirlingshire**: a strong case for winter tyres or 3PMSF all-season tyres. These areas regularly see significant snow and extended frost.

**The threshold**: once temperatures are consistently below 7°C, summer tyres lose grip on dry tarmac — not just on ice or snow. In Scotland, this typically means fitting winter or all-season tyres from mid-October.

## Top Winter Tyres for Scotland 2026–27

### 1. Michelin Alpin 6 / Pilot Alpin PA4 (Premium)

**Best for**: saloons, hatchbacks, executive cars, performance vehicles.

Michelin's Alpin 6 is a consistent leader in independent winter tyre tests. Outstanding in wet/slushy conditions that are more common in the Central Belt than deep snow. The Pilot Alpin PA4 is the high-performance variant for low-profile, high-speed-rated fitments (BMW M, Audi RS, Mercedes AMG).

**Key sizes**: 205/55R16, 225/45R17, 225/40R18, 245/45R18.
**Price guide**: £85–£180 per tyre depending on size.
**Scottish conditions**: exceptional in wet cold conditions — the dominant condition from Glasgow to Aberdeen Oct–April.

---

### 2. Continental WinterContact TS870 / TS870P (Premium)

**Best for**: SUVs, family hatchbacks, performance (870P variant).

Continental's WinterContact TS870 has been the benchmark test winner across multiple 2023–2025 independent comparisons. Outstanding dry braking and wet grip. The P variant adds low-rolling-resistance compounds for EV/PHEV compatibility.

**Key sizes**: 205/55R16, 225/55R17, 225/45R18, 255/45R18 (P variant available in most popular EV sizes).
**Price guide**: £80–£175 per tyre depending on size.
**Scottish conditions**: class-leading dry and wet braking — superb for Central Belt use. Also very strong in light snow and slush.

---

### 3. Bridgestone Blizzak LM005 / LM005D (Premium)

**Best for**: SUVs, 4x4, crossovers, city cars.

Bridgestone's LM005 has consistently ranked at or near the top in SUV winter tyre tests. The LM005D is the directional variant with enhanced wet performance. Excellent in snow and ice — among the best available.

**Key sizes**: 215/55R17, 225/60R17, 235/55R17, 235/55R18 (many SUV sizes).
**Price guide**: £90–£200 per tyre.
**Scottish conditions**: particularly good in Highlands and Aberdeenshire where genuine snow and ice exposure is highest.

---

### 4. Nokian WR D4 / Hakkapeliitta R5 (Premium)

**Best for**: all Scotland, particularly Highland and Aberdeenshire.

Nokian is a Finnish brand that develops tyres specifically for Scandinavian conditions — which are very similar to Scottish winter conditions. The WR D4 is the road-legal studded option (studded tyres are legal in Scotland from November 1 to March 31). The Hakkapeliitta R5 is the non-studded premium option.

**Key sizes**: 205/55R16, 225/50R17, 225/45R18 and more.
**Price guide**: £90–£200 per tyre.
**Scottish conditions**: Nokian's expertise in ice and packed snow conditions is unmatched. For Highland and Aberdeenshire drivers, these are the top recommendation.

---

### 5. Falken EuroWinter HS01 (Mid-Range)

**Best for**: budget-conscious drivers in Central Belt.

The Falken EuroWinter is a respected mid-range winter tyre at a significantly lower price than the premium tier. Strong performance in wet and cold conditions. Not as class-leading as Michelin or Continental but significantly better than no change at all.

**Key sizes**: 205/55R16, 225/45R17, 225/40R18.
**Price guide**: £55–£110 per tyre.
**Scottish conditions**: good choice for Glasgow and Edinburgh city driving where snow is rare but cold wet conditions dominate.

---

### 6. Goodyear UltraGrip Performance 3 (Mid-Range to Premium)

**Best for**: family hatchbacks and SUVs.

Goodyear's UltraGrip Performance 3 launched in 2024 and has achieved strong early results in independent tests. Good wet and dry braking, solid snow performance. Competitive pricing against Continental and Michelin.

**Key sizes**: 205/55R16, 225/45R17, 225/55R17, 235/55R17.
**Price guide**: £75–£155 per tyre.

---

## Winter Tyre vs All-Season: Which for Scotland?

| Scenario | Recommendation |
|---|---|
| Highland estate / farm / Deeside driver | Winter tyres (Oct–Apr) |
| Aberdeenshire rural commuter | Winter tyres or 3PMSF all-season |
| Central Belt city driver (Glasgow/Edinburgh) | 3PMSF all-season is sufficient |
| M8/M90 motorway commuter | All-season 3PMSF with good wet rating |
| Renfrewshire / Stirlingshire commuter | All-season 3PMSF or winter tyres |
| Shetland / Orkney / Western Isles | Winter tyres (conditions are severe) |

See our full [all-season vs winter tyre guide for Scotland](/blog/all-season-tyres-scotland-guide) for more detail.

## When to Fit Winter Tyres in Scotland 2026

**Recommended fitting window**: **October 1–15, 2026**

This gives you several weeks before the first serious cold snaps typically arrive in Scotland. It also means you can get an appointment without waiting — October is peak demand for winter tyre fitting and slots fill up fast.

**Removing winter tyres**: typically April after the last frost risk has passed. For Highland and Aberdeenshire, May is safer.

**Storage**: if you have the second set of wheels (recommended), both sets of tyres are stored on wheels, which makes fitting fast and cheap (£20 per wheel minimum for remounting). If you only have one set of wheels, you swap tyres onto the same wheels — this takes longer and costs more.

## Pricing for Winter Tyre Fitting in Scotland 2026

At Tyre Rescue, winter tyre fitting is priced at:
- **Mobile tyre fitting**: £20 per tyre (fitted and balanced at your home or work)
- **Set of four**: approximately £80 fitting labour

**Example total cost — Ford Kuga 225/55R17 winter tyres**:
- Continental WinterContact TS870 × 4: approx £480
- Fitting × 4: £80
- **Total fitted at your door**: approximately £560

For detailed pricing on your specific vehicle, call **0141 266 0690** or [book online](/book).

## Book Winter Tyres Across Scotland

Tyre Rescue stocks winter tyres in popular Scottish sizes (205/55R16, 225/45R17, 225/55R17, 225/45R18 and more). For specialist sizes (19"+, run-flat winter tyres, van winter tyres), call ahead to confirm availability.

We fit across all of Scotland — Glasgow, Edinburgh, Aberdeen, Dundee, Inverness, and everywhere in between. Book now for October to guarantee your preferred date.

Call **0141 266 0690** or [book online](/book).

[When to switch to winter tyres Scotland](/blog/winter-tyres-when-to-switch-scotland) | [All-season tyres Scotland guide](/blog/all-season-tyres-scotland-guide) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'noisy-tyres-causes-scotland',
    title: 'Why Are My Tyres So Loud? Tyre Noise Causes and Fixes in Scotland',
    description:
      'Humming, droning, roaring, or screeching tyre noise — what causes it and what to do. Scotland road conditions, tyre wear patterns, and when tyre noise means you need immediate attention.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 8,
    featured: false,
    keywords: [
      'noisy tyres scotland',
      'tyre humming noise scotland',
      'why are my tyres so loud',
      'tyre noise at speed scotland',
      'tyre droning noise scotland',
      'tyre roaring noise scotland',
      'tyre noise causes scotland',
      'loud tyres scotland',
      'tyre noise when driving',
    ],
    relatedSlugs: [
      'uneven-tyre-wear-guide-scotland',
      'wheel-balancing-vs-alignment-scotland',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# Why Are My Tyres So Loud? Causes of Tyre Noise in Scotland

Tyre noise is one of the most common concerns drivers raise — and also one of the most often misdiagnosed. Noise that sounds like it is coming from the tyres may actually be caused by the tyres themselves, by uneven tyre wear, by wheel bearings, or by the road surface. Getting the diagnosis right matters because some causes are safety-critical and require immediate action.

## Types of Tyre Noise and What They Mean

### 1. Humming or Droning That Gets Louder at Speed

**Sound**: a low-frequency hum or drone that increases in pitch and volume as speed increases. May be constant or may vary.

**Most likely causes**:

**Uneven tyre wear (cupping or scalloping)** — the most common cause of tyre humming. When a tyre wears in an uneven diagonal pattern (cupping), the irregular tread surface creates a rhythmic sound as it contacts the road. The noise gets worse as the wear progresses.

To check: run your hand across the tyre tread. If it feels bumpy or wavy rather than smooth and even, the tyre has developed cupping wear. This is caused by wheel imbalance or worn shock absorbers and will not get better — replacement is necessary.

**Wheel bearing failure** — a failed or failing wheel bearing creates a similar hum or droning sound that increases with speed. Unlike tyre noise, wheel bearing noise may change when you swerve gently left or right (because lateral G-forces load or unload the bearing). If the noise changes when you swerve, suspect the wheel bearing on the side that gets quieter when you load it.

**How to distinguish**: cupping tyre noise is typically related to the tread frequency (sounds rhythmic, tied to wheel rotation speed). Wheel bearing noise is smoother and higher-frequency. Both get louder with speed.

**Scotland note**: Scottish roads — particularly B-roads and rural routes — have more surface irregularities than English motorways. This makes wheel imbalance-related cupping significantly more common in Scotland.

---

### 2. Rumbling or Roaring at Constant Speed

**Sound**: a deep rumble or roar, most noticeable at motorway or A-road cruising speeds (50–70 mph). May feel like vibration through the seat or steering wheel.

**Most likely causes**:

**Aggressive tread pattern (all-terrain or mud tyres)** — if you have fitted all-terrain or mud-terrain tyres (BFGoodrich KO2, Falken Wildpeak, etc.), the open tread blocks create significant road noise on smooth tarmac. This is normal for these tyre types and is not a fault. It can be reduced by fitting a quieter all-terrain variant or returning to highway terrain tyres.

**Worn tread with standing wave** — very worn tyres (below 2mm) can generate increased road noise as the thin tread loses its ability to absorb road surface irregularities. If the roaring correlates with lower-than-expected tread depth, replacement is necessary.

**Large diameter tyres on low-profile vehicles** — fitting tyres larger than the manufacturer's recommendation (a common modification) can create resonant frequencies with the vehicle's wheel arches.

---

### 3. Thumping or Vibration at Low Speed

**Sound**: a rhythmic thump, bump, or vibration, especially noticeable at speeds below 30 mph. May disappear at higher speeds.

**Most likely causes**:

**Flat spot on tyre** — a flat area that has developed on the contact patch. Most commonly caused by:
- Emergency braking that locked a wheel (pre-ABS vehicles, or ABS failure)
- Vehicle standing stationary for a long time in cold weather (temporary flat spot, usually rounds out after a few miles)
- Impact damage that has caused internal deformation

A flat spot creates a characteristic thump-thump-thump sound at low speed that may smooth out above 40–50 mph as the tyre warms and the rubber becomes more flexible.

**Out-of-round tyre** — a tyre that is no longer perfectly circular (can occur after severe impact damage). This creates rhythmic vibration that is most felt at lower speeds.

**Wheel imbalance** — an unbalanced wheel creates rhythmic vibration, typically most noticeable at a specific speed band (often 50–70 mph for typical imbalance weights).

---

### 4. Squealing on Corners

**Sound**: high-pitched squeal when turning, particularly in car parks or at low speed.

**Most likely causes**:

**Driving too fast for the corner** — lateral forces cause the tyre to slip on the road surface, creating the squeal. Most common in performance driving, but also on very slippery road surfaces or worn tyres.

**Very worn tyres** — below 2mm of tread, tyres have significantly less lateral grip. They squeal at lower cornering forces than a new tyre.

**Understeer** — front tyres breaking traction before the rears in a corner. This creates a squeal from the front axle.

**Low tyre pressure** — underinflated tyres are more prone to squeal on corners.

If your tyres are squealing under normal driving at normal speeds, have the tread depth checked immediately.

---

### 5. Screeching or Screeching at High Speed

**Sound**: loud, harsh screeching at highway speed. Very unpleasant and abnormal.

**Most likely causes**:

**Tyre failure imminent** — unusual loud screeching from a tyre at speed can indicate internal failure before a blowout. Pull over safely and immediately if you hear this.

**Severely worn tyre** — a tyre worn completely through the tread to the cord will make a harsh, abrasive sound.

**Sidewall rubbing** — overly large tyres fitted without appropriate offsets can rub against the wheel arch at speed, creating a screeching noise.

---

## When Tyre Noise Requires Immediate Action

**Stop driving immediately if**:
- You hear loud screeching or banging that was not present before
- You hear a sound immediately after a pothole impact
- You hear thumping combined with the vehicle pulling to one side
- The noise is accompanied by visible vibration in the steering wheel or dashboard

**Attend to within a week if**:
- A gradual increase in humming noise over the past few weeks (likely cupping wear — safe to drive but deteriorating)
- Increased noise after fitting new all-terrain tyres (normal; monitor)

## Fixing Tyre Noise in Scotland

The fix depends entirely on the cause:

| Cause | Fix |
|---|---|
| Cupping/uneven wear | Replace affected tyre(s) + wheel balance check + shock absorber inspection |
| Wheel bearing failure | Replace wheel bearing (mechanical repair) |
| Aggressive tread pattern | Accept the noise, or switch to a quieter tyre type |
| Flat spot | Replace tyre if not resolving after 20 miles of driving |
| Very worn tyre | Replace immediately |
| Low tyre pressure | Inflate to correct pressure (may reduce noise if wear has not occurred) |

For tyre replacement, Tyre Rescue can come to your home, workplace, or roadside across all of Scotland. Call **0141 266 0690** or [book online](/book).

[Wheel balancing and alignment Scotland](/blog/wheel-balancing-vs-alignment-scotland) | [Uneven tyre wear guide](/blog/uneven-tyre-wear-guide-scotland) | [Signs you need new tyres](/blog/signs-you-need-new-tyres)`,
  },
  {
    slug: 'ineos-grenadier-tyre-fitting-scotland',
    title: 'Ineos Grenadier Tyre Fitting Scotland: Quartermaster, Trialmaster & Fieldmaster Guide',
    description:
      'Mobile tyre fitting for the Ineos Grenadier in Scotland. Factory 265/70R18 size, all-terrain vs mud-terrain tyre choice for Highland use, load index for Quartermaster pickup, and TPMS guide.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'Ineos Grenadier tyres scotland',
      'Grenadier tyre fitting scotland',
      'Ineos Grenadier tyre size',
      'Grenadier 265/70R18 tyre',
      'Ineos Grenadier all terrain tyres scotland',
      'Grenadier Quartermaster tyre scotland',
      'Ineos Grenadier tyre replacement scotland',
      'mobile tyre fitting ineos grenadier',
    ],
    relatedSlugs: [
      '4x4-suv-tyres-scotland-highlands',
      'jeep-tyre-fitting-scotland',
      'isuzu-dmax-tyre-fitting-scotland',
    ],
    content: `# Ineos Grenadier Tyre Fitting Scotland

The Ineos Grenadier is arguably the most capable purpose-built 4x4 to launch in Scotland's lifetime — designed from scratch to replace the original Land Rover Defender concept, and built to handle genuine off-road demands. Scotland's Highland estates, grouse moors, forestry tracks, and rough coastal roads are exactly the conditions the Grenadier was engineered for.

Tyre Rescue provides mobile tyre fitting for Grenadier across Scotland. Whether you are on a Highland estate, a forestry road, or a city car park in Glasgow, we come to you.

## Ineos Grenadier Tyre Size

All Grenadier variants — Trialmaster, Fieldmaster, and Quartermaster — use the same factory tyre size:

**265/70R18** — this is the only factory fitment across the Grenadier range as of 2024.

The Grenadier uses 18-inch beadlock-compatible steel wheels (standard) or alloy wheels (optional). The 265/70R18 size gives a substantial sidewall height (70 aspect ratio) — critical for off-road use and protection against pothole and rock damage.

**Load index**: 116 required on all Grenadier variants. The Grenadier weighs approximately 2,800 kg unladen, with a payload of up to 1,000 kg. Do not fit a tyre with a lower load index than 116.

**Quartermaster pickup**: the Grenadier Quartermaster (4-door pickup) has a higher payload rating and may require LT-rated 116/113R dual-load-rated tyres if used at maximum payload regularly.

## Choosing the Right Tyres for Your Grenadier in Scotland

The Grenadier comes from factory with BFGoodrich All-Terrain KO2 tyres — one of the most capable all-terrain tyres available in 265/70R18. For most Scottish owners, the KO2 is the right answer.

However, depending on your specific use, you may want to consider alternatives:

### All-Terrain (For Mixed Road and Off-Road)

**BFGoodrich All-Terrain KO2 265/70R18** — OE fitment; 3PMSF rated; outstanding performance in mud, snow, and loose terrain. The natural like-for-like replacement.

**Falken Wildpeak AT3W 265/70R18** — excellent performance in deep mud and snow at lower cost than KO2. 3PMSF rated. Popular with Scottish Grenadier owners wanting to save on replacements.

**Toyo Open Country AT3 265/70R18** — quieter on-road than KO2, comparable off-road performance. A good choice if you spend significant time on A-roads.

### Mud-Terrain (For Highland Estate / Forestry / Very Deep Mud)

**BFGoodrich Mud-Terrain KM3 265/70R18** — extreme mud performance; significant road noise, not suitable for regular motorway use. Ideal for estates, forestry contractors, and gamekeepers.

**Nitto Trail Grappler MT 265/70R18** — popular Highland estate choice; good off-road without the extreme road noise of a dedicated MT.

### Highway Terrain (For Primarily Road Use)

If the Grenadier is used as a road vehicle with occasional light off-road, highway terrain tyres reduce noise and improve fuel efficiency. However, the Grenadier's kerb weight means it needs a robust highway terrain tyre — lightweight SUV HT tyres are not appropriate.

**Michelin LTX MS2** (if available in 265/70R18) — premium HT tyre with good wet grip.

**Goodyear Wrangler DuraTrac** — a hybrid between HT and AT; good road manners with better off-road than standard HT.

## Grenadier TPMS

The Ineos Grenadier uses direct TPMS sensors. After fitting replacement tyres:

1. Set tyre pressures to the correct level:
   - **Road pressure**: 35 psi (2.4 bar) — all four tyres
   - **Off-road pressure (reduced for traction)**: 20–25 psi (1.4–1.7 bar)
   - Re-inflate to road pressure before driving at highway speed
2. Start the vehicle
3. Navigate to the TPMS reset option in the central display
4. Drive at 30+ mph for 5–10 minutes

**Note**: many Grenadier owners run reduced tyre pressures for off-road traction. Always reinflate to road pressures before driving at speed — the Grenadier's weight at reduced pressure on road is a handling and heat build-up risk.

## Grenadier Tyre Pressure for Scotland

The Grenadier's factory-recommended road pressures:
- **Front**: 35 psi / 2.4 bar
- **Rear**: 44 psi / 3.0 bar (loaded) or 35 psi / 2.4 bar (unloaded)

Running the correct rear pressure is particularly important when the Grenadier is used as a working vehicle with load — underinflation at load causes rapid rear tyre wear and blowout risk.

## Mobile Fitting for Grenadier in Remote Scotland

The Grenadier is often used in remote areas — Highland estates, forestry access roads, Scottish islands. Tyre Rescue can attend remote locations across Scotland, but response times increase significantly for areas north of Inverness, and the Western and Northern Isles require specific planning.

For remote Highland callouts, call us on **0141 266 0690** and give us your grid reference or postcode. We will give you an honest ETA and confirm whether same-day fitting is possible from our nearest technician.

We stock BFGoodrich KO2 and Falken Wildpeak AT3W in 265/70R18 as standard Highlands-area stock for the Grenadier.

Call **0141 266 0690** or [book online](/book).

[4x4 and Highland tyre guide Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [Jeep tyre guide Scotland](/blog/jeep-tyre-fitting-scotland) | [Isuzu D-Max tyre guide Scotland](/blog/isuzu-dmax-tyre-fitting-scotland)`,
  },
  {
    slug: 'how-long-do-tyres-last-scotland',
    title: 'How Long Do Tyres Last in Scotland? Mileage, Age & When to Replace',
    description:
      'How long should tyres last in Scotland? Expected mileage by tyre brand and type, the 6-year age rule, signs of worn tyres, and what accelerates tyre wear on Scottish roads.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 8,
    featured: false,
    keywords: [
      'how long do tyres last scotland',
      'tyre lifespan scotland',
      'how many miles do tyres last',
      'when to replace tyres scotland',
      'tyre mileage scotland',
      'how often replace tyres uk',
      'tyre wear rate scotland',
      'do tyres last longer in scotland',
    ],
    relatedSlugs: [
      'tyre-tread-depth-guide-scotland',
      'tyre-age-when-to-replace-scotland',
      'uneven-tyre-wear-guide-scotland',
    ],
    content: `# How Long Do Tyres Last in Scotland?

Tyre lifespan is one of the most common questions we hear from Scottish drivers — and the honest answer is: it depends. Budget tyres on a town car can last 15,000 miles. Premium tyres on a high-mileage SUV can last 40,000 miles. Age matters as much as mileage. And Scottish roads are harder on tyres than most of England.

Here is a practical guide to tyre lifespan on Scottish roads.

## Expected Tyre Mileage by Type

These are typical ranges for Scottish driving conditions. Your actual mileage will vary based on driving style, road type, and maintenance.

| Tyre Type | Expected Life (Scotland) |
|---|---|
| Budget (Nexen, Nankang, Triangle) | 15,000–20,000 miles |
| Mid-range (Goodyear, Dunlop, Firestone) | 20,000–30,000 miles |
| Premium summer (Michelin, Continental, Pirelli) | 25,000–40,000 miles |
| Premium all-season (Michelin CrossClimate, Continental AllSeasonContact) | 20,000–35,000 miles |
| Winter tyre (used seasonally) | 4–6 seasons (approx 30,000 winter miles) |

**Why Scotland is harder on tyres**:
- Scottish A-roads (A82, A9, A75, A96) have rougher surface texture than English motorways
- Higher rainfall means more hydroplaning risk and wet-road wear
- Pothole density is high, causing impact stress and misalignment wear
- Temperature swings between summer and winter cause more rubber compound cycling

## The 6-Year Rule: Why Age Matters More Than Mileage

Rubber compounds degrade over time regardless of use. UV exposure, ozone, heat cycling, and oxidation all cause tyre rubber to harden, crack, and lose flexibility — even on a tyre with 8mm of tread remaining.

**Industry guidance**:
- **6 years from manufacture**: tyre should be inspected by a professional for signs of age-related degradation
- **10 years from manufacture**: tyre should be replaced regardless of tread depth
- **Spare tyres**: apply the same age rules — a 10-year-old full-size spare is unsafe

**How to check your tyre's age**: look at the DOT code on the sidewall. The last four digits are the manufacture date — week and year. For example: **DOT ... 2419** = week 24 of year 2019 (manufactured June 2019). At September 2026, that tyre is over 7 years old and should be inspected.

See our full [tyre age guide](/blog/tyre-age-when-to-replace-scotland) for more detail.

## What Tyre Mileage to Expect From Common Scottish Cars

| Vehicle | Common Tyre Size | Expected Life (Premium) |
|---|---|---|
| Ford Focus / Vauxhall Astra | 205/55R16 | 28,000–35,000 miles |
| Nissan Qashqai | 225/55R18 | 22,000–30,000 miles |
| Toyota RAV4 | 225/60R18 | 22,000–28,000 miles |
| BMW 3 Series | 225/45R17 | 20,000–30,000 miles |
| VW Golf | 225/45R17 | 22,000–32,000 miles |
| Tesla Model 3 (performance) | 235/45R18 | 15,000–22,000 miles (EV torque accelerates wear) |
| MG4 EV | 215/55R17 | 15,000–20,000 miles |
| Isuzu D-Max | 265/65R17 | 25,000–40,000 miles (LT-rated tyres last longer) |

**EVs wear tyres faster** — instant torque delivery and heavier kerb weight mean EVs typically consume tyres 20–30% faster than equivalent petrol cars. Budget EV owners are often surprised by this.

## Factors That Shorten Tyre Life in Scotland

**1. Driving style** — the single biggest factor. Aggressive acceleration, late braking, and fast cornering all dramatically increase wear. Spirited driving can halve tyre life compared to smooth driving of the same distance.

**2. Road surface quality** — Scottish B-roads, Highland single tracks, and pothole-heavy urban roads all accelerate tyre wear vs smooth motorway driving.

**3. Wheel alignment** — misaligned wheels (especially toe) cause rapid one-sided wear. A wheel knocked out of alignment by a pothole can wear a tyre to legal limit in 5,000 miles rather than 20,000. Check alignment after any significant impact.

**4. Tyre pressure** — under-inflation causes shoulder wear and increases wear rate significantly. Over-inflation causes centre wear. Pressure should be checked monthly — especially in winter when cold temperatures reduce pressure.

**5. Braking distance** — driving that requires heavy, repeated braking wears tyres faster. Urban stop-start driving is harder on tyres than motorway cruising.

**6. Weight** — EVs and PHEVs have shorter tyre life than equivalent petrol cars due to battery weight. Loading a pickup truck to capacity consistently will also shorten rear tyre life.

## Warning Signs Your Tyres Need Replacing

**Tread depth below 3mm** — legal minimum is 1.6mm, but grip degrades significantly below 3mm on wet roads. Plan to replace at 3mm in Scotland given our rainfall.

**Visible sidewall bulge or bubble** — replace immediately; do not drive at speed.

**Cracking or crazing** — surface cracks in older rubber indicate age degradation.

**Vibration at speed** — may indicate internal cord damage or structural failure.

**Pulling to one side** — can indicate uneven wear or tyre damage.

**TPMS warning light** — indicates a tyre is at or below the low-pressure threshold.

## How to Make Tyres Last Longer in Scotland

1. **Maintain correct tyre pressure** — check monthly. This is the single most effective thing you can do.
2. **Rotate tyres** (if using a square fitment) — front-to-rear rotation every 6,000–8,000 miles equalises wear.
3. **Get alignment checked** after any significant pothole impact or kerb strike.
4. **Drive smoothly** — gradual acceleration and early braking extend tyre life significantly.
5. **Choose the right tyre** — premium tyres with higher tread life ratings will outlast budget tyres, often making them better value over the tyre's lifetime.
6. **Inspect tyres seasonally** — quick visual check for cracking, bulges, and abnormal wear before Scotland's winter sets in.

## Getting New Tyres in Scotland

When your tyres need replacing, Tyre Rescue can come to your home, office, or roadside across all of Scotland. We fit and balance your new tyres on-site in around 30 minutes per tyre.

For an accurate quote, give us your registration number and we will confirm the correct size, load index, and speed rating for your vehicle before fitting anything.

Call **0141 266 0690** or [book online](/book).

[Tyre tread depth guide Scotland](/blog/tyre-tread-depth-guide-scotland) | [Tyre age guide Scotland](/blog/tyre-age-when-to-replace-scotland) | [Uneven tyre wear guide](/blog/uneven-tyre-wear-guide-scotland)`,
  },
  {
    slug: 'genesis-tyre-fitting-scotland',
    title: 'Genesis Tyre Fitting Scotland: GV60, GV70, GV80, G70 & G80 Tyre Guide',
    description:
      'Mobile tyre fitting for Genesis vehicles in Scotland. GV60 EV staggered fitment, GV70 electrified PHEV load index, GV80 tyre sizes, G70 staggered sports saloon — complete guide.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'Genesis GV60 tyre size scotland',
      'Genesis tyre fitting scotland',
      'Genesis GV70 tyres scotland',
      'Genesis GV80 tyres scotland',
      'Genesis G70 tyres scotland',
      'mobile tyre fitting genesis scotland',
      'Genesis GV60 flat tyre scotland',
      'Genesis electrified tyre scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'hyundai-tyre-fitting-scotland',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# Genesis Tyre Fitting Scotland

Genesis is Hyundai's luxury brand, and the GV60 EV, GV70 Electrified, and GV80 SUV are increasingly common on Scottish roads — particularly in Edinburgh, Glasgow, and Aberdeen. Like all premium EVs and PHEVs, Genesis vehicles have specific tyre requirements that standard tyre fitters may not be aware of.

## Genesis GV60 Tyre Guide (2022–present)

The GV60 is Genesis's dedicated electric sports crossover, sharing the Hyundai E-GMP platform with the Ioniq 5 and Kia EV6.

| GV60 Variant | Front | Rear | Wheel |
|---|---|---|---|
| GV60 Standard AWD | 235/55R19 (front) | 255/45R19 (rear) | 19" |
| GV60 Performance AWD | 245/45R20 (front) | 275/35R20 (rear) | 20" |
| GV60 Magma Performance | 245/40R21 (front) | 275/35R21 (rear) | 21" |

**Staggered fitment** — the GV60 uses different front and rear tyre sizes on all-wheel-drive variants. This means the tyres **cannot be rotated**. When calling Tyre Rescue, specify which axle needs replacement.

**No spare wheel** — the GV60 does not carry a spare tyre. An inflation kit is standard. For any non-repairable puncture (sidewall damage, large penetration), call immediately and do not drive on the tyre.

**Load index**: 99+ required on all GV60 variants due to battery weight (approximately 2,100 kg kerb weight).

**OE fitment**: the GV60 Performance typically comes with Michelin Pilot Sport 4S or Pirelli P Zero Elect acoustic tyres.

## Genesis GV70 Tyre Guide (Including Electrified)

| GV70 Variant | Tyre Size | Load Index Note |
|---|---|---|
| GV70 2.5T petrol (2WD) | 235/55R19 | 105+ |
| GV70 2.5T petrol (AWD) | 235/55R19 | 107+ |
| GV70 3.5T V6 (AWD) | 265/40R21 | 105+ |
| GV70 Electrified AWD | 245/45R20 | 103+ (PHEV/EV weight) |

**GV70 Electrified load index**: the electrified GV70 is significantly heavier than the petrol equivalent. Minimum load index 103 — do not fit a lower rating.

**GV70 3.5T 21-inch wheels**: specialist stock size. Call ahead to confirm same-day availability for 265/40R21.

## Genesis GV80 Tyre Guide

| GV80 Variant | Tyre Size |
|---|---|
| GV80 2.5T (2WD) | 265/50R20 |
| GV80 2.5T / 3.5T (AWD) | 265/50R20 or 275/40R21 |
| GV80 Coupe (2024+) | 275/40R21 |

**Load index**: GV80 with full seven-seat loading requires 110+ on 20-inch wheels. Confirm load rating before fitting.

## Genesis G70 Tyre Guide (Sports Saloon)

| G70 Variant | Front | Rear | Note |
|---|---|---|---|
| G70 2.0T (2WD/AWD) | 225/40R19 | 225/40R19 | Square fitment |
| G70 3.3T V6 AWD | 225/40R19 (F) | 255/35R19 (R) | Staggered |
| G70 Shooting Brake | 225/40R19 | 225/40R19 | Square fitment |

**G70 3.3T staggered**: the V6 G70 Sport uses slightly wider rear tyres. Confirm front or rear when ordering.

## Genesis G80 and Electrified G80

| G80 Variant | Tyre Size | Note |
|---|---|---|
| G80 2.5T petrol (AWD) | 245/45R19 or 245/40R20 | Size varies by trim |
| G80 Electrified EV | 245/45R19 | Load index 102+; no spare |
| G80 3.5T V6 | 245/40R20 | LI 99+ |

**G80 Electrified**: no spare wheel. Inflation kit only. Sidewall or unrepairable puncture requires immediate mobile fitting.

## Genesis TPMS Reset

Genesis uses direct TPMS sensors across all models. After tyre fitting:

1. Inflate to correct pressures (driver's door sticker or Genesis Connect app)
2. Start the vehicle
3. Navigate to: **Settings > Vehicle > Tyre Pressure Monitor > Reset TPMS**
4. Confirm and drive at 25+ mph for 10 minutes

If the warning persists, the sensor may need reprogramming. Genesis shares Hyundai/Kia diagnostic architecture — Tyre Rescue technicians carry compatible TPMS reset tools.

## Recommended Tyres for Genesis in Scotland

Genesis targets a premium driving experience. Scotland's wet roads make wet-grip performance the most critical attribute.

**GV60 / G70 performance variants**: Michelin Pilot Sport EV (for EVs) or Pirelli P Zero Elect — both outstanding in wet conditions.

**GV70 / GV80 SUV**: Continental PremiumContact 7 or Michelin Pilot Sport 4 SUV — excellent wet grip ratings in SUV sizes.

**All Genesis models for Scottish winter**: all-season tyres (3PMSF rated) recommended for Central Belt city driving from October to April. Michelin CrossClimate 2 or Continental AllSeasonContact 2 available in most Genesis sizes.

## Book Mobile Tyre Fitting for Your Genesis in Scotland

Call **0141 266 0690** or [book online](/book) for mobile Genesis tyre fitting across Glasgow, Edinburgh, Aberdeen, and all of Scotland.

[EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland) | [Hyundai tyre fitting Scotland](/blog/hyundai-tyre-fitting-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'polestar-tyre-fitting-scotland',
    title: 'Polestar Tyre Fitting Scotland: Polestar 2, 3 & 4 Complete Tyre Guide',
    description:
      'Mobile tyre fitting for Polestar 2, 3, and 4 in Scotland. Tyre sizes, load index requirements, run-flat vs standard, no-spare-wheel guidance, and TPMS reset for all Polestar models.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'Polestar 2 tyre size scotland',
      'Polestar tyre fitting scotland',
      'Polestar 2 tyres scotland',
      'Polestar 3 tyres scotland',
      'Polestar 4 tyres scotland',
      'mobile tyre fitting polestar scotland',
      'Polestar 2 flat tyre scotland',
      'Polestar EV tyre scotland',
    ],
    relatedSlugs: [
      'electric-vehicle-tyres-scotland',
      'tyre-prices-scotland-guide-2026',
      'tpms-warning-light-scotland-guide',
    ],
    content: `# Polestar Tyre Fitting Scotland

Polestar is Volvo's performance EV sub-brand, and the Polestar 2 has become one of Scotland's most popular premium EVs. With the Polestar 3 (SUV) and Polestar 4 (fastback) now joining the range, more Scottish drivers are finding that EV-specific tyre knowledge is essential. Tyre Rescue fits tyres for the full Polestar range across Scotland.

## Polestar 2 Tyre Guide (2020–present)

The Polestar 2 is available in Standard Range, Long Range Single Motor, and Long Range Dual Motor variants. Tyre size varies by trim and wheel choice:

| Polestar 2 Variant | Factory Tyre Size | Wheel |
|---|---|---|
| Standard Range (RWD) | 235/45R19 | 19" alloy |
| Long Range Single Motor | 235/45R19 | 19" alloy |
| Long Range Dual Motor | 245/40R20 or 245/45R19 | 20" alloy (option) |
| BST Edition 270 Performance | 245/40R20 | 20" forged alloy |

**Load index**: 99+ required on all Polestar 2 variants due to battery weight (1,800–2,000 kg kerb weight depending on variant).

**No spare wheel** — the Polestar 2 does not carry a spare. Volvo/Polestar supply an inflation kit for minor tread area punctures. Sidewall damage or large punctures require a replacement tyre — call Tyre Rescue immediately.

**OE tyre choice**: from factory, most Polestar 2s use Michelin Pilot Sport 4 EV or Pirelli P Zero in the EV variant. Both are acoustic foam-lined to reduce road noise transmitted by EV drivetrains. When replacing, maintain an EV-rated tyre if noise performance matters to you.

## Polestar 3 Tyre Guide (2024–present)

The Polestar 3 is a large SUV platform shared with the Volvo EX90.

| Polestar 3 Variant | Tyre Size | Load Index |
|---|---|---|
| Polestar 3 Standard | 265/40R22 | 106+ |
| Polestar 3 Performance Pack | 265/35R22 | 102+ |

**22-inch wheels**: the Polestar 3 uses large 22-inch wheels on most configurations. This limits tyre sourcing — not all mobile tyre vans carry 22-inch stock as standard. Call ahead to confirm stock for your specific size.

**No spare wheel** — inflation kit only. Call Tyre Rescue for any non-repairable puncture.

**Load index**: 106+ required. Do not fit a lower load index on a Polestar 3.

## Polestar 4 Tyre Guide (2024–present)

The Polestar 4 is a coupe-SUV with staggered fitment.

| Polestar 4 Variant | Front | Rear |
|---|---|---|
| Polestar 4 Standard | 245/45R20 | 265/40R20 |
| Polestar 4 Performance Pack | 245/40R21 | 265/35R21 |

**Staggered fitment** — the Polestar 4 has different front and rear tyre sizes. This means front and rear tyres **cannot be rotated**. When calling Tyre Rescue, specify which axle needs replacement.

**No spare wheel** — inflation kit only. The Polestar 4 is a performance fastback with no spare wheel provision.

## Polestar TPMS Reset

All Polestar models (2, 3, 4) use direct TPMS sensors. The Polestar connected app often displays live tyre pressure from TPMS sensors.

After tyre fitting:
1. Inflate all tyres to the correct pressure (sticker inside driver's door, or Polestar app)
2. Sit in the vehicle, start the car
3. Navigate to: **Car Status > Tyre Pressure** in the Polestar touchscreen
4. Select **Calibrate** and confirm
5. Drive at 30+ mph for 5–10 minutes

If the TPMS warning persists after the above, a sensor may need replacement. Our technicians carry Volvo/Polestar-compatible TPMS equipment.

## Why Polestar Tyres Are Different

Polestar models share Volvo's commitment to EV acoustic comfort — which means several Polestar-recommended tyres use acoustic foam lining on the inner surface to reduce road noise.

Polestar EVs are also notably heavy (the Polestar 2 weighs around 2,000 kg in Long Range Dual Motor form — more than many SUVs). This puts additional demands on tyres:

- **Higher load index** — do not compromise on this
- **Faster wear** — expect 15,000–20,000 miles from most tyres vs 25,000+ on equivalent petrol cars
- **Better wet grip needed** — greater mass requires more grip to stop safely on Scotland's wet roads

**Recommended tyres for Polestar 2 in Scotland**:
- **Michelin Pilot Sport EV** (available in 235/45R19) — OE on many Polestar 2s; outstanding wet grip and EV-tuned compound
- **Continental SportContact 7** — excellent dry and wet performance
- **Pirelli P Zero PZ4 Elect** — acoustic variant; best for noise-sensitive drivers

## Book Mobile Tyre Fitting for Your Polestar in Scotland

We carry common Polestar 2 tyre sizes (235/45R19) in our Scotland vans. For 22-inch and performance sizes, call ahead to confirm same-day availability.

Call **0141 266 0690** or [book online](/book) for mobile Polestar tyre fitting anywhere in Scotland.

[EV tyre guide Scotland](/blog/electric-vehicle-tyres-scotland) | [Tyre prices Scotland 2026](/blog/tyre-prices-scotland-guide-2026) | [TPMS warning light guide](/blog/tpms-warning-light-scotland-guide)`,
  },
  {
    slug: 'isuzu-dmax-tyre-fitting-scotland',
    title: 'Isuzu D-Max Tyre Fitting Scotland: Sizes, Load Ratings & All-Terrain Guide',
    description:
      'Mobile tyre fitting for Isuzu D-Max in Scotland. Factory sizes 265/65R17 and 245/65R17, LT/C-rated requirements, all-terrain tyre advice for Highland use, and TPMS reset guide.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'Isuzu D-Max tyres scotland',
      'D-Max tyre size scotland',
      'Isuzu D-Max tyre fitting scotland',
      'D-Max all terrain tyres scotland',
      'Isuzu D-Max tyre replacement scotland',
      'D-Max 265/65R17 tyre',
      'pickup truck tyres scotland',
      'LT rated tyres scotland',
    ],
    relatedSlugs: [
      '4x4-suv-tyres-scotland-highlands',
      'van-tyre-fitting-scotland',
      'all-season-tyres-scotland-guide',
    ],
    content: `# Isuzu D-Max Tyre Fitting Scotland

The Isuzu D-Max is one of Scotland's most practical working vehicles — found on farms in Aberdeenshire, Highland estates, construction sites across the Central Belt, and with outdoor businesses throughout rural Scotland. As a light commercial pickup, the D-Max has specific tyre requirements that standard car tyre centres often do not stock.

Tyre Rescue fits tyres for all D-Max generations across Scotland, including C-rated and LT-rated commercial tyres.

## Isuzu D-Max Tyre Sizes by Generation

| D-Max Generation | Tyre Size | Load Rating |
|---|---|---|
| D-Max Gen 1 (2004–2012) | 245/70R16 | 111S (LT requirement) |
| D-Max Gen 2 (2012–2020) | 245/65R17 | 111H or 111S |
| D-Max Gen 3 / Blade / XTR (2021+) | 265/65R17 | 112H |
| D-Max V-Cross (2021+) | 265/65R17 | 112H |
| D-Max AT35 (Arctic Trucks) | 285/70R17 | Arctic Trucks OE |

**Load index requirement**: the D-Max is a light commercial vehicle with a payload of up to 1,000 kg. The tyre's load index must match the vehicle's maximum axle loading. **Never fit a standard passenger tyre (LI 94–99) on a D-Max** — the vehicle requires commercial-grade tyres.

**LT vs C rating**: in the UK market, D-Max tyres are typically specified as standard load or XL rating at high LI numbers (109+). "LT" designation (Light Truck) is the US system; European equivalents are the commercial load ratings. Confirm the load index matches the vehicle placard before fitting.

## Best Tyres for Isuzu D-Max in Scotland

### For On-Road / Motorway Use

If the D-Max is primarily a commuter or road vehicle with occasional light off-road:

- **BFGoodrich All-Terrain KO2 265/65R17** — the most popular choice for Scottish D-Max owners; excellent on mud and snow, 3PMSF rated, acceptable road noise
- **Toyo Open Country AT3 265/65R17** — quieter on road than KO2, still strong off-road
- **Falken Wildpeak AT3W 265/65R17** — outstanding in wet and mud, competitive pricing

### For Off-Road / Farm / Highland Estate Use

If the D-Max is used regularly on mud tracks, farm access roads, or Highland estate ground:

- **BFGoodrich Mud-Terrain KM3** — aggressive mud tyre; significant road noise but outstanding grip in deep mud
- **Nitto Trail Grappler MT** — popular Highland estate choice; good balance of mud and rock performance
- **Toyo Open Country MT** — strong performance in Scottish peat and mud terrain

**Scottish Highland note**: the D-Max AT35 (Arctic Trucks edition) comes with specialist 35" Nokian Hakkapeliitta tyres from factory. Replacements for the AT35 are non-standard and must be sourced specifically — call us to confirm availability.

### For All-Season (Mixed Road / Light Off-Road)

- **Michelin CrossClimate 2 Van** (where available in size) — 3PMSF rated, acceptable for light off-road
- **Nokian Seasonproof C** — designed specifically for light commercial vehicles in Scandinavian and Scottish conditions

## D-Max Tyre Pressure Guide

The D-Max is rear-wheel-drive with a separate rear axle (ladder-frame chassis). Correct tyre pressure varies significantly depending on load:

| Load Condition | Front | Rear |
|---|---|---|
| Empty/light load | 35 psi (2.4 bar) | 35 psi (2.4 bar) |
| Half load | 38 psi (2.6 bar) | 42 psi (2.9 bar) |
| Full payload | 40 psi (2.8 bar) | 50 psi (3.4 bar) |

Confirm exact pressures on the vehicle door pillar sticker — the above are approximate typical values for the Gen 3. Running at low pressure under full payload causes rapid sidewall wear and increases blowout risk.

## TPMS on Isuzu D-Max

Isuzu D-Max (Gen 3, 2021+) uses direct TPMS sensors. After tyre fitting:

1. Set tyre pressures to recommended values
2. Start the engine and let idle for 2–3 minutes
3. Drive at 30+ mph for 5–10 minutes
4. TPMS light should extinguish automatically

If it persists, the sensor may need programming using an Isuzu-compatible TPMS tool. Our technicians carry the necessary equipment for common TPMS reset procedures.

Gen 2 D-Max (2012–2020): standard models often do not carry TPMS — verify your specific vehicle using the instrument cluster.

## Spare Wheel on D-Max

The Isuzu D-Max carries a full-size spare wheel mounted under the rear of the load bed. This is one of the advantages of the D-Max for rural and Highland use — you can continue driving after a single puncture. We recommend the spare tyre matches the other four tyres in brand, size, and load rating.

## Mobile D-Max Tyre Fitting Across Scotland

We stock 265/65R17 and 245/65R17 AT/HT tyres across our Scotland vans as standard stock. For specialist sizes (285/70R17, 35" fitments, mud-terrain variants), call ahead to confirm same-day availability.

Our vans carry commercial-grade tyre mounting equipment capable of handling D-Max wheel weight and load.

Call **0141 266 0690** or [book online](/book) for mobile D-Max tyre fitting anywhere in Scotland.

[Van and commercial tyre guide Scotland](/blog/van-tyre-fitting-scotland) | [4x4 and SUV tyre guide Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [All-season tyres Scotland](/blog/all-season-tyres-scotland-guide)`,
  },
  {
    slug: 'jeep-tyre-fitting-scotland',
    title: 'Jeep Tyre Fitting Scotland: Wrangler, Renegade, Compass & Avenger Guide',
    description:
      'Mobile tyre fitting for all Jeep models in Scotland. Wrangler all-terrain tyre advice, Renegade 4xe PHEV load index, Compass, Avenger EV no-spare wheel guidance, and TPMS reset.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 6,
    featured: false,
    keywords: [
      'Jeep Wrangler tyres scotland',
      'Jeep Renegade tyre fitting scotland',
      'Jeep Compass tyres scotland',
      'Jeep tyre replacement scotland',
      'mobile tyre fitting Jeep scotland',
      'Jeep 4xe PHEV tyres scotland',
      'Jeep Avenger EV tyres scotland',
      'Jeep Wrangler all terrain tyres scotland',
    ],
    relatedSlugs: [
      '4x4-suv-tyres-scotland-highlands',
      'all-season-tyres-scotland-guide',
      'tyre-prices-scotland-guide-2026',
    ],
    content: `# Jeep Tyre Fitting Scotland

Jeep is one of Scotland's most capable 4x4 brands — the Wrangler in particular is a Highland staple, used by hill walkers, farmers, and off-road enthusiasts. Tyre Rescue fits tyres for the full Jeep range across Scotland, from city-spec Avengers to full Rubicon 4x4 builds.

## Jeep Wrangler Tyre Guide

The Wrangler is available in a huge range of configurations and tyre sizes. The right tyre depends on your trim level and whether you have factory or aftermarket wheels.

| Wrangler Variant | Factory Tyre Size | Wheel |
|---|---|---|
| Sport (UK base trim) | 255/70R18 | 18" |
| Sahara | 255/70R18 | 18" steel or alloy |
| Rubicon | 285/70R17 | 17" (BFGoodrich KO2 OE) |
| Rubicon 4xe PHEV | 255/70R18 | 18" |

**Off-road vs road tyres**: the Wrangler is designed to accept a wide range of tyre types. Factory Highway Terrain (HT) tyres — such as the Nexen Roadian — are adequate for road use but offer limited off-road performance. Many Scottish Wrangler owners upgrade to All-Terrain (AT) tyres for Highland use.

**Best all-terrain tyres for Scotland Wranglers**:
- **BFGoodrich All-Terrain KO2** — the OE choice on Rubicons; excellent on mud, snow, and rock
- **Falken Wildpeak AT3W** — strong performer in Scottish mud and wet conditions at lower cost
- **Nitto Ridge Grappler** — popular hybrid AT/MT for drivers who want off-road capability without road noise penalty

**Load index for Wrangler 4xe PHEV**: the 4xe plug-in hybrid Wrangler is significantly heavier than the standard petrol. Minimum load index 107+. Do not fit standard highway terrain tyres rated at 104 or below.

**Note on lifted Wranglers**: many Scottish Wrangler owners run 2–4 inch lifts with 35" tyres (315/70R17 equivalent). We can fit 35" tyres subject to vehicle height; call ahead to confirm your tyre size is in stock.

## Jeep Renegade Tyre Guide

| Renegade Variant | Tyre Size | Note |
|---|---|---|
| Renegade 1.0T / 1.3T FWD | 215/65R16 or 225/55R17 | Standard |
| Renegade 1.3T 4xe PHEV | 215/55R18 | Load index 99+ |
| Renegade Trailhawk 4x4 | 215/65R17 | All-terrain pattern from factory |

**Renegade 4xe PHEV**: the plug-in hybrid Renegade weighs approximately 1,850 kg — significantly heavier than the petrol variant. Minimum load index 99. Do not fit a lower rating.

**Renegade Trailhawk**: often fitted with Falken Wildpeak A/T tyres from factory. If replacing, maintain an all-terrain specification for the Trailhawk's raised suspension and off-road capability — fitting pure road tyres negates the Trailhawk purpose.

## Jeep Compass Tyre Guide

| Compass Variant | Tyre Size |
|---|---|
| Compass 1.3T FWD | 215/65R16 or 225/55R17 |
| Compass 4xe PHEV (Trailhawk) | 215/55R18, load index 99+ |
| Compass S (2023+) | 215/55R18 |

**Compass 4xe PHEV**: same PHEV load index requirement as Renegade 4xe. Minimum 99 — confirm before fitting.

## Jeep Avenger Tyre Guide (EV)

The Avenger is Jeep's first battery electric vehicle, launched in 2023.

| Avenger Variant | Tyre Size | Notes |
|---|---|---|
| Avenger Electric (FWD) | 215/55R17 | No spare wheel |
| Avenger 4xe Electric AWD | 215/55R17 | No spare wheel; AWD model |

**No spare wheel** — the Avenger EV does not carry a spare. Stellantis/Jeep supply an inflation kit. Sidewall damage or large punctures require a new tyre — call Tyre Rescue immediately and do not drive on the damaged tyre.

**Load index**: 99+ required on the Avenger EV due to battery weight.

**TPMS on Avenger**: direct TPMS sensors. After fitting new tyres, sensors must be reset using the Jeep vehicle menu or a diagnostic tool. Our technicians carry the relevant reset capability for Stellantis TPMS.

## Jeep TPMS Reset Procedure

For Renegade, Compass, and Grand Cherokee models:
1. Check and set tyre pressure to the recommended level (driver's door sticker)
2. Turn ignition to ON (engine off)
3. Press and hold the TPMS reset button (varies by model — dashboard button or steering wheel menu)
4. Hold until TPMS light blinks three times
5. Drive at 15+ mph for 5 minutes to complete calibration

If TPMS warning persists, a sensor may require replacement (battery-powered sensors typically last 7–10 years).

## Best Tyres for Scottish Jeep Owners

**For Highland / off-road use (Wrangler, Renegade Trailhawk)**:
- BFGoodrich KO2 All-Terrain — most popular choice
- Falken Wildpeak AT3W — excellent snow/mud, 3PMSF rated

**For city/commuter use (Compass, Avenger, standard Renegade)**:
- Michelin CrossClimate 2 — best all-round for Scottish weather (3PMSF rated)
- Continental AllSeasonContact 2 — very good wet grip, 3PMSF rated

**For mixed road/light off-road (Wrangler Sahara, Renegade 4xe)**:
- Michelin CrossClimate 2 (if mostly road use)
- Falken Wildpeak AT3W (if regular light off-road)

## Book Mobile Tyre Fitting for Your Jeep in Scotland

Tyre Rescue carries common Jeep tyre sizes across our Scotland vans. For specialist sizes (285/70R17, 255/70R18, 35" AT tyres), call ahead to confirm same-day stock.

Call **0141 266 0690** or [book online](/book).

[4x4 and SUV tyre guide Scotland](/blog/4x4-suv-tyres-scotland-highlands) | [All-season tyres Scotland](/blog/all-season-tyres-scotland-guide) | [Tyre prices 2026](/blog/tyre-prices-scotland-guide-2026)`,
  },
  {
    slug: 'tyre-sidewall-damage-scotland',
    title: 'Tyre Sidewall Damage: Can It Be Repaired? Scotland Guide',
    description:
      'Is your tyre sidewall damaged? Bubbles, cuts, scrapes — what can be repaired and what requires immediate replacement. Scotland mobile tyre fitting guide for sidewall damage.',
    category: 'safety',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'tyre sidewall damage scotland',
      'sidewall bulge tyre scotland',
      'can tyre sidewall be repaired',
      'tyre bubble on sidewall scotland',
      'tyre sidewall cut scotland',
      'kerb damage tyre scotland',
      'tyre sidewall scuff scotland',
      'is my tyre safe scotland',
      'sidewall damage repair scotland',
    ],
    relatedSlugs: [
      'pothole-damage-tyres-scotland',
      'signs-you-need-new-tyres',
      'tyre-tread-depth-guide-scotland',
    ],
    content: `# Tyre Sidewall Damage: Can It Be Repaired?

The sidewall of your tyre is the curved section between the tread and the wheel rim. Unlike the tread area, tyre sidewalls cannot be repaired under any circumstances — and driving on a damaged sidewall is genuinely dangerous.

This guide explains every type of sidewall damage you might encounter, what it means, and what to do about it.

## Can a Tyre Sidewall Be Repaired?

**No. Sidewall damage cannot be repaired — ever.**

British Standard BSAU159 (the repair standard for tyres in the UK) only permits repairs to the central three-quarters of the tread area. Repairs to the sidewall are prohibited because:

1. The sidewall flexes constantly as the tyre rotates. A repair would not withstand this flex and would fail.
2. The sidewall contains reinforcing cords (often steel or aramid fibre) that carry the load. Any damage to these cords compromises structural integrity.
3. A sidewall failure at speed causes an instantaneous blowout — there is no warning.

If a tyre fitter tells you they can repair your sidewall, do not trust them. This is not a matter of opinion; it is a legal and safety standard.

## Types of Sidewall Damage

### 1. Tyre Bubble / Bulge

**What it looks like**: a visible lump or bubble protruding from the sidewall. May appear suddenly or develop over days.

**Cause**: impact damage — usually from a pothole, kerb strike, or speed bump at excessive speed. The impact breaks internal cords in the sidewall. Trapped air pushes through the damaged area, creating the bubble.

**Is it dangerous?**: yes. A tyre bubble can fail (blowout) at any time, including at motorway speed. This is a condition that requires immediate action.

**What to do**: do not drive on the tyre. If you notice a bubble while stationary, call Tyre Rescue for mobile fitting. If you are already driving and notice vibration or a bulge, reduce speed immediately, find a safe place to stop, and call us.

**Scotland note**: Scottish roads have a very high pothole density. The A75 Dumfries & Galloway, the A96 in Aberdeenshire, and many Highland single-track roads are frequent causes of sidewall bubble damage. Tyre Rescue attends pothole-related sidewall damage callouts daily across Scotland.

---

### 2. Sidewall Cut or Gash

**What it looks like**: a visible cut, slash, or gash in the sidewall rubber — sometimes with visible internal cord material.

**Cause**: sharp road debris (broken glass, metal fragments, sharp stone edges), or contact with a sharp kerb edge.

**Can it be repaired?**: no. Any cut that penetrates the rubber to the cord is unsafe to drive on. Even a cut that has not penetrated the full depth weakens the sidewall and may progress to failure.

**What to do**: if you can see cord material (fabric-like or metal fibres), stop driving immediately and call for a replacement tyre. If the cut appears to be only in the outer rubber and has not penetrated through, drive carefully to a safe location and have it inspected — do not use the motorway or drive at high speed.

---

### 3. Sidewall Scuff or Scrape (Shallow Kerbing)

**What it looks like**: a surface abrasion or rubber scraped away, but no cut or bubble visible. The sidewall looks scuffed.

**Cause**: light kerb contact — parallel parking too close to the kerb, or scraping a kerb at slow speed.

**Can it be repaired?**: this is the only borderline case. If the damage is purely cosmetic (outer rubber scraped but no cut through the rubber, no cord visible, no deformation), it may be safe to continue using the tyre. However, you cannot tell from visual inspection alone whether the cords have been stressed.

**What to do**: have the tyre inspected by a tyre professional. We will deflate the tyre, inspect the inside of the sidewall for cord damage, and give you a definitive answer. If in doubt, replace it — a tyre costs £60–£150; a blowout at speed can cost lives.

---

### 4. Cracking or Crazing of the Sidewall

**What it looks like**: fine cracks in the sidewall rubber — like a dried mud pattern. May be visible around the bead area (where the tyre meets the wheel) or across the sidewall surface.

**Cause**: tyre age, UV exposure, ozone degradation, or long periods of under-inflation. The rubber compounds harden and crack over time.

**Is it dangerous?**: fine surface crazing may be cosmetic, but cracking that extends into the sidewall structure is dangerous. Tyres over 5–6 years old with visible cracking should be replaced even if tread depth is adequate.

**What to do**: check the tyre manufacture date (the four-digit DOT code on the sidewall — e.g., "2819" means week 28, year 2019). If the tyre is over 6 years old, replace it. Our [tyre age guide](/blog/tyre-age-when-to-replace-scotland) covers this in full.

---

## What About Run-Flat Tyres?

Run-flat tyres (BMW RSC, Mercedes EMT/MOExtended, Bridgestone RFT) have reinforced sidewalls that can support the vehicle for a limited distance even when deflated. However, a run-flat tyre with a bubble, cut, or structural damage to the sidewall must still be replaced immediately — the run-flat capability only applies to punctures in the tread area, not sidewall damage.

---

## Driving on a Damaged Sidewall: The Legal Position

In Scotland (and across the UK), driving on a tyre with a dangerous defect (which includes any structural sidewall damage) is an offence under the Road Vehicles (Construction and Use) Regulations 1986. Penalties include:

- A fine of up to £2,500 per tyre
- 3 points on your licence per tyre
- Vehicle being declared unfit for road use (prohibition notice)

A vehicle involved in a collision where a defective tyre is found may also affect insurance liability.

---

## Getting a Replacement Tyre in Scotland

If you are stranded with sidewall damage, Tyre Rescue can attend your location across all of Scotland — usually within 30–55 minutes in cities, longer in rural areas.

- **Stranded on the roadside**: switch on hazard lights, move away from the vehicle if it is on a live road, and call **0141 266 0690**.
- **Stranded in a car park or at home**: call or [book online](/book) and we will come to you at a scheduled time.
- **On a motorway**: call 0141 266 0690 and also inform Highways Scotland/Traffic Scotland — they will manage the lane closure while we attend.

[Pothole tyre damage guide](/blog/pothole-damage-tyres-scotland) | [Signs you need new tyres](/blog/signs-you-need-new-tyres) | [Emergency tyre fitting near me](/emergency-tyre-fitting-near-me)`,
  },
  {
    slug: 'uneven-tyre-wear-guide-scotland',
    title: 'Uneven Tyre Wear: Causes, Diagnosis & What to Do in Scotland',
    description:
      'Why are your tyres wearing unevenly? Inner edge, outer edge, centre, or patchy wear — each pattern points to a specific cause. Complete guide to uneven tyre wear diagnosis and fixes in Scotland.',
    category: 'maintenance',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 9,
    featured: false,
    keywords: [
      'uneven tyre wear scotland',
      'tyre wearing on inside edge',
      'tyre wearing on outside edge',
      'patchy tyre wear',
      'centre tyre wear',
      'tyre wear diagnostic scotland',
      'why are my tyres wearing unevenly',
      'tyre wear causes scotland',
      'inner shoulder tyre wear',
      'outer shoulder tyre wear',
    ],
    relatedSlugs: [
      'wheel-balancing-vs-alignment-scotland',
      'tyre-tread-depth-guide-scotland',
      'tyre-rotation-guide-scotland',
    ],
    content: `# Uneven Tyre Wear: Causes, Diagnosis, and What to Do

Uneven tyre wear is one of the most common signs that something is wrong with your vehicle — and it's one of the first things a knowledgeable tyre fitter will flag. Rather than just fitting new tyres, the underlying cause must be identified and corrected, or the new tyres will wear out in the same way.

This guide explains every uneven wear pattern and what causes it.

## How to Read Your Tyre Wear

Before diagnosing uneven wear, you need to inspect your tyres correctly. Run your hand across the tyre tread from the inner edge (closest to the vehicle) to the outer edge. Use a tyre tread depth gauge (£3–£5 from any motor factor) to measure tread depth at several points across the width and around the circumference.

**Normal wear**: even depth across the full tread width, wearing uniformly around the circumference. Replace when depth reaches 3mm (for safety margin above the 1.6mm legal minimum in Scotland).

**Abnormal wear**: significant depth difference between the inner edge and outer edge, or between any points around the circumference.

---

## Inner Edge Wear (Excessive Wear on the Inside of the Tyre)

**What it looks like**: the inner shoulder of the tyre (closest to the vehicle centreline) is worn significantly more than the outer shoulder.

**Causes**:
1. **Negative camber** — the wheel leans inward at the top. A small amount of negative camber is normal on most cars, but excessive negative camber accelerates inner edge wear. Common after suspension wear or accident damage.
2. **Worn or bent suspension components** — a worn lower control arm bushing, bent MacPherson strut, or worn ball joint can pull the wheel into excessive negative camber.
3. **Lowered suspension** — aftermarket lowering springs increase negative camber beyond the adjustment range of most vehicles.

**Fix**: wheel alignment (specifically camber and toe adjustment) and inspection/replacement of worn suspension components.

**Scotland note**: Scottish roads have a high rate of pothole-related suspension damage. A single large pothole impact can knock wheel alignment out and cause immediate inner-edge wear on the affected wheel.

---

## Outer Edge Wear (Excessive Wear on the Outside of the Tyre)

**What it looks like**: the outer shoulder (furthest from the vehicle centreline) is worn more than the inner.

**Causes**:
1. **Positive camber** — wheel leans outward at the top. Less common than negative camber; usually caused by worn or damaged suspension.
2. **Underinflation** — when tyre pressure is too low, the centre of the tread lifts away from the road and the shoulders carry all the load. This causes both inner and outer shoulder wear simultaneously (see Two-Shoulder Wear below).
3. **Aggressive cornering** — lateral G-forces push the vehicle weight onto the outer edge of the tyre during cornering. Drivers who corner very hard wear outer edges faster.

**Fix**: wheel alignment check, suspension inspection, and maintaining correct tyre pressure.

---

## Two-Shoulder Wear (Both Edges Worn, Centre Still Has Tread)

**What it looks like**: both inner and outer shoulders are worn, but the centre of the tread still has reasonable depth.

**Cause**: **chronic underinflation**. When a tyre runs at too low a pressure, it flexes excessively — the centre of the tread bows upward away from the road surface while the shoulders contact the road. This is the classic underinflation wear pattern.

**Fix**: check and correct tyre pressure immediately. Check for slow leak (valve, bead, or puncture). Scotland's cold winters lower tyre pressure — for every 10°C drop in temperature, tyre pressure drops approximately 0.1 bar. Check pressure monthly.

---

## Centre Wear (Middle of Tread Worn, Shoulders Still Have Depth)

**What it looks like**: the centre of the tread is worn significantly more than the inner or outer edges.

**Cause**: **overinflation**. When tyre pressure is too high, the tyre inflates in a rounded profile — only the centre contacts the road, while the shoulders are lifted clear. This concentrates all wear in the centre strip.

**Fix**: reduce tyre pressure to the manufacturer's specification (found on the sticker inside the driver's door or in the handbook). Do not rely on the maximum pressure stamped on the sidewall — that is the maximum, not the recommended pressure.

---

## Diagonal Patchy Wear (Cupping or Scalloping)

**What it looks like**: the tread has irregular dips or scallops at diagonal intervals around the circumference — it feels like the tyre has bumps or flat spots.

**Causes**:
1. **Wheel imbalance** — an unbalanced wheel bounces rather than rolling smoothly. The tyre makes contact with the road intermittently, wearing in patches where it lands. This is the most common cause.
2. **Worn shock absorbers or dampers** — worn shocks allow the wheel to bounce excessively on the road. If replacing tyres and balancing wheels doesn't solve cupping, the dampers need testing.
3. **Stiff or seized suspension components** — can cause uneven contact.

**Fix**: wheel balancing (should be done with every tyre change), shock absorber/damper inspection and replacement if worn.

**Scotland note**: Scottish roads — particularly in rural areas — have significant surface irregularities. This puts greater stress on dampers and accelerates cupping wear.

---

## One-Sided Wear (Opposite to Inner/Outer Edge Wear)

**What it looks like**: one specific corner of the tyre (e.g., outer front left) is worn significantly more than other areas.

**Causes**:
1. **Toe misalignment** — toe-in or toe-out pulls the tyre in a direction it is not rolling, scrubbing the inner or outer edge.
2. **Camber misalignment** — as above, but camber affects which shoulder wears.
3. **Asymmetric load** — consistent heavy loading on one side of the vehicle.

**Fix**: wheel alignment. A full four-wheel alignment will diagnose toe and camber on all four corners.

---

## Flat Spot Wear

**What it looks like**: a flat area on the tyre at one point around the circumference.

**Causes**:
1. **Emergency braking** — locking up the brakes (on vehicles without ABS, or in ABS failure) drags the tyre along the road surface, grinding a flat spot in seconds.
2. **Vehicle standing stationary for long periods** — particularly on hard compounds in cold weather; the contact patch develops a temporary flat spot. Usually rounds out after a few miles of driving.
3. **ABS failure** — a failed ABS sensor can allow wheel lockup under heavy braking.

**Fix**: if the flat spot is deep enough to affect tread depth below 1.6mm at that point, the tyre must be replaced — it is illegal and will cause severe vibration. If mild, monitor on the next drive.

---

## What to Do If You Notice Uneven Wear

1. **Do not ignore it** — uneven wear gets worse rapidly once started
2. **Check tyre pressure** — rule out underinflation/overinflation first
3. **Book a wheel alignment check** — a four-wheel alignment check costs £40–£60 and identifies camber and toe problems. Tyre Rescue can refer you to trusted alignment specialists across Scotland.
4. **Inspect the tyres for legal tread depth** — if any part of the tyre has worn below 1.6mm across 75% of the tread width, it must be replaced immediately. Driving on it is illegal and dangerous.
5. **Replace in pairs** — if one tyre is worn, the opposite tyre on the same axle is likely to be in a similar condition. Fit both axle tyres together.

---

## Tyre Fitting After Resolving the Cause

It is pointless to fit new tyres without correcting the underlying cause. If your alignment is out and you fit new tyres, the same wear pattern will repeat within 5,000–10,000 miles. Fix the cause first, then replace the tyres.

Tyre Rescue fits replacement tyres across all of Scotland. We also inspect wear patterns during every callout and can advise on the likely cause and what to get checked.

Call **0141 266 0690** or [book online](/book).

[Wheel alignment and balancing guide](/blog/wheel-balancing-vs-alignment-scotland) | [Tyre tread depth guide](/blog/tyre-tread-depth-guide-scotland) | [Tyre rotation guide Scotland](/blog/tyre-rotation-guide-scotland)`,
  },
  {
    slug: 'fleet-tyre-management-scotland',
    title: 'Fleet Tyre Management Scotland: Mobile Fitting for Business Fleets',
    description:
      'Tyre Rescue provides fleet tyre management for Scottish businesses — mobile fitting for vans, company cars, and commercial vehicles. Account management, priority response, and all Scotland covered.',
    category: 'fitting',
    publishDate: '2026-09-01',
    lastModified: '2026-09-01',
    readingTime: 7,
    featured: false,
    keywords: [
      'fleet tyre management scotland',
      'fleet tyre fitting scotland',
      'business tyre fitting scotland',
      'company fleet tyres glasgow',
      'mobile fleet tyre fitting scotland',
      'van fleet tyres scotland',
      'commercial fleet tyre management scotland',
      'tyre account scotland business',
    ],
    relatedSlugs: [
      'van-tyre-fitting-scotland',
      'mobile-tyre-fitting-glasgow',
      '24-hour-tyre-fitting',
    ],
    content: `# Fleet Tyre Management Scotland: Mobile Fitting for Business Fleets

Managing tyres across a Scottish business fleet — whether you run five delivery vans or fifty company cars — is a significant operational challenge. A tyre failure can strand a driver, delay deliveries, and cost far more in lost productivity than the price of the tyre itself. Tyre Rescue provides mobile fleet tyre management across all of Scotland, keeping your vehicles on the road.

## What Fleet Tyre Management Means for Scottish Businesses

Fleet tyre management with Tyre Rescue covers:

- **Emergency callout** — flat tyre anywhere in Scotland, day or night, prioritised for account customers
- **Scheduled tyre replacement** — planned tyre changes at your depot, driver's home, or any company location
- **Tyre inspections** — we can carry out tyre condition checks as part of scheduled visits
- **TPMS reset on every fitting** — no warning lights left on in your fleet vehicles
- **Tyre disposal** — old tyres taken away with every fitting, WEEE-compliant disposal
- **Driver liaison** — we deal directly with drivers, so your fleet manager is not tied up coordinating calls

## Why Mobile Tyre Fitting Makes Sense for Scottish Fleets

Traditional garage-based fleet tyre management has a key flaw: it takes vehicles off the road for several hours. Mobile fitting eliminates this.

**Benefits for Scottish fleet operators**:
- Tyres fitted at your depot overnight or between shifts — vehicles ready for the next day
- Driver-side fitting — van drivers do not lose hours driving to a garage and waiting
- No vehicle downtime at a garage — fitting happens wherever the vehicle is parked
- 24/7 emergency cover — a van with a flat at 11pm is not waiting until 8am
- All of Scotland covered — including remote depot locations, rural areas, and island-based vehicles

## Fleet Tyre Fitting for Common Scottish Business Vehicles

We cover all types of fleet vehicles used by Scottish businesses:

**Delivery vans**:
- Ford Transit, Transit Custom, Transit Connect
- Mercedes Sprinter, Vito
- Volkswagen Transporter, Crafter
- Vauxhall Vivaro, Movano
- Peugeot Expert, Boxer
- Renault Trafic, Master
- Citroen Dispatch, Relay

All common commercial sizes in stock: 215/65R16C, 235/65R16C, 215/75R16C, LT225/75R16C.

**Company cars** (the most common Scottish fleet cars):
- Ford Focus, Kuga — 205/55R16 through 235/40R18
- Vauxhall Astra, Mokka — 205/55R16 through 235/40R18
- Kia Sportage, Niro — 225/65R17 through 255/45R19
- Volkswagen Golf, Tiguan — 205/55R16 through 235/50R19
- BMW 3 Series, X3 — 225/50R17 through 255/35R19
- Skoda Octavia — 205/55R16 through 225/40R18

**Pickup trucks** (common on Scottish construction sites and farms):
- Ford Ranger — 255/70R16 or 255/60R18
- Toyota Hilux — 265/65R17
- Mitsubishi L200 — 265/65R17
- Isuzu D-Max — 245/70R16 or 265/65R17

## Fleet Accounts and Billing

Tyre Rescue offers account management for fleet customers:

- **Monthly consolidated invoicing** — one invoice for all fleet activity, simplifying administration
- **Per-vehicle billing records** — full history by registration number for each vehicle in your fleet
- **Approved pricing** — agreed per-tyre prices for your fleet's most common tyre sizes
- **Purchase order reference** — add your PO number to bookings for seamless accounting

To enquire about a fleet account, call **0141 266 0690** and ask to speak to our fleet team, or email us directly.

## Response Times for Scottish Fleet Emergencies

When a fleet vehicle has a flat tyre and needs to return to service quickly, our response times are:

- Greater Glasgow: 25–40 minutes
- Central Belt (Edinburgh, Falkirk, Stirling): 50–70 minutes
- Dundee, Perth, Kirkcaldy: 65–85 minutes
- Aberdeen, Inverness: approximately 90–100 minutes
- Rural Highland locations: honest ETA given based on exact postcode

Fleet account customers are prioritised in dispatch — if your driver calls and quotes the account reference, they get faster access to the nearest available fitter.

## Tyre Choice for Business Fleets

**Budget vs premium for fleet vehicles?**

For high-mileage fleet vehicles (vans doing 30,000+ miles/year), mid-range tyres from brands like Goodyear, Continental, or Bridgestone often represent better value than budget tyres. The additional tread life can mean fewer tyre changes per vehicle per year — reducing both the cost per mile and the downtime of scheduling changes.

For lower-mileage company cars, budget and mid-range tyres are often sufficient and reduce the per-vehicle tyre budget.

We discuss tyre choice with each fleet customer based on their vehicles, mileage, and operating conditions. Scottish routes — the A9, A82, A96, and rural B-roads — are hard on tyres, and we can advise accordingly.

## Fleet Tyre Compliance: What Scottish Fleet Managers Need to Know

- **Legal minimum tread depth**: 1.6mm — but we recommend replacing at 2–3mm for safety, especially in Scottish winter conditions
- **C-rated tyres on vans**: Required by law. Fitting passenger-rated tyres on a commercial van is illegal and could invalidate insurance
- **TPMS reset after every fitting**: A legal requirement on vehicles over 3.5 tonnes where TPMS is fitted; good practice on all vehicles
- **Tyre age**: Most manufacturers recommend replacing tyres over 10 years old regardless of tread depth. For fleet vehicles, we flag any tyres approaching this age

## Getting Started with Fleet Tyre Management

Call **0141 266 0690** to speak to our team about fleet tyre management for your business. We'll discuss:

- Your fleet size and vehicle types
- Your most common tyre sizes
- Your coverage area across Scotland
- Emergency callout requirements
- Account billing preferences

We cover all of Scotland — G to ZE postcodes — and operate 24 hours a day, 7 days a week.

[Van tyre fitting Scotland](/blog/van-tyre-fitting-scotland) | [24 hour tyre fitting Scotland](/24-hour-tyre-fitting) | [All service areas](/service-areas)`,
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
