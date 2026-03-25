import { NextRequest, NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, drivers } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { driverId } = await requireDriverMobile(request);
    const body = await request.json();
    const { pushToken, platform, tokenType } = body;

    if (!pushToken || typeof pushToken !== 'string') {
      return NextResponse.json({ error: 'pushToken is required' }, { status: 400 });
    }

    const validPlatforms = ['android', 'ios'];
    const safePlatform = validPlatforms.includes(platform) ? platform : 'android';

    // tokenType indicates 'fcm' (native device token) or 'expo' (Expo Push token).
    // Stored alongside the token so the backend can route delivery correctly.
    const safeTokenType = tokenType === 'fcm' ? 'fcm' : 'expo';

    await db
      .update(drivers)
      .set({
        pushToken,
        pushTokenPlatform: `${safePlatform}:${safeTokenType}`,
      })
      .where(eq(drivers.id, driverId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { driverId } = await requireDriverMobile(request);

    await db
      .update(drivers)
      .set({
        pushToken: null,
        pushTokenPlatform: null,
      })
      .where(eq(drivers.id, driverId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
