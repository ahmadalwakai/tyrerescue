import { afterEach, describe, expect, it, vi } from 'vitest';

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics-tracker', () => ({
  trackEvent: trackEventMock,
}));

const ADS_ENV_KEYS = [
  'NEXT_PUBLIC_GOOGLE_ADS_IDS',
  'NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
] as const;
const CONSENT_KEY = 'tyrerescue_consent_v2';

function makeStorage() {
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

async function loadGtag(env: Partial<Record<(typeof ADS_ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  trackEventMock.mockClear();
  for (const key of ADS_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);

  const mod = await import('@/lib/analytics/gtag');
  return { mod, trackEvent: trackEventMock };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  trackEventMock.mockClear();
  for (const key of ADS_ENV_KEYS) {
    delete process.env[key];
  }
});

describe('gtag analytics helpers', () => {
  it('does not fall back to legacy Google Ads IDs', async () => {
    const { mod } = await loadGtag();

    expect(mod.GA_MEASUREMENT_ID).toBe('G-MLH80KPV1T');
    expect(mod.ADS_CONVERSION_IDS).toEqual([]);
    expect(mod.ADS_CONVERSION_ID).toBeNull();
    expect(mod.ADS_PHONE_CONVERSION).toBeNull();
    expect(mod.ADS_BOOKING_CONVERSION).toBeNull();
    expect(mod.ADS_CONTACT_CONVERSION).toBeNull();
  });

  it('does not use the GA placeholder from env examples', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-XXXXXXXXXX',
    });

    expect(mod.GA_MEASUREMENT_ID).toBe('G-MLH80KPV1T');
  });

  it('uses only valid Google Ads env values', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_IDS: 'AW-123456789, invalid, AW-987654321/label, AW-111222333',
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
      NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION: 'not-a-send-to',
      NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-123456789/contactLabel',
    });

    expect(mod.ADS_CONVERSION_IDS).toEqual(['AW-123456789', 'AW-111222333']);
    expect(mod.ADS_CONVERSION_ID).toBe('AW-123456789');
    expect(mod.ADS_PHONE_CONVERSION).toBe('AW-123456789/phoneLabel');
    expect(mod.ADS_BOOKING_CONVERSION).toBeNull();
    expect(mod.ADS_CONTACT_CONVERSION).toBe('AW-123456789/contactLabel');
  });

  it('trims Google Ads conversion send_to values from env', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: '  AW-123456789/phoneLabel\n',
      NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: '\nAW-123456789/contactLabel  ',
    });

    expect(mod.ADS_PHONE_CONVERSION).toBe('AW-123456789/phoneLabel');
    expect(mod.ADS_CONTACT_CONVERSION).toBe('AW-123456789/contactLabel');
  });

  it('disables phone Ads conversion when it collides with the Contact label', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-18255235286/o1PQCKOk-MYcENaR44BE',
      NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-18255235286/o1PQCKOk-MYcENaR44BE',
    });
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    expect(mod.ADS_PHONE_CONTACT_LABEL_COLLISION).toBe(true);
    expect(mod.ADS_PHONE_CONVERSION).toBeNull();
    expect(mod.ADS_CONTACT_CONVERSION).toBe('AW-18255235286/o1PQCKOk-MYcENaR44BE');

    mod.trackCallClick('contact_page_card');
    expect(gtag).not.toHaveBeenCalledWith('event', 'conversion', expect.anything());

    mod.trackContactSubmit();
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18255235286/o1PQCKOk-MYcENaR44BE',
      value: 1.0,
      currency: 'GBP',
    });
  });

  it('tracks call clicks without Ads conversion when no verified phone label is configured', async () => {
    const { mod, trackEvent } = await loadGtag();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.trackCallClick('hero');

    expect(gtag).toHaveBeenCalledWith('event', 'click_call', {
      event_category: 'engagement',
      event_label: 'hero',
    });
    expect(gtag).toHaveBeenCalledWith('event', 'call_now_click', {
      event_category: 'engagement',
      event_label: 'hero',
    });
    expect(gtag).not.toHaveBeenCalledWith('event', 'conversion', expect.anything());
    expect(trackEvent).toHaveBeenCalledWith('call_click', { label: 'hero' });
  });

  it('fires the Ads phone conversion only from verified env send_to config', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.trackCallClick('sticky_mobile');

    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-123456789/phoneLabel',
    });
  });

  it('never emits the verified actual website-call action from trackCallClick', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-18255235286/jSyqCMuSnvAcENaR44BE',
    });
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    expect(mod.ADS_PHONE_ACTUAL_CALL_LABEL_COLLISION).toBe(true);
    expect(mod.ADS_PHONE_CONVERSION).toBeNull();

    mod.trackCallClick('sticky_mobile');

    expect(gtag).not.toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18255235286/jSyqCMuSnvAcENaR44BE',
    });
  });

  it('tracks callback submissions locally as a secondary lead action', async () => {
    const { mod, trackEvent } = await loadGtag();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.trackCallbackSubmit();

    expect(gtag).toHaveBeenCalledWith('event', 'callback_submit', {
      event_category: 'conversion',
    });
    expect(trackEvent).toHaveBeenCalledWith('callback_submit');
  });

  it('fires the Ads contact conversion from verified env send_to config', async () => {
    const { mod, trackEvent } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-18255235286/o1PQCKOk-MYcENaR44BE',
    });
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.trackContactSubmit();

    expect(gtag).toHaveBeenCalledWith('event', 'contact_submit', {
      event_category: 'conversion',
    });
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18255235286/o1PQCKOk-MYcENaR44BE',
      value: 1.0,
      currency: 'GBP',
    });
    // Internal tracker re-uses 'callback_submit' with label to distinguish from actual callbacks.
    expect(trackEvent).toHaveBeenCalledWith('callback_submit', { label: 'contact_form' });
  });

  it('does not send enhanced user data without marketing consent', async () => {
    const { mod } = await loadGtag();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.setEnhancedUserData({ email: 'USER@example.COM', phone: '07700 900000' });

    expect(gtag).not.toHaveBeenCalledWith('set', 'user_data', expect.anything());
  });

  it('sends enhanced user data only after marketing consent is granted', async () => {
    const { mod } = await loadGtag();
    const local = makeStorage();
    local.setItem(
      CONSENT_KEY,
      JSON.stringify({
        essential: true,
        analytics: true,
        marketing: true,
        timestamp: 1,
        version: '2',
      }),
    );
    const gtag = vi.fn();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('window', { gtag });

    mod.setEnhancedUserData({ email: 'USER@example.COM', phone: '07700 900000' });

    expect(gtag).toHaveBeenCalledWith('set', 'user_data', {
      email: 'user@example.com',
      phone_number: '+447700900000',
    });
  });

  it('keeps GA4 purchase events and Google Ads conversion on separate gtag calls', async () => {
    const { mod } = await loadGtag({
      NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION: 'AW-123456789/bookingLabel',
    });
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    mod.trackConversion(99.99, 'user@example.com');

    // GA4 events — no send_to
    expect(gtag).toHaveBeenCalledWith('event', 'purchase', { value: 99.99, currency: 'GBP' });
    expect(gtag).toHaveBeenCalledWith('event', 'booking_paid', { value: 99.99, currency: 'GBP' });
    // Google Ads conversion — explicit send_to, separate call
    expect(gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-123456789/bookingLabel',
      value: 99.99,
      currency: 'GBP',
    });
    // Confirm no GA4 event accidentally received a send_to
    const purchaseCall = gtag.mock.calls.find(([, name]) => name === 'purchase');
    expect(purchaseCall?.[2]).not.toHaveProperty('send_to');
  });

  describe('trackBookingConversion (deduplication)', () => {
    function makeSessionStorage() {
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

    it('fires conversion on the first call', async () => {
      const ss = makeSessionStorage();
      vi.stubGlobal('sessionStorage', ss);
      const { mod, trackEvent } = await loadGtag({
        NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION: 'AW-123456789/bookingLabel',
      });
      const gtag = vi.fn();
      vi.stubGlobal('window', { gtag });

      mod.trackBookingConversion('TR-001', 49.99, 'a@b.com');

      expect(gtag).toHaveBeenCalledWith('event', 'purchase', {
        value: 49.99,
        currency: 'GBP',
        transaction_id: 'TR-001',
      });
      expect(trackEvent).toHaveBeenCalledWith('booking_paid', { value: '49.99' });
    });

    it('does not fire a second time for the same booking ref', async () => {
      const ss = makeSessionStorage();
      vi.stubGlobal('sessionStorage', ss);
      const { mod } = await loadGtag({
        NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION: 'AW-123456789/bookingLabel',
      });
      const gtag = vi.fn();
      vi.stubGlobal('window', { gtag });

      mod.trackBookingConversion('TR-002', 49.99);
      gtag.mockClear();
      mod.trackBookingConversion('TR-002', 49.99);

      expect(gtag).not.toHaveBeenCalled();
    });

    it('fires independently for different booking refs', async () => {
      const ss = makeSessionStorage();
      vi.stubGlobal('sessionStorage', ss);
      const { mod } = await loadGtag();
      const gtag = vi.fn();
      vi.stubGlobal('window', { gtag });

      mod.trackBookingConversion('TR-003', 10);
      mod.trackBookingConversion('TR-004', 20);

      const purchaseCalls = gtag.mock.calls.filter(([, name]) => name === 'purchase');
      expect(purchaseCalls).toHaveLength(2);
      expect(purchaseCalls.map((call) => call[2])).toEqual([
        { value: 10, currency: 'GBP', transaction_id: 'TR-003' },
        { value: 20, currency: 'GBP', transaction_id: 'TR-004' },
      ]);
    });

    it('retries when gtag is unavailable and deduplicates after it succeeds', async () => {
      vi.useFakeTimers();
      const { mod } = await loadGtag();
      const win: { gtag?: (...args: unknown[]) => void } = {};
      vi.stubGlobal('window', win);

      mod.trackBookingConversion('TR-RETRY', 79.99, 'retry@example.com');
      expect(trackEventMock).not.toHaveBeenCalledWith('booking_paid', expect.anything());

      const gtag = vi.fn();
      win.gtag = gtag;
      await vi.advanceTimersByTimeAsync(500);

      expect(gtag).toHaveBeenCalledWith('event', 'purchase', {
        value: 79.99,
        currency: 'GBP',
        transaction_id: 'TR-RETRY',
      });

      gtag.mockClear();
      mod.trackBookingConversion('TR-RETRY', 79.99, 'retry@example.com');
      expect(gtag).not.toHaveBeenCalled();
    });

    it('still fires once when sessionStorage is blocked', async () => {
      const blockedStorage = {
        getItem: vi.fn(() => {
          throw new Error('blocked');
        }),
        setItem: vi.fn(() => {
          throw new Error('blocked');
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      };
      vi.stubGlobal('sessionStorage', blockedStorage);
      const { mod } = await loadGtag();
      const gtag = vi.fn();
      vi.stubGlobal('window', { gtag });

      mod.trackBookingConversion('TR-NOSTORE', 12.34);
      mod.trackBookingConversion('TR-NOSTORE', 12.34);

      const purchaseCalls = gtag.mock.calls.filter(([, name]) => name === 'purchase');
      expect(purchaseCalls).toHaveLength(1);
    });
  });
});
