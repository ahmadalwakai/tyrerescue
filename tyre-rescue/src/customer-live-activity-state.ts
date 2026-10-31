import { isTrackingLocationFresh } from './tracking-state';

export interface LiveRescueTracking {
  status: string;
  driverName: string | null;
  driverLocationAt: string | null;
  estimatedArrivalAt?: string | null;
  etaMinutes: number | null;
  canChat?: boolean;
}

export function liveRescueContent(tracking: LiveRescueTracking, receivedAt: number, now = Date.now()) {
  const supplied = Date.parse(tracking.estimatedArrivalAt ?? '');
  const arrival = Number.isFinite(supplied) ? supplied
    : typeof tracking.etaMinutes === 'number' && Number.isFinite(tracking.etaMinutes) && tracking.etaMinutes >= 0
      ? receivedAt + tracking.etaMinutes * 60_000 : NaN;
  const fresh = isTrackingLocationFresh(tracking.driverLocationAt, now);
  return {
    status: tracking.status,
    driverName: (tracking.driverName ?? '').trim().split(/\s+/)[0].slice(0, 40),
    estimatedArrivalAt: tracking.status === 'en_route' && fresh && arrival > now && arrival <= now + 86_400_000 ? Math.floor(arrival / 1000) : null,
    updatedAt: Math.floor(now / 1000),
    staleAt: Math.floor((fresh ? Math.min(now + 90_000, Date.parse(tracking.driverLocationAt!) + 180_000) : now + 90_000) / 1000),
  };
}
