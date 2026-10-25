import 'server-only';

/**
 * Review and submission state machine for payroll and tax returns.
 *
 * State transitions (enforced by this service):
 *
 *   PAYROLL RUN:
 *     draft → submitted_for_review → approved → finalised
 *                                  ↘ rejected → draft
 *     approved → submitted_for_review (explicit request for a fresh review)
 *
 *   TAX RETURN (VAT / CT):
 *     draft → submitted_for_review → approved → submitted_to_hmrc
 *                                  ↘ rejected → draft
 *
 * Payroll permits an authorised submitter to explicitly review their own run.
 * VAT and Corporation Tax reviews still require a different reviewer.
 * Approvals are recorded with actorUserId and timestamp.
 * All transitions create an audit event.
 */

import { db } from '@/lib/db';
import { withTaxWriteTransaction } from './write-transaction';
import { preparePayrollRunCalculation } from './payroll-run-calculation';
import {
  payrollRuns,
  taxReviews,
  taxAuditEvents,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewEntityType = 'payroll_run' | 'vat_return' | 'corporation_tax_return';

export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export interface ReviewRecord {
  id: string;
  companyId: string;
  entityType: ReviewEntityType;
  entityId: string;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  status: ReviewStatus;
  notes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  version: number;
}

export type ReviewAction = 'approve' | 'reject';

export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'WRONG_STATUS'
      | 'SELF_REVIEW'
      | 'CONFLICT_VERSION'
      | 'RUN_NOT_IN_REVIEW_STATE'
      | 'CALCULATION_BLOCKED'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

// ─── Submit for review ────────────────────────────────────────────────────────

export async function submitForReview(
  actorUserId: string,
  companyId: string,
  entityType: ReviewEntityType,
  entityId: string,
  entityExpectedVersion: number,
): Promise<ReviewRecord> {
  return withTaxWriteTransaction(async (tx) => {
    let calculationInputHash: string | null = null;
    // For payroll runs: advance run status to 'submitted_for_review'
    if (entityType === 'payroll_run') {
      const [run] = await tx
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.id, entityId), eq(payrollRuns.companyId, companyId)))
        .for('update');

      if (!run) throw new ReviewError('Pay run not found', 'NOT_FOUND');

      if (!['draft', 'approved'].includes(run.runStatus)) {
        throw new ReviewError(
          `Only a draft or approved pay run can be submitted for a fresh review. Current: ${run.runStatus}`,
          'RUN_NOT_IN_REVIEW_STATE',
        );
      }

      if (run.version !== entityExpectedVersion) {
        throw new ReviewError(
          `Version conflict: expected ${entityExpectedVersion}, got ${run.version}`,
          'CONFLICT_VERSION',
        );
      }

      const calculation = await preparePayrollRunCalculation(tx, companyId, entityId);
      if (calculation.dto.status !== 'ready') {
        throw new ReviewError('Resolve the payroll calculation issues before submitting for review.', 'CALCULATION_BLOCKED');
      }
      calculationInputHash = calculation.inputHash;

      const [submitted] = await tx
        .update(payrollRuns)
        .set({ runStatus: 'submitted_for_review', version: run.version + 1, updatedAt: new Date() })
        .where(and(eq(payrollRuns.id, entityId), eq(payrollRuns.companyId, companyId), eq(payrollRuns.runStatus, run.runStatus), eq(payrollRuns.version, entityExpectedVersion))).returning();
      if (!submitted) throw new ReviewError('Concurrent pay run update.', 'CONFLICT_VERSION');
    }

    // Create review record
    const { randomUUID } = await import('crypto');
    const reviewId = randomUUID();
    const [createdReview] = await tx.insert(taxReviews).values({
      id: reviewId,
      companyId,
      entityType,
      entityId,
      submittedByUserId: actorUserId,
      reviewedByUserId: null,
      status: 'pending',
      notes: null,
      submittedAt: sql`clock_timestamp()`,
      reviewedAt: null,
      version: 1,
      calculationInputHash,
    }).returning({ submittedAt: taxReviews.submittedAt });

  await tx.insert(taxAuditEvents).values({
    companyId,
    eventType: 'review_submitted',
    actorUserId,
    payload: { entityType, entityId, reviewId },
  });

  return {
    id: reviewId,
    companyId,
    entityType,
    entityId,
    submittedByUserId: actorUserId,
    reviewedByUserId: null,
    status: 'pending',
    notes: null,
      submittedAt: createdReview.submittedAt.toISOString(),
    reviewedAt: null,
    version: 1,
  };
  });
}

// ─── Approve or reject ────────────────────────────────────────────────────────

export async function processReview(
  actorUserId: string,
  companyId: string,
  reviewId: string,
  action: ReviewAction,
  expectedVersion: number,
  notes?: string,
): Promise<ReviewRecord> {
  return withTaxWriteTransaction(async (tx) => {
    const [review] = await tx
      .select()
      .from(taxReviews)
      .where(and(eq(taxReviews.id, reviewId), eq(taxReviews.companyId, companyId)))
      .for('update');

    if (!review) throw new ReviewError('Review record not found', 'NOT_FOUND');

    if (review.status !== 'pending') {
      throw new ReviewError(`Review is already ${review.status}`, 'WRONG_STATUS');
    }

    const selfReviewed = review.submittedByUserId === actorUserId;
    if (selfReviewed && review.entityType !== 'payroll_run') {
      throw new ReviewError('Reviewer cannot be the same person who submitted for review', 'SELF_REVIEW');
    }

    if (review.version !== expectedVersion) {
      throw new ReviewError(
        `Version conflict: expected ${expectedVersion}, got ${review.version}`,
        'CONFLICT_VERSION',
      );
    }

    const newStatus: ReviewStatus = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date();

    if (action === 'approve' && review.entityType === 'payroll_run') {
      const calculation = await preparePayrollRunCalculation(tx, companyId, review.entityId);
      if (calculation.dto.status !== 'ready') {
        throw new ReviewError('Resolve the payroll calculation issues before approval.', 'CALCULATION_BLOCKED');
      }
      if (!review.calculationInputHash || review.calculationInputHash !== calculation.inputHash) {
        throw new ReviewError('Payroll inputs changed after submission. Reject and resubmit for review.', 'CONFLICT_VERSION');
      }
    }

    const [updatedReview] = await tx
      .update(taxReviews)
      .set({
        status: newStatus,
        reviewedByUserId: actorUserId,
        notes: notes ?? null,
        reviewedAt: now,
        version: review.version + 1,
        updatedAt: now,
      })
      .where(and(eq(taxReviews.id, reviewId), eq(taxReviews.companyId, companyId), eq(taxReviews.status, 'pending'), eq(taxReviews.version, expectedVersion))).returning();
    if (!updatedReview) throw new ReviewError('Concurrent review update.', 'CONFLICT_VERSION');

    // The run and review move together; a stale review cannot overwrite a
    // finalised/cancelled run or reach a run owned by another company.
    if (review.entityType === 'payroll_run') {
      const [advanced] = await tx.update(payrollRuns).set({
        runStatus: action === 'approve' ? 'approved' : 'draft',
        version: sql`${payrollRuns.version} + 1`, updatedAt: now,
      }).where(and(
        eq(payrollRuns.id, review.entityId), eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.runStatus, 'submitted_for_review'),
      )).returning();
      if (!advanced) throw new ReviewError('Pay run is no longer awaiting review.', 'RUN_NOT_IN_REVIEW_STATE');
    }

    await tx.insert(taxAuditEvents).values({
      companyId,
      eventType: action === 'approve' ? 'review_approved' : 'review_rejected',
      actorUserId,
      payload: { entityType: review.entityType, entityId: review.entityId, reviewId, notes,
        selfReviewed, approvalMode: selfReviewed ? 'self_review' : 'independent_review' },
  });

  return {
    id: reviewId,
    companyId,
    entityType: review.entityType as ReviewEntityType,
    entityId: review.entityId,
    submittedByUserId: review.submittedByUserId,
    reviewedByUserId: actorUserId,
    status: newStatus,
    notes: notes ?? null,
    submittedAt: (review.submittedAt instanceof Date ? review.submittedAt : new Date(review.submittedAt as string)).toISOString(),
    reviewedAt: now.toISOString(),
    version: review.version + 1,
  };
  });
}

// ─── Latest review for an entity ─────────────────────────────────────────────

export async function latestReviewForEntity(
  companyId: string,
  entityId: string,
): Promise<ReviewRecord | null> {
  const [review] = await db
    .select()
    .from(taxReviews)
    .where(and(eq(taxReviews.entityId, entityId), eq(taxReviews.companyId, companyId)))
    .orderBy(desc(taxReviews.submittedAt), desc(taxReviews.id))
    .limit(1);

  if (!review) return null;

  return {
    id: review.id,
    companyId: review.companyId,
    entityType: review.entityType as ReviewEntityType,
    entityId: review.entityId,
    submittedByUserId: review.submittedByUserId,
    reviewedByUserId: review.reviewedByUserId,
    status: review.status as ReviewStatus,
    notes: review.notes,
    submittedAt: (review.submittedAt instanceof Date ? review.submittedAt : new Date(review.submittedAt as string)).toISOString(),
    reviewedAt: review.reviewedAt
      ? (review.reviewedAt instanceof Date ? review.reviewedAt : new Date(review.reviewedAt as string)).toISOString()
      : null,
    version: review.version,
  };
}
