import { describe, expect, it } from 'vitest';
import {
  invoicePresentationDraft,
  parseInvoicePounds,
  parseInvoicePresentation,
  parseInvoicePresentationSnapshot,
  validateInvoicePresentationDraft,
  type InvoicePresentationDraft,
} from '../../assisted-chat-app/src/types/invoice-presentation';

const empty = { version: 1 as const, extraInformation: null, priceBreakdown: null };
const draft = (lines: InvoicePresentationDraft['lines'], extraInformation = ''): InvoicePresentationDraft => ({ showBreakdown: true, lines, extraInformation });

describe('customer invoice amount entry', () => {
  it.each([
    ['0', 0], ['0.01', 1], ['12.5', 1250], ['£ 123.45', 12345], ['.50', 50], [' 89.99 ', 8999],
  ])('parses %s as exact integer pence', (input, expected) => {
    expect(parseInvoicePounds(input)).toBe(expected);
  });

  it.each(['', '-1', '1.001', '1e2', '1,000', 'NaN', 'Infinity', '12.', '£', '999999999999999999'])('rejects ambiguous or rounded amount %s', (input) => {
    expect(parseInvoicePounds(input)).toBeNull();
  });
});

describe('optional customer invoice draft', () => {
  it('starts with final total only and never invents internal price lines', () => {
    expect(invoicePresentationDraft(empty)).toEqual({ showBreakdown: false, extraInformation: '', lines: [{ label: '', amount: '' }] });
  });

  it('round-trips only explicit customer labels and exact amounts', () => {
    const custom = { version: 1 as const, extraInformation: 'Reference agreed with customer', priceBreakdown: [{ label: 'Service', amountPence: 9999 }, { label: 'Extras', amountPence: 1 }] };
    const checked = validateInvoicePresentationDraft(invoicePresentationDraft(custom), 10000);
    expect(checked.presentation).toEqual(custom);
    expect(checked.breakdownPence).toBe(10000);
  });

  it('keeps notes independent of the optional breakdown and clears hidden rows', () => {
    const checked = validateInvoicePresentationDraft({ showBreakdown: false, lines: [{ label: 'Old internal row', amount: '999' }], extraInformation: '  Customer instruction  ' }, 12500);
    expect(checked.presentation).toEqual({ version: 1, extraInformation: 'Customer instruction', priceBreakdown: null });
  });

  it.each([9999, 10001])('blocks a one penny mismatch against total %i', (total) => {
    const checked = validateInvoicePresentationDraft(draft([{ label: 'Service', amount: '100.00' }]), total);
    expect(checked.presentation).toBeNull();
    expect(checked.error).toMatch(/exactly/);
    expect(checked.breakdownPence).toBe(10000);
  });

  it('accepts zero-priced rows only when the full breakdown still matches', () => {
    expect(validateInvoicePresentationDraft(draft([{ label: 'Included', amount: '0' }, { label: 'Service', amount: '100' }]), 10000).presentation?.priceBreakdown)
      .toEqual([{ label: 'Included', amountPence: 0 }, { label: 'Service', amountPence: 10000 }]);
  });

  it('requires valid labels and amounts for enabled rows', () => {
    for (const rows of [[{ label: ' ', amount: '100' }], [{ label: 'x'.repeat(161), amount: '100' }], [{ label: 'Service', amount: '100.001' }]]) {
      expect(validateInvoicePresentationDraft(draft(rows), 10000).presentation).toBeNull();
    }
  });

  it('accepts 12 rows but blocks 13 or zero rows', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ label: `Line ${i + 1}`, amount: '1.00' }));
    expect(validateInvoicePresentationDraft(draft(rows), 1200).presentation?.priceBreakdown).toHaveLength(12);
    expect(validateInvoicePresentationDraft(draft([...rows, { label: 'Extra', amount: '0' }]), 1200).presentation).toBeNull();
    expect(validateInvoicePresentationDraft(draft([]), 0).presentation).toBeNull();
  });

  it('enforces the 1500-character customer information limit even without breakdown', () => {
    expect(validateInvoicePresentationDraft({ showBreakdown: false, lines: [], extraInformation: 'x'.repeat(1500) }, 100).presentation?.extraInformation).toHaveLength(1500);
    expect(validateInvoicePresentationDraft({ showBreakdown: false, lines: [], extraInformation: 'x'.repeat(1501) }, 100).presentation).toBeNull();
  });
});

describe('canonical booking invoice snapshot', () => {
  it('preserves an explicit null historical booking version for server CAS', () => {
    expect(parseInvoicePresentationSnapshot({ invoicePresentation: empty, totalPence: 100, bookingUpdatedAt: null, priceBreakdownStale: false }).bookingUpdatedAt).toBeNull();
  });
  it('retains stale custom rows for review without changing their total', () => {
    const snapshot = parseInvoicePresentationSnapshot({ invoicePresentation: { ...empty, priceBreakdown: [{ label: 'Previously agreed service', amountPence: 10000 }] }, totalPence: 12500, bookingUpdatedAt: '2026-10-22T10:15:00.000Z', priceBreakdownStale: true });
    expect(snapshot.totalPence).toBe(12500);
    expect(snapshot.priceBreakdownStale).toBe(true);
    expect(validateInvoicePresentationDraft(invoicePresentationDraft(snapshot.invoicePresentation), snapshot.totalPence).presentation).toBeNull();
  });

  it('copies only the customer presentation contract, never internal pricing fields', () => {
    expect(parseInvoicePresentation({ ...empty, internalItems: [{ supplierCost: 5000 }], bookingTotal: 10000 })).toEqual(empty);
  });

  it.each([
    { invoicePresentation: empty, totalPence: 10.5, bookingUpdatedAt: '2026-10-22T10:00:00Z', priceBreakdownStale: false },
    { invoicePresentation: empty, totalPence: 100, bookingUpdatedAt: 'invalid', priceBreakdownStale: false },
    { invoicePresentation: empty, totalPence: 100, priceBreakdownStale: false },
    { invoicePresentation: empty, totalPence: 100, bookingUpdatedAt: '2026-10-22T10:00:00Z' },
    { invoicePresentation: { ...empty, priceBreakdown: [{ label: 'Service', amountPence: -1 }] }, totalPence: 100, bookingUpdatedAt: '2026-10-22T10:00:00Z', priceBreakdownStale: true },
  ])('rejects an unusable snapshot instead of guessing a total or save version', (value) => {
    expect(() => parseInvoicePresentationSnapshot(value)).toThrow();
  });
});
