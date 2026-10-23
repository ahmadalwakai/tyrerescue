import { API, requestJson } from './api';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const STORAGE_KEY = 'customer_assisted_help_v1';
const MAX_PARTS = 24;
type StorageManifest = { version: 1; bank: 0 | 1; parts: number };
const partKey = (bank: number, index: number) => `${STORAGE_KEY}_${bank}_${index}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
export interface AssistedHelpInput {
  name: string; phone: string; address: string; lat: number; lng: number;
  vehicleReg: string; vehicleMake: string; vehicleModel: string; photoUrl?: string;
  contactConsent: true;
}
export interface AssistedHelpReceipt {
  version: 1; ownerId: string; requestId: string; accessToken: string; savedAt: number;
  status: 'prepared' | 'pending' | 'reviewed' | 'closed'; reference: string; input: AssistedHelpInput;
}
interface HelpStatus { requestId: string; reference?: string; status: string }
let generation = 0;
let operations: Promise<unknown> = Promise.resolve();
export const customerAssistedHelpSession = () => generation;
function serialize<T>(work: () => Promise<T>) {
  const pending = operations.then(work, work); operations = pending.catch(() => undefined); return pending;
}
function requireSession(session: number) { if (session !== generation) throw new Error('Your account changed. Reopen the help request.'); }
async function helpRequest<T>(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { return await requestJson<T>(path, { ...init, signal: controller.signal }); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('The connection timed out. Your saved request can be checked or retried without creating another request.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function validateAssistedHelpInput(input: Omit<AssistedHelpInput, 'contactConsent'> & { contactConsent: boolean }) {
  if (!input.name.trim()) return 'Enter your name.';
  if (input.name.trim().length > 80 || input.address.length > 500 || input.vehicleReg.length > 20 || input.vehicleMake.length > 80 || input.vehicleModel.length > 80 || (input.photoUrl?.length ?? 0) > 2000) return 'Shorten the vehicle or location details and try again.';
  if (!/^(?:\+44|0)[0-9]{9,14}$/.test(input.phone.replace(/[\s()-]/g, ''))) return 'Enter a valid UK phone number.';
  if (!input.address.trim() || !Number.isFinite(input.lat) || Math.abs(input.lat) > 90 || !Number.isFinite(input.lng) || Math.abs(input.lng) > 180) return 'Confirm the location of your vehicle first.';
  if (!input.vehicleReg.trim() && !input.photoUrl) return 'Add your registration or a tyre photo so the team can help.';
  if (input.photoUrl && !/^https:\/\//.test(input.photoUrl)) return 'Attach a securely uploaded tyre photo.';
  if (!input.contactConsent) return 'Agree to share these details and be contacted about this request.';
  return null;
}
async function readReceipt(ownerId: string, session: number) {
  const raw = await getSecureItem(STORAGE_KEY); requireSession(session);
  if (!raw) return null;
  try {
    const manifest = JSON.parse(raw) as StorageManifest;
    if (manifest.version !== 1 || ![0, 1].includes(manifest.bank) || !Number.isInteger(manifest.parts) || manifest.parts < 1 || manifest.parts > MAX_PARTS) return null;
    const parts: string[] = [];
    for (let index = 0; index < manifest.parts; index++) {
      const part = await getSecureItem(partKey(manifest.bank, index)); requireSession(session);
      if (part === null) return null;
      parts.push(part);
    }
    const value = JSON.parse(parts.join('')) as AssistedHelpReceipt;
    if (value.version !== 1 || value.ownerId !== ownerId || !UUID.test(value.requestId) || typeof value.accessToken !== 'string' || !value.accessToken || value.accessToken.length > 4096
      || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() + 300_000 || Date.now() - value.savedAt >= MAX_AGE
      || !['prepared', 'pending', 'reviewed', 'closed'].includes(value.status) || !value.input || validateAssistedHelpInput(value.input)) return null;
    return value;
  } catch { return null; }
}
export function loadCustomerAssistedHelp(ownerId: string, session = generation) { return serialize(() => readReceipt(ownerId, session)); }
async function writeReceipt(receipt: AssistedHelpReceipt, session: number) {
  requireSession(session);
  const previous = await getSecureItem(STORAGE_KEY); requireSession(session);
  let bank: 0 | 1 = 0;
  try { if (previous && JSON.parse(previous).bank === 0) bank = 1; } catch { /* Start a fresh storage bank. */ }
  // At most 1,600 UTF-8 bytes per item, even for four-byte Unicode codepoints.
  const characters = Array.from(JSON.stringify(receipt));
  const parts = Array.from({ length: Math.ceil(characters.length / 400) }, (_, index) => characters.slice(index * 400, (index + 1) * 400).join(''));
  if (parts.length > MAX_PARTS) throw new Error('These help details are too long to save safely. Shorten the address and try again.');
  for (let index = 0; index < parts.length; index++) {
    requireSession(session); await setSecureItem(partKey(bank, index), parts[index]); requireSession(session);
  }
  // Publishing the manifest last leaves the previous complete receipt usable
  // if any chunk write fails. No callback is sent before this succeeds.
  await setSecureItem(STORAGE_KEY, JSON.stringify({ version: 1, bank, parts: parts.length } satisfies StorageManifest)); requireSession(session);
}
function applyStatus(receipt: AssistedHelpReceipt, result: HelpStatus) {
  if (result.requestId !== receipt.requestId || !['pending', 'reviewed', 'closed', 'not_received'].includes(result.status)) throw new Error('Unable to verify the help request. Please contact the team.');
  return { ...receipt, status: result.status === 'not_received' ? 'prepared' : result.status } as AssistedHelpReceipt;
}

/** Saves the capability and immutable contact details before the first callback insert. */
export function submitCustomerAssistedHelp(ownerId: string, input: AssistedHelpInput, session = generation) {
  return serialize(async () => {
    requireSession(session);
    let receipt = await readReceipt(ownerId, session);
    if (!receipt) {
      const error = validateAssistedHelpInput(input); if (error) throw new Error(error);
      const prepared = await helpRequest<{ requestId: string; accessToken: string }>(API.customerAssistedHelp, { method: 'POST', body: JSON.stringify({ action: 'prepare' }) });
      requireSession(session);
      if (!UUID.test(prepared.requestId) || typeof prepared.accessToken !== 'string' || !prepared.accessToken || prepared.accessToken.length > 4096) throw new Error('Unable to prepare this request. Please try again.');
      receipt = { version: 1, ownerId, requestId: prepared.requestId, accessToken: prepared.accessToken, savedAt: Date.now(), status: 'prepared', reference: `HELP-${prepared.requestId.toUpperCase()}`,
        input: { ...input, name: input.name.trim(), phone: input.phone.replace(/[\s()-]/g, '') } };
      await writeReceipt(receipt, session);
    }
    if (receipt.status !== 'prepared') return receipt;
    const response = await helpRequest<HelpStatus>(API.customerAssistedHelp, { method: 'POST', headers: { 'X-Assistance-Access': receipt.accessToken }, body: JSON.stringify({ ...receipt.input, requestId: receipt.requestId }) });
    requireSession(session);
    const submitted = applyStatus(receipt, response); await writeReceipt(submitted, session); return submitted;
  });
}

export function refreshCustomerAssistedHelp(ownerId: string, session = generation) {
  return serialize(async () => {
    const receipt = await readReceipt(ownerId, session); if (!receipt) return null;
    const response = await helpRequest<HelpStatus>(`${API.customerAssistedHelp}?requestId=${encodeURIComponent(receipt.requestId)}`, { headers: { 'X-Assistance-Access': receipt.accessToken } });
    requireSession(session);
    const refreshed = applyStatus(receipt, response); await writeReceipt(refreshed, session); return refreshed;
  });
}

/** Invalidate in-flight work synchronously, then remove personal data and the capability. */
export function clearCustomerAssistedHelp() {
  generation += 1;
  return serialize(async () => {
    const keys = [STORAGE_KEY, ...[0, 1].flatMap(bank => Array.from({ length: MAX_PARTS }, (_, index) => partKey(bank, index)))];
    const results = await Promise.allSettled(keys.map(key => deleteSecureItem(key)));
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  });
}
