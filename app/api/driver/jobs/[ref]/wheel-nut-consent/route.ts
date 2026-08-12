import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  auditLogs,
  bookings,
  db,
  wheelNutConsents,
} from '@/lib/db';
import { requireDriverMobile } from '@/lib/auth';
import { normalizeRecipientEmailInput } from '@/lib/contact-normalization';
import { createAdminNotification } from '@/lib/notifications';
import { createNotificationAndSend } from '@/lib/email/resend';
import { baseEmailTemplate } from '@/lib/email/templates';
import { isValidEmail } from '@/lib/utils';
import {
  serializeWheelNutConsentStatus,
  WHEEL_NUT_DECLARATION_TEXT,
} from '@/lib/wheel-nut-consent';
import { generateWheelNutConsentPdf } from '@/lib/wheel-nut-consent-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const MIN_SIGNATURE_POINTS = 6;
const PNG_MAGIC = '89504e470d0a1a0a';

interface Props {
  params: Promise<{ ref: string }>;
}

interface ConsentPayload {
  customerName?: unknown;
  vehicleReg?: unknown;
  declarationAccepted?: unknown;
  signatureDataUrl?: unknown;
  signaturePointCount?: unknown;
  gps?: {
    lat?: unknown;
    lng?: unknown;
    accuracy?: unknown;
  };
  deviceId?: unknown;
  deviceLabel?: unknown;
}

function json(data: Record<string, unknown>, init: ResponseInit = {}) {
  return NextResponse.json(data, init);
}

function getRequestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '') ?? 'http';
  return `${protocol}://${host}`;
}

function canUseLocalStorageFallback(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function isBlobStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function sha256(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isClientValidationError(error: Error): boolean {
  return [
    'Signature',
    'signature',
    'Please capture',
    'Evidence storage',
  ].some((message) => error.message.includes(message));
}

function parseSignatureDataUrl(value: unknown): Buffer {
  if (typeof value !== 'string') {
    throw new Error('Signature is required.');
  }
  const match = value.match(/^data:image\/png;base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match?.[1]) {
    throw new Error('Signature must be a PNG image.');
  }
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  if (buffer.length < 350) {
    throw new Error('Signature is too small. Please ask the customer to sign clearly.');
  }
  if (buffer.length > MAX_SIGNATURE_BYTES) {
    throw new Error('Signature image is too large.');
  }
  if (buffer.subarray(0, 8).toString('hex') !== PNG_MAGIC) {
    throw new Error('Signature image is not a valid PNG.');
  }
  return buffer;
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  const text = textValue(value);
  return text ? text : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function saveEvidenceFile(
  request: NextRequest,
  filename: string,
  bytes: Uint8Array | Buffer,
  contentType: string,
): Promise<string> {
  if (canUseLocalStorageFallback() && !isBlobStorageConfigured()) {
    const publicRelativePath = filename.replace(/^wheel-nut-consents\//, 'uploads/wheel-nut-consents/');
    const destination = path.join(process.cwd(), 'public', ...publicRelativePath.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(bytes));
    return new URL(`/${publicRelativePath.replace(/\\/g, '/')}`, getRequestOrigin(request)).toString();
  }

  if (!isBlobStorageConfigured()) {
    throw new Error('Evidence storage is not configured.');
  }

  const upload = await put(filename, new Blob([Buffer.from(bytes)], { type: contentType }), {
    access: 'public',
    addRandomSuffix: false,
    contentType,
  });
  return upload.url;
}

async function getDriverBooking(ref: string, driverId: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.refNumber, ref), eq(bookings.driverId, driverId)))
    .limit(1);
  return booking ?? null;
}

async function getLatestConsent(bookingId: string) {
  const [consent] = await db
    .select()
    .from(wheelNutConsents)
    .where(eq(wheelNutConsents.bookingId, bookingId))
    .orderBy(desc(wheelNutConsents.createdAt))
    .limit(1);
  return consent ?? null;
}

async function markConsentRequired(
  booking: Awaited<ReturnType<typeof getDriverBooking>>,
  driverId: string,
  userId: string,
  reason: string,
  request: NextRequest,
) {
  if (!booking) return;
  if (!booking.wheelNutConsentRequiredAt) {
    await db
      .update(bookings)
      .set({
        wheelNutConsentRequiredAt: new Date(),
        wheelNutConsentRequiredByDriverId: driverId,
        wheelNutConsentReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    await db.insert(auditLogs).values({
      actorUserId: userId,
      actorRole: 'driver',
      entityType: 'booking',
      entityId: booking.id,
      action: 'wheel_nut_consent_required',
      afterJson: {
        refNumber: booking.refNumber,
        reason,
      },
      userAgent: request.headers.get('user-agent'),
    });
  }
}

function consentEmailHtml(input: {
  customerName: string;
  refNumber: string;
  vehicleReg: string | null;
  signedAt: Date;
}) {
  const customerName = escapeHtml(input.customerName);
  const refNumber = escapeHtml(input.refNumber);
  const vehicleReg = escapeHtml(input.vehicleReg);
  const signedAt = escapeHtml(input.signedAt.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  const vehicleLine = input.vehicleReg
    ? `<div class="info-row"><span class="label">Vehicle</span><span class="value">${vehicleReg}</span></div>`
    : '';
  return baseEmailTemplate({
    preheader: `Wheel nut consent for booking ${refNumber}`,
    content: `
      <h1>Wheel nut consent recorded</h1>
      <p>Hi ${customerName},</p>
      <p>Your signed Wheel Damage & Locking Wheel Nut Consent for booking <strong>${refNumber}</strong> is attached as a PDF.</p>
      <div class="info-box">
        <div class="info-row"><span class="label">Booking</span><span class="value">${refNumber}</span></div>
        ${vehicleLine}
        <div class="info-row"><span class="label">Signed</span><span class="value">${signedAt}</span></div>
      </div>
      <p>If you have any questions, please contact Tyre Rescue on 0141 266 0690.</p>
    `,
  });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { user, driverId } = await requireDriverMobile(request);
    const { ref } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = textValue(body?.reason, 'driver_reported_extraction_or_wheel_damage_risk');
    const booking = await getDriverBooking(ref, driverId);

    if (!booking) return json({ error: 'Job not found' }, { status: 404 });

    await markConsentRequired(booking, driverId, user.id, reason, request);

    const refreshed = await getDriverBooking(ref, driverId);
    const latestConsent = refreshed ? await getLatestConsent(refreshed.id) : null;
    return json({
      success: true,
      wheelNutConsent: refreshed ? serializeWheelNutConsentStatus(refreshed, latestConsent) : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('PATCH wheel nut consent required failed:', error);
    return json({ error: 'Failed to mark wheel nut consent required' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { user, driverId } = await requireDriverMobile(request);
    const { ref } = await params;
    const body = (await request.json()) as ConsentPayload;
    const booking = await getDriverBooking(ref, driverId);

    if (!booking) return json({ error: 'Job not found' }, { status: 404 });
    if (body.declarationAccepted !== true) {
      return json({ error: 'Customer declaration must be accepted.' }, { status: 400 });
    }

    const customerName = textValue(body.customerName, booking.customerName);
    if (customerName.length < 2) {
      return json({ error: 'Customer name is required.' }, { status: 400 });
    }

    const signaturePointCount = normalizeNumber(body.signaturePointCount);
    if (signaturePointCount == null || signaturePointCount < MIN_SIGNATURE_POINTS) {
      return json({ error: 'Please capture a clear customer signature.' }, { status: 400 });
    }

    const signatureBytes = parseSignatureDataUrl(body.signatureDataUrl);
    await markConsentRequired(
      booking,
      driverId,
      user.id,
      'driver_recorded_signed_extraction_consent',
      request,
    );

    const signedAt = new Date();
    const evidenceId = uuidv4();
    const vehicleReg = textValue(body.vehicleReg, booking.vehicleReg ?? '').toUpperCase() || null;
    const gpsLat = normalizeNumber(body.gps?.lat);
    const gpsLng = normalizeNumber(body.gps?.lng);
    const gpsAccuracy = normalizeNumber(body.gps?.accuracy);
    const deviceId = nullableText(body.deviceId);
    const deviceLabel = nullableText(body.deviceLabel);

    const pdfBytes = await generateWheelNutConsentPdf({
      bookingRef: booking.refNumber,
      customerName,
      customerEmail: booking.customerEmail,
      vehicleReg,
      driverName: user.name ?? null,
      driverId,
      signedAt,
      gpsLat: gpsLat == null ? null : gpsLat.toFixed(6),
      gpsLng: gpsLng == null ? null : gpsLng.toFixed(6),
      gpsAccuracy,
      deviceId,
      deviceLabel,
      declarationText: WHEEL_NUT_DECLARATION_TEXT,
      signaturePng: signatureBytes,
    });

    const signatureUrl = await saveEvidenceFile(
      request,
      `wheel-nut-consents/${booking.refNumber}-${evidenceId}-signature.png`,
      signatureBytes,
      'image/png',
    );
    const pdfUrl = await saveEvidenceFile(
      request,
      `wheel-nut-consents/${booking.refNumber}-${evidenceId}.pdf`,
      pdfBytes,
      'application/pdf',
    );

    const normalizedEmail = normalizeRecipientEmailInput(booking.customerEmail);
    const [created] = await db
      .insert(wheelNutConsents)
      .values({
        bookingId: booking.id,
        bookingRef: booking.refNumber,
        driverId,
        driverUserId: user.id,
        driverName: user.name ?? null,
        customerName,
        customerEmail: normalizedEmail || booking.customerEmail,
        vehicleReg,
        declarationText: WHEEL_NUT_DECLARATION_TEXT,
        declarationAccepted: true,
        signatureUrl,
        signatureMimeType: 'image/png',
        signatureFileSize: signatureBytes.length,
        signaturePointCount: Math.round(signaturePointCount),
        signatureSha256: sha256(signatureBytes),
        pdfUrl,
        pdfFileSize: pdfBytes.length,
        pdfSha256: sha256(pdfBytes),
        gpsLat: gpsLat == null ? null : gpsLat.toFixed(6),
        gpsLng: gpsLng == null ? null : gpsLng.toFixed(6),
        gpsAccuracy,
        deviceId,
        deviceLabel,
        createdAt: signedAt,
      })
      .returning();

    await db.insert(auditLogs).values({
      actorUserId: user.id,
      actorRole: 'driver',
      entityType: 'booking',
      entityId: booking.id,
      action: 'wheel_nut_consent_signed',
      afterJson: {
        consentId: created.id,
        refNumber: booking.refNumber,
        signedAt: signedAt.toISOString(),
        gpsLat: gpsLat == null ? null : gpsLat.toFixed(6),
        gpsLng: gpsLng == null ? null : gpsLng.toFixed(6),
        deviceId,
        signatureSha256: sha256(signatureBytes),
        pdfSha256: sha256(pdfBytes),
      },
      userAgent: request.headers.get('user-agent'),
    });

    createAdminNotification({
      type: 'booking.updated',
      title: 'Wheel nut consent signed',
      body: `Customer consent recorded for ${booking.refNumber}`,
      entityType: 'booking',
      entityId: booking.id,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'warning',
      metadata: {
        refNumber: booking.refNumber,
        consentId: created.id,
        pdfUrl,
        updateType: 'wheel_nut_consent',
        important: true,
      },
    }).catch(console.error);

    if (normalizedEmail && isValidEmail(normalizedEmail)) {
      try {
        await createNotificationAndSend({
          to: normalizedEmail,
          subject: `Wheel nut consent for booking ${booking.refNumber}`,
          html: consentEmailHtml({
            customerName,
            refNumber: booking.refNumber,
            vehicleReg,
            signedAt,
          }),
          type: 'wheel-nut-consent',
          userId: booking.userId,
          bookingId: booking.id,
          attachments: [
            {
              filename: `${booking.refNumber}-wheel-nut-consent.pdf`,
              content: Buffer.from(pdfBytes),
              contentType: 'application/pdf',
            },
          ],
        });
        await db
          .update(wheelNutConsents)
          .set({ emailStatus: 'sent', emailSentAt: new Date() })
          .where(eq(wheelNutConsents.id, created.id));
      } catch (emailError) {
        await db
          .update(wheelNutConsents)
          .set({
            emailStatus: 'failed',
            emailError: emailError instanceof Error ? emailError.message : 'Unknown email error',
          })
          .where(eq(wheelNutConsents.id, created.id));
      }
    } else {
      await db
        .update(wheelNutConsents)
        .set({ emailStatus: 'skipped_no_email' })
        .where(eq(wheelNutConsents.id, created.id));
    }

    const refreshedBooking = await getDriverBooking(ref, driverId);
    const latestConsent = refreshedBooking ? await getLatestConsent(refreshedBooking.id) : created;
    return json({
      success: true,
      wheelNutConsent: refreshedBooking
        ? serializeWheelNutConsentStatus(refreshedBooking, latestConsent)
        : serializeWheelNutConsentStatus(booking, latestConsent),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && isClientValidationError(error)) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('POST wheel nut consent failed:', error);
    return json({ error: 'Failed to save wheel nut consent' }, { status: 500 });
  }
}
