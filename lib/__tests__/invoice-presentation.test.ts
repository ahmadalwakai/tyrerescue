import { describe, expect, it } from 'vitest';
import { parseInvoicePresentation, readInvoicePresentation, withInvoicePresentation } from '../invoices/invoice-presentation';

const presentation = {
  version: 1 as const,
  extraInformation: 'Customer agreed replacement on site.',
  priceBreakdown: [{ label: 'Replacement tyre and fitting', amountPence: 9500 }, { label: 'Mobile service', amountPence: 2500 }],
};

describe('optional customer invoice details', () => {
  it('keeps the default final total only and never publishes internal quote costs', () => {
    expect(readInvoicePresentation({ items: [{ label: 'Internal margin', amountPence: 9999 }], subtotal: 40 }, 12000)).toEqual({
      invoicePresentation: { version: 1, extraInformation: null, priceBreakdown: null }, priceBreakdownStale: false,
    });
  });

  it('accepts only an explicit breakdown that reconciles exactly with the canonical booking total', () => {
    expect(parseInvoicePresentation(presentation, 12000)).toEqual(presentation);
    expect(() => parseInvoicePresentation(presentation, 12001)).toThrow('add up exactly');
    expect(() => parseInvoicePresentation({ ...presentation, priceBreakdown: [{ label: 'Partial only', amountPence: 2400 }] }, 12000)).toThrow('add up exactly');
  });

  it.each([-1, 1.5, NaN, Infinity, '12000', 10_000_000_000])('rejects unsafe monetary amounts %s', (amountPence) => {
    expect(() => parseInvoicePresentation({ ...presentation, priceBreakdown: [{ label: 'Service', amountPence }] }, 12000)).toThrow();
  });

  it.each([
    { ...presentation, version: 2 },
    { ...presentation, subtotal: 1 },
    { ...presentation, extraInformation: 'a'.repeat(1501) },
    { ...presentation, priceBreakdown: Array.from({ length: 13 }, () => ({ label: 'Service', amountPence: 0 })) },
    { ...presentation, priceBreakdown: [{ label: ' ', amountPence: 12000 }] },
    { ...presentation, priceBreakdown: [{ label: 'a'.repeat(161), amountPence: 12000 }] },
    { ...presentation, priceBreakdown: [{ label: 'Service', amountPence: 12000, internalCost: 70 }] },
  ])('rejects unsupported or excessive display details', (raw) => {
    expect(() => parseInvoicePresentation(raw, 12000)).toThrow();
  });

  it('preserves stale lines for admin review after a price change without blocking the booking', () => {
    expect(readInvoicePresentation({ customerInvoice: presentation }, 15000)).toEqual({ invoicePresentation: presentation, priceBreakdownStale: true });
  });

  it('isolates malformed stored details and keeps independently valid extra information', () => {
    expect(readInvoicePresentation({ customerInvoice: { ...presentation, priceBreakdown: 'bad' } }, 12000)).toEqual({
      invoicePresentation: { version: 1, extraInformation: presentation.extraInformation, priceBreakdown: null }, priceBreakdownStale: true,
    });
  });

  it('changes only the display namespace and can explicitly clear it', () => {
    const snapshot = { total: 120, tyreLines: [{ normalizedSize: '205/55R16', quantity: 1 }], internalCost: 50 };
    const updated = withInvoicePresentation(snapshot, presentation);
    expect(updated).toEqual({ ...snapshot, customerInvoice: presentation });
    expect(snapshot).not.toHaveProperty('customerInvoice');
    expect(parseInvoicePresentation({ version: 1, extraInformation: '', priceBreakdown: [] }, 12000)).toEqual({ version: 1, extraInformation: null, priceBreakdown: null });
  });
});
