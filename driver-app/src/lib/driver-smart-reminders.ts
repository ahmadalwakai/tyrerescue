/**
 * Smart driver reminder engine.
 *
 * Pure TypeScript — no React, no network calls, no timers, no side effects.
 * Converts a snapshot of current job/navigation state into one optional
 * reminder the React layer can surface to the driver.
 *
 * Thresholds are named constants so they can be adjusted without touching
 * the logic, and the engine can be unit-tested by feeding fake snapshots.
 */

export type SmartReminderSeverity = 'info' | 'warning' | 'urgent';

export type SmartReminderAction =
  | 'call_customer'
  | 'open_waze'
  | 'open_google_maps'
  | 'mark_arrived'
  | 'complete_job'
  | 'check_payment'
  | 'none';

export interface SmartDriverReminder {
  /** Stable identifier used for cooldown tracking. */
  id: string;
  /** i18n key for the card title. */
  titleKey: string;
  /** i18n key for the card body. */
  bodyKey: string;
  severity: SmartReminderSeverity;
  primaryAction: SmartReminderAction;
  secondaryAction: SmartReminderAction;
}

export interface SmartReminderInput {
  /** Current backend job status string or null when job not loaded. */
  jobStatus: string | null;
  /**
   * ISO timestamp of when the driver accepted / was assigned the job.
   * `acceptedAt` is preferred; fall back to `assignedAt` if needed.
   */
  acceptedAt: string | null;
  /** ISO timestamp of when the driver went en_route. */
  enRouteAt: string | null;
  /** ISO timestamp of when the driver marked arrived. */
  arrivedAt: string | null;
  /** ISO timestamp of when the driver marked in_progress (fitting started). */
  inProgressAt: string | null;
  /** Current wall time (Date.now()). */
  nowMs: number;
  /** Remaining route duration in seconds from the current position, or null. */
  remainingDurationSeconds: number | null;
  /** Straight-line distance to customer in metres, or null if unknown. */
  metersToCustomer: number | null;
  /** Driver speed in m/s, or null when GPS speed is unavailable. */
  speedMps: number | null;
  /**
   * True when the payment status needs the driver's attention
   * (pending / unknown / unpaid while fitting or completing).
   */
  paymentNeedsAttention: boolean;
  /** True when the job has a non-empty tyre size display string. */
  hasTyreSize: boolean;
  /** True when the job has a non-empty customer address. */
  hasAddress: boolean;
  /** True when the GPS fix is stale (no update in the last ~12 s). */
  gpsStale: boolean;
  /** True when the road route has definitively failed to load. */
  routeFailed: boolean;
}

// ── Reminder thresholds (minutes) ────────────────────────────────────────────
/** Show a gentle nudge after the job is accepted but not started. */
export const PRE_TRAVEL_REMINDER_MINUTES = 10;
/** Escalate the nudge if the driver still hasn't left. */
export const PRE_TRAVEL_URGENT_MINUTES = 20;
/** Nudge if the driver appears stationary while marked en_route. */
export const STATIONARY_ON_ROUTE_MINUTES = 8;
/** Dwell threshold for the "arrived but not marked" reminder. */
export const ARRIVAL_STATIONARY_MINUTES = 2;
/** First fitting-delay reminder (after arrived/in_progress timestamp). */
export const FITTING_REMINDER_MINUTES = 45;
/** Escalated fitting-delay reminder. */
export const FITTING_URGENT_MINUTES = 75;

// TODO: Return-to-garage reminders need existing garage coordinates/status
// support. The current driver payload does not expose garage coordinates or a
// return-to-garage status, so this case is intentionally omitted.

// ── Helper ───────────────────────────────────────────────────────────────────

function minutesSince(isoString: string | null, nowMs: number): number | null {
  if (!isoString) return null;
  const t = Date.parse(isoString);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 60_000;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the single highest-priority reminder for the current state,
 * or null when no reminder is warranted.
 *
 * Priority (highest first):
 *   1. Urgent fitting delay
 *   2. Urgent pre-travel delay
 *   3. Warning fitting delay
 *   4. Warning stationary en_route
 *   5. Payment attention (arrived/in_progress only)
 *   6. Info pre-travel nudge
 */
export function getSmartDriverReminder(
  input: SmartReminderInput,
): SmartDriverReminder | null {
  const { jobStatus, nowMs } = input;

  if (!jobStatus) return null;

  // ── D: Fitting delay (urgent) ─────────────────────────────────────────────
  if (jobStatus === 'arrived' || jobStatus === 'in_progress') {
    const fitTimestamp =
      jobStatus === 'in_progress' ? input.inProgressAt : input.arrivedAt;
    const minutesFitting = minutesSince(fitTimestamp, nowMs);
    if (minutesFitting != null && minutesFitting >= FITTING_URGENT_MINUTES) {
      return {
        id: 'fitting_urgent',
        titleKey: 'reminder.fittingUrgentTitle',
        bodyKey: 'reminder.fittingUrgentBody',
        severity: 'urgent',
        primaryAction: 'call_customer',
        secondaryAction: 'complete_job',
      };
    }
  }

  // ── A: Delay before travelling (urgent) ──────────────────────────────────
  if (jobStatus === 'driver_assigned') {
    const minutesWaiting = minutesSince(input.acceptedAt, nowMs);
    if (minutesWaiting != null && minutesWaiting >= PRE_TRAVEL_URGENT_MINUTES) {
      return {
        id: 'pre_travel_urgent',
        titleKey: 'reminder.preTravelUrgentTitle',
        bodyKey: 'reminder.preTravelUrgentBody',
        severity: 'urgent',
        primaryAction: 'open_waze',
        secondaryAction: 'call_customer',
      };
    }
  }

  // ── D: Fitting delay (warning) ────────────────────────────────────────────
  if (jobStatus === 'arrived' || jobStatus === 'in_progress') {
    const fitTimestamp =
      jobStatus === 'in_progress' ? input.inProgressAt : input.arrivedAt;
    const minutesFitting = minutesSince(fitTimestamp, nowMs);
    if (minutesFitting != null && minutesFitting >= FITTING_REMINDER_MINUTES) {
      return {
        id: 'fitting_delay',
        titleKey: 'reminder.fittingDelayTitle',
        bodyKey: 'reminder.fittingDelayBody',
        severity: 'warning',
        primaryAction: 'call_customer',
        secondaryAction: 'none',
      };
    }
  }

  // ── B: Stationary while en_route ─────────────────────────────────────────
  if (jobStatus === 'en_route') {
    const isStationary =
      input.speedMps != null && input.speedMps < 0.6;
    const minutesEnRoute = minutesSince(input.enRouteAt, nowMs);
    if (
      isStationary &&
      minutesEnRoute != null &&
      minutesEnRoute >= STATIONARY_ON_ROUTE_MINUTES
    ) {
      return {
        id: 'en_route_stationary',
        titleKey: 'reminder.enRouteStationaryTitle',
        bodyKey: 'reminder.enRouteStationaryBody',
        severity: 'warning',
        primaryAction: 'call_customer',
        secondaryAction: 'open_waze',
      };
    }
  }

  // ── Payment attention (arrived / fitting phase) ───────────────────────────
  if (
    input.paymentNeedsAttention &&
    (jobStatus === 'arrived' || jobStatus === 'in_progress')
  ) {
    return {
      id: 'payment_attention',
      titleKey: 'reminder.paymentAttentionTitle',
      bodyKey: 'reminder.paymentAttentionBody',
      severity: 'warning',
      primaryAction: 'check_payment',
      secondaryAction: 'none',
    };
  }

  // ── A: Delay before travelling (info) ────────────────────────────────────
  if (jobStatus === 'driver_assigned') {
    const minutesWaiting = minutesSince(input.acceptedAt, nowMs);
    if (minutesWaiting != null && minutesWaiting >= PRE_TRAVEL_REMINDER_MINUTES) {
      return {
        id: 'pre_travel_info',
        titleKey: 'reminder.preTravelTitle',
        bodyKey: 'reminder.preTravelBody',
        severity: 'info',
        primaryAction: 'open_waze',
        secondaryAction: 'call_customer',
      };
    }
  }

  return null;
}
