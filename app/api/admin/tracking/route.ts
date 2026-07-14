import { NextRequest } from 'next/server';
import { and, desc, eq, gte, inArray, lt, notInArray } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { jsonWithExpoDevCors } from '@/lib/api/dev-cors';
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

type LocationFreshness = 'live' | 'stale' | 'offline' | 'unknown';
type DriverStatus = 'available' | 'busy' | 'offline' | 'unknown';

export interface TrackingDriver {
  id: string;
  name: string;
  phone: string | null;
  status: DriverStatus;
  activeJobRef: string | null;
  lat: number | null;
  lng: number | null;
  heading: null;
  lastSeenAt: string | null;
  locationFreshness: LocationFreshness;
  driverSituation: DriverSituation | null;
}

export interface TrackingJob {
  id: string;
  ref: string;
  status: string;
  assignmentStatus: 'unassigned' | 'assigned';
  assignedDriverId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  tyreSummary: string | null;
  vehicleSummary: string | null;
  paymentSummary: PaymentSummary | null;
  driverSituation: DriverSituation | null;
  createdAt: string;
  scheduledFor: string | null;
}

export interface TrackingResponse {
  drivers: TrackingDriver[];
  jobs: TrackingJob[];
  generatedAt: string;
}

type JobsRange = 'today' | 'yesterday' | 'last_7_days' | 'last_month' | 'last_year';

const ACTIVE_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

const HIDDEN_JOB_STATUSES = [
  'draft',
  'cancelled',
  'refunded',
  'refunded_partial',
] as const;

const JOBS_RANGE_VALUES = new Set<JobsRange>([
  'today',
  'yesterday',
  'last_7_days',
  'last_month',
  'last_year',
]);

const TRACKING_TIME_ZONE = 'Europe/London';

// Freshness thresholds as per spec
const LIVE_THRESHOLD_MS = 60_000;
const STALE_THRESHOLD_MS = 600_000;

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readJobsRange(request: NextRequest): JobsRange {
  const value = request.nextUrl.searchParams.get('jobsRange');
  return JOBS_RANGE_VALUES.has(value as JobsRange) ? (value as JobsRange) : 'today';
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: 'year' | 'month' | 'day') => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const get = (type: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second') =>
    Number(parts.find((part) => part.type === type)?.value);

  const hour = get('hour');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour === 24 ? 0 : hour,
    get('minute'),
    get('second'),
  );

  return asUtc - date.getTime();
}

function zonedStartOfDayUtc(date: Date, offsetDays: number): Date {
  const parts = getZonedDateParts(date, TRACKING_TIME_ZONE);
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays, 0, 0, 0, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), TRACKING_TIME_ZONE);
  return new Date(utcGuess - offset);
}

function jobRangeWindow(range: JobsRange, now = new Date()): { start: Date; end: Date } {
  const offsets: Record<JobsRange, { start: number; end: number }> = {
    today: { start: 0, end: 1 },
    yesterday: { start: -1, end: 0 },
    last_7_days: { start: -6, end: 1 },
    last_month: { start: -29, end: 1 },
    last_year: { start: -364, end: 1 },
  };
  const { start, end } = offsets[range];
  return {
    start: zonedStartOfDayUtc(now, start),
    end: zonedStartOfDayUtc(now, end),
  };
}

function computeFreshness(locationAt: Date | null | undefined): LocationFreshness {
  if (locationAt == null) return 'offline';
  const ageMs = Date.now() - locationAt.getTime();
  if (ageMs <= LIVE_THRESHOLD_MS) return 'live';
  if (ageMs <= STALE_THRESHOLD_MS) return 'stale';
  return 'offline';
}

function buildTyreSummary(qty: number | null, sizeDisplay: string | null | undefined): string | null {
  const size = sizeDisplay ?? null;
  if (!qty && !size) return null;
  if (!size) return qty != null ? `${qty}x` : null;
  return qty != null ? `${qty}x ${size}` : size;
}

function buildVehicleSummary(
  make: string | null | undefined,
  model: string | null | undefined,
  reg: string | null | undefined,
): string | null {
  const nameParts = [make, model].filter((p): p is string => Boolean(p));
  const name = nameParts.join(' ');
  if (!name && !reg) return null;
  if (!name) return reg ?? null;
  return reg ? `${name} (${reg})` : name;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminMobile(request);
  } catch {
    return jsonWithExpoDevCors(request, { error: 'Unauthorized' }, { status: 401 });
  }

  const jobsRange = readJobsRange(request);
  const { start, end } = jobRangeWindow(jobsRange);

  // All drivers with user info (includes offline drivers for full dispatch picture)
  const driverRows = await db
    .select({
      id: drivers.id,
      name: users.name,
      phone: users.phone,
      isOnline: drivers.isOnline,
      driverRowStatus: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id));

  // Map which drivers have active bookings so we can mark them 'busy'
  const activeBookingRows = driverRows.length
    ? await db
        .select({
          driverId: bookings.driverId,
          refNumber: bookings.refNumber,
          status: bookings.status,
          serviceType: bookings.serviceType,
          quantity: bookings.quantity,
          paymentType: bookings.paymentType,
          customerLat: bookings.lat,
          customerLng: bookings.lng,
        })
        .from(bookings)
        .where(inArray(bookings.status, [...ACTIVE_STATUSES]))
    : [];

  const activeRefByDriver = new Map<string, string>();
  const activeBookingByDriver = new Map<string, (typeof activeBookingRows)[number]>();
  for (const row of activeBookingRows) {
    if (row.driverId) {
      activeRefByDriver.set(row.driverId, row.refNumber);
      activeBookingByDriver.set(row.driverId, row);
    }
  }
  const driverById = new Map(driverRows.map((driver) => [driver.id, driver]));

  // Jobs in the selected dispatch window. Drivers are always returned in full.
  const jobRows = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      status: bookings.status,
      driverId: bookings.driverId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
      quantity: bookings.quantity,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      vehicleReg: bookings.vehicleReg,
      totalAmount: bookings.totalAmount,
      subtotal: bookings.subtotal,
      vatAmount: bookings.vatAmount,
      paymentType: bookings.paymentType,
      depositAmountPence: bookings.depositAmountPence,
      remainingBalancePence: bookings.remainingBalancePence,
      depositPaidAt: bookings.depositPaidAt,
      stripePiId: bookings.stripePiId,
      stripeDepositPiId: bookings.stripeDepositPiId,
      createdAt: bookings.createdAt,
      scheduledAt: bookings.scheduledAt,
    })
    .from(bookings)
    .where(
      and(
        notInArray(bookings.status, [...HIDDEN_JOB_STATUSES]),
        gte(bookings.createdAt, start),
        lt(bookings.createdAt, end),
      ),
    )
    .orderBy(desc(bookings.createdAt));

  const paymentSummaryMap = await getBookingPaymentSummaryMap(jobRows.map((row) => ({
    id: row.id,
    refNumber: row.refNumber,
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

  const trackingDrivers: TrackingDriver[] = driverRows.map((d) => {
    const activeJobRef = activeRefByDriver.get(d.id) ?? null;
    const activeBooking = activeBookingByDriver.get(d.id) ?? null;
    const lat = toNum(d.currentLat);
    const lng = toNum(d.currentLng);
    const freshness = computeFreshness(d.locationAt ?? null);
    const customerLat = toNum(activeBooking?.customerLat);
    const customerLng = toNum(activeBooking?.customerLng);
    const outboundMinutes =
      activeBooking && lat != null && lng != null && customerLat != null && customerLng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat, lng },
              { lat: customerLat, lng: customerLng },
            ),
          )
        : null;
    const returnMinutes =
      activeBooking && customerLat != null && customerLng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat: customerLat, lng: customerLng },
              { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
            ),
          )
        : null;

    let driverStatus: DriverStatus;
    if (activeJobRef != null) {
      driverStatus = 'busy';
    } else if (d.isOnline) {
      driverStatus = 'available';
    } else {
      driverStatus = 'offline';
    }

    return {
      id: d.id,
      name: d.name,
      phone: d.phone ?? null,
      status: driverStatus,
      activeJobRef,
      lat,
      lng,
      heading: null,
      lastSeenAt: d.locationAt ? d.locationAt.toISOString() : null,
      locationFreshness: freshness,
      driverSituation: activeBooking
        ? calculateDriverSituation({
            jobRef: activeBooking.refNumber,
            driverId: d.id,
            bookingStatus: activeBooking.status,
            driverIsOnline: d.isOnline ?? false,
            driverStatus: d.driverRowStatus ?? null,
            lastLocationAt: d.locationAt ?? null,
            outboundMinutes,
            returnMinutes,
            serviceType: activeBooking.serviceType,
            tyreCount: activeBooking.quantity,
            paymentStatus: activeBooking.paymentType,
            returnEstimateAvailable: returnMinutes != null,
            routeAvailable: outboundMinutes != null,
            garageConfigured: true,
          })
        : null,
    };
  });

  const trackingJobs: TrackingJob[] = jobRows.map((row) => {
    const lat = toNum(row.lat);
    const lng = toNum(row.lng);
    const assignmentStatus: 'assigned' | 'unassigned' = row.driverId ? 'assigned' : 'unassigned';
    const driver = row.driverId ? driverById.get(row.driverId) ?? null : null;
    const driverLat = toNum(driver?.currentLat);
    const driverLng = toNum(driver?.currentLng);
    const outboundMinutes =
      driver && lat != null && lng != null && driverLat != null && driverLng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat: driverLat, lng: driverLng },
              { lat, lng },
            ),
          )
        : null;
    const returnMinutes =
      lat != null && lng != null
        ? estimateUrbanDriveMinutesFromMiles(
            haversineDistanceMiles(
              { lat, lng },
              { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
            ),
          )
        : null;

    const paymentSummary = paymentSummaryMap.get(row.id) ?? null;

    return {
      id: row.id,
      ref: row.refNumber,
      status: row.status,
      assignmentStatus,
      assignedDriverId: row.driverId ?? null,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      address: row.addressLine,
      lat,
      lng,
      tyreSummary: buildTyreSummary(row.quantity, row.tyreSizeDisplay),
      vehicleSummary: buildVehicleSummary(row.vehicleMake, row.vehicleModel, row.vehicleReg),
      paymentSummary,
      driverSituation: calculateDriverSituation({
        jobRef: row.refNumber,
        driverId: row.driverId ?? null,
        bookingStatus: row.status,
        driverIsOnline: driver?.isOnline ?? false,
        driverStatus: driver?.driverRowStatus ?? null,
        lastLocationAt: driver?.locationAt ?? null,
        outboundMinutes,
        returnMinutes,
        serviceType: null,
        tyreCount: row.quantity,
        paymentStatus: row.paymentType,
        returnEstimateAvailable: returnMinutes != null,
        routeAvailable: outboundMinutes != null,
        garageConfigured: true,
      }),
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      scheduledFor: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    };
  });

  const response: TrackingResponse = {
    drivers: trackingDrivers,
    jobs: trackingJobs,
    generatedAt: new Date().toISOString(),
  };

  return jsonWithExpoDevCors(request, response);
}
