import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { siteVisitors } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, ageGroup, gender, interests } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      consentGiven: true,
      updatedAt: new Date(),
    };

    if (ageGroup && typeof ageGroup === 'string') {
      updates.ageGroup = ageGroup.slice(0, 10);
    }
    if (gender && typeof gender === 'string') {
      updates.gender = gender.slice(0, 20);
    }
    if (Array.isArray(interests)) {
      updates.interests = interests.slice(0, 10).map((i: unknown) => String(i).slice(0, 50));
    }

    await db
      .update(siteVisitors)
      .set(updates)
      .where(eq(siteVisitors.sessionId, sessionId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
