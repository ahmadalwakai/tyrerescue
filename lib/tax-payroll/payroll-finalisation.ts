import 'server-only';

/**
 * Payroll finalisation service.
 *
 * Finalisation atomically:
 * 1. Verifies the run is in 'approved' status with a valid approved review.
 * 2. Advances YTD exactly once per employment (idempotency on run ID).
 * 3. Stores immutable finalised results.
 * 4. Creates ledger postings for payroll expense and liabilities.
 * 5. Updates run status to 'finalised'.
 *
 * A failed or retried finalisation is safe to retry using the same run ID.
 * Concurrent finalisations are prevented by the payroll_runs version constraint.
 *
 * NOT in this service:
 * - Net pay disbursement (bank payments are not authorised)
 * - Pension remittance (pension provider API not available)
 * - RTI submission (separate submission service)
 * - Payslip PDF generation (payslip-service.ts)
 */

import { payrollRuns, payrollRunLines, payrollSettings, payrollEmployees, payrollRunFinalisedResults,
  taxReviews, taxAuditEvents, taxCompanyEntities,
  ledgerAccounts, journalEntries, journalLines } from '@/lib/db/schema';
import { and, eq, inArray, desc, asc } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { poundsToPence } from './payroll-calculation';
import { preparePayrollRunCalculation, type CalculatedEmployeeResult, type PayrollRunCalculationDto } from './payroll-run-calculation';
import { withTaxWriteTransaction, type TaxWriteTransaction } from './write-transaction';

// ─── Error ────────────────────────────────────────────────────────────────────

export class FinalisationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_FOUND'
      | 'WRONG_STATUS'
      | 'NO_APPROVED_REVIEW'
      | 'CONFLICT_VERSION'
      | 'ALREADY_FINALISED'
      | 'CALCULATION_BLOCKED'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'FinalisationError';
  }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export type FinalisedEmployeeResult = CalculatedEmployeeResult;

export interface FinalisationResult {
  runId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  intendedPaymentDate: string;
  finalised: true;
  finalisedAt: string;
  finalisedByUserId: string;
  employeeResults: FinalisedEmployeeResult[];
  totalGrossPounds: string;
  totalTaxPounds: string;
  totalEmployeeNiPounds: string;
  totalEmployerNiPounds: string;
  totalNetPayPounds: string;
  rulesetVersion: string;
  blockedEmployeeIds: string[];
  employeeCount: number;
  blockedEmployeeCount: number;
  totalStudentLoanPounds: string;
  totalHmrcLiabilityPounds: string;
}

// ─── Main finalisation ────────────────────────────────────────────────────────

function resultFromSnapshot(dto: PayrollRunCalculationDto, run: typeof payrollRuns.$inferSelect,
  finalisedAt: string, actor: string): FinalisationResult {
  if (!dto.totals) throw new FinalisationError('Finalised calculation is incomplete. Reconcile historical payroll before continuing.', 'CALCULATION_BLOCKED');
  return { runId:run.id, companyId:run.companyId, periodStart:run.periodStart, periodEnd:run.periodEnd,
    intendedPaymentDate:run.intendedPaymentDate, finalised:true, finalisedAt, finalisedByUserId:actor,
    employeeResults:dto.employeeResults,totalGrossPounds:dto.totals.grossPayPounds,totalTaxPounds:dto.totals.taxPounds,
    totalEmployeeNiPounds:dto.totals.employeeNiPounds,totalEmployerNiPounds:dto.totals.employerNiPounds,
    totalNetPayPounds:dto.totals.netPayPounds,totalStudentLoanPounds:dto.totals.studentLoanPounds,
    totalHmrcLiabilityPounds:dto.totals.hmrcLiabilityPounds,rulesetVersion:dto.rulesetVersion ?? dto.taxYear,
    employeeCount:dto.employeeResults.length,blockedEmployeeCount:0,blockedEmployeeIds:[] };
}

async function postPayrollJournal(tx: TaxWriteTransaction, companyId: string, actorUserId: string,
  runId: string, paymentDate: string, dto: PayrollRunCalculationDto) {
  const t=dto.totals!;
  const definitions = [
    ['7000','Wages & Salaries','expense','debit'], ['7001','Employer National Insurance','expense','debit'],
    ['2100','PAYE Liability','liability','credit'], ['2101','Employee NI Liability','liability','credit'],
    ['2102','Employer NI Liability','liability','credit'], ['2104','Student Loan Deductions Payable','liability','credit'],
    ['2105','Net Wages Control','liability','credit'],
  ];
  await tx.insert(ledgerAccounts).values(definitions.map(([code,name,accountType,normalBalance]) =>
    ({companyId,code,name,accountType,normalBalance,isSystemAccount:true}))).onConflictDoNothing();
  const accounts=await tx.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.companyId,companyId),inArray(ledgerAccounts.code,definitions.map(row=>row[0]))));
  const amounts = [['7000',poundsToPence(t.grossPayPounds)],['7001',poundsToPence(t.employerNiPounds)],
    ['2100',-poundsToPence(t.taxPounds)],['2101',-poundsToPence(t.employeeNiPounds)],
    ['2102',-poundsToPence(t.employerNiPounds)],['2104',-poundsToPence(t.studentLoanPounds)],
    ['2105',-poundsToPence(t.netPayPounds)]] as const;
  if (amounts.reduce((sum,[,amount])=>sum+amount,0) !== 0) throw new FinalisationError('Payroll journal does not balance.', 'INTERNAL');
  const [existing]=await tx.select().from(journalEntries).where(and(eq(journalEntries.companyId,companyId),eq(journalEntries.reference,runId),eq(journalEntries.referenceType,'payroll_run'))).limit(1);
  if (existing) throw new FinalisationError('A journal already exists for this unfinalised run. Reconcile before retrying.', 'CALCULATION_BLOCKED');
  const journalId=randomUUID();
  await tx.insert(journalEntries).values({id:journalId,companyId,reference:runId,referenceType:'payroll_run',transactionDate:paymentDate,
    narration:`Payroll ${runId}`,postedByUserId:actorUserId});
  const entries=amounts.filter(([,amount])=>amount!==0).map(([code,amount])=>{
    const account=accounts.find(row=>row.code===code);
    if (!account) throw new FinalisationError('Payroll control account not found.', 'INTERNAL');
    const expected=definitions.find(row=>row[0]===code)!;
    if (account.accountType!==expected[2] || account.normalBalance!==expected[3]) {
      throw new FinalisationError('A payroll control account has an incompatible definition.', 'CALCULATION_BLOCKED');
    }
    return {id:randomUUID(),journalId,companyId,accountId:account.id,accountCode:code,debitPence:Math.max(0,amount),creditPence:Math.max(0,-amount)};
  });
  if (entries.length) await tx.insert(journalLines).values(entries);
}

export async function finalisePayrollRun(actorUserId: string, companyId: string, runId: string,
  expectedVersion: number): Promise<FinalisationResult> {
  return withTaxWriteTransaction(async tx => {
    // One company lock serialises YTD-dependent finalisations in different runs.
    // NO KEY UPDATE still serialises finalisations but permits FK KEY SHARE
    // checks in employee/settings audit writes, avoiding a cross-lock deadlock.
    const [company]=await tx.select({id:taxCompanyEntities.id}).from(taxCompanyEntities).where(eq(taxCompanyEntities.id,companyId)).for('no key update');
    if (!company) throw new FinalisationError('Company not found.', 'NOT_FOUND');
    const [run]=await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id,runId),eq(payrollRuns.companyId,companyId))).for('update');
    if (!run) throw new FinalisationError('Pay run not found.', 'NOT_FOUND');
    if (run.runStatus==='finalised') {
      const saved=await preparePayrollRunCalculation(tx,companyId,runId);
      const [row]=await tx.select().from(payrollRunFinalisedResults).where(eq(payrollRunFinalisedResults.runId,runId)).limit(1);
      if (saved.dto.status!=='finalised' || !row || typeof row.ytdSnapshot.finalisedByUserId!=='string') {
        throw new FinalisationError('Historical finalisation is missing its saved results. Reconcile before continuing.', 'CALCULATION_BLOCKED');
      }
      return resultFromSnapshot(saved.dto,run,row.createdAt.toISOString(),row.ytdSnapshot.finalisedByUserId);
    }
    if (run.runStatus!=='approved') throw new FinalisationError('Approve this pay run before finalising it.', 'WRONG_STATUS');
    if (run.version!==expectedVersion) throw new FinalisationError('The pay run changed. Reload before finalising.', 'CONFLICT_VERSION');
    await tx.select().from(payrollSettings).where(eq(payrollSettings.companyId,companyId)).for('update');
    const lines=await tx.select().from(payrollRunLines).where(eq(payrollRunLines.runId,runId));
    const employeeIds=[...new Set(lines.map(line=>line.employeeId))].sort();
    if (employeeIds.length) await tx.select().from(payrollEmployees).where(and(eq(payrollEmployees.companyId,companyId),inArray(payrollEmployees.id,employeeIds))).orderBy(asc(payrollEmployees.id)).for('update');
    const [review]=await tx.select().from(taxReviews).where(and(eq(taxReviews.companyId,companyId),eq(taxReviews.entityId,runId),eq(taxReviews.entityType,'payroll_run')))
      .orderBy(desc(taxReviews.submittedAt),desc(taxReviews.id)).limit(1);
    if (!review || review.status!=='approved' || !review.reviewedByUserId || !review.calculationInputHash) {
      throw new FinalisationError('A current approved calculation review is required.', 'NO_APPROVED_REVIEW');
    }
    const prepared=await preparePayrollRunCalculation(tx,companyId,runId);
    if (prepared.dto.status!=='ready') throw new FinalisationError(prepared.dto.issues.map(issue=>issue.message).join(' '),'CALCULATION_BLOCKED');
    if (prepared.inputHash!==review.calculationInputHash) throw new FinalisationError('Payroll inputs changed after review. Return to draft and request a new review.', 'CALCULATION_BLOCKED');
    const now=new Date();
    await tx.insert(payrollRunFinalisedResults).values(prepared.snapshots.map(snapshot=>({
      runId,companyId,employeeId:snapshot.employeeId,taxYear:prepared.dto.taxYear,periodNumber:snapshot.result.periodNumber,
      grossPayPence:snapshot.result.grossPayPence,taxForPeriodPence:snapshot.result.tax.taxForPeriodPence,
      employeeNiPence:snapshot.result.ni.employeeNiPeriodPence,employerNiPence:snapshot.result.employerNiPence,
      studentLoanPence:snapshot.result.totalStudentLoanPence,netPayPence:snapshot.result.netPayPence,
      totalDeductionsPence:snapshot.result.totalEmployeeDeductionsPence,taxCode:snapshot.display.taxCode,niCategory:snapshot.display.niCategory,
      calculationStatus:'calculated',warnings:snapshot.result.warnings,createdAt:now,
      ytdSnapshot:{schemaVersion:1,before:snapshot.before,after:snapshot.after,opening:snapshot.opening,display:snapshot.display,
        calculation:snapshot.result,paymentDate:prepared.dto.paymentDate,inputHash:prepared.inputHash,finalisedByUserId:actorUserId},
    })));
    await postPayrollJournal(tx,companyId,actorUserId,runId,run.intendedPaymentDate,prepared.dto);
    const [changed]=await tx.update(payrollRuns).set({runStatus:'finalised',version:run.version+1,updatedAt:now})
      .where(and(eq(payrollRuns.id,runId),eq(payrollRuns.companyId,companyId),eq(payrollRuns.version,expectedVersion),eq(payrollRuns.runStatus,'approved'))).returning();
    if (!changed) throw new FinalisationError('The pay run changed during finalisation.', 'CONFLICT_VERSION');
    await tx.insert(taxAuditEvents).values({companyId,eventType:'payroll_finalised',actorUserId,
      payload:{runId,reviewId:review.id,inputHash:prepared.inputHash,employeeCount:prepared.snapshots.length,totals:prepared.dto.totals,
        reviewedByUserId:review.reviewedByUserId,submittedByUserId:review.submittedByUserId,
        selfReviewed:review.reviewedByUserId===review.submittedByUserId,
        approvalMode:review.reviewedByUserId===review.submittedByUserId?'self_review':'independent_review'}});
    return resultFromSnapshot(prepared.dto,run,now.toISOString(),actorUserId);
  });
}
