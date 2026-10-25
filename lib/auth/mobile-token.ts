import { SignJWT, jwtVerify, errors, type JWTPayload } from 'jose';

/**
 * Mobile Bearer session tokens (driver, admin and customer apps).
 *
 * Several token types are HS256-signed with the same server secret (booking
 * access, invoice download, assisted-help). Each of those carries a
 * `purpose` claim, so a mobile session token must prove it is one:
 *   - tokens issued now carry purpose/issuer/audience and are checked for them;
 *   - tokens issued before this change have no `purpose` claim at all and are
 *     still accepted (they expire within 7 days), but any token that names a
 *     different purpose is rejected.
 */

const PURPOSE = 'mobile_session';
const ISSUER = 'tyrerescue';
const AUDIENCE = 'tyrerescue-mobile';
const ROLES = new Set(['customer', 'driver', 'admin']);

export interface MobileTokenPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  driverId?: string;
  sub: string;
}

/** The server signing secret. Throws instead of falling back to a guessable value. */
export function serverSigningSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('NEXTAUTH_SECRET (or AUTH_SECRET) must be set to at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(payload: {
  id: string;
  email: string;
  name: string;
  role: string;
  driverId?: string;
}): Promise<string> {
  return new SignJWT({ ...payload, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.id)
    .sign(serverSigningSecret());
}

function isSessionShape(payload: JWTPayload): boolean {
  return typeof payload.id === 'string'
    && typeof payload.email === 'string'
    && typeof payload.role === 'string'
    && ROLES.has(payload.role)
    && payload.sub === payload.id;
}

export async function verifySignedMobileToken(token: string): Promise<MobileTokenPayload> {
  const { payload } = await jwtVerify(token, serverSigningSecret(), { algorithms: ['HS256'] });
  if (payload.purpose === PURPOSE) {
    if (payload.iss !== ISSUER || payload.aud !== AUDIENCE) throw new errors.JWTInvalid('Invalid mobile token');
  } else if (payload.purpose !== undefined) {
    // Booking access, invoice and other purpose-bound tokens are not sessions.
    throw new errors.JWTInvalid('Invalid mobile token');
  }
  if (!isSessionShape(payload)) throw new errors.JWTInvalid('Invalid mobile token');
  return payload as unknown as MobileTokenPayload;
}
