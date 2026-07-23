import Constants from 'expo-constants';

type StartupPhase = 'checkpoint' | 'started' | 'completed' | 'failed';

export interface StartupEvent {
  sequence: number;
  phase: StartupPhase;
  label: string;
  timestampIso: string;
  appVersion: string;
  buildNumber: string;
  details?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface StartupGlobal {
  __TYRE_RESCUE_STARTUP_TIMELINE__?: StartupEvent[];
}

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

export interface StartupDiagnosticRecord {
  stage: string;
  phase: StartupPhase;
  timestampIso: string;
  appVersion: string;
  buildNumber: string;
  details?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  history?: StartupDiagnosticRecord[];
}

const STARTUP_PREFIX = '[startup]';
export const STARTUP_DIAGNOSTIC_STORAGE_KEY = 'assistedChat.startupDiagnostic.v1';

const MAX_TIMELINE_EVENTS = 80;
const MAX_STORED_HISTORY_EVENTS = 20;
const MAX_DETAILS_DEPTH = 4;
const MAX_OBJECT_KEYS = 32;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const MAX_ERROR_MESSAGE_LENGTH = 700;
const MAX_STACK_LENGTH = 2_500;
const SENSITIVE_KEY_PATTERN =
  /address|authorization|bearer|body|booking|content|cookie|customer|email|headers?|jwt|location|notification|password|payload|phone|postcode|secret|session|token/i;
const SENSITIVE_TEXT_MARKER_PATTERN =
  /\b(authorization|bearer|cookie|customer|password|payload|secret|session|token)\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const EXPO_PUSH_TOKEN_PATTERN = /ExponentPushToken\[[^\]]+\]/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9._-]{10,}\b/g;

let asyncStoragePromise: Promise<AsyncStorageLike | null> | null = null;

function readBuildMetadata(): { appVersion: string; buildNumber: string } {
  try {
    const expoConfig = Constants.expoConfig as
      | {
          version?: string;
          ios?: { buildNumber?: string };
        }
      | null
      | undefined;
    const platform = Constants.platform as
      | {
          ios?: { buildNumber?: string | null };
        }
      | null
      | undefined;
    return {
      appVersion: expoConfig?.version ?? 'unknown',
      buildNumber: platform?.ios?.buildNumber ?? expoConfig?.ios?.buildNumber ?? 'unknown',
    };
  } catch {
    return { appVersion: 'unknown', buildNumber: 'unknown' };
  }
}

function timelineOrNull(): StartupEvent[] | null {
  try {
    const target = globalThis as StartupGlobal;
    if (!Array.isArray(target.__TYRE_RESCUE_STARTUP_TIMELINE__)) {
      target.__TYRE_RESCUE_STARTUP_TIMELINE__ = [];
    }
    return target.__TYRE_RESCUE_STARTUP_TIMELINE__;
  } catch {
    return null;
  }
}

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function redactSensitiveText(value: string, maxLength = MAX_STRING_LENGTH): string {
  try {
    const redacted = value
      .replace(BEARER_PATTERN, 'Bearer [redacted]')
      .replace(EXPO_PUSH_TOKEN_PATTERN, 'ExponentPushToken[[redacted]]')
      .replace(LONG_TOKEN_PATTERN, '[redacted-token]')
      .replace(EMAIL_PATTERN, '[redacted-email]')
      .replace(PHONE_PATTERN, '[redacted-phone]');
    if (SENSITIVE_TEXT_MARKER_PATTERN.test(redacted)) {
      return '[redacted-sensitive-text]';
    }
    return truncateString(redacted, maxLength);
  } catch {
    return '[redacted-unreadable-text]';
  }
}

function stringifyUnknown(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(value, (key, child) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]';
      if (typeof child === 'string') return redactSensitiveText(child);
      if (typeof child === 'bigint') return `[bigint:${String(child)}]`;
      if (!child || typeof child !== 'object') return child;
      if (seen.has(child)) return '[circular]';
      seen.add(child);
      return child;
    });
    return redactSensitiveText(json === undefined ? String(value) : json, MAX_ERROR_MESSAGE_LENGTH);
  } catch {
    try {
      return redactSensitiveText(String(value), MAX_ERROR_MESSAGE_LENGTH);
    } catch {
      return '[unserializable]';
    }
  }
}

function normalizeError(error: unknown): StartupEvent['error'] {
  try {
    if (error instanceof Error) {
      const message = error.message || '(empty error message)';
      const stack = typeof error.stack === 'string'
        ? redactSensitiveText(error.stack, MAX_STACK_LENGTH)
        : undefined;
      return {
        name: redactSensitiveText(error.name || 'Error', 120),
        message: redactSensitiveText(message, MAX_ERROR_MESSAGE_LENGTH),
        ...(stack ? { stack } : {}),
      };
    }
    return {
      name: 'NonErrorThrown',
      message: typeof error === 'string'
        ? redactSensitiveText(error, MAX_ERROR_MESSAGE_LENGTH)
        : stringifyUnknown(error),
    };
  } catch {
    return {
      name: 'UnknownError',
      message: '[startup logger failed to normalize error]',
    };
  }
}

function redactValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  try {
    if (typeof value === 'string') return redactSensitiveText(value);
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      return value;
    }
    if (typeof value === 'bigint') return `[bigint:${String(value)}]`;
    if (typeof value === 'function') return '[function]';
    if (typeof value === 'symbol') return '[symbol]';
    if (value instanceof Error) return normalizeError(value);
    if (depth >= MAX_DETAILS_DEPTH) return '[redacted-depth]';
    if (!value || typeof value !== 'object') return redactSensitiveText(String(value));
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) {
      const sliced = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) sliced.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
      return sliced;
    }
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    const result: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      const safeKey = truncateString(key, 120);
      result[safeKey] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[redacted]'
        : redactValue(child, depth + 1, seen);
    }
    const totalKeys = Object.keys(value as Record<string, unknown>).length;
    if (totalKeys > MAX_OBJECT_KEYS) {
      result.__truncatedKeys = totalKeys - MAX_OBJECT_KEYS;
    }
    return result;
  } catch {
    return '[redacted-unreadable-value]';
  }
}

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  try {
    if (!details) return undefined;
    return redactValue(details) as Record<string, unknown>;
  } catch {
    return { error: '[details-redaction-failed]' };
  }
}

function loadAsyncStorage(): Promise<AsyncStorageLike | null> {
  try {
    if (!asyncStoragePromise) {
      asyncStoragePromise = import('@react-native-async-storage/async-storage')
        .then((module) => module.default as AsyncStorageLike)
        .catch((error: unknown) => {
          try {
            console.warn('[startup] persistent diagnostics unavailable', normalizeError(error));
          } catch {
            // Logging fallback must never affect startup.
          }
          asyncStoragePromise = null;
          return null;
        });
    }
    return asyncStoragePromise;
  } catch {
    asyncStoragePromise = null;
    return Promise.resolve(null);
  }
}

function toDiagnosticEvent(event: StartupEvent): StartupDiagnosticRecord {
  return {
    stage: event.label,
    phase: event.phase,
    timestampIso: event.timestampIso,
    appVersion: event.appVersion,
    buildNumber: event.buildNumber,
    ...(event.details ? { details: sanitizeDetails(event.details) } : {}),
    ...(event.error ? { error: event.error } : {}),
  };
}

function toDiagnosticRecord(event: StartupEvent, events: StartupEvent[]): StartupDiagnosticRecord {
  const history = events.slice(-MAX_STORED_HISTORY_EVENTS).map(toDiagnosticEvent);
  return {
    ...toDiagnosticEvent(event),
    history,
  };
}

function safeWarn(label: string, error: unknown): void {
  try {
    console.warn(label, normalizeError(error));
  } catch {
    // Logging fallback must never affect startup.
  }
}

function persistLatestStartupDiagnostic(event: StartupEvent, events: StartupEvent[]): void {
  try {
    const record = toDiagnosticRecord(event, events);
    let serialized: string;
    try {
      serialized = JSON.stringify(record);
    } catch (error) {
      safeWarn('[startup] failed to serialize diagnostic', error);
      return;
    }
    void loadAsyncStorage()
      .then(async (storage) => {
        if (!storage) return;
        try {
          await storage.setItem(STARTUP_DIAGNOSTIC_STORAGE_KEY, serialized);
        } catch (error) {
          safeWarn('[startup] failed to persist diagnostic', error);
        }
      })
      .catch((error: unknown) => {
        safeWarn('[startup] failed to load diagnostic storage', error);
      });
  } catch (error) {
    safeWarn('[startup] persistent diagnostic path failed', error);
  }
}

function emit(
  phase: StartupPhase,
  label: string,
  details?: Record<string, unknown>,
  error?: unknown,
): void {
  try {
    const events = timelineOrNull() ?? [];
    const build = readBuildMetadata();
    const event: StartupEvent = {
      sequence: events.length + 1,
      phase,
      label: truncateString(label, 160),
      timestampIso: new Date().toISOString(),
      appVersion: redactSensitiveText(build.appVersion, 80),
      buildNumber: redactSensitiveText(build.buildNumber, 80),
      ...(details ? { details: sanitizeDetails(details) } : {}),
      ...(phase === 'failed' ? { error: normalizeError(error) } : {}),
    };
    events.push(event);
    if (events.length > MAX_TIMELINE_EVENTS) {
      events.splice(0, events.length - MAX_TIMELINE_EVENTS);
    }
    persistLatestStartupDiagnostic(event, events);

    const line = `${STARTUP_PREFIX} ${String(event.sequence).padStart(3, '0')} ${phase} ${event.label}`;
    const consoleDetails = {
      timestampIso: event.timestampIso,
      appVersion: event.appVersion,
      buildNumber: event.buildNumber,
      ...(event.details ?? {}),
    };
    if (phase === 'failed') {
      console.error(line, event.error, consoleDetails);
    } else {
      console.log(line, consoleDetails);
    }
  } catch (consoleOrLoggerError) {
    safeWarn('[startup] logger emit failed', consoleOrLoggerError);
  }
}

export function logStartupCheckpoint(label: string, details?: Record<string, unknown>): void {
  emit('checkpoint', label, details);
}

export function logStartupModuleStarted(label: string, details?: Record<string, unknown>): void {
  emit('started', label, details);
}

export function logStartupModuleCompleted(label: string, details?: Record<string, unknown>): void {
  emit('completed', label, details);
}

export function logStartupModuleFailed(
  label: string,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  emit('failed', label, details, error);
}

export function getStartupTimeline(): readonly StartupEvent[] {
  try {
    return [...(timelineOrNull() ?? [])];
  } catch {
    return [];
  }
}

function isStoredDiagnostic(value: unknown): value is StartupDiagnosticRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.stage === 'string' &&
    typeof record.timestampIso === 'string' &&
    typeof record.appVersion === 'string' &&
    typeof record.buildNumber === 'string'
  );
}

function sanitizeStoredDiagnostic(value: unknown, depth = 0): StartupDiagnosticRecord | null {
  try {
    if (!isStoredDiagnostic(value)) return null;
    const record = value as StartupDiagnosticRecord;
    const phase = ['checkpoint', 'started', 'completed', 'failed'].includes(record.phase)
      ? record.phase
      : 'checkpoint';
    const error = record.error && typeof record.error === 'object'
      ? {
          name: redactSensitiveText(String(record.error.name ?? 'Error'), 120),
          message: redactSensitiveText(String(record.error.message ?? ''), MAX_ERROR_MESSAGE_LENGTH),
          ...(typeof record.error.stack === 'string'
            ? { stack: redactSensitiveText(record.error.stack, MAX_STACK_LENGTH) }
            : {}),
        }
      : undefined;
    return {
      stage: redactSensitiveText(record.stage, 160),
      phase,
      timestampIso: redactSensitiveText(record.timestampIso, 80),
      appVersion: redactSensitiveText(record.appVersion, 80),
      buildNumber: redactSensitiveText(record.buildNumber, 80),
      ...(record.details ? { details: sanitizeDetails(record.details) } : {}),
      ...(error ? { error } : {}),
      ...(depth === 0 && Array.isArray(record.history)
        ? { history: record.history.slice(-MAX_STORED_HISTORY_EVENTS).map((item) => sanitizeStoredDiagnostic(item, depth + 1)).filter(Boolean) as StartupDiagnosticRecord[] }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function readStartupDiagnostic(): Promise<StartupDiagnosticRecord | null> {
  try {
    const storage = await loadAsyncStorage();
    if (!storage) return null;
    let raw: string | null = null;
    try {
      raw = await storage.getItem(STARTUP_DIAGNOSTIC_STORAGE_KEY);
    } catch (error) {
      safeWarn('[startup] failed to read diagnostic', error);
      return null;
    }
    if (!raw) return null;
    try {
      return sanitizeStoredDiagnostic(JSON.parse(raw));
    } catch (error) {
      safeWarn('[startup] failed to parse diagnostic', error);
      return null;
    }
  } catch (error) {
    safeWarn('[startup] read diagnostic path failed', error);
    return null;
  }
}

export async function clearStartupDiagnostic(): Promise<void> {
  try {
    const storage = await loadAsyncStorage();
    if (!storage) return;
    try {
      await storage.removeItem(STARTUP_DIAGNOSTIC_STORAGE_KEY);
    } catch (error) {
      safeWarn('[startup] failed to clear diagnostic', error);
    }
  } catch (error) {
    safeWarn('[startup] clear diagnostic path failed', error);
  }
}
