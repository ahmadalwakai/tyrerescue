import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBookingConversionPayload } from '@/lib/analytics/booking-conversion';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('booking conversion payloads', () => {
  it('uses succeeded GBP server payment amounts without pence conversion', () => {
    expect(
      buildBookingConversionPayload({
        refNumber: 'TR-1001',
        customerEmail: ' CUSTOMER@Example.COM ',
        payment: {
          amount: '149.99',
          currency: 'gbp',
          status: 'succeeded',
          stripePiId: 'pi_123',
        },
      }),
    ).toEqual({
      transactionId: 'TR-1001',
      value: 149.99,
      currency: 'GBP',
      email: 'customer@example.com',
      paymentIntentId: 'pi_123',
    });
  });

  it('does not build conversions for processing payments', () => {
    expect(
      buildBookingConversionPayload({
        refNumber: 'TR-1002',
        payment: {
          amount: '149.99',
          currency: 'gbp',
          status: 'processing',
        },
      }),
    ).toBeNull();
  });

  it('does not build conversions for non-GBP payments', () => {
    expect(
      buildBookingConversionPayload({
        refNumber: 'TR-1003',
        payment: {
          amount: '149.99',
          currency: 'usd',
          status: 'succeeded',
        },
      }),
    ).toBeNull();
  });
});

describe('booking conversion integration guards', () => {
  it('keeps StepPayment from counting processing payments or dividing GBP totals by 100', () => {
    const source = readSource('components/booking/StepPayment.tsx');

    expect(source).not.toContain('breakdown.total / 100');
    expect(source).toContain("paymentIntent.status === 'processing'");
    expect(source).toContain('readServerConversion(data)');

    const processingBranch = source.slice(
      source.indexOf("paymentIntent.status === 'processing'"),
      source.indexOf('} else {', source.indexOf("paymentIntent.status === 'processing'")),
    );
    expect(processingBranch).not.toContain('trackBookingConversion');
  });

  it('derives success-page conversions from succeeded server payment records', () => {
    const pageSource = readSource('app/(public)/success/[ref]/page.tsx');
    const contentSource = readSource('app/(public)/success/[ref]/SuccessContent.tsx');

    expect(pageSource).toContain('from(payments)');
    expect(pageSource).toContain("eq(payments.status, 'succeeded')");
    expect(pageSource).toContain('buildBookingConversionPayload');
    expect(pageSource).toContain('paymentSucceeded: Boolean(succeededPayment)');

    expect(contentSource).toContain('booking.paymentSucceeded && !isPaidStatus(booking.status)');
    expect(contentSource).toContain('setServerConversion(conversion)');
    expect(contentSource).toContain('return () => clearInterval(interval);');
    expect(contentSource).not.toContain('booking.totalAmount, booking.customerEmail');
  });

  it('keeps booking payment confirmation on the Node runtime', () => {
    const confirmSource = readSource('app/api/bookings/confirm/route.ts');

    expect(confirmSource).toContain("export const runtime = 'nodejs'");
    expect(confirmSource).toContain("export const dynamic = 'force-dynamic'");
  });
});
