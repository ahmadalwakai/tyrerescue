import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { SignJWT, jwtVerify } from 'jose';

import { getOutboundUrl } from '@/lib/config/site';
import { db } from '@/lib/db';
import { bookings, emailVerificationTokens, users } from '@/lib/db/schema';
import { createNotificationAndSend } from '@/lib/email/resend';
import { verifyEmail, welcome } from '@/lib/email/templates';
import { authMobile, signMobileToken } from '@/lib/auth';

const CUSTOMER_BOOKING_STATUSES = [
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'awaiting_payment',
  'payment_failed',
  'cancelled',
] as const;

const INVOICEABLE_BOOKING_STATUSES = [
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
] as const;

const CUSTOMER_INVOICE_JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? 'fallback-secret',
);

export interface CustomerMobileUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
}

export interface CustomerMobileBooking {
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  totalAmount: number;
  tyreSizeDisplay: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  invoiceDownloadToken: string | null;
}

export async function getCustomerMobileUser(request: Request): Promise<CustomerMobileUser | null> {
  const session = await authMobile(request);
  if (!session?.user?.id || session.user.role !== 'customer') return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return user ?? null;
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function buildCustomerSessionPayload(user: CustomerMobileUser) {
  const token = await signMobileToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'customer',
  });

  return {
    token,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
    bookings: await listCustomerMobileBookings(user.id),
  };
}

export async function listCustomerMobileBookings(userId: string): Promise<CustomerMobileBooking[]> {
  const rows = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerEmail: bookings.customerEmail,
      status: bookings.status,
      bookingType: bookings.bookingType,
      serviceType: bookings.serviceType,
      addressLine: bookings.addressLine,
      totalAmount: bookings.totalAmount,
      tyreSizeDisplay: bookings.tyreSizeDisplay,
      vehicleReg: bookings.vehicleReg,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
      scheduledAt: bookings.scheduledAt,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.createdAt));

  return Promise.all(
    rows.map(async (row) => ({
      refNumber: row.refNumber,
      status: row.status,
      bookingType: row.bookingType,
      serviceType: row.serviceType,
      addressLine: row.addressLine,
      totalAmount: Number(row.totalAmount),
      tyreSizeDisplay: row.tyreSizeDisplay,
      vehicleReg: row.vehicleReg,
      vehicleMake: row.vehicleMake,
      vehicleModel: row.vehicleModel,
      scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      invoiceDownloadToken: isInvoiceableBookingStatus(row.status)
        ? await signCustomerInvoiceToken({
            bookingId: row.id,
            refNumber: row.refNumber,
            email: row.customerEmail,
          })
        : null,
    })),
  );
}

export async function linkUnclaimedBookingsForEmail(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  await db
    .update(bookings)
    .set({ userId, updatedAt: new Date() })
    .where(
      and(
        isNull(bookings.userId),
        sql`lower(${bookings.customerEmail}) = ${normalizedEmail}`,
      ),
    );
}

export async function sendCustomerVerification(user: { id: string; name: string; email: string }) {
  const verifyToken = uuidv4();
  const tokenHash = createHash('sha256').update(verifyToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const verifyUrl = `${getOutboundUrl()}/verify-email/${verifyToken}`;

  try {
    const welcomeEmail = welcome({
      name: user.name || 'Customer',
      verifyUrl,
    });

    await createNotificationAndSend({
      to: user.email,
      subject: welcomeEmail.subject,
      html: welcomeEmail.html,
      type: 'welcome',
      userId: user.id,
    });
  } catch (err) {
    console.error('[mobile-customer] welcome email failed:', err);
  }

  try {
    const verifyEmailContent = verifyEmail({
      name: user.name || 'Customer',
      verifyUrl,
    });

    await createNotificationAndSend({
      to: user.email,
      subject: verifyEmailContent.subject,
      html: verifyEmailContent.html,
      type: 'verify-email',
      userId: user.id,
    });
  } catch (err) {
    console.error('[mobile-customer] verification email failed:', err);
  }
}

export function isCustomerVisibleBookingStatus(status: string) {
  return CUSTOMER_BOOKING_STATUSES.includes(status as (typeof CUSTOMER_BOOKING_STATUSES)[number]);
}

export function isInvoiceableBookingStatus(status: string) {
  return INVOICEABLE_BOOKING_STATUSES.includes(status as (typeof INVOICEABLE_BOOKING_STATUSES)[number]);
}

export async function signCustomerInvoiceToken(input: {
  bookingId: string;
  refNumber: string;
  email: string;
}) {
  return new SignJWT({
    purpose: 'customer_invoice',
    bookingId: input.bookingId,
    refNumber: input.refNumber,
    email: input.email.toLowerCase(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('2h')
    .setSubject(input.bookingId)
    .sign(CUSTOMER_INVOICE_JWT_SECRET);
}

export async function verifyCustomerInvoiceToken(token: string) {
  const { payload } = await jwtVerify(token, CUSTOMER_INVOICE_JWT_SECRET);
  if (payload.purpose !== 'customer_invoice') {
    throw new Error('Invalid token purpose');
  }
  return payload as {
    purpose: 'customer_invoice';
    bookingId: string;
    refNumber: string;
    email: string;
    sub: string;
  };
}
