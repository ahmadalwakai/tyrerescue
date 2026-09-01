import { SERVICE_PRICING } from '@/lib/pricing';

export type FaqItem = {
  readonly question: string;
  readonly answer: string;
};

export const EMERGENCY_PAGE_FAQS = [
  {
    question: 'How quickly can you reach me?',
    answer:
      'Our emergency response promise is 45 minutes where dispatch, traffic, and tyre availability allow. We confirm your location, tyre size, and fitter availability before sending anyone.',
  },
  {
    question: 'Do you cover all of Scotland?',
    answer:
      'We cover all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Perth, Highlands, Borders and the Islands including Skye, Orkney, Shetland and the Western Isles. For island and remote Highland callouts, advance booking is strongly recommended. Enter your postcode at booking to confirm your exact availability and ETA.',
  },
  {
    question: 'Do you operate 24/7?',
    answer:
      'Yes. Tyre Rescue operates 24 hours a day, 7 days a week, every day of the year including bank holidays.',
  },
  {
    question: 'How much does emergency tyre fitting cost?',
    answer: `Emergency callout starts from £${SERVICE_PRICING.emergency.from}, tyre fitting starts from £${SERVICE_PRICING.fitting.from}, and the tyre price varies by size and brand. You get a confirmed price before work begins.`,
  },
  {
    question: 'Can you repair a puncture instead of replacing the tyre?',
    answer: `Yes, where it is safe and legal to repair. Mobile puncture repair starts from £${SERVICE_PRICING.punctureRepair.from}. If the tyre cannot be repaired, we explain the replacement options before fitting.`,
  },
  {
    question: 'Can you help on a motorway?',
    answer:
      'Yes, once you are in a safe stopping place and dispatch can legally access you. If you are in immediate danger, contact the emergency services or motorway assistance first. We cover all Scottish motorways — M8, M74, M77, M80, M9 and more.',
  },
  {
    question: "What if I don't know my tyre size?",
    answer:
      'Our team can help identify the right tyre for your vehicle. You can also find the size on the sidewall of your existing tyre (for example, 205/55R16) or in your vehicle handbook.',
  },
  {
    question: 'What should I do if a tyre blows out at speed?',
    answer:
      'Do NOT brake sharply. Grip the steering wheel firmly with both hands and let the car slow gradually. Once below 50mph, signal left and move to the hard shoulder. Exit via the left-side door only and stand behind the barrier, away from traffic. Then call 0141 266 0690 — we respond to Scottish motorways 24/7.',
  },
  {
    question: 'Do you come to airport car parks?',
    answer:
      'Yes. Glasgow Airport (PA3) and Edinburgh Airport (EH12) are among our most frequent callout locations. We cover all car parks including long-stay and multi-storey. Returning from a flight to find a flat tyre? We typically arrive at Glasgow Airport within 25–35 minutes.',
  },
] as const satisfies readonly FaqItem[];
