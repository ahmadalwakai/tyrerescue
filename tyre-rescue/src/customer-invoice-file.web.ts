import { API, fetchApi } from './api';
import { invoiceFilename, MAX_INVOICE_BYTES, requireInvoiceSession, validateInvoiceResponse, type InvoiceFileInput } from './customer-invoices-data';

export async function shareCustomerInvoice({ refNumber, token, signal }: InvoiceFileInput): Promise<'shared' | 'downloaded' | 'cancelled'> {
  requireInvoiceSession(signal);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 30_000);
  let objectUrl: string | null = null;
  try {
    const response = await fetchApi(`${API.customerInvoices}/${encodeURIComponent(refNumber)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' }, signal: controller.signal, credentials: 'omit',
    });
    validateInvoiceResponse(response.status, Object.fromEntries(response.headers.entries()));
    const blob = await response.blob();
    if (blob.size > MAX_INVOICE_BYTES || await blob.slice(0, 5).text() !== '%PDF-') throw new Error('The invoice file could not be verified. Please try again.');
    clearTimeout(timer);
    requireInvoiceSession(signal);
    if (controller.signal.aborted) throw new Error('The invoice download timed out. Please try again.');
    const file = new File([blob], invoiceFilename(refNumber), { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Invoice ${refNumber}` }); return 'shared'; }
      catch (reason) {
        if (reason instanceof Error && reason.name === 'AbortError') return 'cancelled';
        // Some browsers require a fresh gesture after fetching the file. A download is still usable.
      }
    }
    requireInvoiceSession(signal);
    objectUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = objectUrl; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
    // Give the browser time to start reading the blob; it contains no private access URL.
    const downloadUrl = objectUrl;
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000); objectUrl = null;
    return 'downloaded';
  } catch (reason) {
    if (signal.aborted) throw new Error('Invoice request cancelled.');
    if (controller.signal.aborted) throw new Error('The invoice download timed out. Please try again.');
    throw reason;
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
