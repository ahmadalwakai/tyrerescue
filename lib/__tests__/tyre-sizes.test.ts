import { describe, expect, it } from 'vitest';
import {
  __datasetSizeForTests,
  categorizeVehicle,
  getTyreSizeForVehicle,
} from '@/lib/tyre-sizes';

describe('tyre-sizes dataset', () => {
  it('ships at least 50 vehicles', () => {
    expect(__datasetSizeForTests()).toBeGreaterThanOrEqual(50);
  });
});

describe('getTyreSizeForVehicle', () => {
  it('returns the OEM size for a known vehicle (Ford Focus 2019)', () => {
    const size = getTyreSizeForVehicle('FORD', 'FOCUS', 2019);
    expect(size).not.toBeNull();
    expect(size?.oem).toBe(true);
    expect(size?.rim).toBe('16');
    expect(size?.fallback).toBeUndefined();
  });

  it('matches case-insensitively', () => {
    const a = getTyreSizeForVehicle('ford', 'focus', 2019);
    const b = getTyreSizeForVehicle('FORD', 'FOCUS', 2019);
    expect(a).toEqual(b);
  });

  it('respects the year band (Vauxhall Corsa 2010 vs 2020)', () => {
    const old = getTyreSizeForVehicle('VAUXHALL', 'CORSA', 2010);
    const recent = getTyreSizeForVehicle('VAUXHALL', 'CORSA', 2020);
    expect(old?.rim).toBe('15');
    expect(recent?.rim).toBe('16');
  });

  it('falls back to a category default when the model is unknown', () => {
    const size = getTyreSizeForVehicle('OBSCURE', 'TRANSIT CONNECT', 2018);
    expect(size).not.toBeNull();
    expect(size?.fallback).toBe(true);
  });

  it('returns null when both make and model are blank', () => {
    expect(getTyreSizeForVehicle('', '', null)).toBeNull();
  });
});

describe('categorizeVehicle', () => {
  it.each([
    ['FORD', 'TRANSIT CUSTOM', 'van'],
    ['BMW', 'X5', 'suv'],
    ['BMW', '3 SERIES', 'saloon'],
    ['TOYOTA', 'YARIS', 'city'],
    ['VOLKSWAGEN', 'GOLF', 'hatchback'],
  ] as const)('classifies %s %s as %s', (make, model, expected) => {
    expect(categorizeVehicle(make, model)).toBe(expected);
  });
});
