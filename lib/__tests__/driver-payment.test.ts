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

  it('normalises full Stripe bookings to paid with nothing to collect', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'stripe',
      stripePiId: 'pi_full',
    });

    expect(payment).toMatchObject({
      type: 'full',
      status: 'paid',
      amountToCollectPence: 0,
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

  it('reconciles legacy full-paid rows only when lifecycle status proves payment', () => {
    const withoutStatus = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: null,
      stripePiId: 'pi_pending_or_legacy',
    });

    expect(withoutStatus).toMatchObject({
      type: null,
      status: 'unknown',
      amountToCollectPence: 12000,
    });

    const withPaidLifecycle = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: null,
      stripePiId: 'pi_legacy_paid',
      bookingStatus: 'driver_assigned',
    });

    expect(withPaidLifecycle).toMatchObject({
      type: 'full',
      status: 'paid',
      amountToCollectPence: 0,
    });
  });

  it('does not expose internal Stripe ids in driver-facing output', () => {
    const payment = computeDriverPaymentSummary({
      ...baseInput,
      paymentType: 'full',
      stripePiId: 'pi_secret',
    });

    expect(payment).not.toHaveProperty('stripePiId');
  });
});
