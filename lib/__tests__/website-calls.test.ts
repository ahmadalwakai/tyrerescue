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

  it('returns no dynamic call config without a verified phone conversion label', async () => {
    const { getGoogleAdsWebsiteCallConfig, renderGoogleAdsWebsiteCallConfig } =
      await loadWebsiteCalls();

    expect(getGoogleAdsWebsiteCallConfig('0141 266 0690')).toBeNull();
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toBe('');
  });

  it('builds the verified Google website-call gtag config', async () => {
    const { getGoogleAdsWebsiteCallConfig, renderGoogleAdsWebsiteCallConfig } =
      await loadWebsiteCalls({
        NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
      });

    expect(getGoogleAdsWebsiteCallConfig(' 0141   266   0690 ')).toEqual({
      conversionId: 'AW-123456789/phoneLabel',
      phoneConversionNumber: '0141 266 0690',
    });
    expect(renderGoogleAdsWebsiteCallConfig('0141 266 0690')).toBe(
      'gtag(\'config\',"AW-123456789/phoneLabel",{"phone_conversion_number":"0141 266 0690"});',
    );
  });

  it('does not configure website calls when the phone label collides with Contact', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/contactLabel',
      NEXT_PUBLIC_GOOGLE_ADS_CONTACT_CONVERSION: 'AW-123456789/contactLabel',
    });

    expect(getGoogleAdsWebsiteCallConfig('0141 266 0690')).toBeNull();
  });

  it('rejects invalid displayed phone numbers', async () => {
    const { getGoogleAdsWebsiteCallConfig } = await loadWebsiteCalls({
      NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION: 'AW-123456789/phoneLabel',
    });

    expect(getGoogleAdsWebsiteCallConfig('12345')).toBeNull();
  });
});
