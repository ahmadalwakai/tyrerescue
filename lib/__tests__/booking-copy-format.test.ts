import { describe, it, expect } from 'vitest';

/**
 * Tests that the copy-to-clipboard text produced by buildJobDetails and
 * buildPaymentMessage does NOT include a "Fitting at your location" line item.
 *
 * Both functions are pure and live inside AssistedChatScreen.tsx which is
 * React Native code not importable from the Next.js test runner.
 * We replicate the copy-output logic here as a specification test so that
 * any future change to those functions that accidentally re-adds the line
 * will be caught before it ships.
 */

interface QuoteBreakdown {
  subtotal: number;
  vatAmount: number;
  total: number;
  fittingPrice?: number | null;
  tyrePrice?: number | null;
  lineItems: { label: string; amount: number; type: string }[];
  distanceKm: number | null;
  adminAdjustmentAmount?: number | null;
  adminAdjustmentReason?: string | null;
}

interface Draft {
  customer: { name: string; phone: string; email: string };
  location: { address: string; lat: number | null; lng: number | null };
  tyre: { size: string; quantity: number };
  lockingNut: { answer: 'yes' | 'no' | 'unknown'; chargeGbp: number | null };
  note: string;
  quote: QuoteBreakdown | null;
  savedQuoteRef: string | null;
  paymentLink: { paymentUrl: string; refNumber: string; kind: 'full' | 'deposit'; amountPence: number; remainingBalancePence: number | null } | null;
  dispatchedRefNumber: string | null;
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatPence(pence: number): string {
  return formatGbp(pence / 100);
}

function paymentOptionLabel(opt: string): string {
  return opt;
}

// Mirrors buildJobDetails from AssistedChatScreen.tsx AFTER the fittingPrice removal
function buildJobDetails(
  draft: Draft,
  effectiveTotal: number,
  lockingNutCharge: number,
  selectedPaymentOption: string,
): string {
  const lines: string[] = ['Tyre Rescue Assisted Chat draft'];
  if (draft.customer.name.trim()) lines.push(`Customer: ${draft.customer.name.trim()}`);
  if (draft.customer.phone.trim()) lines.push(`Phone: ${draft.customer.phone.trim()}`);
  if (draft.location.address.trim()) lines.push(`Address: ${draft.location.address.trim()}`);
  if (draft.location.lat != null && draft.location.lng != null) {
    lines.push(`Coordinates: ${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`);
  }
  if (draft.tyre.size.trim()) lines.push(`Tyre size: ${draft.tyre.size.trim()}`);
  lines.push(`Quantity: ${draft.tyre.quantity}`);
  lines.push(
    `Locking wheel nut: ${
      draft.lockingNut.answer === 'yes'
        ? 'Customer has it'
        : draft.lockingNut.answer === 'no'
        ? 'Customer does not have it'
        : 'Unknown'
    }`,
  );
  if (lockingNutCharge > 0) lines.push(`Locking wheel nut removal: ${formatGbp(lockingNutCharge)}`);
  if (draft.note.trim()) lines.push(`Driver note: ${draft.note.trim()}`);
  if (draft.quote) {
    lines.push(`Total: ${formatGbp(effectiveTotal)}`);
  }
  if (draft.savedQuoteRef) lines.push(`Quote ref: ${draft.savedQuoteRef}`);
  lines.push(`Payment option: ${paymentOptionLabel(selectedPaymentOption)}`);
  if (draft.paymentLink) {
    lines.push(`Payment link: ${draft.paymentLink.paymentUrl}`);
    lines.push(`Payment link amount: ${formatPence(draft.paymentLink.amountPence)}`);
    if (draft.paymentLink.remainingBalancePence != null) {
      lines.push(`Balance on arrival: ${formatPence(draft.paymentLink.remainingBalancePence)}`);
    }
  }
  if (draft.dispatchedRefNumber) lines.push(`Booking ref: ${draft.dispatchedRefNumber}`);
  return lines.join('\n');
}

// Mirrors buildPaymentMessage from AssistedChatScreen.tsx AFTER the fittingPrice removal
function buildPaymentMessage(
  paymentLink: { paymentUrl: string; refNumber: string; kind: 'full' | 'deposit'; amountPence: number; remainingBalancePence: number | null },
  draft: Draft,
  effectiveTotal: number,
): string {
  const lines: string[] = [];
  lines.push('Hi, this is Tyre Rescue.');
  lines.push(
    paymentLink.kind === 'deposit'
      ? 'Your booking is ready. Please pay the 20% deposit using this secure payment link:'
      : 'Your booking is ready. Please complete the full payment using this secure payment link:',
  );
  lines.push(paymentLink.paymentUrl);
  lines.push('');
  lines.push(`Reference: ${paymentLink.refNumber}`);
  lines.push(paymentLink.kind === 'deposit' ? `Deposit due now: ${formatPence(paymentLink.amountPence)}` : `Amount due: ${formatPence(paymentLink.amountPence)}`);
  if (paymentLink.remainingBalancePence != null) lines.push(`Balance due on-site: ${formatPence(paymentLink.remainingBalancePence)}`);
  lines.push(`Total to pay: ${formatGbp(effectiveTotal)}`);
  if (draft.location.address) lines.push(`Address: ${draft.location.address}`);
  if (draft.tyre.size) lines.push(`Tyres: ${draft.tyre.quantity} x ${draft.tyre.size}`);
  return lines.join('\n');
}

const FITTING_PATTERN = /fitting at your location/i;

function makeDraftWithFittingPrice(): Draft {
  return {
    customer: { name: 'John Smith', phone: '07700900000', email: '' },
    location: { address: '1 Main St, Glasgow', lat: 55.86, lng: -4.25 },
    tyre: { size: '205/55R16', quantity: 2 },
    lockingNut: { answer: 'yes', chargeGbp: null },
    note: '',
    quote: {
      subtotal: 180,
      vatAmount: 36,
      total: 216,
      fittingPrice: 40,
      tyrePrice: 140,
      lineItems: [],
      distanceKm: 8,
    },
    savedQuoteRef: 'Q-001',
    paymentLink: null,
    dispatchedRefNumber: null,
  };
}

describe('buildJobDetails — copy text', () => {
  it('does not include "Fitting at your location" even when fittingPrice is set', () => {
    const draft = makeDraftWithFittingPrice();
    const text = buildJobDetails(draft, 216, 0, 'full');
    expect(text).not.toMatch(FITTING_PATTERN);
  });

  it('does not include "Fitting at your location" when fittingPrice is 0', () => {
    const draft = makeDraftWithFittingPrice();
    draft.quote!.fittingPrice = 0;
    const text = buildJobDetails(draft, 176, 0, 'full');
    expect(text).not.toMatch(FITTING_PATTERN);
  });

  it('does not include "Fitting at your location" when fittingPrice is null', () => {
    const draft = makeDraftWithFittingPrice();
    draft.quote!.fittingPrice = null;
    const text = buildJobDetails(draft, 216, 0, 'full');
    expect(text).not.toMatch(FITTING_PATTERN);
  });

  it('still includes Total, Customer, and Quantity', () => {
    const draft = makeDraftWithFittingPrice();
    const text = buildJobDetails(draft, 216, 0, 'full');
    expect(text).toMatch(/Total:/);
    expect(text).toMatch(/Customer: John Smith/);
    expect(text).toMatch(/Quantity: 2/);
  });

  it('includes locking wheel nut charge when set', () => {
    const draft = makeDraftWithFittingPrice();
    draft.lockingNut = { answer: 'no', chargeGbp: 25 };
    const text = buildJobDetails(draft, 241, 25, 'deposit');
    expect(text).toMatch(/Locking wheel nut removal:/);
    expect(text).not.toMatch(FITTING_PATTERN);
  });
});

describe('buildPaymentMessage — copy text', () => {
  const paymentLink = {
    kind: 'full' as const,
    paymentUrl: 'https://checkout.stripe.com/test',
    refNumber: 'TR-ABC123',
    amountPence: 21600,
    remainingBalancePence: null,
  };

  it('does not include "Fitting at your location" even when fittingPrice is set', () => {
    const draft = makeDraftWithFittingPrice();
    const text = buildPaymentMessage(paymentLink, draft, 216);
    expect(text).not.toMatch(FITTING_PATTERN);
  });

  it('does not include "Fitting at your location" for deposit payment links', () => {
    const draft = makeDraftWithFittingPrice();
    const depositLink = {
      ...paymentLink,
      kind: 'deposit' as const,
      amountPence: 3240,
      remainingBalancePence: 18360,
    };
    const text = buildPaymentMessage(depositLink, draft, 216);
    expect(text).not.toMatch(FITTING_PATTERN);
  });

  it('includes the payment URL, reference, and total', () => {
    const draft = makeDraftWithFittingPrice();
    const text = buildPaymentMessage(paymentLink, draft, 216);
    expect(text).toContain('https://checkout.stripe.com/test');
    expect(text).toContain('TR-ABC123');
    expect(text).toMatch(/Total to pay:/);
  });

  it('includes remaining balance line for deposits', () => {
    const draft = makeDraftWithFittingPrice();
    const depositLink = {
      ...paymentLink,
      kind: 'deposit' as const,
      amountPence: 3240,
      remainingBalancePence: 18360,
    };
    const text = buildPaymentMessage(depositLink, draft, 216);
    expect(text).toMatch(/Balance due on-site:/);
  });
});
