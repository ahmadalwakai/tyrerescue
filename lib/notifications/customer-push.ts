import { and, eq, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { bookings, customerPushTokens } from '@/lib/db/schema';

const CUSTOMER_CHANNEL_ID = 'booking_updates';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface CustomerPushBooking {
  id: string;
  refNumber: string;
  userId: string | null;
}

function isExpoPushToken(token: string) {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

function customerTrackingUrl(refNumber: string) {
  return `tyrerescue://track?ref=${encodeURIComponent(refNumber)}`;
}

function statusCopy(status: string, refNumber: string) {
  switch (status) {
    case 'paid':
    case 'deposit_paid':
      return {
        title: 'Payment received',
        body: `Booking ${refNumber} is confirmed. We will update you when a driver is assigned.`,
      };
    case 'driver_assigned':
      return {
        title: 'Driver assigned',
        body: `Your Tyre Rescue driver has been assigned for booking ${refNumber}.`,
      };
    case 'en_route':
      return {
        title: 'Driver on the way',
        body: `Your driver is heading to your location for booking ${refNumber}.`,
      };
    case 'arrived':
      return {
        title: 'Driver arrived',
        body: `Your driver has arrived for booking ${refNumber}.`,
      };
    case 'in_progress':
      return {
        title: 'Work started',
        body: `Work is now in progress for booking ${refNumber}.`,
      };
    case 'completed':
      return {
        title: 'Job completed',
        body: `Booking ${refNumber} has been completed. Thank you for choosing Tyre Rescue.`,
      };
    case 'cancelled':
      return {
        title: 'Booking cancelled',
        body: `Booking ${refNumber} has been cancelled.`,
      };
    default:
      return {
        title: 'Booking updated',
        body: `Booking ${refNumber} status changed to ${status.replace(/_/g, ' ')}.`,
      };
  }
}

async function getBookingForPush(bookingId: string): Promise<CustomerPushBooking | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      userId: bookings.userId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  return booking ?? null;
}

async function getCustomerTokens(booking: CustomerPushBooking) {
  const filters = [
    eq(customerPushTokens.bookingId, booking.id),
    eq(customerPushTokens.lastRefNumber, booking.refNumber),
  ];
  if (booking.userId) filters.push(eq(customerPushTokens.userId, booking.userId));

  const rows = await db
    .select({ id: customerPushTokens.id, token: customerPushTokens.token })
    .from(customerPushTokens)
    .where(and(eq(customerPushTokens.isActive, true), or(...filters)));

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!isExpoPushToken(row.token) || seen.has(row.token)) return false;
    seen.add(row.token);
    return true;
  });
}

async function deactivateTokens(tokenIds: string[]) {
  for (const id of tokenIds) {
    await db
      .update(customerPushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(customerPushTokens.id, id));
  }
}

export async function notifyCustomerBookingStatus(input: {
  bookingId: string;
  status: string;
  title?: string;
  body?: string;
}): Promise<boolean> {
  try {
    const booking = await getBookingForPush(input.bookingId);
    if (!booking) return false;

    const tokens = await getCustomerTokens(booking);
    if (tokens.length === 0) return false;

    const copy = statusCopy(input.status, booking.refNumber);
    const messages: ExpoPushMessage[] = tokens.map((row) => ({
      to: row.token,
      title: input.title ?? copy.title,
      body: input.body ?? copy.body,
      sound: 'default',
      channelId: CUSTOMER_CHANNEL_ID,
      priority: 'high',
      data: {
        type: 'booking_update',
        ref: booking.refNumber,
        status: input.status,
        url: customerTrackingUrl(booking.refNumber),
      },
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('[customer-push] HTTP error:', response.status, await response.text());
      return false;
    }

    const json = (await response.json()) as { data?: ExpoPushTicket[] };
    const staleTokenIds: string[] = [];
    json.data?.forEach((ticket, index) => {
      if (ticket.status !== 'error') return;
      console.error('[customer-push] push error:', JSON.stringify(ticket));
      if (ticket.details?.error === 'DeviceNotRegistered') {
        const tokenRow = tokens[index];
        if (tokenRow) staleTokenIds.push(tokenRow.id);
      }
    });

    if (staleTokenIds.length > 0) {
      await deactivateTokens(staleTokenIds);
    }

    return true;
  } catch (error) {
    console.error('[customer-push] unexpected error:', error);
    return false;
  }
}
