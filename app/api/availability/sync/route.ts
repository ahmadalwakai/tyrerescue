import { NextResponse } from 'next/server';
import { syncAvailabilitySlots } from '@/lib/availability-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: Request): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, message: 'Availability sync is not configured.' };
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }

  return { ok: true };
}

async function handleSync(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const result = await syncAvailabilitySlots({ daysAhead: 14, slotMinutes: 60 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error('[availability/sync] failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to sync availability.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleSync(request);
}

export async function GET(request: Request) {
  return handleSync(request);
}
