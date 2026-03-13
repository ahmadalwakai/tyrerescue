import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { TrackingContent } from './TrackingContent';

interface PageProps {
  params: Promise<{ ref: string }>;
}

export default async function TrackingPage({ params }: PageProps) {
  const { ref } = await params;

  // Verify booking exists
  const [booking] = await db
    .select({
      refNumber: bookings.refNumber,
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
          <a
            href="/"
            className="inline-block px-6 py-3 bg-[#F97316] text-white font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
          >
            Return to Homepage
          </a>
        </div>
      </div>
    );
  }

  return <TrackingContent refNumber={ref} initialStatus={booking.status} />;
}
