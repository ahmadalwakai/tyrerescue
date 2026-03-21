export const GA_MEASUREMENT_ID = 'G-MLH80KPV1T';
export const ADS_CONVERSION_ID = 'AW-16460953081';
export const ADS_PHONE_CONVERSION = 'AW-16460953081/4-0_CMK70YwcEPnrmKk9';

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

  window.gtag?.('event', 'conversion', {
    send_to: ADS_CONVERSION_ID,
    value,
    currency: 'GBP',
  });
}

/** Track phone call click */
export function trackCallClick(label: string) {
  window.gtag?.('event', 'click_call', {
    event_category: 'engagement',
    event_label: label,
  });
  window.gtag?.('event', 'conversion', {
    send_to: ADS_PHONE_CONVERSION,
  });
}

/** Track WhatsApp click */
export function trackWhatsAppClick(label: string) {
  window.gtag?.('event', 'click_whatsapp', {
    event_category: 'engagement',
    event_label: label,
  });
}

/** Track booking wizard start */
export function trackBookingStart() {
  window.gtag?.('event', 'start_booking', {
    event_category: 'conversion',
  });
}

/** Track callback form submission */
export function trackCallbackSubmit() {
  window.gtag?.('event', 'callback_submit', {
    event_category: 'conversion',
  });
}
