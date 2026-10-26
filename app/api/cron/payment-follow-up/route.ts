import { NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth';
import { runPaymentFollowUp } from '@/lib/payments/payment-follow-up';

/** Vercel Cron, every 7 minutes: remind staff about bookings still awaiting payment. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPaymentFollowUp();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Payment follow-up cron failed:', error);
    return NextResponse.json({ ok: false, error: 'Payment follow-up failed' }, { status: 500 });
  }
}
