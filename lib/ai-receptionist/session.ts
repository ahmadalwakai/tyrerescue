import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiCallSessions, callMeBack } from '@/lib/db/schema';
import type { CollectedData, TranscriptEntry } from './types';

export async function createCallSession(callSid: string, callerNumber: string) {
  const [row] = await db
    .insert(aiCallSessions)
    .values({ callSid, callerNumber })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function getCallSession(callSid: string) {
  const [row] = await db
    .select()
    .from(aiCallSessions)
    .where(eq(aiCallSessions.callSid, callSid))
    .limit(1);
  return row ?? null;
}

export async function updateCallSession(
  callSid: string,
  patch: {
    step?: number;
    collectedData?: CollectedData;
    transcript?: TranscriptEntry[];
    status?: string;
    callMeBackId?: string;
    retryCount?: number;
  },
) {
  await db
    .update(aiCallSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(aiCallSessions.callSid, callSid));
}

export async function completeCallSession(
  callSid: string,
  data: CollectedData,
  callerNumber: string,
): Promise<string | null> {
  try {
    const notes = [
      data.problem ? `Problem: ${data.problem}` : null,
      data.vehicleReg ? `Reg: ${data.vehicleReg}` : null,
      data.location ? `Location: ${data.location}` : null,
      `Called via AI receptionist`,
    ]
      .filter(Boolean)
      .join('\n');

    const [record] = await db
      .insert(callMeBack)
      .values({
        name: 'Caller',
        phone: callerNumber,
        notes,
        status: 'pending',
      })
      .returning({ id: callMeBack.id });

    if (record?.id) {
      await db
        .update(aiCallSessions)
        .set({ callMeBackId: record.id, status: 'completed', updatedAt: new Date() })
        .where(eq(aiCallSessions.callSid, callSid));
      return record.id;
    }
    return null;
  } catch {
    return null;
  }
}

export interface VapiCollectedData extends CollectedData {
  customerName?: string | null;
  callbackNumber?: string | null;
  transcript?: string | TranscriptEntry[] | null;
  summary?: string | null;
  startedAt?: string | Date | null;
  endedAt?: string | Date | null;
  structuredData?: Record<string, unknown> | null;
}

export interface CreateSessionFromVapiResult {
  aiCallSessionId: string;
  callMeBackId: string;
  createdCallMeBack: boolean;
}

type CreateSessionFromVapiRow = CreateSessionFromVapiResult & Record<string, unknown>;

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function trimTo(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function dateIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function transcriptFromVapi(transcript: VapiCollectedData['transcript']): TranscriptEntry[] {
  if (Array.isArray(transcript)) return transcript;

  const text = cleanText(transcript);
  if (!text) return [];

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const role = line.toLowerCase().startsWith('customer:') ? 'customer' : 'ai';
      const text = line.replace(/^(ai|assistant|customer):\s*/i, '');
      return {
        role,
        text,
        step: index,
        ts: new Date().toISOString(),
      } satisfies TranscriptEntry;
    });
}

function buildVapiNotes(
  vapiCallId: string,
  callerNumber: string,
  data: VapiCollectedData,
): string {
  return [
    'Vapi AI Call',
    `Call ID: ${vapiCallId}`,
    data.customerName ? `Name: ${data.customerName}` : null,
    `Phone: ${data.callbackNumber ?? callerNumber}`,
    data.vehicleReg ? `Reg: ${data.vehicleReg}` : null,
    data.location ? `Location: ${data.location}` : null,
    data.problem ? `Problem: ${data.problem}` : null,
    data.summary ? `Summary: ${data.summary}` : null,
    dateIso(data.startedAt) ? `Started: ${dateIso(data.startedAt)}` : null,
    dateIso(data.endedAt) ? `Ended: ${dateIso(data.endedAt)}` : null,
    'Source: Vapi.ai',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function createSessionFromVapi(
  vapiCallId: string,
  callerNumber: string,
  collectedData: VapiCollectedData,
): Promise<CreateSessionFromVapiResult> {
  const callSid = trimTo(vapiCallId.trim(), 64);
  const phone = trimTo((collectedData.callbackNumber ?? callerNumber).trim(), 20);
  const normalizedCallerNumber = trimTo(callerNumber.trim(), 20);

  if (!callSid) {
    throw new Error('Vapi call id is required');
  }
  if (!phone || !normalizedCallerNumber) {
    throw new Error('Vapi caller number is required');
  }

  const sessionData = {
    intent: collectedData.intent ?? 'emergency',
    vehicleReg: cleanText(collectedData.vehicleReg) ?? undefined,
    location: cleanText(collectedData.location) ?? undefined,
    problem: cleanText(collectedData.problem) ?? undefined,
    customerName: cleanText(collectedData.customerName) ?? undefined,
    callbackNumber: phone,
    summary: cleanText(collectedData.summary) ?? undefined,
    startedAt: dateIso(collectedData.startedAt) ?? undefined,
    endedAt: dateIso(collectedData.endedAt) ?? undefined,
    source: 'vapi',
    structuredData: collectedData.structuredData ?? undefined,
  };

  const transcript = transcriptFromVapi(collectedData.transcript);
  const name = trimTo(cleanText(collectedData.customerName) ?? 'AI Caller', 100);
  const notes = buildVapiNotes(callSid, normalizedCallerNumber, collectedData);

  // Neon HTTP does not support interactive db.transaction(); this single CTE
  // keeps the linked callback/session write atomic and idempotent for retries.
  const rows = await db.execute<CreateSessionFromVapiRow>(sql`
    WITH existing_session AS (
      SELECT id, call_me_back_id
      FROM ai_call_sessions
      WHERE call_sid = ${callSid}
      LIMIT 1
    ),
    inserted_callback AS (
      INSERT INTO call_me_back (name, phone, notes, status)
      SELECT ${name}, ${phone}, ${notes}, 'pending'
      WHERE NOT EXISTS (
        SELECT 1
        FROM existing_session
        WHERE call_me_back_id IS NOT NULL
      )
      RETURNING id
    ),
    callback_choice AS (
      SELECT id, true AS created_call_me_back
      FROM inserted_callback
      UNION ALL
      SELECT call_me_back_id AS id, false AS created_call_me_back
      FROM existing_session
      WHERE call_me_back_id IS NOT NULL
      LIMIT 1
    ),
    upsert_session AS (
      INSERT INTO ai_call_sessions (
        call_sid,
        caller_number,
        step,
        collected_data,
        transcript,
        status,
        call_me_back_id,
        created_at,
        updated_at
      )
      SELECT
        ${callSid},
        ${normalizedCallerNumber},
        5,
        ${JSON.stringify(sessionData)}::jsonb,
        ${JSON.stringify(transcript)}::jsonb,
        'completed',
        callback_choice.id,
        NOW(),
        NOW()
      FROM callback_choice
      ON CONFLICT (call_sid)
      DO UPDATE SET
        caller_number = EXCLUDED.caller_number,
        step = EXCLUDED.step,
        collected_data = EXCLUDED.collected_data,
        transcript = EXCLUDED.transcript,
        status = EXCLUDED.status,
        call_me_back_id = COALESCE(ai_call_sessions.call_me_back_id, EXCLUDED.call_me_back_id),
        updated_at = NOW()
      RETURNING id
    )
    SELECT
      upsert_session.id AS "aiCallSessionId",
      callback_choice.id AS "callMeBackId",
      callback_choice.created_call_me_back AS "createdCallMeBack"
    FROM callback_choice
    INNER JOIN upsert_session ON true
  `);

  const result = rows.rows[0];
  if (!result?.aiCallSessionId || !result.callMeBackId) {
    throw new Error('Failed to create Vapi call session');
  }

  return result;
}
