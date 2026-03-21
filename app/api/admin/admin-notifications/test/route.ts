// app/api/admin/admin-notifications/test/route.ts

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminNotification } from '@/lib/notifications';

export async function POST() {
  try {
    await requireAdmin();

    const result = await createAdminNotification({
      type: 'booking.created',
      title: '🧪 Test Push Notification',
      body: 'This is a test notification to verify Web Push is working.',
      entityType: 'booking',
      entityId: 'test-' + Date.now(),
      severity: 'warning',
      link: '/admin',
      createdBy: 'system',
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create test notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[Test Push] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send test' },
      { status: 500 }
    );
  }
}
