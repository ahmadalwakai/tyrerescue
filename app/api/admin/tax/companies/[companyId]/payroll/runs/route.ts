import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { createPayrollRunSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import { createPayrollRun, listPayrollRuns, PayrollDraftError } from '@/lib/tax-payroll/payroll-draft-service';
import { canReadPayroll, canWriteDraft } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const runs = await listPayrollRuns(companyId);
    return NextResponse.json({ runs });
  } catch (err) {
    console.error('[payroll/runs GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!(await canWriteDraft(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = createPayrollRunSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const run = await createPayrollRun(session.user.id, companyId, parsed.data);
    return NextResponse.json(run, { status: 201 });
  } catch (err) {
    if (err instanceof PayrollDraftError) {
      if (err.code === 'NOT_ACTIVATED') {
        return NextResponse.json<TaxApiError>({ error: 'Payroll not activated', code: 'NOT_FOUND' }, { status: 422 });
      }
      if (err.code === 'CONFLICT_DUPLICATE') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_DUPLICATE' }, { status: 409 });
      }
    }
    console.error('[payroll/runs POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
