import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireAdminMobile } from '@/lib/auth';
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
import { getOutboundUrl } from '@/lib/config/site';
import { validateRecipientEmail } from '@/lib/email/validate-recipient';

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
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { quickBookingId, method } = parsed.data;

  const [bookingRow] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, quickBookingId))
    .limit(1);

  if (!bookingRow) {
    return NextResponse.json({ error: 'Quick booking not found' }, { status: 404 });
  }

  // Lazily issue a location-share token if one was never minted (e.g. quick
  // bookings created via the assisted-chat flow start with locationMethod=
  // 'address'). Token TTL matches the original POST handler (2 hours).
  let booking = bookingRow;
  if (!booking.locationLinkToken) {
    const linkToken = randomBytes(32).toString('hex');
    const linkExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db
      .update(quickBookings)
      .set({ locationLinkToken: linkToken, locationLinkExpiry: linkExpiry, updatedAt: new Date() })
      .where(eq(quickBookings.id, quickBookingId));
    booking = { ...booking, locationLinkToken: linkToken, locationLinkExpiry: linkExpiry };
  }

  if (!booking.locationLinkToken) {
    return NextResponse.json({ error: 'No location link available' }, { status: 404 });
  }

  // Use env-aware origin so local-dev API emits localhost links and
  // production keeps emitting SITE_URL. SMS/WhatsApp/email all reuse this.
  const siteUrl = getOutboundUrl();
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
    // التحقق من صحة البريد الإلكتروني قبل الإرسال — يحجب العناوين الوهمية والمؤقتة
    const emailCheck = validateRecipientEmail(email);
    if (!emailCheck.ok) {
      const result: SendLinkResponse = {
        ok: false,
        method: 'email',
        error: email ? `Cannot send email: ${emailCheck.reason}` : 'No email address on file for this customer',
      };
      return NextResponse.json(result, { status: 400 });
    }

    const subject = buildLocationEmailSubject(msgCtx);
    const htmlBody = buildLocationEmailBody(msgCtx)
      .replace(/\n/g, '<br>');

    const emailResult = await createNotificationAndSend({
      to: emailCheck.email,
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
