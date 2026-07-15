type DiagnosticValue = string | number | boolean | null | undefined;

type DiagnosticDetails = Record<string, DiagnosticValue>;

export function roundedCoordinate(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10_000) / 10_000;
}

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
