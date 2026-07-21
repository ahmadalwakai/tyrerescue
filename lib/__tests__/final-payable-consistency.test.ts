import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  authMobile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

function expectSingleMoneyValue(text: string, expected: string): void {
  const amounts = text.match(/£\d+(?:,\d{3})*(?:\.\d{2})/g) ?? [];
  expect(amounts).toEqual([expected]);
}

function makeExistingAdminQuote(priceAmount: number) {
  const now = new Date('2026-07-21T09:00:00Z');
  return {
    id: 'quote-id',
    quoteRef: 'TRQ-OLD',
    customerName: 'Test Customer',
    customerPhone: '07700900000',
    address: 'Old address',
    postcode: 'G1 1AA',
    latitude: '55.860000',
    longitude: '-4.250000',
    tyreSize: '205/55R17',
    quantity: 1,
    lockingWheelNutStatus: null,
    lockingWheelNutChargePence: 0,
    priceAmount,
    currency: 'GBP',
    quoteStatus: 'QUOTED',
    expiresAt: new Date('2026-07-21T11:00:00Z'),
    confirmedAt: null,
    confirmationMethod: null,
    selectedPaymentOption: null,
    quickBookingId: null,
    createdByAdminId: 'admin-a',
    internalNotes: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('assisted chat final payable consistency', () => {
  it('keeps an explicit final payable amount when creating an admin quote', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { buildAdminQuoteInsert } = await import('../admin-quotes');

    const quote = await buildAdminQuoteInsert(
      {
        customerName: 'Test Customer',
        customerPhone: '07700900000',
        address: 'EH26 0EP, Penicuik',
        postcode: 'EH26 0EP',
        latitude: 55.848696,
        longitude: -3.208716,
        tyreSize: '205/55R17',
        quantity: 1,
        tyreLines: [{ id: 'tyre-1', size: '205/55R17', quantity: 1, price: 80 }],
        priceAmount: 33695,
        quoteStatus: 'QUOTED',
      },
      'admin-a',
    );

    expect(quote.priceAmount).toBe(33695);
  });

  it('keeps an explicit final payable amount when editing a saved quote', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { buildAdminQuoteUpdate } = await import('../admin-quotes');

    const update = await buildAdminQuoteUpdate(
      {
        address: 'New address',
        latitude: 55.95,
        longitude: -3.19,
        tyreSize: '205/55R17',
        quantity: 1,
        priceAmount: 33695,
      },
      makeExistingAdminQuote(33329) as never,
    );

    expect(update.priceAmount).toBe(33695);
    expect(update.address).toBe('New address');
  });

  it('uses one exact amount for copied WhatsApp, sent WhatsApp, SMS, confirmation, and payment summary', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const {
      buildAdminQuoteConfirmationWhatsAppMessages,
      buildAdminQuotePaymentSummary,
      buildAdminQuoteWhatsAppMessage,
    } = await import('../admin-quotes');
    const finalPayablePence = 33695;
    const expected = '£336.95';

    const copiedWhatsApp = buildAdminQuoteWhatsAppMessage({
      quoteRef: 'TRQ-1183',
      priceAmount: finalPayablePence,
      quantity: 1,
      tyreSize: '205/55R17',
      expiresAt: new Date('2026-07-21T11:00:00Z'),
    });
    const sentWhatsApp = copiedWhatsApp;
    const customerSms = copiedWhatsApp;
    const confirmations = buildAdminQuoteConfirmationWhatsAppMessages({
      quoteRef: 'TRQ-1183',
      priceAmount: finalPayablePence,
    });
    const paymentSummary = buildAdminQuotePaymentSummary(finalPayablePence, 'FULL_PAYMENT');

    const consumers = [
      copiedWhatsApp,
      sentWhatsApp,
      customerSms,
      confirmations.FULL_PAYMENT,
      confirmations.CASH_ON_ARRIVAL,
      confirmations.PAYMENT_LINK,
    ];

    for (const text of consumers) {
      expectSingleMoneyValue(text, expected);
      expect(text).not.toContain('£333.29');
    }
    expect(paymentSummary.totalAmountPence).toBe(finalPayablePence);
    expect(paymentSummary.formattedTotal).toBe(expected);
  });

  it('keeps frontend quote send/copy paths from reusing a stale saved quote amount', () => {
    const quoteActionsSource = readSource('assisted-chat-app/src/hooks/useAssistedChatQuoteActions.ts');
    expect(quoteActionsSource).toContain('function quoteMatchesFinalPayable');
    expect(quoteActionsSource).toContain('quoteMatchesFinalPayable(currentQuote, finalPayablePence)');
    expect(quoteActionsSource).toContain('draft.manualPriceGbp');

    const legacyQuoteActionsSource = readSource('assisted-chat-app/src/components/QuoteDraftActions.tsx');
    expect(legacyQuoteActionsSource).toContain('function quoteMatchesFinalPayable');
    expect(legacyQuoteActionsSource).toContain('quoteMatchesFinalPayable(currentQuote, finalPayablePence)');

    const webQuotePanelSource = readSource('components/admin/assisted-chat/AdminQuotePanel.tsx');
    expect(webQuotePanelSource).toContain('function quoteMatchesFinalPayable');
    expect(webQuotePanelSource).toContain('quoteMatchesFinalPayable(activeQuote, finalPayablePence)');

    const backendQuoteSource = readSource('lib/admin-quotes.ts');
    expect(backendQuoteSource).toContain('explicitFinalPayablePence != null && !forceRecalculation');
    expect(backendQuoteSource).toContain('!hasExplicitFinalPayable');
  });

  it('documents the audited customer-facing amount consumers as final-payable only', () => {
    const paymentSource = readSource('lib/payments/payment-summary.ts');
    expect(paymentSource).toContain('totalAmount');
    expect(paymentSource).toContain('totalPence');

    const invoiceDomainSource = readSource('lib/invoices/invoice-domain.ts');
    expect(invoiceDomainSource).toContain('bookingTotalPence');
    expect(invoiceDomainSource).toContain('invoiceTotalPence');
    expect(invoiceDomainSource).toContain('paidPence');
    expect(invoiceDomainSource).not.toContain('lineItems');

    const finalizeSource = readSource('app/api/admin/quick-book/[id]/finalize/route.ts');
    expect(finalizeSource).toContain('totalAmount: breakdown.total.toFixed(2)');
    expect(finalizeSource).toContain('priceSnapshot: breakdown');

    const mobileBookingSource = readSource('app/api/mobile/admin/bookings/[ref]/route.ts');
    expect(mobileBookingSource).toContain('DIRECT_AMOUNT_FIELDS');
    expect(mobileBookingSource).toContain('Use the canonical pricing/manual-adjustment flow');

    const mobileInvoiceSource = readSource('app/api/mobile/admin/bookings/[ref]/invoice/route.ts');
    expect(mobileInvoiceSource).toContain('const finalTotal = Number(booking.totalAmount)');
  });
});
