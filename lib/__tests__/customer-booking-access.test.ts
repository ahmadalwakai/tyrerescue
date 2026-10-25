import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { NextResponse } from 'next/server';

const state = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } } }));
vi.mock('@/lib/auth', () => ({ authMobile: async () => state.session }));

import { authorizeCustomerBooking, buildCustomerBookingTrackingUrl, getCustomerBookingAccessToken,
  setCustomerBookingAccessCookie, signCustomerBookingAccessToken, verifyCustomerBookingAccessToken } from '../customer-booking-access';

const booking = { id: '10000000-0000-4000-8000-000000000001', refNumber: 'TYR-ISOLATED-1', userId: 'owner' };
const secret = 'isolated-booking-capability-test-key-only';
const key = new TextEncoder().encode(secret);
beforeEach(() => { state.session = null; vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', secret); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('customer booking capabilities', () => {
  it('permits the exact guest booking but rejects reference and id substitution', async () => {
    const token = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
    expect(await verifyCustomerBookingAccessToken(token, booking)).toBe(true);
    expect(await verifyCustomerBookingAccessToken(token, { ...booking, refNumber: 'TYR-ISOLATED-2' })).toBe(false);
    expect(await verifyCustomerBookingAccessToken(token, { ...booking, id: 'another-id' })).toBe(false);
    expect(await verifyCustomerBookingAccessToken(`${token.slice(0, -8)}tampered`, booking)).toBe(false);
  });

  it('expires after seven days and rejects another purpose, audience, missing expiry and excessive lifetime', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const token = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect(await verifyCustomerBookingAccessToken(token, booking)).toBe(false);
    for (const [purpose, audience, expiry] of [
      ['customer_invoice', 'customer-booking', '1h'],
      ['customer_booking_access', 'invoice', '1h'],
      ['customer_booking_access', 'customer-booking', null],
      ['customer_booking_access', 'customer-booking', '8d'],
    ] as const) {
      let jwt = new SignJWT({ purpose, refNumber: booking.refNumber }).setProtectedHeader({ alg: 'HS256' })
        .setIssuer('tyrerescue').setAudience(audience).setSubject(booking.id).setIssuedAt();
      if (expiry) jwt = jwt.setExpirationTime(expiry);
      expect(await verifyCustomerBookingAccessToken(await jwt.sign(key), booking)).toBe(false);
    }
  });

  it('requires exact customer ownership; other customers and staff do not gain access implicitly', async () => {
    const request = new Request('https://isolated.invalid/api/tracking/TYR-ISOLATED-1');
    for (const [id, role, allowed] of [['owner', 'customer', true], ['other', 'customer', false], ['owner', 'driver', false], ['owner', 'admin', false]] as const) {
      state.session = { user: { id, role } };
      expect(await authorizeCustomerBooking(request, booking)).toBe(allowed);
    }
    state.session = null;
    expect(await authorizeCustomerBooking(request, booking)).toBe(false);
  });

  it('uses scoped HttpOnly cookies and cannot borrow another booking cookie', async () => {
    const token = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
    const response = setCustomerBookingAccessCookie(NextResponse.json({ ok: true }), booking.refNumber, token);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=lax'); expect(cookie).toContain('Max-Age=604800');
    const request = new Request('https://isolated.invalid/api/tracking', { headers: { cookie: cookie.split(';')[0] } });
    expect(getCustomerBookingAccessToken(request)).toBeNull();
    expect(await authorizeCustomerBooking(request, booking)).toBe(true);
    expect(await authorizeCustomerBooking(request, { ...booking, refNumber: 'TYR-ISOLATED-2' })).toBe(false);
  });

  it('passes capabilities in headers or signed tracking links with exact booking binding', async () => {
    const url = await buildCustomerBookingTrackingUrl('https://isolated.invalid', booking);
    expect(new URL(url).pathname).toBe(`/tracking/${booking.refNumber}`);
    expect(await authorizeCustomerBooking(new Request(url), booking)).toBe(true);
    const token = getCustomerBookingAccessToken(new Request(url))!;
    expect(await authorizeCustomerBooking(new Request('https://isolated.invalid', { headers: { 'X-Booking-Access': token } }), booking)).toBe(true);
    expect(await authorizeCustomerBooking(new Request(url), { ...booking, id: 'another-id' })).toBe(false);
  });

  it('fails closed when no signing secret is configured', async () => {
    vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', ''); vi.stubEnv('NEXTAUTH_SECRET', ''); vi.stubEnv('AUTH_SECRET', '');
    await expect(signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber })).rejects.toThrow('not configured');
    expect(await verifyCustomerBookingAccessToken('invalid', booking)).toBe(false);
  });
});
