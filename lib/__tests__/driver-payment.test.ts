import { beforeAll, describe, expect, it } from 'vitest';
import type { PaymentEvent } from '../db/schema';
import type { PaymentBookingInput } from '../payments/payment-summary';

type BuildPaymentSummary = typeof import('../payments/payment-summary')['buildPaymentSummary'];
type IsPaymentFullySettledForInvoice = typeof import('../payments/payment-summary')['isPaymentFullySettledForInvoice'];

let buildPaymentSummary: BuildPaymentSummary;
let isPaymentFullySettledForInvoice: IsPaymentFullySettledForInvoice;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/test';
  ({ buildPaymentSummary, isPaymentFullySettledForInvoice } = await import('../payments/payment-summary'));
});

const baseBooking: PaymentBookingInput = {
  id: 'booking-1',
  refNumber: 'TYR-2026-TEST',
  status: 'awaiting_payment',
  paymentType: null,
  totalAmount: '120.00',
  subtotal: '100.00',
  vatAmount: '20.00',
  depositAmountPence: null,
  remainingBalancePence: null,
  depositPaidAt: null,
  stripePiId: null,
  stripeDepositPiId: null,
};

function booking(overrides: Partial<PaymentBookingInput>): PaymentBookingInput {
  return { ...baseBooking, ...overrides };
}

function ledgerEvent(overrides: Partial<PaymentEvent>): PaymentEvent {
  const now = new Date('2026-06-18T10:00:00.000Z');
  return {
    id: `event-${overrides.eventType ?? 'test'}`,
    bookingId: baseBooking.id,
    bookingRef: baseBooking.refNumber,
    eventType: 'link_sent',
    paymentMethod: null,
    paidVia: null,
    linkStatus: null,
    amountPence: null,
    currency: 'gbp',
    stripeSessionId: null,
    stripePaymentIntentId: null,
    stripeCheckoutUrl: null,
    source: 'system',
    status: null,
    metadata: null,
    occurredAt: now,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function legacyPayment(overrides: Record<string, unknown>) {
  const now = new Date('2026-06-18T10:00:00.000Z');
  return {
    id: 'legacy-payment',
    bookingId: baseBooking.id,
    stripePiId: 'pi_legacy',
    amount: '120.00',
    currency: 'gbp',
    status: 'pending',
    stripePayload: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('buildPaymentSummary', () => {
  it('shows cash bookings as cash to collect until cash is confirmed', () => {
    const payment = buildPaymentSummary(booking({ paymentType: 'cash' }), []);

    expect(payment).toMatchObject({
      state: 'cash_to_collect',
      method: 'cash',
      paidVia: null,
      totalPence: 12000,
      amountToCollectPence: 12000,
      reason: 'cash_unpaid',
    });
  });

  it('shows sent payment links as pending, not paid', () => {
    const payment = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'cs_test_pending' }),
      [
        ledgerEvent({
          eventType: 'link_sent',
          paymentMethod: 'card_link',
          linkStatus: 'sent',
          amountPence: 12000,
          stripeSessionId: 'cs_test_pending',
          stripeCheckoutUrl: 'https://checkout.stripe.test/session',
          source: 'admin',
          status: 'pending',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'pending',
      linkStatus: 'sent',
      method: 'card_link',
      paidVia: null,
      amountToCollectPence: 12000,
      reason: 'link_sent_waiting',
    });
  });

  it('does not treat a settled booking lifecycle as paid without payment evidence', () => {
    const payment = buildPaymentSummary(
      booking({ status: 'driver_assigned', paymentType: 'full' }),
      [],
    );

    expect(payment).toMatchObject({
      state: 'needs_checking',
      reason: 'booking_paid_without_payment_evidence',
      amountToCollectPence: 12000,
    });
  });

  it('keeps pending link state visible even after assignment', () => {
    const payment = buildPaymentSummary(
      booking({ status: 'driver_assigned', paymentType: 'full', stripePiId: 'cs_live_pending' }),
      [
        ledgerEvent({
          eventType: 'link_sent',
          paymentMethod: 'card_link',
          linkStatus: 'sent',
          amountPence: 12000,
          stripeSessionId: 'cs_live_pending',
          source: 'admin',
          status: 'pending',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'pending',
      linkStatus: 'sent',
      amountToCollectPence: 12000,
    });
  });

  it('shows full payment success as paid only from ledger evidence', () => {
    const payment = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_paid' }),
      [
        ledgerEvent({
          eventType: 'payment_succeeded',
          paymentMethod: 'card_link',
          paidVia: 'payment_link',
          linkStatus: 'paid',
          amountPence: 12000,
          stripePaymentIntentId: 'pi_paid',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'paid',
      linkStatus: 'paid',
      paidVia: 'payment_link',
      paidPence: 12000,
      amountToCollectPence: 0,
    });
  });

  it('shows paid deposits as balance due with a paid deposit link', () => {
    const payment = buildPaymentSummary(
      booking({
        paymentType: 'deposit',
        totalAmount: '120.00',
        depositAmountPence: 2400,
        remainingBalancePence: 9600,
        stripeDepositPiId: 'pi_deposit',
      }),
      [
        ledgerEvent({
          eventType: 'deposit_succeeded',
          paymentMethod: 'deposit_link',
          paidVia: 'payment_link',
          linkStatus: 'paid',
          amountPence: 2400,
          stripePaymentIntentId: 'pi_deposit',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'balance_due',
      method: 'deposit_link',
      linkStatus: 'paid',
      paidVia: 'payment_link',
      depositAmountPence: 2400,
      depositPaidPence: 2400,
      remainingBalancePence: 9600,
      amountToCollectPence: 9600,
      reason: 'deposit_paid_balance_due',
    });
  });

  it('shows cash-confirmed jobs as paid by cash', () => {
    const payment = buildPaymentSummary(
      booking({ paymentType: 'cash', status: 'completed' }),
      [
        ledgerEvent({
          eventType: 'cash_confirmed',
          paymentMethod: 'cash',
          paidVia: 'cash',
          amountPence: 12000,
          source: 'driver_confirmation',
          status: 'succeeded',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'paid',
      method: 'cash',
      paidVia: 'cash',
      amountToCollectPence: 0,
      reason: 'cash_confirmed',
    });
  });

  it('shows failed link attempts as failed', () => {
    const payment = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_failed' }),
      [
        ledgerEvent({
          eventType: 'payment_failed',
          paymentMethod: 'card_link',
          linkStatus: 'failed',
          amountPence: 12000,
          stripePaymentIntentId: 'pi_failed',
          source: 'stripe_webhook',
          status: 'failed',
        }),
      ],
    );

    expect(payment).toMatchObject({
      state: 'failed',
      linkStatus: 'failed',
      amountToCollectPence: 12000,
      reason: 'link_failed',
    });
  });

  it('uses legacy payments only as a fallback when no matching ledger event exists', () => {
    const pending = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'cs_legacy' }),
      [],
      [
        legacyPayment({
          stripePiId: 'cs_legacy',
          stripePayload: {
            sessionId: 'cs_legacy',
            checkoutUrl: 'https://checkout.stripe.test/legacy',
          },
        }),
      ],
    );

    expect(pending).toMatchObject({
      state: 'pending',
      linkStatus: 'sent',
      reason: 'link_sent_waiting',
    });

    const paid = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_legacy_paid' }),
      [],
      [
        legacyPayment({
          stripePiId: 'pi_legacy_paid',
          status: 'succeeded',
        }),
      ],
    );

    expect(paid).toMatchObject({
      state: 'paid',
      paidVia: 'payment_link',
      amountToCollectPence: 0,
    });
  });

  it('allows invoice download only when paid evidence covers the final payable amount', () => {
    const fullPaid = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_paid' }),
      [
        ledgerEvent({
          eventType: 'payment_succeeded',
          paymentMethod: 'card_link',
          paidVia: 'payment_link',
          linkStatus: 'paid',
          amountPence: 12000,
          stripePaymentIntentId: 'pi_paid',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );

    expect(isPaymentFullySettledForInvoice(fullPaid, 'paid')).toBe(true);
  });

  it('blocks invoice download for lifecycle-paid bookings without full payment evidence', () => {
    const statusOnlyPaid = buildPaymentSummary(
      booking({ status: 'completed', paymentType: 'full' }),
      [],
    );

    expect(statusOnlyPaid.state).toBe('needs_checking');
    expect(isPaymentFullySettledForInvoice(statusOnlyPaid, 'completed')).toBe(false);
  });

  it('blocks invoice download for deposit-only and partial-payment states', () => {
    const depositOnly = buildPaymentSummary(
      booking({
        paymentType: 'deposit',
        depositAmountPence: 2400,
        remainingBalancePence: 9600,
        stripeDepositPiId: 'pi_deposit',
      }),
      [
        ledgerEvent({
          eventType: 'deposit_succeeded',
          paymentMethod: 'deposit_link',
          paidVia: 'payment_link',
          linkStatus: 'paid',
          amountPence: 2400,
          stripePaymentIntentId: 'pi_deposit',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );
    const partialFull = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_partial' }),
      [
        ledgerEvent({
          eventType: 'payment_succeeded',
          paymentMethod: 'card_link',
          paidVia: 'payment_link',
          amountPence: 6000,
          stripePaymentIntentId: 'pi_partial',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );

    expect(isPaymentFullySettledForInvoice(depositOnly, 'deposit_paid')).toBe(false);
    expect(isPaymentFullySettledForInvoice(partialFull, 'awaiting_payment')).toBe(false);
  });

  it('blocks invoice download for failed, expired, cancelled, refunded, and unknown states', () => {
    const failed = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'pi_failed' }),
      [ledgerEvent({ eventType: 'payment_failed', amountPence: 12000, status: 'failed' })],
    );
    const expired = buildPaymentSummary(
      booking({ paymentType: 'full', stripePiId: 'cs_expired' }),
      [ledgerEvent({ eventType: 'link_expired', amountPence: 12000, status: 'expired' })],
    );
    const unknown = buildPaymentSummary(booking({ totalAmount: null }), []);
    const refundedPaid = buildPaymentSummary(
      booking({ status: 'refunded', paymentType: 'full', stripePiId: 'pi_refunded' }),
      [
        ledgerEvent({
          eventType: 'payment_succeeded',
          paymentMethod: 'card_link',
          paidVia: 'payment_link',
          amountPence: 12000,
          stripePaymentIntentId: 'pi_refunded',
          source: 'stripe_webhook',
          status: 'succeeded',
        }),
      ],
    );

    expect(isPaymentFullySettledForInvoice(failed, 'payment_failed')).toBe(false);
    expect(isPaymentFullySettledForInvoice(expired, 'awaiting_payment')).toBe(false);
    expect(isPaymentFullySettledForInvoice(unknown, null)).toBe(false);
    expect(isPaymentFullySettledForInvoice(refundedPaid, 'refunded')).toBe(false);
    expect(isPaymentFullySettledForInvoice(refundedPaid, 'refunded_partial')).toBe(false);
    expect(isPaymentFullySettledForInvoice(refundedPaid, 'cancelled')).toBe(false);
  });
});
