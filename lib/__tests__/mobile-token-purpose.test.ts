import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { signMobileToken, verifySignedMobileToken, serverSigningSecret } from '@/lib/auth/mobile-token';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const user = { id: 'u-1', email: 'a@example.com', name: 'A', role: 'admin' };

async function signRaw(claims: Record<string, unknown>, subject?: string) {
  const jwt = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h');
  if (subject) jwt.setSubject(subject);
  return jwt.sign(new TextEncoder().encode(SECRET));
}

beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  vi.stubEnv('AUTH_SECRET', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('mobile session tokens', () => {
  it('round-trips a newly issued token', async () => {
    const token = await signMobileToken(user);
    await expect(verifySignedMobileToken(token)).resolves.toMatchObject({ ...user, sub: 'u-1' });
  });

  it('still accepts a token issued before purpose claims existed', async () => {
    const legacy = await signRaw(user, 'u-1');
    await expect(verifySignedMobileToken(legacy)).resolves.toMatchObject({ role: 'admin' });
  });

  it('rejects a booking access token used as a session', async () => {
    const bookingAccess = await signRaw({ purpose: 'customer_booking_access', refNumber: 'TR-1' }, 'booking-1');
    await expect(verifySignedMobileToken(bookingAccess)).rejects.toThrow();
  });

  it('rejects an invoice token even if it carries session-like claims', async () => {
    const invoice = await signRaw({ purpose: 'customer_invoice', ...user }, 'u-1');
    await expect(verifySignedMobileToken(invoice)).rejects.toThrow();
  });

  it('rejects a purpose-less token without a valid role', async () => {
    const noRole = await signRaw({ id: 'u-1', email: 'a@example.com' }, 'u-1');
    await expect(verifySignedMobileToken(noRole)).rejects.toThrow();
  });

  it('rejects a mobile_session token without the expected audience', async () => {
    const forged = await signRaw({ ...user, purpose: 'mobile_session' }, 'u-1');
    await expect(verifySignedMobileToken(forged)).rejects.toThrow();
  });

  it('refuses to sign or verify with a missing or short secret', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(() => serverSigningSecret()).toThrow();
    vi.stubEnv('NEXTAUTH_SECRET', 'short');
    expect(() => serverSigningSecret()).toThrow();
    const fallbackForged = await new SignJWT(user).setProtectedHeader({ alg: 'HS256' }).setSubject('u-1')
      .sign(new TextEncoder().encode('fallback-secret'));
    await expect(verifySignedMobileToken(fallbackForged)).rejects.toThrow();
  });
});
