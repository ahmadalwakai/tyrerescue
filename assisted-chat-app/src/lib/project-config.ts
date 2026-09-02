import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProjectId =
  | 'tyrerescue'
  | '247mtg'
  | 'dukestreettyres'
  | 'fitmytyre'
  | 'tyrehawkmobile'
  | 'tyrerepairuk'
  | 'perthtyres'
  | 'sargarage';

export interface ProjectConfig {
  id: ProjectId;
  name: string;
  apiBaseUrl: string;
  brandLine1: string;
  brandLine2: string;
  loginSubtitle: string;
  tagline: string;
}

export const PROJECTS: readonly ProjectConfig[] = [
  {
    id: 'tyrerescue',
    name: 'Tyre Rescue',
    apiBaseUrl: 'https://www.tyrerescue.uk',
    brandLine1: 'TYRE',
    brandLine2: 'RESCUE',
    loginSubtitle: 'Use your Tyre Rescue admin credentials.',
    tagline: 'Active bookings, quotes, payments and dispatch.',
  },
  {
    id: '247mtg',
    name: '247 Mobile Tyres Glasgow',
    apiBaseUrl: 'https://247mobiletyresglasgow.com',
    brandLine1: '247',
    brandLine2: 'TYRES',
    loginSubtitle: 'Use your 247 Mobile Tyres Glasgow admin credentials.',
    tagline: 'Glasgow mobile tyre fitting — bookings, pricing, drivers and stock.',
  },
  {
    id: 'dukestreettyres',
    name: 'Duke Street Tyres',
    apiBaseUrl: 'https://www.dukestreettyres.com',
    brandLine1: 'DUKE ST',
    brandLine2: 'TYRES',
    loginSubtitle: 'Use your Duke Street Tyres admin credentials.',
    tagline: '24/7 mobile tyre fitting — Glasgow, Edinburgh & Dundee.',
  },
  {
    id: 'fitmytyre',
    name: 'FitMyTyre',
    apiBaseUrl: 'https://fitmytyre.uk',
    brandLine1: 'FIT MY',
    brandLine2: 'TYRE',
    loginSubtitle: 'Use your FitMyTyre admin credentials.',
    tagline: 'Fast mobile tyre fitting — bookings, stock and dispatch.',
  },
  {
    id: 'tyrehawkmobile',
    name: 'TyreHawk Mobile',
    apiBaseUrl: 'https://tyrehawk.uk',
    brandLine1: 'TYRE',
    brandLine2: 'HAWK',
    loginSubtitle: 'Use your TyreHawk Mobile admin credentials.',
    tagline: 'Mobile tyre fitting — bookings, drivers and fleet.',
  },
  {
    id: 'tyrerepairuk',
    name: 'Tyre Repair UK',
    apiBaseUrl: 'https://tyrerepair.uk',
    brandLine1: 'TYRE',
    brandLine2: 'REPAIR',
    loginSubtitle: 'Use your Tyre Repair UK admin credentials.',
    tagline: 'Mobile tyre repair & fitting — bookings and dispatch.',
  },
  {
    id: 'perthtyres',
    name: 'Perth Tyres',
    apiBaseUrl: 'https://perthtyres.com',
    brandLine1: 'PERTH',
    brandLine2: 'TYRES',
    loginSubtitle: 'Use your Perth Tyres admin credentials.',
    tagline: 'Mobile tyre fitting Perth & Scotland — bookings and dispatch.',
  },
  {
    id: 'sargarage',
    name: 'SAR Garage',
    apiBaseUrl: 'https://sargarage.com',
    brandLine1: 'SAR',
    brandLine2: 'GARAGE',
    loginSubtitle: 'Use your SAR Garage admin credentials.',
    tagline: 'Garage & mobile tyre services — bookings and management.',
  },
] as const;

const ALL_PROJECT_IDS = new Set<string>(PROJECTS.map((p) => p.id));

export function isValidProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && ALL_PROJECT_IDS.has(value);
}

export function getProjectById(id: ProjectId): ProjectConfig {
  const project = PROJECTS.find((p) => p.id === id);
  if (!project) throw new Error(`Unknown project: ${id}`);
  return project;
}

const PROJECT_STORAGE_KEY = 'assistedChat.activeProject.v1';

export async function getStoredProjectId(): Promise<ProjectId | null> {
  try {
    const raw = await AsyncStorage.getItem(PROJECT_STORAGE_KEY);
    if (isValidProjectId(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

export async function setStoredProjectId(id: ProjectId): Promise<void> {
  try {
    await AsyncStorage.setItem(PROJECT_STORAGE_KEY, id);
  } catch {
    // best effort
  }
}

export async function clearStoredProjectId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROJECT_STORAGE_KEY);
  } catch {
    // best effort
  }
}
