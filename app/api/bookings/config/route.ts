import { NextResponse } from 'next/server';
import { GARAGE_ADDRESS, GARAGE_LOCATION } from '@/lib/garage';

/** Public customer-facing workshop details; never return server configuration. */
export async function GET() {
  return NextResponse.json({ workshop: { address: GARAGE_ADDRESS, lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng } }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
