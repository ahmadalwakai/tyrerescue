import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contactMessages } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/resend';
import { baseEmailTemplate } from '@/lib/email/templates/base';
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

  await db.insert(contactMessages).values({
    name,
    email,
    phone: phone || null,
    message,
  });

  // Notify admin
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const adminHtml = baseEmailTemplate({
      preheader: `New contact message from ${name}`,
      content: `
        <h2 style="margin-top:0;">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
          ${phone ? `<tr><td style="padding:8px 0;color:#666;">Phone</td><td style="padding:8px 0;font-weight:600;">${phone}</td></tr>` : ''}
          <tr><td style="padding:8px 0;color:#666;" colspan="2">Message</td></tr>
          <tr><td style="padding:8px 0;" colspan="2">${message.replace(/\n/g, '<br>')}</td></tr>
        </table>
      `,
    });

    await sendEmail({
      to: adminEmail,
      subject: `Contact Form: ${name}`,
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
