import 'server-only';
import { eq } from 'drizzle-orm';
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
