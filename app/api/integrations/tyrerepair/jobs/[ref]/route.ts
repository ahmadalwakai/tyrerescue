import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, drivers, users } from '@/lib/db';
import {
  isAuthorizedIntegrationRequest,
  integrationUnauthorized,
} from '../../_lib';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ ref: string }>;
}

/**
 * Inbound endpoint: tyrerepair.uk reads back the live status + driver location
 * of a previously pushed field job (for its own tracking view). Read-only.
 */
export async function GET(request: Request, { params }: Props) {
  if (!isAuthorizedIntegrationRequest(request)) return integrationUnauthorized();

  const { ref } = await params;

  const [row] = await db
    .select({
      refNumber: bookings.refNumber,
      status: bookings.status,
      driverId: bookings.driverId,
      assignedAt: bookings.assignedAt,
      acceptedAt: bookings.acceptedAt,
      enRouteAt: bookings.enRouteAt,
      arrivedAt: bookings.arrivedAt,
      inProgressAt: bookings.inProgressAt,
      completedAt: bookings.completedAt,
      driverName: users.name,
      driverPhone: users.phone,
      driverLat: drivers.currentLat,
      driverLng: drivers.currentLng,
      driverLocationAt: drivers.locationAt,
    })
    .from(bookings)
    .leftJoin(drivers, eq(bookings.driverId, drivers.id))
    .leftJoin(users, eq(drivers.userId, users.id))
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    refNumber: row.refNumber,
    status: row.status,
    driver: row.driverId
      ? {
          id: row.driverId,
          name: row.driverName,
          phone: row.driverPhone,
          lat: row.driverLat?.toString() ?? null,
          lng: row.driverLng?.toString() ?? null,
          locationAt: row.driverLocationAt?.toISOString() ?? null,
        }
      : null,
    timestamps: {
      assignedAt: row.assignedAt?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      enRouteAt: row.enRouteAt?.toISOString() ?? null,
      arrivedAt: row.arrivedAt?.toISOString() ?? null,
      inProgressAt: row.inProgressAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    },
  });
}
