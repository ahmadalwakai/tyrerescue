type StartupPhase = 'checkpoint' | 'started' | 'completed' | 'failed';

interface StartupEvent {
  sequence: number;
  phase: StartupPhase;
  label: string;
  timestampIso: string;
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
  const event: StartupEvent = {
    sequence: events.length + 1,
    phase,
    label,
    timestampIso: new Date().toISOString(),
    ...(details ? { details } : {}),
    ...(phase === 'failed' ? { error: normalizeError(error) } : {}),
  };
  events.push(event);

  const line = `${STARTUP_PREFIX} ${String(event.sequence).padStart(3, '0')} ${phase} ${label}`;
  try {
    if (phase === 'failed') {
      console.error(line, event.error, details ?? {});
    } else {
      console.log(line, details ?? {});
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
