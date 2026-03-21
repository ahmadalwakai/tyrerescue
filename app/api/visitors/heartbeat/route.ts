import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, duration } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const dur = typeof duration === 'number' ? Math.min(Math.max(0, Math.round(duration)), 86400) : 0;

    await db
      .update(siteVisitors)
      .set({
        sessionDuration: dur,
        isOnline: true,
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(siteVisitors.sessionId, sessionId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
