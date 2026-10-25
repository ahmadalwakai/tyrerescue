import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { getMonthlyPayrollLiability } from '@/lib/tax-payroll/monthly-liability-service';
import { monthlyLiabilityErrorResponse, PRIVATE_TAX_HEADERS } from '@/lib/tax-payroll/monthly-liability-http';

export async function GET(request: Request, context: { params: Promise<{ companyId: string }> }) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); }
  catch {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401, headers: PRIVATE_TAX_HEADERS });
  }
  try {
    const { companyId } = await context.params;
    const date = new URL(request.url).searchParams.get('date') ?? undefined;
    return NextResponse.json(await getMonthlyPayrollLiability(session.user.id, companyId, date), { headers: PRIVATE_TAX_HEADERS });
  } catch (error) { return monthlyLiabilityErrorResponse(error); }
}
