import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { driverSoundSettings, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/** Available sound files shipped with the driver app.
 *  To add a new sound: drop the .wav file in driver-app/assets/sounds/,
 *  add it to app.json notifications.sounds array, add a require() in
 *  driver-app/src/services/sound.ts AVAILABLE_SOUNDS, and add an entry here. */
const SOUND_LIBRARY = [
  { file: 'new_job.wav', label: 'Urgent Alert', description: 'Default urgent notification tone' },
];

const VALID_EVENTS = ['new_job', 'job_accepted', 'job_completed', 'new_message'] as const;

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: driverSoundSettings.id,
      event: driverSoundSettings.event,
      soundFile: driverSoundSettings.soundFile,
      enabled: driverSoundSettings.enabled,
      volume: driverSoundSettings.volume,
      vibrationEnabled: driverSoundSettings.vibrationEnabled,
      updatedAt: driverSoundSettings.updatedAt,
      updatedByName: users.name,
    })
    .from(driverSoundSettings)
    .leftJoin(users, eq(driverSoundSettings.updatedBy, users.id));

  return NextResponse.json({ settings: rows, library: SOUND_LIBRARY });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { event, soundFile, enabled, volume, vibrationEnabled } = body;

  if (!event || !VALID_EVENTS.includes(event)) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedBy: session.user.id,
    updatedAt: new Date(),
  };

  if (typeof soundFile === 'string' && soundFile.length > 0 && soundFile.length <= 100) {
    updates.soundFile = soundFile;
  }
  if (typeof enabled === 'boolean') {
    updates.enabled = enabled;
  }
  if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
    updates.volume = volume;
  }
  if (typeof vibrationEnabled === 'boolean') {
    updates.vibrationEnabled = vibrationEnabled;
  }

  await db
    .update(driverSoundSettings)
    .set(updates)
    .where(eq(driverSoundSettings.event, event));

  return NextResponse.json({ success: true });
}
