import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { recordPayrollHmrcPayment } from '@/lib/tax-payroll/monthly-liability-service';
import { monthlyLiabilityErrorResponse, PRIVATE_TAX_HEADERS } from '@/lib/tax-payroll/monthly-liability-http';

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); }
  catch {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401, headers: PRIVATE_TAX_HEADERS });
  }
  let raw;
  try { raw = await request.json(); }
  catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, { status: 400, headers: PRIVATE_TAX_HEADERS });
  }
  try {
    const { companyId } = await context.params;
    return NextResponse.json(await recordPayrollHmrcPayment(session.user.id, companyId, raw), {
      status: 201, headers: PRIVATE_TAX_HEADERS,
    });
  } catch (error) { return monthlyLiabilityErrorResponse(error); }
}
