export interface ProjectSource {
  app: string;
  label: string;
  origin: string;
  secretEnv: string;
  campaign: string;
  description: string;
}

export const TYRE_RESCUE_SOURCE_APP = 'tyre_rescue';

export const PROJECT_SOURCES = [
  {
    app: TYRE_RESCUE_SOURCE_APP,
    label: 'Tyre Rescue',
    origin: 'https://www.tyrerescue.uk',
    secretEnv: 'TYRE_RESCUE_INTEGRATION_SECRET',
    campaign: 'tyre_rescue_direct',
    description: 'Main Tyre Rescue booking flow and Assisted Chat jobs.',
  },
  {
    app: 'tyrerepair_uk',
    label: 'TyreRepair.uk',
    origin: 'https://tyrerepair.uk',
    secretEnv: 'TYREREPAIR_INTEGRATION_SECRET',
    campaign: 'tyrerepair_booking_handoff',
    description: 'TyreRepair UK web and admin app bookings.',
  },
  {
    app: 'fitmytyre',
    label: 'FitMyTyre',
    origin: 'https://fitmytyre.co.uk',
    secretEnv: 'FITMYTYRE_INTEGRATION_SECRET',
    campaign: 'fitmytyre_booking_handoff',
    description: 'FitMyTyre website, account, checkout and admin bookings.',
  },
  {
    app: 'duke_street_tyres',
    label: 'Duke Street Tyres',
    origin: 'https://www.dukestreettyres.com',
    secretEnv: 'DUKE_STREET_TYRES_INTEGRATION_SECRET',
    campaign: 'duke_street_tyres_booking_handoff',
    description: 'Duke Street Tyres website enquiries and bookings.',
  },
  {
    app: 'tyrehawk_mobile',
    label: 'TyreHawk Mobile',
    origin: 'https://tyrehawk.co.uk',
    secretEnv: 'TYREHAWK_MOBILE_INTEGRATION_SECRET',
    campaign: 'tyrehawk_mobile_booking_handoff',
    description: 'TyreHawk Mobile app and web-originated jobs.',
  },
  {
    app: 'tyresos',
    label: 'TyreSOS',
    origin: 'https://tyresos.co.uk',
    secretEnv: 'TYRESOS_INTEGRATION_SECRET',
    campaign: 'tyresos_booking_handoff',
    description: 'TyreSOS app, driver, admin and customer jobs.',
  },
  {
    app: 'edinburgh_tyre_fitting',
    label: 'Edinburgh Tyre Fitting',
    origin: 'https://edinburghtyrefitting.com',
    secretEnv: 'EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET',
    campaign: 'edinburgh_tyre_fitting_booking_handoff',
    description: 'Edinburgh Tyre Fitting website bookings for Edinburgh and the 50-mile countryside area.',
  },
] as const satisfies readonly ProjectSource[];

export const INTEGRATED_PROJECT_SOURCES = PROJECT_SOURCES.filter(
  (source) => source.app !== TYRE_RESCUE_SOURCE_APP,
);

export type ProjectSourceApp = (typeof PROJECT_SOURCES)[number]['app'];
export type IntegratedProjectSourceApp = Exclude<ProjectSourceApp, typeof TYRE_RESCUE_SOURCE_APP>;

function normalizeSourceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/\.(co\.uk|uk|com)$/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const SOURCE_ALIASES = new Map<string, string>([
  ['tyre_rescue', 'tyre_rescue'],
  ['tyrerescue', 'tyre_rescue'],
  ['tyrerescue_co', 'tyre_rescue'],
  ['tyrerescue_uk', 'tyre_rescue'],
  ['www_tyrerescue', 'tyre_rescue'],
  ['www_tyrerescue_uk', 'tyre_rescue'],
  ['tyre_repair', 'tyrerepair_uk'],
  ['tyrerepair', 'tyrerepair_uk'],
  ['tyrerepair_uk', 'tyrerepair_uk'],
  ['tyrerepair_uk_uk', 'tyrerepair_uk'],
  ['fit_my_tyre', 'fitmytyre'],
  ['fitmytyre', 'fitmytyre'],
  ['duke_street', 'duke_street_tyres'],
  ['duke_street_tyre', 'duke_street_tyres'],
  ['duke_street_tyres', 'duke_street_tyres'],
  ['dukestreettyre', 'duke_street_tyres'],
  ['dukestreettyres', 'duke_street_tyres'],
  ['dukestreettyres_com', 'duke_street_tyres'],
  ['www_dukestreettyres', 'duke_street_tyres'],
  ['www_dukestreettyres_com', 'duke_street_tyres'],
  ['tyrehawk', 'tyrehawk_mobile'],
  ['tyrehawk_mobile', 'tyrehawk_mobile'],
  ['tyre_sos', 'tyresos'],
  ['tyresos', 'tyresos'],
  ['edinburgh_tyre_fitting', 'edinburgh_tyre_fitting'],
  ['edinburgh_tyrefitting', 'edinburgh_tyre_fitting'],
  ['edinburghtyrefitting', 'edinburgh_tyre_fitting'],
  ['edinburgh_tyre', 'edinburgh_tyre_fitting'],
  ['edinburgh_tyres', 'edinburgh_tyre_fitting'],
]);

export function normalizeProjectSourceApp(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = normalizeSourceKey(value);
  return SOURCE_ALIASES.get(key) ?? key;
}

export function getProjectSource(value: string | null | undefined): ProjectSource | null {
  const app = normalizeProjectSourceApp(value);
  if (!app) return null;
  return PROJECT_SOURCES.find((source) => source.app === app) ?? null;
}

export function getProjectSourceFromRequest(request: Request, fallback?: string | null): ProjectSource | null {
  const url = new URL(request.url);
  return (
    getProjectSource(url.searchParams.get('sourceApp')) ??
    getProjectSource(request.headers.get('x-source-app')) ??
    getProjectSource(fallback)
  );
}

export function formatProjectReference(sourceLabel: string, externalReference: string | null | undefined): string | null {
  const ref = externalReference?.trim();
  if (!ref) return null;
  return `${sourceLabel} reference ${ref}`;
}

export function projectSourceOptions() {
  return PROJECT_SOURCES.map((source) => ({
    app: source.app,
    label: source.label,
    origin: source.origin,
    description: source.description,
  }));
}
