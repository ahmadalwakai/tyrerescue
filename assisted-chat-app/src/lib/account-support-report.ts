export interface AccountSupportReportInput {
  projectName: string;
  apiBaseUrl: string;
  appVersion: string;
  buildNumber: string;
  platform: string;
  modelName: string;
  osVersion: string;
  notificationPermission: 'granted' | 'provisional' | 'denied' | 'undetermined' | 'unavailable' | 'unknown';
  pushRegistration: 'registered' | 'not-registered' | 'unknown';
  localLock: 'enabled' | 'disabled' | 'unavailable' | 'unknown';
}

const SENSITIVE_TEXT = /(?:\b(?:bearer|authorization|password|secret|token|cookie)\b|(?:sk|rk|pk)_(?:test|live)_|whsec_|acs_v\d+\.|ExponentPushToken\[|ExpoPushToken\[|\beyJ[A-Za-z0-9_-]{8,}\.)/i;

function safeDisplay(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return 'Unknown';
  const text = value.replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  if (SENSITIVE_TEXT.test(text) || /[A-Za-z0-9._~+\/-]{28,}/.test(text)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) return 'Unknown';
  return text ? text.slice(0, maxLength) : 'Unknown';
}

function safeOrigin(value: unknown): string {
  if (typeof value !== 'string') return 'Unknown';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || SENSITIVE_TEXT.test(url.hostname)
      || /[A-Za-z0-9_-]{40,}/.test(url.hostname)) return 'Unknown';
    // Query, path, fragment and URL credentials never enter a support report.
    return url.origin;
  } catch { return 'Unknown'; }
}

function allowed<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

/** Explicit fields only. Do not pass sessions, startup logs or raw API errors. */
export function buildAccountSupportReport(input: AccountSupportReportInput, now = new Date()): string {
  const version = /^\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]{1,25})?$/.test(input.appVersion) ? input.appVersion : 'Unknown';
  const build = /^\d{1,10}$/.test(input.buildNumber) ? input.buildNumber : 'Unknown';
  return JSON.stringify({
    report: 'Assisted Chat account support',
    version: 1,
    generatedAt: Number.isFinite(now.getTime()) ? now.toISOString() : 'Unknown',
    project: { name: safeDisplay(input.projectName, 100), origin: safeOrigin(input.apiBaseUrl) },
    app: { version, build },
    device: {
      platform: allowed(input.platform, ['ios', 'android', 'web', 'windows', 'macos', 'linux', 'unknown'], 'unknown'),
      model: safeDisplay(input.modelName, 100),
      osVersion: safeDisplay(input.osVersion, 64),
    },
    notifications: {
      permission: allowed(input.notificationPermission, ['granted', 'provisional', 'denied', 'undetermined', 'unavailable', 'unknown'], 'unknown'),
      registration: allowed(input.pushRegistration, ['registered', 'not-registered', 'unknown'], 'unknown'),
    },
    localLock: allowed(input.localLock, ['enabled', 'disabled', 'unavailable', 'unknown'], 'unknown'),
  }, null, 2);
}
