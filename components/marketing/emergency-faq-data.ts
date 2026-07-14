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
      'We cover mainland Scotland only, including Glasgow, Edinburgh, Dundee, Stirling, Paisley, Hamilton, Kilmarnock, Ayr, Kirkcaldy, Perth, and nearby mainland routes. Scottish islands are excluded.',
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
      'Yes, once you are in a safe stopping place and dispatch can legally access you. If you are in immediate danger, contact the emergency services or motorway assistance first.',
  },
  {
    question: "What if I don't know my tyre size?",
    answer:
      'Our team can help identify the right tyre for your vehicle. You can also find the size on the sidewall of your existing tyre (for example, 205/55R16) or in your vehicle handbook.',
  },
] as const satisfies readonly FaqItem[];
