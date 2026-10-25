import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadCompany } from '@/lib/tax-payroll/permissions';
import { computeTrialBalance, provisionSystemAccounts } from '@/lib/tax-payroll/accounting-service';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  if (!(await canReadCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const url = new URL(request.url);
  const asOf = url.searchParams.get('asOf') ?? undefined;

  try {
    const trialBalance = await computeTrialBalance(companyId, asOf);
    return NextResponse.json(trialBalance);
  } catch (err) {
    console.error('[ledger/trial-balance GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// POST: provision system accounts (idempotent)
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId } = await context.params;

  const { canWriteCompany } = await import('@/lib/tax-payroll/permissions');
  if (!(await canWriteCompany(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    await provisionSystemAccounts(companyId, session.user.id);
    return NextResponse.json({ provisioned: true });
  } catch (err) {
    console.error('[ledger/trial-balance POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
