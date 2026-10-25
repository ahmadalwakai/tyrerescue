import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { createAdminNotification } from '@/lib/notifications';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { z } from 'zod';
import {
  checkRateLimit,
  getClientIp,
  HONEYPOT_FIELD,
  isHoneypotFilled,
  logSecurityRejection,
  RATE_LIMITS,
  rateLimitedResponse,
  suspiciousSubmissionResponse,
  validationErrorResponse,
} from '@/lib/security';

const ROUTE_KEY = 'callback';
const ROUTE_PATH = '/api/call-back';
const CALLBACK_ALERT_TIMEOUT_MS = 10_000;

async function settleCallbackAlerts(alerts: Promise<unknown>[]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([Promise.allSettled(alerts), new Promise<void>((resolve) => {
      timer = setTimeout(() => { console.warn('[callback] Admin alert dispatch timed out'); resolve(); }, CALLBACK_ALERT_TIMEOUT_MS);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(30),
  notes: z.string().trim().max(500).optional(),
  [HONEYPOT_FIELD]: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse({ _root: ['Invalid JSON body.'] });
  }

  if (isHoneypotFilled(body)) {
    logSecurityRejection({
      req: request,
      reason: 'honeypot_filled',
      route: ROUTE_PATH,
      status: 400,
      routeKey: ROUTE_KEY,
    });
    return suspiciousSubmissionResponse();
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`${ROUTE_KEY}:${ip}`, RATE_LIMITS.callback);
  if (!rl.ok) {
    logSecurityRejection({
      req: request,
      reason: 'rate_limited',
      route: ROUTE_PATH,
      status: 429,
      routeKey: ROUTE_KEY,
    });
    return rateLimitedResponse(rl);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>,
    );
  }

  const { name, phone, notes } = parsed.data;

  const [created] = await db
    .insert(callMeBack)
    .values({ name, phone, notes: notes || null })
    .returning({ id: callMeBack.id });

  if (!created) {
    return NextResponse.json({ error: 'Failed to create callback request' }, { status: 500 });
  }

  // Complete best-effort dispatch before the serverless request ends. The
  // iOS relay bounds its network wait; this outer bound also covers token
  // lookup/internal dispatch. Delivery failure cannot undo
  // the callback request already stored above.
  await settleCallbackAlerts([createAdminNotification({
    type: 'callback.created',
    title: 'Callback Request',
    body: `${name} — ${phone}${notes ? ` — ${notes.slice(0, 60)}` : ''}`,
    entityType: 'callback',
    entityId: created.id,
    link: '/admin/callbacks',
    severity: 'warning',
    createdBy: 'system',
    metadata: {
      callbackName: name,
      callbackPhone: phone,
      callbackNotes: notes || undefined,
      important: true,
      updateType: 'created',
      adminPath: '/admin/callbacks',
    },
  }), sendAdminExpoPush({
    title: 'Callback request',
    body: 'A customer has requested a call from Tyre Rescue.',
    platforms: ['ios'],
    channelId: 'booking_updates',
    ttl: 600,
    data: { type: 'callback_request', callbackId: created.id },
  })]);

  return NextResponse.json({ success: true }, { status: 201 });
}
