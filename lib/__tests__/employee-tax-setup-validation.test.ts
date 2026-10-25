import { describe, expect, it } from 'vitest';
import { employeeTaxSetupSchema } from '../tax-payroll/employee-tax-setup';
import { payrollHmrcSettingsSchema, upsertRunLinesSchema, createPayrollRunSchema, processPayrollReviewSchema } from '../tax-payroll/validation';

const input = {
  expectedVersion: 1, taxCode: 'S1257L', taxCodeBasis: 'cumulative', taxCodeEffectiveDate: '2026-04-06',
  taxCodeSource: 'starter_checklist', niCategory: 'A', niMethod: 'periodic',
  sourceType: 'first_payroll_this_tax_year', openingYtdTaxYear: '2026-27', openingYtdEffectiveDate: '2026-04-06',
  openingYtdGrossPay: '0.00', openingYtdTaxPaid: '0.00', openingYtdNiEmployee: '0.00', openingYtdNiEmployer: '0.00',
  openingYtdStudentLoanDeductions: '0.00', openingYtdPensionEmployee: '0.00', openingYtdPensionEmployer: '0.00',
  studentLoanPlans: [], postgraduateLoan: false, studentLoanUnknown: false, pensionHandling: 'none_confirmed',
};

describe('explicit employee payroll tax setup', () => {
  it('accepts a confirmed first payroll with explicit zeros and the HMRC tax-year format', () => {
    expect(employeeTaxSetupSchema.safeParse(input).success).toBe(true);
  });
  it.each(['2026/27', '2025-26'])('rejects an unmatched or malformed tax year %s', (openingYtdTaxYear) => {
    expect(employeeTaxSetupSchema.safeParse({ ...input, openingYtdTaxYear }).success).toBe(false);
  });
  it.each(['openingYtdGrossPay', 'openingYtdTaxPaid', 'openingYtdNiEmployee', 'openingYtdNiEmployer',
    'openingYtdStudentLoanDeductions', 'openingYtdPensionEmployee', 'openingYtdPensionEmployer'])('does not silently default missing %s', (field) => {
    const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect(employeeTaxSetupSchema.safeParse(payload).success).toBe(false);
  });
  it('rejects first-payroll declaration with nonzero payroll history', () => {
    expect(employeeTaxSetupSchema.safeParse({ ...input, openingYtdGrossPay: '1000.00' }).success).toBe(false);
  });
  it('accepts complete current employment opening totals and separate P45 totals', () => {
    expect(employeeTaxSetupSchema.safeParse({ ...input, sourceType: 'current_employment_opening',
      openingYtdGrossPay: '1000.00', p45TotalPayPrevEmployment: '2000.00', p45TotalTaxPrevEmployment: '150.00' }).success).toBe(true);
  });
  it('requires both P45 amounts when either is provided', () => {
    expect(employeeTaxSetupSchema.safeParse({ ...input, p45TotalPayPrevEmployment: '2000.00' }).success).toBe(false);
  });
  it.each([{ studentLoanUnknown: true }, { postgraduateLoan: undefined }, { studentLoanPlans: ['3'] },
    { studentLoanPlans: ['1', '1'] }, { pensionHandling: undefined }, { niMethod: undefined }, { taxCodeBasis: undefined }])('rejects unspecified or unsupported payroll elections %j', (patch) => {
    expect(employeeTaxSetupSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it('rejects extra fields, impossible dates and negative amounts', () => {
    for (const patch of [{ calculatedTax: '0' }, { openingYtdEffectiveDate: '2026-02-31' }, { openingYtdGrossPay: '-1.00' }]) {
      expect(employeeTaxSetupSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
});

describe('payroll write validation', () => {
  it('rejects rollover calendar dates instead of accepting Date.parse normalization', () => {
    expect(createPayrollRunSchema.safeParse({ periodStart: '2026-02-01', periodEnd: '2026-02-31', intendedPaymentDate: '2026-03-01' }).success).toBe(false);
  });
  it('supports optimistic concurrency on line edits without inventing a version for older clients', () => {
    const line = { employeeId: '10000000-0000-4000-8000-000000000001', lines: [] };
    expect(upsertRunLinesSchema.safeParse(line).success).toBe(true);
    expect(upsertRunLinesSchema.safeParse({ ...line, expectedVersion: 2 }).success).toBe(true);
    expect(upsertRunLinesSchema.safeParse({ ...line, expectedVersion: 1.5 }).success).toBe(false);
  });
  it.each([{ expectedVersion: null }, { expectedVersion: 0 }, { expectedVersion: 1.5 }, { employeePensionRate: -1 },
    { employerPensionRate: 1.1 }, { employeePensionRate: '0.05' }, { payeReference: 123 }])('rejects unsafe HMRC settings %j', (patch) => {
    expect(payrollHmrcSettingsSchema.safeParse({ expectedVersion: 1, ...patch }).success).toBe(false);
  });
  it('rejects review actions with noninteger versions, oversized notes or unknown actions', () => {
    for (const patch of [{ expectedVersion: 1.5 }, { notes: 'a'.repeat(2001) }, { action: 'finalise' }]) {
      expect(processPayrollReviewSchema.safeParse({ expectedVersion: 1, action: 'approve', ...patch }).success).toBe(false);
    }
  });
});
