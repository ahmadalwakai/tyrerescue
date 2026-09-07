export const CONSENT_KEY = 'tyrerescue_consent_v2';

export interface ConsentData {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
  version: '2';
}

export type GoogleConsentValue = 'granted' | 'denied';

export interface GoogleConsentModeState {
  analytics_storage: GoogleConsentValue;
  ad_storage: GoogleConsentValue;
  ad_user_data: GoogleConsentValue;
  ad_personalization: GoogleConsentValue;
  functionality_storage: GoogleConsentValue;
  personalization_storage: GoogleConsentValue;
  security_storage: 'granted';
}

export const GOOGLE_CONSENT_DEFAULT: GoogleConsentModeState = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
};

let memoryConsent: ConsentData | null = null;
let hasMemoryConsent = false;

function parseConsent(raw: string): ConsentData | null {
  const parsed = JSON.parse(raw) as Partial<ConsentData> | null;
  if (
    parsed?.essential === true &&
    typeof parsed.analytics === 'boolean' &&
    typeof parsed.marketing === 'boolean' &&
    typeof parsed.timestamp === 'number' &&
    parsed.version === '2'
  ) {
    return parsed as ConsentData;
  }
  return null;
}

/**
 * Read the stored cookie consent without importing from a UI component.
 * Returns null when running server-side or when the user hasn't chosen yet.
 */
export function getStoredConsent(): ConsentData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return hasMemoryConsent ? memoryConsent : null;
    const consent = parseConsent(raw);
    memoryConsent = consent;
    hasMemoryConsent = true;
    return consent;
  } catch {
    return hasMemoryConsent ? memoryConsent : null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent()?.analytics === true;
}

export function hasMarketingConsent(): boolean {
  return getStoredConsent()?.marketing === true;
}

export function saveStoredConsent(consent: ConsentData): boolean {
  memoryConsent = consent;
  hasMemoryConsent = true;
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredConsent(): boolean {
  memoryConsent = null;
  hasMemoryConsent = true;
  if (typeof window === 'undefined') return false;
  try {
    localStorage.removeItem(CONSENT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function buildGoogleConsentModeState(
  consent: Pick<ConsentData, 'analytics' | 'marketing'> | null,
): GoogleConsentModeState {
  const analytics = consent?.analytics === true;
  const marketing = consent?.marketing === true;

  return {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied',
    functionality_storage: GOOGLE_CONSENT_DEFAULT.functionality_storage,
    personalization_storage: GOOGLE_CONSENT_DEFAULT.personalization_storage,
    security_storage: GOOGLE_CONSENT_DEFAULT.security_storage,
  };
}
