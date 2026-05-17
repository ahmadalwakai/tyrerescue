'use client';

import { useEffect, useRef } from 'react';
import type { TrackingStatus } from '@/types/tracking';
import {
  formatLastUpdated,
  getTrackingHealth,
  type TrackingHealth,
} from '@/lib/tracking/tracking-format';
import { useLiveClock } from '@/lib/tracking/use-live-clock';

interface Props {
  status: TrackingStatus;
  /** Short headline. Falls back to a sensible default per status. */
  title?: string;
  /** Long description below the title. */
  body?: string;
  /** Formatted distance string (already humanised), e.g. "1.2 miles". */
  distanceLabel?: string | null;
  /** ISO/Date timestamp of the latest driver fix. */
  lastUpdatedAt?: string | Date | null;
  /**
   * Tells the banner whether the tracking session is fresh — drives the
   * live pulsing dot. Pass `false` to suppress the dot during paused or
   * completed states.
   */
  isLive?: boolean;
  /** Optional ETA in minutes, shown next to distance when available. */
  etaMinutes?: number | null;
  /** Translatable copy for the chrome (live label, signal health, etc.). */
  labels?: Partial<BannerLabels>;
}

export interface BannerLabels {
  trackingActive: string;
  tracking: string;
  reconnecting: string;
  weakSignal: string;
  goodSignal: string;
  trackingPaused: string;
  completed: string;
  distance: string;
  lastUpdate: string;
  eta: string;
  etaSuffixMin: string;
}

const EN_LABELS: BannerLabels = {
  trackingActive: 'Live tracking active',
  tracking: 'Tracking',
  reconnecting: 'Reconnecting…',
  weakSignal: 'Weak signal',
  goodSignal: 'Good signal',
  trackingPaused: 'Tracking paused',
  completed: 'Completed',
  distance: 'Distance',
  lastUpdate: 'Last update',
  eta: 'ETA',
  etaSuffixMin: 'min',
};

const DEFAULT_TITLE: Record<TrackingStatus, string> = {
  pending: 'Waiting for driver to start',
  in_progress: 'Driver is on the way',
  paused: 'Tracking paused',
  completed: 'Tracking completed',
  expired: 'Tracking link expired',
};

const DEFAULT_BODY: Record<TrackingStatus, string> = {
  pending:
    'You will see the live location as soon as the driver sets off.',
  in_progress: 'Live location updates every few seconds.',
  paused: 'Driver location has not updated recently.',
  completed: 'The driver has finished the job. Thank you for choosing Tyre Rescue.',
  expired: 'This tracking link is no longer active.',
};

const TONE: Record<TrackingStatus, { ring: string; text: string; dot: string }> = {
  pending: { ring: 'border-amber-500/30 bg-amber-500/5', text: 'text-amber-200', dot: 'bg-amber-400' },
  in_progress: { ring: 'border-emerald-500/30 bg-emerald-500/5', text: 'text-emerald-200', dot: 'bg-emerald-400' },
  paused: { ring: 'border-amber-500/40 bg-amber-500/10', text: 'text-amber-200', dot: 'bg-amber-400' },
  completed: { ring: 'border-emerald-500/40 bg-emerald-500/10', text: 'text-emerald-200', dot: 'bg-emerald-400' },
  expired: { ring: 'border-zinc-700 bg-zinc-900/50', text: 'text-zinc-300', dot: 'bg-zinc-500' },
};

const HEALTH_TONE: Record<TrackingHealth, string> = {
  good: 'text-emerald-300',
  weak: 'text-amber-300',
  lost: 'text-amber-300',
  completed: 'text-emerald-300',
  idle: 'text-zinc-400',
};

function healthLabel(h: TrackingHealth, l: BannerLabels): string {
  switch (h) {
    case 'good': return l.goodSignal;
    case 'weak': return l.reconnecting;
    case 'lost': return l.trackingPaused;
    case 'completed': return l.completed;
    case 'idle': return l.tracking;
  }
}

/**
 * Reusable status card for tracking pages. Renders a coloured ring, a
 * pulsing dot when live, a headline + body, plus optional distance and
 * "last update" meta lines. Used by both the customer and driver pages
 * so they stay in visual lockstep.
 */
export function TrackingStatusBanner({
  status,
  title,
  body,
  distanceLabel,
  lastUpdatedAt,
  isLive,
  etaMinutes,
  labels,
}: Props) {
  const tone = TONE[status];
  const l: BannerLabels = { ...EN_LABELS, ...(labels ?? {}) };
  const showDot = isLive ?? status === 'in_progress';

  // Tick locally every second so "Last update: X seconds ago" stays fresh
  // without firing extra API calls. The hook pauses while the tab is
  // hidden to avoid wasted re-renders.
  useLiveClock(1_000);

  const lastUpdatedLabel = lastUpdatedAt ? formatLastUpdated(lastUpdatedAt) : '';

  const health = getTrackingHealth(lastUpdatedAt ?? null, {
    isCompleted: status === 'completed',
    isActive: status === 'in_progress' || status === 'paused',
  });
  const showHealth = status === 'in_progress' || status === 'paused' || status === 'completed';

  // Briefly highlight the distance/ETA strip whenever the last-update
  // timestamp changes — gives calm "fresh data arrived" feedback.
  const flashRef = useRef<HTMLDListElement | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = lastUpdatedAt
      ? lastUpdatedAt instanceof Date
        ? lastUpdatedAt.toISOString()
        : String(lastUpdatedAt)
      : null;
    if (!key || key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    const el = flashRef.current;
    if (!el) return;
    el.classList.remove('tr-flash');
    // Force reflow to restart the animation cleanly.
    void el.offsetWidth;
    el.classList.add('tr-flash');
  }, [lastUpdatedAt]);

  const etaText =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes >= 0
      ? `${Math.max(1, Math.round(etaMinutes))} ${l.etaSuffixMin}`
      : null;

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${tone.ring}`}>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5">
          {showDot && (
            <span
              className={`tr-live-dot absolute inline-flex h-full w-full rounded-full ${tone.dot}`}
              aria-hidden
            />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`} />
        </span>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}>
          {showDot ? l.trackingActive : l.tracking}
        </p>
        {showHealth && (
          <span
            className={`ml-auto text-[11px] font-medium ${HEALTH_TONE[health]}`}
            aria-live="polite"
          >
            {healthLabel(health, l)}
          </span>
        )}
      </div>

      <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">
        {title ?? DEFAULT_TITLE[status]}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">
        {body ?? DEFAULT_BODY[status]}
      </p>

      {(distanceLabel || lastUpdatedLabel || etaText) && (
        <dl
          ref={flashRef}
          className="mt-4 grid grid-cols-2 gap-3 rounded-lg px-1 py-1 text-xs sm:text-sm md:grid-cols-3"
        >
          {distanceLabel ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{l.distance}</dt>
              <dd className="mt-0.5 font-medium text-white">{distanceLabel}</dd>
            </div>
          ) : null}
          {etaText ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{l.eta}</dt>
              <dd className="mt-0.5 font-medium text-white">{etaText}</dd>
            </div>
          ) : null}
          {lastUpdatedLabel ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{l.lastUpdate}</dt>
              <dd className="mt-0.5 font-medium text-white">{lastUpdatedLabel}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
