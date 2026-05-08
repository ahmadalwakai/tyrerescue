import { trackEvent } from '@/lib/analytics-tracker';

/**
 * GA4 measurement ID. Env-overridable via NEXT_PUBLIC_GA_MEASUREMENT_ID.
 * The gtag.js loader script is requested with this ID.
 */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID.startsWith('G-')
    ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    : 'G-MLH80KPV1T';

/**
 * Google Ads conversion (AW-) IDs to register via gtag('config', ...).
 * Multiple IDs may be supplied via NEXT_PUBLIC_GOOGLE_ADS_IDS as a comma-separated list.
 *
 * Defaults install BOTH:
 *   - AW-11162561655 (current Google Ads account — required by Ads diagnostics)
 *   - AW-16460953081 (legacy account — kept until confirmed it can be removed)
 */
export const ADS_CONVERSION_IDS: string[] = (
  process.env.NEXT_PUBLIC_GOOGLE_ADS_IDS
    ? process.env.NEXT_PUBLIC_GOOGLE_ADS_IDS.split(',')
    : ['AW-11162561655', 'AW-16460953081']
)
  .map((id) => id.trim())
  .filter((id) => /^AW-\d+$/.test(id));

/** Primary Ads ID (first configured) — used for generic 'conversion' events without a label. */
export const ADS_CONVERSION_ID: string = ADS_CONVERSION_IDS[0] ?? 'AW-11162561655';

/**
 * Phone-call ads conversion send_to value (format: AW-XXXX/LABEL).
 * Configure via NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION.
 *
 * Default = the legacy AW-16460953081 call label that was previously hard-coded.
 * No label is known for AW-11162561655 yet — set the env var once it is created
 * in the Google Ads UI. We do NOT invent a label for the new account.
 */
export const ADS_PHONE_CONVERSION: string | null =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION &&
  /^AW-\d+\/.+/.test(process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION)
    ? process.env.NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION
    : 'AW-16460953081/4-0_CMK70YwcEPnrmKk9';

/**
 * Booking-purchase ads conversion send_to value (e.g. AW-XXXX/LABEL).
 * Optional. If unset we still fire GA4 'purchase'.
 *
 * Default = legacy 'AW-16460953081' (preserves prior behaviour). Replace with a
 * proper AW-11162561655/LABEL once the conversion action is created in Ads.
 */
export const ADS_BOOKING_CONVERSION: string | null =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION ?? 'AW-16460953081';

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
}
