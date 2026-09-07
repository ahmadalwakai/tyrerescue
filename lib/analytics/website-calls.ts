import { ADS_PHONE_CONVERSION } from '@/lib/analytics/gtag';

/**
 * Google Ads Website Call Tracking.
 *
 * The site must render the real business phone number. When a verified Google
 * Ads website-call conversion label is configured, gtag.js can dynamically
 * replace that number with a Google forwarding number at runtime.
 */

export interface GoogleAdsWebsiteCallConfig {
  conversionId: string;
  phoneConversionNumber: string;
}

/** Deprecated: static forwarding numbers must never be rendered by the app. */
export const ADS_FORWARDING_PHONE: null = null;

function normalizePhoneConversionNumber(value: string): string | null {
  const phone = value.trim().replace(/\s+/g, ' ');
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? phone : null;
}

export function getGoogleAdsWebsiteCallConfig(
  defaultPhone: string,
): GoogleAdsWebsiteCallConfig | null {
  const phoneConversionNumber = normalizePhoneConversionNumber(defaultPhone);
  if (!ADS_PHONE_CONVERSION || !phoneConversionNumber) return null;

  return {
    conversionId: ADS_PHONE_CONVERSION,
    phoneConversionNumber,
  };
}

export function renderGoogleAdsWebsiteCallConfig(defaultPhone: string): string {
  const config = getGoogleAdsWebsiteCallConfig(defaultPhone);
  if (!config) return '';

  return `gtag('config',${JSON.stringify(config.conversionId)},${JSON.stringify({
    phone_conversion_number: config.phoneConversionNumber,
  })});`;
}

/**
 * Preserve the old call-site contract while avoiding fake forwarding numbers.
 * Google Ads dynamic number insertion happens after render via gtag.js.
 */
export function getTrackingPhone(defaultPhone: string): string {
  return defaultPhone;
}
