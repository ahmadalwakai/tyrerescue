import type { Metadata } from 'next';
import { SharedTrackingClient } from './SharedTrackingClient';

export const metadata: Metadata = { title: 'Shared journey | Tyre Rescue', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function SharedTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  return <SharedTrackingClient token={(await params).token} />;
}
