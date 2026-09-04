/*
Required Vapi environment variables:
VAPI_API_KEY=          — from Vapi dashboard → API Keys
VAPI_ASSISTANT_ID=     — from Vapi dashboard → Assistants → Tyre Rescue Call Agent → ID
VAPI_PHONE_NUMBER_ID=  — from Vapi dashboard → Phone Numbers → ID
VAPI_WEBHOOK_SECRET=   — set this yourself, then add to Vapi dashboard → Assistants → Server URL secret
*/

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import {
  createCallSession,
  createSessionFromVapi,
  type VapiCollectedData,
} from '@/lib/ai-receptionist/session';
import { sendUrgentBookingTopicPush } from '@/lib/notifications/urgent-booking-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VapiCall {
  id?: string;
  customer?: {
    number?: string;
  };
  startedAt?: string;
  endedAt?: string;
}

interface VapiWebhookMessage {
  type?: string;
  call?: VapiCall;
  transcript?: string;
  summary?: string;
  analysis?: {
    structuredData?: Record<string, unknown>;
  };
}

interface VapiWebhookPayload {
  message?: VapiWebhookMessage;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pickText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return null;
}

function webhookSecretMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function buildPushBody(data: Pick<VapiCollectedData, 'vehicleReg' | 'location' | 'problem'>): string {
  return [
    data.vehicleReg ?? 'Unknown reg',
    data.location ?? 'Location unknown',
    data.problem ?? 'Tyre issue',
  ].join(' · ');
}

async function handleEndOfCallReport(message: VapiWebhookMessage) {
  const call = message.call;
  const structuredData = message.analysis?.structuredData ?? {};
  const callId = text(call?.id);
  const customerNumber = text(call?.customer?.number);
  const callbackNumber = pickText(structuredData, ['callbackNumber', 'callback_phone', 'phone', 'phoneNumber']);
  const callerNumber = customerNumber ?? callbackNumber;

  if (!callId) return badRequest('Missing Vapi call id');
  if (!callerNumber) return badRequest('Missing caller number');

  const collectedData: VapiCollectedData = {
    customerName: pickText(structuredData, ['customerName', 'customer_name', 'name']),
    callbackNumber,
    vehicleReg: pickText(structuredData, ['vehicleReg', 'vehicle_reg', 'registration', 'vehicleRegistration']) ?? undefined,
    location: pickText(structuredData, ['location', 'postcode', 'postCode']) ?? undefined,
    problem: pickText(structuredData, ['problem', 'tyreIssue', 'issue', 'description']) ?? undefined,
    transcript: message.transcript ?? null,
    summary: text(message.summary),
    startedAt: call?.startedAt ?? null,
    endedAt: call?.endedAt ?? null,
    structuredData,
  };

  const result = await createSessionFromVapi(callId, callerNumber, collectedData);

  if (result.createdCallMeBack) {
    await sendUrgentBookingTopicPush({
      title: '📞 AI Call — Callback Needed',
      body: buildPushBody(collectedData),
      customerPhone: callerNumber,
      bookingId: result.callMeBackId,
    });
  }

  return NextResponse.json({
    ok: true,
    callMeBackId: result.callMeBackId,
    aiCallSessionId: result.aiCallSessionId,
    createdCallMeBack: result.createdCallMeBack,
  });
}

async function handleCallStarted(message: VapiWebhookMessage) {
  const callId = text(message.call?.id);
  const callerNumber = text(message.call?.customer?.number);

  if (callId && callerNumber) {
    await createCallSession(callId.slice(0, 64), callerNumber.slice(0, 20));
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('[vapi-webhook] VAPI_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  if (!webhookSecretMatches(request.headers.get('x-vapi-secret'), expectedSecret)) {
    return unauthorized();
  }

  let payload: VapiWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return badRequest('Invalid JSON payload');
  }

  const message = payload.message;
  const type = message?.type;

  if (!message || !type) {
    return badRequest('Missing Vapi message');
  }

  try {
    if (type === 'end-of-call-report') {
      return await handleEndOfCallReport(message);
    }

    if (type === 'call-started') {
      return await handleCallStarted(message);
    }

    if (type === 'function-call') {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: type });
  } catch (error) {
    console.error('[vapi-webhook] Failed to process webhook:', error);
    return NextResponse.json({ error: 'Failed to process Vapi webhook' }, { status: 500 });
  }
}
