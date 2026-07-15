type DiagnosticValue = string | number | boolean | null | undefined;

type DiagnosticDetails = Record<string, DiagnosticValue>;

export function logTrackingDiagnostic(event: string, details: DiagnosticDetails = {}): void {
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );

  console.log('[tracking-diagnostics]', {
    event,
    timestamp: new Date().toISOString(),
    ...safeDetails,
  });
}
