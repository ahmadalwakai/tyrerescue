import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    assistantId: process.env.VAPI_ASSISTANT_ID ?? null,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID ?? null,
    webhookUrl: process.env.VAPI_WEBHOOK_URL ?? 'https://www.tyrerescue.uk/api/vapi/webhook',
  });
}
