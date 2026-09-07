import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION',
  'NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE',
] as const;

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
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toBe(
      'gtag(\'config\',"AW-18255235286/jSyqCMuSnvAcENaR44BE",{"phone_conversion_number":"0141 266 0690"});',
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
});
