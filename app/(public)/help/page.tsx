import { Metadata } from 'next';
import { HelpContent } from './HelpContent';

export const metadata: Metadata = {
  title: 'Help Centre | Tyre Rescue Support',
  description:
    'Get help with Tyre Rescue bookings, mobile tyre fitting across Scotland, payments, cancellations, refunds and account support. Call 0141 266 0690 or email our team.',
  alternates: { canonical: 'https://www.tyrerescue.uk/help' },
};

export default function HelpPage() {
  return <HelpContent />;
}
