import { NextRequest, NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';

// These values should be updated when releasing new APK versions
const LATEST_VERSION = '1.0.0';
const MIN_VERSION = '1.0.0';
const DOWNLOAD_URL = 'https://tyrerescue.uk/driver-app';
const RELEASE_NOTES = 'Initial release with background location tracking and push notifications.';

export async function GET(request: NextRequest) {
  try {
    const { driverId } = await requireDriverMobile(request);

    const url = new URL(request.url);
    const version = url.searchParams.get('version') || '0.0.0';
    const platform = url.searchParams.get('platform') || 'android';

    // Store the app version for analytics
    await db
      .update(drivers)
      .set({ appVersion: version })
      .where(eq(drivers.id, driverId));

    const forceUpdate = compareVersions(version, MIN_VERSION) < 0;

    return NextResponse.json({
      currentVersion: version,
      minVersion: MIN_VERSION,
      latestVersion: LATEST_VERSION,
      forceUpdate,
      downloadUrl: DOWNLOAD_URL,
      releaseNotes: RELEASE_NOTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}
