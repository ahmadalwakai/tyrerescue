import { NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { db, bookings, drivers, users } from '@/lib/db';
import { getProjectSourceForRequest } from '../../_auth';
import { formatProjectReference } from '@/lib/integrations/project-sources';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const source = getProjectSourceForRequest(request);
  if (source instanceof NextResponse) return source;

  const { ref } = await params;
  const trimmedRef = ref.trim();

  const [row] = await db
    .select({
      refNumber: bookings.refNumber,
      sourceApp: bookings.sourceApp,
      sourceLabel: bookings.sourceLabel,
      externalReference: bookings.externalReference,
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
    .where(
      and(
        eq(bookings.sourceApp, source.app),
        or(
          eq(bookings.refNumber, trimmedRef.toUpperCase()),
          eq(bookings.externalReference, trimmedRef),
        ),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    refNumber: row.refNumber,
    sourceApp: row.sourceApp,
    sourceLabel: row.sourceLabel,
    externalReference: row.externalReference,
    sourceDisplay: formatProjectReference(row.sourceLabel, row.externalReference),
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
