import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadPayroll, canWriteEmployee } from '@/lib/tax-payroll/permissions';
import { employeeTaxSetupSchema, EmployeeTaxSetupError, getEmployeeTaxSetup, saveEmployeeTaxSetup } from '@/lib/tax-payroll/employee-tax-setup';
import { flattenZodErrors } from '@/lib/tax-payroll/validation';

interface Context { params: Promise<{ companyId: string; employeeId: string }> }
const reply = (value: unknown, status = 200) => NextResponse.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

async function authorised(request: Request, context: Context, write: boolean) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); } catch { return reply({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, 401); }
  const { companyId, employeeId } = await context.params;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(companyId) || !uuid.test(employeeId)) {
    return reply({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  if (!(await (write ? canWriteEmployee : canReadPayroll)(session.user.id, companyId))) {
    return reply({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  return { userId: session.user.id, companyId, employeeId };
}

function failure(error: unknown) {
  if (error instanceof EmployeeTaxSetupError) return reply({ error: error.message, code: error.code },
    error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT_VERSION' ? 409 : 422);
  return reply({ error: 'Unable to access employee tax setup. Please retry.', code: 'INTERNAL' }, 500);
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await authorised(request, context, false);
    if (actor instanceof Response) return actor;
    return reply({ setup: await getEmployeeTaxSetup(actor.companyId, actor.employeeId) });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await authorised(request, context, true);
    if (actor instanceof Response) return actor;
    let raw: unknown;
    try { raw = await request.json(); } catch { return reply({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, 400); }
    const parsed = employeeTaxSetupSchema.safeParse(raw);
    if (!parsed.success) return reply({ error: 'Check the tax setup fields.', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) }, 422);
    return reply({ setup: await saveEmployeeTaxSetup(actor.userId, actor.companyId, actor.employeeId, parsed.data) });
  } catch (error) { return failure(error); }
}
