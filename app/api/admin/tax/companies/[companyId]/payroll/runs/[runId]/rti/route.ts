import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canWriteDraft, canReadPayroll } from '@/lib/tax-payroll/permissions';
import { checkSubmissionReadiness } from '@/lib/tax-payroll/submission-guard';
import type { TaxApiError } from '@/lib/tax-payroll/contracts';

interface RouteContext {
  params: Promise<{ companyId: string; runId: string }>;
}

// GET: submission readiness check for FPS
export async function GET(request: Request, context: RouteContext) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return NextResponse.json<TaxApiError>({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { companyId, runId } = await context.params;

  if (!(await canReadPayroll(session.user.id, companyId))) {
    return NextResponse.json<TaxApiError>({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  try {
    const guard = await checkSubmissionReadiness(companyId, { type: 'payroll_fps', runId });
    return NextResponse.json(guard);
  } catch (err) {
    console.error('[payroll/runs/:id/rti GET]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}

// POST: build FPS draft (does not submit to HMRC)
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

  // Submission not permitted in this phase — return guard result
  try {
    const guard = await checkSubmissionReadiness(companyId, { type: 'payroll_fps', runId });
    return NextResponse.json({
      message: 'FPS draft build is not yet available. RTI submission requires HMRC configuration.',
      guard,
    }, { status: 200 });
  } catch (err) {
    console.error('[payroll/runs/:id/rti POST]', err);
    return NextResponse.json<TaxApiError>({ error: 'Internal server error', code: 'INTERNAL' }, { status: 500 });
  }
}
