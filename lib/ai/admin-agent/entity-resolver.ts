/* ── Admin Agent – Entity Resolver ────────────────────── */
import { db } from '@/lib/db';
import { bookings, tyreProducts, drivers, users, callMeBack, contactMessages } from '@/lib/db/schema';
import { eq, and, ilike, desc, sql } from 'drizzle-orm';
import type { MemoryEntry } from './memory-manager';

/* ── Types ── */

export interface ResolvedEntity {
  type: 'booking' | 'product' | 'driver' | 'callback' | 'message';
  id: string;
  ref?: string;
  label: string;
  confidence: 'exact' | 'inferred' | 'ambiguous';
}

export interface ResolutionContext {
  recentEntities: { type: string; id: string; ref?: string }[];
  longTermMemory: MemoryEntry[];
}

/* ── Reference patterns ── */

const BOOKING_REF_RE = /\b(TR-?\w{3,})\b/i;
const UUID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;
const TYRE_SIZE_RE = /(\d{3})\/?(\d{2})\/?R?(\d{2})/;
const PRONOUN_RE = /\b(that\s+(?:booking|order)|the\s+(?:last|previous|same)\s+(?:booking|order))\b/i;
const DRIVER_PRONOUN_RE = /\b(that\s+driver|the\s+(?:last|previous|same)\s+driver)\b/i;
const PRODUCT_PRONOUN_RE = /\b(that\s+(?:tyre|tire|product)|the\s+(?:last|previous|same)\s+(?:tyre|tire|product)|the\s+(?:tyre|tire|product)\s+(?:we|I)\s+(?:checked|looked|mentioned))\b/i;
const CUSTOMER_PRONOUN_RE = /\b(that\s+customer|the\s+(?:last|previous|same)\s+customer|the\s+customer\s+(?:I|we)\s+(?:mentioned|discussed))\b/i;

/**
 * Resolve entity references in a user message.
 * Tries: explicit refs → pronouns (using session context) → memory lookup.
 */
export async function resolveEntities(
  message: string,
  context: ResolutionContext,
): Promise<ResolvedEntity[]> {
  const resolved: ResolvedEntity[] = [];

  // 1. Explicit booking ref
  const bookingMatch = message.match(BOOKING_REF_RE);
  if (bookingMatch) {
    const ref = bookingMatch[1].toUpperCase();
    const result = await lookupBookingByRef(ref);
    if (result) resolved.push(result);
  }

  // 2. UUID reference (could be any entity)
  const uuidMatch = message.match(UUID_RE);
  if (uuidMatch && !bookingMatch) {
    const result = await lookupByUUID(uuidMatch[1]);
    if (result) resolved.push(result);
  }

  // 3. Tyre size → resolve to product
  const sizeMatch = message.match(TYRE_SIZE_RE);
  if (sizeMatch) {
    const result = await lookupProductBySize(
      Number(sizeMatch[1]),
      Number(sizeMatch[2]),
      Number(sizeMatch[3]),
    );
    if (result) resolved.push(...result);
  }

  // 4. Pronoun references → resolve from session context
  if (PRONOUN_RE.test(message)) {
    const recent = findRecentByType(context, 'booking');
    if (recent) {
      resolved.push({
        type: 'booking',
        id: recent.id,
        ref: recent.ref,
        label: `Resolved "that booking" → ${recent.ref ?? recent.id.slice(0, 8)}`,
        confidence: 'inferred',
      });
    }
  }

  if (DRIVER_PRONOUN_RE.test(message)) {
    const recent = findRecentByType(context, 'driver');
    if (recent) {
      resolved.push({
        type: 'driver',
        id: recent.id,
        ref: recent.ref,
        label: `Resolved "that driver" → ${recent.ref ?? recent.id.slice(0, 8)}`,
        confidence: 'inferred',
      });
    }
  }

  if (PRODUCT_PRONOUN_RE.test(message)) {
    const recent = findRecentByType(context, 'product');
    if (recent) {
      resolved.push({
        type: 'product',
        id: recent.id,
        ref: recent.ref,
        label: `Resolved "that tyre" → ${recent.ref ?? recent.id.slice(0, 8)}`,
        confidence: 'inferred',
      });
    }
  }

  if (CUSTOMER_PRONOUN_RE.test(message)) {
    const recent = findRecentByType(context, 'booking');
    if (recent) {
      resolved.push({
        type: 'booking',
        id: recent.id,
        ref: recent.ref,
        label: `Resolved "that customer" → booking ${recent.ref ?? recent.id.slice(0, 8)}`,
        confidence: 'inferred',
      });
    }
  }

  return resolved;
}

/**
 * Inject resolved entities into plan params where missing.
 * E.g., if a plan needs a booking ref but the user said "that booking",
 * the entity resolver can fill it in.
 */
export function injectResolvedEntities(
  params: Record<string, unknown>,
  resolved: ResolvedEntity[],
  toolName: string,
): Record<string, unknown> {
  const updated = { ...params };

  // If tool needs a booking ref and it's missing, inject from resolved
  if (!updated.ref && toolName.includes('booking')) {
    const booking = resolved.find((e) => e.type === 'booking');
    if (booking?.ref) {
      updated.ref = booking.ref;
    }
  }

  // If tool needs a productId and it's missing, inject from resolved
  if (!updated.productId && (toolName.includes('stock') || toolName.includes('product') || toolName.includes('availability'))) {
    const product = resolved.find((e) => e.type === 'product');
    if (product) {
      updated.productId = product.id;
    }
  }

  // If tool needs a driverId and it's missing, inject from resolved
  if (!updated.driverId && toolName.includes('driver')) {
    const driver = resolved.find((e) => e.type === 'driver');
    if (driver) {
      updated.driverId = driver.id;
    }
  }

  // If tool needs a callbackId and it's missing
  if (!updated.callbackId && toolName.includes('callback')) {
    const callback = resolved.find((e) => e.type === 'callback');
    if (callback) {
      updated.callbackId = callback.id;
    }
  }

  return updated;
}

/* ── DB lookups ── */

async function lookupBookingByRef(ref: string): Promise<ResolvedEntity | null> {
  const [row] = await db
    .select({ id: bookings.id, refNumber: bookings.refNumber, customerName: bookings.customerName })
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!row) return null;
  return {
    type: 'booking',
    id: row.id,
    ref: row.refNumber,
    label: `Booking ${row.refNumber} (${row.customerName})`,
    confidence: 'exact',
  };
}

async function lookupByUUID(uuid: string): Promise<ResolvedEntity | null> {
  // Try booking first
  const [bk] = await db
    .select({ id: bookings.id, refNumber: bookings.refNumber })
    .from(bookings)
    .where(eq(bookings.id, uuid))
    .limit(1);
  if (bk) return { type: 'booking', id: bk.id, ref: bk.refNumber, label: `Booking ${bk.refNumber}`, confidence: 'exact' };

  // Try product
  const [prod] = await db
    .select({ id: tyreProducts.id, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
    .from(tyreProducts)
    .where(eq(tyreProducts.id, uuid))
    .limit(1);
  if (prod) return { type: 'product', id: prod.id, ref: prod.sizeDisplay, label: `${prod.brand} ${prod.sizeDisplay}`, confidence: 'exact' };

  // Try driver
  const [drv] = await db
    .select({ id: drivers.id, userId: drivers.userId })
    .from(drivers)
    .where(eq(drivers.id, uuid))
    .limit(1);
  if (drv) return { type: 'driver', id: drv.id, label: `Driver ${drv.id.slice(0, 8)}`, confidence: 'exact' };

  return null;
}

async function lookupProductBySize(
  width: number,
  aspect: number,
  rim: number,
): Promise<ResolvedEntity[]> {
  const rows = await db
    .select({ id: tyreProducts.id, brand: tyreProducts.brand, sizeDisplay: tyreProducts.sizeDisplay })
    .from(tyreProducts)
    .where(
      and(
        eq(tyreProducts.width, width),
        eq(tyreProducts.aspect, aspect),
        eq(tyreProducts.rim, rim),
        eq(tyreProducts.availableNew, true),
      ),
    )
    .limit(10);

  return rows.map((r) => ({
    type: 'product' as const,
    id: r.id,
    ref: r.sizeDisplay,
    label: `${r.brand} ${r.sizeDisplay}`,
    confidence: rows.length === 1 ? 'exact' as const : 'ambiguous' as const,
  }));
}

/* ── Context helpers ── */

function findRecentByType(
  context: ResolutionContext,
  type: string,
): { id: string; ref?: string } | null {
  // Check session entities first (most recent)
  const sessionMatch = context.recentEntities.find((e) => {
    if (type === 'booking') return e.type.includes('booking') || e.ref?.startsWith('TR');
    if (type === 'driver') return e.type.includes('driver');
    if (type === 'product') return e.type.includes('stock') || e.type.includes('product') || e.type.includes('inventory');
    if (type === 'callback') return e.type.includes('callback');
    return false;
  });
  if (sessionMatch) return sessionMatch;

  // Check long-term memory
  const memoryMatch = context.longTermMemory.find((m) =>
    m.kind === 'entity_ref' && m.entityType === type,
  );
  if (memoryMatch?.entityId) {
    return { id: memoryMatch.entityId, ref: memoryMatch.entityRef ?? undefined };
  }

  return null;
}
