import { describe, expect, it } from 'vitest';
import { computeDriverPaymentSummary } from '../payments/driver-payment';

const baseInput = {
  totalAmount: '120.00',
  subtotal: '100.00',
  vatAmount: '20.00',
  depositAmountPence: null,
  remainingBalancePence: null,
  depositPaidAt: null,
  stripePiId: null,
};

describe('computeDriverPaymentSummary', () => {
  it('returns cash bookings as unpaid with the full amount to collect', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'cash',
    });

    expect(payment).toMatchObject({
      type: 'cash',
      status: 'unpaid',
      totalAmountPence: 12000,
      amountToCollectPence: 12000,
    });
  });

  it('normalises full Stripe bookings as pending until a succeeded payment row proves payment', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_full',
      bookingStatus: 'awaiting_payment',
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'pending',
      amountToCollectPence: 12000,
      totalPaidPence: 0,
    });
  });

  it('keeps the TYR-2026-16396 payload pending instead of paid', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      totalAmount: '191.60',
      subtotal: '191.60',
      vatAmount: '0.00',
      paymentType: 'stripe',
      stripePiId: 'cs_live_pending_checkout_session',
      bookingStatus: 'awaiting_payment',
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'pending',
      totalAmountPence: 19160,
      amountToCollectPence: 19160,
      paymentStatus: null,
      totalPaidPence: 0,
      bookingStatus: 'awaiting_payment',
    });
  });

  it('does not mark assigned full-online bookings paid without payment evidence', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_full',
      bookingStatus: 'driver_assigned',
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'needs_checking',
      amountToCollectPence: 12000,
      totalPaidPence: 0,
    });
  });

  it('keeps pending payment rows pending even if the booking lifecycle says paid', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_full',
      bookingStatus: 'paid',
      paymentStatus: 'pending',
      totalPaidPence: 0,
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'pending',
      amountToCollectPence: 12000,
      paymentStatus: 'pending',
      totalPaidPence: 0,
    });
  });

  it('shows full online bookings as paid only after succeeded payment evidence', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_full',
      bookingStatus: 'driver_assigned',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'paid',
      amountToCollectPence: 0,
      totalPaidPence: 12000,
    });
  });

  it('shows paid deposits with the remaining balance to collect', () => {
    const paidAt = new Date('2026-06-06T12:00:00.000Z');
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'deposit',
      depositAmountPence: 1800,
      remainingBalancePence: 10200,
      depositPaidAt: paidAt,
      stripePiId: 'pi_deposit',
      paymentStatus: 'succeeded',
      totalPaidPence: 1800,
    });

    expect(payment).toMatchObject({
      type: 'deposit',
      status: 'deposit_paid',
      depositAmountPence: 1800,
      remainingBalancePence: 10200,
      amountToCollectPence: 10200,
      depositPaidAt: paidAt.toISOString(),
    });
  });

  it('shows deposits as fully paid only when the remaining balance is settled', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'deposit',
      depositAmountPence: 12000,
      remainingBalancePence: 0,
      depositPaidAt: new Date('2026-06-06T12:00:00.000Z'),
      stripePiId: 'pi_deposit',
      bookingStatus: 'paid',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(payment).toMatchObject({
      type: 'deposit',
      status: 'paid',
      amountToCollectPence: 0,
    });
  });

  it('shows selected but unpaid deposits as outstanding', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'deposit',
      depositAmountPence: 1800,
      remainingBalancePence: 10200,
    });

    expect(payment).toMatchObject({
      type: 'deposit',
      status: 'unpaid',
      amountToCollectPence: 12000,
    });
  });

  it('marks impossible deposit lifecycle data as needing checking', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'deposit',
      depositAmountPence: 1800,
      remainingBalancePence: 10200,
      bookingStatus: 'driver_assigned',
    });

    expect(payment).toMatchObject({
      type: 'deposit',
      status: 'needs_checking',
      amountToCollectPence: 12000,
    });
  });

  it('reconciles legacy full-paid rows only when payment evidence proves payment', () => {
    const withoutStatus = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: null,
      stripePiId: 'pi_pending_or_legacy',
    });

    expect(withoutStatus).toMatchObject({
      type: null,
      status: 'pending',
      amountToCollectPence: 12000,
    });

    const withPaidEvidence = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: null,
      stripePiId: 'pi_legacy_paid',
      bookingStatus: 'driver_assigned',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(withPaidEvidence).toMatchObject({
      type: 'full',
      status: 'paid',
      amountToCollectPence: 0,
    });
  });

  it('shows stripe-paid bookings as paid even when booking lifecycle is awaiting_payment', () => {
    // Bug scenario: Stripe webhook recorded payment but booking status not yet updated.
    // Admin page shows "Awaiting Payment" (lifecycle); driver/evidence should show "Paid".
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_live_succeeded',
      bookingStatus: 'awaiting_payment',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'paid',
      amountToCollectPence: 0,
      totalPaidPence: 12000,
    });
  });

  it('shows deposit-type unpaid bookings as unpaid not pending', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'deposit',
      depositAmountPence: 1800,
      remainingBalancePence: 10200,
      bookingStatus: 'awaiting_payment',
    });

    expect(payment).toMatchObject({
      type: 'deposit',
      status: 'unpaid',
      amountToCollectPence: 12000,
    });
  });

  it('shows cash bookings with succeeded evidence as paid', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'cash',
      bookingStatus: 'completed',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(payment).toMatchObject({
      type: 'cash',
      status: 'paid',
      amountToCollectPence: 0,
    });
  });

  it('does not expose internal Stripe ids in driver-facing output', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'full',
      stripePiId: 'pi_secret',
      bookingStatus: 'paid',
      paymentStatus: 'succeeded',
      totalPaidPence: 12000,
    });

    expect(payment).not.toHaveProperty('stripePiId');
  });
});
