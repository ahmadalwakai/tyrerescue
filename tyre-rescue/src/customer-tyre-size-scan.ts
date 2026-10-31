import type { TyreSize } from './types';

export type TyreSizeCandidate = TyreSize & { label: string };

/** Read complete metric markings only. Never guess missing or ambiguous digits. */
export function findTyreSizeCandidates(input: unknown): TyreSizeCandidate[] {
  if (typeof input !== 'string' || !input) return [];
  const text = input.slice(0, 100_000).normalize('NFKC').toUpperCase().replace(/[⁄∕]/g, '/');
  const marking = /(?:^|[^A-Z0-9/])(?:(?:LT|P)\s*)?(\d{3})\s*\/\s*(\d{2})\s*(?:Z\s*)?R\s*(\d{2})(?!\d|[.,]\d)/g;
  const found = new Map<string, TyreSizeCandidate>();
  for (const match of text.matchAll(marking)) {
    const [, width, aspect, rim] = match;
    const w = Number(width), a = Number(aspect), r = Number(rim);
    // Conservative passenger-car/van metric range. Other formats remain manual.
    if (w < 125 || w > 445 || w % 5 || a < 20 || a > 95 || a % 5 || r < 10 || r > 24) continue;
    const label = `${width}/${aspect} R${rim}`;
    found.set(label, { width, aspect, rim, label });
  }
  return [...found.values()];
}
