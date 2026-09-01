import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles, getArticle, getRelatedArticles } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getArticleSchema, getBreadcrumbSchema, getHowToSchema } from '@/lib/seo/schemas';
import { BlogArticleContent } from './BlogArticleContent';

const HOW_TO_SCHEMAS: Record<string, Parameters<typeof getHowToSchema>[0]> = {
  'what-to-do-flat-tyre-motorway': {
    name: 'What to do if you get a flat tyre on the motorway',
    description: 'Step-by-step guide for staying safe and getting help after a motorway tyre failure in Scotland.',
    steps: [
      { name: 'Stay calm and reduce speed gradually', text: 'Do not brake sharply. Keep both hands on the wheel and steer gently. Reduce speed progressively and indicate to move left.' },
      { name: 'Move to the hard shoulder or emergency refuge', text: 'Pull as far left as possible onto the hard shoulder. If on a smart motorway, aim for an Emergency Refuge Area (ERA). Switch on hazard lights immediately.' },
      { name: 'Exit the vehicle on the left side', text: 'Always exit via the left (passenger-side) door, away from live traffic. Leave pets inside the vehicle. Take your phone with you.' },
      { name: 'Stand behind the barrier and away from the carriageway', text: 'Move well beyond the nearside barrier. Do not stand beside the vehicle facing traffic. Wait on the embankment or grass bank.' },
      { name: 'Call 0141 266 0690 for Tyre Rescue', text: 'Call 0141 266 0690 and describe your location — the motorway name, direction of travel, and the nearest junction number or blue SOS marker. We will dispatch a fitter to you.' },
      { name: 'Wait safely until help arrives', text: 'Remain behind the barrier. Keep monitoring traffic and be prepared to move further away if a vehicle approaches the hard shoulder. Do not return to your car until the fitter arrives and the area is safe.' },
    ],
  },
  'tyre-blowout-emergency-guide-scotland': {
    name: 'What to do during and after a tyre blowout in Scotland',
    description: 'Emergency guide for handling a sudden tyre blowout safely on Scottish roads.',
    steps: [
      { name: 'Hold the steering wheel firmly', text: 'A blowout causes the car to pull sharply. Grip the wheel with both hands and resist the urge to steer hard in the opposite direction. Keep the car going straight.' },
      { name: 'Do not brake suddenly', text: 'Avoid stamping on the brakes. Gentle, progressive braking only. Sudden braking with a blown tyre can cause a spin or rollover.' },
      { name: 'Allow the car to slow naturally', text: 'Keep the accelerator steady or reduce it gently. Let engine braking and air resistance slow the car gradually. Stay in your lane as long as it is safe.' },
      { name: 'Signal and pull over safely', text: 'Indicate left and steer progressively to the left. Aim for a layby, hard shoulder, or safe stopping area. Do not stop on live lanes.' },
      { name: 'Switch on hazard lights', text: 'As soon as the car is stationary and safe, switch on hazard lights and apply the handbrake. If you have a warning triangle, place it 45 metres behind the car (but not on motorways).' },
      { name: 'Call Tyre Rescue on 0141 266 0690', text: 'Call 0141 266 0690 and describe your location. We cover all of Scotland including Highland roads and the NC500. A fitter will be dispatched with your replacement tyre.' },
    ],
  },
  'tyre-tread-depth-guide-scotland': {
    name: 'How to check tyre tread depth',
    description: 'Step-by-step guide to checking your tyre tread depth using a coin, indicator bars, or a gauge.',
    steps: [
      { name: 'Find a 20p coin', text: 'A 20p coin has an outer rim of approximately 2mm — perfect for a quick tread depth check.' },
      { name: 'Insert the coin into the main tread groove', text: 'Press the 20p coin edge-first into the deepest tread groove across the central three-quarters of the tyre.' },
      { name: 'Check whether the outer rim is visible', text: 'If you can see the outer rim of the coin above the tread, your depth is below 3mm and approaching the limit. If the rim is hidden, you have good tread remaining.' },
      { name: 'Check the tread wear indicators', text: 'Look for small raised bars in the tread grooves — they sit at exactly 1.6mm. If the tread surface is flush with these bars, replace the tyre immediately.' },
      { name: 'Check across the full tyre width', text: 'Uneven wear can mean one edge is legal while another is not. Check the tread depth at the inner edge, centre, and outer edge of each tyre.' },
      { name: 'Check all four tyres', text: 'Walk around the car and check each tyre. If any tyre is at or below 3mm on Scottish roads, book a replacement — call 0141 266 0690 for mobile fitting at your location.' },
    ],
  },
  'tyre-pressure-guide-scotland': {
    name: 'How to check and adjust tyre pressure',
    description: 'Step-by-step guide to finding the correct pressure, checking your tyres, and inflating to the right level.',
    steps: [
      { name: 'Find your recommended tyre pressure', text: 'Check the sticker inside your driver\'s door frame, the fuel cap, or your vehicle handbook. The pressure is shown in PSI or bar — for cold tyres.' },
      { name: 'Check tyres when cold', text: 'Pressure readings are only accurate when tyres are cold (not driven on for 3+ hours). Warm tyres give a higher reading that does not accurately reflect the state of inflation.' },
      { name: 'Remove the valve cap', text: 'Remove the valve cap from the tyre you are checking and keep it somewhere safe — you will need to replace it.' },
      { name: 'Press a gauge firmly onto the valve', text: 'Press the gauge nozzle firmly onto the valve stem. You will hear a brief hiss as it seals. Read the pressure on the gauge.' },
      { name: 'Compare to recommended pressure and adjust', text: 'If pressure is low, use the air pump to inflate until the gauge reads the correct level. If over-inflated, press the pin inside the valve briefly to release air, then recheck.' },
      { name: 'Replace the valve cap and repeat for all four tyres', text: 'Always check all four tyres, as pressures can vary between wheels. Replace each valve cap after checking.' },
    ],
  },
  'mot-tyre-requirements-scotland': {
    name: 'How to prepare your tyres for MOT',
    description: 'Pre-MOT tyre inspection checklist to avoid a tyre-related fail at your next MOT test.',
    steps: [
      { name: 'Check tread depth across all four tyres', text: 'Use a tread depth gauge or the 20p coin test. Tread must be above 1.6mm across the central three-quarters of the tyre. For Scotland, aim for at least 2mm to pass comfortably — ideally 3mm.' },
      { name: 'Inspect sidewalls for bulges or cuts', text: 'Examine both the outer and inner sidewalls (if visible) for any bulge, lump, or cut that exposes the white cord beneath the rubber. Any of these is an automatic MOT fail.' },
      { name: 'Check for cracking or crazing', text: 'Fine cracks in the tread groove walls or sidewall are common on older tyres. Deep cracks or any crack with visible cord beneath is a fail.' },
      { name: 'Verify all tyres are the same type', text: 'Mixing radial and cross-ply (bias-ply) tyres on the same axle is an MOT fail. All your tyres should be the same construction type (radial for all modern passenger cars).' },
      { name: 'Check the tyre DOT age code', text: 'Find the four-digit date code on the sidewall (week + year of manufacture). Tyres over 10 years old may fail — some testers now note this even on advisory.' },
      { name: 'Book mobile tyre fitting if replacements are needed', text: 'If any tyre needs replacing before MOT, call Tyre Rescue on 0141 266 0690 to fit replacements at your home or work — often faster and cheaper than dealing with a MOT fail and re-test fee.' },
    ],
  },
  'tyre-sidewall-damage-scotland': {
    name: 'How to assess tyre sidewall damage',
    description: 'Step-by-step guide to checking your tyre sidewall for bubbles, cuts, scrapes, and deciding whether the tyre must be replaced immediately.',
    steps: [
      { name: 'Park safely and switch off the engine', text: 'If you suspect sidewall damage while driving, do not ignore it. Find the nearest safe place to stop — a car park, layby, or quiet side road. Apply the handbrake and switch off the engine.' },
      { name: 'Inspect the outer sidewall in good light', text: 'Crouch down beside the wheel and examine the outer sidewall (the side you can see). Look for any bulge or bubble protruding from the flat surface, any cut or gash in the rubber, or any scuff where rubber has been abraded away.' },
      { name: 'Check for internal cord damage', text: 'A tyre bubble means the internal cords have broken and air is pushing through. If you can see white or metallic cord material through a cut, the tyre is structurally compromised. Either of these means do not drive on the tyre.' },
      { name: 'Check the inner sidewall if accessible', text: 'Angle a torch between the tyre and the wheel arch and inspect the inner sidewall for the same signs. Kerb strikes often damage the inner sidewall while leaving the outer looking normal.' },
      { name: 'Make your decision', text: 'If you see a bubble, bulge, or any cut showing cord: do not drive on the tyre. Call Tyre Rescue on 0141 266 0690 for mobile fitting. If the sidewall is only superficially scuffed with no cut or deformation, drive carefully to have it professionally inspected — do not use the motorway.' },
      { name: 'Call for a replacement tyre if needed', text: 'Tyre Rescue attends locations across all of Scotland. Give us your postcode or location description. We carry replacement tyres in our vans and can fit them at the roadside, in a car park, or at your home.' },
    ],
  },
  'uneven-tyre-wear-guide-scotland': {
    name: 'How to diagnose uneven tyre wear on your car',
    description: 'Step-by-step guide to inspecting your tyres for uneven wear patterns and identifying the likely cause.',
    steps: [
      { name: 'Check tyre pressure first', text: 'Before any other inspection, check tyre pressure with a gauge. Many wear patterns are caused by simple overinflation or underinflation. Inflate to the manufacturer\'s recommended pressure (driver\'s door sticker) and monitor wear going forward.' },
      { name: 'Run your hand across the tread width', text: 'With the vehicle stationary, run your palm firmly across the tyre tread from the inner edge to the outer edge. Feel for any significant step or ridge where one part of the tread is significantly higher or lower than another.' },
      { name: 'Measure tread depth at inner, centre, and outer positions', text: 'Use a tread depth gauge to measure at three points across the tyre width — inner shoulder, centre tread, and outer shoulder. Note any difference greater than 1–2mm, which indicates abnormal wear.' },
      { name: 'Identify the wear pattern', text: 'Inner edge wear = likely negative camber or suspension wear. Outer edge wear = positive camber or overinflation. Both shoulders worn = underinflation. Centre worn = overinflation. Patchy diagonal wear = wheel imbalance or worn shock absorbers.' },
      { name: 'Inspect suspension visually', text: 'Look under the front corners of the car for any obviously bent, cracked, or displaced suspension component. A recent pothole impact can knock the wheel out of alignment — look for fresh scrapes on the lower suspension arms.' },
      { name: 'Book a wheel alignment check', text: 'Most uneven wear causes require a four-wheel alignment check (£40–£60 at most specialist tyre centres or garages). Do this before fitting new tyres — fitting new tyres on a misaligned axle will repeat the same wear pattern. Call Tyre Rescue for tyre replacement once the cause is corrected.' },
    ],
  },
  'pothole-damage-tyres-scotland': {
    name: 'How to check your car for tyre and wheel damage after a pothole',
    description: 'Step-by-step inspection guide for checking tyres, wheels, and suspension after hitting a pothole on Scottish roads.',
    steps: [
      { name: 'Stop safely and switch on hazard lights', text: 'If you have hit a pothole at speed and heard a loud bang or felt a sharp impact, pull over as soon as it is safe to do so. Switch on hazard lights. Do not continue driving if the car is pulling to one side or making unusual sounds.' },
      { name: 'Visually inspect all four tyres', text: 'Walk around the car and examine each tyre carefully, paying particular attention to the affected wheel. Look for: any bubble or bulge on the sidewall, a visible cut or split in the tyre, the tyre appearing noticeably lower or flat.' },
      { name: 'Check the wheel for visible damage', text: 'Look at the alloy or steel wheel rim for cracks, deep gouges, or a bent lip where the tyre bead seats. A damaged rim may cause slow air loss even if the tyre looks intact.' },
      { name: 'Check tyre pressure on all four tyres', text: 'Use a tyre pressure gauge to check all four tyres. A tyre that has lost significant pressure from the impact needs immediate attention — do not reinflate a damaged tyre and drive on it.' },
      { name: 'Drive slowly and monitor carefully if tyres appear undamaged', text: 'If visual inspection finds no damage and pressures are normal, drive slowly for the first mile and monitor for vibration, pulling, or pressure loss. Return home or to a safe destination and recheck before any long journey.' },
      { name: 'Arrange professional inspection or mobile tyre fitting', text: 'Any sidewall damage, bubble, or significant pressure loss means you need a replacement tyre. Call Tyre Rescue on 0141 266 0690 — we attend pothole-related callouts across all of Scotland and carry common replacement tyre sizes in our vans.' },
    ],
  },
  'aquaplaning-prevention-scotland': {
    name: 'How to recover from aquaplaning on a wet Scottish road',
    description: 'Step-by-step guide to what to do when your car begins to aquaplane on a wet road.',
    steps: [
      { name: 'Do not panic and do not brake sharply', text: 'The instinct to stamp on the brakes is the most dangerous reaction to aquaplaning. Sudden braking with no tyre grip will cause the car to spin or veer sharply. Stay calm.' },
      { name: 'Ease off the accelerator gently', text: 'Lift your foot from the accelerator smoothly. Do not jerk it off. Reducing throttle gradually allows the car to slow naturally, which helps tyres regain contact with the road surface.' },
      { name: 'Hold the steering wheel straight and steady', text: 'Keep the wheel pointing straight ahead — the direction you want to go. Turning the wheel while aquaplaning achieves nothing until grip is restored, and can cause a sudden swerve when it does recover.' },
      { name: 'Wait for grip to return before steering', text: 'You will feel when the tyres reconnect with the road — the steering will feel more solid and responsive. Only at this point should you make any steering corrections.' },
      { name: 'Brake gently if needed, once grip is restored', text: 'Once you have grip, you can apply gentle braking to reduce speed. Modern ABS will help — allow it to function by pressing the pedal firmly rather than pumping it.' },
      { name: 'After the incident — check tyre tread depth', text: 'Aquaplaning becomes far more likely below 3mm of tread depth. After experiencing aquaplaning, check your tyre tread depth as soon as possible. If any tyre is below 3mm, book a replacement — call Tyre Rescue on 0141 266 0690 for same-day mobile fitting.' },
    ],
  },
};

// Daily ISR so admin-published edits land within 24h without redeploy.
// On-demand revalidation via /api/revalidate can be wired into publishing flow.
export const revalidate = 86400; // 24 hours
export const dynamicParams = true;

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: `https://www.tyrerescue.uk/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.description,
      url: `https://www.tyrerescue.uk/blog/${article.slug}`,
      type: 'article',
      publishedTime: article.publishDate,
      modifiedTime: article.lastModified,
      images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.webp', width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: ['https://www.tyrerescue.uk/images/home/slide-1.webp'],
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const related = getRelatedArticles(article);
  const howToData = HOW_TO_SCHEMAS[article.slug];

  return (
    <>
      <JsonLd
        data={getArticleSchema({
          title: article.title,
          description: article.description,
          slug: article.slug,
          publishDate: article.publishDate,
          lastModified: article.lastModified,
          keywords: article.keywords,
        })}
      />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: article.title, path: `/blog/${article.slug}` },
        ])}
      />
      {howToData && <JsonLd data={getHowToSchema(howToData)} />}
      <BlogArticleContent article={article} relatedArticles={related} />
    </>
  );
}
