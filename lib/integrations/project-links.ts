import {
  INTEGRATED_PROJECT_SOURCES,
  type IntegratedProjectSourceApp,
  type ProjectSource,
  type ProjectSourceApp,
} from './project-sources';

export const PROJECT_BOOKING_ROUTE_SLUGS = {
  tyrerepair_uk: 'tyrerepair',
  fitmytyre: 'fitmytyre',
  duke_street_tyres: 'duke-street-tyres',
  tyrehawk_mobile: 'tyrehawk',
  tyresos: 'tyresos',
  edinburgh_tyre_fitting: 'edinburgh-tyre-fitting',
  '247_mo_glasgow': '247-mo-glasgow',
} as const satisfies Record<IntegratedProjectSourceApp, string>;

export interface ProjectIntegrationLink {
  sourceApp: IntegratedProjectSourceApp;
  sourceLabel: string;
  origin: string;
  requiredSecretEnv: string;
  bookingHandoffPath: `/api/integrations/${string}/bookings`;
  genericBookingHandoffPath: '/api/integrations/projects/bookings';
  assistedChatPopupLinked: true;
}

export const PROJECT_INTEGRATION_LINKS: readonly ProjectIntegrationLink[] =
  INTEGRATED_PROJECT_SOURCES.map((source) => {
    const sourceApp = source.app as IntegratedProjectSourceApp;
    const slug = PROJECT_BOOKING_ROUTE_SLUGS[sourceApp];

    return {
      sourceApp,
      sourceLabel: source.label,
      origin: source.origin,
      requiredSecretEnv: source.secretEnv,
      bookingHandoffPath: `/api/integrations/${slug}/bookings`,
      genericBookingHandoffPath: '/api/integrations/projects/bookings',
      assistedChatPopupLinked: true,
    };
  });

const integrationLinksBySourceApp = new Map<ProjectSourceApp, ProjectIntegrationLink>(
  PROJECT_INTEGRATION_LINKS.map((link) => [link.sourceApp, link]),
);

export function isIntegratedProjectSourceApp(value: ProjectSourceApp | string): value is IntegratedProjectSourceApp {
  return integrationLinksBySourceApp.has(value as ProjectSourceApp);
}

export function getProjectIntegrationLink(sourceApp: ProjectSourceApp | string): ProjectIntegrationLink | null {
  return integrationLinksBySourceApp.get(sourceApp as ProjectSourceApp) ?? null;
}

export function isProjectIntegrationSecretConfigured(source: ProjectSource): boolean {
  return Boolean((process.env[source.secretEnv] ?? process.env.PROJECT_INTEGRATIONS_SECRET ?? '').trim());
}
