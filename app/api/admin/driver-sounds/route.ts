import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { driverSoundSettings, driverSoundAssets, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/** Bundled sound files shipped with the driver app (always available). */
const BUNDLED_SOUNDS = [
  {
    file: 'unvversfiled_ringtone_021_365652.mp3',
    label: 'Unvversfiled Ringtone 021 365652',
    description: 'Default critical notification tone',
    bundled: true,
  },
];

/** All configurable event types in the driver app. */
const VALID_EVENTS = [
  'new_job',
  'reassignment',
  'upcoming_v2',
  'job_accepted',
  'job_completed',
  'new_message',
] as const;

/** Critical events that cannot be disabled. */
const CRITICAL_EVENTS = new Set<string>(['new_job', 'reassignment', 'upcoming_v2']);

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch current settings
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

  // Fetch uploaded sound assets
  const assets = await db
    .select({
      id: driverSoundAssets.id,
      fileName: driverSoundAssets.fileName,
      displayName: driverSoundAssets.displayName,
      fileUrl: driverSoundAssets.fileUrl,
      mimeType: driverSoundAssets.mimeType,
      fileSize: driverSoundAssets.fileSize,
      createdAt: driverSoundAssets.createdAt,
    })
    .from(driverSoundAssets);

  // Build sound library: bundled + uploaded
  const library = [
    ...BUNDLED_SOUNDS,
    ...assets.map((a) => ({
      file: a.fileName,
      label: a.displayName,
      description: `Uploaded sound (${a.mimeType})`,
      bundled: false,
      id: a.id,
      url: a.fileUrl,
    })),
  ];

  return NextResponse.json({
    settings: rows,
    library,
    events: VALID_EVENTS,
    criticalEvents: [...CRITICAL_EVENTS],
  });
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
    // Critical events cannot be disabled
    if (CRITICAL_EVENTS.has(event) && !enabled) {
      return NextResponse.json(
        { error: `Cannot disable critical event: ${event}` },
        { status: 400 },
      );
    }
    updates.enabled = enabled;
  }
  if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
    // Critical events must have audible volume
    if (CRITICAL_EVENTS.has(event) && volume < 0.3) {
      updates.volume = 0.3;
    } else {
      updates.volume = volume;
    }
  }
  if (typeof vibrationEnabled === 'boolean') {
    updates.vibrationEnabled = vibrationEnabled;
  }

  // Upsert: create if no row for this event, update otherwise
  const [existing] = await db
    .select({ id: driverSoundSettings.id })
    .from(driverSoundSettings)
    .where(eq(driverSoundSettings.event, event))
    .limit(1);

  if (existing) {
    await db
      .update(driverSoundSettings)
      .set(updates)
      .where(eq(driverSoundSettings.event, event));
  } else {
    await db.insert(driverSoundSettings).values({
      event,
      soundFile: (updates.soundFile as string) ?? 'unvversfiled_ringtone_021_365652.mp3',
      enabled: (updates.enabled as boolean) ?? true,
      volume: (updates.volume as number) ?? 1.0,
      vibrationEnabled: (updates.vibrationEnabled as boolean) ?? true,
      updatedBy: session.user.id,
    });
  }

  return NextResponse.json({ success: true });
}
