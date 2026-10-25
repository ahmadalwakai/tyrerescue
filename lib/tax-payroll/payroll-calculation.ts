import 'server-only';

/**
 * PAYE income tax, Class 1 NI, and student/postgraduate loan deduction engine.
 *
 * Implements HMRC employer payroll specification.
 * Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 *         https://www.gov.uk/government/collections/paye-online-support-for-software-developers
 * PAYErout v24: https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax
 * Verified: 2026-10-21
 *
 * All monetary values are in pence (integer arithmetic) unless explicitly noted.
 *
 * SUPPORTED:
 * - Cumulative and W1/M1 (non-cumulative) tax code bases
 * - Standard numeric codes (e.g. 1257L)
 * - BR, D0, D1, NT, 0T tax codes
 * - K codes (negative personal allowance)
 * - Scottish (S prefix) and Welsh (C prefix) codes
 * - Emergency tax code treatment
 * - Categories A, B, C, H, J, M, Z, V
 * - Director annual NI method (full-year appointment only at run validation)
 * - Student loans Plan 1, 2, 4, 5 and postgraduate loan
 * - Weekly, fortnightly, four-weekly, monthly pay frequencies
 *
 * NOT SUPPORTED (requires additional data/scope):
 * - Statutory sick/maternity/paternity/adoption pay (separate service)
 * - Pension salary sacrifice impact on NI (pension service)
 * - Class 1A / Class 1B
 */

import Decimal from 'decimal.js';
import {
  getRulesetForDate,
  freePayForPeriod,
  type TaxBand,
  type PayrollRuleSet,
} from './rule-registry';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });
export const PAYROLL_CALCULATION_POLICY_VERSION = '2026-27-paye-v24-ni-v1.1-2026-10-21';

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';

export type NiMethod = 'periodic' | 'director_annual' | 'director_alternative';

export type CalculationSupportStatus =
  | 'calculated'
  | 'not_configured'
  | 'unsupported_tax_code'
  | 'unsupported_ni_category'
  | 'unsupported_student_loan'
  | 'no_ruleset_for_date';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface StudentLoanConfig {
  /** Plan numbers active for this employee — may be multiple. */
  plans: Array<1 | 2 | 4 | 5>;
  /** Postgraduate loan active. */
  postgraduate: boolean;
}

export interface EmploymentYtd {
  /** Tax period number of most recent finalised payroll (0 if none yet). */
  lastPeriodNumber: number;
  /** Gross pay to date in pence. */
  grossPayToDatePence: number;
  /** Tax paid to date in pence. */
  taxPaidToDatePence: number;
  /** Employee NI paid to date in pence. */
  employeeNiToDatePence: number;
  /** Employer NI to date in pence. */
  employerNiToDatePence: number;
  /** Student loan deducted to date in pence. */
  studentLoanToDatePence: number;
  /** Postgraduate loan deducted to date in pence. */
  pgLoanToDatePence: number;
  /** NI-able earnings to date in pence (for director annual method). */
  niableEarningsToDatePence: number;
}

export interface EmployeeCalcInput {
  employeeId: string;
  legalFirstName: string;
  legalSurname: string;
  paymentDate: string; // YYYY-MM-DD

  taxCode: string;
  taxCodeBasis: 'cumulative' | 'week1_month1';
  /** ISO 3166-1 alpha-2. Use GB for England/Wales, GB-SCT for Scotland. */
  taxCountry: 'GB' | 'GB-SCT' | 'GB-WLS';

  niCategory: string; // A, B, C, H, J, M, Z, V
  niMethod: NiMethod;

  frequency: PayFrequency;
  /**
   * For cumulative: period number this payment falls in (e.g. week 23, month 6).
   * For W1/M1: any positive integer; only used for NI period scaling.
   */
  periodNumber: number;
  /** Director fields: total NI-able earnings from start of tax year (for annual method). */
  directorNiableEarningsToDatePence?: number;
  /** Tax year start date for director annual method. */
  taxYearStartDate?: string;

  grossPayPence: number; // pay for this period
  /** Prior-period totals for cumulative calculation. */
  ytd: EmploymentYtd;

  studentLoan: StudentLoanConfig;

  /** Opening YTD from P45 or starter data (added to grossPayToDate and taxPaidToDate). */
  openingYtdGrossPayPence?: number;
  openingYtdTaxPaidPence?: number;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TaxCalculationDetail {
  status: CalculationSupportStatus;
  taxCodeUsed: string;
  taxCodeNumber: number | null;
  isScottish: boolean;
  isWelsh: boolean;
  isKCode: boolean;
  isCumulative: boolean;

  freePayToDatePence: number;
  grossPayToDatePence: number; // includes this period
  taxablePayToDatePence: number;
  taxDueToDatePence: number;
  taxPaidToDatePence: number; // includes this period
  /** Tax for this period (may be negative = refund). */
  taxForPeriodPence: number;
}

export interface NiCalculationDetail {
  status: CalculationSupportStatus;
  category: string;
  method: NiMethod;
  niableEarningsPeriodPence: number;
  employeeNiPeriodPence: number;
  employerNiPeriodPence: number;
  employeeNiToDatePence: number;
  employerNiToDatePence: number;
}

export interface StudentLoanDetail {
  plan: 1 | 2 | 4 | 5 | 'pg';
  status: CalculationSupportStatus;
  deductionPence: number;
}

export interface PayrollCalculationResult {
  employeeId: string;
  legalFirstName: string;
  legalSurname: string;
  paymentDate: string;
  periodNumber: number;
  frequency: PayFrequency;
  rulesetVersion: string;

  grossPayPence: number;
  taxablePayPeriodPence: number;

  tax: TaxCalculationDetail;
  ni: NiCalculationDetail;
  studentLoans: StudentLoanDetail[];

  totalEmployeeDeductionsPence: number;
  employerNiPence: number;
  netPayPence: number;

  /** Sum of student loan deductions. */
  totalStudentLoanPence: number;

  overallStatus: CalculationSupportStatus;
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodsPerYear(freq: PayFrequency): number {
  switch (freq) {
    case 'weekly': return 52;
    case 'fortnightly': return 26;
    case 'four_weekly': return 13;
    case 'monthly': return 12;
  }
}

/**
 * Parse a PAYE tax code into its numeric value and type.
 * Returns null for unrecognised format.
 *
 * Rules:
 * - Strip S/C prefix (Scottish/Welsh) to get the jurisdiction-neutral code
 * - Numeric + L/W/Y/T/M/N suffix → standard code; number is the code value
 * - K prefix → K code; tax code number is the value after K; negate free pay
 * - BR, D0, D1 → flat rate codes
 * - NT → nil tax
 * - 0T → no personal allowance
 */
export function parseTaxCode(raw: string) {
  const upper = raw.toUpperCase().trim().replace(/\s+/g, '');
  const isScottish = upper.startsWith('S');
  const isWelsh = upper.startsWith('C');
  let stripped = (isScottish || isWelsh) ? upper.slice(1) : upper;
  const isEmergency = /(?:W1|M1|X)$/.test(stripped);
  if (isEmergency) stripped = stripped.replace(/(?:W1|M1|X)$/, '');
  const numericMatch = stripped.match(/^(\d+)[LTYMN]?$/);
  const kMatch = stripped.match(/^K([1-9]\d*)$/);
  return {
    numeric: kMatch ? Number(kMatch[1]) : numericMatch ? Number(numericMatch[1]) : null,
    isKCode: !!kMatch,
    isBR: stripped === 'BR', isD0: stripped === 'D0', isD1: stripped === 'D1',
    isD2: isScottish && stripped === 'D2', isD3: isScottish && stripped === 'D3',
    isNT: stripped === 'NT', is0T: stripped === '0T',
    isScottish, isWelsh, isEmergency,
  };
}

function selectTaxBands(rs: PayrollRuleSet, isScottish: boolean, isWelsh: boolean): typeof rs.englandNiBands {
  if (isScottish) return rs.scotlandBands;
  if (isWelsh) return rs.walesBands;
  return rs.englandNiBands;
}

// ─── PAYE tax calculation ──────────────────────────────────────────────────────

/** HMRC PAYErout v24 §§3.3.4 and 4.4: period bandwidth tests use
 * ceiling whole pounds, the tax formula uses exact four-decimal thresholds,
 * taxable pay rounds down to pounds, and final tax rounds down to pence. */
function periodBandTax(taxablePence: number, bands: TaxBand[], period: number, periods: number): number {
  const taxableWhole = Math.floor(taxablePence / 100) * 100;
  let previousAnnual = new Decimal(0);
  let annualTax = new Decimal(0);
  for (const band of bands) {
    const threshold = band.upperLimitPencePerYear == null ? null
      : new Decimal(band.upperLimitPencePerYear).times(period).div(periods).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    if (threshold == null || taxablePence <= threshold.div(100).ceil().times(100).toNumber()) {
      const previousPeriod = previousAnnual.times(period).div(periods).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      const priorTax = annualTax.times(period).div(periods).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      return Math.max(0, priorTax.plus(new Decimal(taxableWhole).minus(previousPeriod).times(band.rate))
        .toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber());
    }
    annualTax = annualTax.plus(new Decimal(band.upperLimitPencePerYear!).minus(previousAnnual).times(band.rate));
    previousAnnual = new Decimal(band.upperLimitPencePerYear!);
  }
  return 0;
}

function calculatePAYE(input: EmployeeCalcInput, rs: PayrollRuleSet): TaxCalculationDetail {
  const parsed = parseTaxCode(input.taxCode);
  const periods = periodsPerYear(input.frequency);
  const cumulative = input.taxCodeBasis === 'cumulative' && !parsed.isEmergency;
  const grossToDate = input.ytd.grossPayToDatePence + input.grossPayPence + (input.openingYtdGrossPayPence ?? 0);
  const priorTax = input.ytd.taxPaidToDatePence + (input.openingYtdTaxPaidPence ?? 0);
  const gross = cumulative ? grossToDate : input.grossPayPence;
  const period = cumulative ? input.periodNumber : 1;
  const numeric = parsed.is0T ? 0 : parsed.numeric;
  const flatRate = parsed.isBR ? 0.20 : parsed.isD0 ? (parsed.isScottish ? 0.21 : 0.40)
    : parsed.isD1 ? (parsed.isScottish ? 0.42 : 0.45)
      : parsed.isD2 ? 0.45 : parsed.isD3 ? 0.48 : null;
  let freePay = 0;
  let taxable = 0;
  let taxDue = 0;
  if (!parsed.isNT) {
    if (flatRate != null) {
      taxable = gross;
      taxDue = new Decimal(Math.floor(taxable / 100) * 100).times(flatRate).floor().toNumber();
    } else {
      const code = numeric ?? 0;
      freePay = freePayForPeriod(code, periods) * period;
      if (parsed.isKCode) freePay = -freePay;
      taxable = Math.max(0, gross - freePay);
      taxDue = periodBandTax(taxable, selectTaxBands(rs, parsed.isScottish, parsed.isWelsh), period, periods);
    }
  }
  const expectedPeriodTax = cumulative ? taxDue - priorTax : taxDue;
  // The 50% overriding limit applies to ALL codes and to current pay, not YTD.
  const periodTax = Math.min(expectedPeriodTax, Math.floor(input.grossPayPence / 2));
  return {
    status: 'calculated', taxCodeUsed: input.taxCode, taxCodeNumber: numeric,
    isScottish: parsed.isScottish, isWelsh: parsed.isWelsh, isKCode: parsed.isKCode,
    isCumulative: cumulative, freePayToDatePence: freePay, grossPayToDatePence: grossToDate,
    taxablePayToDatePence: taxable,
    taxDueToDatePence: cumulative ? taxDue : priorTax + taxDue,
    taxPaidToDatePence: priorTax + periodTax, taxForPeriodPence: periodTax,
  };
}

// ─── Class 1 NI calculation ────────────────────────────────────────────────────

function calculateNI(
  input: EmployeeCalcInput,
  rs: PayrollRuleSet,
): NiCalculationDetail {
  const category = input.niCategory.toUpperCase();
  const catRates = rs.niCategories[category];
  if (!catRates) {
    return {
      status: 'unsupported_ni_category',
      category,
      method: input.niMethod,
      niableEarningsPeriodPence: input.grossPayPence,
      employeeNiPeriodPence: 0,
      employerNiPeriodPence: 0,
      employeeNiToDatePence: input.ytd.employeeNiToDatePence,
      employerNiToDatePence: input.ytd.employerNiToDatePence,
    };
  }

  // ── Director annual method ────────────────────────────────────────────────
  if (input.niMethod === 'director_annual') {
    const niableToDatePence =
      (input.directorNiableEarningsToDatePence ?? input.ytd.niableEarningsToDatePence) +
      input.grossPayPence;

    // Annual thresholds
    const lelPence = rs.niLelPencePerYear;
    const ptPence = rs.niPtPencePerYear;
    const stPence = rs.niStPencePerYear;
    const uelPence = rs.niUelPencePerYear;

    // Employee NI due to date
    const empNiDueToDate = calcNiOnBands(niableToDatePence, lelPence, ptPence, uelPence, catRates.lelToPtEmployee, catRates.ptToUelEmployee, catRates.aboveUelEmployee);
    const employeeNiPeriodPence = empNiDueToDate - input.ytd.employeeNiToDatePence;

    // Employer NI due to date
    const erNiDueToDate = calcNiOnBands(niableToDatePence, 0, stPence, uelPence, 0, catRates.stToUstEmployer, catRates.aboveUstEmployer);
    const employerNiPeriodPence = erNiDueToDate - input.ytd.employerNiToDatePence;

    return {
      status: 'calculated',
      category,
      method: 'director_annual',
      niableEarningsPeriodPence: input.grossPayPence,
      employeeNiPeriodPence,
      employerNiPeriodPence,
      employeeNiToDatePence: empNiDueToDate,
      employerNiToDatePence: erNiDueToDate,
    };
  }

  // ── Periodic method ───────────────────────────────────────────────────────
  // Use HMRC published monthly/weekly thresholds, never annual / 12 or / 52.
  const monthly = input.frequency === 'monthly';
  const weeks = input.frequency === 'fortnightly' ? 2 : input.frequency === 'four_weekly' ? 4 : 1;
  const multiWeek = (annual: number, weekly: number) => weeks === 1 ? weekly : Math.ceil(annual * weeks / 5200) * 100;
  const lelPeriod = monthly ? rs.niLelPencePerMonth : multiWeek(rs.niLelPencePerYear,rs.niLelPencePerWeek);
  const ptPeriod = monthly ? rs.niPtPencePerMonth : multiWeek(rs.niPtPencePerYear,rs.niPtPencePerWeek);
  const stPeriod = monthly ? rs.niStPencePerMonth : multiWeek(rs.niStPencePerYear,rs.niStPencePerWeek);
  const uelPeriod = monthly ? rs.niUelPencePerMonth : multiWeek(rs.niUelPencePerYear,rs.niUelPencePerWeek);

  const gross = input.grossPayPence;
  const employeeNiPeriodPence = calcNiOnBands(gross, lelPeriod, ptPeriod, uelPeriod, catRates.lelToPtEmployee, catRates.ptToUelEmployee, catRates.aboveUelEmployee);
  const employerNiPeriodPence = calcNiOnBands(gross, 0, stPeriod, uelPeriod, 0, catRates.stToUstEmployer, catRates.aboveUstEmployer);

  return {
    status: 'calculated',
    category,
    method: 'periodic',
    niableEarningsPeriodPence: gross,
    employeeNiPeriodPence,
    employerNiPeriodPence,
    employeeNiToDatePence: input.ytd.employeeNiToDatePence + employeeNiPeriodPence,
    employerNiToDatePence: input.ytd.employerNiToDatePence + employerNiPeriodPence,
  };
}

function calcNiOnBands(
  earningsPence: number,
  lowerThresholdPence: number,
  midThresholdPence: number,
  upperThresholdPence: number,
  rateBelowMid: number,
  rateMidToUpper: number,
  rateAboveUpper: number,
): number {
  if (earningsPence <= lowerThresholdPence) return 0;
  const low = Math.max(0, Math.min(earningsPence, midThresholdPence) - lowerThresholdPence);
  const middle = Math.max(0, Math.min(earningsPence, upperThresholdPence) - midThresholdPence);
  const high = Math.max(0, earningsPence - upperThresholdPence);
  // HMRC NI software guidance 2026/27 v1.1 §§4–5: inspect only the
  // third decimal place of pounds. Digits 0–5 round down, 6–9 up.
  // Contributions below and above UEL are rounded separately, then added.
  const roundNi = (pence: Decimal): number => pence.floor().plus(pence.times(10).floor().mod(10).gte(6) ? 1 : 0).toNumber();
  return roundNi(new Decimal(low).times(rateBelowMid).plus(new Decimal(middle).times(rateMidToUpper)))
    + roundNi(new Decimal(high).times(rateAboveUpper));
}

// ─── Student loan deductions ──────────────────────────────────────────────────

function calculateStudentLoan(
  grossPayPence: number,
  periodNumber: number,
  frequency: PayFrequency,
  plan: 1 | 2 | 4 | 5 | 'pg',
  rs: PayrollRuleSet,
): StudentLoanDetail {
  const periods = periodsPerYear(frequency);
  let annualThresholdPence: number;
  let rate: number;

  switch (plan) {
    case 1: annualThresholdPence = rs.studentLoanPlan1ThresholdPencePerYear; rate = rs.studentLoanPlan1Rate; break;
    case 2: annualThresholdPence = rs.studentLoanPlan2ThresholdPencePerYear; rate = rs.studentLoanPlan2Rate; break;
    case 4: annualThresholdPence = rs.studentLoanPlan4ThresholdPencePerYear; rate = rs.studentLoanPlan4Rate; break;
    case 5: annualThresholdPence = rs.studentLoanPlan5ThresholdPencePerYear; rate = rs.studentLoanPlan5Rate; break;
    case 'pg': annualThresholdPence = rs.postgraduateLoanThresholdPencePerYear; rate = rs.postgraduateLoanRate; break;
  }

  // Annualise pay for this period to find threshold
  // HMRC student-loan software specification §3: annual / number of
  // actual pay periods, rounding down to the penny only after division.
  const periodThresholdPence = Math.trunc(annualThresholdPence / periods);
  const repayableEarningsPence = Math.max(0, grossPayPence - periodThresholdPence);
  const deductionPence = new Decimal(repayableEarningsPence).times(rate).div(100).floor().times(100).toNumber();

  return {
    plan,
    status: 'calculated',
    deductionPence,
  };
}

// ─── Main calculation entry point ─────────────────────────────────────────────

export function calculatePayrollForEmployee(
  input: EmployeeCalcInput,
): PayrollCalculationResult {
  const rs = getRulesetForDate(input.paymentDate);
  if (!rs) {
    return makeUnsupportedResult(input, 'no_ruleset_for_date', `No payroll rules found for payment date ${input.paymentDate}`);
  }

  const warnings: string[] = [];

  const parsed = parseTaxCode(input.taxCode);
  if ((parsed.numeric == null && !parsed.is0T && !parsed.isBR && !parsed.isD0 && !parsed.isD1
    && !parsed.isD2 && !parsed.isD3 && !parsed.isNT) || (parsed.isNT && (parsed.isScottish || parsed.isWelsh))) {
    return makeUnsupportedResult(input, 'unsupported_tax_code', 'Record a supported HMRC tax code; no emergency code is invented.');
  }
  const periods = periodsPerYear(input.frequency);
  if (!Number.isSafeInteger(input.grossPayPence) || input.grossPayPence < 0 || input.grossPayPence > 1_000_000_000
    || !Number.isInteger(input.periodNumber) || input.periodNumber < 1 || input.periodNumber > periods
    || !['periodic', 'director_annual'].includes(input.niMethod)) {
    return makeUnsupportedResult(input, 'not_configured', 'Invalid pay/period or unsupported director alternative method.');
  }
  if (input.studentLoan.plans.some(p => ![1, 2, 4, 5].includes(p))) {
    return makeUnsupportedResult(input, 'unsupported_student_loan', 'Unsupported student loan plan.');
  }

  // PAYE
  const taxResult = calculatePAYE(input, rs);

  // NI
  const niResult = calculateNI(input, rs);

  // Student loans
  const studentLoanResults: StudentLoanDetail[] = [];
  if (input.studentLoan.plans.length > 0 || input.studentLoan.postgraduate) {
    const thresholds = new Map([[1, rs.studentLoanPlan1ThresholdPencePerYear], [2, rs.studentLoanPlan2ThresholdPencePerYear],
      [4, rs.studentLoanPlan4ThresholdPencePerYear], [5, rs.studentLoanPlan5ThresholdPencePerYear]]);
    // One undergraduate deduction at the LOWEST recovery threshold, plus PG.
    const plan = [...new Set(input.studentLoan.plans)].sort((a,b) => thresholds.get(a)! - thresholds.get(b)!)[0];
    if (plan != null) studentLoanResults.push(calculateStudentLoan(input.grossPayPence, input.periodNumber, input.frequency, plan, rs));
    if (input.studentLoan.postgraduate) {
      studentLoanResults.push(
        calculateStudentLoan(input.grossPayPence, input.periodNumber, input.frequency, 'pg', rs),
      );
    }
  }

  const totalStudentLoanPence = studentLoanResults.reduce((s, r) => s + r.deductionPence, 0);

  const totalEmployeeDeductionsPence =
    taxResult.taxForPeriodPence +
    niResult.employeeNiPeriodPence +
    totalStudentLoanPence;

  const netPayPence = input.grossPayPence - totalEmployeeDeductionsPence;

  if (taxResult.status !== 'calculated') warnings.push(`Tax: ${taxResult.status}`);
  if (niResult.status !== 'calculated') warnings.push(`NI: ${niResult.status}`);

  const overallStatus: CalculationSupportStatus =
    taxResult.status !== 'calculated'
      ? taxResult.status
      : niResult.status !== 'calculated'
        ? niResult.status
        : 'calculated';

  return {
    employeeId: input.employeeId,
    legalFirstName: input.legalFirstName,
    legalSurname: input.legalSurname,
    paymentDate: input.paymentDate,
    periodNumber: input.periodNumber,
    frequency: input.frequency,
    rulesetVersion: PAYROLL_CALCULATION_POLICY_VERSION,

    grossPayPence: input.grossPayPence,
    taxablePayPeriodPence: input.grossPayPence,

    tax: taxResult,
    ni: niResult,
    studentLoans: studentLoanResults,

    totalEmployeeDeductionsPence,
    employerNiPence: niResult.employerNiPeriodPence,
    netPayPence,
    totalStudentLoanPence,

    overallStatus,
    warnings,
  };
}

function makeUnsupportedResult(
  input: EmployeeCalcInput,
  status: CalculationSupportStatus,
  warning: string,
): PayrollCalculationResult {
  return {
    employeeId: input.employeeId,
    legalFirstName: input.legalFirstName,
    legalSurname: input.legalSurname,
    paymentDate: input.paymentDate,
    periodNumber: input.periodNumber,
    frequency: input.frequency,
    rulesetVersion: 'unavailable',
    grossPayPence: input.grossPayPence,
    taxablePayPeriodPence: 0,
    tax: {
      status,
      taxCodeUsed: input.taxCode,
      taxCodeNumber: null,
      isScottish: false, isWelsh: false, isKCode: false, isCumulative: false,
      freePayToDatePence: 0, grossPayToDatePence: 0, taxablePayToDatePence: 0,
      taxDueToDatePence: 0, taxPaidToDatePence: 0, taxForPeriodPence: 0,
    },
    ni: {
      status,
      category: input.niCategory,
      method: input.niMethod,
      niableEarningsPeriodPence: 0,
      employeeNiPeriodPence: 0, employerNiPeriodPence: 0,
      employeeNiToDatePence: 0, employerNiToDatePence: 0,
    },
    studentLoans: [],
    totalEmployeeDeductionsPence: 0,
    employerNiPence: 0,
    netPayPence: input.grossPayPence,
    totalStudentLoanPence: 0,
    overallStatus: status,
    warnings: [warning],
  };
}

/**
 * Converts pence integer to a GBP decimal string (e.g. 12345 → "123.45").
 */
export function penceToPounds(pence: number): string {
  return new Decimal(pence).dividedBy(100).toDecimalPlaces(2).toFixed(2);
}

/**
 * Converts a GBP decimal string to pence integer.
 */
export function poundsToPence(pounds: string): number {
  return new Decimal(pounds).times(100).toDecimalPlaces(0).toNumber();
}
