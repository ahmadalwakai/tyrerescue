import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  quickBookingId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [booking] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, parsed.data.quickBookingId))
    .limit(1);

  if (!booking || !booking.locationLinkToken) {
    return NextResponse.json({ error: 'No location link available' }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tyrerescue.uk';
  const locationLink = `${siteUrl}/locate/${booking.locationLinkToken}`;
  const phone = booking.customerPhone.replace(/[^0-9]/g, '');
  const name = booking.customerName;

  const whatsappText = `Hi ${name}, please share your location so we can send a tyre fitter to you: ${locationLink}`;
  const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}`;
  const smsText = whatsappText;

  return NextResponse.json({
    locationLink,
    whatsappLink,
    whatsappText,
    smsText,
    expiresAt: booking.locationLinkExpiry,
  });
}
