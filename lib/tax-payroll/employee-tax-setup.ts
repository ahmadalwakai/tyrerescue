import 'server-only';

import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payrollEmployees, payrollEmployeeRevisions, payrollEmployeeStarterData, taxAuditEvents } from '@/lib/db/schema';
import { withTaxWriteTransaction } from './write-transaction';
import { taxYearForDate } from './rule-registry';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Enter a valid date');
const money = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Enter pounds and pence, including 0.00 where applicable');
const openingFields = ['openingYtdGrossPay', 'openingYtdTaxPaid', 'openingYtdNiEmployee', 'openingYtdNiEmployer',
  'openingYtdStudentLoanDeductions', 'openingYtdPensionEmployee', 'openingYtdPensionEmployer'] as const;

export const employeeTaxSetupSchema = z.object({
  expectedVersion: z.number().int().min(1),
  taxCode: z.string().trim().toUpperCase().min(1).max(20),
  taxCodeBasis: z.enum(['cumulative', 'week1_month1']),
  taxCodeEffectiveDate: date,
  taxCodeSource: z.enum(['p45', 'starter_checklist', 'hmrc_notification']),
  niCategory: z.enum(['A', 'B', 'C', 'H', 'J', 'M', 'Z', 'V']),
  niMethod: z.enum(['periodic', 'director_annual']),
  directorFullTaxYearConfirmed: z.boolean().default(false),
  sourceType: z.enum(['first_payroll_this_tax_year', 'current_employment_opening']),
  openingYtdTaxYear: z.string().regex(/^\d{4}-\d{2}$/),
  openingYtdEffectiveDate: date,
  openingYtdGrossPay: money,
  openingYtdTaxPaid: money,
  openingYtdNiEmployee: money,
  openingYtdNiEmployer: money,
  openingYtdStudentLoanDeductions: money,
  openingYtdPensionEmployee: money,
  openingYtdPensionEmployer: money,
  p45TotalPayPrevEmployment: money.nullable().optional(),
  p45TotalTaxPrevEmployment: money.nullable().optional(),
  studentLoanPlans: z.array(z.enum(['1', '2', '4', '5'])).max(4).refine((plans) => new Set(plans).size === plans.length, 'Do not repeat a loan plan'),
  postgraduateLoan: z.boolean(),
  studentLoanUnknown: z.literal(false, 'Confirm the employee loan status before calculating'),
  pensionHandling: z.literal('none_confirmed', 'Pension deductions need separate supported configuration'),
}).strict().superRefine((value, context) => {
  if (value.directorFullTaxYearConfirmed !== (value.niMethod === 'director_annual')) {
    context.addIssue({code:'custom',path:['directorFullTaxYearConfirmed'],message:'Annual director NI requires confirmation that the directorship began before this tax year; periodic employees must not declare this.'});
  }
  if (taxYearForDate(value.openingYtdEffectiveDate) !== value.openingYtdTaxYear) {
    context.addIssue({ code: 'custom', path: ['openingYtdTaxYear'], message: 'The opening date must be in the selected tax year' });
  }
  if (value.sourceType === 'first_payroll_this_tax_year') {
    for (const key of openingFields) if (Number(value[key]) !== 0) {
      context.addIssue({ code: 'custom', path: [key], message: 'First payroll requires an explicitly confirmed zero opening balance' });
    }
  }
  if ((value.p45TotalPayPrevEmployment == null) !== (value.p45TotalTaxPrevEmployment == null)) {
    context.addIssue({ code: 'custom', path: ['p45TotalPayPrevEmployment'], message: 'Provide both prior employment pay and tax, or neither' });
  }
});

export type EmployeeTaxSetupInput = z.infer<typeof employeeTaxSetupSchema>;
export class EmployeeTaxSetupError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'CONFLICT_VERSION' | 'VALIDATION_ERROR') { super(message); }
}

function metadata(reference: string | null): { niMethod: string | null; pensionHandling: string | null; directorFullTaxYearConfirmed: boolean } {
  try {
    const value: unknown = JSON.parse(reference ?? 'null');
    if (value && typeof value === 'object') {
      const data = value as Record<string, unknown>;
      return { niMethod: typeof data.niMethod === 'string' ? data.niMethod : null,
        pensionHandling: typeof data.pensionHandling === 'string' ? data.pensionHandling : null,
        directorFullTaxYearConfirmed: data.directorFullTaxYearConfirmed === true };
    }
  } catch { /* Historical source references are free text. */ }
  return { niMethod: null, pensionHandling: null, directorFullTaxYearConfirmed: false };
}

export async function getEmployeeTaxSetup(companyId: string, employeeId: string) {
  const [employee] = await db.select().from(payrollEmployees).where(and(
    eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId),
  )).limit(1);
  if (!employee) throw new EmployeeTaxSetupError('Employee not found.', 'NOT_FOUND');
  const [starter] = await db.select().from(payrollEmployeeStarterData)
    .where(eq(payrollEmployeeStarterData.employeeId, employeeId))
    .orderBy(desc(payrollEmployeeStarterData.recordedAt), desc(payrollEmployeeStarterData.id)).limit(1);
  return {
    employeeId, companyId, expectedVersion: employee.version, isDirector: employee.isDirector,
    taxCode: employee.taxCode, taxCodeBasis: employee.taxCodeBasis,
    taxCodeEffectiveDate: employee.taxCodeEffectiveDate, taxCodeSource: employee.taxCodeSource,
    niCategory: employee.niCategory, ...metadata(starter?.sourceReference ?? null),
    sourceType: starter?.sourceType ?? null,
    openingYtdTaxYear: starter?.openingYtdTaxYear ?? null,
    openingYtdEffectiveDate: starter?.openingYtdEffectiveDate ?? null,
    ...Object.fromEntries(openingFields.map((field) => [field, starter?.[field] ?? null])),
    openingYtdCompleteness: starter?.openingYtdCompleteness ?? 'incomplete',
    p45TotalPayPrevEmployment: starter?.p45TotalPayPrevEmployment ?? null,
    p45TotalTaxPrevEmployment: starter?.p45TotalTaxPrevEmployment ?? null,
    studentLoanPlans: starter?.studentLoanPlans ?? null,
    postgraduateLoan: starter?.postgraduateLoan ?? null,
    studentLoanUnknown: starter?.studentLoanUnknown ?? true,
    recordedAt: starter?.recordedAt.toISOString() ?? null,
  };
}

export async function saveEmployeeTaxSetup(actorUserId: string, companyId: string, employeeId: string, input: EmployeeTaxSetupInput) {
  await withTaxWriteTransaction(async (tx) => {
    const [employee] = await tx.select().from(payrollEmployees).where(and(
      eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId),
    )).for('update');
    if (!employee) throw new EmployeeTaxSetupError('Employee not found.', 'NOT_FOUND');
    if (employee.version !== input.expectedVersion) throw new EmployeeTaxSetupError('Employee changed. Reload before saving tax setup.', 'CONFLICT_VERSION');
    if (employee.isDirector !== (input.niMethod === 'director_annual')) {
      throw new EmployeeTaxSetupError('Confirm a supported NI method matching the employee director status.', 'VALIDATION_ERROR');
    }
    const version = employee.version + 1;
    const [updated] = await tx.update(payrollEmployees).set({
      taxCode: input.taxCode, taxCodeBasis: input.taxCodeBasis, taxCodeSource: input.taxCodeSource,
      taxCodeEffectiveDate: input.taxCodeEffectiveDate, niCategory: input.niCategory,
      version, updatedAt: new Date(),
    }).where(and(eq(payrollEmployees.id, employeeId), eq(payrollEmployees.companyId, companyId),
      eq(payrollEmployees.version, input.expectedVersion))).returning();
    if (!updated) throw new EmployeeTaxSetupError('Employee changed. Reload before saving tax setup.', 'CONFLICT_VERSION');
    const starter = {
      sourceType: input.sourceType, openingYtdTaxYear: input.openingYtdTaxYear,
      openingYtdEffectiveDate: input.openingYtdEffectiveDate,
      openingYtdGrossPay: input.openingYtdGrossPay, openingYtdTaxPaid: input.openingYtdTaxPaid,
      openingYtdNiEmployee: input.openingYtdNiEmployee, openingYtdNiEmployer: input.openingYtdNiEmployer,
      openingYtdStudentLoanDeductions: input.openingYtdStudentLoanDeductions,
      openingYtdPensionEmployee: input.openingYtdPensionEmployee, openingYtdPensionEmployer: input.openingYtdPensionEmployer,
      p45TotalPayPrevEmployment: input.p45TotalPayPrevEmployment, p45TotalTaxPrevEmployment: input.p45TotalTaxPrevEmployment,
      studentLoanPlans: input.studentLoanPlans, postgraduateLoan: input.postgraduateLoan,
      studentLoanUnknown: input.studentLoanUnknown,
    };
    const [saved] = await tx.insert(payrollEmployeeStarterData).values({
      ...starter, employeeId, sourceReference: JSON.stringify({ schemaVersion: 1, niMethod: input.niMethod, pensionHandling: input.pensionHandling,
        directorFullTaxYearConfirmed: input.directorFullTaxYearConfirmed }),
      openingYtdCompleteness: 'complete', recordedByUserId: actorUserId, recordedAt: sql`clock_timestamp()`,
    }).returning({ id: payrollEmployeeStarterData.id });
    await tx.insert(payrollEmployeeRevisions).values({
      employeeId, companyId, version,
      snapshot: { taxCode: updated.taxCode, taxCodeBasis: updated.taxCodeBasis,
        taxCodeSource: updated.taxCodeSource, taxCodeEffectiveDate: updated.taxCodeEffectiveDate,
        niCategory: updated.niCategory, starterDataId: saved.id },
      changedFields: ['tax_setup'], changedByUserId: actorUserId,
    });
    await tx.insert(taxAuditEvents).values({ companyId, actorUserId, eventType: 'employee_tax_setup_updated',
      payload: { employeeId, starterDataId: saved.id, version, sourceType: input.sourceType, taxYear: input.openingYtdTaxYear } });
  });
  return getEmployeeTaxSetup(companyId, employeeId);
}
