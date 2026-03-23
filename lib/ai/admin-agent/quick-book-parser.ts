/* ── Zyphon – Quick-Book Parser (Phase 3) ─────────────── */

import { db } from '@/lib/db';
import { quickBookings } from '@/lib/db/schema';
import type { BookingPreviewData } from './types';

/* ── Service type mapping (reuse from finalize route) ── */

const SERVICE_MAP: Record<string, string> = {
  fit: 'tyre_replacement',
  repair: 'puncture_repair',
  assess: 'locking_nut_removal',
  tyre_replacement: 'tyre_replacement',
  puncture_repair: 'puncture_repair',
  puncture: 'puncture_repair',
  locking_nut: 'locking_nut_removal',
};

/* ── Parsed quick-book input ─────────────────────────── */

export interface ParsedQuickBookInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceType: string;
  tyreSize?: string;
  tyreCount: number;
  locationAddress?: string;
  locationPostcode?: string;
  scheduledAt?: string;
  notes?: string;
}

/* ── Build booking preview from parsed input ─────────── */

export function buildBookingPreview(
  input: ParsedQuickBookInput,
): BookingPreviewData {
  const serviceType = SERVICE_MAP[input.serviceType] || input.serviceType;

  return {
    id: '', // assigned on persist
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    serviceType,
    tyreSizeDisplay: input.tyreSize,
    quantity: input.tyreCount,
    addressLine: input.locationAddress || input.locationPostcode || 'Location pending',
    scheduledAt: input.scheduledAt,
    estimatedTotal: 0, // price calculated server-side via pricing engine
    status: 'pending_location',
  };
}

/* ── Persist quick booking draft to DB ───────────────── */

export async function persistQuickBookingDraft(
  input: ParsedQuickBookInput,
  adminId: string,
): Promise<{ quickBookingId: string }> {
  const serviceType = Object.keys(SERVICE_MAP).includes(input.serviceType)
    ? input.serviceType
    : 'fit';

  const [created] = await db
    .insert(quickBookings)
    .values({
      adminId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail || null,
      serviceType,
      tyreSize: input.tyreSize || null,
      tyreCount: input.tyreCount,
      locationAddress: input.locationAddress || null,
      locationPostcode: input.locationPostcode || null,
      locationMethod: input.locationPostcode ? 'postcode' : input.locationAddress ? 'address' : 'link',
      status: input.locationAddress || input.locationPostcode ? 'quoted' : 'pending_location',
      notes: input.notes || null,
    })
    .returning({ id: quickBookings.id });

  return { quickBookingId: created.id };
}
