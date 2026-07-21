import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface ActiveJobPaymentSummary {
  state: string;
  label: string;
  instruction: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  method: string;
  methodLabel: string;
  linkStatus: string;
  paidVia: string | null;
  totalPence: number | null;
  paidPence: number | null;
  depositAmountPence: number | null;
  depositPaidPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number | null;
  paymentUpdatedAt: string | null;
  depositPaidAt: string | null;
  linkSentAt: string | null;
  linkOpenedAt: string | null;
  linkExpiresAt: string | null;
  reason: string;
}

export interface DriverSituation {
  jobRef: string;
  driverId: string | null;
  status: 'on_time' | 'at_risk' | 'late' | 'offline' | 'job_closed' | 'unavailable' | string;
  label: string;
  dueBackAt: string | null;
  availableAfter: string | null;
  totalMinutes: number | null;
  delayMinutes: number;
  reasons: string[];
  reasonLabels: string[];
  lastLocationAt: string | null;
  gpsState: 'normal' | 'weak' | 'drift' | 'off_route' | 'offline' | null | string;
}

export interface ActiveJobItem {
  bookingRef: string;
  bookingId: string;
  status: 'driver_assigned' | 'en_route' | 'arrived' | 'in_progress' | string;
  scheduledAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  customer: {
    name: string;
    phone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  driver: {
    id: string | null;
    name: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    locationAt: string | null;
    locationSource: string | null;
    isStale: boolean;
  };
  paymentSummary: ActiveJobPaymentSummary | null;
  payment: ActiveJobPaymentSummary | null;
  distanceMiles: number | null;
  etaMinutes: number | null;
  driverSituation: DriverSituation;
}

interface ActiveJobsResponse {
  activeJobs?: unknown;
}

const POLL_MS = 12_000;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateOrNull(value: unknown, min: number, max: number): number | null {
  const parsed = numberOrNull(value);
  return parsed != null && parsed >= min && parsed <= max ? parsed : null;
}

function dateStringOrNull(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? text : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = optionalString(item);
        return text ? [text] : [];
      })
    : [];
}

function normalizePaymentSummary(value: unknown): ActiveJobPaymentSummary | null {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    state: optionalString(raw.state) ?? 'unknown',
    label: optionalString(raw.label) ?? 'Payment',
    instruction: optionalString(raw.instruction) ?? 'Confirm with driver',
    tone: optionalString(raw.tone) ?? 'neutral',
    method: optionalString(raw.method) ?? 'unknown',
    methodLabel: optionalString(raw.methodLabel) ?? 'Payment',
    linkStatus: optionalString(raw.linkStatus) ?? 'unknown',
    paidVia: optionalString(raw.paidVia),
    totalPence: numberOrNull(raw.totalPence),
    paidPence: numberOrNull(raw.paidPence),
    depositAmountPence: numberOrNull(raw.depositAmountPence),
    depositPaidPence: numberOrNull(raw.depositPaidPence),
    remainingBalancePence: numberOrNull(raw.remainingBalancePence),
    amountToCollectPence: numberOrNull(raw.amountToCollectPence),
    paymentUpdatedAt: dateStringOrNull(raw.paymentUpdatedAt),
    depositPaidAt: dateStringOrNull(raw.depositPaidAt),
    linkSentAt: dateStringOrNull(raw.linkSentAt),
    linkOpenedAt: dateStringOrNull(raw.linkOpenedAt),
    linkExpiresAt: dateStringOrNull(raw.linkExpiresAt),
    reason: optionalString(raw.reason) ?? '',
  };
}

function normalizeDriverSituation(value: unknown, bookingRef: string, driverId: string | null): DriverSituation {
  const raw = asRecord(value);
  return {
    jobRef: optionalString(raw?.jobRef) ?? bookingRef,
    driverId: optionalString(raw?.driverId) ?? driverId,
    status: optionalString(raw?.status) ?? 'unavailable',
    label: optionalString(raw?.label) ?? 'Situation unavailable',
    dueBackAt: dateStringOrNull(raw?.dueBackAt),
    availableAfter: dateStringOrNull(raw?.availableAfter),
    totalMinutes: numberOrNull(raw?.totalMinutes),
    delayMinutes: numberOrNull(raw?.delayMinutes) ?? 0,
    reasons: stringArray(raw?.reasons),
    reasonLabels: stringArray(raw?.reasonLabels),
    lastLocationAt: dateStringOrNull(raw?.lastLocationAt),
    gpsState: optionalString(raw?.gpsState),
  };
}

export function normalizeActiveJobItem(value: unknown): ActiveJobItem | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const bookingId = optionalString(raw.bookingId) ?? optionalString(raw.id);
  const bookingRef = optionalString(raw.bookingRef) ?? optionalString(raw.refNumber) ?? bookingId;
  if (!bookingId || !bookingRef) return null;

  const customer = asRecord(raw.customer);
  const driver = asRecord(raw.driver);
  const driverId = optionalString(driver?.id) ?? optionalString(raw.driverId);
  const paymentSummary = normalizePaymentSummary(raw.paymentSummary);
  const payment = normalizePaymentSummary(raw.payment) ?? paymentSummary;

  return {
    bookingRef,
    bookingId,
    status: optionalString(raw.status) ?? 'driver_assigned',
    scheduledAt: dateStringOrNull(raw.scheduledAt),
    assignedAt: dateStringOrNull(raw.assignedAt),
    acceptedAt: dateStringOrNull(raw.acceptedAt),
    customer: {
      name: optionalString(customer?.name) ?? 'Customer',
      phone: optionalString(customer?.phone),
      address: optionalString(customer?.address),
      lat: coordinateOrNull(customer?.lat, -90, 90),
      lng: coordinateOrNull(customer?.lng, -180, 180),
    },
    driver: {
      id: driverId,
      name: optionalString(driver?.name) ?? 'Driver',
      phone: optionalString(driver?.phone),
      lat: coordinateOrNull(driver?.lat, -90, 90),
      lng: coordinateOrNull(driver?.lng, -180, 180),
      locationAt: dateStringOrNull(driver?.locationAt),
      locationSource: optionalString(driver?.locationSource),
      isStale: Boolean(driver?.isStale),
    },
    paymentSummary,
    payment,
    distanceMiles: numberOrNull(raw.distanceMiles),
    etaMinutes: numberOrNull(raw.etaMinutes),
    driverSituation: normalizeDriverSituation(raw.driverSituation, bookingRef, driverId),
  };
}

export function useActiveJobs(enabled: boolean) {
  const [items, setItems] = useState<ActiveJobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ActiveJobsResponse>('/api/admin/active-jobs');
      if (!aliveRef.current) return;
      const rawJobs = Array.isArray(data?.activeJobs) ? data.activeJobs : [];
      setItems(rawJobs.flatMap((job) => {
        const normalized = normalizeActiveJobItem(job);
        return normalized ? [normalized] : [];
      }));
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!aliveRef.current) return;
      console.warn('[active-jobs] load failed', err);
      setError(err instanceof Error ? err.message : 'Failed to load active jobs');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return () => {
        aliveRef.current = false;
      };
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    void refresh();
    timerRef.current = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, refresh]);

  return { items, loading, error, lastUpdated, refresh };
}
