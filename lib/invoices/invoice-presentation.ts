/** Explicit customer-facing details, separate from internal quote/cost data. */
export interface InvoicePriceBreakdownLine {
  label: string;
  amountPence: number;
}

export interface BookingInvoicePresentation {
  version: 1;
  extraInformation: string | null;
  priceBreakdown: InvoicePriceBreakdownLine[] | null;
}

export class InvoicePresentationError extends Error {
  readonly status = 400;
  constructor(message: string) { super(message); this.name = 'InvoicePresentationError'; }
}

const MAX_AMOUNT_PENCE = 9_999_999_999;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const clean = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
const empty = (): BookingInvoicePresentation => ({ version: 1, extraInformation: null, priceBreakdown: null });

function validTotal(totalPence: number): void {
  if (!Number.isSafeInteger(totalPence) || totalPence < 0 || totalPence > MAX_AMOUNT_PENCE) {
    throw new InvoicePresentationError('The booking total is invalid. Refresh the booking and try again.');
  }
}

function parseStructure(raw: unknown): BookingInvoicePresentation {
  if (!isRecord(raw) || raw.version !== 1 || Object.keys(raw).some((key) => !['version', 'extraInformation', 'priceBreakdown'].includes(key))) {
    throw new InvoicePresentationError('Invalid customer invoice options.');
  }
  let extraInformation: string | null = null;
  if (raw.extraInformation != null) {
    if (typeof raw.extraInformation !== 'string' || raw.extraInformation.length > 1500) {
      throw new InvoicePresentationError('Customer invoice information must be no more than 1500 characters.');
    }
    extraInformation = clean(raw.extraInformation) || null;
  }
  if (raw.priceBreakdown == null) return { version: 1, extraInformation, priceBreakdown: null };
  if (!Array.isArray(raw.priceBreakdown) || raw.priceBreakdown.length > 12) {
    throw new InvoicePresentationError('Use no more than 12 price breakdown lines.');
  }
  const priceBreakdown = raw.priceBreakdown.map((line): InvoicePriceBreakdownLine => {
    if (!isRecord(line) || Object.keys(line).some((key) => !['label', 'amountPence'].includes(key)) ||
      typeof line.label !== 'string' || line.label.length > 160 || !clean(line.label)) {
      throw new InvoicePresentationError('Each price breakdown line needs a label of up to 160 characters.');
    }
    if (typeof line.amountPence !== 'number' || !Number.isSafeInteger(line.amountPence) || line.amountPence < 0 || line.amountPence > MAX_AMOUNT_PENCE) {
      throw new InvoicePresentationError('Price breakdown amounts must be valid non-negative amounts in pence.');
    }
    return { label: clean(line.label), amountPence: line.amountPence };
  });
  return { version: 1, extraInformation, priceBreakdown: priceBreakdown.length ? priceBreakdown : null };
}

export function parseInvoicePresentation(raw: unknown, totalPence: number): BookingInvoicePresentation {
  validTotal(totalPence);
  const presentation = parseStructure(raw);
  if (presentation.priceBreakdown && presentation.priceBreakdown.reduce((total, line) => total + line.amountPence, 0) !== totalPence) {
    throw new InvoicePresentationError('The price breakdown must add up exactly to the booking total.');
  }
  return presentation;
}

/** Keep stale rows editable for the admin, but never publish them to customers. */
export function readInvoicePresentation(snapshot: unknown, totalPence: number): {
  invoicePresentation: BookingInvoicePresentation;
  priceBreakdownStale: boolean;
} {
  const raw = isRecord(snapshot) ? snapshot.customerInvoice : null;
  if (raw == null) return { invoicePresentation: empty(), priceBreakdownStale: false };
  try {
    validTotal(totalPence);
    const invoicePresentation = parseStructure(raw);
    const priceBreakdownStale = invoicePresentation.priceBreakdown !== null &&
      invoicePresentation.priceBreakdown.reduce((total, line) => total + line.amountPence, 0) !== totalPence;
    return { invoicePresentation, priceBreakdownStale };
  } catch {
    // Invalid stored display data cannot block invoicing or expose internal fields.
    const extraInformation = isRecord(raw) && raw.version === 1 && typeof raw.extraInformation === 'string' && raw.extraInformation.length <= 1500
      ? clean(raw.extraInformation) || null : null;
    return { invoicePresentation: { ...empty(), extraInformation }, priceBreakdownStale: true };
  }
}

/** Merge only the display namespace; canonical prices/tyre selections stay intact. */
export function withInvoicePresentation(snapshot: unknown, presentation: BookingInvoicePresentation): Record<string, unknown> {
  return { ...(isRecord(snapshot) ? snapshot : {}), customerInvoice: presentation };
}
