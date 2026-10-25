import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminMobile } from '@/lib/auth';
import { canReadCompany, canWriteCompany } from '@/lib/tax-payroll/permissions';
import { CorporationTaxEstimateError, getCtPeriod, updateCtEstimate, verifiedCtEstimate } from '@/lib/tax-payroll/corporation-tax-estimate';

interface RouteContext { params: Promise<{ companyId: string; periodId: string }> }
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const jsonError = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status, headers });
const validIds = (companyId: string, periodId: string) => [companyId, periodId].every((id) => z.string().uuid().safeParse(id).success);
function failure(error: unknown) {
  if (error instanceof CorporationTaxEstimateError) return jsonError(error.message, error.code,
    error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT_VERSION' ? 409 : 422);
  return jsonError('The accounting period could not be verified. Please retry.', 'INTERNAL', 503);
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); }
  catch { return jsonError('Unauthorized', 'UNAUTHENTICATED', 401); }
  try {
    const { companyId, periodId } = await context.params;
    if (!validIds(companyId, periodId) || !await canReadCompany(session.user.id, companyId)) return jsonError('Not found', 'NOT_FOUND', 404);
    const period = await getCtPeriod(companyId, periodId);
    if (!verifiedCtEstimate(period)) {
      return NextResponse.json({ period: null, calculationStatus: 'no_data', hmrcVerified: false,
        periodDetails: { id: period.id, periodStart: period.periodStart, periodEnd: period.periodEnd, status: period.status, version: period.version },
        message: 'No verified accounting-input estimate is recorded. Default or historical zeros are not a confirmed Corporation Tax bill.',
      }, { headers });
    }
    return NextResponse.json({ period, calculationStatus: 'estimate', hmrcVerified: false,
      message: 'Draft estimate from manually confirmed accounting inputs; not an HMRC balance or monthly payment demand.',
    }, { headers });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session = await requireAdminMobile(request); }
  catch { return jsonError('Unauthorized', 'UNAUTHENTICATED', 401); }
  try {
    const { companyId, periodId } = await context.params;
    if (!validIds(companyId, periodId) || !await canWriteCompany(session.user.id, companyId)) return jsonError('Not found', 'NOT_FOUND', 404);
    let raw: unknown;
    try { raw = await request.json(); }
    catch { return jsonError('Invalid JSON body', 'VALIDATION_ERROR', 400); }
    return NextResponse.json(await updateCtEstimate(session.user.id, companyId, periodId, raw), { headers });
  } catch (error) { return failure(error); }
}
