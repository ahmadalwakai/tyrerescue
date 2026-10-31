import type * as LegacyFileSystem from 'expo-file-system/build/legacy';
import * as Sharing from 'expo-sharing';

import { API, endpoint } from './api';
import { invoiceFilename, MAX_INVOICE_BYTES, requireInvoiceSession, validateInvoiceResponse, type InvoiceFileInput } from './customer-invoices-data';

let sequence = 0;
let presentation: Promise<void> | null = null;
const SHARE_GRACE_MS = 15 * 60_000;
const activeDirectories = new Set<string>();
const retainedUntil = new Map<string, number>();
const expiryFilename = 'share-expires-at.txt';
// SDK 54's legacy entry exports source TS; use its generated declarations so
// TypeScript's cross-platform suffixes do not type native code as the web shim.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as typeof LegacyFileSystem;

const deleteTemporaryInvoice = (directory: string) => FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => undefined);

async function sweepExpiredInvoices(cacheDirectory: string) {
  const entries = await FileSystem.readDirectoryAsync(cacheDirectory).catch(() => []);
  for (const name of entries) {
    // Never traverse or remove another cache namespace, even if its name is similar.
    const match = /^customer-invoice-(\d{13})-([1-9]\d*)$/.exec(name);
    if (!match) continue;
    const directory = `${cacheDirectory}${name}/`;
    if (activeDirectories.has(directory) || (retainedUntil.get(directory) ?? 0) > Date.now()) continue;
    try {
      const info = await FileSystem.getInfoAsync(directory);
      if (!info.exists || !info.isDirectory) continue;
      const stored = await FileSystem.readAsStringAsync(`${directory}${expiryFilename}`).catch(() => '');
      const expiry = /^\d{13}$/.test(stored) ? Number(stored) : Number(match[1]) + SHARE_GRACE_MS;
      if (expiry > Date.now() || activeDirectories.has(directory) || (retainedUntil.get(directory) ?? 0) > Date.now()) continue;
      await deleteTemporaryInvoice(directory);
      retainedUntil.delete(directory);
    } catch { /* An unavailable cache entry must not prevent a new share. */ }
  }
}

async function retainForRecipient(directory: string) {
  // On Android, the chooser can resolve before the receiving app opens the URI.
  // Keep the private PDF readable for a grace period after the chooser settles.
  const expiry = Date.now() + SHARE_GRACE_MS;
  retainedUntil.set(directory, expiry);
  await FileSystem.writeAsStringAsync(`${directory}${expiryFilename}`, String(expiry)).catch(() => undefined);
  const removeWhenIdle = () => {
    if (retainedUntil.get(directory) !== expiry) return;
    if (activeDirectories.has(directory)) { setTimeout(removeWhenIdle, 60_000); return; }
    retainedUntil.delete(directory);
    void deleteTemporaryInvoice(directory);
  };
  setTimeout(removeWhenIdle, SHARE_GRACE_MS);
}

/** Share a PDF file, never a bearer token or private invoice URL. */
export async function shareCustomerInvoice({ refNumber, token, signal }: InvoiceFileInput): Promise<'shared' | 'downloaded' | 'cancelled'> {
  requireInvoiceSession(signal);
  if (presentation) throw new Error('Close the previous sharing window before sharing another invoice.');
  if (!await Sharing.isAvailableAsync() || !FileSystem.cacheDirectory) throw new Error('File sharing is unavailable on this device. Use Download PDF instead.');
  requireInvoiceSession(signal);
  const filename = invoiceFilename(refNumber);
  const directory = `${FileSystem.cacheDirectory}customer-invoice-${Date.now()}-${++sequence}/`;
  const uri = `${directory}${filename}`;
  let task: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;
  const resources: { transfer: Promise<LegacyFileSystem.FileSystemDownloadResult | undefined> | null; sharing: Promise<void> | null; exposed: boolean } = { transfer: null, sharing: null, exposed: false };
  let rejectInterrupted: (reason: Error) => void = () => {};
  let interrupted = false;
  const interruption = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  activeDirectories.add(directory);
  const clean = () => deleteTemporaryInvoice(directory);
  const finish = async () => {
    if (resources.exposed) await retainForRecipient(directory);
    else await clean();
    activeDirectories.delete(directory);
  };
  const cancel = (message = 'Invoice request cancelled.') => {
    if (interrupted) return;
    interrupted = true;
    void task?.cancelAsync().catch(() => undefined);
    rejectInterrupted(new Error(message));
  };
  const onAbort = () => cancel();
  signal.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Start the race before any asynchronous work so an abort never creates an unhandled rejection.
    return await Promise.race([interruption, (async () => {
      await sweepExpiredInvoices(FileSystem.cacheDirectory!);
      requireInvoiceSession(signal);
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      requireInvoiceSession(signal);
      task = FileSystem.createDownloadResumable(endpoint(`${API.customerInvoices}/${encodeURIComponent(refNumber)}`), uri,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' } }, progress => {
          if (progress.totalBytesWritten > MAX_INVOICE_BYTES || progress.totalBytesExpectedToWrite > MAX_INVOICE_BYTES) cancel('This invoice is too large to share. Use Download PDF instead.');
        });
      timer = setTimeout(() => cancel('The invoice download timed out. Please try again.'), 30_000);
      resources.transfer = task.downloadAsync();
      const response = await resources.transfer;
      if (timer) clearTimeout(timer);
      requireInvoiceSession(signal);
      if (interrupted || !response) throw new Error('Invoice request cancelled.');
      validateInvoiceResponse(response.status, response.headers);
      const signature = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 5 });
      if (signature !== 'JVBERi0=') throw new Error('The invoice file could not be verified. Please try again.');
      requireInvoiceSession(signal);
      if (interrupted) throw new Error('Invoice request cancelled.');
      if (presentation) throw new Error('Close the previous sharing window before sharing another invoice.');
      // Persist an expiry before handing the URI out so restart cleanup is safe too.
      await FileSystem.writeAsStringAsync(`${directory}${expiryFilename}`, String(Date.now() + SHARE_GRACE_MS)).catch(() => undefined);
      requireInvoiceSession(signal);
      if (interrupted) throw new Error('Invoice request cancelled.');
      resources.exposed = true;
      const opened = Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Share ${filename}` });
      resources.sharing = opened;
      presentation = opened;
      try { await opened; } finally { if (presentation === opened) presentation = null; }
      return 'shared' as const;
    })()]);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    if (interrupted && resources.transfer && !resources.sharing) void resources.transfer.finally(clean).catch(() => undefined);
    // Account changes stop new actions; an already exposed URI receives the same
    // grace period, starting only after its share presentation has settled.
    if (interrupted && resources.sharing) void resources.sharing.finally(finish).catch(() => undefined);
    else await finish();
  }
}
