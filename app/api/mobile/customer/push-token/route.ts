import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getCustomerMobileUser, unauthorizedResponse } from '../_lib';
import { db } from '@/lib/db';
import { bookings, customerPushTokens } from '@/lib/db/schema';

const pushTokenSchema = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(['ios', 'android']).default('ios'),
  refNumber: z.string().trim().min(3).max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
});

function isExpoPushToken(token: string) {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

export async function POST(request: NextRequest) {
  const parsed = pushTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid push token payload' }, { status: 400 });
  }

  const { token, platform, refNumber, email } = parsed.data;
  if (!isExpoPushToken(token)) {
    return NextResponse.json({ error: 'Expo push token is required' }, { status: 400 });
  }

  const user = await getCustomerMobileUser(request);
  let bookingLink: { id: string; userId: string | null; refNumber: string; customerEmail: string } | null = null;

  if (refNumber) {
    const [booking] = await db
      .select({
        id: bookings.id,
        userId: bookings.userId,
        refNumber: bookings.refNumber,
        customerEmail: bookings.customerEmail,
      })
      .from(bookings)
      .where(eq(sql`upper(${bookings.refNumber})`, refNumber.toUpperCase()))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const normalizedEmail = email?.toLowerCase();
    if (!user && !normalizedEmail) {
      return NextResponse.json({ error: 'Booking email is required' }, { status: 400 });
    }
    if (!user && normalizedEmail && booking.customerEmail.toLowerCase() !== normalizedEmail) {
      return NextResponse.json({ error: 'Booking email does not match' }, { status: 403 });
    }
    if (user && booking.userId && booking.userId !== user.id) {
      return NextResponse.json({ error: 'Booking belongs to another customer' }, { status: 403 });
    }

    bookingLink = booking;
  }

  if (!user && !bookingLink) {
    return unauthorizedResponse();
  }

  await db
    .insert(customerPushTokens)
    .values({
      userId: user?.id ?? bookingLink?.userId ?? null,
      bookingId: bookingLink?.id ?? null,
      token,
      platform,
      lastRefNumber: bookingLink?.refNumber ?? refNumber?.toUpperCase() ?? null,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: customerPushTokens.token,
      set: {
        userId: user?.id ?? bookingLink?.userId ?? null,
        bookingId: bookingLink?.id ?? null,
        platform,
        lastRefNumber: bookingLink?.refNumber ?? refNumber?.toUpperCase() ?? null,
        isActive: true,
        updatedAt: new Date(),
      },
    });

  console.log(
    `[customer-push-token] registered platform=${platform} user=${user?.id ?? 'guest'} ref=${bookingLink?.refNumber ?? refNumber ?? 'none'} tokenSuffix=${token.slice(-8)}`,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCustomerMobileUser(request);
  if (!user) return unauthorizedResponse();

  await db
    .update(customerPushTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(customerPushTokens.userId, user.id), eq(customerPushTokens.isActive, true)));

  return NextResponse.json({ ok: true });
}
