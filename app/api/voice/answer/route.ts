import { NextResponse } from 'next/server';
import crypto from 'crypto';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.tyrerescue.uk';

function validateTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join('');
  const expected = crypto.createHmac('sha1', authToken).update(url + paramString).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function twiml(inner: string): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[voice/answer] TWILIO_AUTH_TOKEN not configured');
    return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 });
  }

  const formData = await request.formData();
  const params = Object.fromEntries(
    Array.from(formData as unknown as Iterable<[string, FormDataEntryValue]>).map(([k, v]) => [k, String(v)])
  );

  const url = `${BASE_URL}/api/voice/answer`;
  const signature = request.headers.get('x-twilio-signature');

  if (!validateTwilioSignature(authToken, signature, url, params)) {
    console.error('[voice/answer] Invalid Twilio signature');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transcribeUrl = `${BASE_URL}/api/voice/transcribe`;

  return twiml(`
    <Say voice="Polly.Amy">
      Hello! You have reached Tyre Rescue, your emergency mobile tyre fitting service.
      Please leave your name, your location or postcode, and describe your tyre issue after the beep.
      We will call you back as soon as possible. Please speak clearly after the tone.
    </Say>
    <Record
      maxLength="120"
      transcribe="false"
      action="${transcribeUrl}"
      method="POST"
      playBeep="true"
      timeout="5"
    />
    <Say voice="Polly.Amy">
      We did not receive your message. Please try calling again. Goodbye.
    </Say>
  `);
}
