import { AppState } from 'react-native';

type DiagnosticValue = string | number | boolean | null | undefined;

export function roundedCoordinate(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10_000) / 10_000;
}

export function endpointHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function logDriverTrackingDiagnostic(
  event: string,
  details: Record<string, DiagnosticValue> = {},
): void {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );

  console.log('[driver-tracking-diagnostics]', {
    event,
    timestamp: new Date().toISOString(),
    appState: AppState.currentState,
    ...safeDetails,
  });
}
