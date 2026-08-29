import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { TrackingContent } from './TrackingContent';
import { getBrandBySourceApp } from '@/lib/config/site';

interface PageProps {
  params: Promise<{ ref: string }>;
}

const CUSTOMER_APP_SCHEME = 'tyrerescue';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ref } = await params;
  const [booking] = await db
    .select({ sourceApp: bookings.sourceApp })
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);
  const brand = getBrandBySourceApp(booking?.sourceApp);
  return {
    title: {
      absolute: `Tracking ${ref} | ${brand.name}`,
    },
    metadataBase: new URL(brand.productionUrl),
    authors: [{ name: brand.name }],
    creator: brand.name,
    publisher: brand.name,
    robots: { index: false, follow: false },
    other: {
      'apple-itunes-app': `app-id=6782555222, app-argument=${CUSTOMER_APP_SCHEME}://track?ref=${encodeURIComponent(ref)}`,
    },
  };
}

export default async function TrackingPage({ params }: PageProps) {
  const { ref } = await params;

  // Verify booking exists
  const [booking] = await db
    .select({
      refNumber: bookings.refNumber,
      sourceApp: bookings.sourceApp,
      status: bookings.status,
    })
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#09090B' }}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-[#FAFAFA] mb-4">
            Booking Not Found
          </h1>
          <p className="text-[#A1A1AA] mb-6">
            We couldn&apos;t find a booking with reference {ref}. Please check the
            reference number and try again.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-[#F97316] text-white font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TrackingContent
      refNumber={ref}
      initialStatus={booking.status}
      initialSourceApp={booking.sourceApp}
    />
  );
}
