import { Metadata } from 'next';
import { ContactContent } from './ContactContent';

export const metadata: Metadata = {
  title: 'Contact Tyre Rescue | Mobile Tyre Fitter Glasgow | Duke Street Tyres',
  description:
    'Contact our mobile tyre fitting team in Glasgow. Call 0141 266 0690 for immediate tyre repair near you. Duke Street Tyres — serving Glasgow and Edinburgh.',
  alternates: { canonical: 'https://www.tyrerescue.uk/contact' },
};

export default function ContactPage() {
  return <ContactContent />;
}
