import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { availabilitySlots } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  maxBookings: z.number().int().min(1).default(1),
});

const updateSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.insert(availabilitySlots).values({
    date: parsed.data.date,
    timeStart: parsed.data.timeStart,
    timeEnd: parsed.data.timeEnd,
    maxBookings: parsed.data.maxBookings,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.update(availabilitySlots).set({ active: parsed.data.active }).where(eq(availabilitySlots.id, parsed.data.id));

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await db.delete(availabilitySlots).where(eq(availabilitySlots.id, parsed.data.id));

  return NextResponse.json({ success: true });
}
