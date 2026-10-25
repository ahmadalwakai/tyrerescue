import { describe, expect, it } from 'vitest';
import {
  emptyRouteDeviation, evaluateRouteDeviation,
} from '../../driver-app/src/lib/navigation/routeDeviation';

const geometry: [number, number][] = [[-4, 55], [-3.99, 55]];
const base = {
  revision: 'job:destination', geometry, coordinate: { lng: -3.998, lat: 55.0004 },
  fixAt: 100_000, accuracy: 8, speed: 10, heading: 90, now: 100_000,
  previous: emptyRouteDeviation(), loading: false, networkAllowed: true, lastRerouteAt: 0,
};

describe('driver route deviation scheduling', () => {
  it('recalculates on a parallel street 45m away, below the old 75m dead zone', () => {
    const first = evaluateRouteDeviation(base);
    expect(first.distance).toBeGreaterThan(40);
    expect(first.distance).toBeLessThan(75);
    expect(first.shouldReroute).toBe(false);
    const next = evaluateRouteDeviation({ ...base, coordinate: { lng: -3.997, lat: 55.0004 },
      fixAt: 105_000, now: 105_000, previous: first.state });
    expect(next.confirmed).toBe(true);
    expect(next.shouldReroute).toBe(true);
  });

  it('finishes debounce after two distinct fixes even when the driver stops', () => {
    const first = evaluateRouteDeviation(base);
    const second = evaluateRouteDeviation({ ...base, fixAt: 101_000, now: 101_000, previous: first.state });
    expect(second.shouldReroute).toBe(false);
    const timer = evaluateRouteDeviation({ ...base, fixAt: 101_000, now: 104_500, previous: second.state });
    expect(timer.state.samples).toBe(2);
    expect(timer.shouldReroute).toBe(true);
  });

  it('never counts one outlier more than once as the timer ticks', () => {
    let result = evaluateRouteDeviation(base);
    for (const now of [101_000, 104_500, 107_000]) {
      result = evaluateRouteDeviation({ ...base, now, previous: result.state });
      expect(result.shouldReroute).toBe(false);
      expect(result.state.samples).toBe(1);
    }
  });

  it('holds confirmation while a request is pending and flushes on completion', () => {
    const first = evaluateRouteDeviation({ ...base, loading: true });
    const second = evaluateRouteDeviation({ ...base, loading: true, fixAt: 105_000,
      now: 105_000, previous: first.state });
    expect(second.confirmed).toBe(true);
    expect(second.shouldReroute).toBe(false);
    expect(evaluateRouteDeviation({ ...base, fixAt: 105_000, now: 106_000,
      previous: second.state }).shouldReroute).toBe(true);
  });

  it('detects reverse travel along the same road, where perpendicular distance is zero', () => {
    const first = evaluateRouteDeviation({ ...base, coordinate: { lng: -3.995, lat: 55 }, heading: 270 });
    const next = evaluateRouteDeviation({ ...base, coordinate: { lng: -3.996, lat: 55 }, heading: 270,
      fixAt: 105_000, now: 105_000, previous: first.state });
    expect(next.state.reason).toBe('wrong-way');
    expect(next.shouldReroute).toBe(true);
  });

  it('does not mistake a valid return leg on an overlapping road for wrong-way travel', () => {
    const outAndBack: [number, number][] = [...geometry, geometry[0]];
    const first = evaluateRouteDeviation({ ...base, geometry: outAndBack,
      coordinate: { lng: -3.995, lat: 55 }, heading: 270 });
    const next = evaluateRouteDeviation({ ...base, geometry: outAndBack,
      coordinate: { lng: -3.996, lat: 55 }, heading: 270,
      fixAt: 105_000, now: 105_000, previous: first.state });
    expect(next.shouldReroute).toBe(false);
    expect(next.suspected).toBe(false);
  });

  it.each([
    { accuracy: 90 }, { accuracy: null }, { now: 113_000 }, { now: 99_000 },
    { coordinate: { lng: -3.998, lat: 55.0001 } },
    { coordinate: { lng: -3.998, lat: 55 }, heading: 270, speed: 0 },
  ])('does not recalculate from jitter, stale or weak GPS: %j', (override) => {
    const first = evaluateRouteDeviation({ ...base, ...override });
    const next = evaluateRouteDeviation({ ...base, ...override, fixAt: 101_000,
      now: override.now ?? 106_000, previous: first.state });
    expect(next.shouldReroute).toBe(false);
  });

  it('uses accuracy to avoid rerouting on a 45m drift with 40m uncertainty', () => {
    const first = evaluateRouteDeviation({ ...base, accuracy: 40 });
    expect(evaluateRouteDeviation({ ...base, accuracy: 40, fixAt: 106_000,
      now: 106_000, previous: first.state }).shouldReroute).toBe(false);
  });

  it('cancels suspicion when the driver returns to the route before debounce', () => {
    const first = evaluateRouteDeviation(base);
    const returned = evaluateRouteDeviation({ ...base, coordinate: { lng: -3.998, lat: 55 },
      fixAt: 103_000, now: 103_000, previous: first.state });
    const next = evaluateRouteDeviation({ ...base, fixAt: 106_000, now: 106_000, previous: returned.state });
    expect(next.state.samples).toBe(1);
    expect(next.shouldReroute).toBe(false);
  });

  it('limits retries during failure and resumes after the cooldown/network recovers', () => {
    const first = evaluateRouteDeviation(base);
    const previous = evaluateRouteDeviation({ ...base, fixAt: 105_000, now: 105_000, previous: first.state }).state;
    expect(evaluateRouteDeviation({ ...base, fixAt: 105_000, now: 106_000, previous,
      lastRerouteAt: 105_000 }).shouldReroute).toBe(false);
    expect(evaluateRouteDeviation({ ...base, fixAt: 120_000, now: 120_000, previous,
      lastRerouteAt: 105_000, networkAllowed: false }).shouldReroute).toBe(false);
    // Continue with current fixes throughout the cooldown.
    const fresh = evaluateRouteDeviation({ ...base, fixAt: 115_000, now: 115_000,
      previous, lastRerouteAt: 105_000 }).state;
    expect(evaluateRouteDeviation({ ...base, fixAt: 120_000, now: 120_000, previous: fresh,
      lastRerouteAt: 105_000 }).shouldReroute).toBe(true);
  });

  it('drops old confirmation for a new destination or a long GPS gap', () => {
    const first = evaluateRouteDeviation(base);
    for (const override of [{ revision: 'new-job' }, { fixAt: 130_000, now: 130_000 }]) {
      const next = evaluateRouteDeviation({ ...base, fixAt: 105_000, now: 105_000, ...override, previous: first.state });
      expect(next.state.samples).toBe(1);
      expect(next.shouldReroute).toBe(false);
    }
  });
});
