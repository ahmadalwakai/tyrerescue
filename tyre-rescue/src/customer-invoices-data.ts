import type { CustomerBookingSummary } from './customer-account';

export function invoiceDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Date unavailable';
  return new Date(value).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Eligibility comes from the authenticated server projection, never a client status guess. */
export function customerInvoices(bookings: CustomerBookingSummary[], search = '') {
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ');
  const compactQuery = query.replace(/\s/g, '');
  return bookings.filter(booking => {
    if (!booking.invoiceDownloadToken || !/^[A-Z0-9-]{1,80}$/i.test(booking.refNumber)) return false;
    if (!query) return true;
    const numericDate = booking.createdAt && Number.isFinite(Date.parse(booking.createdAt))
      ? new Date(booking.createdAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : '';
    const searchable = [booking.refNumber, `INV-${booking.refNumber}`, booking.vehicleReg,
      booking.vehicleMake, booking.vehicleModel, booking.addressLine, booking.createdAt?.slice(0, 10), invoiceDate(booking.createdAt), numericDate,
      booking.serviceType.replace(/_/g, ' ')].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(query) || Boolean(booking.vehicleReg?.replace(/\s/g, '').toLowerCase().includes(compactQuery));
  }).sort((left, right) => {
    const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
    return time(right.createdAt) - time(left.createdAt);
  });
}

export interface InvoiceFileInput { refNumber: string; token: string; signal: AbortSignal }
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
export function invoiceFilename(refNumber: string) {
  if (!/^[A-Z0-9-]{1,80}$/i.test(refNumber)) throw new Error('This invoice reference is invalid. Refresh your invoices and try again.');
  return `INV-${refNumber}.pdf`;
}
export function requireInvoiceSession(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Invoice request cancelled.');
}
export function validateInvoiceResponse(status: number, headers: Record<string, string>) {
  if (status !== 200) throw new Error('This invoice is unavailable. Refresh your invoices and try again.');
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  if (!/^application\/pdf(?:;|$)/i.test(normalized['content-type'] || '')) throw new Error('The invoice did not return a PDF. Please try again.');
  const size = Number(normalized['content-length']);
  if (Number.isFinite(size) && size > MAX_INVOICE_BYTES) throw new Error('This invoice is too large to share. Please download it instead.');
}
