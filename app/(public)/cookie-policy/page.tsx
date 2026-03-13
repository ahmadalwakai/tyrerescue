import { Metadata } from 'next';
import { CookieContent } from './CookieContent';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description:
    'Learn about how Tyre Rescue uses cookies and similar technologies on our website.',
  alternates: { canonical: 'https://tyrerescue.uk/cookie-policy' },
};

export default function CookiePolicyPage() {
  return <CookieContent />;
}
