import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { MonthlyLiabilityError, voidPayrollHmrcRecord } from './monthly-liability-service';

export const PRIVATE_TAX_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' };

export function monthlyLiabilityErrorResponse(error: unknown): NextResponse {
  if (error instanceof MonthlyLiabilityError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'PAYROLL_ACCESS_REQUIRED' ? 403 : error.code === 'CONFLICT_DUPLICATE' ? 409 : 422;
    return NextResponse.json({ error: error.message, code: error.code }, { status, headers: PRIVATE_TAX_HEADERS });
  }
  // Do not log payroll amounts, payment references or tax credentials.
  return NextResponse.json({ error: 'Unable to load or save payroll records. Please retry.', code: 'INTERNAL' }, {
    status: 503, headers: PRIVATE_TAX_HEADERS,
  });
}

export async function voidPayrollRecordHttp(
  request: Request,
  context: { params: Promise<{ companyId: string; recordId: string }> },
  kind: 'payments' | 'adjustments',
) {
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
    const { companyId, recordId } = await context.params;
    return NextResponse.json(await voidPayrollHmrcRecord(session.user.id, companyId, kind, recordId, raw), { headers: PRIVATE_TAX_HEADERS });
  } catch (error) { return monthlyLiabilityErrorResponse(error); }
}
