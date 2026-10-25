import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { createAdminNotification } from '@/lib/notifications';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { ASSISTED_HELP_MARKER, assistedHelpIdSchema, assistedHelpInputSchema, assistedHelpNotes, assistedHelpStatus, signAssistedHelpAccess, verifyAssistedHelpAccess } from '@/lib/customer-assisted-help';
import { checkRateLimit, getClientIp, RATE_LIMITS, rateLimitedResponse } from '@/lib/security';

const privateHeaders = { 'Cache-Control': 'no-store, private' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
const accessToken = (request: Request) => request.headers.get('x-assistance-access')?.trim() ?? '';

async function rateLimit(request: Request, kind: 'prepare' | 'submit' | 'read') {
  // New requests share the existing public callback budget. A saved capability's
  // retries and status checks have separate short-window budgets.
  const result = await checkRateLimit(`${kind === 'prepare' ? 'callback' : `assisted-help:${kind}`}:${getClientIp(request)}`,
    kind === 'prepare' ? RATE_LIMITS.callback : { limit: 30, windowMs: 60_000 });
  return result.ok ? null : rateLimitedResponse(result);
}

async function findRequest(requestId: string) {
  const [row] = await db.select().from(callMeBack).where(eq(callMeBack.id, requestId)).limit(1);
  return row?.notes?.startsWith(ASSISTED_HELP_MARKER) ? row : null;
}

async function alertTeam(id: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.allSettled([
      createAdminNotification({ type: 'callback.created', title: 'Tyre size assistance',
        body: 'A customer needs help identifying a tyre before booking.', entityType: 'callback', entityId: id,
        link: '/admin/callbacks', severity: 'warning', createdBy: 'system', metadata: { important: true, updateType: 'created', adminPath: '/admin/callbacks', assistanceRequest: true } }),
      sendAdminExpoPush({ title: 'Tyre size assistance', body: 'A customer has requested help before booking.',
        platforms: ['ios'], channelId: 'booking_updates', ttl: 600, data: { type: 'callback_request', callbackId: id } }),
    ]), new Promise<void>((resolve) => { timer = setTimeout(resolve, 10_000); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Prepare a capability before inserting anything, so the app can save its retry receipt first. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  if (body && typeof body === 'object' && 'action' in body && body.action === 'prepare') {
    const limited = await rateLimit(request, 'prepare'); if (limited) return limited;
    const requestId = randomUUID();
    return json({ requestId, accessToken: await signAssistedHelpAccess(requestId) });
  }
  const limited = await rateLimit(request, 'submit'); if (limited) return limited;
  const parsed = assistedHelpInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'Check your name, UK phone number, location, vehicle or photo, and contact agreement.' }, 400);
  const input = parsed.data;
  if (!await verifyAssistedHelpAccess(accessToken(request), input.requestId)) return json({ error: 'Assistance access is invalid or expired.' }, 403);
  // The prepared UUID is the retry key. A timeout can never create another callback.
  const [inserted] = await db.insert(callMeBack).values({ id: input.requestId, name: input.name, phone: input.phone, notes: assistedHelpNotes(input) })
    .onConflictDoNothing({ target: callMeBack.id }).returning({ id: callMeBack.id });
  const row = await findRequest(input.requestId);
  if (!row) return json({ error: 'Unable to confirm this help request. Please contact the team.' }, 409);
  if (inserted) await alertTeam(row.id);
  return json(assistedHelpStatus(row), inserted ? 201 : 200);
}

export async function GET(request: Request) {
  const limited = await rateLimit(request, 'read');
  if (limited) return limited;
  const parsed = assistedHelpIdSchema.safeParse(new URL(request.url).searchParams.get('requestId'));
  if (!parsed.success || !await verifyAssistedHelpAccess(accessToken(request), parsed.data)) return json({ error: 'Assistance access is invalid or expired.' }, 403);
  const row = await findRequest(parsed.data);
  // Only the status is exposed. Phone, name, address, photo and staff notes stay private.
  return json(row ? assistedHelpStatus(row) : { requestId: parsed.data, status: 'not_received' });
}
