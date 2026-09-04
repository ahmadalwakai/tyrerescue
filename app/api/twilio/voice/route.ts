import 'server-only';
import { createCallSession } from '@/lib/ai-receptionist/session';
import { twimlGather, twimlSay, twimlXmlResponse } from '@/lib/ai-receptionist/twiml';

export const runtime = 'nodejs';

const GREETING =
  "Welcome to Tyre Rescue, the UK's emergency mobile tyre fitting service. "
  + "I'm your AI assistant. I'll take a few quick details to get an engineer to you fast. "
  + "Are you calling about an emergency flat tyre or breakdown, or do you have a general enquiry?";

const HINTS = 'emergency, flat tyre, puncture, blowout, slow puncture, enquiry, booking, price, quote, yes, no';

function webhookBaseUrl(): string {
  return (process.env.TWILIO_WEBHOOK_URL ?? 'https://www.tyrerescue.uk').replace(/\/$/, '');
}

async function verifyTwilioSignature(request: Request, rawBody: string): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true; // Skip in dev if not set

  try {
    const { validateRequest } = await import('twilio');
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const url = webhookBaseUrl() + new URL(request.url).pathname;
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    return validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (process.env.NODE_ENV === 'production') {
    const valid = await verifyTwilioSignature(request, rawBody);
    if (!valid) return new Response('Forbidden', { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const callSid = params.get('CallSid') ?? '';
  const callerNumber = params.get('From') ?? 'unknown';

  if (!callSid) return new Response('Bad Request', { status: 400 });

  await createCallSession(callSid, callerNumber);

  const actionUrl = `${webhookBaseUrl()}/api/twilio/voice/gather?step=0&callSid=${encodeURIComponent(callSid)}`;

  return twimlXmlResponse(
    twimlGather({ text: GREETING, actionUrl, hints: HINTS, timeout: 10 }),
  );
}
