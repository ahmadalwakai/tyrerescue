import { SERVICE_PRICING } from '@/lib/pricing';

export type FaqItem = {
  question: string;
  answer: string;
};

export const EMERGENCY_PAGE_FAQS: FaqItem[] = [
  {
    question: 'How does emergency mobile tyre fitting work?',
    answer:
      'Call or start a request with your location and vehicle details. We dispatch a mobile fitter to your exact location — roadside, car park, or home — with the tyres needed to get you moving. No tow truck or recovery van required.',
  },
  {
    question: 'What areas do you cover for emergency tyre fitting?',
    answer:
      'We cover Glasgow, Edinburgh, Stirling, Falkirk, Dundee and surrounding areas across Central Scotland. Contact us to confirm coverage for your specific location.',
  },
  {
    question: 'Do you operate 24/7?',
    answer:
      'Yes. Tyre Rescue operates 24 hours a day, 7 days a week, every day of the year including bank holidays.',
  },
  {
    question: 'How much does emergency tyre fitting cost?',
    answer: `Emergency callout starts from £${SERVICE_PRICING.emergency.from}, plus the tyre price which varies by size and brand. You will get a confirmed price before any work begins.`,
  },
  {
    question: "What if I don't know my tyre size?",
    answer:
      'Our team can help identify the right tyre for your vehicle. You can also find the size on the sidewall of your existing tyre (for example, 205/55R16) or in your vehicle handbook.',
  },
];
