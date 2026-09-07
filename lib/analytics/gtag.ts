import { hasMarketingConsent } from '@/lib/analytics/consent';
import { trackEvent } from '@/lib/analytics-tracker';

/** GA4 measurement ID used by the global gtag.js install in app/layout.tsx. */
const ENV_GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
export const GA_MEASUREMENT_ID =
  ENV_GA_MEASUREMENT_ID &&
  /^G-[A-Z0-9]+$/.test(ENV_GA_MEASUREMENT_ID) &&
  ENV_GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX'
    ? ENV_GA_MEASUREMENT_ID
    : 'G-MLH80KPV1T';

/**
 * Google Ads conversion (AW-) IDs to register via gtag('config', ...).
 * Multiple IDs may be supplied via NEXT_PUBLIC_GOOGLE_ADS_IDS as a comma-separated list.
 *
 * No default: IDs must be verified inside the active Tyre Rescue Google Ads
 * account before being exposed to the browser at build/deploy time.
 */
export const ADS_CONVERSION_IDS: string[] = (
  process.env.NEXT_PUBLIC_GOOGLE_ADS_IDS
    ? process.env.NEXT_PUBLIC_GOOGLE_ADS_IDS.split(',')
    : []
)
  .map((id) => id.trim())
  .filter((id) => /^AW-\d+$/.test(id));

/** Primary Ads ID (first configured) — null until verified env is supplied. */
export const ADS_CONVERSION_ID: string | null = ADS_CONVERSION_IDS[0] ?? null;

function normalizeAdsSendTo(value: string | undefined): string | null {
  const sendTo = value?.trim();
  return sendTo && /^AW-\d+\/.+/.test(sendTo) ? sendTo : null;
}

/**
 * Phone-call ads conversion send_to value (format: AW-XXXX/LABEL).
 * Configure via NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION.
 *
 * No default: the AW ID and conversion label must be copied from Google Ads.
 * If unset, the call-conversion event is skipped (GA4
 * click_call / call_now_click events still fire).
 */
const RAW_ADS_PHONE_CONVERSION: string | null =
  normalizeAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION);

/**
 * Booking-purchase ads conversion send_to value (format: AW-XXXX/LABEL).
 * Optional. If unset we still fire GA4 'purchase' / 'booking_paid' but skip
 * the Google Ads conversion ping. No default — must come from env.
 */
export const ADS_BOOKING_CONVERSION: string | null =
  normalizeAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION);

/**
 * Contact-lead ads conversion send_to value (format: AW-XXXX/LABEL).
 * Used after real contact/callback form submissions succeed.
 */
const RAW_ADS_CONTACT_CONVERSION: string | null =
  normalizeAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION);

export const ADS_PHONE_CONTACT_LABEL_COLLISION =
  Boolean(
    RAW_ADS_PHONE_CONVERSION &&
      RAW_ADS_CONTACT_CONVERSION &&
      RAW_ADS_PHONE_CONVERSION === RAW_ADS_CONTACT_CONVERSION,
  );

export const ADS_PHONE_CONVERSION: string | null =
  ADS_PHONE_CONTACT_LABEL_COLLISION ? null : RAW_ADS_PHONE_CONVERSION;

export const ADS_CONTACT_CONVERSION: string | null = RAW_ADS_CONTACT_CONVERSION;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type Gtag = NonNullable<Window['gtag']>;

function getBrowserWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function getGtag(): Gtag | null {
  const gtag = getBrowserWindow()?.gtag;
  return typeof gtag === 'function' ? gtag : null;
}

function safeGtag(...args: Parameters<Gtag>): boolean {
  const gtag = getGtag();
  if (!gtag) return false;

  try {
    gtag(...args);
    return true;
  } catch {
    return false;
  }
}

/** Track a pageview (call on client-side navigation) */
export function pageview(url: string) {
  safeGtag('config', GA_MEASUREMENT_ID, {
    page_path: url,
    send_page_view: false,
  });
  safeGtag('event', 'page_view', { page_path: url });
}

/** Fire a custom GA4 event */
export function event({
  action,
  category,
  label,
  value,
}: {
  action: string;
  category: string;
  label?: string;
  value?: number;
}) {
  safeGtag('event', action, {
    event_category: category,
    event_label: label,
    value,
  });
}

/**
 * Send hashed user data for Enhanced Conversions for Leads.
 * Must be called before any conversion event. Google normalises and hashes
 * the values server-side, so we pass them in plain text.
 */
export function setEnhancedUserData({ phone, email }: { phone?: string; email?: string }) {
  if (!hasMarketingConsent()) return;
  if (!phone && !email) return;
  const data: Record<string, string> = {};
  if (phone) {
    // Normalise to E.164 (+44XXXXXXXXXX for UK numbers).
    const digits = phone.replace(/\D/g, '');
    if (digits) {
      data.phone_number = digits.startsWith('44')
        ? `+${digits}`
        : digits.startsWith('0')
        ? `+44${digits.slice(1)}`
        : `+${digits}`;
    }
  }
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) data.email = normalizedEmail;
  if (Object.keys(data).length === 0) return;
  safeGtag('set', 'user_data', data);
}

export function clearEnhancedUserData(): void {
  safeGtag('set', 'user_data', {});
}

function buildPurchasePayload(value: number, transactionId?: string): Record<string, string | number> {
  const payload: Record<string, string | number> = { value, currency: 'GBP' };
  if (transactionId) payload.transaction_id = transactionId;
  return payload;
}

function dispatchConversion(value: number, email?: string, transactionId?: string): boolean {
  const gtag = getGtag();
  if (!gtag) return false;
  if (email) setEnhancedUserData({ email });

  const payload = buildPurchasePayload(value, transactionId);

  // GA4 events — reported under the GA4 property.
  const purchaseSent = safeGtag('event', 'purchase', payload);
  const bookingPaidSent = safeGtag('event', 'booking_paid', payload);

  // Google Ads conversion — separate send_to keeps it out of GA4 reports.
  let adsSent = true;
  if (ADS_BOOKING_CONVERSION) {
    adsSent = safeGtag('event', 'conversion', {
      send_to: ADS_BOOKING_CONVERSION,
      ...payload,
    });
  }
  trackEvent('booking_complete', { value: String(value) });
  trackEvent('booking_paid', { value: String(value) });
  return purchaseSent && bookingPaidSent && adsSent;
}

/** Track a completed booking (GA4 purchase + Google Ads conversion) */
export function trackConversion(value: number, email?: string, transactionId?: string) {
  dispatchConversion(value, email, transactionId);
}

const PURCHASE_FIRED_KEY = 'tr_conv_fired_v2';
const MAX_GTAG_RETRY_ATTEMPTS = 12;
const GTAG_RETRY_DELAY_MS = 500;
const memoryPurchaseFired = new Set<string>();

interface PendingBookingConversion {
  ref: string;
  value: number;
  email?: string;
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
}

const pendingBookingConversions = new Map<string, PendingBookingConversion>();

function getSessionStorage(): Storage | null {
  const browserWindow = getBrowserWindow();
  try {
    if (browserWindow?.sessionStorage) return browserWindow.sessionStorage;
  } catch {
    return null;
  }
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readPurchaseFiredRefs(): string[] {
  const storage = getSessionStorage();
  if (!storage) return [];

  try {
    const stored = storage.getItem(PURCHASE_FIRED_KEY);
    const fired: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(fired) ? fired.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function hasPurchaseFired(ref: string): boolean {
  if (memoryPurchaseFired.has(ref)) return true;
  return readPurchaseFiredRefs().includes(ref);
}

function writePurchaseFiredRefs(refs: string[]): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    storage.setItem(PURCHASE_FIRED_KEY, JSON.stringify(refs));
  } catch {
    // In-memory dedupe still protects the current page when storage is blocked.
  }
}

function markPurchaseFired(ref: string): void {
  memoryPurchaseFired.add(ref);
  const fired = readPurchaseFiredRefs();
  if (!fired.includes(ref)) writePurchaseFiredRefs([...fired, ref]);
}

function clearPendingTimer(pending: PendingBookingConversion): void {
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = undefined;
}

function scheduleBookingConversionRetry(pending: PendingBookingConversion): void {
  clearPendingTimer(pending);

  if (!getBrowserWindow() || pending.attempts >= MAX_GTAG_RETRY_ATTEMPTS) {
    pendingBookingConversions.delete(pending.ref);
    return;
  }

  pending.attempts += 1;
  pending.timer = setTimeout(() => {
    flushPendingBookingConversion(pending.ref);
  }, GTAG_RETRY_DELAY_MS);
}

function flushPendingBookingConversion(ref: string): void {
  const pending = pendingBookingConversions.get(ref);
  if (!pending) return;

  if (hasPurchaseFired(ref)) {
    clearPendingTimer(pending);
    pendingBookingConversions.delete(ref);
    return;
  }

  if (!getGtag()) {
    scheduleBookingConversionRetry(pending);
    return;
  }

  const fired = dispatchConversion(pending.value, pending.email, pending.ref);
  if (!fired) {
    scheduleBookingConversionRetry(pending);
    return;
  }

  markPurchaseFired(ref);
  clearPendingTimer(pending);
  pendingBookingConversions.delete(ref);
}

/**
 * Track a booking conversion deduplicated by booking ref within the session.
 * Safe to call from both the payment step (no-redirect flow) and the success
 * page (redirect / 3-D Secure flow) — only the first call fires.
 */
export function trackBookingConversion(ref: string, value: number, email?: string): void {
  const transactionId = ref.trim();
  if (!transactionId || hasPurchaseFired(transactionId)) return;
  if (pendingBookingConversions.has(transactionId)) return;

  pendingBookingConversions.set(transactionId, {
    ref: transactionId,
    value,
    email,
    attempts: 0,
  });
  flushPendingBookingConversion(transactionId);
}

/** Track phone call click */
export function trackCallClick(label: string) {
  safeGtag('event', 'click_call', {
    event_category: 'engagement',
    event_label: label,
  });
  // New canonical event name.
  safeGtag('event', 'call_now_click', {
    event_category: 'engagement',
    event_label: label,
  });
  if (ADS_PHONE_CONVERSION) {
    safeGtag('event', 'conversion', {
      send_to: ADS_PHONE_CONVERSION,
    });
  }
  trackEvent('call_click', { label });
}

/** Track WhatsApp click */
export function trackWhatsAppClick(label: string) {
  safeGtag('event', 'click_whatsapp', {
    event_category: 'engagement',
    event_label: label,
  });
  // New canonical event names (matches Google Ads / Tag Assistant expectations).
  safeGtag('event', 'whatsapp_click', {
    event_category: 'engagement',
    event_label: label,
  });
  if (label.startsWith('sheet_option:')) {
    safeGtag('event', 'whatsapp_option_selected', {
      event_category: 'engagement',
      event_label: label,
    });
  }
  trackEvent('whatsapp_click', { label });
}

/** Track booking wizard start */
export function trackBookingStart() {
  safeGtag('event', 'start_booking', {
    event_category: 'conversion',
  });
  trackEvent('booking_start');
}

/** Track quote-form start (instant quote / VRM lookup / manual size). */
export function trackQuoteStarted(label?: string) {
  safeGtag('event', 'quote_started', {
    event_category: 'conversion',
    event_label: label,
  });
  trackEvent('quote_started', label ? { label } : undefined);
}

/** Track callback form submission */
export function trackCallbackSubmit(userData?: { phone?: string; email?: string }) {
  if (userData) setEnhancedUserData(userData);
  safeGtag('event', 'callback_submit', {
    event_category: 'conversion',
  });
  trackContactConversion();
  trackEvent('callback_submit');
}

/** Track successful contact lead submission. */
export function trackContactSubmit(userData?: { phone?: string; email?: string }) {
  if (userData) setEnhancedUserData(userData);
  safeGtag('event', 'contact_submit', {
    event_category: 'conversion',
  });
  trackContactConversion();
  trackEvent('callback_submit', { label: 'contact_form' });
}

function trackContactConversion() {
  if (!ADS_CONTACT_CONVERSION) return;

  safeGtag('event', 'conversion', {
    send_to: ADS_CONTACT_CONVERSION,
    value: 1.0,
    currency: 'GBP',
  });
}
