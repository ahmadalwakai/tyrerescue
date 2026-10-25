import 'server-only';

/**
 * Corporation Tax calculation service.
 *
 * Phase 5: CT600 figures, Marginal Relief, Small Profits Rate.
 *
 * Source: Finance Act 2023; HMRC CT600 Guide 2026-27
 * Rates effective from 1 April 2023 onwards:
 * - Small profits rate: 19% (profits ≤ £50,000 upper/lower limits adjusted for APs)
 * - Main rate: 25% (profits > £250,000 upper/lower limits adjusted)
 * - Marginal Relief between £50,000 and £250,000
 * - Associated companies reduce the thresholds
 *
 * Marginal Relief formula:
 *   MR = (U − P) × N/A × F
 *   where:
 *     U = upper threshold (£250,000 standard)
 *     P = profits (total of taxable profits + exempt distributions)
 *     N = TTP (trading + investment profits)
 *     A = augmented profits (N + exempt distributions)
 *     F = Marginal Relief fraction (3/200 for 2023 onwards)
 *
 * This service does NOT:
 * - Submit to HMRC
 * - File CT600 forms
 * - Generate iXBRL accounts (separate filing phase)
 *
 * All amounts in pence.
 */

// ─── Rates ────────────────────────────────────────────────────────────────────

export const CT_RATES_2023_PLUS = {
  effectiveFrom: '2023-04-01',
  smallProfitsRate: 0.19,
  mainRate: 0.25,
  marginalReliefFraction: 3 / 200,            // 3/200 = 0.015
  standardLowerThresholdPence: 5_000_000,     // £50,000/year
  standardUpperThresholdPence: 25_000_000,    // £250,000/year
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CtPeriodInput {
  companyId: string;
  /** Accounting period start date. */
  periodStart: string; // YYYY-MM-DD
  /** Accounting period end date. Must be ≤ 12 months. */
  periodEnd: string;
  /** Trading profits for the period (pence). Losses are negative. */
  tradingProfitsPence: number;
  /** Non-trading income (e.g. interest, rental) in pence. */
  nonTradingIncomePence: number;
  /** Chargeable gains in pence. */
  chargeableGainsPence: number;
  /** Franked Investment Income / exempt distributions (for augmented profits calc). */
  exemptDistributionsPence: number;
  /** Number of 51%+ associated companies (reduces thresholds). 0 if none. */
  associatedCompanies: number;
}

export interface CtCalculationResult {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  /** Trading + non-trading + gains. Does not include exempt distributions. */
  taxableTotalProfitsPence: number;
  /** Taxable total profits + exempt distributions (for marginal relief). */
  augmentedProfitsPence: number;
  /** Thresholds pro-rated for period length and associated companies. */
  proRatedLowerThresholdPence: number;
  proRatedUpperThresholdPence: number;
  rateApplied: 'small_profits' | 'main' | 'marginal_relief';
  mainRateTaxPence: number;
  marginalReliefPence: number;
  netCtPayablePence: number;
  effectiveRate: number;
  calculatedAt: string;
}

// ─── Calculation ──────────────────────────────────────────────────────────────

export function calculateCorporationTax(input: CtPeriodInput): CtCalculationResult {
  const rates = CT_RATES_2023_PLUS;

  // Period length in days
  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);
  const periodDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const yearFraction = periodDays / 365;

  // Associated companies: divide thresholds by (1 + associated)
  const divisor = 1 + Math.max(0, input.associatedCompanies);

  // Pro-rate thresholds for period and associated companies
  const proRatedLower = Math.trunc(rates.standardLowerThresholdPence * yearFraction / divisor);
  const proRatedUpper = Math.trunc(rates.standardUpperThresholdPence * yearFraction / divisor);

  // Taxable total profits
  const taxableTotalProfits = Math.max(
    0,
    input.tradingProfitsPence + input.nonTradingIncomePence + input.chargeableGainsPence,
  );

  // Augmented profits (for marginal relief boundary test)
  const augmentedProfits = taxableTotalProfits + Math.max(0, input.exemptDistributionsPence);

  if (taxableTotalProfits === 0) {
    return {
      companyId: input.companyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      periodDays,
      taxableTotalProfitsPence: 0,
      augmentedProfitsPence: 0,
      proRatedLowerThresholdPence: proRatedLower,
      proRatedUpperThresholdPence: proRatedUpper,
      rateApplied: 'small_profits',
      mainRateTaxPence: 0,
      marginalReliefPence: 0,
      netCtPayablePence: 0,
      effectiveRate: 0,
      calculatedAt: new Date().toISOString(),
    };
  }

  let mainRateTax: number;
  let marginalRelief: number;
  let rateApplied: CtCalculationResult['rateApplied'];

  if (augmentedProfits <= proRatedLower) {
    // Small profits rate
    mainRateTax = Math.trunc(taxableTotalProfits * rates.smallProfitsRate);
    marginalRelief = 0;
    rateApplied = 'small_profits';
  } else if (augmentedProfits >= proRatedUpper) {
    // Main rate — no marginal relief
    mainRateTax = Math.trunc(taxableTotalProfits * rates.mainRate);
    marginalRelief = 0;
    rateApplied = 'main';
  } else {
    // Marginal Relief band
    // First apply main rate to taxable total profits
    mainRateTax = Math.trunc(taxableTotalProfits * rates.mainRate);

    // Marginal Relief:
    // MR = (U − A) × N/A × F
    // U = proRatedUpper, A = augmentedProfits, N = taxableTotalProfits, F = 3/200
    marginalRelief = Math.trunc(
      (proRatedUpper - augmentedProfits) *
      (taxableTotalProfits / augmentedProfits) *
      rates.marginalReliefFraction,
    );
    rateApplied = 'marginal_relief';
  }

  const netCtPayable = mainRateTax - marginalRelief;
  const effectiveRate = taxableTotalProfits > 0 ? netCtPayable / taxableTotalProfits : 0;

  return {
    companyId: input.companyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    periodDays,
    taxableTotalProfitsPence: taxableTotalProfits,
    augmentedProfitsPence: augmentedProfits,
    proRatedLowerThresholdPence: proRatedLower,
    proRatedUpperThresholdPence: proRatedUpper,
    rateApplied,
    mainRateTaxPence: mainRateTax,
    marginalReliefPence: marginalRelief,
    netCtPayablePence: netCtPayable,
    effectiveRate,
    calculatedAt: new Date().toISOString(),
  };
}

// ─── CT600 box mapping ────────────────────────────────────────────────────────

/**
 * Maps calculation result to CT600 boxes (indicative — full CT600 has ~400 boxes).
 * Returns only the boxes computed by this service; others remain blank.
 */
export function mapToCtBoxes(result: CtCalculationResult, associatedCompanies?: number): Record<string, string | number> {
  return {
    'box155': result.periodStart,                                        // AP start
    'box160': result.periodEnd,                                          // AP end
    'box235': (result.taxableTotalProfitsPence / 100).toFixed(2),        // Taxable total profits
    'box285': (result.mainRateTaxPence / 100).toFixed(2),                // FY1/FY2 main rate tax
    'box390': (result.marginalReliefPence / 100).toFixed(2),             // Marginal Relief
    'box430': (result.netCtPayablePence / 100).toFixed(2),               // CT payable
    ...(associatedCompanies !== undefined ? { 'box690': associatedCompanies } : {}),
  };
}
