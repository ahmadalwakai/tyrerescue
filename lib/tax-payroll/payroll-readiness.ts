import 'server-only';

import type { PayrollReadinessIssue, PayrollReadinessDto } from './contracts';

export type { PayrollReadinessIssue, PayrollReadinessDto };

export interface ReadinessEmployee {
  id: string;
  legalFirstName: string;
  legalSurname: string;
  employeeStatus: string;
  taxCode: string | null;
  niCategory: string | null;
  hasActivePayTerms: boolean;
  hasNino: boolean;
}

export interface ReadinessInput {
  isActivated: boolean;
  employees: ReadinessEmployee[];
  hasAtLeastOneActiveEmployee: boolean;
}

export function assessPayrollReadiness(input: ReadinessInput): PayrollReadinessDto {
  const issues: PayrollReadinessIssue[] = [];

  if (!input.isActivated) {
    issues.push({
      code: 'payroll_not_activated',
      severity: 'error',
      fieldPath: null,
      message: 'Payroll has not been activated for this company.',
      employeeId: null,
    });
    return { ready: false, issues };
  }

  if (!input.hasAtLeastOneActiveEmployee) {
    issues.push({
      code: 'no_active_employees',
      severity: 'warning',
      fieldPath: null,
      message: 'No active employees found. Add at least one employee before running payroll.',
      employeeId: null,
    });
  }

  for (const emp of input.employees) {
    if (emp.employeeStatus !== 'active') continue;

    if (!emp.hasActivePayTerms) {
      issues.push({
        code: 'employee_missing_pay_terms',
        severity: 'error',
        fieldPath: 'payTerms',
        message: `${emp.legalFirstName} ${emp.legalSurname} has no active pay terms. Add pay terms before including them in a run.`,
        employeeId: emp.id,
      });
    }

    if (!emp.taxCode) {
      issues.push({
        code: 'employee_missing_tax_code',
        severity: 'warning',
        fieldPath: 'taxCode',
        message: `${emp.legalFirstName} ${emp.legalSurname} has no tax code recorded. Tax deductions will not be available until a tax code is supplied.`,
        employeeId: emp.id,
      });
    }

    if (!emp.niCategory) {
      issues.push({
        code: 'employee_missing_ni_category',
        severity: 'warning',
        fieldPath: 'niCategory',
        message: `${emp.legalFirstName} ${emp.legalSurname} has no NI category recorded. NI deductions will not be available until a category is supplied.`,
        employeeId: emp.id,
      });
    }

    if (!emp.hasNino) {
      issues.push({
        code: 'employee_missing_nino',
        severity: 'info',
        fieldPath: 'nino',
        message: `${emp.legalFirstName} ${emp.legalSurname} has no National Insurance number recorded.`,
        employeeId: emp.id,
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  return { ready: !hasErrors, issues };
}
