import { describe, it, expect, beforeEach, vi } from 'vitest';
import { errors } from 'jose';

const state = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = 'isolated-revocation-test-key-not-for-production';
  return { adminRows: [] as Array<{ id: string }>, driverLookup: vi.fn() };
});

vi.mock('@/lib/db', () => {
  const query = { from: () => query, where: () => query, innerJoin: () => query, limit: async () => state.adminRows };
  return { db: { select: () => query }, users: {}, accounts: {}, drivers: {} };
});
vi.mock('@/lib/auth/driver-device-sessions', () => ({
  getCurrentDriverSessionUser: state.driverLookup,
  DriverDeviceSessionUnauthorizedError: class DriverDeviceSessionUnauthorizedError extends Error {},
}));
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock('next-auth/providers/credentials', () => ({ default: () => ({}) }));
vi.mock('next-auth/providers/google', () => ({ default: () => ({}) }));

const { signMobileToken, verifyMobileToken } = await import('@/lib/auth');

beforeEach(() => {
  state.adminRows = [];
  state.driverLookup.mockReset();
});

describe('verifyMobileToken re-checks staff accounts', () => {
  it('accepts an admin token while the user is still a verified admin', async () => {
    state.adminRows = [{ id: 'admin-1' }];
    const token = await signMobileToken({ id: 'admin-1', email: 'a@example.com', name: 'A', role: 'admin' });
    await expect(verifyMobileToken(token)).resolves.toMatchObject({ id: 'admin-1', role: 'admin' });
  });

  it('rejects an admin token once the admin role is removed', async () => {
    const token = await signMobileToken({ id: 'admin-1', email: 'a@example.com', name: 'A', role: 'admin' });
    await expect(verifyMobileToken(token)).rejects.toThrow();
  });

  it('checks a driver token against the current driver record', async () => {
    state.driverLookup.mockResolvedValue({ id: 'u-2', sub: 'u-2', email: 'd@example.com', name: 'D', role: 'driver', driverId: 'drv-1' });
    const token = await signMobileToken({ id: 'u-2', email: 'd@example.com', name: 'D', role: 'driver', driverId: 'drv-1' });
    await expect(verifyMobileToken(token)).resolves.toMatchObject({ driverId: 'drv-1' });
    expect(state.driverLookup).toHaveBeenCalledWith('u-2', 'drv-1');
  });

  it('rejects a driver token once the driver is removed, as an auth failure', async () => {
    const { DriverDeviceSessionUnauthorizedError } = await import('@/lib/auth/driver-device-sessions');
    state.driverLookup.mockRejectedValue(new DriverDeviceSessionUnauthorizedError());
    const token = await signMobileToken({ id: 'u-2', email: 'd@example.com', name: 'D', role: 'driver', driverId: 'drv-1' });
    await expect(verifyMobileToken(token)).rejects.toBeInstanceOf(errors.JOSEError);
  });

  it('lets a database failure propagate instead of looking like a revoked token', async () => {
    state.driverLookup.mockRejectedValue(new Error('database unavailable'));
    const token = await signMobileToken({ id: 'u-2', email: 'd@example.com', name: 'D', role: 'driver', driverId: 'drv-1' });
    await expect(verifyMobileToken(token)).rejects.not.toBeInstanceOf(errors.JOSEError);
  });
});
