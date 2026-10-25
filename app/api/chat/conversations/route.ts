import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, drivers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { listConversations, getOrCreateConversation } from '@/lib/chat/queries';
import { ensureParticipant } from '@/lib/chat/permissions';
import type { ChatChannel, ChatRole } from '@/lib/chat/types';
import { authorizeCustomerBooking } from '@/lib/customer-booking-access';

const createSchema = z.object({
  bookingId: z.string().uuid(),
  channel: z.enum(['customer_admin', 'customer_driver', 'admin_driver']),
  driverId: z.string().uuid().optional(),
});

/** GET /api/chat/conversations — list conversations for the current user */
export async function GET(req: NextRequest) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = req.nextUrl;
  const filters = {
    bookingRef: url.searchParams.get('bookingRef') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    channel: url.searchParams.get('channel') ?? undefined,
    driverId: url.searchParams.get('driverId') ?? undefined,
  };

  const role = session.user.role as ChatRole;
  if (!['customer', 'admin', 'driver'].includes(role)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const conversations = await listConversations(session.user.id, role, filters);

  return NextResponse.json({ conversations });
}

/** POST /api/chat/conversations — create or get a conversation for a booking */
export async function POST(req: NextRequest) {
  const session = await authMobile(req);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { bookingId, channel, driverId } = parsed.data;
  const role = (session?.user.role ?? 'customer') as ChatRole;
  if (!['customer', 'admin', 'driver'].includes(role)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  if (role === 'customer' && channel === 'admin_driver') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // Verify booking exists and user has access
  const [booking] = await db
    .select({ id: bookings.id, refNumber: bookings.refNumber, userId: bookings.userId, driverId: bookings.driverId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Authorization checks
  const ownerId = session?.user.role === 'customer' && booking.userId === session.user.id ? session.user.id : null;
  if (role === 'customer' && !ownerId && (channel !== 'customer_admin' || !await authorizeCustomerBooking(req, booking))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (role === 'driver') {
    if (channel !== 'customer_driver' && channel !== 'admin_driver') {
      return NextResponse.json({ error: 'Drivers can only use customer_driver or admin_driver channel' }, { status: 403 });
    }
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, session!.user.id))
      .limit(1);
    if (!driver || booking.driverId !== driver.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  let targetDriverUserId: string | null = null;
  const effectiveDriverId = driverId ?? booking.driverId;

  if (driverId && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can choose a driver for private chat' }, { status: 403 });
  }

  if (driverId && booking.driverId !== driverId) {
    return NextResponse.json({ error: 'Selected driver is not assigned to this booking' }, { status: 400 });
  }

  // customer_driver / admin_driver channel requires an assigned or explicitly selected driver
  if ((channel === 'customer_driver' || channel === 'admin_driver') && !effectiveDriverId) {
    return NextResponse.json({ error: 'No driver assigned to this booking yet' }, { status: 400 });
  }

  if ((channel === 'customer_driver' || channel === 'admin_driver') && effectiveDriverId) {
    const [targetDriver] = await db
      .select({ userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, effectiveDriverId))
      .limit(1);
    if (!targetDriver?.userId) {
      return NextResponse.json({ error: 'Driver account not found' }, { status: 404 });
    }
    targetDriverUserId = targetDriver.userId;
  }

  const conversationId = await getOrCreateConversation(
    bookingId,
    channel as ChatChannel,
    role === 'customer' ? ownerId : session!.user.id,
    role,
    { targetDriverUserId },
  );

  // Ensure current user is a participant
  const participantId = role === 'customer' ? ownerId : session!.user.id;
  if (participantId) await ensureParticipant(conversationId, participantId, role);
  if (targetDriverUserId) {
    await ensureParticipant(conversationId, targetDriverUserId, 'driver');
  }

  return NextResponse.json({ conversationId }, { status: 201 });
}
