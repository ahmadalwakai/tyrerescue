import { NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, driverSoundSettings } from '@/lib/db';

export async function GET(request: Request) {
  try {
    await requireDriverMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      event: driverSoundSettings.event,
      soundFile: driverSoundSettings.soundFile,
      enabled: driverSoundSettings.enabled,
      volume: driverSoundSettings.volume,
      vibrationEnabled: driverSoundSettings.vibrationEnabled,
    })
    .from(driverSoundSettings);

  // Return as a map keyed by event for easy lookup
  const config: Record<string, { soundFile: string; enabled: boolean; volume: number; vibrationEnabled: boolean }> = {};
  for (const row of rows) {
    config[row.event] = {
      soundFile: row.soundFile,
      enabled: row.enabled,
      volume: row.volume,
      vibrationEnabled: row.vibrationEnabled,
    };
  }

  return NextResponse.json(config);
}
