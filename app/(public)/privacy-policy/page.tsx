import { Metadata } from 'next';
import { PrivacyContent } from './PrivacyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Read our privacy policy to understand how Tyre Rescue collects, uses and protects your personal data.',
  alternates: { canonical: 'https://www.tyrerescue.uk/privacy-policy' },
};

export default function PrivacyPolicyPage() {
  return <PrivacyContent />;
}
