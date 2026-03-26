export type CanonicalSeason = 'allseason' | 'summer' | 'winter';

const SEASON_OPTIONS: readonly CanonicalSeason[] = ['allseason', 'summer', 'winter'];

function toCompactSeasonToken(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeSeason(input: unknown): CanonicalSeason {
  const compact = toCompactSeasonToken(input);

  if (compact === 'summer') return 'summer';
  if (compact === 'winter') return 'winter';
  if (compact === 'allseason' || compact.length === 0) return 'allseason';

  return 'allseason';
}

export function isValidSeason(input: unknown): boolean {
  const compact = toCompactSeasonToken(input);

  if (compact.length === 0) return true;

  return compact === 'allseason' || compact === 'summer' || compact === 'winter';
}

export function getSeasonLabel(input: unknown): string {
  const season = normalizeSeason(input);

  if (season === 'summer') return 'Summer';
  if (season === 'winter') return 'Winter';

  return 'All-Season';
}

export { SEASON_OPTIONS };
