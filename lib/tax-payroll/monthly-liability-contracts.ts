import type { PayrollSetupDto } from './contracts';

/** PAYE remittances from local payroll records; these are not an HMRC statement. */
export interface PayrollTaxMonth {
  start: string;
  end: string;
  taxYear: string;
  taxMonth: number;
  electronicDueDate: string;
  chequeDueDate: string;
  isOpen: boolean;
}

export interface PayrollHmrcPaymentDto {
  id: string;
  amountPence: number;
  paidOn: string;
  reference: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface PayrollHmrcAdjustmentDto {
  id: string;
  amountPence: number;
  reason: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface MonthlyPayrollLiabilityDto {
  companyId: string;
  currency: 'GBP';
  period: PayrollTaxMonth;
  status: 'no_data' | 'incomplete' | 'provisional' | 'recorded';
  source: 'local_payroll_records';
  hmrcVerified: false;
  finalizedRunCount: number;
  pendingRunCount: number;
  paymentRecordCount: number;
  adjustmentRecordCount: number;
  canRecordPayments: boolean;
  canRecordAdjustments: boolean;
  payrollSetup?: PayrollSetupDto;
  pendingRuns: Array<{
    id: string;
    status: string;
    paymentDate: string;
    periodStart: string;
    periodEnd: string;
    version: number;
  }>;
  totals: {
    payePence: number | null;
    employeeNiPence: number | null;
    employerNiPence: number | null;
    studentLoanPence: number | null;
    payrollLiabilityPence: number | null;
    adjustmentsPence: number;
    liabilityPence: number | null;
    paidPence: number;
    remainingPence: number | null;
    creditPence: number | null;
  };
  issues: string[];
  payments: PayrollHmrcPaymentDto[];
  adjustments: PayrollHmrcAdjustmentDto[];
}

export interface RecordPayrollHmrcPaymentRequest {
  periodStart: string;
  amountPence: number;
  paidOn: string;
  reference: string;
  idempotencyKey: string;
}

export interface RecordPayrollHmrcAdjustmentRequest {
  periodStart: string;
  amountPence: number;
  reason: string;
  idempotencyKey: string;
}

export interface VoidPayrollHmrcRecordRequest {
  reason: string;
  idempotencyKey: string;
}
