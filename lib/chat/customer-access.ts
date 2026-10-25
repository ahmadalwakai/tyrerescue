import { and, eq } from 'drizzle-orm';

import { authMobile } from '@/lib/auth';
import { authorizeCustomerBooking } from '@/lib/customer-booking-access';
import { bookingConversations, bookings, db } from '@/lib/db';
import { canAccessConversation } from './permissions';
import type { ChatRole } from './types';

export interface ChatActor {
  id: string | null;
  role: ChatRole;
  name: string;
}

/** A guest proof can open only the customer/admin thread for its exact booking. */
export async function resolveChatActor(request: Request, conversationId: string): Promise<ChatActor | null> {
  const session = await authMobile(request);
  if (session && ['admin', 'customer', 'driver'].includes(session.user.role)) {
    const role = session.user.role as ChatRole;
    if (await canAccessConversation({ id: session.user.id, role }, conversationId)) {
      return { id: session.user.id, role, name: session.user.name ?? role };
    }
  }
  const [booking] = await db.select({ id: bookings.id, refNumber: bookings.refNumber, userId: bookings.userId })
    .from(bookingConversations).innerJoin(bookings, eq(bookings.id, bookingConversations.bookingId))
    .where(and(eq(bookingConversations.id, conversationId), eq(bookingConversations.channel, 'customer_admin'))).limit(1);
  if (!booking || !await authorizeCustomerBooking(request, booking)) return null;
  return { id: null, role: 'customer', name: 'Guest customer' };
}

export async function canChatActorSend(actor: ChatActor, conversationId: string) {
  const [conversation] = await db.select({ locked: bookingConversations.locked, status: bookingConversations.status })
    .from(bookingConversations).where(eq(bookingConversations.id, conversationId)).limit(1);
  if (!conversation) return { allowed: false, reason: 'Conversation not found' };
  if (conversation.status === 'archived') return { allowed: false, reason: 'Conversation is archived' };
  if (actor.role !== 'admin' && conversation.status === 'closed') return { allowed: false, reason: 'Conversation is closed' };
  if (actor.role !== 'admin' && conversation.locked) return { allowed: false, reason: 'Conversation is locked' };
  return { allowed: true };
}
