import { describe, expect, it } from 'vitest';
import { resolveCompassHeading, resolveDriverHeading } from '../../driver-app/src/lib/navigation/heading';

describe('calibrated driver compass', () => {
  it('prefers true north, including zero, over magnetic north', () => {
    expect(resolveCompassHeading({ trueHeading: 0, magHeading: 13, accuracy: 3 })).toBe(0);
    expect(resolveCompassHeading({ trueHeading: 91, magHeading: 94, accuracy: 2 })).toBe(91);
  });
  it('falls back to calibrated magnetic heading when true heading is unavailable', () => {
    expect(resolveCompassHeading({ trueHeading: -1, magHeading: 275, accuracy: 3 })).toBe(275);
    expect(resolveCompassHeading({ magHeading: 390, accuracy: 2 })).toBe(30);
  });
  it.each([undefined, null, -1, 0, 1, NaN, Infinity])('rejects uncalibrated accuracy %s', (accuracy) => {
    expect(resolveCompassHeading({ trueHeading: 90, magHeading: 92, accuracy })).toBeNull();
  });
  it.each([-1, NaN, Infinity, null, undefined])('never turns an unavailable bearing %s into north', (heading) => {
    expect(resolveCompassHeading({ trueHeading: heading, magHeading: heading, accuracy: 3 })).toBeNull();
  });
});

describe('driver course fallback', () => {
  const origin = { lat: 55, lng: -4 };
  const stationary = { gpsHeading: 275, speed: 0.2, prevCoord: origin, currentCoord: origin };
  it('uses finite GPS course while moving and retains the last direction while parked', () => {
    expect(resolveDriverHeading({ ...stationary, speed: 8 })).toBe(275);
    expect(resolveDriverHeading(stationary)).toBeNull();
  });
  it('derives an eastbound bearing from accepted movement when GPS course is absent', () => {
    expect(resolveDriverHeading({ ...stationary, gpsHeading: -1, currentCoord: { lat: 55, lng: -3.999 } }))
      .toBeCloseTo(90, 1);
  });
  it.each([NaN, Infinity, -1])('rejects invalid moving GPS course %s', (gpsHeading) => {
    expect(resolveDriverHeading({ ...stationary, speed: 8, gpsHeading })).toBeNull();
  });
  it('ignores stationary GPS jitter below five metres', () => {
    expect(resolveDriverHeading({ ...stationary, currentCoord: { lat: 55.000001, lng: -4.000001 } })).toBeNull();
  });
});
