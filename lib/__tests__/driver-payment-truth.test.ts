import { beforeAll, describe, expect, it } from 'vitest';
import type { PaymentEvent } from '../db/schema';
import type { PaymentBookingInput } from '../payments/payment-summary';
import {
  formatGbpFromPence,
  getDriverCashToCollectPence,
  getDriverPaymentDisplay,
  type DriverPaymentSummaryInput,
} from '../../driver-app/src/lib/payment-status';

let buildDriverPaymentSummary: typeof import('../payments/payment-summary')['buildDriverPaymentSummary'];
let buildPaymentSummary: typeof import('../payments/payment-summary')['buildPaymentSummary'];

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/test';
  ({ buildDriverPaymentSummary, buildPaymentSummary } = await import('../payments/payment-summary'));
});

const baseBooking: PaymentBookingInput = {
  id: 'driver-booking-1', refNumber: 'TYR-DRIVER-TEST', status: 'driver_assigned',
  paymentType: 'cash', totalAmount: '120.00', depositAmountPence: null,
  remainingBalancePence: null, depositPaidAt: null, stripePiId: null,
};
const at = new Date('2026-10-21T10:00:00Z');
function event(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    id: 'receipt-1', bookingId: baseBooking.id, bookingRef: baseBooking.refNumber,
    eventType: 'payment_succeeded', paymentMethod: 'card_link', paidVia: 'payment_link',
    linkStatus: 'paid', amountPence: 12000, currency: 'gbp', stripePaymentIntentId: 'pi_driver_1',
    stripeSessionId: 'cs_driver_1', stripeCheckoutUrl: null, source: 'stripe_webhook',
    status: 'succeeded', metadata: null, occurredAt: at, expiresAt: null, createdAt: at,
    updatedAt: at, ...overrides,
  };
}
function summary(rows: PaymentEvent[] = [], overrides: Partial<PaymentBookingInput> = {}) {
  return buildDriverPaymentSummary({ ...baseBooking, ...overrides }, rows);
}
function legacy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacy-1', bookingId: baseBooking.id, stripePiId: 'pi_driver_1',
    amount: '120.00', currency: 'gbp', status: 'succeeded', stripePayload: null,
    createdAt: at, updatedAt: at, ...overrides,
  };
}

describe('driver server payment truth', () => {
  it('makes an unpaid cash job not paid with its exact cash due', () => {
    const result = summary();
    expect(result).toMatchObject({ state: 'cash_to_collect', paidPence: 0, settlementVerified: false,
      remainingBalancePence: 12000, cashToCollectPence: 12000 });
    expect(getDriverPaymentDisplay(result)).toMatchObject({ labelKey: 'payment.notPaid', amountLabel: '£120.00' });
  });

  it('shows only the cash remaining after a confirmed deposit', () => {
    const result = summary([event({ eventType: 'deposit_succeeded', amountPence: 2400,
      paymentMethod: 'deposit_link' })], { depositAmountPence: 2400, remainingBalancePence: 12000 });
    expect(result).toMatchObject({ state: 'cash_to_collect', method: 'cash', paidPence: 2400,
      amountToCollectPence: 9600, remainingBalancePence: 9600, cashToCollectPence: 9600, settlementVerified: false });
    expect(getDriverPaymentDisplay(result)).toMatchObject({ labelKey: 'payment.notPaid', amountLabel: '£96.00' });
  });

  it.each(['full', 'stripe', 'deposit'])('never exposes a collectable cash figure for %s bookings', (paymentType) => {
    const result = summary([event({ amountPence: 2400, eventType: 'deposit_succeeded' })], { paymentType });
    expect(result.cashToCollectPence).toBeNull();
    expect(getDriverPaymentDisplay(result)).toMatchObject({ labelKey: 'payment.notPaid', amountLabel: undefined });
  });

  it.each(['paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'])('does not infer payment from booking status %s', (status) => {
    expect(summary([], { status, paymentType: 'full' }).settlementVerified).toBe(false);
    expect(getDriverPaymentDisplay(summary([], { status })).labelKey).toBe('payment.notPaid');
  });

  it.each(['payment_succeeded', 'cash_confirmed', 'manual_paid'])('requires full amount for %s receipts', (eventType) => {
    const result = summary([event({ eventType, amountPence: 2400 })]);
    expect(result).toMatchObject({ settlementVerified: false, paidPence: 2400, amountToCollectPence: 9600 });
    expect(getDriverPaymentDisplay(result).labelKey).toBe('payment.notPaid');
  });

  it.each(['payment_succeeded', 'cash_confirmed', 'manual_paid'])('accepts full server-confirmed %s receipts', (eventType) => {
    const result = summary([event({ eventType })]);
    expect(result).toMatchObject({ state: 'paid', settlementVerified: true, paidPence: 12000,
      amountToCollectPence: 0, remainingBalancePence: 0, cashToCollectPence: null });
    expect(getDriverPaymentDisplay(result)).toMatchObject({ labelKey: 'payment.paid', tone: 'paid' });
    expect(getDriverPaymentDisplay(result).amountLabel).toBeUndefined();
  });

  it.each(['cash_confirmed', 'manual_paid'] as const)('requires review for %s claims with missing or unconfirmed legacy status', (eventType) => {
    for (const status of [null, '', 'unknown', 'pending', 'processing', 'failed']) {
      const result = summary([event({ eventType, status })]);
      expect(result, `${eventType}: ${String(status)}`).toMatchObject({
        state: 'needs_checking', settlementVerified: false, paidPence: 0,
        cashToCollectPence: null, amountToCollectPence: null,
      });
      expect(getDriverCashToCollectPence(result)).toBeNull();
      expect(getDriverPaymentDisplay(result)).toMatchObject({
        labelKey: 'payment.notPaid', descriptionKey: 'payment.checkWithAdmin', amountLabel: undefined,
      });
    }
  });

  it.each(['cash_confirmed', 'manual_paid'] as const)('never requests another collection for %s claims with malformed money', (eventType) => {
    for (const amountPence of [null, 0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = summary([event({ eventType, amountPence })]);
      expect(result, `${eventType}: ${String(amountPence)}`).toMatchObject({
        state: 'needs_checking', settlementVerified: false,
        cashToCollectPence: null, amountToCollectPence: null,
      });
      expect(getDriverPaymentDisplay(result).amountLabel).toBeUndefined();
    }
  });

  it.each(['cash_confirmed', 'manual_paid'] as const)('requires review for %s claims without a confirmed GBP amount', (eventType) => {
    for (const currency of [null, '', 'usd', 'eur']) {
      const result = summary([event({ eventType, currency })]);
      expect(result, `${eventType}: ${String(currency)}`).toMatchObject({
        state: 'needs_checking', settlementVerified: false,
        cashToCollectPence: null, amountToCollectPence: null,
      });
      expect(getDriverPaymentDisplay(result).amountLabel).toBeUndefined();
    }
  });

  it.each(['cash_confirmed', 'manual_paid'] as const)('holds legacy %s claims that have no receipt details for admin review', (eventType) => {
    const rows = [event({ eventType, status: null, amountPence: null, currency: null })];
    const result = summary(rows);
    expect(result).toMatchObject({ state: 'needs_checking', settlementVerified: false,
      cashToCollectPence: null, amountToCollectPence: null });
    expect(getDriverPaymentDisplay(result)).toMatchObject({
      descriptionKey: 'payment.checkWithAdmin', amountLabel: undefined,
    });
    expect(buildPaymentSummary(baseBooking, rows).state).toBe('paid');
  });

  it('does not count a deposit timestamp as a receipt', () => {
    const result = summary([], { depositAmountPence: 2400, remainingBalancePence: 9600, depositPaidAt: at });
    expect(result).toMatchObject({ paidPence: 0, cashToCollectPence: 12000, settlementVerified: false });
  });

  it.each(['processing', 'pending', 'failed', null])('does not count an unconfirmed %s receipt', (status) => {
    expect(summary([event({ status })]).settlementVerified).toBe(false);
  });

  it.each(['eur', 'usd', null])('does not count a receipt in %s currency', (currency) => {
    expect(summary([event({ currency })])).toMatchObject({ settlementVerified: false, state: 'needs_checking' });
  });

  it.each([null, 0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('does not count malformed receipt amount %s', (amountPence) => {
    expect(summary([event({ amountPence })]).settlementVerified).toBe(false);
  });

  it('ignores receipts for a different booking', () => {
    expect(summary([event({ bookingId: 'another-booking' })])).toMatchObject({ paidPence: 0, settlementVerified: false });
  });

  it('ignores a receipt with a conflicting booking reference', () => {
    expect(summary([event({ bookingRef: 'TYR-OTHER' })])).toMatchObject({ paidPence: 0, settlementVerified: false });
  });

  it('deduplicates repeated success/deposit receipts for a single PaymentIntent', () => {
    const result = summary([event({ amountPence: 6000 }), event({ id: 'receipt-2', eventType: 'deposit_succeeded', amountPence: 6000 })]);
    expect(result).toMatchObject({ paidPence: 6000, cashToCollectPence: 6000, settlementVerified: false });
  });

  it('requires admin review for conflicting amounts on duplicate receipt identities', () => {
    const result = summary([event(), event({ id: 'receipt-2', amountPence: 6000 })]);
    expect(result).toMatchObject({ settlementVerified: false, state: 'needs_checking', cashToCollectPence: null });
  });

  it('deduplicates a session receipt followed by a receipt linking that session and intent', () => {
    const result = summary([event({ amountPence: 6000, stripePaymentIntentId: null }), event({ id: 'receipt-2', amountPence: 6000 })]);
    expect(result.paidPence).toBe(6000);
    expect(result.settlementVerified).toBe(false);
  });

  it('counts distinct confirmed receipts toward the final booking balance', () => {
    const result = summary([event({ amountPence: 2400 }), event({ id: 'receipt-2', amountPence: 9600,
      stripePaymentIntentId: 'pi_balance', stripeSessionId: 'cs_balance' })]);
    expect(result).toMatchObject({ paidPence: 12000, settlementVerified: true });
  });

  it('does not count legacy and canonical storage twice', () => {
    const result = buildDriverPaymentSummary(baseBooking, [event({ amountPence: 6000 })], [legacy({ amount: '60.00' })]);
    expect(result).toMatchObject({ paidPence: 6000, settlementVerified: false });
  });

  it('accepts a confirmed legacy payment for the same booking only', () => {
    expect(buildDriverPaymentSummary(baseBooking, [], [legacy()]).settlementVerified).toBe(true);
    expect(buildDriverPaymentSummary(baseBooking, [], [legacy({ bookingId: 'another-booking' })]).settlementVerified).toBe(false);
  });

  it.each(['cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial', 'payment_failed'])('never labels closed/blocked %s jobs paid or collectable', (status) => {
    const result = summary([event()], { status });
    expect(result).toMatchObject({ settlementVerified: false, cashToCollectPence: null, amountToCollectPence: null });
    expect(getDriverPaymentDisplay(result).labelKey).toBe('payment.notPaid');
  });

  it('subtracts a confirmed partial refund and deduplicates refund deliveries', () => {
    const refund = event({ id: 'refund-1', eventType: 'refund_succeeded', amountPence: 2400, metadata: { stripeRefundId: 're_1' } });
    const result = summary([event(), refund, { ...refund, id: 'refund-retry' }]);
    expect(result).toMatchObject({ paidPence: 9600, settlementVerified: false, cashToCollectPence: null, state: 'needs_checking' });
  });

  it('requires admin review while a refund is pending', () => {
    const result = summary([event(), event({ eventType: 'refund_created', status: 'pending' })]);
    expect(result).toMatchObject({ settlementVerified: false, cashToCollectPence: null, state: 'needs_checking' });
  });

  it('does not treat a one penny short payment as fully paid', () => {
    expect(summary([event({ amountPence: 11999 })])).toMatchObject({ settlementVerified: false, cashToCollectPence: 1 });
    expect(summary([event({ amountPence: 12033 })], { totalAmount: '120.33' }).settlementVerified).toBe(true);
  });

  it('leaves default administrative summary behaviour unchanged', () => {
    const administrative = buildPaymentSummary(baseBooking, [event({ eventType: 'manual_paid', amountPence: 2400 })]);
    expect(administrative.state).toBe('paid');
    expect(administrative).not.toHaveProperty('settlementVerified');
    expect(administrative).not.toHaveProperty('cashToCollectPence');
  });
});

describe('driver display rejects inconsistent or stale server data', () => {
  it('says not paid for a missing summary', () => {
    expect(getDriverPaymentDisplay(null)).toMatchObject({ labelKey: 'payment.notPaid', tone: 'warning', amountLabel: undefined });
  });

  it.each([
    { settlementVerified: undefined }, { settlementVerified: false }, { paidPence: 11999 },
    { amountToCollectPence: 1 }, { remainingBalancePence: 1 }, { totalPence: null },
    { paidPence: Number.POSITIVE_INFINITY }, { state: 'pending' },
  ])('does not trust a paid string with inconsistent evidence %j', (override) => {
    const result = { ...summary([event()]), ...override } as DriverPaymentSummaryInput;
    expect(getDriverPaymentDisplay(result).labelKey).toBe('payment.notPaid');
  });

  it('suppresses cash values when balances disagree', () => {
    const result = { ...summary(), cashToCollectPence: 2400 };
    expect(getDriverCashToCollectPence(result)).toBeNull();
    expect(getDriverPaymentDisplay(result).amountLabel).toBeUndefined();
  });

  it.each([null, undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('does not format invalid pence %s', (value) => {
    expect(formatGbpFromPence(value)).toBeNull();
  });
});
