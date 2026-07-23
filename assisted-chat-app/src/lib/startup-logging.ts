import Constants from 'expo-constants';

type StartupPhase = 'checkpoint' | 'started' | 'completed' | 'failed';

interface StartupEvent {
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

const STARTUP_PREFIX = '[startup]';

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

function timeline(): StartupEvent[] {
  const target = globalThis as StartupGlobal;
  if (!Array.isArray(target.__TYRE_RESCUE_STARTUP_TIMELINE__)) {
    target.__TYRE_RESCUE_STARTUP_TIMELINE__ = [];
  }
  return target.__TYRE_RESCUE_STARTUP_TIMELINE__;
}

function stringifyUnknown(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function normalizeError(error: unknown): StartupEvent['error'] {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '(empty error message)',
      stack: error.stack,
    };
  }
  return {
    name: 'NonErrorThrown',
    message: typeof error === 'string' ? error : stringifyUnknown(error),
  };
}

function emit(
  phase: StartupPhase,
  label: string,
  details?: Record<string, unknown>,
  error?: unknown,
): void {
  const events = timeline();
  const build = readBuildMetadata();
  const event: StartupEvent = {
    sequence: events.length + 1,
    phase,
    label,
    timestampIso: new Date().toISOString(),
    appVersion: build.appVersion,
    buildNumber: build.buildNumber,
    ...(details ? { details } : {}),
    ...(phase === 'failed' ? { error: normalizeError(error) } : {}),
  };
  events.push(event);

  const line = `${STARTUP_PREFIX} ${String(event.sequence).padStart(3, '0')} ${phase} ${label}`;
  const consoleDetails = {
    timestampIso: event.timestampIso,
    appVersion: event.appVersion,
    buildNumber: event.buildNumber,
    ...(details ?? {}),
  };
  try {
    if (phase === 'failed') {
      console.error(line, event.error, consoleDetails);
    } else {
      console.log(line, consoleDetails);
    }
  } catch {
    // Console logging itself must never be the cause of a startup failure.
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
  return timeline();
}
