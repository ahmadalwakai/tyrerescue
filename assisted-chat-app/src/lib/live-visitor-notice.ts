import type { LiveVisitorProjectSnapshot } from '../hooks/useLiveVisitorCount';

export interface VisitorCountEntry {
  identity: string;
  project: LiveVisitorProjectSnapshot | null;
  liveCount: number;
}

export interface VisitorCountChange extends VisitorCountEntry {
  previousCount: number;
  delta: number;
}

export function visitorCountEntries(
  projects: LiveVisitorProjectSnapshot[],
  liveCount: number | null,
): VisitorCountEntry[] {
  if (projects.length > 0) {
    return projects.map((project) => ({
      identity: `${project.sourceApp}:${project.origin ?? ''}`,
      project,
      liveCount: project.liveCount,
    }));
  }
  return liveCount === null ? [] : [{ identity: 'all-projects', project: null, liveCount }];
}

/** First observations and project rotation are baselines, never visitor arrivals. */
export function changedVisitorCounts(
  previous: VisitorCountEntry[] | null,
  current: VisitorCountEntry[],
): VisitorCountChange[] {
  if (!previous) return [];
  const previousByIdentity = new Map(previous.map((entry) => [entry.identity, entry.liveCount]));
  return current.flatMap((entry) => {
    const previousCount = previousByIdentity.get(entry.identity);
    if (previousCount === undefined || previousCount === entry.liveCount) return [];
    return [{ ...entry, previousCount, delta: entry.liveCount - previousCount }];
  });
}

export function visitorChangeLabel(changes: VisitorCountChange[]): string {
  const joined = changes.reduce((total, change) => total + Math.max(0, change.delta), 0);
  const left = changes.reduce((total, change) => total + Math.max(0, -change.delta), 0);
  if (joined && left) return `↑ +${joined.toLocaleString('en-GB')} · ↓ −${left.toLocaleString('en-GB')}`;
  const count = joined || left;
  return `${joined ? '↑ +' : '↓ −'}${count.toLocaleString('en-GB')} ${count === 1 ? 'visitor' : 'visitors'}`;
}

export function formatLiveVisitorProjectName(project: LiveVisitorProjectSnapshot | null): string {
  if (!project) return 'All sites';
  if (project.origin) {
    try {
      const host = new URL(project.origin).hostname.replace(/^www\./, '');
      if (host) return host;
    } catch {
      // Fall through to the project label.
    }
  }
  return project.sourceLabel || project.sourceApp;
}
