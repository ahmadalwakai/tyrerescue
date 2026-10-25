import 'server-only';

import { db } from '@/lib/db';
import {
  taxAuditEvents,
  type NewTaxAuditEvent,
} from '@/lib/db/schema';
import { eq, lt, desc, and } from 'drizzle-orm';
import type { TaxAuditEventDto, TaxAuditPageDto, TaxAuditEventType } from './contracts';
import type { TaxWriteTransaction } from './write-transaction';

const PAGE_SIZE = 25;

// Accepts both the full db client and a Drizzle transaction object.
type InsertExecutor = Pick<typeof db, 'insert'> | Pick<TaxWriteTransaction, 'insert'>;

// Insert a single audit event inside an existing transaction context or
// directly against the db proxy. Caller is responsible for atomicity.
export async function insertAuditEvent(
  tx: InsertExecutor,
  params: {
    companyId: string;
    eventType: TaxAuditEventType;
    actorUserId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const row: NewTaxAuditEvent = {
    companyId: params.companyId,
    eventType: params.eventType,
    actorUserId: params.actorUserId,
    payload: params.payload,
  };
  await tx.insert(taxAuditEvents).values(row);
}

function buildSummary(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'company_created':
      return `Company profile created`;
    case 'profile_updated': {
      const fields = Array.isArray(payload.changedFields)
        ? (payload.changedFields as string[]).join(', ')
        : 'unknown fields';
      return `Profile updated: ${fields}`;
    }
    case 'registration_declared': {
      const svc = typeof payload.taxService === 'string' ? payload.taxService : 'unknown';
      const status = typeof payload.status === 'string' ? payload.status : 'unknown';
      return `${svc.replace('_', ' ')} registration declared as ${status}`;
    }
    case 'hmrc_payment_recorded':
      return 'PAYE payment recorded manually (receipt not verified by HMRC)';
    case 'hmrc_adjustment_recorded':
      return 'PAYE liability adjustment recorded manually';
    case 'hmrc_payment_voided':
      return 'Manual PAYE payment record voided (original record retained)';
    case 'hmrc_adjustment_voided':
      return 'Manual PAYE adjustment voided (original record retained)';
    case 'review_approved':
      return payload.entityType === 'payroll_run' && payload.selfReviewed === true
        ? 'Payroll approved by the same administrator who submitted it'
        : eventType;
    case 'review_rejected':
      return payload.entityType === 'payroll_run' && payload.selfReviewed === true
        ? 'Payroll rejected by the same administrator who submitted it'
        : eventType;
    default:
      return eventType;
  }
}

function toDto(row: {
  id: string;
  companyId: string;
  eventType: string;
  actorUserId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}): TaxAuditEventDto {
  const eventType = row.eventType as TaxAuditEventType;
  const changedFields =
    Array.isArray(row.payload.changedFields)
      ? (row.payload.changedFields as string[])
      : null;
  return {
    id: row.id,
    companyId: row.companyId,
    eventType,
    actorUserId: row.actorUserId,
    summary: buildSummary(eventType, row.payload),
    changedFields,
    createdAt: row.createdAt.toISOString(),
  };
}

// Cursor-paginated list of audit events for a company, newest first.
// cursor is the ISO timestamp of the oldest event returned in the previous page.
export async function listAuditEvents(
  companyId: string,
  cursor?: string,
): Promise<TaxAuditPageDto> {
  const conditions = [eq(taxAuditEvents.companyId, companyId)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (!isNaN(cursorDate.getTime())) {
      conditions.push(lt(taxAuditEvents.createdAt, cursorDate));
    }
  }

  const rows = await db
    .select()
    .from(taxAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(taxAuditEvents.createdAt))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  return {
    events: page.map(toDto),
    nextCursor,
  };
}
