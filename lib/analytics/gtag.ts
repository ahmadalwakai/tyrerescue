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
export const ADS_PHONE_CONVERSION: string | null =
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
export const ADS_CONTACT_CONVERSION: string | null =
  normalizeAdsSendTo(process.env.NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION);

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Track a pageview (call on client-side navigation) */
export function pageview(url: string) {
  window.gtag?.('config', GA_MEASUREMENT_ID, {
    page_path: url,
    send_page_view: false,
  });
  window.gtag?.('event', 'page_view', { page_path: url });
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
  window.gtag?.('event', action, {
    event_category: category,
    event_label: label,
    value,
  });
}

/** Track a completed booking (GA4 purchase + Google Ads conversion) */
export function trackConversion(value: number) {
  window.gtag?.('event', 'purchase', {
    value,
    currency: 'GBP',
  });

  // New canonical event name.
  window.gtag?.('event', 'booking_paid', {
    value,
    currency: 'GBP',
  });

  if (ADS_BOOKING_CONVERSION) {
    window.gtag?.('event', 'conversion', {
      send_to: ADS_BOOKING_CONVERSION,
      value,
      currency: 'GBP',
    });
  }
  trackEvent('booking_complete', { value: String(value) });
  trackEvent('booking_paid', { value: String(value) });
}

/** Track phone call click */
export function trackCallClick(label: string) {
  window.gtag?.('event', 'click_call', {
    event_category: 'engagement',
    event_label: label,
  });
  // New canonical event name.
  window.gtag?.('event', 'call_now_click', {
    event_category: 'engagement',
    event_label: label,
  });
  if (ADS_PHONE_CONVERSION) {
    window.gtag?.('event', 'conversion', {
      send_to: ADS_PHONE_CONVERSION,
    });
  }
  trackEvent('call_click', { label });
}

/** Track WhatsApp click */
export function trackWhatsAppClick(label: string) {
  window.gtag?.('event', 'click_whatsapp', {
    event_category: 'engagement',
    event_label: label,
  });
  // New canonical event names (matches Google Ads / Tag Assistant expectations).
  window.gtag?.('event', 'whatsapp_click', {
    event_category: 'engagement',
    event_label: label,
  });
  if (label.startsWith('sheet_option:')) {
    window.gtag?.('event', 'whatsapp_option_selected', {
      event_category: 'engagement',
      event_label: label,
    });
  }
  trackEvent('whatsapp_click', { label });
}

/** Track booking wizard start */
export function trackBookingStart() {
  window.gtag?.('event', 'start_booking', {
    event_category: 'conversion',
  });
  trackEvent('booking_start');
}

/** Track quote-form start (instant quote / VRM lookup / manual size). */
export function trackQuoteStarted(label?: string) {
  window.gtag?.('event', 'quote_started', {
    event_category: 'conversion',
    event_label: label,
  });
  trackEvent('quote_started', label ? { label } : undefined);
}

/** Track callback form submission */
export function trackCallbackSubmit() {
  window.gtag?.('event', 'callback_submit', {
    event_category: 'conversion',
  });
  trackContactConversion();
  trackEvent('callback_submit');
}

/** Track successful contact lead submission. */
export function trackContactSubmit() {
  window.gtag?.('event', 'contact_submit', {
    event_category: 'conversion',
  });
  trackContactConversion();
  trackEvent('callback_submit', { label: 'contact_form' });
}

function trackContactConversion() {
  if (!ADS_CONTACT_CONVERSION) return;

  window.gtag?.('event', 'conversion', {
    send_to: ADS_CONTACT_CONVERSION,
    value: 1.0,
    currency: 'GBP',
  });
}
