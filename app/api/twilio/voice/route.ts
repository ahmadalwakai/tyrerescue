import 'server-only';
import { createCallSession } from '@/lib/ai-receptionist/session';
import { twimlGather, twimlSay, twimlXmlResponse } from '@/lib/ai-receptionist/twiml';
import { isValidTwilioRequest, twilioWebhookBaseUrl } from '@/lib/ai-receptionist/twilio-signature';

export const runtime = 'nodejs';

const GREETING =
  "Welcome to Tyre Rescue, the UK's emergency mobile tyre fitting service. "
  + "I'm your AI assistant. I'll take a few quick details to get an engineer to you fast. "
  + "Are you calling about an emergency flat tyre or breakdown, or do you have a general enquiry?";

const HINTS = 'emergency, flat tyre, puncture, blowout, slow puncture, enquiry, booking, price, quote, yes, no';

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!(await isValidTwilioRequest(request, rawBody))) {
    return new Response('Forbidden', { status: 403 });
  }

  const params = new URLSearchParams(rawBody);
  const callSid = params.get('CallSid') ?? '';
  const callerNumber = params.get('From') ?? 'unknown';

  if (!callSid) return new Response('Bad Request', { status: 400 });

  await createCallSession(callSid, callerNumber);

  const actionUrl = `${twilioWebhookBaseUrl()}/api/twilio/voice/gather?step=0&callSid=${encodeURIComponent(callSid)}`;

  return twimlXmlResponse(
    twimlGather({ text: GREETING, actionUrl, hints: HINTS, timeout: 10 }),
  );
}
