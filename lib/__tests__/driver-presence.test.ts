import { describe, it, expect } from 'vitest';
import {
  getDriverPresenceState,
  shouldDriverAppearOnline,
  canDriverReceiveNewBooking,
  isDriverLocationFresh,
  isLocationTrustworthy,
  STALE_THRESHOLD_MINUTES,
  OFFLINE_GRACE_MINUTES,
  ACTIVE_JOB_GRACE_MINUTES,
} from '../driver-presence';

function minutesAgo(mins: number): Date {
  return new Date(Date.now() - mins * 60_000);
}

describe('driver-presence', () => {
  // ── isDriverLocationFresh ──

  it('fresh if locationAt is within STALE_THRESHOLD_MINUTES', () => {
    expect(isDriverLocationFresh(minutesAgo(1))).toBe(true);
    expect(isDriverLocationFresh(minutesAgo(STALE_THRESHOLD_MINUTES - 1))).toBe(true);
  });

  it('stale if locationAt exceeds STALE_THRESHOLD_MINUTES', () => {
    expect(isDriverLocationFresh(minutesAgo(STALE_THRESHOLD_MINUTES + 1))).toBe(false);
    expect(isDriverLocationFresh(minutesAgo(30))).toBe(false);
  });

  it('not fresh if locationAt is null', () => {
    expect(isDriverLocationFresh(null)).toBe(false);
  });

  // ── getDriverPresenceState ──

  describe('getDriverPresenceState', () => {
    it('offline if isOnline=false and no active booking', () => {
      expect(
        getDriverPresenceState({ isOnline: false, locationAt: null, status: 'offline' }),
      ).toBe('offline');
    });

    it('online_fresh when online with recent location', () => {
      expect(
        getDriverPresenceState({ isOnline: true, locationAt: minutesAgo(1), status: 'available' }),
      ).toBe('online_fresh');
    });

    it('online_stale when online but location older than STALE threshold but within grace', () => {
      const staleButInGrace = minutesAgo(STALE_THRESHOLD_MINUTES + 2); // > 5min, < 10min
      expect(
        getDriverPresenceState({ isOnline: true, locationAt: staleButInGrace, status: 'available' }),
      ).toBe('online_stale');
    });

    it('offline when online but location exceeds grace window', () => {
      const beyondGrace = minutesAgo(OFFLINE_GRACE_MINUTES + 5);
      expect(
        getDriverPresenceState({ isOnline: true, locationAt: beyondGrace, status: 'available' }),
      ).toBe('offline');
    });

    it('active_job_fresh with active booking and fresh location', () => {
      expect(
        getDriverPresenceState(
          { isOnline: true, locationAt: minutesAgo(2), status: 'en_route' },
          { status: 'en_route' },
        ),
      ).toBe('active_job_fresh');
    });

    it('active_job_stale with active booking and stale location', () => {
      expect(
        getDriverPresenceState(
          { isOnline: true, locationAt: minutesAgo(30), status: 'en_route' },
          { status: 'en_route' },
        ),
      ).toBe('active_job_stale');
    });

    it('active_job_stale even after 60+ minutes when booking is active (never drops to offline)', () => {
      expect(
        getDriverPresenceState(
          { isOnline: false, locationAt: minutesAgo(120), status: 'in_progress' },
          { status: 'in_progress' },
        ),
      ).toBe('active_job_stale');
    });

    it('active booking protects driver even when isOnline=false', () => {
      const result = getDriverPresenceState(
        { isOnline: false, locationAt: minutesAgo(3), status: 'en_route' },
        { status: 'en_route' },
      );
      expect(result).toBe('active_job_fresh');
    });
  });

  // ── shouldDriverAppearOnline ──

  describe('shouldDriverAppearOnline', () => {
    it('true for all non-offline states', () => {
      expect(shouldDriverAppearOnline({ isOnline: true, locationAt: minutesAgo(1), status: 'available' })).toBe(true);
      expect(shouldDriverAppearOnline({ isOnline: true, locationAt: minutesAgo(8), status: 'available' })).toBe(true);
      expect(shouldDriverAppearOnline(
        { isOnline: false, locationAt: minutesAgo(3), status: 'en_route' },
        { status: 'en_route' },
      )).toBe(true);
    });

    it('false for offline', () => {
      expect(shouldDriverAppearOnline({ isOnline: false, locationAt: null, status: 'offline' })).toBe(false);
    });
  });

  // ── canDriverReceiveNewBooking ──

  describe('canDriverReceiveNewBooking', () => {
    it('true for online_fresh drivers without active booking', () => {
      expect(
        canDriverReceiveNewBooking({ isOnline: true, locationAt: minutesAgo(1), status: 'available' }),
      ).toBe(true);
    });

    it('true for online_stale drivers within grace (deprioritised but available)', () => {
      expect(
        canDriverReceiveNewBooking({ isOnline: true, locationAt: minutesAgo(7), status: 'available' }),
      ).toBe(true);
    });

    it('false for drivers with active bookings', () => {
      expect(
        canDriverReceiveNewBooking(
          { isOnline: true, locationAt: minutesAgo(1), status: 'en_route' },
          { status: 'en_route' },
        ),
      ).toBe(false);
    });

    it('false for offline drivers', () => {
      expect(
        canDriverReceiveNewBooking({ isOnline: false, locationAt: null, status: 'offline' }),
      ).toBe(false);
    });

    it('false for stale drivers beyond grace window', () => {
      expect(
        canDriverReceiveNewBooking({ isOnline: true, locationAt: minutesAgo(15), status: 'available' }),
      ).toBe(false);
    });
  });

  // ── isLocationTrustworthy ──

  describe('isLocationTrustworthy', () => {
    it('trustworthy if fresh', () => {
      expect(isLocationTrustworthy(minutesAgo(2))).toBe(true);
    });

    it('not trustworthy if stale', () => {
      expect(isLocationTrustworthy(minutesAgo(10))).toBe(false);
    });

    it('not trustworthy if null', () => {
      expect(isLocationTrustworthy(null)).toBe(false);
    });
  });

  // ── Scenario: browser close during active job ──

  it('driver with active booking remains visible after browser close (no heartbeat)', () => {
    // Simulate: driver was online, had an active job, browser closed 15 min ago
    const driver = { isOnline: true, locationAt: minutesAgo(15), status: 'en_route' };
    const booking = { status: 'en_route' };

    const state = getDriverPresenceState(driver, booking);
    expect(state).toBe('active_job_stale');
    expect(shouldDriverAppearOnline(driver, booking)).toBe(true);
    // Should NOT receive new bookings while on active job
    expect(canDriverReceiveNewBooking(driver, booking)).toBe(false);
  });

  // ── Scenario: browser close without active job ──

  it('driver without active job stays online during grace window after browser close', () => {
    const driver = { isOnline: true, locationAt: minutesAgo(7), status: 'available' };

    expect(getDriverPresenceState(driver)).toBe('online_stale');
    expect(shouldDriverAppearOnline(driver)).toBe(true);
    expect(canDriverReceiveNewBooking(driver)).toBe(true);
  });

  it('driver without active job goes offline after grace window expires', () => {
    const driver = { isOnline: true, locationAt: minutesAgo(15), status: 'available' };

    expect(getDriverPresenceState(driver)).toBe('offline');
    expect(shouldDriverAppearOnline(driver)).toBe(false);
    expect(canDriverReceiveNewBooking(driver)).toBe(false);
  });
});
