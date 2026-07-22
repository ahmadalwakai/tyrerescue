import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import {
  adminNotifications,
  auditLogs,
  bookings,
  db,
  quickBookings,
  users,
  virtualLandlineInteractions,
} from '@/lib/db';
import { normalizeUkPhoneForMatching } from '@/lib/contact-normalization';
import {
  summarizeVirtualLandlineImportOutcome,
  type VirtualLandlineParsedCall,
  type VirtualLandlineParsedImport,
} from './csv';

export const VIRTUAL_LANDLINE_MAX_CSV_BYTES = 5 * 1024 * 1024;

export interface VirtualLandlineImportSummary {
  imported: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  missedCalls: number;
  missedInteractionIds: string[];
}

export interface VirtualLandlineMatchedCustomer {
  id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: 'user' | 'booking' | 'quick_booking';
}

export function isVirtualLandlineTableMissingError(error: unknown): boolean {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code : '';
  const message = error instanceof Error ? error.message : String(record.message ?? '');
  return code === '42P01' || /virtual_landline_interactions/i.test(message) && /does not exist|relation/i.test(message);
}

export function validateVirtualLandlineCsvFile(file: File | null): string | null {
  if (!file) return 'CSV file is required.';
  if (file.size <= 0) return 'CSV file is empty.';
  if (file.size > VIRTUAL_LANDLINE_MAX_CSV_BYTES) return 'CSV file is too large. Maximum size is 5 MB.';
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const looksLikeCsv =
    name.endsWith('.csv') ||
    type === 'text/csv' ||
    type === 'text/plain' ||
    type === 'text/comma-separated-values' ||
    type === 'application/vnd.ms-excel';
  return looksLikeCsv ? null : 'Only CSV call-history exports are supported.';
}

export function serializeParsedCall(call: VirtualLandlineParsedCall) {
  return {
    ...call,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
  };
}

export function summarizeParsedImport(parsed: VirtualLandlineParsedImport): VirtualLandlineImportSummary {
  return {
    imported: parsed.calls.length,
    skipped: parsed.invalidRows.length + parsed.duplicateRows.length,
    duplicate: parsed.duplicateRows.length,
    invalid: parsed.invalidRows.length,
    missedCalls: parsed.calls.filter((call) => call.direction === 'missed').length,
    missedInteractionIds: [],
  };
}

export async function getExistingVirtualLandlineImportKeys(importKeys: string[]): Promise<Set<string>> {
  if (importKeys.length === 0) return new Set();
  const rows = await db
    .select({ importKey: virtualLandlineInteractions.importKey })
    .from(virtualLandlineInteractions)
    .where(inArray(virtualLandlineInteractions.importKey, importKeys));
  return new Set(rows.map((row) => row.importKey));
}

async function findUserMatchesByPhone(normalizedPhones: string[]): Promise<Map<string, string>> {
  const uniquePhones = [...new Set(normalizedPhones.filter(Boolean))];
  if (uniquePhones.length === 0) return new Map();

  const rows = await db
    .select({
      id: users.id,
      phone: users.phone,
    })
    .from(users)
    .where(isNotNull(users.phone));

  const matches = new Map<string, string>();
  for (const row of rows) {
    const normalized = row.phone ? normalizeUkPhoneForMatching(row.phone) : null;
    if (normalized && uniquePhones.includes(normalized) && !matches.has(normalized)) {
      matches.set(normalized, row.id);
    }
  }
  return matches;
}

export async function importVirtualLandlineCalls(input: {
  parsed: VirtualLandlineParsedImport;
  fileName: string;
  adminId: string;
}): Promise<VirtualLandlineImportSummary> {
  const userMatches = await findUserMatchesByPhone(input.parsed.calls.map((call) => call.customerPhoneNormalized));
  let inserted: Array<{ id: string; importKey: string; direction: string }> = [];

  if (input.parsed.calls.length > 0) {
    inserted = await db.insert(virtualLandlineInteractions).values(
      input.parsed.calls.map((call) => ({
        provider: 'virtual_landline',
        source: 'csv',
        importKey: call.importKey,
        providerCallId: call.providerCallId,
        direction: call.direction,
        callStatus: call.callStatus,
        callerNumberRaw: call.callerNumberRaw,
        destinationNumberRaw: call.destinationNumberRaw,
        callerNumberNormalized: call.callerNumberNormalized,
        destinationNumberNormalized: call.destinationNumberNormalized,
        customerPhoneNormalized: call.customerPhoneNormalized,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        durationSeconds: call.durationSeconds,
        recordingUrl: call.recordingUrl,
        sourceFileName: input.fileName,
        sourceRowNumber: call.sourceRowNumber,
        rawRow: call.rawRow,
        matchedUserId: userMatches.get(call.customerPhoneNormalized) ?? null,
        importedBy: input.adminId,
      })),
    )
      .onConflictDoNothing({ target: virtualLandlineInteractions.importKey })
      .returning({
        id: virtualLandlineInteractions.id,
        importKey: virtualLandlineInteractions.importKey,
        direction: virtualLandlineInteractions.direction,
      });
  }

  return summarizeVirtualLandlineImportOutcome(input.parsed, inserted);
}

function normalizeRawRowKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function extractCostRaw(rawRow: unknown): string | null {
  if (!rawRow || typeof rawRow !== 'object') return null;
  const entries = Object.entries(rawRow as Record<string, unknown>);
  const match = entries.find(([key]) => {
    const normalized = normalizeRawRowKey(key);
    return normalized === 'cost gbp' || normalized === 'cost' || normalized === 'call cost';
  });
  if (!match) return null;
  const value = typeof match[1] === 'string' ? match[1].trim() : String(match[1] ?? '').trim();
  return value ? value : null;
}

function serializeInteraction(row: {
  id: string;
  direction: string;
  callStatus: string;
  callerNumberRaw: string | null;
  destinationNumberRaw: string | null;
  callerNumberNormalized: string | null;
  destinationNumberNormalized: string | null;
  customerPhoneNormalized: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  rawRow: unknown;
  sourceFileName: string | null;
  sourceRowNumber: number;
  reviewed: boolean;
  reviewedAt: Date | null;
  createdAt: Date | null;
  matchedUserId: string | null;
  matchedUserName: string | null;
  matchedUserEmail: string | null;
  matchedUserPhone: string | null;
  linkedBookingId: string | null;
  linkedBookingRef: string | null;
  linkedQuickBookingId: string | null;
  linkedQuickBookingBookingId: string | null;
  linkedQuickBookingCustomerName: string | null;
}) {
  return {
    id: row.id,
    direction: row.direction,
    callStatus: row.callStatus,
    callerNumberRaw: row.callerNumberRaw,
    destinationNumberRaw: row.destinationNumberRaw,
    callerNumberNormalized: row.callerNumberNormalized,
    destinationNumberNormalized: row.destinationNumberNormalized,
    customerPhoneNormalized: row.customerPhoneNormalized,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    costRaw: extractCostRaw(row.rawRow),
    recordingUrl: row.recordingUrl,
    sourceFileName: row.sourceFileName,
    sourceRowNumber: row.sourceRowNumber,
    reviewed: row.reviewed,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    matchedCustomer: row.matchedUserId
      ? {
          id: row.matchedUserId,
          name: row.matchedUserName,
          email: row.matchedUserEmail,
          phone: row.matchedUserPhone,
        }
      : null,
    linkedBooking: row.linkedBookingId
      ? {
          id: row.linkedBookingId,
          refNumber: row.linkedBookingRef,
        }
      : null,
    linkedQuickBooking: row.linkedQuickBookingId
      ? {
          id: row.linkedQuickBookingId,
          bookingId: row.linkedQuickBookingBookingId,
          customerName: row.linkedQuickBookingCustomerName,
        }
      : null,
  };
}

export async function listVirtualLandlineInteractions(input: {
  search: string;
  direction: string;
  reviewed: string;
  limit: number;
  offset: number;
}) {
  const conditions = [];

  if (input.direction && input.direction !== 'all') {
    conditions.push(eq(virtualLandlineInteractions.direction, input.direction));
  }

  if (input.reviewed === 'true') {
    conditions.push(eq(virtualLandlineInteractions.reviewed, true));
  } else if (input.reviewed === 'false') {
    conditions.push(eq(virtualLandlineInteractions.reviewed, false));
  }

  const search = input.search.trim();
  if (search) {
    const term = `%${search}%`;
    const normalizedSearch = normalizeUkPhoneForMatching(search);
    conditions.push(
      or(
        ilike(virtualLandlineInteractions.callerNumberRaw, term),
        ilike(virtualLandlineInteractions.destinationNumberRaw, term),
        ilike(virtualLandlineInteractions.customerPhoneNormalized, normalizedSearch ? `%${normalizedSearch}%` : term),
        ilike(users.name, term),
        ilike(users.email, term),
        ilike(bookings.refNumber, term),
        ilike(bookings.customerName, term),
        ilike(quickBookings.customerName, term),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countRows, missedRows] = await Promise.all([
    db
      .select({
        id: virtualLandlineInteractions.id,
        direction: virtualLandlineInteractions.direction,
        callStatus: virtualLandlineInteractions.callStatus,
        callerNumberRaw: virtualLandlineInteractions.callerNumberRaw,
        destinationNumberRaw: virtualLandlineInteractions.destinationNumberRaw,
        callerNumberNormalized: virtualLandlineInteractions.callerNumberNormalized,
        destinationNumberNormalized: virtualLandlineInteractions.destinationNumberNormalized,
        customerPhoneNormalized: virtualLandlineInteractions.customerPhoneNormalized,
        startedAt: virtualLandlineInteractions.startedAt,
        endedAt: virtualLandlineInteractions.endedAt,
        durationSeconds: virtualLandlineInteractions.durationSeconds,
        recordingUrl: virtualLandlineInteractions.recordingUrl,
        rawRow: virtualLandlineInteractions.rawRow,
        sourceFileName: virtualLandlineInteractions.sourceFileName,
        sourceRowNumber: virtualLandlineInteractions.sourceRowNumber,
        reviewed: virtualLandlineInteractions.reviewed,
        reviewedAt: virtualLandlineInteractions.reviewedAt,
        createdAt: virtualLandlineInteractions.createdAt,
        matchedUserId: users.id,
        matchedUserName: users.name,
        matchedUserEmail: users.email,
        matchedUserPhone: users.phone,
        linkedBookingId: bookings.id,
        linkedBookingRef: bookings.refNumber,
        linkedQuickBookingId: quickBookings.id,
        linkedQuickBookingBookingId: quickBookings.bookingId,
        linkedQuickBookingCustomerName: quickBookings.customerName,
      })
      .from(virtualLandlineInteractions)
      .leftJoin(users, eq(virtualLandlineInteractions.matchedUserId, users.id))
      .leftJoin(bookings, eq(virtualLandlineInteractions.linkedBookingId, bookings.id))
      .leftJoin(quickBookings, eq(virtualLandlineInteractions.linkedQuickBookingId, quickBookings.id))
      .where(whereClause)
      .orderBy(desc(virtualLandlineInteractions.startedAt))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(virtualLandlineInteractions)
      .leftJoin(users, eq(virtualLandlineInteractions.matchedUserId, users.id))
      .leftJoin(bookings, eq(virtualLandlineInteractions.linkedBookingId, bookings.id))
      .leftJoin(quickBookings, eq(virtualLandlineInteractions.linkedQuickBookingId, quickBookings.id))
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(virtualLandlineInteractions)
      .where(and(eq(virtualLandlineInteractions.direction, 'missed'), eq(virtualLandlineInteractions.reviewed, false))),
  ]);

  const totalCount = Number(countRows[0]?.count || 0);
  return {
    items: rows.map(serializeInteraction),
    totalCount,
    pendingMissedCount: Number(missedRows[0]?.count || 0),
  };
}

export async function markVirtualLandlineInteractionReviewed(id: string, adminId: string) {
  const now = new Date();
  const [updated] = await db
    .update(virtualLandlineInteractions)
    .set({
      reviewed: true,
      reviewedAt: now,
      reviewedBy: adminId,
      updatedAt: now,
    })
    .where(eq(virtualLandlineInteractions.id, id))
    .returning({ id: virtualLandlineInteractions.id });

  if (updated) {
    await db
      .update(adminNotifications)
      .set({ isRead: true, readAt: now })
      .where(
        and(
          eq(adminNotifications.entityType, 'virtual_landline'),
          eq(adminNotifications.entityId, id),
          eq(adminNotifications.isRead, false),
        ),
      );

    await db.insert(auditLogs).values({
      action: 'virtual_landline.mark_reviewed',
      entityType: 'virtual_landline_interaction',
      entityId: id,
      actorUserId: adminId,
      actorRole: 'admin',
      afterJson: { reviewed: true },
    });
  }

  return updated ?? null;
}

export async function linkVirtualLandlineInteractionToBooking(input: {
  interactionId: string;
  bookingRef: string;
  adminId: string;
}) {
  const ref = input.bookingRef.trim();
  if (!ref) return { ok: false as const, error: 'Booking reference is required.', status: 400 };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref);
  const [booking] = await db
    .select({ id: bookings.id, refNumber: bookings.refNumber })
    .from(bookings)
    .where(isUuid ? or(eq(bookings.refNumber, ref), eq(bookings.id, ref)) : eq(bookings.refNumber, ref))
    .limit(1);

  if (!booking) return { ok: false as const, error: 'Booking not found.', status: 404 };

  const [updated] = await db
    .update(virtualLandlineInteractions)
    .set({
      linkedBookingId: booking.id,
      reviewed: true,
      reviewedAt: new Date(),
      reviewedBy: input.adminId,
      updatedAt: new Date(),
    })
    .where(eq(virtualLandlineInteractions.id, input.interactionId))
    .returning({ id: virtualLandlineInteractions.id });

  if (!updated) return { ok: false as const, error: 'Interaction not found.', status: 404 };

  await db.insert(auditLogs).values({
    action: 'virtual_landline.link_booking',
    entityType: 'booking',
    entityId: booking.id,
    actorUserId: input.adminId,
    actorRole: 'admin',
    afterJson: {
      interactionId: input.interactionId,
      refNumber: booking.refNumber,
    },
  });

  return { ok: true as const, booking };
}

export async function getVirtualLandlineDraftPrefill(interactionId: string): Promise<{
  phone: string;
  interactionId: string;
  matchedCustomer: VirtualLandlineMatchedCustomer | null;
} | null> {
  const [interaction] = await db
    .select({
      id: virtualLandlineInteractions.id,
      customerPhoneNormalized: virtualLandlineInteractions.customerPhoneNormalized,
      matchedUserId: users.id,
      matchedUserName: users.name,
      matchedUserEmail: users.email,
      matchedUserPhone: users.phone,
    })
    .from(virtualLandlineInteractions)
    .leftJoin(users, eq(virtualLandlineInteractions.matchedUserId, users.id))
    .where(eq(virtualLandlineInteractions.id, interactionId))
    .limit(1);

  if (!interaction?.customerPhoneNormalized) return null;

  if (interaction.matchedUserId) {
    return {
      phone: `+${interaction.customerPhoneNormalized}`,
      interactionId,
      matchedCustomer: {
        id: interaction.matchedUserId,
        name: interaction.matchedUserName,
        email: interaction.matchedUserEmail,
        phone: interaction.matchedUserPhone,
        source: 'user',
      },
    };
  }

  const [bookingMatch] = await db
    .select({
      id: bookings.id,
      name: bookings.customerName,
      email: bookings.customerEmail,
      phone: bookings.customerPhone,
    })
    .from(bookings)
    .where(ilike(bookings.customerPhone, `%${interaction.customerPhoneNormalized.slice(-10)}%`))
    .orderBy(desc(bookings.createdAt))
    .limit(1);

  if (bookingMatch) {
    return {
      phone: `+${interaction.customerPhoneNormalized}`,
      interactionId,
      matchedCustomer: {
        id: bookingMatch.id,
        name: bookingMatch.name,
        email: bookingMatch.email,
        phone: bookingMatch.phone,
        source: 'booking',
      },
    };
  }

  const [quickBookingMatch] = await db
    .select({
      id: quickBookings.id,
      name: quickBookings.customerName,
      email: quickBookings.customerEmail,
      phone: quickBookings.customerPhone,
    })
    .from(quickBookings)
    .where(ilike(quickBookings.customerPhone, `%${interaction.customerPhoneNormalized.slice(-10)}%`))
    .orderBy(desc(quickBookings.createdAt))
    .limit(1);

  return {
    phone: `+${interaction.customerPhoneNormalized}`,
    interactionId,
    matchedCustomer: quickBookingMatch
      ? {
          id: quickBookingMatch.id,
          name: quickBookingMatch.name,
          email: quickBookingMatch.email,
          phone: quickBookingMatch.phone,
          source: 'quick_booking',
        }
      : null,
  };
}
