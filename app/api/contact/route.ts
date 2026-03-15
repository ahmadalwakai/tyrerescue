import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contactMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { baseEmailTemplate } from '@/lib/email/templates/base';
import { askGroqJSON } from '@/lib/groq';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(20).optional(),
  message: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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
