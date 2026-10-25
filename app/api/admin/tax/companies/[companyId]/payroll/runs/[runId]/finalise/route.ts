import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { finalisePayrollRun, FinalisationError } from '@/lib/tax-payroll/payroll-finalisation';
import { canWriteDraft } from '@/lib/tax-payroll/permissions';
import type { TaxApiError, FinaliseRunRequest } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

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

  let raw: FinaliseRunRequest;
  try {
    raw = await request.json() as FinaliseRunRequest;
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  if (!Number.isSafeInteger(raw?.expectedVersion) || raw.expectedVersion < 1) {
    return NextResponse.json<TaxApiError>({ error: 'expectedVersion is required', code: 'VALIDATION_ERROR' }, { status: 422 });
  }

  try {
    const result = await finalisePayrollRun(session.user.id, companyId, runId, raw.expectedVersion);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof FinalisationError) {
      if (err.code === 'NOT_FOUND') return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      if (err.code === 'ALREADY_FINALISED') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 409 });
      if (err.code === 'WRONG_STATUS') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      if (err.code === 'CONFLICT_VERSION') return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      if (err.code === 'CALCULATION_BLOCKED') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      if (err.code === 'NO_APPROVED_REVIEW') return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
    }
    console.error('[payroll/runs/:id/finalise POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
