import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { getTaxPayrollOverview } from '@/lib/tax-payroll/overview-service';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

// GET /api/admin/tax/companies/[companyId]/overview
// Returns setup state, registration statuses, and capability flags.
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    const body: TaxApiError = { error: 'Unauthorized', code: 'UNAUTHENTICATED' };
    return NextResponse.json(body, { status: 401 });
  }

  const { companyId } = await context.params;

  try {
    const overview = await getTaxPayrollOverview(session.user.id, companyId);
    if (!overview) {
      // Either company doesn't exist or user has no membership — return 404
      const body: TaxApiError = { error: 'Not found', code: 'NOT_FOUND' };
      return NextResponse.json(body, { status: 404 });
    }
    return NextResponse.json(overview);
  } catch (err) {
    console.error('[tax/overview GET]', err);
    const body: TaxApiError = { error: 'Internal server error', code: 'INTERNAL' };
    return NextResponse.json(body, { status: 500 });
  }
}
