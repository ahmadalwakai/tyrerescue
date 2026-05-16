import type { TrackingStatus } from '@/types/tracking';
import { formatLastUpdated } from '@/lib/tracking/tracking-format';

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
}

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
}: Props) {
  const tone = TONE[status];
  const showDot = isLive ?? status === 'in_progress';
  const lastUpdatedLabel = lastUpdatedAt ? formatLastUpdated(lastUpdatedAt) : '';

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${tone.ring}`}>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex h-2.5 w-2.5">
          {showDot && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tone.dot}`}
            />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone.dot}`} />
        </span>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${tone.text}`}>
          {showDot ? 'Live tracking active' : 'Tracking'}
        </p>
      </div>

      <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">
        {title ?? DEFAULT_TITLE[status]}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">
        {body ?? DEFAULT_BODY[status]}
      </p>

      {(distanceLabel || lastUpdatedLabel) && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:text-sm">
          {distanceLabel ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Distance</dt>
              <dd className="mt-0.5 font-medium text-white">{distanceLabel}</dd>
            </div>
          ) : null}
          {lastUpdatedLabel ? (
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Last update</dt>
              <dd className="mt-0.5 font-medium text-white">{lastUpdatedLabel}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
