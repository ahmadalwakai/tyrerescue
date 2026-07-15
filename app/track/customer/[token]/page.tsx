import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { getTrackingSessionByCustomerToken } from '@/lib/tracking-session';
import { CustomerTrackingClient } from './CustomerTrackingClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const dynamic = 'force-dynamic';

const CUSTOMER_APP_ID = '6782555222';
const CUSTOMER_APP_FALLBACK_ORIGIN = 'https://www.tyrerescue.uk';
const CUSTOMER_APP_SCHEME = 'tyrerescue';

async function trackingAppArgument(token: string): Promise<string> {
  const session = await getTrackingSessionByCustomerToken(token);
  if (!session) return `${CUSTOMER_APP_FALLBACK_ORIGIN}/track/customer/${token}`;

  const [booking] = await db
    .select({ refNumber: bookings.refNumber })
    .from(bookings)
    .where(eq(bookings.id, session.bookingId))
    .limit(1);

  if (booking?.refNumber) {
    return `${CUSTOMER_APP_SCHEME}://track?ref=${encodeURIComponent(booking.refNumber)}`;
  }

  return `${CUSTOMER_APP_FALLBACK_ORIGIN}/track/customer/${token}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const appArgument = await trackingAppArgument(token);
  return {
    title: 'Live Tracking | Tyre Rescue',
    robots: { index: false, follow: false },
    other: {
      'apple-itunes-app': `app-id=${CUSTOMER_APP_ID}, app-argument=${appArgument}`,
    },
  };
}

export default async function CustomerTrackingPage({ params }: PageProps) {
  const { token } = await params;
  return <CustomerTrackingClient token={token} />;
}
