import { describe, expect, it } from 'vitest';
import { trackingJourneySteps, trackingPresentation } from '../../tyre-rescue/src/tracking-presentation';

const now = Date.parse('2026-10-23T12:00:00Z');
const booking = { status: 'en_route', driverName: 'Fitter', driverLat: 55.86, driverLng: -4.25,
  driverLocationAt: new Date(now).toISOString(), etaMinutes: 10, estimatedArrivalAt: new Date(now + 10 * 60_000).toISOString(), scheduledAt: null };
const options = { now, receivedAt: now, refreshFailed: false };

describe('customer tracking presentation', () => {
  it('uses the server arrival clock and ages remaining minutes without moving the promised time', () => {
    expect(trackingPresentation(booking, options)).toMatchObject({ etaMinutes: 10, arrivalTime: '13:10', showDriver: true });
    expect(trackingPresentation(booking, { ...options, now: now + 2 * 60_000 })).toMatchObject({ etaMinutes: 8, arrivalTime: '13:10' });
  });
  it('anchors an older server duration to the received update, not each render', () => {
    expect(trackingPresentation({ ...booking, estimatedArrivalAt: null }, { ...options, now: now + 60_000 })).toMatchObject({ etaMinutes: 9, arrivalTime: '13:10' });
  });
  it('does not add a minute when the screen clock predates the received update by milliseconds', () => {
    expect(trackingPresentation({ ...booking, etaMinutes: 12, estimatedArrivalAt: null }, { ...options, receivedAt: now + 25 }).etaMinutes).toBe(12);
  });
  it.each([NaN, Infinity, -1, 1441])('never presents the invalid duration %s', etaMinutes => {
    expect(trackingPresentation({ ...booking, etaMinutes }, options).etaMinutes).toBeNull();
  });
  it('hides an elapsed arrival estimate instead of announcing an imminent arrival', () => {
    expect(trackingPresentation({ ...booking, estimatedArrivalAt: new Date(now - 60_000).toISOString() }, options).etaMinutes).toBeNull();
  });
  it('does not show a live driver or ETA without valid coordinate pairs', () => {
    expect(trackingPresentation({ ...booking, driverLat: null }, options)).toMatchObject({ showDriver: false, etaMinutes: null });
    expect(trackingPresentation({ ...booking, driverLng: 181 }, options)).toMatchObject({ showDriver: false, etaMinutes: null });
  });
  it('does not imply a completed journey for a cancelled booking', () => {
    expect(trackingJourneySteps('cancelled_refund_pending', [{ status: 'en_route', timestamp: new Date(now).toISOString() }])).toEqual([]);
  });
  it('marks only reached milestones and ignores malformed history timestamps', () => {
    const steps = trackingJourneySteps('driver_assigned', [{ status: 'paid', timestamp: 'invalid' }]);
    expect(steps.map(step => step.state)).toEqual(['complete', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(steps[0].time).toBeNull();
  });
  it('keeps the arrival milestone time when a later work-started update is returned first', () => {
    const steps = trackingJourneySteps('in_progress', [
      { status: 'in_progress', timestamp: '2026-10-23T12:20:00Z' },
      { status: 'arrived', timestamp: '2026-10-23T12:10:00Z' },
    ]);
    expect(steps[3].time).toBe('13:10');
  });
});
