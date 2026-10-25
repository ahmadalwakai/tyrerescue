import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadCompany } from '@/lib/tax-payroll/permissions';
import { checkSubmissionReadiness } from '@/lib/tax-payroll/submission-guard';
import { db } from '@/lib/db';
import { vatReturns } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; returnId: string }>;
}
const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
const noEvidence = 'This VAT draft has no reconciled transaction evidence. A zero VAT bill cannot be confirmed.';

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, returnId } = await context.params;
  if (![companyId, returnId].every((id) => z.string().uuid().safeParse(id).success)) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const [vatReturn] = await db
    .select()
    .from(vatReturns)
    .where(and(eq(vatReturns.id, returnId), eq(vatReturns.companyId, companyId)))
    .limit(1);

  if (!vatReturn) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  if (vatReturn.transactionCount <= 0) return NextResponse.json({ vatReturn: null, calculationStatus: 'no_data', hmrcVerified: false, message: noEvidence }, { headers: privateHeaders });
  return NextResponse.json({ vatReturn, calculationStatus: 'unverified_draft', hmrcVerified: false }, { headers: privateHeaders });
}

// GET submission readiness for this VAT return
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, returnId } = await context.params;
  if (![companyId, returnId].every((id) => z.string().uuid().safeParse(id).success)) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const [vatReturn] = await db.select().from(vatReturns)
      .where(and(eq(vatReturns.id, returnId), eq(vatReturns.companyId, companyId))).limit(1);
    if (!vatReturn) return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404, headers: privateHeaders });
    if (vatReturn.transactionCount <= 0) return NextResponse.json({ error: noEvidence, code: 'VALIDATION_ERROR', calculationStatus: 'no_data', guard: { canSubmit: false } }, { status: 422, headers: privateHeaders });
    const guard = await checkSubmissionReadiness(companyId, { type: 'vat_return', returnId });
    return NextResponse.json({
      message: 'VAT MTD submission is not yet enabled. Complete HMRC OAuth authorisation to proceed.',
      guard,
    }, { headers: privateHeaders });
  } catch (err) {
    console.error('[vat/returns/:id POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
