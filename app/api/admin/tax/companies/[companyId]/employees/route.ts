import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { createEmployeeSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import { createEmployee, listEmployees, EmployeeServiceError } from '@/lib/tax-payroll/employee-service';
import { canReadPayroll, canWriteEmployee } from '@/lib/tax-payroll/permissions';
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
    const employees = await listEmployees(companyId);
    return NextResponse.json({ employees });
  } catch (err) {
    console.error('[payroll/employees GET]', err);
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

  if (!(await canWriteEmployee(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400 });
  }

  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const employee = await createEmployee(session.user.id, companyId, parsed.data);
    return NextResponse.json(employee, { status: 201 });
  } catch (err) {
    if (err instanceof EmployeeServiceError) {
      if (err.code === 'CONFLICT_DUPLICATE') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_DUPLICATE' }, { status: 409 });
      }
      if (err.code === 'ENCRYPTION_UNAVAILABLE') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'INTERNAL' }, { status: 503 });
      }
    }
    console.error('[payroll/employees POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
