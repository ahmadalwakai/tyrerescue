import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contactMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { baseEmailTemplate } from '@/lib/email/templates/base';
import { askGroqJSON } from '@/lib/groq';
import { createAdminNotification } from '@/lib/notifications';
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

const ROUTE_KEY = 'contact';
const ROUTE_PATH = '/api/contact';

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(1).max(1000),
  // Honeypot — must be empty / absent for real users.
  [HONEYPOT_FIELD]: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse({ _root: ['Invalid JSON body.'] });
  }

  // Honeypot first — fail fast and cheap on obvious bots.
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

  // Per-IP per-route rate limit (best-effort, in-memory).
  const ip = getClientIp(request);
  const rl = checkRateLimit(`${ROUTE_KEY}:${ip}`, RATE_LIMITS.contact);
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

  const { name, email, phone, message } = parsed.data;

  const [inserted] = await db.insert(contactMessages).values({
    name,
    email,
    phone: phone || null,
    message,
  }).returning({ id: contactMessages.id });

  // AI triage (non-blocking)
  let aiPriority = 'normal';
  let aiCategory = 'general';
  try {
    const triage = await askGroqJSON(
      `You are a customer service triage system for a mobile tyre fitting company in Glasgow.
Classify this message. Return JSON:
{
  "priority": "urgent"|"high"|"normal"|"low",
  "category": "emergency"|"complaint"|"booking_query"|"pricing"|"feedback"|"general",
  "suggestedResponse": "string max 40 words — a draft reply the admin can use",
  "requiresImmediateCall": boolean,
  "sentiment": "positive"|"neutral"|"negative"|"angry"
}
Emergency = stranded, flat tyre now, safety issue.
Complaint = unhappy customer, refund request, damaged vehicle.`,
      `From: ${name}\nPhone: ${phone || 'not provided'}\nMessage: ${message}`,
      300
    );

    if (triage) {
      aiPriority = triage.priority as string || 'normal';
      aiCategory = triage.category as string || 'general';
      await db
        .update(contactMessages)
        .set({
          aiPriority: triage.priority as string,
          aiCategory: triage.category as string,
          aiSuggestedResponse: triage.suggestedResponse as string,
          requiresImmediateCall: triage.requiresImmediateCall as boolean,
          aiSentiment: triage.sentiment as string,
        })
        .where(eq(contactMessages.id, inserted.id));
    }
  } catch {
    // AI triage failed — message is still saved, continue
  }

  // Notify admin
  // Admin notification (fire-and-forget)
  createAdminNotification({
    type: 'contact.received',
    title: aiPriority === 'urgent' || aiPriority === 'high' ? `🚨 Contact: ${name}` : `New Contact: ${name}`,
    body: `${name} (${email})${phone ? ` — ${phone}` : ''}: ${message.slice(0, 80)}`,
    entityType: 'contact',
    entityId: inserted.id,
    link: '/admin/messages',
    severity: aiPriority === 'urgent' ? 'warning' : 'info',
    createdBy: 'system',
  }).catch(console.error);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const priorityLabel = aiPriority === 'urgent' || aiPriority === 'high' ? `🚨 ${aiPriority.toUpperCase()} ` : '';
    const adminHtml = baseEmailTemplate({
      preheader: `New contact message from ${name}`,
      content: `
        <h2 style="margin-top:0;">${priorityLabel}New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
          ${phone ? `<tr><td style="padding:8px 0;color:#666;">Phone</td><td style="padding:8px 0;font-weight:600;">${phone}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666;">AI Priority</td><td style="padding:8px 0;font-weight:600;">${aiPriority}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">AI Category</td><td style="padding:8px 0;font-weight:600;">${aiCategory}</td></tr>
          <tr><td style="padding:8px 0;color:#666;" colspan="2">Message</td></tr>
          <tr><td style="padding:8px 0;" colspan="2">${message.replace(/\n/g, '<br>')}</td></tr>
        </table>
      `,
    });

    await sendEmail({
      to: adminEmail,
      subject: `${priorityLabel}Contact Form: ${name}`,
      html: adminHtml,
    }).catch(() => {});
  }

  // Auto-reply to customer
  const replyHtml = baseEmailTemplate({
    preheader: 'Thank you for contacting Tyre Rescue',
    content: `
      <h2 style="margin-top:0;">Thank you, ${name}</h2>
      <p>We have received your message and will get back to you as soon as possible.</p>
      <p>If your enquiry is urgent, please call us directly at <strong>0141 266 0690</strong>.</p>
    `,
  });

  await sendEmail({
    to: email,
    subject: 'We received your message - Tyre Rescue',
    html: replyHtml,
  }).catch(() => {});

  return NextResponse.json({ success: true }, { status: 201 });
}
