import { describe, it, expect, afterEach, vi } from 'vitest';

const select = vi.fn();
vi.mock('@/lib/db', () => ({ db: { select }, bookings: {}, driverNotifications: {} }));
vi.mock('@/lib/notifications/driver-push', () => ({ notifyDriverUpcomingJob: vi.fn() }));

const { GET } = await import('@/app/api/cron/upcoming-alerts/route');

afterEach(() => {
  vi.unstubAllEnvs();
  select.mockReset();
});

describe('GET /api/cron/upcoming-alerts', () => {
  it('rejects requests without the cron secret before touching the database', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret-value');
    const res = await GET(new Request('https://www.tyrerescue.uk/api/cron/upcoming-alerts'));
    expect(res.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it('rejects "Bearer undefined" when the secret is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await GET(new Request('https://www.tyrerescue.uk/api/cron/upcoming-alerts', {
      headers: { authorization: 'Bearer undefined' },
    }));
    expect(res.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });
});
