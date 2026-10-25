import { db } from '@/lib/db';
import {
  bookingConversations,
  conversationParticipants,
  bookings,
  drivers,
  users,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ChatRole } from './types';

interface SessionUser {
  id: string;
  role: ChatRole;
}

/**
 * Check whether a user can access a specific conversation.
 * - Admin: always allowed
 * - Customer: only if they are the booking owner
 * - Driver: assigned booking / explicit booking participant, or the direct chat's driver
 */
export async function canAccessConversation(
  user: SessionUser,
  conversationId: string,
): Promise<boolean> {
  if (user.role === 'admin') return true;

  const [conv] = await db
    .select({ bookingId: bookingConversations.bookingId, channel: bookingConversations.channel })
    .from(bookingConversations)
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  if (!conv) return false;

  // Direct chats never inherit access from a participant row or a customer booking.
  // Query the additive column only for direct rows so booking chats keep working
  // while the new migration has not yet been applied.
  if (!conv.bookingId) {
    if (user.role !== 'driver' || conv.channel !== 'admin_driver') return false;
    const [owner] = await db.select({ userId: drivers.userId })
      .from(bookingConversations)
      .innerJoin(drivers, eq(drivers.id, bookingConversations.directDriverId))
      .innerJoin(users, eq(users.id, drivers.userId))
      .where(and(eq(bookingConversations.id, conversationId), eq(users.role, 'driver'))).limit(1);
    return owner?.userId === user.id;
  }

  if (user.role === 'customer') {
    if (conv.channel === 'admin_driver') return false;
    const [booking] = await db
      .select({ userId: bookings.userId })
      .from(bookings)
      .where(eq(bookings.id, conv.bookingId))
      .limit(1);
    return booking?.userId === user.id;
  }

  if (user.role === 'driver') {
    if (conv.channel !== 'customer_driver' && conv.channel !== 'admin_driver') return false;
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, user.id))
      .limit(1);
    if (!driver) return false;
    const [participant] = await db
      .select({ id: conversationParticipants.id })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, user.id),
        ),
      )
      .limit(1);
    if (participant) return true;
    const [booking] = await db
      .select({ driverId: bookings.driverId })
      .from(bookings)
      .where(eq(bookings.id, conv.bookingId))
      .limit(1);
    return booking?.driverId === driver.id;
  }

  return false;
}

/**
 * Check whether a user can send a message in a conversation.
 * Locked conversations only allow admin messages.
 */
export async function canSendMessage(
  user: SessionUser,
  conversationId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const hasAccess = await canAccessConversation(user, conversationId);
  if (!hasAccess) return { allowed: false, reason: 'Access denied' };

  const [conv] = await db
    .select({ locked: bookingConversations.locked, status: bookingConversations.status })
    .from(bookingConversations)
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  if (!conv) return { allowed: false, reason: 'Conversation not found' };
  if (conv.status === 'closed' && user.role !== 'admin') {
    return { allowed: false, reason: 'Conversation is closed' };
  }
  if (conv.status === 'archived') {
    return { allowed: false, reason: 'Conversation is archived' };
  }
  if (conv.locked && user.role !== 'admin') {
    return { allowed: false, reason: 'Conversation is locked' };
  }

  return { allowed: true };
}

/**
 * Ensure participant row exists for a user in a conversation.
 */
export async function ensureParticipant(
  conversationId: string,
  userId: string,
  role: ChatRole,
): Promise<void> {
  const [existing] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(conversationParticipants).values({
      conversationId,
      userId,
      role,
    });
  }
}
