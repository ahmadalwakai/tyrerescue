import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { canReadPayroll } from '@/lib/tax-payroll/permissions';
import { calculatePayrollRunPreview, RunCalculationError } from '@/lib/tax-payroll/payroll-run-calculation';

export async function GET(request: Request, context: {params: Promise<{companyId:string;runId:string}>}) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try { session=await requireAdminMobile(request); }
  catch { return NextResponse.json({error:'Unauthorized',code:'UNAUTHENTICATED'},{status:401}); }
  const {companyId,runId}=await context.params;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(companyId)||!uuid.test(runId)) return NextResponse.json({error:'Not found',code:'NOT_FOUND'},{status:404});
  if (!(await canReadPayroll(session.user.id,companyId))) return NextResponse.json({error:'Not found',code:'NOT_FOUND'},{status:404});
  try {
    return NextResponse.json(await calculatePayrollRunPreview(companyId,runId),{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if (error instanceof RunCalculationError) return NextResponse.json({error:error.message,code:error.code},{status:error.code==='NOT_FOUND'?404:422});
    console.error('[payroll calculation GET] failed',error instanceof Error?error.name:'unknown');
    return NextResponse.json({error:'Unable to calculate payroll. Retry after checking payroll setup.',code:'INTERNAL'},{status:503});
  }
}
