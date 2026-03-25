import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { driverSoundAssets, driverSoundSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { del } from '@vercel/blob';

interface Props {
  params: Promise<{ id: string }>;
}

/** PATCH — rename/update display name */
export async function PATCH(request: Request, { params }: Props) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { displayName } = body;

  if (!displayName || typeof displayName !== 'string' || displayName.trim().length === 0) {
    return NextResponse.json({ error: 'displayName is required' }, { status: 400 });
  }

  await db
    .update(driverSoundAssets)
    .set({ displayName: displayName.trim().substring(0, 100) })
    .where(eq(driverSoundAssets.id, id));

  return NextResponse.json({ success: true });
}

/** DELETE — remove a sound asset (with safety check for critical events) */
export async function DELETE(request: Request, { params }: Props) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Find the asset
  const [asset] = await db
    .select()
    .from(driverSoundAssets)
    .where(eq(driverSoundAssets.id, id))
    .limit(1);

  if (!asset) {
    return NextResponse.json({ error: 'Sound not found' }, { status: 404 });
  }

  // Safety: if any critical event is using this sound, reset it to default
  const criticalEvents = ['new_job', 'reassignment', 'upcoming_v2'];
  const usages = await db
    .select({ event: driverSoundSettings.event })
    .from(driverSoundSettings)
    .where(eq(driverSoundSettings.soundFile, asset.fileName));

  for (const usage of usages) {
    if (criticalEvents.includes(usage.event)) {
      // Reset to bundled default
      await db
        .update(driverSoundSettings)
        .set({ soundFile: 'new_job.wav', updatedBy: session.user.id, updatedAt: new Date() })
        .where(eq(driverSoundSettings.event, usage.event));
    }
  }

  // Delete from blob storage
  try {
    await del(asset.fileUrl);
  } catch {
    // Non-fatal — blob may already be gone
  }

  // Delete from DB
  await db.delete(driverSoundAssets).where(eq(driverSoundAssets.id, id));

  return NextResponse.json({ success: true });
}
