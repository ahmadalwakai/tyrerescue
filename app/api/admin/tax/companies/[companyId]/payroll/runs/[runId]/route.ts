import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { upsertRunLinesSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import {
  getPayrollRun,
  upsertRunLines,
  cancelPayrollRun,
  PayrollDraftError,
} from '@/lib/tax-payroll/payroll-draft-service';
import { canReadPayroll, canWriteDraft } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

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
    const run = await getPayrollRun(companyId, runId);
    if (!run) {
      return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error('[payroll/runs/:id GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// PATCH replaces all lines for one employee in this run.
export async function PATCH(request: Request, context: RouteContext) {
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

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = upsertRunLinesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const lines = await upsertRunLines(session.user.id, companyId, runId, parsed.data);
    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof PayrollDraftError) {
      if (err.code === 'CONFLICT_VERSION') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      }
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      if (err.code === 'WRONG_STATUS') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      }
    }
    console.error('[payroll/runs/:id PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// DELETE cancels the draft run.
export async function DELETE(request: Request, context: RouteContext) {
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

  try {
    await cancelPayrollRun(session.user.id, companyId, runId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof PayrollDraftError) {
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      if (err.code === 'WRONG_STATUS') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      }
    }
    console.error('[payroll/runs/:id DELETE]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
