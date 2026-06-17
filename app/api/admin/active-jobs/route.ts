import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
import {
  computeDriverPaymentSummary,
  type PaymentSummary,
} from '@/lib/payments/driver-payment';
import { getBookingPaymentEvidenceMap } from '@/lib/payments/payment-evidence';
import { haversineDistanceMiles } from '@/lib/mapbox';

const ACTIVE_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

const STALE_AFTER_SECONDS = 90;

export interface ActiveJobItem {
  bookingRef: string;
  bookingId: string;
  status: (typeof ACTIVE_STATUSES)[number];
  scheduledAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  customer: {
    name: string;
    phone: string | null;
    address: string;
    lat: number | null;
    lng: number | null;
  };
  driver: {
    id: string;
    name: string | null;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    locationAt: string | null;
    locationSource: string | null;
    isStale: boolean;
  };
  payment: PaymentSummary;
  distanceMiles: number | null;
  etaMinutes: number | null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      bookingId: bookings.id,
      bookingRef: bookings.refNumber,
      status: bookings.status,
      scheduledAt: bookings.scheduledAt,
      assignedAt: bookings.assignedAt,
      acceptedAt: bookings.acceptedAt,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      addressLine: bookings.addressLine,
      customerLat: bookings.lat,
      customerLng: bookings.lng,
      totalAmount: bookings.totalAmount,
      subtotal: bookings.subtotal,
      vatAmount: bookings.vatAmount,
      paymentType: bookings.paymentType,
      depositAmountPence: bookings.depositAmountPence,
      remainingBalancePence: bookings.remainingBalancePence,
      depositPaidAt: bookings.depositPaidAt,
      stripePiId: bookings.stripePiId,
      driverId: drivers.id,
      driverName: users.name,
      driverPhone: users.phone,
      driverLat: drivers.currentLat,
      driverLng: drivers.currentLng,
      driverLocationAt: drivers.locationAt,
      driverLocationSource: drivers.locationSource,
    })
    .from(bookings)
    .innerJoin(drivers, eq(drivers.id, bookings.driverId))
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(
      and(
        inArray(bookings.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(desc(bookings.assignedAt));

  const now = Date.now();

  const paymentEvidenceMap = await getBookingPaymentEvidenceMap(rows.map((row) => row.bookingId));

  const items: ActiveJobItem[] = rows.map((row) => {
    const customerLat = toNumber(row.customerLat);
    const customerLng = toNumber(row.customerLng);
    const driverLat = toNumber(row.driverLat);
    const driverLng = toNumber(row.driverLng);

    let distanceMiles: number | null = null;
    let etaMinutes: number | null = null;
    if (
      customerLat != null &&
      customerLng != null &&
      driverLat != null &&
      driverLng != null
    ) {
      const miles = haversineDistanceMiles(
        { lat: driverLat, lng: driverLng },
        { lat: customerLat, lng: customerLng },
      );
      distanceMiles = Math.round(miles * 10) / 10;
      // Rough ETA at 25mph average urban speed; precise value comes from
      // /api/admin/active-jobs/[ref]/route which calls Mapbox Directions.
      etaMinutes = Math.max(1, Math.round((miles / 25) * 60));
    }

    const locationAtIso = row.driverLocationAt
      ? new Date(row.driverLocationAt).toISOString()
      : null;
    const ageSeconds = row.driverLocationAt
      ? Math.max(0, Math.round((now - new Date(row.driverLocationAt).getTime()) / 1000))
      : null;
    const isStale =
      ageSeconds == null ? true : ageSeconds > STALE_AFTER_SECONDS;

    const paymentEvidence = paymentEvidenceMap.get(row.bookingId);
    const payment = computeDriverPaymentSummary({
      paymentType: row.paymentType,
      totalAmount: row.totalAmount,
      subtotal: row.subtotal,
      vatAmount: row.vatAmount,
      depositAmountPence: row.depositAmountPence ?? null,
      remainingBalancePence: row.remainingBalancePence ?? null,
      depositPaidAt: row.depositPaidAt ?? null,
      stripePiId: row.stripePiId ?? null,
      paymentStatus: paymentEvidence?.paymentStatus ?? null,
      totalPaidPence: paymentEvidence?.totalPaidPence ?? 0,
      bookingStatus: row.status,
    });

    return {
      bookingRef: row.bookingRef,
      bookingId: row.bookingId,
      status: row.status as (typeof ACTIVE_STATUSES)[number],
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt).toISOString() : null,
      assignedAt: row.assignedAt ? new Date(row.assignedAt).toISOString() : null,
      acceptedAt: row.acceptedAt ? new Date(row.acceptedAt).toISOString() : null,
      customer: {
        name: row.customerName,
        phone: row.customerPhone,
        address: row.addressLine,
        lat: customerLat,
        lng: customerLng,
      },
      driver: {
        id: row.driverId,
        name: row.driverName,
        phone: row.driverPhone,
        lat: driverLat,
        lng: driverLng,
        locationAt: locationAtIso,
        locationSource: row.driverLocationSource ?? null,
        isStale,
      },
      payment,
      distanceMiles,
      etaMinutes,
    };
  });

  return NextResponse.json({ activeJobs: items });
}
