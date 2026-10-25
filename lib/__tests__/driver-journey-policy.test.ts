import { describe, expect, it } from 'vitest';
import {
  advanceJourneyMonitor,
  initialJourneyMonitorState,
  isEligibleJourneyBooking,
  isUsableJourneyFix,
  selectJourneyCandidates,
  ukServiceDay,
  type CandidateBooking,
  type GeoFix,
  type JourneyMonitorState,
} from '../tracking/driver-journey-policy';

const now = Date.parse('2026-10-21T12:00:00Z');
const longitudeMeters = 111_320 * Math.cos(55.86 * Math.PI / 180);
function point(east: number, north = 0) { return { lat: 55.86 + north / 111_320, lng: -4.25 + east / longitudeMeters }; }
function fix(east: number, seconds: number, changes: Partial<GeoFix> = {}): GeoFix {
  return { ...point(east), at: now + seconds * 1000, accuracy: 5, speed: 10, heading: 90, ...changes };
}
function booking(east = 2000, changes: Partial<CandidateBooking> = {}): CandidateBooking {
  return { ...point(east), id: 'booking-1', refNumber: 'TR-1', status: 'awaiting_payment',
    scheduledAt: null, createdAt: new Date(now).toISOString(), bookingType: 'emergency', ...changes };
}
function step(state: JourneyMonitorState, sample: GeoFix, eta: number | null = null, destination = point(2000)) {
  return advanceJourneyMonitor(state, sample, destination, eta, sample.at);
}
function travelled() {
  let state = step(initialJourneyMonitorState(), fix(0, 0)).state;
  state = step(state, fix(100, 10)).state;
  return state;
}

describe('London service day and all active booking sources', () => {
  it('uses the London date at summer midnight rather than UTC', () => {
    expect(ukServiceDay(Date.parse('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(ukServiceDay(Date.parse('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
  });
  it('handles both DST transition dates and the repeated autumn hour', () => {
    expect(ukServiceDay(Date.parse('2026-03-29T00:59:59Z'))).toBe('2026-03-29');
    expect(ukServiceDay(Date.parse('2026-03-29T01:00:00Z'))).toBe('2026-03-29');
    expect(ukServiceDay(Date.parse('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    expect(ukServiceDay(Date.parse('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
    expect(ukServiceDay(NaN)).toBe('');
  });
  it.each(['awaiting_payment', 'payment_failed', 'paid', 'deposit_paid', 'driver_assigned', 'en_route', 'arrived', 'in_progress'])(
    'includes actual active status %s regardless of payment or assignment', (status) => {
      expect(isEligibleJourneyBooking(booking(2000, { status }), now)).toBe(true);
    },
  );
  it.each(['draft', 'pricing_ready', 'quote', 'quoted', 'completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial', 'unknown'])(
    'rejects quote, terminal or unknown status %s', (status) => {
      expect(isEligibleJourneyBooking(booking(2000, { status }), now)).toBe(false);
    },
  );
  it('uses scheduled service day for old bookings, and creation day for unscheduled bookings', () => {
    expect(isEligibleJourneyBooking(booking(2000, { bookingType: 'scheduled', createdAt: '2026-10-01T12:00:00Z', scheduledAt: new Date(now).toISOString() }), now)).toBe(true);
    expect(isEligibleJourneyBooking(booking(2000, { scheduledAt: '2026-10-22T12:00:00Z' }), now)).toBe(false);
    expect(isEligibleJourneyBooking(booking(2000, { createdAt: '2026-10-20T12:00:00Z' }), now)).toBe(false);
    expect(isEligibleJourneyBooking(booking(2000, { scheduledAt: 'bad-date' }), now)).toBe(false);
    expect(isEligibleJourneyBooking(booking(2000, { lat: NaN }), now)).toBe(false);
  });
});

describe('GPS evidence quality', () => {
  it('requires a fresh accurate sample, accepting the exact quality/time boundaries', () => {
    expect(isUsableJourneyFix(fix(0, -60, { accuracy: 50 }), now)).toBe(true);
    expect(isUsableJourneyFix(fix(0, -60.001), now)).toBe(false);
    expect(isUsableJourneyFix(fix(0, 0.001), now)).toBe(false);
    expect(isUsableJourneyFix(fix(0, 0, { accuracy: null }), now)).toBe(false);
    expect(isUsableJourneyFix(fix(0, 0, { accuracy: 50.001 }), now)).toBe(false);
  });
  it.each([
    { lat: 91 }, { lng: -181 }, { lat: 0, lng: 0 }, { at: NaN },
    { accuracy: -1 }, { accuracy: Infinity }, { speed: -1 }, { speed: 71 }, { speed: NaN },
    { heading: -1 }, { heading: 360 }, { heading: Infinity },
  ])('rejects malformed quality or coordinates %j', (changes) => {
    expect(isUsableJourneyFix(fix(0, 0, changes), now)).toBe(false);
  });
  it('allows unavailable speed/heading but never equal or reversed timestamps', () => {
    expect(isUsableJourneyFix(fix(0, 0, { speed: null, heading: null }), now)).toBe(true);
    expect(isUsableJourneyFix(fix(0, 0), now, now)).toBe(false);
    expect(isUsableJourneyFix(fix(0, -1), now, now)).toBe(false);
  });
});

describe('destination proposals require motion evidence, never nearest alone', () => {
  it('proposes approaching bookings for all booking types without needing an assigned driver', () => {
    const candidates = selectJourneyCandidates([
      booking(), booking(1500, { id: 'admin-scheduled', bookingType: 'scheduled' }),
    ], [fix(0, -40), fix(300, 0)], now);
    expect(candidates.map((item) => item.bookingId)).toEqual(['admin-scheduled', 'booking-1']);
    expect(candidates.every((item) => item.confidence === 'approaching' && item.progressMeters > 290)).toBe(true);
  });
  it('requires two fixes spanning at least 30 seconds', () => {
    expect(selectJourneyCandidates([booking(100)], [fix(0, 0)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -29), fix(300, 0)], now)).toEqual([]);
  });
  it('does not infer a journey from uncertain parked jitter or a single proximity sample', () => {
    expect(selectJourneyCandidates([booking(100)], [fix(0, 0, { speed: 0 })], now)).toEqual([]);
    expect(selectJourneyCandidates([booking(100)], [fix(0, -40, { accuracy: 30, speed: 0 }), fix(3, 0, { accuracy: 30, speed: 0 })], now)).toEqual([]);
    expect(selectJourneyCandidates([booking(100)], [fix(0, -40, { accuracy: 50 }), fix(60, 0, { accuracy: 50 })], now)).toEqual([]);
  });
  it('proposes a stationary driver already within 150 m only with stable repeated accurate evidence', () => {
    const candidates = selectJourneyCandidates([booking(100)], [
      fix(0, -40, { speed: 0, accuracy: 10 }), fix(3, 0, { speed: 0, accuracy: 10 }),
    ], now);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe('nearby');
    expect(selectJourneyCandidates([booking(200)], [fix(0, -40, { speed: 0 }), fix(3, 0, { speed: 0 })], now)).toEqual([]);
    expect(selectJourneyCandidates([booking(100)], [fix(0, -40, { speed: 0 }), fix(30, 0, { speed: 0 })], now)).toEqual([]);
  });
  it('can propose nearby with stable close proximity plus real lateral motion', () => {
    const candidates = selectJourneyCandidates([booking(200)], [
      fix(0, -40, { ...point(0, -40), heading: 0, speed: 2 }),
      fix(0, 0, { ...point(0, 40), heading: 0, speed: 2 }),
    ], now);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe('nearby');
  });
  it('does not propose a distant booking when heading away, or when the latest segment turns away', () => {
    expect(selectJourneyCandidates([booking()], [fix(300, -40, { heading: 270 }), fix(0, 0, { heading: 270 })], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -50), fix(300, -20), fix(200, 0, { heading: null })], now)).toEqual([]);
  });
  it('does not propose a distant aligned booking beyond the 20 km approach radius', () => {
    expect(selectJourneyCandidates([booking(100_000)], [fix(0, -40), fix(300, 0)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking(19_000)], [fix(0, -40), fix(300, 0)], now)).toHaveLength(1);
  });
  it('rejects misleading heading, stale/future/replayed fixes and impossible jumps', () => {
    expect(selectJourneyCandidates([booking()], [fix(0, -40), fix(300, 0, { heading: 270 })], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -61), fix(300, 0)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -40), fix(300, 1)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -40), fix(300, -40)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking()], [fix(0, -40), fix(300, -41)], now)).toEqual([]);
    expect(selectJourneyCandidates([booking(200_000)], [fix(0, -40), fix(100_000, 0)], now)).toEqual([]);
  });
  it('excludes closed/yesterday bookings and returns deterministic unique proposals without mutating input', () => {
    const bookings = [booking(), booking(), booking(900, { id: 'closed', status: 'cancelled' }), booking(1200, { id: 'yesterday', createdAt: '2026-10-20T10:00:00Z' })];
    const original = JSON.stringify(bookings);
    const results = selectJourneyCandidates(bookings, [fix(0, -40), fix(300, 0)], now);
    expect(results.map((candidate) => candidate.bookingId)).toEqual(['booking-1']);
    expect(JSON.stringify(bookings)).toBe(original);
    expect(results[0].distanceMeters).toBeGreaterThan(1600);
  });
});

describe('confirmed journey road ETA monitor', () => {
  it('needs consecutive fresh road ETA observations at or below 300 seconds and sends near only once', () => {
    let result = step(initialJourneyMonitorState(), fix(0, 0), 300);
    expect(result.events).toEqual([]);
    result = step(result.state, fix(100, 30), 300);
    expect(result.events).toEqual(['near']);
    result = step(result.state, fix(200, 60), 120);
    expect(result.events).toEqual([]);
    expect(result.state.nearSent).toBe(true);
  });
  it('does not round a road ETA over 5 minutes down into a near alert', () => {
    let state = step(initialJourneyMonitorState(), fix(0, 0), 299).state;
    state = step(state, fix(100, 30), 300.001).state;
    expect(state.nearSampleCount).toBe(0);
    expect(step(state, fix(200, 60), 299).events).toEqual([]);
  });
  it('does not count replayed fixes or rapid duplicate ETA checks', () => {
    let state = step(initialJourneyMonitorState(), fix(0, 0), 200).state;
    expect(step(state, fix(0, 0), 200).events).toEqual([]);
    state = step(state, fix(10, 1), 200).state;
    expect(state.nearSampleCount).toBe(1);
  });
  it('does not count cached ETA null as a second reading, but allows a fresh observation after cache-only GPS', () => {
    let state = step(initialJourneyMonitorState(), fix(0, 0), 200).state;
    state = step(state, fix(50, 30), null).state;
    expect(state.nearSampleCount).toBe(1);
    expect(step(state, fix(100, 60), 200).events).toEqual(['near']);
  });
  it('expires old ETA evidence and resets ETA evidence on a sample gap', () => {
    let state = step(initialJourneyMonitorState(), fix(0, 0), 200).state;
    for (const seconds of [30, 60, 90, 120]) state = step(state, fix(seconds, seconds), null).state;
    expect(step(state, fix(150, 150), 200).events).toEqual([]);
    state = step(initialJourneyMonitorState(), fix(0, 0), 200).state;
    expect(step(state, fix(100, 61), 200).events).toEqual([]);
  });
  it('does not emit on invalid ETA values, stale/future/out-of-order samples or implausible jumps', () => {
    const state = step(initialJourneyMonitorState(), fix(0, 0), null).state;
    for (const eta of [NaN, Infinity, -1, null]) expect(step(state, fix(100, 30), eta).events).toEqual([]);
    expect(advanceJourneyMonitor(state, fix(100, 30), point(2000), 100, now + 29_000).state).toBe(state);
    expect(advanceJourneyMonitor(state, fix(100, 30), point(2000), 100, now + 91_000).state).toBe(state);
    expect(step(state, fix(100_000, 1), 100).state).toBe(state);
  });
});

describe('confirmed journey continuous stop monitor', () => {
  it('requires travel first and more than two minutes of continuing low-speed GPS evidence', () => {
    let state = travelled();
    state = step(state, fix(100, 20, { speed: 0 })).state;
    for (const seconds of [50, 80, 110, 140]) {
      const result = step(state, fix(101, seconds, { speed: 0 }));
      expect(result.events).toEqual([]);
      state = result.state;
    }
    const result = step(state, fix(100, 141, { speed: 0 }));
    expect(result.events).toEqual(['stopped']);
    expect(result.state.stationarySince).toBe(now + 20_000);
    expect(step(result.state, fix(100, 170, { speed: 0 })).events).toEqual([]);
  });
  it('does not interpret a stationary parked driver before travel as a stopped journey', () => {
    let state = initialJourneyMonitorState();
    for (const seconds of [0, 30, 60, 90, 120, 150, 180]) {
      const result = step(state, fix(0, seconds, { speed: 0 }));
      expect(result.events).toEqual([]);
      state = result.state;
    }
    expect(state.hasTravelled).toBe(false);
    expect(state.stationarySince).toBeNull();
  });
  it('never turns GPS silence or a single delayed sample into a two-minute stop', () => {
    let state = step(travelled(), fix(100, 20, { speed: 0 })).state;
    const result = step(state, fix(100, 150, { speed: 0 }));
    expect(result.events).toEqual([]);
    expect(result.state.stationarySince).toBe(now + 150_000);
    expect(advanceJourneyMonitor(state, fix(100, 20, { speed: 0 }), point(2000), null, now + 150_000).state).toBe(state);
    state = step(result.state, fix(100, 180, { speed: 0 })).state;
    expect(state.stopSent).toBe(false);
  });
  it('resets a stop on speed or coordinate movement and permits a later distinct stop episode', () => {
    let state = step(travelled(), fix(100, 20, { speed: 0 })).state;
    state = step(state, fix(100, 50, { speed: 0 })).state;
    state = step(state, fix(180, 80, { speed: 5 })).state;
    expect(state.stationarySince).toBeNull();
    state = step(state, fix(180, 90, { speed: 0 })).state;
    for (const seconds of [120, 150, 180, 210]) state = step(state, fix(180, seconds, { speed: 0 })).state;
    const first = step(state, fix(180, 211, { speed: 0 }));
    expect(first.events).toEqual(['stopped']);
    state = step(first.state, fix(260, 240, { speed: null })).state;
    expect(state.stopSent).toBe(false);
    expect(state.stationarySince).toBe(now + 240_000);
    for (const seconds of [270, 300, 330, 360]) state = step(state, fix(260, seconds, { speed: 0 })).state;
    expect(step(state, fix(260, 361, { speed: 0 })).events).toEqual(['stopped']);
  });
  it('suppresses alerts within the arrival radius and does not re-arm after GPS drifts outside it', () => {
    let state = travelled();
    state = step(state, fix(2000, 40, { speed: 0 }), 60).state;
    expect(state.arrived).toBe(true);
    for (const seconds of [70, 100, 130, 160, 190]) {
      const result = step(state, fix(2080, seconds, { speed: 0 }), 60);
      expect(result.events).toEqual([]);
      state = result.state;
    }
  });
  it('does not mutate state/fix inputs and remains JSON serializable across worker requests', () => {
    const state = travelled();
    const sample = fix(120, 20, { speed: 0 });
    const before = JSON.stringify({ state, sample });
    Object.freeze(state);
    Object.freeze(sample);
    const result = step(state, sample);
    expect(JSON.stringify({ state, sample })).toBe(before);
    const restored = JSON.parse(JSON.stringify(result.state)) as JourneyMonitorState;
    expect(step(restored, fix(120, 50, { speed: 0 })).state.lastFix?.at).toBe(now + 50_000);
  });
});
