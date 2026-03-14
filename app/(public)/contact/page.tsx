import { Metadata } from 'next';
import { ContactContent } from './ContactContent';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with Tyre Rescue. We are available 8am to midnight, every day. Call 0141 266 0690 or visit us at 3, 10 Gateside St, Glasgow G31 1PD.',
  alternates: { canonical: 'https://www.tyrerescue.uk/contact' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Tyre Rescue',
  telephone: '+441412660690',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '3, 10 Gateside St',
    addressLocality: 'Glasgow',
    postalCode: 'G31 1PD',
    addressCountry: 'GB',
  },
  openingHours: 'Mo-Su 08:00-23:59',
  url: 'https://www.tyrerescue.uk/contact',
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContactContent />
    </>
  );
}
