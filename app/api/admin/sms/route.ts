import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sendVoodooSms, normalizeUkPhoneNumber } from '@/lib/voodoo-sms';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const { to, message } = await request.json();

    if (!to || typeof to !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    if (message.length > 1600) {
      return NextResponse.json({ error: 'Message too long (max 1600 chars)' }, { status: 400 });
    }

    const normalized = normalizeUkPhoneNumber(to);
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid UK phone number' }, { status: 400 });
    }

    const result = await sendVoodooSms({ to, message: message.trim() });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Failed to send SMS' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      messageId: result.providerMessageId || null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('SMS send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
