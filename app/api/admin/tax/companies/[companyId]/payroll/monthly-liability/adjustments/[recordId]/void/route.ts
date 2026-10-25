import { voidPayrollRecordHttp } from '@/lib/tax-payroll/monthly-liability-http';

export async function POST(request: Request, context: { params: Promise<{ companyId: string; recordId: string }> }) {
  return voidPayrollRecordHttp(request, context, 'adjustments');
}
