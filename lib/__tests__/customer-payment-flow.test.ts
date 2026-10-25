import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookingDraft, confirmCustomerPayment, londonDateChoices, londonScheduledAt,
  requireConfirmedBooking, restoreBookingDraft } from '../../tyre-rescue/src/booking-safety';
import { initialBookingState, type BookingState } from '../../tyre-rescue/src/types';
import { bookingDraftSession, clearBookingDraft, invalidateBookingDraftSession, saveBookingDraft } from '../../tyre-rescue/src/booking-draft-storage';

const storage = vi.hoisted(() => ({ value: null as string | null,
  set: vi.fn<(...args: [string, string]) => Promise<void>>(),
  remove: vi.fn<(...args: [string]) => Promise<void>>(),
}));
vi.mock('../../tyre-rescue/src/secure-storage', () => ({
  setSecureItem: (...args: [string, string]) => storage.set(...args),
  deleteSecureItem: (...args: [string]) => storage.remove(...args),
}));

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('customer payment confirmation contract', () => {
  it.each([null, undefined, false, 'paid', 1, {}, { status: 'paid' }, { status: 'driver_assigned' },
    { paymentConfirmed: false }, { paymentConfirmed: 'true' }, { paymentConfirmed: 1 }])(
    'never shows confirmation for absent or merely truthy server evidence: %j', (value) => {
      expect(() => requireConfirmedBooking(value)).toThrow(/do not make another payment/i);
    },
  );

  it('accepts only explicit successful server confirmation', () => {
    expect(() => requireConfirmedBooking({ paymentConfirmed: true, status: 'driver_assigned' })).not.toThrow();
  });

  it('charges once and remembers the same payment before a network failure, then only retries server confirmation', async () => {
    let remembered: string | null = null;
    const pay = vi.fn(async () => 'pi_Confirmed123');
    const confirm = vi.fn().mockRejectedValueOnce(new Error('Network interrupted')).mockResolvedValueOnce(undefined);
    const remember = vi.fn((id: string) => { remembered = id; });
    await expect(confirmCustomerPayment({ pendingPaymentIntentId: remembered, pay, confirm, remember })).rejects.toThrow('Network interrupted');
    expect(remembered).toBe('pi_Confirmed123');
    await confirmCustomerPayment({ pendingPaymentIntentId: remembered, pay, confirm, remember });
    expect(pay).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls).toEqual([['pi_Confirmed123'], ['pi_Confirmed123']]);
  });

  it('keeps the original payment identity when the server is still processing instead of opening checkout again', async () => {
    let remembered: string | null = null;
    const pay = vi.fn(async () => 'pi_Processing123');
    const confirm = vi.fn(async () => { requireConfirmedBooking({ paymentConfirmed: false, status: 'awaiting_payment' }); });
    const attempt = () => confirmCustomerPayment({ pendingPaymentIntentId: remembered, pay, confirm, remember: id => { remembered = id; } });
    await expect(attempt()).rejects.toThrow(/do not make another payment/i);
    await expect(attempt()).rejects.toThrow(/do not make another payment/i);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('does not create confirmation evidence when checkout was cancelled', async () => {
    const remember = vi.fn(); const confirm = vi.fn();
    await expect(confirmCustomerPayment({ pendingPaymentIntentId: null,
      pay: async () => { throw new Error('Cancelled'); }, remember, confirm })).rejects.toThrow('Cancelled');
    expect(remember).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  });

  it('will not pay again when a recovered receipt has an invalid payment identifier', async () => {
    const pay = vi.fn(); const remember = vi.fn(); const confirm = vi.fn();
    await expect(confirmCustomerPayment({ pendingPaymentIntentId: 'not-a-payment', pay, remember, confirm })).rejects.toThrow('Unable to identify');
    expect(pay).not.toHaveBeenCalled(); expect(remember).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
  });
});

describe('London appointment identity', () => {
  it.each(['Pacific/Honolulu', 'Asia/Tokyo', 'Europe/London'])('keeps UK summer and winter slots identical from a %s phone', (timezone) => {
    vi.stubEnv('TZ', timezone);
    expect(londonScheduledAt('2026-07-10', '11:00')).toBe('2026-07-10T10:00:00.000Z');
    expect(londonScheduledAt('2026-12-10', '11:00')).toBe('2026-12-10T11:00:00.000Z');
  });

  it('uses the correct offset before and after both daylight-saving changes', () => {
    expect(londonScheduledAt('2026-03-28', '11:00')).toBe('2026-03-28T11:00:00.000Z');
    expect(londonScheduledAt('2026-03-29', '11:00')).toBe('2026-03-29T10:00:00.000Z');
    expect(londonScheduledAt('2026-10-24', '11:00')).toBe('2026-10-24T10:00:00.000Z');
    expect(londonScheduledAt('2026-10-25', '11:00')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('rejects a nonexistent spring clock-change time and invalid calendar dates', () => {
    expect(() => londonScheduledAt('2026-03-29', '01:30')).toThrow();
    expect(() => londonScheduledAt('2026-02-30', '11:00')).toThrow();
    expect(() => londonScheduledAt('2026-12-10', '25:00')).toThrow();
  });

  it('starts the date chooser on today in London even when the phone UTC day differs', () => {
    vi.stubEnv('TZ', 'Pacific/Honolulu');
    const days = londonDateChoices(new Date('2026-07-10T23:30:00Z'));
    expect(days[0].value).toBe('2026-07-11');
    expect(days.at(-1)?.value).toBe('2026-07-25');
    expect(new Set(days.map(day => day.value)).size).toBe(15);
  });
});

describe('safe booking draft recovery', () => {
  const state = { ...initialBookingState, address: 'Synthetic Road', lat: 0, lng: -4.25,
    vehicleReg: 'AB12CDE', customerName: 'Synthetic Customer', customerEmail: 'customer@isolated.invalid',
    stripeClientSecret: 'pi_Private_secret_private', quoteId: 'expired-quote', breakdown: { subtotal: 100, vatAmount: 0, total: 100 },
    quoteExpiresAt: '2026-10-22T00:00:00Z' } satisfies BookingState;

  it('preserves entered contact and vehicle details, never reviving a price or Stripe client secret', () => {
    const encoded = bookingDraft(state, 'customer');
    expect(encoded).not.toContain('pi_Private_secret_private');
    const restored = restoreBookingDraft(encoded)!;
    expect(restored.state).toMatchObject({ address: 'Synthetic Road', lat: 0, lng: -4.25, vehicleReg: 'AB12CDE',
      customerName: 'Synthetic Customer', quoteId: null, breakdown: null, stripeClientSecret: null, selectedTyres: [] });
    expect(restored.step).toBe('service');
  });

  it('restores a pending payment into confirmation recovery without requiring another checkout secret', () => {
    const restored = restoreBookingDraft(bookingDraft({ ...state, pendingPaymentIntentId: 'pi_Pending123',
      bookingId: 'booking-identity', refNumber: 'TYR-ISOLATED', bookingAccessToken: 'booking-capability' }, 'payment'))!;
    expect(restored.step).toBe('payment');
    expect(restored.state).toMatchObject({ pendingPaymentIntentId: 'pi_Pending123', bookingId: 'booking-identity',
      refNumber: 'TYR-ISOLATED', bookingAccessToken: 'booking-capability', stripeClientSecret: null });
  });

  it('keeps an unresolved payment recoverable after an ordinary draft would expire', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const encoded = bookingDraft({ ...state, pendingPaymentIntentId: 'pi_Pending123', refNumber: 'TYR-ISOLATED',
      bookingAccessToken: 'booking-capability' }, 'payment');
    vi.advanceTimersByTime(72 * 3600000);
    expect(restoreBookingDraft(encoded)?.state.pendingPaymentIntentId).toBe('pi_Pending123');
  });

  it('recovers a durable attempt when the app closed before the Stripe sheet returned success', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const encoded = bookingDraft({ ...state, paymentAttemptIntentId: 'pi_Attempt123', pendingPaymentIntentId: null,
      refNumber: 'TYR-ISOLATED', bookingAccessToken: 'booking-capability' }, 'payment');
    vi.advanceTimersByTime(72 * 3600000);
    const restored = restoreBookingDraft(encoded)!;
    expect(restored.step).toBe('payment');
    expect(restored.state).toMatchObject({ pendingPaymentIntentId: 'pi_Attempt123',
      stripeClientSecret: null, refNumber: 'TYR-ISOLATED', bookingAccessToken: 'booking-capability' });
  });

  it('preserves a valid attempt even if a malformed pending field was saved beside it', () => {
    const restored = restoreBookingDraft(bookingDraft({ ...state, paymentAttemptIntentId: 'pi_Attempt123',
      pendingPaymentIntentId: 'malformed', refNumber: 'TYR-ISOLATED', bookingAccessToken: 'booking-capability' }, 'payment'))!;
    expect(restored.step).toBe('payment');
    expect(restored.state.pendingPaymentIntentId).toBe('pi_Attempt123');
  });

  it('does not treat a future timestamp as a permanently fresh draft', () => {
    expect(restoreBookingDraft(JSON.stringify({ version: 1, savedAt: Date.now() + 86400000, state }))).toBeNull();
  });

  it('preserves the chosen service, tyre quantity and uploaded photo for a fresh quote', () => {
    const restored = restoreBookingDraft(bookingDraft({ ...state, bookingType: 'scheduled', serviceType: 'fit',
      quantity: 3, lockingNutStatus: 'no_key', tyrePhotoUrl: 'https://isolated.invalid/tyre-photo.jpg',
      scheduledDate: '2026-10-25', scheduledTime: '11:00', fittingLocation: 'mobile' }, 'quote'))!;
    expect(restored.state).toMatchObject({ bookingType: 'scheduled', serviceType: 'fit', quantity: 3,
      lockingNutStatus: 'no_key', tyrePhotoUrl: 'https://isolated.invalid/tyre-photo.jpg',
      scheduledDate: '2026-10-25', scheduledTime: '11:00', fittingLocation: 'mobile', quoteId: null });
  });

  it('rejects expired ordinary drafts, malformed storage and unsupported versions', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    const encoded = bookingDraft(state, 'customer');
    vi.advanceTimersByTime(48 * 3600000 + 1);
    expect(restoreBookingDraft(encoded)).toBeNull();
    expect(restoreBookingDraft('{invalid')).toBeNull();
    expect(restoreBookingDraft(JSON.stringify({ version: 999, savedAt: Date.now(), state }))).toBeNull();
  });

  it('does not trust stale quotes, injected card details, out-of-range location, or a payment id without booking access', () => {
    const restored = restoreBookingDraft(JSON.stringify({ version: 1, savedAt: Date.now(), step: 'done', state: {
      ...state, lat: 91, lng: 181, pendingPaymentIntentId: 'pi_Unknown123', bookingAccessToken: null,
      cardNumber: 'synthetic-card-must-not-survive',
    } }))!;
    expect(restored.step).toBe('service');
    expect(restored.state).toMatchObject({ lat: null, lng: null, quoteId: null, breakdown: null, stripeClientSecret: null, pendingPaymentIntentId: null });
    expect(restored.state).not.toHaveProperty('cardNumber');
  });
});

describe('draft persistence ordering', () => {
  it('finishes an older delayed save before deleting, so clearing cannot resurrect private booking details', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    storage.set.mockImplementationOnce(async (_key, value) => { await gate; storage.value = value; });
    storage.remove.mockImplementation(async () => { storage.value = null; });
    const pending = saveBookingDraft({ ...initialBookingState, customerName: 'Previous Account' }, 'customer');
    const cleared = clearBookingDraft();
    release();
    await pending; await cleared;
    expect(storage.value).toBeNull();
  });

  it('can still clear and save a later draft after a failed storage write', async () => {
    storage.set.mockRejectedValueOnce(new Error('Synthetic storage unavailable'));
    await expect(saveBookingDraft(initialBookingState, 'service')).rejects.toThrow('Synthetic storage unavailable');
    await clearBookingDraft();
    storage.set.mockImplementationOnce(async (_key, value) => { storage.value = value; });
    await saveBookingDraft({ ...initialBookingState, vehicleReg: 'NEW123' }, 'details');
    expect(restoreBookingDraft(storage.value)?.state.vehicleReg).toBe('NEW123');
  });

  it('ignores a stale booking response that tries to save after its account session ended', async () => {
    storage.value = null;
    storage.set.mockImplementation(async (_key, value) => { storage.value = value; });
    const previousSession = bookingDraftSession();
    invalidateBookingDraftSession();
    await clearBookingDraft();
    await saveBookingDraft({ ...initialBookingState, customerName: 'Previous Account' }, 'customer', previousSession);
    expect(storage.value).toBeNull();
    await saveBookingDraft({ ...initialBookingState, customerName: 'Current Account' }, 'customer', bookingDraftSession());
    expect(restoreBookingDraft(storage.value)?.state.customerName).toBe('Current Account');
  });
});
