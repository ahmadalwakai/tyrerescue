import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { calculateDraftPreview, PayrollDraftError } from '@/lib/tax-payroll/payroll-draft-service';
import { canWriteDraft } from '@/lib/tax-payroll/permissions';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

// POST /api/admin/tax/companies/[companyId]/payroll/runs/[runId]/preview
// Calculates a gross-pay preview snapshot for the draft run.
// Tax, NI, and net pay are never calculated — the response carries explicit
// disclaimer fields confirming this.
export async function POST(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  if (!(await canWriteDraft(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const preview = await calculateDraftPreview(session.user.id, companyId, runId);
    return NextResponse.json(preview, { status: 201 });
  } catch (err) {
    if (err instanceof PayrollDraftError) {
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
      }
      if (err.code === 'WRONG_STATUS') {
        return NextResponse.json<TaxApiError>({ error: err.message, code: 'VALIDATION_ERROR' }, { status: 422 });
      }
      if (err.code === 'NOT_ACTIVATED') {
        return NextResponse.json<TaxApiError>({ error: 'Payroll not activated', code: 'NOT_FOUND' }, { status: 422 });
      }
    }
    console.error('[payroll/runs/:id/preview POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
