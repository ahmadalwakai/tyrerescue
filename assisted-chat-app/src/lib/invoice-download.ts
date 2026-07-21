import { Linking, Platform } from 'react-native';
import { API_BASE_URL, getAdminToken } from './api';

interface DownloadInvoicePdfInput {
  invoiceId: string;
  invoiceNumber: string;
}

interface DownloadInvoicePdfResult {
  filename: string;
  uri: string;
  openedSaveSheet: boolean;
}

function safeInvoiceFilename(invoiceNumber: string): string {
  const cleaned = invoiceNumber
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned || 'invoice'}.pdf`;
}

function invoicePdfUrl(invoiceId: string): string {
  return `${API_BASE_URL}/api/mobile/admin/invoices/${encodeURIComponent(invoiceId)}/pdf`;
}

function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function downloadInvoicePdfOnWeb(url: string, filename: string): Promise<DownloadInvoicePdfResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Invoice download is unavailable in this environment.');
  }

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Invoice download failed (${response.status}).`);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);

  return { filename, uri: objectUrl, openedSaveSheet: false };
}

async function downloadInvoicePdfOnNative(url: string, filename: string): Promise<DownloadInvoicePdfResult> {
  const [{ File, Paths }, Sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);

  const destination = new File(Paths.document, filename);
  const file = await File.downloadFileAsync(url, destination, {
    headers: authHeaders(),
    idempotent: true,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: `Save ${filename}`,
    });
    return { filename, uri: file.uri, openedSaveSheet: true };
  }

  await Linking.openURL(file.uri);
  return { filename, uri: file.uri, openedSaveSheet: false };
}

export async function downloadInvoicePdfToDevice(
  input: DownloadInvoicePdfInput,
): Promise<DownloadInvoicePdfResult> {
  const filename = safeInvoiceFilename(input.invoiceNumber);
  const url = invoicePdfUrl(input.invoiceId);

  if (Platform.OS === 'web') {
    return downloadInvoicePdfOnWeb(url, filename);
  }

  return downloadInvoicePdfOnNative(url, filename);
}
