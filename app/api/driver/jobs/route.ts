import { NextResponse } from 'next/server';
import { db, bookings, bookingTyres, tyreProducts } from '@/lib/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';
import { computeDriverPaymentSummary, type PaymentSummary } from '@/lib/payments/driver-payment';

const OPERATIONAL_STATUSES = ['en_route', 'arrived', 'in_progress'] as const;
const UPCOMING_STATUSES = ['driver_assigned'] as const;

const JOB_LIST_SELECTION = {
  id: bookings.id,
  refNumber: bookings.refNumber,
  status: bookings.status,
  bookingType: bookings.bookingType,
  serviceType: bookings.serviceType,
  addressLine: bookings.addressLine,
  lat: bookings.lat,
  lng: bookings.lng,
  tyreSizeDisplay: bookings.tyreSizeDisplay,
  quantity: bookings.quantity,
  customerName: bookings.customerName,
  customerPhone: bookings.customerPhone,
  scheduledAt: bookings.scheduledAt,
  acceptedAt: bookings.acceptedAt,
  assignedAt: bookings.assignedAt,
  completedAt: bookings.completedAt,
  totalAmount: bookings.totalAmount,
  subtotal: bookings.subtotal,
  vatAmount: bookings.vatAmount,
  paymentType: bookings.paymentType,
  depositAmountPence: bookings.depositAmountPence,
  remainingBalancePence: bookings.remainingBalancePence,
  depositPaidAt: bookings.depositPaidAt,
  stripePiId: bookings.stripePiId,
  createdAt: bookings.createdAt,
} as const;

interface RawJobRow {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  lat: string | null;
  lng: string | null;
  tyreSizeDisplay: string | null;
  quantity: number | null;
  customerName: string;
  customerPhone: string | null;
  scheduledAt: Date | null;
  acceptedAt: Date | null;
  assignedAt: Date | null;
  completedAt: Date | null;
  totalAmount: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  paymentType: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  depositPaidAt: Date | null;
  stripePiId: string | null;
  createdAt: Date | null;
}

interface TyreRef {
  quantity: number;
  brand: string | null;
  pattern: string | null;
}

interface SerialisedJob {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  lat: string | null;
  lng: string | null;
  tyreSizeDisplay: string | null;
  quantity: string | null;
  customerName: string;
  customerPhone: string | null;
  scheduledAt: string | null;
  acceptedAt: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  totalAmount: string | null;
  createdAt: string | null;
  payment: PaymentSummary;
  tyres: TyreRef[];
}

export async function GET(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);

    const activeRows = (await db
      .select(JOB_LIST_SELECTION)
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          inArray(bookings.status, [...OPERATIONAL_STATUSES]),
        ),
      )
      .orderBy(desc(bookings.createdAt))) as RawJobRow[];

    const upcomingRows = (await db
      .select(JOB_LIST_SELECTION)
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          inArray(bookings.status, [...UPCOMING_STATUSES]),
        ),
      )
      .orderBy(bookings.assignedAt)) as RawJobRow[];

    const completedRows = (await db
      .select(JOB_LIST_SELECTION)
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driverId),
          eq(bookings.status, 'completed'),
        ),
      )
      .orderBy(desc(bookings.completedAt))
      .limit(50)) as RawJobRow[];

    const idsNeedingTyres = [...activeRows, ...upcomingRows].map((j) => j.id);
    const tyreMap = await fetchTyreMap(idsNeedingTyres);

    const active = activeRows.map((row) => serialiseJob(row, tyreMap.get(row.id) ?? []));
    const upcoming = upcomingRows.map((row) => serialiseJob(row, tyreMap.get(row.id) ?? []));
    const completed = completedRows.map((row) => serialiseJob(row, []));

    return NextResponse.json({ active, upcoming, completed });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }
}

async function fetchTyreMap(bookingIds: string[]): Promise<Map<string, TyreRef[]>> {
  const map = new Map<string, TyreRef[]>();
  if (bookingIds.length === 0) return map;

  const rows = await db
    .select({
      bookingId: bookingTyres.bookingId,
      quantity: bookingTyres.quantity,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(inArray(bookingTyres.bookingId, bookingIds));

  for (const row of rows) {
    if (row.bookingId == null) continue;
    const list = map.get(row.bookingId) ?? [];
    list.push({ quantity: row.quantity, brand: row.brand, pattern: row.pattern });
    map.set(row.bookingId, list);
  }
  return map;
}

function serialiseJob(row: RawJobRow, tyres: TyreRef[]): SerialisedJob {
  const payment = computeDriverPaymentSummary({
    paymentType: row.paymentType,
    totalAmount: row.totalAmount,
    subtotal: row.subtotal,
    vatAmount: row.vatAmount,
    depositAmountPence: row.depositAmountPence,
    remainingBalancePence: row.remainingBalancePence,
    depositPaidAt: row.depositPaidAt,
    stripePiId: row.stripePiId,
  });

  return {
    id: row.id,
    refNumber: row.refNumber,
    status: row.status,
    bookingType: row.bookingType,
    serviceType: row.serviceType,
    addressLine: row.addressLine,
    lat: row.lat?.toString() ?? null,
    lng: row.lng?.toString() ?? null,
    tyreSizeDisplay: row.tyreSizeDisplay,
    quantity: row.quantity != null ? row.quantity.toString() : null,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    totalAmount: row.totalAmount?.toString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    payment,
    tyres,
  };
}
