import { describe, it, expect } from 'vitest';
import {
  getPriorityServiceCityParams,
  getPriorityServiceAreaParams,
} from '@/lib/seo/priority';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';

describe('SEO priority — generateStaticParams gating', () => {
  it('keeps service-city prebuild count at the full coverage of 5×19 = 95', () => {
    const params = getPriorityServiceCityParams();
    expect(params.length).toBe(services.length * serviceCities.length);
    expect(params.length).toBe(95);
  });

  it('keeps prebuilt service-area count conservative (≤ 100)', () => {
    const params = getPriorityServiceAreaParams();
    expect(params.length).toBeGreaterThan(0);
    expect(params.length).toBeLessThanOrEqual(100);
  });

  it('only references area slugs that exist in lib/areas data', () => {
    const params = getPriorityServiceAreaParams();
    for (const p of params) {
      const slugs = new Set(getAreasForCity(p.city).map((a) => a.slug));
      expect(slugs.has(p.area)).toBe(true);
    }
  });

  it('only references known service slugs', () => {
    const known = new Set(services.map((s) => s.slug));
    for (const p of getPriorityServiceAreaParams()) {
      expect(known.has(p.service)).toBe(true);
    }
  });
});
