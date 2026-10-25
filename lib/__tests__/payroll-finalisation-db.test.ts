// Synthetic PostgreSQL only. The HTTP database and the write connection are
// replaced together; no environment secret or real network is read.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
const state = vi.hoisted(() => ({ db: null as any, actor: '10000000-0000-4000-8000-000000000001' }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => state.db[key] }) }));
vi.mock('@/lib/tax-payroll/write-transaction', () => ({ withTaxWriteTransaction: (fn: any) => state.db.transaction(fn) }));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: async () => ({ user: { id: state.actor } }) }));
import { createCompany, updateCompany, declareRegistrationStatus } from '../tax-payroll/company-service';
import { activatePayroll, updatePayrollSettings, getPayrollSettings } from '../tax-payroll/payroll-settings-service';
import { createEmployee, updateEmployee } from '../tax-payroll/employee-service';
import { createPayTerms } from '../tax-payroll/pay-terms-service';
import { createPayrollRun, upsertRunLines, calculateDraftPreview, cancelPayrollRun, getPayrollRun } from '../tax-payroll/payroll-draft-service';
import { saveEmployeeTaxSetup, getEmployeeTaxSetup, employeeTaxSetupSchema } from '../tax-payroll/employee-tax-setup';
import { submitForReview, processReview } from '../tax-payroll/review-service';
import { POST as activateRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/settings/route';
import { PATCH as taxSetupRoute, GET as taxSetupGetRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/employees/[employeeId]/tax-setup/route';
import { ALL_PAYROLL_CAPABILITIES, FOUNDER_CAPABILITIES } from '../tax-payroll/permissions';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const reviewer = '20000000-0000-4000-8000-000000000002';
let companyId: string;
const schedule = { scheduleLabel: 'Monthly wages', payFrequency: 'monthly' as const, monthlyPayDay: 28 };
const employeeInput = { legalFirstName: 'Synthetic', legalSurname: 'Employee', employmentStartDate: '2026-04-06' };
const runInput = { periodStart: '2026-04-06', periodEnd: '2026-04-30', intendedPaymentDate: '2026-04-30' };
const setupInput = () => employeeTaxSetupSchema.parse({ expectedVersion: 1, taxCode: '1257L', taxCodeBasis: 'cumulative',
  taxCodeSource: 'starter_checklist', taxCodeEffectiveDate: '2026-04-06', niCategory: 'A', niMethod: 'periodic',
  sourceType: 'first_payroll_this_tax_year', openingYtdTaxYear: '2026-27', openingYtdEffectiveDate: '2026-04-06',
  openingYtdGrossPay: '0.00', openingYtdTaxPaid: '0.00', openingYtdNiEmployee: '0.00', openingYtdNiEmployer: '0.00',
  openingYtdStudentLoanDeductions: '0.00', openingYtdPensionEmployee: '0.00', openingYtdPensionEmployer: '0.00',
  studentLoanPlans: [], postgraduateLoan: false, studentLoanUnknown: false, pensionHandling: 'none_confirmed' });
const ctx = (employeeId: string) => ({ params: Promise.resolve({ companyId, employeeId }) });
const req = (payload: unknown, method = 'PATCH') => new Request('https://isolated.invalid/tax', { method,
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
async function prepareRun() {
  await activatePayroll(actor, companyId, schedule);
  const employee = await createEmployee(actor, companyId, employeeInput);
  await saveEmployeeTaxSetup(actor, companyId, employee.id, setupInput());
  const run = await createPayrollRun(actor, companyId, runInput);
  await upsertRunLines(actor, companyId, run.id, { employeeId: employee.id, expectedVersion: 1,
    lines: [{ lineType: 'fixed_period', fixedAmount: '2500.00' }] });
  return { run, employee };
}
beforeAll(async () => {
  await pg.exec('CREATE TABLE users (id uuid PRIMARY KEY)');
  for (const migration of ['0026_tax_payroll_phase1.sql', '0027_tax_payroll_phase2a.sql', '0028_tax_payroll_phase2b_to_5.sql', '0032_payroll_monthly_liability.sql']) {
    await pg.exec(readFileSync(`drizzle/migrations/${migration}`, 'utf8'));
  }
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  await pg.exec('TRUNCATE users CASCADE');
  await pg.query('INSERT INTO users (id) VALUES ($1), ($2)', [actor, reviewer]);
  state.actor = actor;
  const company = await createCompany(actor, { companyNumber: 'SC123456', legalName: 'Synthetic Ltd', registeredAddressLine1: 'Fixture only' });
  companyId = company.id;
});
afterAll(async () => { await pg.close(); });


import { calculatePayrollRunPreview } from '../tax-payroll/payroll-run-calculation';
import { finalisePayrollRun } from '../tax-payroll/payroll-finalisation';
import { getMonthlyPayrollLiability } from '../tax-payroll/monthly-liability-service';
import { parsePayrollCalculation, parsePayrollRun } from '../../assisted-chat-app/src/lib/payroll-workspace-response';
import { parsePayrollSettings, parsePayrollEmployee, parsePayrollPayTerms, parsePayrollRunSummary } from '../../assisted-chat-app/src/lib/payroll-setup-response';
import { GET as calculationRoute } from '../../app/api/admin/tax/companies/[companyId]/payroll/runs/[runId]/calculation/route';
async function approve(runId:string) {
  const run=await getPayrollRun(companyId,runId);
  const review=await submitForReview(actor,companyId,'payroll_run',runId,run!.version);
  await processReview(reviewer,companyId,review.id,'approve',review.version);
  return (await getPayrollRun(companyId,runId))!;
}

describe('actual PostgreSQL payroll calculation and finalisation',()=>{
  it('actual settings, employee, pay terms and created run summaries pass the setup app decoders',async()=>{
    const activated=await activatePayroll(actor,companyId,schedule);
    expect(parsePayrollSettings(activated,companyId).payFrequency).toBe('monthly');
    expect(parsePayrollSettings(await getPayrollSettings(companyId),companyId).version).toBe(1);
    const employee=await createEmployee(actor,companyId,employeeInput);
    expect(parsePayrollEmployee(employee,companyId,employee.id).legalFirstName).toBe('Synthetic');
    const terms=await createPayTerms(actor,companyId,employee.id,{payBasis:'hourly',hourlyRate:'15.00',payFrequency:'monthly',effectiveFrom:'2026-04-06'});
    expect(parsePayrollPayTerms(terms,companyId,employee.id).hourlyRate).toBe('15.0000');
    const created=await createPayrollRun(actor,companyId,runInput);
    expect(parsePayrollRunSummary(created,companyId).id).toBe(created.id);
    expect(parsePayrollRunSummary(created,companyId).latestPreview).toBeNull();
  });
  it('requires an explicit full-tax-year director declaration, rather than inferring it from the hire date',async()=>{
    expect(employeeTaxSetupSchema.safeParse({...setupInput(),niMethod:'director_annual',directorFullTaxYearConfirmed:false}).success).toBe(false);
    await activatePayroll(actor,companyId,schedule);
    const employee=await createEmployee(actor,companyId,{...employeeInput,isDirector:true});
    await saveEmployeeTaxSetup(actor,companyId,employee.id,{...setupInput(),niMethod:'director_annual',directorFullTaxYearConfirmed:true});
    const run=await createPayrollRun(actor,companyId,runInput);
    await upsertRunLines(actor,companyId,run.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    expect((await calculatePayrollRunPreview(companyId,run.id)).status).toBe('ready');
    await state.db.update(schema.payrollEmployeeStarterData).set({sourceReference:JSON.stringify({schemaVersion:1,niMethod:'director_annual',pensionHandling:'none_confirmed'})});
    const blocked=await calculatePayrollRunPreview(companyId,run.id);
    expect(blocked.status).toBe('blocked');expect(blocked.issues.map(row=>row.code)).toContain('NI_METHOD_REVIEW_REQUIRED');
  });
  it('blocks switching a periodic employee to annual director NI after a finalised period',async()=>{
    const {run,employee}=await prepareRun();const approved=await approve(run.id);
    await finalisePayrollRun(actor,companyId,run.id,approved.version);
    await state.db.update(schema.payrollEmployees).set({isDirector:true}).where(eq(schema.payrollEmployees.id,employee.id));
    await saveEmployeeTaxSetup(actor,companyId,employee.id,{...setupInput(),expectedVersion:2,niMethod:'director_annual',directorFullTaxYearConfirmed:true});
    const may=await createPayrollRun(actor,companyId,{periodStart:'2026-05-01',periodEnd:'2026-05-31',intendedPaymentDate:'2026-05-29'});
    await upsertRunLines(actor,companyId,may.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    const preview=await calculatePayrollRunPreview(companyId,may.id);
    expect(preview.status).toBe('blocked');expect(preview.issues.map(row=>row.code)).toContain('NI_METHOD_CHANGED');
  });
  it('a genuinely calculated and finalised run becomes the monthly liability without snapshot rejection',async()=>{
    const {run}=await prepareRun();
    const approved=await approve(run.id);
    const finalised=await finalisePayrollRun(actor,companyId,run.id,approved.version);
    const summary=await getMonthlyPayrollLiability(actor,companyId,runInput.intendedPaymentDate,new Date('2026-05-06T12:00:00Z'));
    expect(summary.status).toBe('recorded');
    expect(summary.finalizedRunCount).toBe(1);
    expect(summary.pendingRunCount).toBe(0);
    expect(summary.totals).toMatchObject({payePence:29020,employeeNiPence:11616,employerNiPence:31245,
      studentLoanPence:0,payrollLiabilityPence:71881,liabilityPence:71881,paidPence:0,remainingPence:71881});
    expect((summary.totals.liabilityPence! / 100).toFixed(2)).toBe(finalised.totalHmrcLiabilityPounds);
    expect(summary.hmrcVerified).toBe(false);
  });
  it('previews deductions without changing YTD, run state or booking a liability',async()=>{
    const {run}=await prepareRun();
    const preview=await calculatePayrollRunPreview(companyId,run.id);
    expect(preview).toMatchObject({status:'ready',totals:{grossPayPounds:'2500.00',taxPounds:'290.20',employeeNiPounds:'116.16',employerNiPounds:'312.45',netPayPounds:'2093.64',hmrcLiabilityPounds:'718.81'}});
    expect(await state.db.select().from(schema.payrollRunFinalisedResults)).toHaveLength(0);
    expect((await getPayrollRun(companyId,run.id))!.runStatus).toBe('draft');
    expect(await state.db.select().from(schema.journalEntries)).toHaveLength(0);
  });
  it('does not invent zero prior pay when a current-year starter confirmation is missing',async()=>{
    const {run}=await prepareRun();
    await state.db.delete(schema.payrollEmployeeStarterData);
    const preview=await calculatePayrollRunPreview(companyId,run.id);
    expect(preview.status).toBe('blocked'); expect(preview.totals).toBeNull();
    expect(preview.issues.map(row=>row.code)).toContain('OPENING_YTD_REQUIRED');
    await expect(submitForReview(actor,companyId,'payroll_run',run.id,2)).rejects.toMatchObject({code:'CALCULATION_BLOCKED'});
  });
  it('supports a distinct reviewer and persists exactly one immutable calculation, journal and audit',async()=>{
    const {run,employee}=await prepareRun();
    const approved=await approve(run.id);
    const result=await finalisePayrollRun(actor,companyId,run.id,approved.version);
    expect(result.totalHmrcLiabilityPounds).toBe('718.81');
    const saved=await state.db.select().from(schema.payrollRunFinalisedResults);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({employeeId:employee.id,grossPayPence:250000,taxForPeriodPence:29020,employeeNiPence:11616,employerNiPence:31245,netPayPence:209364});
    expect(saved[0].ytdSnapshot.after).toMatchObject({grossPayToDatePence:250000,taxPaidToDatePence:29020,niableEarningsToDatePence:250000});
    const journals=await state.db.select().from(schema.journalEntries);
    const journalLines=await state.db.select().from(schema.journalLines);
    expect(journals).toHaveLength(1);
    expect(journalLines.reduce((n,row)=>n+row.debitPence-row.creditPence,0)).toBe(0);
    const replay=await finalisePayrollRun(reviewer,companyId,run.id,approved.version);
    expect(replay).toEqual(result);
    expect(await state.db.select().from(schema.payrollRunFinalisedResults)).toHaveLength(1);
    expect(await state.db.select().from(schema.journalEntries)).toHaveLength(1);
    expect((await state.db.select().from(schema.taxAuditEvents)).filter(row=>row.eventType==='payroll_finalised')).toHaveLength(1);
  });
  it('reuses saved month1 YTD in month2 and does not add opening/P45 balances a second time',async()=>{
    const {run,employee}=await prepareRun();
    const approved=await approve(run.id); await finalisePayrollRun(actor,companyId,run.id,approved.version);
    const may=await createPayrollRun(actor,companyId,{periodStart:'2026-05-01',periodEnd:'2026-05-31',intendedPaymentDate:'2026-05-29'});
    await upsertRunLines(actor,companyId,may.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    const preview=await calculatePayrollRunPreview(companyId,may.id);
    expect(preview.issues).toEqual([]); expect(preview.status).toBe('ready'); expect(preview.totals!.taxPounds).toBe('290.40');
    const approvedMay=await approve(may.id); await finalisePayrollRun(actor,companyId,may.id,approvedMay.version);
    const saved=await state.db.select().from(schema.payrollRunFinalisedResults).where(eq(schema.payrollRunFinalisedResults.runId,may.id));
    expect(saved[0].ytdSnapshot.after).toMatchObject({grossPayToDatePence:500000,taxPaidToDatePence:58060});
  });
  it('counts P45 prior employment pay/tax once for cumulative PAYE and excludes it from NI earnings',async()=>{
    const {run,employee}=await prepareRun();
    await saveEmployeeTaxSetup(actor,companyId,employee.id,{...setupInput(),expectedVersion:2,
      p45TotalPayPrevEmployment:'1000.00',p45TotalTaxPrevEmployment:'100.00'});
    const preview=await calculatePayrollRunPreview(companyId,run.id);
    expect(preview.totals).toMatchObject({taxPounds:'390.20',employeeNiPounds:'116.16'});
    const approved=await approve(run.id);await finalisePayrollRun(actor,companyId,run.id,approved.version);
    const may=await createPayrollRun(actor,companyId,{periodStart:'2026-05-01',periodEnd:'2026-05-31',intendedPaymentDate:'2026-05-29'});
    await upsertRunLines(actor,companyId,may.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    expect((await calculatePayrollRunPreview(companyId,may.id)).totals).toMatchObject({taxPounds:'290.40',employeeNiPounds:'116.16'});
  });
  it('rejects direct finalisation without a real approved review',async()=>{
    const {run}=await prepareRun();
    await state.db.update(schema.payrollRuns).set({runStatus:'approved'});
    await expect(finalisePayrollRun(actor,companyId,run.id,2)).rejects.toMatchObject({code:'NO_APPROVED_REVIEW'});
    expect(await state.db.select().from(schema.payrollRunFinalisedResults)).toHaveLength(0);
  });
  it('rejects inputs changed after approval instead of recalculating unreviewed liabilities',async()=>{
    const {run,employee}=await prepareRun(); const approved=await approve(run.id);
    await updateEmployee(actor,companyId,employee.id,{expectedVersion:2,taxCode:'BR'});
    await expect(finalisePayrollRun(actor,companyId,run.id,approved.version)).rejects.toMatchObject({code:'CALCULATION_BLOCKED'});
    expect(await state.db.select().from(schema.payrollRunFinalisedResults)).toHaveLength(0);
    expect(await state.db.select().from(schema.journalEntries)).toHaveLength(0);
  });
  it('rolls back all saved results, YTD, control accounts and state when the final audit cannot be written',async()=>{
    const {run}=await prepareRun(); const approved=await approve(run.id);
    await pg.exec("ALTER TABLE tax_audit_events ADD CONSTRAINT finalise_fixture_failure CHECK(event_type <> 'payroll_finalised')");
    try {
      await expect(finalisePayrollRun(actor,companyId,run.id,approved.version)).rejects.toThrow();
      expect(await state.db.select().from(schema.payrollRunFinalisedResults)).toHaveLength(0);
      expect(await state.db.select().from(schema.journalEntries)).toHaveLength(0);
      expect(await state.db.select().from(schema.journalLines)).toHaveLength(0);
      expect(await state.db.select().from(schema.ledgerAccounts)).toHaveLength(0);
      expect((await getPayrollRun(companyId,run.id))!.runStatus).toBe('approved');
    } finally {await pg.exec('ALTER TABLE tax_audit_events DROP CONSTRAINT finalise_fixture_failure');}
    expect((await finalisePayrollRun(actor,companyId,run.id,approved.version)).finalised).toBe(true);
  });
  it('blocks every finalisation if even one employee cannot be calculated',async()=>{
    const {run}=await prepareRun();
    const second=await createEmployee(actor,companyId,{...employeeInput,legalFirstName:'Missing setup'});
    await upsertRunLines(actor,companyId,run.id,{employeeId:second.id,expectedVersion:2,lines:[{lineType:'fixed_period',fixedAmount:'1500.00'}]});
    const preview=await calculatePayrollRunPreview(companyId,run.id);
    expect(preview.status).toBe('blocked'); expect(preview.totals).toBeNull();
    expect(preview.employeeResults).toHaveLength(1);
    await expect(submitForReview(actor,companyId,'payroll_run',run.id,3)).rejects.toMatchObject({code:'CALCULATION_BLOCKED'});
  });
  it('blocks another finalisation in the same period and backdated finalisation after a later period',async()=>{
    const {run,employee}=await prepareRun(); const approved=await approve(run.id);
    await finalisePayrollRun(actor,companyId,run.id,approved.version);
    const second=await createPayrollRun(actor,companyId,runInput);
    await upsertRunLines(actor,companyId,second.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    const preview=await calculatePayrollRunPreview(companyId,second.id);
    expect(preview.issues.map(row=>row.code)).toContain('PERIOD_ALREADY_FINALISED');
    expect(preview.totals).toBeNull();
  });
  it('blocks legacy finalised runs with missing results instead of treating them as zero YTD',async()=>{
    const {run,employee}=await prepareRun();
    await state.db.update(schema.payrollRuns).set({runStatus:'finalised'});
    expect((await calculatePayrollRunPreview(companyId,run.id)).status).toBe('blocked');
    const second=await createPayrollRun(actor,companyId,{...runInput,intendedPaymentDate:'2026-05-29'});
    await upsertRunLines(actor,companyId,second.id,{employeeId:employee.id,expectedVersion:1,lines:[{lineType:'fixed_period',fixedAmount:'2500.00'}]});
    expect((await calculatePayrollRunPreview(companyId,second.id)).issues.map(row=>row.code)).toContain('INCOMPLETE_PAYROLL_HISTORY');
  });
  it('blocks incomplete hourly lines and does not fall back to zero',async()=>{
    const {run,employee}=await prepareRun();
    await upsertRunLines(actor,companyId,run.id,{employeeId:employee.id,expectedVersion:2,lines:[{lineType:'hours_worked',workedMinutes:60}]});
    const preview=await calculatePayrollRunPreview(companyId,run.id);
    expect(preview.status).toBe('blocked'); expect(preview.totals).toBeNull();
  });
  it('uses one rounded gross calculation for both preview and finalised hourly earnings',async()=>{
    const {run,employee}=await prepareRun();
    await upsertRunLines(actor,companyId,run.id,{employeeId:employee.id,expectedVersion:2,lines:[{lineType:'hours_worked',workedMinutes:30,hourlyRateOverride:'15.5555'}]});
    expect((await calculatePayrollRunPreview(companyId,run.id)).totals!.grossPayPounds).toBe('7.78');
    const approved=await approve(run.id); expect((await finalisePayrollRun(actor,companyId,run.id,approved.version)).totalGrossPounds).toBe('7.78');
  });
  it('persists one undergraduate deduction plus postgraduate repayment and reconciles the journal',async()=>{
    const {run,employee}=await prepareRun();
    await saveEmployeeTaxSetup(actor,companyId,employee.id,{...setupInput(),expectedVersion:2,studentLoanPlans:['1','2'],postgraduateLoan:true});
    await upsertRunLines(actor,companyId,run.id,{employeeId:employee.id,expectedVersion:2,lines:[{lineType:'fixed_period',fixedAmount:'3000.00'}]});
    const approved=await approve(run.id); const result=await finalisePayrollRun(actor,companyId,run.id,approved.version);
    expect(result.totalStudentLoanPounds).toBe('143.00');
    const [saved]=await state.db.select().from(schema.payrollRunFinalisedResults);
    expect(saved.ytdSnapshot.after).toMatchObject({studentLoanToDatePence:6800,pgLoanToDatePence:7500});
    const journalLines=await state.db.select().from(schema.journalLines);
    expect(journalLines.reduce((n,row)=>n+row.debitPence-row.creditPence,0)).toBe(0);
  });
  it('calculation API is private, scopes payroll membership and returns actionable missing setup',async()=>{
    const {run}=await prepareRun();
    const context={params:Promise.resolve({companyId,runId:run.id})};
    state.actor=reviewer;
    expect((await calculationRoute(new Request('https://isolated.invalid'),context)).status).toBe(404);
    state.actor=actor;
    const response=await calculationRoute(new Request('https://isolated.invalid'),context);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).status).toBe('ready');
  });
  it('actual server run, ready calculation and finalised responses pass the app contract',async()=>{
    const {run}=await prepareRun();
    const serverRun=await getPayrollRun(companyId,run.id);
    expect(parsePayrollRun(serverRun,companyId,run.id).version).toBe(2);
    const ready=await calculatePayrollRunPreview(companyId,run.id);
    expect(parsePayrollCalculation(ready,companyId,run.id).status).toBe('ready');
    const approved=await approve(run.id); await finalisePayrollRun(actor,companyId,run.id,approved.version);
    const finalised=await calculatePayrollRunPreview(companyId,run.id);
    expect(parsePayrollCalculation(finalised,companyId,run.id).status).toBe('finalised');
    expect(finalised.totals).toEqual(ready.totals);
    const corrupt={...finalised,totals:{...finalised.totals,hmrcLiabilityPounds:'0.00'}};
    expect(()=>parsePayrollCalculation(corrupt,companyId,run.id)).toThrow();
    expect(()=>parsePayrollCalculation(finalised,reviewer,run.id)).toThrow();
  });
  it('the app accepts blocked missing-data responses with null liability and actionable issues',async()=>{
    const {run}=await prepareRun(); await state.db.delete(schema.payrollEmployeeStarterData);
    const blocked=await calculatePayrollRunPreview(companyId,run.id);
    expect(parsePayrollCalculation(blocked,companyId,run.id).status).toBe('blocked');
    expect(blocked.totals).toBeNull(); expect(blocked.issues.length).toBeGreaterThan(0);
  });

});

