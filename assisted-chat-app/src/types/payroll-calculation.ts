export interface PayrollCalculatedEmployee {
  employeeId: string; legalFirstName: string; legalSurname: string; grossPayPounds: string; taxForPeriodPounds: string;
  employeeNiPounds: string; employerNiPounds: string; studentLoanPounds: string; netPayPounds: string; totalDeductionsPounds: string;
  taxCode: string; niCategory: string; periodNumber: number; taxYear: string; calculationStatus: string; warnings: string[];
}
export interface PayrollRunCalculation {
  runId: string; companyId: string; status: 'ready' | 'blocked' | 'finalised'; runVersion: number; paymentDate: string; taxYear: string;
  rulesetVersion: string | null; calculatedAt: string; employeeResults: PayrollCalculatedEmployee[];
  totals: null | { grossPayPounds: string; taxPounds: string; employeeNiPounds: string; employerNiPounds: string; studentLoanPounds: string; netPayPounds: string; hmrcLiabilityPounds: string };
  issues: Array<{ employeeId: string | null; code: string; message: string }>;
}
