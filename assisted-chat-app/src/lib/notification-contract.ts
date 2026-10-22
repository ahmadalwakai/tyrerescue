export type NativeRegistrationInfo = string | null | undefined;

export interface PersistedRegistrationState {
  isEnabled?: boolean;
  [key: string]: unknown;
}

export function parsePersistedRegistrationInfo(
  registrationInfo: unknown,
): PersistedRegistrationState | null {
  if (typeof registrationInfo !== 'string' || !registrationInfo) return null;
  try {
    const parsed: unknown = JSON.parse(registrationInfo);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as PersistedRegistrationState;
  } catch {
    return null;
  }
}

export function isServerRegistrationEnabled(
  registrationInfo: unknown,
): boolean {
  return parsePersistedRegistrationInfo(registrationInfo)?.isEnabled === true;
}
