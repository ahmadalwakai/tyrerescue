import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { createPayTermsSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import { createPayTerms, listPayTerms, PayTermsServiceError } from '@/lib/tax-payroll/pay-terms-service';
import { canReadPayroll, canWriteEmployee } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; employeeId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, employeeId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const payTerms = await listPayTerms(companyId, employeeId);
    return NextResponse.json({ payTerms });
  } catch (err) {
    console.error('[payroll/pay-terms GET]', err);
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

  const { companyId, employeeId } = await context.params;

  if (!(await canWriteEmployee(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = createPayTermsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const payTerms = await createPayTerms(session.user.id, companyId, employeeId, parsed.data);
    return NextResponse.json(payTerms, { status: 201 });
  } catch (err) {
    if (err instanceof PayTermsServiceError) {
      if (err.code === 'CONFLICT_OVERLAP') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_DUPLICATE' }, { status: 409 });
      }
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
    }
    console.error('[payroll/pay-terms POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
