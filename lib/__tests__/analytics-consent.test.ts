import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CONSENT_KEY = 'tyrerescue_consent_v2';

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
