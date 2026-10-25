import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeManualLogout } from '../../assisted-chat-app/src/lib/manual-logout';

afterEach(() => { vi.useRealTimers(); });
describe('explicit Assisted Chat sign-out', () => {
  it('completes notification cleanup before clearing the authenticated device session', async () => {
    const order: string[] = [];
    await completeManualLogout(async () => { order.push('cleanup'); }, async () => { order.push('logout'); });
    expect(order).toEqual(['cleanup', 'logout']);
  });
  it('signs out after a bounded wait when notification cleanup never responds', async () => {
    vi.useFakeTimers();
    const logout = vi.fn(async () => undefined);
    const result = completeManualLogout(() => new Promise(() => {}), logout);
    await vi.advanceTimersByTimeAsync(8_000); await result;
    expect(logout).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('still performs manual sign-out when cleanup rejects', async () => {
    const logout = vi.fn(async () => undefined);
    await completeManualLogout(async () => { throw new Error('isolated cleanup outage'); }, logout);
    expect(logout).toHaveBeenCalledOnce();
  });
  it('propagates a local sign-out failure so it is recoverable rather than falsely successful', async () => {
    await expect(completeManualLogout(async () => undefined, async () => { throw new Error('isolated durable storage failure'); }))
      .rejects.toThrow('durable storage failure');
  });
  it('does not let a delayed second click sign out a newer login', async () => {
    vi.useFakeTimers();
    let revision = 1;
    const logout = vi.fn(async () => { revision += 1; });
    const first = completeManualLogout(() => new Promise(() => {}), logout, 8_000, () => revision === 1);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = completeManualLogout(() => new Promise(() => {}), logout, 8_000, () => revision === 1);
    await vi.advanceTimersByTimeAsync(7_000); await first;
    revision += 1; // The administrator has explicitly signed in again.
    await vi.advanceTimersByTimeAsync(1_000); await second;
    expect(logout).toHaveBeenCalledOnce();
  });
  it('cannot apply a pending click after a workspace change', async () => {
    vi.useFakeTimers();
    let current = true;
    const logout = vi.fn(async () => undefined);
    const operation = completeManualLogout(() => new Promise(() => {}), logout, 8_000, () => current);
    current = false;
    await vi.advanceTimersByTimeAsync(8_000); await operation;
    expect(logout).not.toHaveBeenCalled();
  });
  it('does not start old notification cleanup if a newer login wins before its scheduled microtask', async () => {
    let current = true;
    const cleanup = vi.fn(async () => undefined);
    const logout = vi.fn(async () => undefined);
    const operation = completeManualLogout(cleanup, logout, 8_000, () => current);
    current = false;
    await operation;
    expect(cleanup).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();
  });
});
