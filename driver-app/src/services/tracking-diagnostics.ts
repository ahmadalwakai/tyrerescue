import { AppState } from 'react-native';

type DiagnosticValue = string | number | boolean | null | undefined;

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
