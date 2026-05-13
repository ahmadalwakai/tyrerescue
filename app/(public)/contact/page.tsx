import { Metadata } from 'next';
import { ContactContent } from './ContactContent';

export const metadata: Metadata = {
  title: 'Contact Tyre Rescue | Mobile Tyre Fitting Support Glasgow',
  description:
    'Contact Tyre Rescue for mobile tyre fitting support, emergency tyre replacement, booking help, payments, cancellations and refunds. Call 0141 266 0690.',
  alternates: { canonical: 'https://www.tyrerescue.uk/contact' },
};

export default function ContactPage() {
  return <ContactContent />;
}
