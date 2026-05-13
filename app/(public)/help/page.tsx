import { Metadata } from 'next';
import { HelpContent } from './HelpContent';

export const metadata: Metadata = {
  title: 'Help Centre | Tyre Rescue Support',
  description:
    'Get help with Tyre Rescue bookings, mobile tyre fitting, payments, cancellations, refunds and account support. Contact our Glasgow team by phone or email.',
  alternates: { canonical: 'https://www.tyrerescue.uk/help' },
};

export default function HelpPage() {
  return <HelpContent />;
}
