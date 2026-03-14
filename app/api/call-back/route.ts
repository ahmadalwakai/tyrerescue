import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/resend';
import { baseEmailTemplate } from '@/lib/email/templates/base';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(5).max(20),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, phone, notes } = parsed.data;

  await db.insert(callMeBack).values({ name, phone, notes: notes || null });

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const html = baseEmailTemplate({
      preheader: `Call-back request from ${name}`,
      content: `
        <h2 style="margin-top:0;">New Call-Back Request</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Phone</td><td style="padding:8px 0;font-weight:600;">${phone}</td></tr>
          ${notes ? `<tr><td style="padding:8px 0;color:#666;">Notes</td><td style="padding:8px 0;">${notes}</td></tr>` : ''}
        </table>
      `,
    });

    await sendEmail({
      to: adminEmail,
      subject: `Call-Back Request: ${name}`,
      html,
    }).catch(() => {});
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
