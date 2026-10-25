import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getCustomerMobileUser, unauthorizedResponse } from '../_lib';
import { authorizeCustomerBooking } from '@/lib/customer-booking-access';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';

const tokenSchema = z.string().max(255).regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/);
const pushTokenSchema = z.object({
  token: tokenSchema,
  platform: z.enum(['ios', 'android']).default('ios'),
  refNumber: z.string().trim().min(3).max(30).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = pushTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push token payload' }, { status: 400 });
  const { token, platform, refNumber } = parsed.data;
  const user = await getCustomerMobileUser(request);
  let bookingLink: { id: string; userId: string | null; refNumber: string } | null = null;
  if (refNumber) {
    const [booking] = await db.select({ id: bookings.id, userId: bookings.userId, refNumber: bookings.refNumber })
      .from(bookings).where(eq(sql`upper(${bookings.refNumber})`, refNumber.toUpperCase())).limit(1);
    if (!booking || !(await authorizeCustomerBooking(request, booking))) {
      return NextResponse.json({ error: 'Booking access is required' }, { status: 403 });
    }
    bookingLink = booking;
  }
  if (!user && !bookingLink) return unauthorizedResponse();
  // One PostgreSQL statement is atomic and works with the Neon HTTP driver.
  await db.execute(sql`
    WITH device AS (
      INSERT INTO customer_push_tokens (user_id, token, platform, is_active)
      VALUES (${user?.id ?? null}::uuid, ${token}, ${platform}, true)
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, booking_id = NULL,
        last_ref_number = NULL, platform = EXCLUDED.platform, is_active = true, updated_at = NOW()
      RETURNING id
    )
    INSERT INTO customer_push_subscriptions (push_token_id, booking_id, owner_user_id)
    SELECT device.id, ${bookingLink?.id ?? null}::uuid, ${user?.id ?? null}::uuid FROM device
    WHERE ${bookingLink?.id ?? null}::uuid IS NOT NULL
    ON CONFLICT (push_token_id, booking_id) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
  `);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCustomerMobileUser(request);
  if (!user) return unauthorizedResponse();
  const parsed = z.object({ token: tokenSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'The current device token is required' }, { status: 400 });
  await db.execute(sql`
    WITH target AS (
      SELECT id FROM customer_push_tokens WHERE user_id = ${user.id}::uuid AND token = ${parsed.data.token} FOR UPDATE
    ), removed AS (
      DELETE FROM customer_push_subscriptions WHERE push_token_id IN (SELECT id FROM target)
    )
    UPDATE customer_push_tokens SET user_id = NULL, booking_id = NULL, last_ref_number = NULL,
      is_active = false, updated_at = NOW() WHERE id IN (SELECT id FROM target)
  `);
  return NextResponse.json({ ok: true });
}
