export const GA_MEASUREMENT_ID = 'G-MLH80KPV1T';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Track a pageview (call on client-side navigation) */
export function pageview(url: string) {
  window.gtag?.('config', GA_MEASUREMENT_ID, { page_path: url });
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
