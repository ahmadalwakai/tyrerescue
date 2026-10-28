import { useEffect, useState } from 'react';
import { api, getApiContextRevision } from '@/lib/api';
import { getAdminSessionRevision } from './useAdminSession';

export interface BookingSlot {
  slotId: string;
  date: string;
  label: string;
  timeStart: string;
  timeEnd: string;
}

export function parseBookingSlots(value: unknown, date: string): BookingSlot[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { slots?: unknown }).slots)) {
    throw new Error('Available appointment times could not be read. Please retry.');
  }
  const slots = (value as { slots: unknown[] }).slots;
  if (slots.length > 100) throw new Error('Too many appointment times were returned. Please retry.');
  return slots.flatMap((entry): BookingSlot[] => {
    if (!entry || typeof entry !== 'object') throw new Error('An appointment time could not be read.');
    const slot = entry as Record<string, unknown>;
    if (slot.date !== date || typeof slot.slotId !== 'string' || !slot.slotId
      || typeof slot.label !== 'string' || !slot.label || slot.label.length > 100
      || typeof slot.timeStart !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.timeStart)
      || typeof slot.timeEnd !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.timeEnd)) {
      throw new Error('An appointment time could not be read. Please retry.');
    }
    if (slot.available !== true || slot.active !== true || typeof slot.spotsLeft !== 'number' || slot.spotsLeft <= 0) return [];
    return [{ slotId: slot.slotId, date, label: slot.label, timeStart: slot.timeStart, timeEnd: slot.timeEnd }];
  });
}

interface SlotState {
  key: string;
  slots: BookingSlot[];
  error: string | null;
}

/** Availability is advisory; booking confirmation checks capacity again under a lock. */
export function useBookingSlots(date: string, enabled: boolean, projectId?: string | null) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<SlotState | null>(null);
  const apiRevision = getApiContextRevision();
  const sessionRevision = getAdminSessionRevision();
  const authenticated = api.hasAdminToken;
  const key = `${projectId ?? 'tyrerescue'}:${apiRevision}:${sessionRevision}:${date}:${retry}`;
  useEffect(() => {
    if (!enabled || !authenticated) return undefined;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && api.hasAdminToken
      && apiRevision === getApiContextRevision() && sessionRevision === getAdminSessionRevision();
    void api.get<unknown>(`/api/availability/slots?date=${encodeURIComponent(date)}`, {
      signal: controller.signal, timeoutMs: 12_000,
    }).then((response) => {
      if (!isCurrent()) return;
      setState({ key, slots: parseBookingSlots(response, date), error: null });
    }).catch((error) => {
      if (!isCurrent()) return;
      setState({ key, slots: [], error: error instanceof Error ? error.message : 'Could not load appointment times. Please retry.' });
    });
    return () => controller.abort();
  }, [apiRevision, authenticated, date, enabled, key, sessionRevision]);

  const current = enabled && state?.key === key ? state : null;
  return {
    slots: current?.slots ?? [],
    loading: enabled && authenticated && !current,
    error: enabled && !authenticated ? 'Sign in to load appointment times.' : current?.error ?? null,
    refresh: () => setRetry((value) => value + 1),
  };
}
