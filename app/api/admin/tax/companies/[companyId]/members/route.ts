import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { changeCompanyMember, listCompanyMembers, companyMemberChangeSchema, CompanyMemberError } from '@/lib/tax-payroll/company-members-service';
import { flattenZodErrors } from '@/lib/tax-payroll/validation';

interface Context { params: Promise<{ companyId: string }> }
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function handler(request: Request, context: Context, write: boolean) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); } catch { return reply({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, 401); }
  const { companyId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return reply({ error: 'Not found', code: 'NOT_FOUND' }, 404);
  }
  try {
    if (!write) return reply(await listCompanyMembers(session.user.id, companyId));
    let raw: unknown;
    try { raw = await request.json(); } catch { return reply({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, 400); }
    const parsed = companyMemberChangeSchema.safeParse(raw);
    if (!parsed.success) return reply({ error: 'Check the administrator email and action.', code: 'VALIDATION_ERROR', fieldErrors: flattenZodErrors(parsed.error) }, 422);
    return reply(await changeCompanyMember(session.user.id, companyId, parsed.data));
  } catch (error) {
    if (error instanceof CompanyMemberError) return reply({ error: error.message, code: error.code }, error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_ACTIVATED' ? 409 : 422);
    return reply({ error: 'Unable to update company access. Please retry.', code: 'INTERNAL' }, 500);
  }
}
export const GET = (request: Request, context: Context) => handler(request, context, false);
export const PATCH = (request: Request, context: Context) => handler(request, context, true);
