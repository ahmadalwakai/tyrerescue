export interface CustomerInvoicePresentation {
  version: 1;
  extraInformation: string | null;
  priceBreakdown: Array<{ label: string; amountPence: number }> | null;
}

export interface InvoicePresentationSnapshot {
  invoicePresentation: CustomerInvoicePresentation;
  totalPence: number;
  bookingUpdatedAt: string | null;
  priceBreakdownStale: boolean;
}

export interface InvoicePresentationDraft {
  extraInformation: string;
  showBreakdown: boolean;
  lines: Array<{ label: string; amount: string }>;
}

/** Parse decimal pounds into integer pence without rounding the input. */
export function parseInvoicePounds(value: string): number | null {
  const text = value.trim().replace(/^£\s*/, '');
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const pence = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(pence) && pence >= 0 ? pence : null;
}

export function parseInvoicePresentation(value: unknown): CustomerInvoicePresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invoice options are unavailable. Please reload.');
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || !(item.extraInformation === null || (typeof item.extraInformation === 'string' && item.extraInformation.length <= 1500))
    || !(item.priceBreakdown === null || (Array.isArray(item.priceBreakdown) && item.priceBreakdown.length >= 1 && item.priceBreakdown.length <= 12))) {
    throw new Error('Invoice options are unavailable. Please reload.');
  }
  const priceBreakdown = item.priceBreakdown === null ? null : (item.priceBreakdown as unknown[]).map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid invoice breakdown. Please reload.');
    const line = raw as Record<string, unknown>;
    if (typeof line.label !== 'string' || !line.label.trim() || line.label.length > 160
      || !Number.isSafeInteger(line.amountPence) || (line.amountPence as number) < 0) throw new Error('Invalid invoice breakdown. Please reload.');
    return { label: line.label, amountPence: line.amountPence as number };
  });
  return { version: 1, extraInformation: item.extraInformation as string | null, priceBreakdown };
}

export function parseInvoicePresentationSnapshot(value: unknown): InvoicePresentationSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invoice options are unavailable. Please reload.');
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.totalPence) || (data.totalPence as number) < 0
    || !(data.bookingUpdatedAt === null || (typeof data.bookingUpdatedAt === 'string' && Number.isFinite(Date.parse(data.bookingUpdatedAt))))
    || typeof data.priceBreakdownStale !== 'boolean') throw new Error('Invoice options are unavailable. Please reload.');
  return {
    invoicePresentation: parseInvoicePresentation(data.invoicePresentation), totalPence: data.totalPence as number,
    bookingUpdatedAt: data.bookingUpdatedAt as string | null, priceBreakdownStale: data.priceBreakdownStale,
  };
}

export function invoicePresentationDraft(value: CustomerInvoicePresentation): InvoicePresentationDraft {
  return {
    extraInformation: value.extraInformation ?? '', showBreakdown: value.priceBreakdown !== null,
    lines: value.priceBreakdown?.map((line) => ({ label: line.label, amount: (line.amountPence / 100).toFixed(2) })) ?? [{ label: '', amount: '' }],
  };
}

export function validateInvoicePresentationDraft(draft: InvoicePresentationDraft, totalPence: number): { presentation: CustomerInvoicePresentation | null; error: string | null; breakdownPence: number | null } {
  const extraInformation = draft.extraInformation.trim() || null;
  if (extraInformation && extraInformation.length > 1500) return { presentation: null, error: 'Keep extra information within 1500 characters.', breakdownPence: null };
  if (!draft.showBreakdown) return { presentation: { version: 1, extraInformation, priceBreakdown: null }, error: null, breakdownPence: null };
  if (draft.lines.length < 1 || draft.lines.length > 12) return { presentation: null, error: 'Add between 1 and 12 breakdown lines.', breakdownPence: null };
  const lines: Array<{ label: string; amountPence: number }> = [];
  for (const row of draft.lines) {
    const label = row.label.trim();
    const amountPence = parseInvoicePounds(row.amount);
    if (!label || label.length > 160) return { presentation: null, error: 'Each line needs a label of up to 160 characters.', breakdownPence: null };
    if (amountPence === null) return { presentation: null, error: 'Enter each amount in pounds with no more than 2 decimal places.', breakdownPence: null };
    lines.push({ label, amountPence });
  }
  const breakdownPence = lines.reduce((sum, line) => sum + line.amountPence, 0);
  if (!Number.isSafeInteger(breakdownPence) || breakdownPence !== totalPence) return { presentation: null, error: 'The breakdown must add up exactly to the booking total.', breakdownPence };
  return { presentation: { version: 1, extraInformation, priceBreakdown: lines }, error: null, breakdownPence };
}
