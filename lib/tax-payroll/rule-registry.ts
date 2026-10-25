import 'server-only';

/**
 * Official HMRC tax and NI rates for 2026-27.
 *
 * Source: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
 * Retrieved: 2026-10-13
 * Tax year: 6 April 2026 – 5 April 2027
 *
 * These are statutory rates. Any future year must be added as a new versioned
 * entry. Never edit an applied rate entry in place — add a new one.
 *
 * IMPORTANT: These rates must not be overridden by admin UI or AI input.
 * Only source-verified, tested updates activate a new rate entry.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaxBand {
  /** Upper limit of this band in pence per year. null = unlimited. */
  upperLimitPencePerYear: number | null;
  /** Rate as a decimal (e.g. 0.20 for 20%). */
  rate: number;
}

export interface NiCategoryRates {
  /** Rate on earnings between LEL and PT (employee). */
  lelToPtEmployee: number;
  /** Rate on earnings between PT and UEL (employee). */
  ptToUelEmployee: number;
  /** Rate on earnings above UEL (employee). */
  aboveUelEmployee: number;
  /** Rate on earnings between ST and upper limits (employer). */
  stToUstEmployer: number;
  /** Rate on earnings above upper secondary thresholds (employer). */
  aboveUstEmployer: number;
}

export interface NiThresholdsForFrequency {
  lelPencePerPeriod: number;
  ptPencePerPeriod: number;
  stPencePerPeriod: number;
  ustPencePerPeriod: number;
  uelPencePerPeriod: number;
}

export interface PayrollRuleSet {
  taxYear: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceUrl: string;
  retrievedDate: string;

  /** Personal Allowance in pence per year. */
  personalAllowancePencePerYear: number;

  /** Income above which personal allowance tapers (£1 reduction per £2 earned). */
  paAbatementThresholdPencePerYear: number;

  /** Point at which personal allowance reaches zero. */
  paNilThresholdPencePerYear: number;

  /**
   * England & Northern Ireland / Wales tax bands.
   * Applied to taxable income = gross pay - free pay.
   * Lower limit of first band is £0 (above free pay).
   */
  englandNiBands: TaxBand[];

  /** Scotland tax bands (same personal allowance but different bands). */
  scotlandBands: TaxBand[];

  /** Welsh tax bands (same as England for 2026-27). */
  walesBands: TaxBand[];

  // ── NI thresholds (annual in pence) ─────────────────────────────────────
  niLelPencePerYear: number;
  niPtPencePerYear: number;
  niStPencePerYear: number;
  niUstPencePerYear: number;
  niUelPencePerYear: number;

  // ── NI weekly thresholds in pence (HMRC published) ──────────────────────
  niLelPencePerWeek: number;
  niPtPencePerWeek: number;
  niStPencePerWeek: number;
  niUstPencePerWeek: number;
  niUelPencePerWeek: number;

  // ── NI monthly thresholds in pence ──────────────────────────────────────
  niLelPencePerMonth: number;
  niPtPencePerMonth: number;
  niStPencePerMonth: number;
  niUstPencePerMonth: number;
  niUelPencePerMonth: number;

  /** NI rates by category code. */
  niCategories: Record<string, NiCategoryRates>;

  /** Employer NI rate above secondary threshold (standard). */
  employerNiMainRate: number;

  // ── Student loan thresholds (annual in pence) ────────────────────────────
  studentLoanPlan1ThresholdPencePerYear: number;
  studentLoanPlan2ThresholdPencePerYear: number;
  studentLoanPlan4ThresholdPencePerYear: number;
  studentLoanPlan5ThresholdPencePerYear: number;
  postgraduateLoanThresholdPencePerYear: number;

  studentLoanPlan1Rate: number;
  studentLoanPlan2Rate: number;
  studentLoanPlan4Rate: number;
  studentLoanPlan5Rate: number;
  postgraduateLoanRate: number;

  // ── National Living/Minimum Wage (hourly in pence) ──────────────────────
  nmwAged21PlusPencePerHour: number;
  nmwAged18to20PencePerHour: number;
  nmwUnder18PencePerHour: number;
  nmwApprenticeRatePencePerHour: number;

  // ── Employer NI Employment Allowance (not auto-granted) ─────────────────
  employmentAllowanceMaxPencePerYear: number;
}

// ─── 2026-27 Rate Set ─────────────────────────────────────────────────────────

const RULESET_2026_27: PayrollRuleSet = {
  taxYear: '2026-27',
  effectiveFrom: '2026-04-06',
  effectiveTo: '2027-04-05',
  sourceUrl: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
  retrievedDate: '2026-10-21',

  // Personal Allowance £12,570 — unchanged from 2025-26
  personalAllowancePencePerYear: 1_257_000,
  paAbatementThresholdPencePerYear: 10_000_000, // £100,000
  paNilThresholdPencePerYear: 12_514_000, // £125,140

  // England & Northern Ireland bands (above personal allowance)
  englandNiBands: [
    { upperLimitPencePerYear: 3_770_000, rate: 0.20 }, // Basic: up to £37,700
    { upperLimitPencePerYear: 12_514_000, rate: 0.40 }, // Higher: up to £125,140
    { upperLimitPencePerYear: null, rate: 0.45 },       // Additional: above £125,140
  ],

  // Scotland bands (above Scottish personal allowance = same £12,570)
  // Source: Retrieved HMRC page 2026-10-13
  scotlandBands: [
    { upperLimitPencePerYear: 396_700, rate: 0.19 },   // Starter: up to £3,967
    { upperLimitPencePerYear: 1_695_600, rate: 0.20 }, // Basic: up to £16,956
    { upperLimitPencePerYear: 3_109_200, rate: 0.21 }, // Intermediate: up to £31,092
    { upperLimitPencePerYear: 6_243_000, rate: 0.42 }, // Higher: up to £62,430
    { upperLimitPencePerYear: 12_514_000, rate: 0.45 }, // Advanced: up to £125,140
    { upperLimitPencePerYear: null, rate: 0.48 },      // Top: above £125,140
  ],

  // Wales — same bands as England for 2026-27
  walesBands: [
    { upperLimitPencePerYear: 3_770_000, rate: 0.20 },
    { upperLimitPencePerYear: 12_514_000, rate: 0.40 },
    { upperLimitPencePerYear: null, rate: 0.45 },
  ],

  // NI thresholds — source: HMRC page 2026-10-13
  niLelPencePerYear: 670_800,   // £6,708/year
  niPtPencePerYear: 1_257_000,  // £12,570/year
  niStPencePerYear: 500_000,    // £5,000/year (reduced in April 2025 Budget)
  niUstPencePerYear: 5_027_000, // £50,270/year
  niUelPencePerYear: 5_027_000, // £50,270/year (same as UST for 2026-27)

  niLelPencePerWeek: 12_900,  // £129/week
  niPtPencePerWeek: 24_200,   // £242/week
  niStPencePerWeek: 9_600,    // £96/week
  niUstPencePerWeek: 96_700,  // £967/week (under 21 / apprentice / veteran)
  niUelPencePerWeek: 96_700,  // £967/week

  niLelPencePerMonth: 55_900,  // £559/month
  niPtPencePerMonth: 104_800,  // £1,048/month
  niStPencePerMonth: 41_700,   // £417/month
  niUstPencePerMonth: 418_900, // £4,189/month
  niUelPencePerMonth: 418_900, // £4,189/month

  // NI category rates — source: HMRC page 2026-10-13
  // Rate columns: lelToPt | ptToUel | aboveUel (employee)
  //               stToUst | aboveUst (employer)
  niCategories: {
    // Category A: standard employees
    A: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.08,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0.15,
      aboveUstEmployer: 0.15,
    },
    // Category B: married women/widows with reduced rate election
    B: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.0185,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0.15,
      aboveUstEmployer: 0.15,
    },
    // Category C: employees above State Pension age — no employee NI
    C: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0,
      aboveUelEmployee: 0,
      stToUstEmployer: 0.15,
      aboveUstEmployer: 0.15,
    },
    // Category H: apprentices under 25 — reduced employer NI up to AUST
    H: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.08,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0,      // 0% up to upper secondary threshold
      aboveUstEmployer: 0.15,
    },
    // Category J: employees who can defer NI (paying at another employment)
    J: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.02,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0.15,
      aboveUstEmployer: 0.15,
    },
    // Category M: employees under 21 — reduced employer NI up to AUST
    M: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.08,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0,
      aboveUstEmployer: 0.15,
    },
    // Category Z: employees under 21 with employee deferral
    Z: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.02,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0,
      aboveUstEmployer: 0.15,
    },
    // Category V: veterans in first year of civilian employment — 0% employer NI
    V: {
      lelToPtEmployee: 0,
      ptToUelEmployee: 0.08,
      aboveUelEmployee: 0.02,
      stToUstEmployer: 0,
      aboveUstEmployer: 0.15,
    },
  },

  employerNiMainRate: 0.15, // 15% — increased from April 2025

  // Student loan thresholds 2026-27 (annual)
  // Published HMRC values, verified 21 October 2026; never extrapolate future years.
  studentLoanPlan1ThresholdPencePerYear: 2_690_000,
  studentLoanPlan2ThresholdPencePerYear: 2_938_500,
  studentLoanPlan4ThresholdPencePerYear: 3_379_500,
  studentLoanPlan5ThresholdPencePerYear: 2_500_000,  // £25,000 (Plan 5 — new system starters)
  postgraduateLoanThresholdPencePerYear: 2_100_000,

  studentLoanPlan1Rate: 0.09,
  studentLoanPlan2Rate: 0.09,
  studentLoanPlan4Rate: 0.09,
  studentLoanPlan5Rate: 0.09,
  postgraduateLoanRate: 0.06,

  // National Living/Minimum Wage 2026-27
  nmwAged21PlusPencePerHour: 1271, // £12.71/hour
  nmwAged18to20PencePerHour: 1085, // £10.85/hour
  nmwUnder18PencePerHour: 800,     // £8.00/hour
  nmwApprenticeRatePencePerHour: 800, // £8.00/hour

  // Employment Allowance (£10,500 for 2026-27 — not auto-granted)
  employmentAllowanceMaxPencePerYear: 1_050_000,
};

// ─── Registry lookup ──────────────────────────────────────────────────────────

const ALL_RULESETS: PayrollRuleSet[] = [RULESET_2026_27];

export function getRulesetForDate(dateStr: string): PayrollRuleSet | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== dateStr) return null;
  for (const rs of ALL_RULESETS) {
    if (dateStr >= rs.effectiveFrom && dateStr <= rs.effectiveTo) return rs;
  }
  return null;
}

export function getRulesetForTaxYear(taxYear: string): PayrollRuleSet | null {
  return ALL_RULESETS.find((rs) => rs.taxYear === taxYear) ?? null;
}

export function getRuleset2026_27(): PayrollRuleSet {
  return RULESET_2026_27;
}

/**
 * Derives the HMRC tax year string from a payment date.
 * A tax year runs 6 April to 5 April.
 */
export function taxYearForDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const taxYearStart = month > 4 || (month === 4 && day >= 6) ? year : year - 1;
  return `${taxYearStart}-${String(taxYearStart + 1).slice(2)}`;
}

/**
 * Returns the tax week number (1–52/53) for a payment date.
 * Week 1 starts on 6 April.
 */
export function taxWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  const taxYearStart = new Date(
    `${month > 4 || (month === 4 && parseInt(dateStr.slice(8, 10)) >= 6) ? year : year - 1}-04-06T00:00:00Z`,
  );
  const diffMs = d.getTime() - taxYearStart.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

/**
 * Returns the tax month number (1–12) for a payment date.
 * Month 1 = 6 April – 5 May, etc.
 */
export function taxMonthNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const tyStart = month > 4 || (month === 4 && day >= 6) ? year : year - 1;
  const tyStartDate = new Date(`${tyStart}-04-06T00:00:00Z`);
  const diffMs = d.getTime() - tyStartDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 30.4375) + 1; // approximate; HMRC uses 5th of each month
}

/**
 * Returns exact HMRC tax month (1–12) based on month boundaries.
 * Month 1: 6 April – 5 May
 * Month 2: 6 May – 5 June, etc.
 */
export function exactTaxMonth(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getUTCMonth() + 1; // 1-12
  const day = d.getUTCDate();
  // Tax month boundaries: 6th of month to 5th of next month
  // Month 1 = Apr 6 - May 5 => calendar month 4, from day 6
  // Map: Apr(6+) = 1, May(6+) = 2, ... Mar(6+) = 12
  const taxMonth = day >= 6 ? month - 3 : month - 4;
  const normalised = ((taxMonth - 1 + 12) % 12) + 1;
  return normalised;
}

export function freePay(
  taxCodeNumber: number,
  period: number,
  periodsPerYear: number,
): number {
  return freePayForPeriod(taxCodeNumber, periodsPerYear) * period;
}

export function freePayForPeriod(
  taxCodeNumber: number,
  periodsPerYear: number,
): number {
  if (periodsPerYear === 26) return freePayForPeriod(taxCodeNumber, 52) * 2;
  if (periodsPerYear === 13) return freePayForPeriod(taxCodeNumber, 52) * 4;
  if (taxCodeNumber === 0) return 0;
  // HMRC PAYErout v24 §4.3.1: split codes above 500, round each
  // component UP to the penny, then multiply the period-one value.
  const blocks = Math.floor((taxCodeNumber - 1) / 500);
  const remainder = taxCodeNumber - blocks * 500;
  return blocks * Math.ceil(500_000 / periodsPerYear)
    + Math.ceil((remainder * 10 + 9) * 100 / periodsPerYear);
}

/**
 * Apply income tax bands to a taxable income amount.
 * @param taxableIncomePence Taxable income in pence.
 * @param bands Array of bands in ascending order.
 * @returns Tax in pence.
 */
export function applyTaxBands(taxableIncomePence: number, bands: TaxBand[]): number {
  if (taxableIncomePence <= 0) return 0;
  let remaining = taxableIncomePence;
  let previousUpper = 0;
  let tax = 0;
  for (const band of bands) {
    const bandWidth =
      band.upperLimitPencePerYear != null
        ? band.upperLimitPencePerYear - previousUpper
        : Infinity;
    const inBand = Math.min(remaining, bandWidth);
    tax += Math.trunc(inBand * band.rate);
    remaining -= inBand;
    if (band.upperLimitPencePerYear != null) {
      previousUpper = band.upperLimitPencePerYear;
    }
    if (remaining <= 0) break;
  }
  return tax;
}

export { RULESET_2026_27, ALL_RULESETS };
