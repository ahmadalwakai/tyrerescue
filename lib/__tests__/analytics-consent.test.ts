import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONSENT_KEY = 'tyrerescue_consent_v2';
const root = process.cwd();

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
  };
}

let fakeStorage: ReturnType<typeof makeLocalStorage>;

beforeEach(() => {
  fakeStorage = makeLocalStorage();
  vi.stubGlobal('localStorage', fakeStorage);
  vi.stubGlobal('window', { localStorage: fakeStorage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadConsent() {
  vi.resetModules();
  return import('@/lib/analytics/consent');
}

function writeConsent(analytics: boolean, marketing: boolean) {
  fakeStorage.setItem(
    CONSENT_KEY,
    JSON.stringify({ essential: true, analytics, marketing, timestamp: Date.now(), version: '2' }),
  );
}

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('getStoredConsent', () => {
  it('returns null when nothing is stored', async () => {
    const { getStoredConsent } = await loadConsent();
    expect(getStoredConsent()).toBeNull();
  });

  it('returns null on the server (no window)', async () => {
    vi.stubGlobal('window', undefined);
    const { getStoredConsent } = await loadConsent();
    expect(getStoredConsent()).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    fakeStorage.setItem(CONSENT_KEY, 'not-json');
    const { getStoredConsent } = await loadConsent();
    expect(getStoredConsent()).toBeNull();
  });

  it('returns the stored consent object', async () => {
    writeConsent(true, false);
    const { getStoredConsent } = await loadConsent();
    const result = getStoredConsent();
    expect(result?.analytics).toBe(true);
    expect(result?.marketing).toBe(false);
  });
});

describe('saveStoredConsent', () => {
  it('stores consent with the shared key', async () => {
    const { CONSENT_KEY, saveStoredConsent } = await loadConsent();

    const stored = saveStoredConsent({
      essential: true,
      analytics: true,
      marketing: false,
      timestamp: 1,
      version: '2',
    });

    expect(stored).toBe(true);
    expect(JSON.parse(fakeStorage.getItem(CONSENT_KEY)!)).toMatchObject({
      analytics: true,
      marketing: false,
    });
  });

  it('returns false when browser storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      removeItem: vi.fn(),
    });
    const { saveStoredConsent } = await loadConsent();

    expect(
      saveStoredConsent({
        essential: true,
        analytics: true,
        marketing: true,
        timestamp: 1,
        version: '2',
      }),
    ).toBe(false);
  });
});

describe('buildGoogleConsentModeState', () => {
  it('defaults all optional Google storage grants to denied', async () => {
    const { buildGoogleConsentModeState } = await loadConsent();

    expect(buildGoogleConsentModeState(null)).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
    });
  });

  it('maps analytics and marketing choices to Consent Mode v2', async () => {
    const { buildGoogleConsentModeState } = await loadConsent();

    expect(buildGoogleConsentModeState({ analytics: true, marketing: false })).toMatchObject({
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    expect(buildGoogleConsentModeState({ analytics: false, marketing: true })).toMatchObject({
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  });
});

describe('hasAnalyticsConsent', () => {
  it('returns false when no consent stored', async () => {
    const { hasAnalyticsConsent } = await loadConsent();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it('returns true when analytics consent granted', async () => {
    writeConsent(true, false);
    const { hasAnalyticsConsent } = await loadConsent();
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it('returns false when analytics consent denied', async () => {
    writeConsent(false, true);
    const { hasAnalyticsConsent } = await loadConsent();
    expect(hasAnalyticsConsent()).toBe(false);
  });
});

describe('hasMarketingConsent', () => {
  it('returns false when no consent stored', async () => {
    const { hasMarketingConsent } = await loadConsent();
    expect(hasMarketingConsent()).toBe(false);
  });

  it('returns true when marketing consent granted', async () => {
    writeConsent(false, true);
    const { hasMarketingConsent } = await loadConsent();
    expect(hasMarketingConsent()).toBe(true);
  });

  it('returns false when marketing consent denied', async () => {
    writeConsent(true, false);
    const { hasMarketingConsent } = await loadConsent();
    expect(hasMarketingConsent()).toBe(false);
  });
});

describe('consent wiring', () => {
  it('wires the banner, provider, and layout through the shared consent module', () => {
    const bannerSource = readSource('components/ui/CookieBanner.tsx');
    const providerSource = readSource('components/ui/AnalyticsProvider.tsx');
    const layoutSource = readSource('app/layout.tsx');

    expect(bannerSource).toContain("from '@/lib/analytics/consent'");
    expect(providerSource).toContain('getStoredConsent');
    expect(providerSource).toContain('cookie-consent-reset');
    expect(providerSource).toContain('clearEnhancedUserData');
    expect(layoutSource).toContain('GOOGLE_CONSENT_DEFAULT');
  });
});
