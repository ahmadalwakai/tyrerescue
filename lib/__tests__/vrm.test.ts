import { describe, expect, it } from 'vitest';
import { isValidVrm, normalizeVrm } from '@/lib/vrm';

describe('VRM helpers', () => {
  it('normalizes common separators before DVLA lookup', () => {
    expect(normalizeVrm(' ab12 cde ')).toBe('AB12CDE');
    expect(normalizeVrm('AB12-CDE')).toBe('AB12CDE');
    expect(normalizeVrm('AB12.CDE')).toBe('AB12CDE');
  });

  it('validates after normalization', () => {
    expect(isValidVrm('AB12-CDE')).toBe(true);
    expect(isValidVrm('AB12 CDE')).toBe(true);
  });
});
