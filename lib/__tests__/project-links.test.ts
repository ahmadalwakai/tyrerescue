import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTEGRATED_PROJECT_SOURCES,
  PROJECT_SOURCES,
  TYRE_RESCUE_SOURCE_APP,
  getProjectSource,
  normalizeProjectSourceApp,
  type IntegratedProjectSourceApp,
} from '../integrations/project-sources';
import {
  PROJECT_BOOKING_ROUTE_SLUGS,
  PROJECT_INTEGRATION_LINKS,
  getProjectIntegrationLink,
} from '../integrations/project-links';
import { getProjectPricingOrigin } from '../integrations/project-pricing-origin';

describe('project assisted-chat links', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps existing project sources and Caledonia registered', () => {
    expect(PROJECT_SOURCES.map((source) => source.app)).toEqual([
      'tyre_rescue',
      'tyrerepair_uk',
      'fitmytyre',
      'duke_street_tyres',
      'tyrehawk_mobile',
      'tyresos',
      'edinburgh_tyre_fitting',
      '247_mo_glasgow',
      'caledonia_tyres',
    ]);
  });

  it('has a code-backed booking handoff route for every external project', () => {
    expect(PROJECT_INTEGRATION_LINKS).toHaveLength(INTEGRATED_PROJECT_SOURCES.length);

    for (const source of INTEGRATED_PROJECT_SOURCES) {
      const sourceApp = source.app as IntegratedProjectSourceApp;
      const link = getProjectIntegrationLink(sourceApp);
      const slug = PROJECT_BOOKING_ROUTE_SLUGS[sourceApp];

      expect(link).toMatchObject({
        sourceApp,
        sourceLabel: source.label,
        bookingHandoffPath: `/api/integrations/${slug}/bookings`,
        assistedChatPopupLinked: true,
      });

      const routePath = path.join(process.cwd(), 'app', 'api', 'integrations', slug, 'bookings', 'route.ts');
      expect(fs.existsSync(routePath), `${source.label} route exists at ${routePath}`).toBe(true);
    }
  });

  it('maps the production domain and www alias to the existing Caledonia project', () => {
    for (const alias of [
      'mobiletyrefittings.com',
      'www.mobiletyrefittings.com',
      'https://mobiletyrefittings.com',
      'https://www.mobiletyrefittings.com',
    ]) {
      expect(normalizeProjectSourceApp(alias)).toBe('caledonia_tyres');
      expect(getProjectSource(alias)).toMatchObject({
        app: 'caledonia_tyres',
        label: 'Caledonia Tyres',
        origin: 'https://mobiletyrefittings.com',
      });
    }
  });

  it('does not treat the main Tyre Rescue source as an external project popup route', () => {
    expect(getProjectIntegrationLink(TYRE_RESCUE_SOURCE_APP)).toBeNull();
  });

  it('normalizes every known public project alias back to a configured source', () => {
    const aliases = [
      'tyrerescue.co.uk',
      'tyrerescue.uk',
      'www.tyrerescue.uk',
      'tyrerepair.uk',
      'fitmytyre.co.uk',
      'dukestreettyres.co.uk',
      'dukestreettyres.com',
      'www.dukestreettyres.com',
      'tyrehawk.co.uk',
      'tyresos.co.uk',
      'edinburghtyrefitting.com',
      '247moglasgow.uk',
      'https://caledonia-tyres.vercel.app',
    ];

    for (const alias of aliases) {
      const sourceApp = normalizeProjectSourceApp(alias);
      expect(sourceApp, alias).toBeTruthy();
      expect(getProjectSource(sourceApp), alias).toBeTruthy();
    }
  });

  it('authorizes live quote pricing requests from every external project source', () => {
    for (const source of INTEGRATED_PROJECT_SOURCES) {
      vi.stubEnv(source.secretEnv, 'source-secret');
      const request = new Request('https://www.tyrerescue.uk/api/bookings/quote', {
        method: 'POST',
        headers: { 'x-integration-key': 'source-secret' },
      });

      const context = getProjectPricingOrigin(request, {
        sourceApp: source.app as IntegratedProjectSourceApp,
      });

      expect(context?.source.app).toBe(source.app);
      expect(context?.origin?.sourceApp ?? null).toBe(
        ['edinburgh_tyre_fitting', '247_mo_glasgow'].includes(source.app) ? source.app : null,
      );
    }
  });
});
