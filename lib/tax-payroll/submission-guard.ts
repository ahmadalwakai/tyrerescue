import 'server-only';

/**
 * Submission safety guard.
 *
 * Validates that a tax return or payroll submission meets all pre-flight
 * requirements BEFORE any HMRC API call is made.
 *
 * This guard is the last line of defence against incorrect or premature
 * submissions. All checks must pass before a submission is permitted.
 *
 * Phase 4: builds the guard check list. Actual HMRC submission is gated behind
 * a separate authorisation flag that is NOT set in this phase — so no real
 * submissions will occur.
 *
 * SUBMISSION IS NOT PERMITTED IN THIS PHASE.
 * The `canSubmit` flag will be false for all returns until:
 * 1. HMRC OAuth is configured
 * 2. MTD authorisation is completed per company
 * 3. `HMRC_SUBMISSION_ENABLED=true` is set in production env
 */

import { db } from '@/lib/db';
import {
  payrollRuns,
  taxReviews,
  payrollSettings,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GuardSubject =
  | { type: 'payroll_fps'; runId: string }
  | { type: 'vat_return'; returnId: string }
  | { type: 'corporation_tax'; periodId: string };

export interface GuardCheck {
  name: string;
  passed: boolean;
  reason: string | null;
}

export interface SubmissionGuardResult {
  companyId: string;
  subject: GuardSubject;
  canSubmit: false; // Always false in this phase
  checks: GuardCheck[];
  blockedReason: string;
}

// ─── Guard ────────────────────────────────────────────────────────────────────

export async function checkSubmissionReadiness(
  companyId: string,
  subject: GuardSubject,
): Promise<SubmissionGuardResult> {
  const checks: GuardCheck[] = [];

  // Phase guard — submissions not enabled in this phase
  checks.push({
    name: 'hmrc_submission_enabled',
    passed: false,
    reason: 'HMRC submission is not enabled in this phase. Set HMRC_SUBMISSION_ENABLED=true in production configuration when ready.',
  });

  // PAYE reference check
  const [settings] = await db
    .select()
    .from(payrollSettings)
    .where(eq(payrollSettings.companyId, companyId))
    .limit(1);

  checks.push({
    name: 'paye_reference_configured',
    passed: !!(settings?.payeReference && settings.payeReference.trim().length > 0),
    reason: settings?.payeReference ? null : 'PAYE reference not configured in payroll settings.',
  });

  checks.push({
    name: 'accounts_office_ref_configured',
    passed: !!(settings?.accountsOfficeRef && settings.accountsOfficeRef.trim().length > 0),
    reason: settings?.accountsOfficeRef ? null : 'Accounts Office reference not configured.',
  });

  // Entity-specific checks
  if (subject.type === 'payroll_fps') {
    const [run] = await db
      .select()
      .from(payrollRuns)
      .where(and(eq(payrollRuns.id, subject.runId), eq(payrollRuns.companyId, companyId)))
      .limit(1);

    checks.push({
      name: 'payroll_run_exists',
      passed: !!run,
      reason: run ? null : 'Pay run not found.',
    });

    if (run) {
      checks.push({
        name: 'payroll_run_finalised',
        passed: run.runStatus === 'finalised',
        reason: run.runStatus === 'finalised' ? null : `Pay run must be finalised before FPS submission. Current status: ${run.runStatus}`,
      });

      // Check that an approved review exists
      const [approvedReview] = await db
        .select()
        .from(taxReviews)
        .where(
          and(
            eq(taxReviews.entityId, subject.runId),
            eq(taxReviews.companyId, companyId),
            eq(taxReviews.status, 'approved'),
          ),
        )
        .limit(1);

      checks.push({
        name: 'approved_review_exists',
        passed: !!approvedReview,
        reason: approvedReview ? null : 'No approved review found for this pay run.',
      });
    }
  }

  if (subject.type === 'vat_return') {
    checks.push({
      name: 'mtd_vat_authorised',
      passed: false,
      reason: 'MTD VAT OAuth authorisation is not completed for this company.',
    });
  }

  if (subject.type === 'corporation_tax') {
    checks.push({
      name: 'ct_online_credentials',
      passed: false,
      reason: 'Corporation Tax online filing credentials are not configured.',
    });
  }

  const failedChecks = checks.filter((c) => !c.passed);
  const blockedReason = failedChecks.length > 0
    ? failedChecks.map((c) => c.reason).filter(Boolean).join('; ')
    : 'Submission is not permitted in this phase.';

  return {
    companyId,
    subject,
    canSubmit: false,
    checks,
    blockedReason,
  };
}
