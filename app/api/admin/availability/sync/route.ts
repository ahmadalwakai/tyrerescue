import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncAvailabilitySlots } from '@/lib/availability-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncAvailabilitySlots({ daysAhead: 14, slotMinutes: 60 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('[admin/availability/sync] failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to sync availability.' },
      { status: 500 },
    );
  }
}
