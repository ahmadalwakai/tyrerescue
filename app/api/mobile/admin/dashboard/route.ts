import { NextResponse } from 'next/server';
import { sql, desc, eq } from 'drizzle-orm';
import {
  db,
  bookings,
  drivers,
  users,
  tyreProducts,
  contactMessages,
  callMeBack,
  adminNotifications,
  bookingConversations,
} from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const [
    bookingTotals,
    activeBookings,
    onlineDrivers,
    inventoryLowStock,
    unreadMessages,
    pendingCallbacks,
    unreadAdminAlerts,
    chatOpen,
    latestBookings,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(bookings),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookings)
      .where(sql`${bookings.status} NOT IN ('completed', 'cancelled', 'refunded', 'refunded_partial', 'draft')`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .where(eq(drivers.isOnline, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tyreProducts)
      .where(sql`${tyreProducts.stockNew} <= 5`),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactMessages)
      .where(eq(contactMessages.status, 'unread')),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(callMeBack)
      .where(eq(callMeBack.status, 'pending')),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminNotifications)
      .where(eq(adminNotifications.isRead, false)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingConversations)
      .where(eq(bookingConversations.status, 'open')),
    db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        bookingType: bookings.bookingType,
        customerName: bookings.customerName,
        totalAmount: bookings.totalAmount,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(8),
  ]);

  return NextResponse.json({
    stats: {
      totalBookings: Number(bookingTotals[0]?.count || 0),
      activeBookings: Number(activeBookings[0]?.count || 0),
      onlineDrivers: Number(onlineDrivers[0]?.count || 0),
      lowStockProducts: Number(inventoryLowStock[0]?.count || 0),
      unreadMessages: Number(unreadMessages[0]?.count || 0),
      pendingCallbacks: Number(pendingCallbacks[0]?.count || 0),
      unreadAdminAlerts: Number(unreadAdminAlerts[0]?.count || 0),
      openChatConversations: Number(chatOpen[0]?.count || 0),
    },
    latestBookings: latestBookings.map((booking) => ({
      ...booking,
      totalAmount: booking.totalAmount.toString(),
      createdAt: booking.createdAt?.toISOString() ?? null,
    })),
  });
}
