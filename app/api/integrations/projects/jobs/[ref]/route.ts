import { NextResponse } from 'next/server';
import { and, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, bookings, bookingStatusHistory, drivers, users } from '@/lib/db';
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

const cancellationSchema = z.object({
  status: z.literal('cancelled'),
  externalReference: z.string().trim().regex(/^CT-[A-F0-9]{16}$/),
}).strict();

/** Only unpaid, unassigned Caledonia requests can be cancelled externally. */
export async function PATCH(request: Request, { params }: Props) {
  const source = getProjectSourceForRequest(request);
  if (source instanceof NextResponse) return source;
  if (source.app !== 'caledonia_tyres') {
    return NextResponse.json({ error: 'External cancellation is not enabled for this project' }, { status: 403 });
  }

  const parsed = cancellationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cancellation request' }, { status: 400 });
  }

  const { ref } = await params;
  const externalReference = parsed.data.externalReference;
  const findRequest = async () => {
    const [row] = await db.select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      driverId: bookings.driverId,
    }).from(bookings).where(and(
      eq(bookings.sourceApp, source.app),
      eq(bookings.externalReference, externalReference),
      or(eq(bookings.refNumber, ref.trim().toUpperCase()), eq(bookings.externalReference, ref.trim())),
    )).limit(1);
    return row;
  };

  const existing = await findRequest();
  if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (existing.status === 'cancelled') {
    return NextResponse.json({ refNumber: existing.refNumber, status: existing.status });
  }
  if (existing.status !== 'awaiting_payment' || existing.driverId) {
    return NextResponse.json({ error: 'Please contact Tyre Rescue to change this booking' }, { status: 409 });
  }

  // The comparison and audit insert share a single PostgreSQL statement so a
  // concurrent assignment/payment cannot be overwritten or lose its history.
  const result = await db.execute<{ refNumber: string; status: string }>(sql`
    WITH cancelled AS (
      UPDATE ${bookings}
      SET status = 'cancelled', updated_at = NOW()
      WHERE ${bookings.id} = ${existing.id}
        AND ${bookings.sourceApp} = ${source.app}
        AND ${bookings.externalReference} = ${externalReference}
        AND ${bookings.status} = 'awaiting_payment'
        AND ${bookings.driverId} IS NULL
      RETURNING id, ref_number, status
    ), audit AS (
      INSERT INTO ${bookingStatusHistory} (booking_id, from_status, to_status, actor_role, note)
      SELECT id, 'awaiting_payment', 'cancelled', 'system',
        ${`${source.label} customer cancellation requested: ${externalReference}`}
      FROM cancelled
    )
    SELECT ref_number AS "refNumber", status FROM cancelled
  `);
  const cancelled = result.rows[0];
  if (cancelled) return NextResponse.json(cancelled);

  const latest = await findRequest();
  if (latest?.status === 'cancelled') {
    return NextResponse.json({ refNumber: latest.refNumber, status: latest.status });
  }
  return NextResponse.json({ error: 'This booking changed. Please contact Tyre Rescue.' }, { status: 409 });
}
