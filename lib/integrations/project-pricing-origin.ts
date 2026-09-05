import { z } from 'zod';
import { isAuthorizedProjectIntegrationRequest } from '@/lib/integrations/project-auth';
import {
  INTEGRATED_PROJECT_SOURCES,
  getProjectSource,
  type IntegratedProjectSourceApp,
  type ProjectSource,
} from '@/lib/integrations/project-sources';

const integratedProjectSourceApps = INTEGRATED_PROJECT_SOURCES.map((source) => source.app) as [
  IntegratedProjectSourceApp,
  ...IntegratedProjectSourceApp[],
];

export const projectPricingOriginRequestSchema = z.object({
  sourceApp: z.enum(integratedProjectSourceApps),
});

export type ProjectPricingOriginRequest = z.infer<typeof projectPricingOriginRequestSchema>;

export interface ProjectPricingOrigin {
  sourceApp: IntegratedProjectSourceApp;
  label: string;
  lat: number;
  lng: number;
  maxServiceMiles: number;
}

export interface ProjectPricingContext {
  source: ProjectSource;
  origin: ProjectPricingOrigin | null;
}

const PROJECT_PRICING_ORIGINS: Partial<Record<IntegratedProjectSourceApp, ProjectPricingOrigin>> = {
  edinburgh_tyre_fitting: {
    sourceApp: 'edinburgh_tyre_fitting',
    label: 'Unit 28, Imex Business Centre, Loanhead, EH20 9LZ',
    lat: 55.873557,
    lng: -3.16378,
    maxServiceMiles: 50,
  },
  '247_mo_glasgow': {
    sourceApp: '247_mo_glasgow',
    label: 'Glasgow City Centre, G1',
    lat: 55.8642,
    lng: -4.2518,
    maxServiceMiles: 30,
  },
};

export function getProjectPricingOrigin(
  request: Request,
  requested: ProjectPricingOriginRequest | undefined,
): ProjectPricingContext | null {
  if (!requested) return null;

  const source = getProjectSource(requested.sourceApp);
  if (!source || !isAuthorizedProjectIntegrationRequest(request, source)) {
    return null;
  }

  return {
    source,
    origin: PROJECT_PRICING_ORIGINS[requested.sourceApp] ?? null,
  };
}
