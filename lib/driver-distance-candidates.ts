import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { drivers } from '@/lib/db/schema';

export interface DriverDistanceCandidate {
  id: string;
  lat: number;
  lng: number;
}

interface RawDriverLocation {
  id: string;
  currentLat: string | null;
  currentLng: string | null;
  locationSource: string | null;
}

export function normalizeDriverDistanceCandidates(
  rows: RawDriverLocation[],
): DriverDistanceCandidate[] {
  return rows
    .filter((row) => row.currentLat != null && row.currentLng != null)
    .map((row) => ({
      id: row.id,
      lat: Number(row.currentLat),
      lng: Number(row.currentLng),
      isMobile: row.locationSource === 'mobile_app',
    }))
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
    .sort((a, b) => (a.isMobile === b.isMobile ? 0 : a.isMobile ? -1 : 1))
    .map(({ id, lat, lng }) => ({ id, lat, lng }));
}

export async function loadAvailableDriverDistanceCandidates(): Promise<
  DriverDistanceCandidate[]
> {
  const rows = await db
    .select({
      id: drivers.id,
      currentLat: drivers.currentLat,
      currentLng: drivers.currentLng,
      locationSource: drivers.locationSource,
    })
    .from(drivers)
    .where(and(eq(drivers.isOnline, true), eq(drivers.status, 'available')));

  return normalizeDriverDistanceCandidates(rows);
}
