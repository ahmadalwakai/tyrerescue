import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, drivers, users } from '@/lib/db';
import { getProjectSourceForRequest } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const source = getProjectSourceForRequest(request);
  if (source instanceof NextResponse) return source;

  const url = new URL(request.url);
  const onlyAvailable = url.searchParams.get('available') === '1';

  const rows = await db
    .select({
      id: drivers.id,
      name: users.name,
      phone: users.phone,
      isOnline: drivers.isOnline,
      status: drivers.status,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationAt: drivers.locationAt,
      pushToken: drivers.pushToken,
      pushTokenPlatform: drivers.pushTokenPlatform,
      appVersion: drivers.appVersion,
    })
    .from(drivers)
    .innerJoin(users, eq(drivers.userId, users.id))
    .orderBy(desc(drivers.isOnline), desc(drivers.createdAt));

  const items = rows
    .filter((driver) =>
      onlyAvailable
        ? driver.isOnline &&
          driver.status !== 'offline' &&
          Boolean(driver.pushToken) &&
          driver.currentLat != null &&
          driver.currentLng != null
        : true,
    )
    .map((driver) => ({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      isOnline: Boolean(driver.isOnline),
      status: driver.status,
      currentLat: driver.currentLat?.toString() ?? null,
      currentLng: driver.currentLng?.toString() ?? null,
      locationAt: driver.locationAt?.toISOString() ?? null,
      hasPushToken: Boolean(driver.pushToken),
      pushTokenPlatform: driver.pushTokenPlatform,
      appVersion: driver.appVersion,
      canReceiveJobs: Boolean(driver.pushToken),
      hasLiveGps: driver.currentLat != null && driver.currentLng != null,
    }));

  return NextResponse.json({
    sourceApp: source.app,
    sourceLabel: source.label,
    items,
  });
}
