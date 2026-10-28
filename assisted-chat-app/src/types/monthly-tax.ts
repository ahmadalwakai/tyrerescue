// Mirrors lib/tax-payroll/monthly-liability-contracts.ts. All amounts are GBP pence.
import type { PayrollSetupDto } from './tax-payroll';
export interface MonthlyTaxSummary {
  companyId: string; currency: 'GBP';
  period: { start: string; end: string; taxYear: string; taxMonth: number; electronicDueDate: string; chequeDueDate: string; isOpen: boolean };
  status: 'no_data' | 'incomplete' | 'provisional' | 'recorded';
  source: 'local_payroll_records'; hmrcVerified: false;
  finalizedRunCount: number; pendingRunCount: number; paymentRecordCount: number; adjustmentRecordCount: number; canRecordPayments: boolean; canRecordAdjustments: boolean;
  pendingRuns: Array<{ id: string; status: string; paymentDate: string; periodStart: string; periodEnd: string; version: number }>;
  totals: { payePence: number | null; employeeNiPence: number | null; employerNiPence: number | null; studentLoanPence: number | null;
    payrollLiabilityPence: number | null; adjustmentsPence: number; liabilityPence: number | null; paidPence: number; remainingPence: number | null; creditPence: number | null };
  issues: string[];
  payments: Array<{ id: string; amountPence: number; paidOn: string; reference: string; recordedAt: string; voidedAt: string | null; voidReason: string | null }>;
  adjustments: Array<{ id: string; amountPence: number; reason: string; recordedAt: string; voidedAt: string | null; voidReason: string | null }>;
  payrollSetup?: PayrollSetupDto;
}
