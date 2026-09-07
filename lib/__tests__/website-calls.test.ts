import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE',
] as const;
const root = process.cwd();

async function loadWebsiteCalls(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  return import('@/lib/analytics/website-calls');
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('Google Ads website call tracking', () => {
  it('never renders a static forwarding phone number', async () => {
    const { ADS_FORWARDING_PHONE, getTrackingPhone } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE: '+441234567890',
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });

    expect(ADS_FORWARDING_PHONE).toBeNull();
    expect(getTrackingPhone('0141 266 0690')).toBe('0141 266 0690');
  });

  it('builds the verified actual website-call gtag config without phone-click env', async () => {
    const {
      ADS_ACTUAL_WEBSITE_CALL_CONVERSION,
      ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
      getGoogleAdsWebsiteCallConfig,
      renderGoogleAdsWebsiteCallConfig,
    } =
      await loadWebsiteCalls();

    expect(getGoogleAdsWebsiteCallConfig(' 0141   266   0690 ')).toEqual({
      conversionId: ADS_ACTUAL_WEBSITE_CALL_CONVERSION,
      phoneConversionNumber: ADS_ACTUAL_WEBSITE_CALL_DISPLAY_PHONE,
    });
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toContain(
      'phone_conversion_callback',
    );
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toContain(
      'AW-18255235286/jSyqCMuSnvAcENaR44BE',
    );
  });

  it('keeps actual website calls independent from ADS_PHONE_CONVERSION collisions', async () => {
    const { getGoogleAdsWebsiteCallConfig } =
      await loadWebsiteCalls({
        NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/contactLabel',
        NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-123456789/contactLabel',
      });

    expect(getGoogleAdsWebsiteCallConfig('0141 266 0690')).toEqual({
      conversionId: 'AW-18255235286/jSyqCMuSnvAcENaR44BE',
      phoneConversionNumber: '0141 266 0690',
    });
  });

  it('scopes website-call activation by consent, host and route', async () => {
    const { isGoogleAdsWebsiteCallEligible } = await loadWebsiteCalls();

    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/',
        marketingConsent: true,
      }),
    ).toBe(true);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/',
        marketingConsent: false,
      }),
    ).toBe(false);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.dukestreettyres.com',
        pathname: '/',
        marketingConsent: true,
      }),
    ).toBe(false);
    expect(
      isGoogleAdsWebsiteCallEligible({
        hostname: 'www.tyrerescue.uk',
        pathname: '/tracking/TR-123',
        marketingConsent: true,
      }),
    ).toBe(false);
  });

  it('rejects invalid displayed phone numbers', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });

    expect(getGoogleAdsWebsiteCallConfig('12345')).toBeNull();
  });

  it('does not build actual website-call config for a different valid display number', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls();

    expect(getGoogleAdsWebsiteCallConfig('0121 555 1212')).toBeNull();
  });

  it('normalizes mobile tel destinations without replacing the actual fallback number', async () => {
    const { getTelHrefForDisplayPhone, isActualWebsiteCallTelHref } = await loadWebsiteCalls();

    expect(getTelHrefForDisplayPhone('0800 123 4567')).toBe('tel:08001234567');
    expect(getTelHrefForDisplayPhone('+44 141 266 0690')).toBe('tel:+441412660690');
    expect(isActualWebsiteCallTelHref('tel:01412660690')).toBe(true);
    expect(isActualWebsiteCallTelHref('tel:+441412660690')).toBe(true);
    expect(isActualWebsiteCallTelHref('tel:08001234567')).toBe(false);
  });

  it('configures website calls with Google phone_conversion_callback', async () => {
    const {
      buildGoogleAdsWebsiteCallConfigPayload,
      configureGoogleAdsWebsiteCall,
    } = await loadWebsiteCalls();
    const callback = vi.fn();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });

    expect(buildGoogleAdsWebsiteCallConfigPayload(callback)).toMatchObject({
      phone_conversion_number: '0141 266 0690',
      phone_conversion_callback: callback,
    });
    expect(configureGoogleAdsWebsiteCall(undefined, callback)).toBe(true);
    expect(gtag).toHaveBeenCalledWith(
      'config',
      'AW-18255235286/jSyqCMuSnvAcENaR44BE',
      expect.objectContaining({
        phone_conversion_number: '0141 266 0690',
        phone_conversion_callback: callback,
      }),
    );
  });

  it('registers only the explicit Google callback hook', async () => {
    const {
      GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME,
      registerGoogleAdsWebsiteCallCallback,
    } = await loadWebsiteCalls();
    const callback = vi.fn();
    const win: Record<string, unknown> = {};
    vi.stubGlobal('window', win);

    const unregister = registerGoogleAdsWebsiteCallCallback(callback);
    expect(win[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]).toBe(callback);

    unregister();
    expect(win[GOOGLE_ADS_PHONE_CONVERSION_CALLBACK_NAME]).toBeUndefined();
  });

  it('rejects WhatsApp and mobile numbers from Google callback values', async () => {
    const { normalizeGoogleAdsPhoneConversionCallback } = await loadWebsiteCalls();

    expect(normalizeGoogleAdsPhoneConversionCallback('07423 262955')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('+44 7423 262955')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('07700 900000')).toBeNull();
    expect(normalizeGoogleAdsPhoneConversionCallback('0800 123 4567')).toEqual({
      displayPhone: '0800 123 4567',
      telHref: 'tel:08001234567',
    });
  });

  it('does not contain arbitrary forwarding-number discovery', () => {
    const source = readSource('lib/analytics/website-calls.ts');

    expect(source).toContain('phone_conversion_callback');
    expect(source).not.toContain('\\d[\\d\\s().-]{8,}\\d');
    expect(source).not.toContain('extractPhoneDisplays');
    expect(source).not.toContain('findGoogleAdsForwardingPhone(root');
  });
});
