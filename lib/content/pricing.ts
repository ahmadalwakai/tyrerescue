import { SERVICE_PRICING } from '@/lib/pricing';

export interface PricingRow {
  service: string;
  price: string;
  notes: string;
}

export const pricingRows: PricingRow[] = [
  {
    service: 'Scheduled mobile tyre fitting',
    price: SERVICE_PRICING.fitting.label,
    notes: 'For planned home, work, driveway, car park or roadside fittings. The tyre price depends on size and brand.',
  },
  {
    service: 'Emergency mobile tyre callout',
    price: SERVICE_PRICING.emergency.label,
    notes: 'For urgent flat tyre and same-day callouts. Travel, traffic, time and weather can affect the final live quote.',
  },
  {
    service: 'Puncture repair',
    price: SERVICE_PRICING.punctureRepair.label,
    notes: 'Available when the puncture is in the repairable tread area and the tyre structure is safe.',
  },
  {
    service: 'Budget tyres',
    price: 'Typically from £45',
    notes: 'Good-value new tyres for common sizes. Exact stock and price are confirmed in the quote flow.',
  },
  {
    service: 'Mid-range tyres',
    price: 'Typically from £65',
    notes: 'A strong balance of mileage, wet grip and price for daily driving across Scotland.',
  },
  {
    service: 'Premium tyres',
    price: 'Typically from £90',
    notes: 'Michelin, Continental, Bridgestone, Pirelli and other premium options where available.',
  },
];

export const pricingFactors = [
  'Tyre size, load rating, speed rating and whether the tyre is run-flat or specialist',
  'Number of tyres fitted in the same visit',
  'Mobile travel distance from the nearest available fitter or depot',
  'Emergency priority, weekend or bank-holiday service where applicable',
  'Weather, traffic delay, and any safety conditions that affect roadside work',
  'Optional services such as TPMS reset or locking wheel nut assistance',
];

export const pricingFaqs = [
  {
    question: 'How is the mobile tyre fitting price calculated?',
    answer:
      'The quote starts with the tyre price plus the fitting labour. Mobile bookings also include travel to your location, and emergency jobs include priority dispatch. The checkout shows tyre, fitting, travel, emergency and any weather or traffic line items before you confirm.',
  },
  {
    question: 'Why does the price change by tyre size?',
    answer:
      'Tyres are priced by size, load rating, speed rating, brand and availability. A common 16-inch budget tyre is usually much cheaper than a premium 19-inch run-flat tyre, even though the fitting process is similar.',
  },
  {
    question: 'Is emergency tyre fitting more expensive?',
    answer:
      'Yes. Emergency callouts include priority dispatch and may include higher labour, travel or out-of-hours costs. Scheduled mobile fitting is normally cheaper when your situation is not urgent.',
  },
  {
    question: 'Can I see the full price before booking?',
    answer:
      'Yes. The online quote and booking flow shows the price breakdown before payment. If the location, weather or tyre availability needs manual confirmation, we will tell you before taking the booking.',
  },
  {
    question: 'Are there hidden fees?',
    answer:
      'No. The quote is itemized so you can see tyre cost, fitting, travel, emergency priority and any applicable surcharges. If a fitter discovers extra work on arrival, we explain it and ask for approval before proceeding.',
  },
  {
    question: 'Is mobile tyre fitting cheaper than recovery to a garage?',
    answer:
      'Often, yes. A garage fitting fee may be lower, but mobile fitting can avoid recovery charges, taxi costs, extra travel, and lost time. For a flat tyre, having a fitter come to you is usually the more practical comparison.',
  },
];
