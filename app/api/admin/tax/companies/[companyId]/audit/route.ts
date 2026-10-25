import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { listAuditEvents } from '@/lib/tax-payroll/audit-service';
import { canReadCompany } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

// GET /api/admin/tax/companies/[companyId]/audit
// Returns a cursor-paginated list of audit events for the company.
// Query params: cursor (ISO timestamp of the last event on the previous page)
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  const { companyId } = await context.params;

  const allowed = await canReadCompany(session.user.id, companyId);
  if (!allowed) {
    const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
    return NextResponse.json(body, { status: 404 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;

  try {
    const page = await listAuditEvents(companyId, cursor);
    return NextResponse.json(page);
  } catch (err) {
    console.error('[tax/audit GET]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}
