import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
  locationAddress: z.string().optional(),
  locationPostcode: z.string().optional(),
  distanceKm: z.number().optional(),
  basePrice: z.number().optional(),
  surchargePercent: z.number().optional(),
  totalPrice: z.number().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  bookingId: z.string().uuid().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [booking] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ booking });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (data.locationLat != null) updateData.locationLat = String(data.locationLat);
  if (data.locationLng != null) updateData.locationLng = String(data.locationLng);
  if (data.locationAddress != null) updateData.locationAddress = data.locationAddress;
  if (data.locationPostcode != null) updateData.locationPostcode = data.locationPostcode;
  if (data.distanceKm != null) updateData.distanceKm = String(data.distanceKm);
  if (data.basePrice != null) updateData.basePrice = String(data.basePrice);
  if (data.surchargePercent != null) updateData.surchargePercent = String(data.surchargePercent);
  if (data.totalPrice != null) updateData.totalPrice = String(data.totalPrice);
  if (data.status) updateData.status = data.status;
  if (data.notes != null) updateData.notes = data.notes;
  if (data.bookingId) updateData.bookingId = data.bookingId;

  await db.update(quickBookings).set(updateData).where(eq(quickBookings.id, id));

  const [updated] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  return NextResponse.json({ booking: updated });
}
