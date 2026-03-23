import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { sendVoodooSms, normalizeUkPhoneNumber } from '@/lib/voodoo-sms';
import {
  buildLocationSmsMessage,
  buildLocationWhatsAppMessage,
  buildLocationEmailSubject,
  buildLocationEmailBody,
  buildLocationCopyMessage,
  buildWhatsAppUrl,
} from '@/lib/quick-book-message-templates';
import { createNotificationAndSend } from '@/lib/email/resend';

const schema = z.object({
  quickBookingId: z.string().uuid(),
  method: z.enum(['sms', 'whatsapp', 'email', 'copy']),
});

interface SendLinkResponse {
  ok: boolean;
  method: 'sms' | 'whatsapp' | 'email' | 'copy';
  message?: string;
  link?: string;
  provider?: 'voodoo';
  error?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { quickBookingId, method } = parsed.data;

  const [booking] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, quickBookingId))
    .limit(1);

  if (!booking || !booking.locationLinkToken) {
    return NextResponse.json({ error: 'No location link available' }, { status: 404 });
  }

  const siteUrl = 'https://www.tyrerescue.uk';
  const locationLink = `${siteUrl}/locate/${booking.locationLinkToken}`;
  const name = booking.customerName;
  const phone = booking.customerPhone;
  const email = booking.customerEmail;
  const serviceType = (booking.serviceType as 'fit' | 'repair' | 'assess') || undefined;

  const msgCtx = { customerName: name, locationLink, serviceType };

  // ─── SMS via Voodoo ───────────────────────────────────
  if (method === 'sms') {
    const normalized = normalizeUkPhoneNumber(phone);
    if (!normalized) {
      const result: SendLinkResponse = {
        ok: false,
        method: 'sms',
        error: 'Invalid UK phone number — cannot send SMS',
      };
      return NextResponse.json(result, { status: 400 });
    }

    const smsText = buildLocationSmsMessage(msgCtx);
    const smsResult = await sendVoodooSms({ to: phone, message: smsText });

    if (!smsResult.ok) {
      console.error('[send-link/sms] Failed:', smsResult.error);
      const result: SendLinkResponse = {
        ok: false,
        method: 'sms',
        provider: 'voodoo',
        error: smsResult.error || 'SMS send failed',
      };
      return NextResponse.json(result, { status: 502 });
    }

    const result: SendLinkResponse = {
      ok: true,
      method: 'sms',
      provider: 'voodoo',
      message: `SMS sent to ${phone}`,
    };
    return NextResponse.json(result);
  }

  // ─── WhatsApp ─────────────────────────────────────────
  if (method === 'whatsapp') {
    const waText = buildLocationWhatsAppMessage(msgCtx);
    const waLink = buildWhatsAppUrl(phone, waText);
    const result: SendLinkResponse = {
      ok: true,
      method: 'whatsapp',
      link: waLink,
      message: waText,
    };
    return NextResponse.json(result);
  }

  // ─── Email ────────────────────────────────────────────
  if (method === 'email') {
    if (!email) {
      const result: SendLinkResponse = {
        ok: false,
        method: 'email',
        error: 'No email address on file for this customer',
      };
      return NextResponse.json(result, { status: 400 });
    }

    const subject = buildLocationEmailSubject(msgCtx);
    const htmlBody = buildLocationEmailBody(msgCtx)
      .replace(/\n/g, '<br>');

    const emailResult = await createNotificationAndSend({
      to: email,
      subject,
      html: htmlBody,
      text: buildLocationEmailBody(msgCtx),
      type: 'location_link',
    });

    if (!emailResult.success) {
      const result: SendLinkResponse = {
        ok: false,
        method: 'email',
        error: emailResult.error || 'Email send failed',
      };
      return NextResponse.json(result, { status: 502 });
    }

    const result: SendLinkResponse = {
      ok: true,
      method: 'email',
      message: `Email sent to ${email}`,
    };
    return NextResponse.json(result);
  }

  // ─── Copy ─────────────────────────────────────────────
  const copyText = buildLocationCopyMessage(msgCtx);
  const result: SendLinkResponse = {
    ok: true,
    method: 'copy',
    message: copyText,
    link: locationLink,
  };
  return NextResponse.json(result);
}
