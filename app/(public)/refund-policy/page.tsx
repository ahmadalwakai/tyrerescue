import { Metadata } from 'next';
import { RefundContent } from './RefundContent';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description:
    'Our refund policy for Tyre Rescue mobile tyre fitting services. Learn about cancellations, refunds and our satisfaction guarantee.',
  alternates: { canonical: 'https://tyrerescue.uk/refund-policy' },
};

export default function RefundPolicyPage() {
  return <RefundContent />;
}
