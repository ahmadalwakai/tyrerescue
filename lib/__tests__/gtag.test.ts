import { afterEach, describe, expect, it, vi } from 'vitest';

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics-tracker', () => ({
  trackEvent: trackEventMock,
}));

const ADS_ENV_KEYS = [
  'NEXT_PUBLIC_GOOGLE_ADS_IDS',
  'NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
] as const;

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
    });

    expect(mod.ADS_CONVERSION_IDS).toEqual(['AW-123456789', 'AW-111222333']);
    expect(mod.ADS_CONVERSION_ID).toBe('AW-123456789');
    expect(mod.ADS_PHONE_CONVERSION).toBe('AW-123456789/phoneLabel');
    expect(mod.ADS_BOOKING_CONVERSION).toBeNull();
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
});
