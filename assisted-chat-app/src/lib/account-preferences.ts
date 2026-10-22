/** Preferences are limited to account/settings screens, not booking data. */
export interface AccountPreferences {
  version: 1;
  language: 'en' | 'ar';
  timeFormat: '24h' | '12h';
}

export const DEFAULT_ACCOUNT_PREFERENCES: Readonly<AccountPreferences> = Object.freeze({
  version: 1,
  language: 'en',
  timeFormat: '24h',
});

export function parseAccountPreferences(value: unknown): AccountPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_ACCOUNT_PREFERENCES };
  const source = value as Record<string, unknown>;
  if (source.version !== 1) return { ...DEFAULT_ACCOUNT_PREFERENCES };
  return {
    version: 1,
    language: source.language === 'ar' ? 'ar' : 'en',
    timeFormat: source.timeFormat === '12h' ? '12h' : '24h',
  };
}

/** Project and account isolation; this key contains no session credential. */
export function accountPreferencesStorageKey(apiBaseUrl: string, userId: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(userId)) return null;
  try {
    const url = new URL(apiBaseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || !/^\/*$/.test(url.pathname)) return null;
    return `assistedChat.accountPreferences.v1.${encodeURIComponent(url.origin)}.${encodeURIComponent(userId)}`;
  } catch { return null; }
}

export function formatAccountTimestamp(
  value: string | number | Date | null | undefined,
  preferences: Pick<AccountPreferences, 'language' | 'timeFormat'> = DEFAULT_ACCOUNT_PREFERENCES,
): string {
  const missing = preferences.language === 'ar' ? 'غير مسجل' : 'Not recorded';
  if (value === null || value === undefined || value === '') return missing;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return missing;
  return new Intl.DateTimeFormat(preferences.language === 'ar' ? 'ar-GB' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London', timeZoneName: 'short', hour12: preferences.timeFormat === '12h',
  }).format(date);
}
