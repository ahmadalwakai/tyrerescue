import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { NextResponse } from 'next/server';

const TOKEN_PURPOSE = 'customer_booking_access';
const TOKEN_ISSUER = 'tyrerescue';
const TOKEN_AUDIENCE = 'customer-booking';
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export interface CustomerBookingAccessTarget {
  id: string;
  refNumber: string;
  userId?: string | null;
}

function signingKey() {
  const secret = process.env.CUSTOMER_BOOKING_ACCESS_SECRET
    ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Booking access signing is not configured');
  return new TextEncoder().encode(secret);
}

function cookieName(refNumber: string) {
  return `tr_booking_${createHash('sha256').update(refNumber.trim().toUpperCase()).digest('hex').slice(0, 20)}`;
}

/** An opaque booking capability, distinct from an account or invoice credential. */
export async function signCustomerBookingAccessToken(input: { bookingId: string; refNumber: string }) {
  return new SignJWT({ purpose: TOKEN_PURPOSE, refNumber: input.refNumber.trim().toUpperCase() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setSubject(input.bookingId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
    .sign(signingKey());
}

export async function verifyCustomerBookingAccessToken(token: string, booking: Pick<CustomerBookingAccessTarget, 'id' | 'refNumber'>) {
  if (!token || token.length > 4096) return false;
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'], issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE,
    });
    return payload.purpose === TOKEN_PURPOSE
      && payload.sub === booking.id
      && payload.refNumber === booking.refNumber.trim().toUpperCase()
      && typeof payload.iat === 'number' && typeof payload.exp === 'number'
      && payload.exp > payload.iat
      && payload.exp - payload.iat <= TOKEN_LIFETIME_SECONDS;
  } catch {
    return false;
  }
}

/** Cookie lookup is always scoped to the requested booking, never another booking. */
export function getCustomerBookingAccessToken(request: Request, refNumber?: string) {
  const header = request.headers.get('x-booking-access')?.trim();
  if (header) return header;
  const query = new URL(request.url).searchParams.get('accessToken')?.trim();
  if (query) return query;
  if (!refNumber) return null;
  const name = cookieName(refNumber);
  const value = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

export async function authorizeCustomerBooking(request: Request, booking: CustomerBookingAccessTarget) {
  const { authMobile } = await import('@/lib/auth');
  const session = await authMobile(request);
  if (session?.user?.role === 'customer' && session.user.id && session.user.id === booking.userId) return true;
  const token = getCustomerBookingAccessToken(request, booking.refNumber);
  return token ? verifyCustomerBookingAccessToken(token, booking) : false;
}

export function setCustomerBookingAccessCookie<T>(response: NextResponse<T>, refNumber: string, token: string): NextResponse<T> {
  response.cookies.set(cookieName(refNumber), token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: TOKEN_LIFETIME_SECONDS,
  });
  return response;
}

export async function buildCustomerBookingTrackingUrl(origin: string, booking: Pick<CustomerBookingAccessTarget, 'id' | 'refNumber'>) {
  const url = new URL(`/tracking/${encodeURIComponent(booking.refNumber)}`, origin);
  url.searchParams.set('accessToken', await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber }));
  return url.toString();
}
