/**
 * Google Ads Website Call Tracking — forwarding-number configuration.
 *
 * Google Ads can replace the site's displayed phone number with a unique
 * forwarding number so inbound calls are attributed to the matching campaign.
 * Set NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE to the E.164 number Google
 * assigned in Ads → Goals → Phone calls → Website call (auto-detected).
 *
 * When the env var is unset or invalid, getTrackingPhone() falls back to the
 * brand's canonical number so no call is ever missed.
 */

/** Validated E.164 forwarding number, or null when unconfigured. */
export const ADS_FORWARDING_PHONE: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE?.trim();
  if (!raw) return null;
  return /^\+[1-9]\d{6,14}$/.test(raw) ? raw : null;
})();

/**
 * Return the phone number that should be displayed and linked on the site.
 * Uses the Google Ads forwarding number when configured so calls are tracked
 * at the campaign level; otherwise returns the brand's default number.
 */
export function getTrackingPhone(defaultPhone: string): string {
  return ADS_FORWARDING_PHONE ?? defaultPhone;
}
