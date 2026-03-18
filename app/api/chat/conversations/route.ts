import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, drivers, bookingConversations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { listConversations, getOrCreateConversation } from '@/lib/chat/queries';
import { ensureParticipant } from '@/lib/chat/permissions';
import type { ChatChannel, ChatRole } from '@/lib/chat/types';

const createSchema = z.object({
  bookingId: z.string().uuid(),
  channel: z.enum(['customer_admin', 'customer_driver']),
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
  };

  const role = session.user.role as ChatRole;
  const conversations = await listConversations(session.user.id, role, filters);

  return NextResponse.json({ conversations });
}

/** POST /api/chat/conversations — create or get a conversation for a booking */
export async function POST(req: NextRequest) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { bookingId, channel } = parsed.data;
  const role = session.user.role as ChatRole;

  // Verify booking exists and user has access
  const [booking] = await db
    .select({ id: bookings.id, userId: bookings.userId, driverId: bookings.driverId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Authorization checks
  if (role === 'customer' && booking.userId !== session.user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (role === 'driver') {
    if (channel !== 'customer_driver') {
      return NextResponse.json({ error: 'Drivers can only use customer_driver channel' }, { status: 403 });
    }
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, session.user.id))
      .limit(1);
    if (!driver || booking.driverId !== driver.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
  }

  // customer_driver channel requires an assigned driver
  if (channel === 'customer_driver' && !booking.driverId) {
    return NextResponse.json({ error: 'No driver assigned to this booking yet' }, { status: 400 });
  }

  const conversationId = await getOrCreateConversation(
    bookingId,
    channel as ChatChannel,
    session.user.id,
    role,
  );

  // Ensure current user is a participant
  await ensureParticipant(conversationId, session.user.id, role);

  return NextResponse.json({ conversationId }, { status: 201 });
}
