import { NextResponse } from 'next/server';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { db, users, drivers, bookings, notifications, bookingMessages, driverNotifications, chatSessions } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Props) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const { id } = await params;

  const [driver] = await db
    .select({
      id: drivers.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
      createdAt: drivers.createdAt,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .where(eq(drivers.id, id))
    .limit(1);

  if (!driver) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const [stats] = await db
    .select({
      totalJobs: sql<number>`count(*)::int`,
      completedJobs: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
      activeJobs: sql<number>`count(*) filter (where ${bookings.status} not in ('completed', 'cancelled', 'refunded', 'refunded_partial', 'draft'))::int`,
    })
    .from(bookings)
    .where(eq(bookings.driverId, id));

  return NextResponse.json({
    ...driver,
    currentLat: driver.currentLat?.toString() ?? null,
    currentLng: driver.currentLng?.toString() ?? null,
    locationAt: driver.locationAt?.toISOString() ?? null,
    createdAt: driver.createdAt?.toISOString() ?? null,
    totalJobs: Number(stats?.totalJobs || 0),
    completedJobs: Number(stats?.completedJobs || 0),
    activeJobs: Number(stats?.activeJobs || 0),
  });
}

export async function PUT(request: Request, { params }: Props) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const body = await request.json();

  const [driver] = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(eq(drivers.id, id)).limit(1);
  if (!driver || !driver.userId) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const userUpdates: Record<string, unknown> = {};
  if (body.name !== undefined) userUpdates.name = String(body.name).trim();
  if (body.email !== undefined) {
    const email = String(body.email).toLowerCase().trim();
    if (!email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), sql`${users.id} != ${driver.userId}`))
      .limit(1);
    if (dup) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }
    userUpdates.email = email;
  }
  if (body.phone !== undefined) userUpdates.phone = body.phone ? String(body.phone).trim() : null;

  if (Object.keys(userUpdates).length > 0) {
    userUpdates.updatedAt = new Date();
    await db.update(users).set(userUpdates).where(eq(users.id, driver.userId));
  }

  const driverUpdates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!['offline', 'available', 'en_route', 'arrived', 'in_progress'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    driverUpdates.status = status;
    driverUpdates.isOnline = status !== 'offline';
  }

  if (Object.keys(driverUpdates).length > 0) {
    await db.update(drivers).set(driverUpdates).where(eq(drivers.id, id));
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Props) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const [driver] = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(eq(drivers.id, id)).limit(1);

  if (!driver || !driver.userId) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const [active] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.driverId, id), notInArray(bookings.status, ['completed', 'cancelled', 'refunded', 'refunded_partial', 'draft'])));

  if (Number(active?.count || 0) > 0) {
    return NextResponse.json({ error: 'Cannot delete driver with active bookings' }, { status: 409 });
  }

  await db.update(bookings).set({ driverId: null }).where(eq(bookings.driverId, id));
  await db.delete(notifications).where(eq(notifications.userId, driver.userId));
  await db.delete(driverNotifications).where(eq(driverNotifications.driverId, id));
  await db.delete(bookingMessages).where(eq(bookingMessages.senderId, driver.userId));
  await db.delete(chatSessions).where(eq(chatSessions.userId, driver.userId));
  await db.delete(users).where(eq(users.id, driver.userId));

  return NextResponse.json({ success: true });
}
