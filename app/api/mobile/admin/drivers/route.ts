import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db, users, drivers } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });

  const conditions = [];
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(ilike(users.name, term), ilike(users.email, term), ilike(users.phone, term)));
  }
  if (status && status !== 'all') {
    conditions.push(eq(drivers.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows] = await Promise.all([
    db
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
      .where(whereClause)
      .orderBy(desc(drivers.createdAt))
      .limit(perPage)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .where(whereClause),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);

  return NextResponse.json({
    items: rows.map((driver) => ({
      ...driver,
      currentLat: driver.currentLat?.toString() ?? null,
      currentLng: driver.currentLng?.toString() ?? null,
      locationAt: driver.locationAt?.toISOString() ?? null,
      createdAt: driver.createdAt?.toISOString() ?? null,
    })),
    page,
    perPage,
    totalCount,
    totalPages: Math.ceil(totalCount / perPage),
  });
}

export async function POST(request: Request) {
  const admin = await getMobileAdminUser(request);
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').toLowerCase().trim();
  const phone = String(body?.phone || '').trim();
  const password = String(body?.password || '');

  if (!name || !email || !phone || password.length < 8) {
    return NextResponse.json({ error: 'Name, email, phone, and password (8+ chars) are required' }, { status: 400 });
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({
      name,
      email,
      phone,
      role: 'driver',
      emailVerified: true,
      passwordHash,
    })
    .returning({ id: users.id, name: users.name, email: users.email });

  const [newDriver] = await db
    .insert(drivers)
    .values({
      userId: newUser.id,
      createdBy: admin.id,
      isOnline: false,
      status: 'offline',
    })
    .returning({ id: drivers.id });

  return NextResponse.json({
    success: true,
    driver: {
      id: newDriver.id,
      userId: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
  });
}
