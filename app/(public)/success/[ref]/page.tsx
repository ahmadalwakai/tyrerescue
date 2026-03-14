import { Suspense } from 'react';
import { db } from '@/lib/db';
import { bookings, bookingTyres, tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { formatPrice } from '@/lib/pricing-engine';
import { SuccessContent } from './SuccessContent';

interface PageProps {
  params: Promise<{ ref: string }>;
}

export default async function SuccessPage({ params }: PageProps) {
  const { ref } = await params;

  // Fetch booking by reference number
  const [booking] = await db
    .select()
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

  // Fetch tyre details for this booking
  const tyreDetails = await db
    .select({
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(eq(bookingTyres.bookingId, booking.id));

  // Transform booking data for client component
  const bookingData = {
    refNumber: booking.refNumber,
    status: booking.status,
    bookingType: booking.bookingType as 'emergency' | 'scheduled',
    serviceType: booking.serviceType,
    addressLine: booking.addressLine,
    distanceMiles: booking.distanceMiles ? parseFloat(booking.distanceMiles) : null,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    scheduledAt: booking.scheduledAt?.toISOString() || null,
    createdAt: booking.createdAt?.toISOString() || new Date().toISOString(),
    subtotal: parseFloat(booking.subtotal),
    vatAmount: parseFloat(booking.vatAmount),
    totalAmount: parseFloat(booking.totalAmount),
    tyres: tyreDetails.map((t) => ({
      brand: t.brand || '',
      pattern: t.pattern || '',
      sizeDisplay: t.sizeDisplay || '',
      quantity: t.quantity,
      unitPrice: t.unitPrice ? parseFloat(t.unitPrice) : 0,
    })),
  };

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#09090B' }}>
        <p className="text-[#A1A1AA]">Loading…</p>
      </div>
    }>
      <SuccessContent booking={bookingData} />
    </Suspense>
  );
}
