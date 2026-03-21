import type { Metadata } from 'next';
import { TrackingLookup } from './TrackingLookup';

export const metadata: Metadata = {
  title: 'Track Your Booking | Tyre Rescue',
  description:
    'Track your mobile tyre fitting booking in real-time. Enter your booking reference to see live driver location and status updates.',
  robots: { index: true, follow: true },
};

export default function TrackingPage() {
  return <TrackingLookup />;
}
