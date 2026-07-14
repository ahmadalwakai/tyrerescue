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
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
        serviceType: bookings.serviceType,
        quantity: bookings.quantity,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
        driverId: bookings.driverId,
        driverLat: drivers.currentLat,
        driverLng: drivers.currentLng,
        driverIsOnline: drivers.isOnline,
        driverStatus: drivers.status,
        driverLocationAt: drivers.locationAt,
      })
      .from(bookings)
      .leftJoin(drivers, eq(bookings.driverId, drivers.id))
      .leftJoin(users, eq(drivers.userId, users.id))
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
    latestBookings: latestBookings.map((booking) => {
      const customerLat = toNumber(booking.customerLat);
      const customerLng = toNumber(booking.customerLng);
      const driverLat = toNumber(booking.driverLat);
      const driverLng = toNumber(booking.driverLng);
      const outboundMinutes =
        customerLat != null && customerLng != null && driverLat != null && driverLng != null
          ? estimateUrbanDriveMinutesFromMiles(
              haversineDistanceMiles(
                { lat: driverLat, lng: driverLng },
                { lat: customerLat, lng: customerLng },
              ),
            )
          : null;
      const returnMinutes =
        customerLat != null && customerLng != null
          ? estimateUrbanDriveMinutesFromMiles(
              haversineDistanceMiles(
                { lat: customerLat, lng: customerLng },
                { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
              ),
            )
          : null;

      return {
        id: booking.id,
        refNumber: booking.refNumber,
        status: booking.status,
        bookingType: booking.bookingType,
        customerName: booking.customerName,
        totalAmount: booking.totalAmount.toString(),
        createdAt: booking.createdAt?.toISOString() ?? null,
        driverSituation: calculateDriverSituation({
          jobRef: booking.refNumber,
          driverId: booking.driverId ?? null,
          bookingStatus: booking.status,
          driverIsOnline: booking.driverIsOnline ?? false,
          driverStatus: booking.driverStatus ?? null,
          lastLocationAt: booking.driverLocationAt ?? null,
          outboundMinutes,
          returnMinutes,
          serviceType: booking.serviceType,
          tyreCount: booking.quantity,
          paymentStatus: null,
          returnEstimateAvailable: returnMinutes != null,
          routeAvailable: outboundMinutes != null,
          garageConfigured: true,
        }),
      };
    }),
  });
}
