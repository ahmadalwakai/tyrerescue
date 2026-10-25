import { describe, it, expect, afterEach, vi } from 'vitest';
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth';

function request(authorization?: string) {
  return new Request('https://www.tyrerescue.uk/api/cron/x', {
    headers: authorization ? { authorization } : {},
  });
}

afterEach(() => vi.unstubAllEnvs());

describe('isAuthorizedCronRequest', () => {
  it('accepts the configured bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-value');
    expect(isAuthorizedCronRequest(request('Bearer cron-secret-value'))).toBe(true);
  });

  it('rejects a wrong or missing header', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-value');
    expect(isAuthorizedCronRequest(request('Bearer wrong'))).toBe(false);
    expect(isAuthorizedCronRequest(request())).toBe(false);
  });

  it('rejects everything, including "Bearer undefined", when the secret is unset', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(isAuthorizedCronRequest(request('Bearer undefined'))).toBe(false);
    expect(isAuthorizedCronRequest(request('Bearer '))).toBe(false);
    expect(isAuthorizedCronRequest(request())).toBe(false);
  });
});
