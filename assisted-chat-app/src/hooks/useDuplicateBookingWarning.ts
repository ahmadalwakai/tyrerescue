import { useMemo } from 'react';
import { useNow } from '@/hooks/useNow';
import type { AssistedChatDraft } from '@/types/assisted-chat';
import type { TodayBookingItem } from './useTodayBookings';
import type { RecentCustomer } from '@/types/assisted-chat';
import { buildBookingTyreLinePayload } from '@/lib/assisted-chat-workflow';

/**
 * Detect possible duplicate bookings purely from local history (today's
 * bookings + recent customers). No server round-trip is performed — the
 * goal is a soft, dismissable warning the operator sees before tapping
 * payment / Send to driver.
 *
 * Match rules:
 *  1. Same customer phone (digits only) when phone is present.
 *  2. Same address + same tyre size.
 *  3. Same coordinates within ~50m and same tyre size.
 *
 * Time window: only items whose `lastUsedAtIso` / `createdAtIso` is within
 * the last 60 minutes are considered.
 */

const WINDOW_MS = 60 * 60 * 1000;

function digits(value: string | undefined | null): string {
  return (value ?? '').replace(/\D+/g, '');
}

function withinWindow(iso: string, now: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return now - t <= WINDOW_MS;
}

function lowerSizes(lines: ReturnType<typeof buildBookingTyreLinePayload>): Set<string> {
  return new Set(lines.map((line) => line.size.trim().toLowerCase()).filter(Boolean));
}

export interface DuplicateBookingMatch {
  source: 'today' | 'recent';
  reason: 'phone' | 'address+size' | 'coords+size';
  bookingReference?: string;
  whenIso: string;
  customerPhone?: string;
  customerAddress?: string;
}

export interface UseDuplicateBookingWarningArgs {
  draft: AssistedChatDraft;
  todayBookings: TodayBookingItem[];
  recentCustomers: RecentCustomer[];
}

export function useDuplicateBookingWarning({
  draft,
  todayBookings,
  recentCustomers,
}: UseDuplicateBookingWarningArgs): DuplicateBookingMatch | null {
  // The duplicate window is wall-clock relative. useMemo only re-runs when
  // its inputs change, so a minute clock is one of them; otherwise a match
  // would keep warning long after it left the 60-minute window.
  const now = useNow(60_000);
  return useMemo(
    () => findDuplicateBooking(draft, todayBookings, recentCustomers, now),
    [draft, todayBookings, recentCustomers, now],
  );
}

/** Pure matcher behind useDuplicateBookingWarning. */
export function findDuplicateBooking(
  draft: AssistedChatDraft,
  todayBookings: TodayBookingItem[],
  recentCustomers: RecentCustomer[],
  now: number,
): DuplicateBookingMatch | null {
  // Once the operator has actually dispatched this draft we don't want to
  // warn against the booking they just created.
  if (draft.dispatchedRefNumber) return null;

  const phone = digits(draft.customer.phone);
  const addr = draft.location.address.trim().toLowerCase();
  const sizes = lowerSizes(buildBookingTyreLinePayload(draft.tyreLines));
  const lat = draft.location.lat;
  const lng = draft.location.lng;

  // Today's bookings (highest signal — same operator session, same day).
  for (const b of todayBookings) {
    if (!withinWindow(b.createdAtIso, now)) continue;
    const bPhone = digits(b.customerPhone);
    if (phone && bPhone && phone === bPhone) {
      return {
        source: 'today',
        reason: 'phone',
        bookingReference: b.bookingReference,
        whenIso: b.createdAtIso,
        customerPhone: b.customerPhone,
        customerAddress: b.customerAddress,
      };
    }
    const bAddr = (b.customerAddress ?? '').trim().toLowerCase();
    const bSize = (b.tyreSize ?? '').trim().toLowerCase();
    if (addr && sizes.size > 0 && bAddr && bSize && addr === bAddr && sizes.has(bSize)) {
      return {
        source: 'today',
        reason: 'address+size',
        bookingReference: b.bookingReference,
        whenIso: b.createdAtIso,
        customerPhone: b.customerPhone,
        customerAddress: b.customerAddress,
      };
    }
  }

  // Recent customers (broader — covers prior sessions within the window).
  for (const r of recentCustomers) {
    if (!withinWindow(r.lastUsedAtIso, now)) continue;
    const rPhone = digits(r.customerPhone);
    if (phone && rPhone && phone === rPhone) {
      return {
        source: 'recent',
        reason: 'phone',
        bookingReference: r.lastBookingReference,
        whenIso: r.lastUsedAtIso,
        customerPhone: r.customerPhone,
        customerAddress: r.customerAddress,
      };
    }
    const rAddr = (r.customerAddress ?? '').trim().toLowerCase();
    const rSizes = lowerSizes(r.tyreLines?.length ? buildBookingTyreLinePayload(r.tyreLines) : []);
    const rSize = (r.tyreSize ?? '').trim().toLowerCase();
    if (rSize) rSizes.add(rSize);
    const hasSizeOverlap = [...sizes].some((size) => rSizes.has(size));
    if (addr && sizes.size > 0 && rAddr && rSizes.size > 0 && addr === rAddr && hasSizeOverlap) {
      return {
        source: 'recent',
        reason: 'address+size',
        bookingReference: r.lastBookingReference,
        whenIso: r.lastUsedAtIso,
        customerPhone: r.customerPhone,
        customerAddress: r.customerAddress,
      };
    }
    if (lat != null && lng != null && r.lat != null && r.lng != null && hasSizeOverlap) {
      const meters = Math.hypot((lat - r.lat) * 111_000, (lng - r.lng) * 63_000);
      if (meters <= 50) {
        return {
          source: 'recent',
          reason: 'coords+size',
          bookingReference: r.lastBookingReference,
          whenIso: r.lastUsedAtIso,
          customerPhone: r.customerPhone,
          customerAddress: r.customerAddress,
        };
      }
    }
  }
  return null;
}
