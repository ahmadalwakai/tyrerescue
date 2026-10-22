import { initialBookingState, type BookingState } from './types';

export const BOOKING_DRAFT_KEY = 'customer_booking_draft_v1';
export const resetBookingQuote = { quoteId: null, breakdown: null, quoteExpiresAt: null, bookingId: null, refNumber: null, stripeClientSecret: null, invoiceDownloadToken: null, bookingAccessToken: null, pendingPaymentIntentId: null, paymentAttemptIntentId: null } satisfies Partial<BookingState>;
const LONDON = 'Europe/London';

export function requireConfirmedBooking(value: unknown): asserts value is { paymentConfirmed: true; invoiceDownloadToken?: string; bookingAccessToken?: string } {
  if (!value || typeof value !== 'object' || (value as { paymentConfirmed?: unknown }).paymentConfirmed !== true) {
    throw new Error('Your payment is being checked. Check booking confirmation again; do not make another payment.');
  }
}

/** Retry confirmation of the same payment without opening checkout again. */
export async function confirmCustomerPayment(options: {
  pendingPaymentIntentId: string | null;
  pay: () => Promise<string>;
  remember: (id: string) => void;
  confirm: (id: string) => Promise<void>;
}) {
  const id = options.pendingPaymentIntentId || await options.pay();
  if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new Error('Unable to identify this payment. Please contact the team.');
  options.remember(id);
  await options.confirm(id);
}

export function londonDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function londonDateChoices(now = new Date()) {
  const start = new Date(`${londonDate(now)}T12:00:00Z`);
  return Array.from({ length: 15 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000);
    return { value: date.toISOString().slice(0, 10), day: date.toLocaleDateString('en-GB', { timeZone: LONDON, weekday: 'short' }), label: date.toLocaleDateString('en-GB', { timeZone: LONDON, day: 'numeric', month: 'short' }) };
  });
}

/** Interpret a business slot in London, regardless of the phone's time zone. */
export function londonScheduledAt(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Choose an available appointment.');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error('Choose an available appointment.');
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: LONDON, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let instant = target;
  for (let index = 0; index < 3; index++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    instant += target - represented;
  }
  const check = new Date(instant);
  const parts = Object.fromEntries(formatter.formatToParts(check).map(p => [p.type, p.value]));
  if (`${parts.year}-${parts.month}-${parts.day}` !== date || `${parts.hour}:${parts.minute}` !== time) throw new Error('This appointment time is unavailable. Choose another slot.');
  return check.toISOString();
}

export async function withDeadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}

// Quotes, card details and Stripe client secrets must never survive as a draft.
export function bookingDraft(state: BookingState, step: string) {
  const { stripeClientSecret: _secret, quoteId: _quote, breakdown: _price, quoteExpiresAt: _expiry, selectedTyres: _stock, ...details } = state;
  return JSON.stringify({ version: 1, savedAt: Date.now(), state: details, step });
}

export function restoreBookingDraft(raw: string | null): { state: BookingState; step: 'service' | 'payment' } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Number.isFinite(parsed.savedAt) || parsed.savedAt > Date.now() + 300000 || !parsed.state || typeof parsed.state !== 'object') return null;
    const source = parsed.state as Partial<BookingState>;
    const pendingReceipt = [source.pendingPaymentIntentId, source.paymentAttemptIntentId].some(value => typeof value === 'string' && /^pi_[A-Za-z0-9]+$/.test(value));
    if (!pendingReceipt && Date.now() - parsed.savedAt > 48 * 3_600_000) return null;
    const state: BookingState = { ...initialBookingState };
    for (const key of ['address', 'vehicleReg', 'vehicleMake', 'vehicleModel', 'customerName', 'customerEmail', 'customerPhone'] as const) {
      if (typeof source[key] === 'string') state[key] = source[key].slice(0, 500);
    }
    if (source.tyreSize && ['width', 'aspect', 'rim'].every(key => typeof source.tyreSize?.[key as keyof typeof source.tyreSize] === 'string')) state.tyreSize = source.tyreSize;
    if (typeof source.lat === 'number' && Number.isFinite(source.lat) && Math.abs(source.lat) <= 90 && typeof source.lng === 'number' && Number.isFinite(source.lng) && Math.abs(source.lng) <= 180) { state.lat = source.lat; state.lng = source.lng; }
    if (source.bookingType === 'emergency' || source.bookingType === 'scheduled') state.bookingType = source.bookingType;
    if (source.serviceType && ['repair', 'fit', 'both', 'assess'].includes(source.serviceType)) state.serviceType = source.serviceType;
    if (source.problemType && ['puncture', 'flat_tyre', 'damaged_tyre', 'not_sure'].includes(source.problemType)) state.problemType = source.problemType;
    if (source.conditionAssessment && ['repair', 'replacement', 'not_sure'].includes(source.conditionAssessment)) state.conditionAssessment = source.conditionAssessment;
    if (source.lockingNutStatus && ['standard', 'has_key', 'no_key'].includes(source.lockingNutStatus)) state.lockingNutStatus = source.lockingNutStatus;
    if (source.fittingLocation === 'shop' || source.fittingLocation === 'mobile') state.fittingLocation = source.fittingLocation;
    if (typeof source.quantity === 'number') state.quantity = Math.min(4, Math.max(1, Math.trunc(source.quantity) || 1));
    if (typeof source.scheduledDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.scheduledDate)) state.scheduledDate = source.scheduledDate;
    if (typeof source.scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(source.scheduledTime)) state.scheduledTime = source.scheduledTime;
    if (typeof source.tyrePhotoUrl === 'string' && source.tyrePhotoUrl.startsWith('https://')) state.tyrePhotoUrl = source.tyrePhotoUrl.slice(0, 2000);
    if (typeof source.emergencyEtaLabel === 'string') state.emergencyEtaLabel = source.emergencyEtaLabel.slice(0, 200);
    const pending = [source.pendingPaymentIntentId, source.paymentAttemptIntentId].find(value => typeof value === 'string' && /^pi_[A-Za-z0-9]+$/.test(value));
    if (typeof pending === 'string' && /^pi_[A-Za-z0-9]+$/.test(pending) && typeof source.refNumber === 'string' && typeof source.bookingAccessToken === 'string') {
      state.pendingPaymentIntentId = pending; state.refNumber = source.refNumber; state.bookingAccessToken = source.bookingAccessToken;
      state.bookingId = typeof source.bookingId === 'string' ? source.bookingId : null;
      return { state, step: 'payment' };
    }
    return { state, step: 'service' };
  } catch { return null; }
}
