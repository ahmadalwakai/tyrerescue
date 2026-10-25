import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { updateEmployeeSchema, flattenZodErrors } from '@/lib/tax-payroll/validation';
import { getEmployee, updateEmployee, EmployeeServiceError } from '@/lib/tax-payroll/employee-service';
import { canReadPayroll, canWriteEmployee, canReadSensitive } from '@/lib/tax-payroll/permissions';
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
    const includeSensitive = await canReadSensitive(session.user.id, companyId);
    const employee = await getEmployee(companyId, employeeId, includeSensitive);
    if (!employee) {
      return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json(employee);
  } catch (err) {
    console.error('[payroll/employees/:id GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<TaxApiError>(
      { error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) },
      { status: 422 },
    );
  }

  try {
    const updated = await updateEmployee(session.user.id, companyId, employeeId, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof EmployeeServiceError) {
      if (err.code === 'CONFLICT_VERSION') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'CONFLICT_VERSION' }, { status: 409 });
      }
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      if (err.code === 'ENCRYPTION_UNAVAILABLE') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'INTERNAL' }, { status: 503 });
      }
    }
    console.error('[payroll/employees/:id PATCH]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
