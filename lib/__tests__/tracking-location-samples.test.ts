import { describe, expect, it } from 'vitest';
import {
  isOlderLocationSample,
  parseLocationSampleTimestamp,
} from '../tracking/tracking-format';

describe('tracking location samples', () => {
  it('rejects invalid sample timestamps', () => {
    expect(parseLocationSampleTimestamp('')).toBeNull();
    expect(parseLocationSampleTimestamp('not-a-date')).toBeNull();
  });

  it('parses valid sample timestamps', () => {
    const parsed = parseLocationSampleTimestamp('2026-07-14T10:00:00.000Z');
    expect(parsed?.toISOString()).toBe('2026-07-14T10:00:00.000Z');
  });

  it('detects queued points that would move tracking backwards', () => {
    const latest = new Date('2026-07-14T10:05:00.000Z');
    const queuedOlder = new Date('2026-07-14T10:04:59.000Z');
    const duplicate = new Date('2026-07-14T10:05:00.000Z');
    const newer = new Date('2026-07-14T10:05:01.000Z');

    expect(isOlderLocationSample(queuedOlder, latest)).toBe(true);
    expect(isOlderLocationSample(duplicate, latest)).toBe(false);
    expect(isOlderLocationSample(newer, latest)).toBe(false);
  });
});
