import { Metadata } from 'next';
import { TermsContent } from './TermsContent';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms and conditions for using Tyre Rescue mobile tyre fitting services.',
  alternates: { canonical: 'https://www.tyrerescue.uk/terms-of-service' },
};

export default function TermsOfServicePage() {
  return <TermsContent />;
}
