import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import {
  submitForReview,
  processReview,
  latestReviewForEntity,
  ReviewError,
} from '@/lib/tax-payroll/review-service';
import { canWriteDraft, canReadPayroll } from '@/lib/tax-payroll/permissions';
import { submitPayrollReviewSchema, processPayrollReviewSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

// GET: latest review for this run
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const review = await latestReviewForEntity(companyId, runId);
    return NextResponse.json({ review });
  } catch (err) {
    console.error('[payroll/runs/:id/review GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// POST: submit run for review
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  if (!(await canWriteDraft(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = submitPayrollReviewSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json<TaxApiError>({ error: 'Validation failed', code: 'VALIDATION_ERROR',
    fieldErrors: flattenZodErrors(parsed.error) }, { status: 422 });
  const raw = parsed.data;

  try {
    const review = await submitForReview(session.user.id, companyId, 'payroll_run', runId, raw.expectedVersion);
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if (err instanceof ReviewError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      if (err.code === 'CONFLICT_VERSION') return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      if (err.code === 'CALCULATION_BLOCKED') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      if (err.code === 'RUN_NOT_IN_REVIEW_STATE') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    console.error('[payroll/runs/:id/review POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// PATCH: approve or reject
export async function PATCH(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  // Approving/rejecting always requires payroll.settings.write, including when
  // the authorised reviewer is the same person who submitted this payroll run.
  const { canWritePayrollSettings } = await import('@/lib/tax-payroll/permissions');
  if (!(await canWritePayrollSettings(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = processPayrollReviewSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json<TaxApiError>({ error: 'Validation failed', code: 'VALIDATION_ERROR',
    fieldErrors: flattenZodErrors(parsed.error) }, { status: 422 });
  const raw = parsed.data;

  try {
    // This endpoint may act only on payroll reviews, even if another entity
    // happens to share the requested UUID in the generic tax-review table.
    const latestReview = await latestReviewForEntity(companyId, runId);
    if (!latestReview || latestReview.entityType !== 'payroll_run' || latestReview.status !== 'pending') {
      return NextResponse.json<TaxApiError>({ error: 'No pending review found for this run', code: 'NOT_FOUND' }, { status: 404 });
    }
    const review = await processReview(
      session.user.id,
      companyId,
      latestReview.id,
      raw.action,
      raw.expectedVersion,
      raw.notes,
    );
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof ReviewError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      if (err.code === 'SELF_REVIEW') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      if (err.code === 'CONFLICT_VERSION') return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      if (err.code === 'CALCULATION_BLOCKED' || err.code === 'RUN_NOT_IN_REVIEW_STATE') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      if (err.code === 'WRONG_STATUS') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    console.error('[payroll/runs/:id/review PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
