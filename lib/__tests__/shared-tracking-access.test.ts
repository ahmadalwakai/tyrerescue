import { describe, expect, it, vi, afterEach } from 'vitest';
import { decodeJwt } from 'jose';
import { sharedTrackingBookingId, signSharedTrackingToken, verifySharedTrackingToken } from '../tracking/shared-access';

const session = { bookingId: '11111111-1111-4111-8111-111111111111', customerToken: 'a'.repeat(64), shareVersion: 0 };
afterEach(() => vi.useRealTimers());
describe('family tracking capability', () => {
  it('scopes sharing to one booking and expires after 24 hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const token = await signSharedTrackingToken(session);
    expect(sharedTrackingBookingId(token)).toBe(session.bookingId);
    expect(await verifySharedTrackingToken(token, session)).toBe(true);
    expect(decodeJwt(token).exp! - decodeJwt(token).iat!).toBe(86400);
    expect(await verifySharedTrackingToken(token, { ...session, bookingId: 'other' })).toBe(false);
    vi.advanceTimersByTime(24 * 60 * 60_000 + 1);
    expect(await verifySharedTrackingToken(token, session)).toBe(false);
  });
  it('revokes family links without changing the original customer tracking link', async () => {
    const token = await signSharedTrackingToken(session);
    expect(await verifySharedTrackingToken(token, { ...session, customerToken: 'b'.repeat(64) })).toBe(false);
    expect(await verifySharedTrackingToken(token, { ...session, shareVersion: 1 })).toBe(false);
    expect(await verifySharedTrackingToken(`${token}tampered`, session)).toBe(false);
    expect(sharedTrackingBookingId('TR-guessable')).toBe(null);
    expect(decodeJwt(token)).not.toHaveProperty('customerToken');
  });
});
