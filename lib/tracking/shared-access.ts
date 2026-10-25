import { decodeJwt, jwtVerify, SignJWT } from 'jose';

type ShareSession = { bookingId: string; customerToken: string; shareVersion: number };
const shareKey = (session: ShareSession) => new TextEncoder().encode(session.customerToken);

export async function signSharedTrackingToken(session: ShareSession) {
  return new SignJWT({ purpose: 'family_tracking', bookingId: session.bookingId, shareVersion: session.shareVersion })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('24h').sign(shareKey(session));
}

export function sharedTrackingBookingId(token: string): string | null {
  try {
    const value = decodeJwt(token).bookingId;
    return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch { return null; }
}

export async function verifySharedTrackingToken(token: string, session: ShareSession) {
  try {
    const { payload } = await jwtVerify(token, shareKey(session), { algorithms: ['HS256'] });
    return payload.purpose === 'family_tracking' && payload.bookingId === session.bookingId && payload.shareVersion === session.shareVersion;
  } catch { return false; }
}
