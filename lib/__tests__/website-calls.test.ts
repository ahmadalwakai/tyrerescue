import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEY = 'NEXT_PUBLIC_GOOGLE_ADS_FORWARDING_PHONE';

async function loadWebsiteCalls(phone?: string) {
  vi.resetModules();
  delete process.env[ENV_KEY];
  if (phone !== undefined) process.env[ENV_KEY] = phone;
  return import('@/lib/analytics/website-calls');
}

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe('ADS_FORWARDING_PHONE', () => {
  it('is null when env var is unset', async () => {
    const { ADS_FORWARDING_PHONE } = await loadWebsiteCalls();
    expect(ADS_FORWARDING_PHONE).toBeNull();
  });

  it('accepts a valid E.164 UK number', async () => {
    const { ADS_FORWARDING_PHONE } = await loadWebsiteCalls('+441234567890');
    expect(ADS_FORWARDING_PHONE).toBe('+441234567890');
  });

  it('rejects numbers without leading +', async () => {
    const { ADS_FORWARDING_PHONE } = await loadWebsiteCalls('441234567890');
    expect(ADS_FORWARDING_PHONE).toBeNull();
  });

  it('rejects non-numeric characters after +', async () => {
    const { ADS_FORWARDING_PHONE } = await loadWebsiteCalls('+44-1234-567890');
    expect(ADS_FORWARDING_PHONE).toBeNull();
  });

  it('trims whitespace before validating', async () => {
    const { ADS_FORWARDING_PHONE } = await loadWebsiteCalls('  +441234567890  ');
    expect(ADS_FORWARDING_PHONE).toBe('+441234567890');
  });
});

describe('getTrackingPhone', () => {
  it('returns the default phone when forwarding number is unconfigured', async () => {
    const { getTrackingPhone } = await loadWebsiteCalls();
    expect(getTrackingPhone('+447700900000')).toBe('+447700900000');
  });

  it('returns the forwarding number when configured', async () => {
    const { getTrackingPhone } = await loadWebsiteCalls('+441234567890');
    expect(getTrackingPhone('+447700900000')).toBe('+441234567890');
  });
});
