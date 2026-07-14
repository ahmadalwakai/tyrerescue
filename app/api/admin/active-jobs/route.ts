import { NextRequest } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
import { getBookingPaymentSummaryMap, type PaymentSummary } from '@/lib/payments/payment-summary';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
  type DriverSituation,
} from '@/lib/admin/driverSituation';

const ACTIVE_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

const STALE_AFTER_SECONDS = 180;

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
  paymentSummary: PaymentSummary;
  payment: PaymentSummary;
  distanceMiles: number | null;
  etaMinutes: number | null;
  driverSituation: DriverSituation;
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
    return jsonWithExpoDevCors(request, { error: 'Unauthorized' }, { status: 401 });
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
      serviceType: bookings.serviceType,
      tyreCount: bookings.quantity,
      totalAmount: bookings.totalAmount,
      subtotal: bookings.subtotal,
      vatAmount: bookings.vatAmount,
      paymentType: bookings.paymentType,
      depositAmountPence: bookings.depositAmountPence,
      remainingBalancePence: bookings.remainingBalancePence,
      depositPaidAt: bookings.depositPaidAt,
      stripePiId: bookings.stripePiId,
      stripeDepositPiId: bookings.stripeDepositPiId,
      driverId: drivers.id,
      driverName: users.name,
      driverPhone: users.phone,
      driverLat: drivers.currentLat,
      driverLng: drivers.currentLng,
      driverLocationAt: drivers.locationAt,
      driverLocationSource: drivers.locationSource,
      driverIsOnline: drivers.isOnline,
      driverStatus: drivers.status,
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

  const paymentSummaryMap = await getBookingPaymentSummaryMap(rows.map((row) => ({
    id: row.bookingId,
    refNumber: row.bookingRef,
    status: row.status,
    paymentType: row.paymentType,
    totalAmount: row.totalAmount,
    subtotal: row.subtotal,
    vatAmount: row.vatAmount,
    depositAmountPence: row.depositAmountPence ?? null,
    remainingBalancePence: row.remainingBalancePence ?? null,
    depositPaidAt: row.depositPaidAt ?? null,
    stripePiId: row.stripePiId ?? null,
    stripeDepositPiId: row.stripeDepositPiId ?? null,
  })));

  const items: ActiveJobItem[] = rows.map((row) => {
    const customerLat = toNumber(row.customerLat);
    const customerLng = toNumber(row.customerLng);
    const driverLat = toNumber(row.driverLat);
    const driverLng = toNumber(row.driverLng);

    let distanceMiles: number | null = null;
    let etaMinutes: number | null = null;
    let returnEtaMinutes: number | null = null;
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
      etaMinutes = estimateUrbanDriveMinutesFromMiles(miles);
    }

    if (customerLat != null && customerLng != null) {
      returnEtaMinutes = estimateUrbanDriveMinutesFromMiles(
        haversineDistanceMiles(
          { lat: customerLat, lng: customerLng },
          { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
        ),
      );
    }

    const locationAtIso = row.driverLocationAt
      ? new Date(row.driverLocationAt).toISOString()
      : null;
    const ageSeconds = row.driverLocationAt
      ? Math.max(0, Math.round((now - new Date(row.driverLocationAt).getTime()) / 1000))
      : null;
    const isStale =
      ageSeconds == null ? true : ageSeconds > STALE_AFTER_SECONDS;

    const payment = paymentSummaryMap.get(row.bookingId);
    if (!payment) {
      throw new Error(`Missing payment summary for ${row.bookingRef}`);
    }

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
      paymentSummary: payment,
      payment,
      distanceMiles,
      etaMinutes,
      driverSituation: calculateDriverSituation({
        jobRef: row.bookingRef,
        driverId: row.driverId,
        bookingStatus: row.status,
        driverIsOnline: row.driverIsOnline ?? false,
        driverStatus: row.driverStatus ?? null,
        lastLocationAt: row.driverLocationAt ?? null,
        outboundMinutes: etaMinutes,
        returnMinutes: returnEtaMinutes,
        trafficDelayMinutes: null,
        serviceType: row.serviceType ?? null,
        tyreCount: row.tyreCount ?? null,
        paymentStatus: row.paymentType ?? null,
        gpsState: isStale ? 'weak' : 'normal',
        returnEstimateAvailable: returnEtaMinutes != null,
        routeAvailable: etaMinutes != null,
        garageConfigured: true,
      }),
    };
  });

  return jsonWithExpoDevCors(request, { activeJobs: items });
}

export async function OPTIONS(request: NextRequest) {
  return expoDevCorsPreflight(request);
}
