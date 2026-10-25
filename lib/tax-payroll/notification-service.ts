import 'server-only';

/**
 * In-app notification service for tax & payroll events.
 *
 * Stores notifications in the database only.
 * Does NOT send SMS, email, WhatsApp, push, or any external notifications.
 *
 * Notifications are read via the /api/tax/notifications endpoint and
 * displayed in the iOS Tax module.
 */

import { db } from '@/lib/db';
import {
  taxNotifications,
  taxAuditEvents,
} from '@/lib/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationKind =
  | 'payroll_run_submitted_for_review'
  | 'payroll_run_approved'
  | 'payroll_run_rejected'
  | 'payroll_run_finalised'
  | 'payslips_ready'
  | 'vat_return_due'
  | 'vat_return_submitted'
  | 'corporation_tax_due'
  | 'fps_draft_ready'
  | 'review_required'
  | 'pension_enrolment_action_required'
  | 'tax_year_end_approaching';

export type NotificationSeverity = 'info' | 'warning' | 'action_required';

export interface TaxNotification {
  id: string;
  companyId: string;
  recipientUserId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createNotification(
  companyId: string,
  recipientUserId: string,
  kind: NotificationKind,
  severity: NotificationSeverity,
  title: string,
  body: string,
  entityType?: string,
  entityId?: string,
): Promise<TaxNotification> {
  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  const now = new Date();

  await db.insert(taxNotifications).values({
    id,
    companyId,
    recipientUserId,
    kind,
    severity,
    title,
    body,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    readAt: null,
    createdAt: now,
  });

  return {
    id,
    companyId,
    recipientUserId,
    kind,
    severity,
    title,
    body,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    readAt: null,
    createdAt: now.toISOString(),
  };
}

// ─── Convenience creators ─────────────────────────────────────────────────────

export async function notifyPayrollSubmittedForReview(
  companyId: string,
  reviewerUserId: string,
  runId: string,
  runPeriodLabel: string,
): Promise<void> {
  await createNotification(
    companyId,
    reviewerUserId,
    'payroll_run_submitted_for_review',
    'action_required',
    'Payroll awaiting review',
    `Payroll run for ${runPeriodLabel} has been submitted for review.`,
    'payroll_run',
    runId,
  );
}

export async function notifyPayrollApproved(
  companyId: string,
  submitterUserId: string,
  runId: string,
  runPeriodLabel: string,
): Promise<void> {
  await createNotification(
    companyId,
    submitterUserId,
    'payroll_run_approved',
    'info',
    'Payroll run approved',
    `Payroll run for ${runPeriodLabel} has been approved and is ready for finalisation.`,
    'payroll_run',
    runId,
  );
}

export async function notifyPayrollRejected(
  companyId: string,
  submitterUserId: string,
  runId: string,
  runPeriodLabel: string,
  reason?: string,
): Promise<void> {
  await createNotification(
    companyId,
    submitterUserId,
    'payroll_run_rejected',
    'warning',
    'Payroll run returned for correction',
    reason
      ? `Payroll run for ${runPeriodLabel} was rejected: ${reason}`
      : `Payroll run for ${runPeriodLabel} was returned for correction.`,
    'payroll_run',
    runId,
  );
}

export async function notifyPayrollFinalised(
  companyId: string,
  recipientUserId: string,
  runId: string,
  runPeriodLabel: string,
  employeeCount: number,
): Promise<void> {
  await createNotification(
    companyId,
    recipientUserId,
    'payroll_run_finalised',
    'info',
    'Payroll finalised',
    `Payroll run for ${runPeriodLabel} has been finalised. Payslips generated for ${employeeCount} employee${employeeCount !== 1 ? 's' : ''}.`,
    'payroll_run',
    runId,
  );
}

export async function notifyVatReturnDue(
  companyId: string,
  recipientUserId: string,
  periodKey: string,
  dueDate: string,
): Promise<void> {
  await createNotification(
    companyId,
    recipientUserId,
    'vat_return_due',
    'action_required',
    'VAT Return due',
    `VAT Return for period ${periodKey} is due by ${dueDate}.`,
    'vat_return',
    periodKey,
  );
}

// ─── Read / dismiss ───────────────────────────────────────────────────────────

export async function listNotificationsForUser(
  companyId: string,
  recipientUserId: string,
  unreadOnly = false,
): Promise<TaxNotification[]> {
  const rows = await db
    .select()
    .from(taxNotifications)
    .where(
      and(
        eq(taxNotifications.companyId, companyId),
        eq(taxNotifications.recipientUserId, recipientUserId),
        ...(unreadOnly ? [isNull(taxNotifications.readAt)] : []),
      ),
    )
    .orderBy(desc(taxNotifications.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    recipientUserId: r.recipientUserId,
    kind: r.kind as NotificationKind,
    severity: r.severity as NotificationSeverity,
    title: r.title,
    body: r.body,
    entityType: r.entityType,
    entityId: r.entityId,
    readAt: r.readAt ? (r.readAt instanceof Date ? r.readAt : new Date(r.readAt as string)).toISOString() : null,
    createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt as string)).toISOString(),
  }));
}

export async function markNotificationRead(
  companyId: string,
  recipientUserId: string,
  notificationId: string,
): Promise<void> {
  await db
    .update(taxNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(taxNotifications.id, notificationId),
        eq(taxNotifications.companyId, companyId),
        eq(taxNotifications.recipientUserId, recipientUserId),
      ),
    );
}
