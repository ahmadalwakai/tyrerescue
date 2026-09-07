const CONSENT_KEY = 'tyrerescue_consent_v2';

interface ConsentData {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
  version: '2';
}

/**
 * Read the stored cookie consent without importing from a UI component.
 * Returns null when running server-side or when the user hasn't chosen yet.
 */
export function getStoredConsent(): ConsentData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConsentData;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent()?.analytics === true;
}

export function hasMarketingConsent(): boolean {
  return getStoredConsent()?.marketing === true;
}
