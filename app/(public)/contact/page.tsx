import { Metadata } from 'next';
import { ContactContent } from './ContactContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema, getLocalBusinessSchema } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Contact Tyre Rescue | Mobile Tyre Fitting Scotland | 0141 266 0690',
  description:
    'Contact Tyre Rescue for emergency tyre fitting, booking help, payments, cancellations and refunds. Call 0141 266 0690 — available 24/7 across all of Scotland.',
  keywords: [
    'contact tyre rescue',
    'tyre rescue phone number',
    'mobile tyre fitting contact scotland',
    'emergency tyre fitting contact glasgow',
    'tyre rescue 0141 266 0690',
  ],
  alternates: { canonical: 'https://www.tyrerescue.uk/contact' },
  openGraph: {
    title: 'Contact Tyre Rescue | 0141 266 0690',
    description: 'Call or message Tyre Rescue for emergency tyre fitting and booking support across all of Scotland.',
    url: 'https://www.tyrerescue.uk/contact',
    type: 'website',
  },
};

const jsonLd = [
  getBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact' },
  ]),
  getLocalBusinessSchema(),
];

export default function ContactPage() {
  return (
    <>
      <JsonLd data={jsonLd} />
      <ContactContent />
    </>
  );
}
