import { NextResponse } from 'next/server';
import { after } from 'next/server';
import crypto from 'crypto';
import Groq from 'groq-sdk';
import { db, virtualLandlineInteractions, adminNotifications, users } from '@/lib/db';
import { normalizeUkPhoneForMatching } from '@/lib/contact-normalization';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.tyrerescue.uk';

interface AiExtracted {
  name: string | null;
  postcode: string | null;
  tyreIssue: string | null;
  tyreSize: string | null;
  quantity: number | null;
}

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

async function transcribeWithGroq(audioUrl: string, accountSid: string, authToken: string): Promise<string> {
  const response = await fetch(`${audioUrl}.wav`, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download recording: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioFile = new File([audioBuffer], 'recording.wav', { type: 'audio/wav' });

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 30_000 });
  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3',
    language: 'en',
  });

  return transcription.text.trim();
}

async function extractBookingInfo(transcript: string): Promise<AiExtracted> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 15_000 });

  const schema = {
    name: 'string or null - customer first or full name',
    postcode: 'string or null - UK postcode or area/town',
    tyreIssue: 'string or null - brief description of the tyre problem',
    tyreSize: 'string or null - tyre size like 205/55R16',
    quantity: 'number or null - number of tyres needed',
  };

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system',
        content: `You are an assistant for Tyre Rescue, a UK emergency mobile tyre fitting service.
Extract information from this voicemail transcript. Return ONLY valid JSON with these fields:
${JSON.stringify(schema, null, 2)}

Rules:
- name: customer's name if mentioned, otherwise null
- postcode: UK postcode (e.g. "EH1 1AA") or town name if mentioned, otherwise null
- tyreIssue: brief problem description (flat tyre, blowout, puncture, etc.), otherwise null
- tyreSize: tyre size if mentioned (e.g. "205/55R16"), otherwise null
- quantity: number of tyres if mentioned, otherwise null
Return ONLY the JSON object, no explanation.`,
      },
      {
        role: 'user',
        content: `Voicemail transcript: "${transcript}"`,
      },
    ],
    temperature: 0.1,
    max_tokens: 300,
  });

  const text = completion.choices[0]?.message?.content ?? '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean) as AiExtracted;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : null,
      postcode: typeof parsed.postcode === 'string' ? parsed.postcode : null,
      tyreIssue: typeof parsed.tyreIssue === 'string' ? parsed.tyreIssue : null,
      tyreSize: typeof parsed.tyreSize === 'string' ? parsed.tyreSize : null,
      quantity: typeof parsed.quantity === 'number' ? parsed.quantity : null,
    };
  } catch {
    return { name: null, postcode: null, tyreIssue: null, tyreSize: null, quantity: null };
  }
}

async function findMatchedUser(normalizedPhone: string | null): Promise<string | null> {
  if (!normalizedPhone) return null;

  const rows = await db
    .select({ id: users.id, phone: users.phone })
    .from(users);

  for (const row of rows) {
    const n = row.phone ? normalizeUkPhoneForMatching(row.phone) : null;
    if (n && n === normalizedPhone) return row.id;
  }
  return null;
}

async function processAiCall(params: {
  callSid: string;
  recordingUrl: string;
  from: string;
  to: string;
  duration: string;
  accountSid: string;
  authToken: string;
}): Promise<void> {
  const { callSid, recordingUrl, from, to, duration, accountSid, authToken } = params;

  let transcript = '';
  let extracted: AiExtracted = { name: null, postcode: null, tyreIssue: null, tyreSize: null, quantity: null };

  try {
    transcript = await transcribeWithGroq(recordingUrl, accountSid, authToken);
    console.log('[voice/transcribe] Transcript:', transcript);
  } catch (err) {
    console.error('[voice/transcribe] Transcription failed:', err);
  }

  if (transcript) {
    try {
      extracted = await extractBookingInfo(transcript);
      console.log('[voice/transcribe] Extracted:', extracted);
    } catch (err) {
      console.error('[voice/transcribe] Extraction failed:', err);
    }
  }

  const callerNormalized = normalizeUkPhoneForMatching(from);
  const matchedUserId = await findMatchedUser(callerNormalized);

  const startedAt = new Date();
  const durationSeconds = duration ? parseInt(duration, 10) : null;
  const endedAt = durationSeconds != null ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  const rawRow = {
    callSid,
    transcript: transcript || null,
    aiExtracted: extracted,
    source: 'ai_answer',
  };

  const [inserted] = await db
    .insert(virtualLandlineInteractions)
    .values({
      provider: 'twilio',
      source: 'ai_answer',
      importKey: `twilio-${callSid}`,
      providerCallId: callSid,
      direction: 'incoming',
      callStatus: 'completed',
      callerNumberRaw: from,
      destinationNumberRaw: to,
      callerNumberNormalized: callerNormalized,
      destinationNumberNormalized: null,
      customerPhoneNormalized: callerNormalized,
      startedAt,
      endedAt,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      recordingUrl,
      sourceFileName: null,
      sourceRowNumber: 0,
      rawRow,
      matchedUserId,
      importedBy: null,
    })
    .onConflictDoNothing({ target: virtualLandlineInteractions.importKey })
    .returning({ id: virtualLandlineInteractions.id });

  if (!inserted) {
    console.log('[voice/transcribe] Duplicate callSid skipped:', callSid);
    return;
  }

  await db.insert(adminNotifications).values({
    type: 'virtual_landline',
    entityType: 'virtual_landline',
    entityId: inserted.id,
    title: `AI Call: ${extracted.name || formatPhone(from)}`,
    body: extracted.tyreIssue
      ? `${extracted.tyreIssue}${extracted.postcode ? ` near ${extracted.postcode}` : ''}`
      : transcript.slice(0, 120) || 'New voicemail received',
    isRead: false,
  });

  await sendAdminExpoPush({
    title: `AI Call: ${extracted.name || formatPhone(from)}`,
    body: extracted.tyreIssue
      ? `${extracted.tyreIssue}${extracted.postcode ? ` near ${extracted.postcode}` : ''}`
      : transcript.slice(0, 80) || 'New voicemail received',
    data: { type: 'virtual_landline_ai', interactionId: inserted.id },
    channelId: 'admin_bookings',
  });
}

function formatPhone(raw: string): string {
  if (!raw) return 'Unknown';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 11) return `+${digits}`;
  return raw;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  if (!authToken || !accountSid) {
    console.error('[voice/transcribe] Twilio credentials not configured');
    return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 });
  }

  const formData = await request.formData();
  const params = Object.fromEntries(
    Array.from(formData as unknown as Iterable<[string, FormDataEntryValue]>).map(([k, v]) => [k, String(v)])
  );

  const url = `${BASE_URL}/api/voice/transcribe`;
  const signature = request.headers.get('x-twilio-signature');

  if (!validateTwilioSignature(authToken, signature, url, params)) {
    console.error('[voice/transcribe] Invalid Twilio signature');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('[voice/transcribe] GROQ_API_KEY not configured');
    return twiml(`<Say voice="Polly.Amy">Thank you for calling Tyre Rescue. We will call you back shortly. Goodbye.</Say>`);
  }

  const callSid = params['CallSid'] ?? '';
  const recordingUrl = params['RecordingUrl'] ?? '';
  const from = params['From'] ?? '';
  const to = params['To'] ?? '';
  const duration = params['RecordingDuration'] ?? params['Duration'] ?? '0';

  after(async () => {
    try {
      await processAiCall({ callSid, recordingUrl, from, to, duration, accountSid, authToken });
    } catch (err) {
      console.error('[voice/transcribe] processAiCall failed:', err);
    }
  });

  const callerDisplay = formatPhone(from);
  return twiml(`
    <Say voice="Polly.Amy">
      Thank you for contacting Tyre Rescue. We have received your message and our team will call you back very shortly. Goodbye!
    </Say>
  `);
}
