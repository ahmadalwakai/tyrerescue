import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { corporationTaxPeriods, taxAuditEvents, type CorporationTaxPeriod } from '@/lib/db/schema';
import { withTaxWriteTransaction } from './write-transaction';
import { calculateCorporationTax, mapToCtBoxes } from './corporation-tax-calculation';
import { isPayrollDate } from './tax-month';

const inputKeys = ['tradingProfitsPence', 'nonTradingIncomePence', 'chargeableGainsPence', 'exemptDistributionsPence', 'associatedCompanies'] as const;
const pence = z.number().int().min(0).max(2_000_000_000);
const inputSchema = z.object({
  tradingProfitsPence: pence,
  nonTradingIncomePence: pence,
  chargeableGainsPence: pence,
  exemptDistributionsPence: pence,
  associatedCompanies: z.number().int().min(0).max(10000),
}).strict();
export const ctEstimateUpdateSchema = inputSchema.partial().extend({ expectedVersion: z.number().int().min(1) }).strict()
  .refine((value) => inputKeys.some((key) => value[key] !== undefined), 'Supply at least one confirmed profit input');

export class CorporationTaxEstimateError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'CONFLICT_VERSION') {
    super(message); this.name = 'CorporationTaxEstimateError';
  }
}

function supportedPeriod(period: CorporationTaxPeriod): void {
  if (!isPayrollDate(period.periodStart) || !isPayrollDate(period.periodEnd) || period.periodStart > period.periodEnd
    || period.periodStart < '2025-04-01' || period.periodEnd > '2027-03-31') {
    throw new CorporationTaxEstimateError('This draft estimator supports verified ordinary UK Corporation Tax periods within 1 April 2025 to 31 March 2027 only.', 'VALIDATION_ERROR');
  }
  const anniversary = new Date(`${period.periodStart}T00:00:00Z`);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  if (period.periodEnd >= anniversary.toISOString().slice(0, 10)) {
    throw new CorporationTaxEstimateError('A Corporation Tax accounting period cannot exceed 12 months.', 'VALIDATION_ERROR');
  }
}

function periodInput(period: CorporationTaxPeriod) {
  const parsed = inputSchema.safeParse(Object.fromEntries(inputKeys.map((key) => [key, period[key]])));
  if (!parsed.success) throw new CorporationTaxEstimateError('All profit categories and the associated-company count must be confirmed. Loss relief and special company regimes require accountant review.', 'VALIDATION_ERROR');
  const input = { companyId: period.companyId, periodStart: period.periodStart, periodEnd: period.periodEnd, ...parsed.data };
  const augmented = input.tradingProfitsPence + input.nonTradingIncomePence + input.chargeableGainsPence + input.exemptDistributionsPence;
  if (!Number.isSafeInteger(augmented) || augmented > 2_000_000_000) throw new CorporationTaxEstimateError('The draft profit total exceeds the supported range.', 'VALIDATION_ERROR');
  return input;
}

function inputHash(input: ReturnType<typeof periodInput>) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/** A legacy row's default zeros do not prove that any accounting inputs exist. */
export function verifiedCtEstimate(period: CorporationTaxPeriod) {
  try {
    supportedPeriod(period);
    const input = periodInput(period);
    const boxes = period.ct600Boxes;
    if (!boxes || boxes._estimateInputVersion !== 1 || boxes._estimateInputHash !== inputHash(input)) return null;
    const calculation = calculateCorporationTax(input);
    if (period.taxableTotalProfitsPence !== calculation.taxableTotalProfitsPence
      || period.netCtPayablePence !== calculation.netCtPayablePence
      || period.marginalReliefPence !== calculation.marginalReliefPence
      || period.mainRateTaxPence !== calculation.mainRateTaxPence
      || period.rateApplied !== calculation.rateApplied
      || period.effectiveRateBps !== Math.round(calculation.effectiveRate * 10000)) return null;
    return calculation;
  } catch { return null; }
}

export async function getCtPeriod(companyId: string, periodId: string) {
  const [period] = await db.select().from(corporationTaxPeriods)
    .where(and(eq(corporationTaxPeriods.id, periodId), eq(corporationTaxPeriods.companyId, companyId))).limit(1);
  if (!period) throw new CorporationTaxEstimateError('Not found', 'NOT_FOUND');
  return period;
}

export async function updateCtEstimate(userId: string, companyId: string, periodId: string, raw: unknown) {
  const parsed = ctEstimateUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new CorporationTaxEstimateError(parsed.error.issues[0]?.message ?? 'Invalid estimate inputs', 'VALIDATION_ERROR');
  return withTaxWriteTransaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM corporation_tax_periods WHERE id=${periodId}::uuid AND company_id=${companyId}::uuid FOR UPDATE`);
    const [period] = await tx.select().from(corporationTaxPeriods)
      .where(and(eq(corporationTaxPeriods.id, periodId), eq(corporationTaxPeriods.companyId, companyId))).limit(1);
    if (!period) throw new CorporationTaxEstimateError('Not found', 'NOT_FOUND');
    if (period.status !== 'open' && period.status !== 'draft') throw new CorporationTaxEstimateError('Only an open draft accounting period can be changed.', 'VALIDATION_ERROR');
    if (period.version !== parsed.data.expectedVersion) throw new CorporationTaxEstimateError('Version conflict. Reload the accounting period.', 'CONFLICT_VERSION');
    supportedPeriod(period);
    if (!verifiedCtEstimate(period) && inputKeys.some((key) => parsed.data[key] === undefined)) {
      throw new CorporationTaxEstimateError('The first estimate requires every profit category and the associated-company count explicitly, including confirmed zeros. Missing data is not zero.', 'VALIDATION_ERROR');
    }
    const updatedInputs = Object.fromEntries(inputKeys.map((key) => [key, parsed.data[key] ?? period[key]]));
    const input = periodInput({ ...period, ...updatedInputs });
    const calculation = calculateCorporationTax(input);
    const hash = inputHash(input);
    const [saved] = await tx.update(corporationTaxPeriods).set({
      ...updatedInputs,
      taxableTotalProfitsPence: calculation.taxableTotalProfitsPence,
      netCtPayablePence: calculation.netCtPayablePence,
      marginalReliefPence: calculation.marginalReliefPence,
      mainRateTaxPence: calculation.mainRateTaxPence,
      rateApplied: calculation.rateApplied,
      effectiveRateBps: Math.round(calculation.effectiveRate * 10000),
      ct600Boxes: { ...mapToCtBoxes(calculation, input.associatedCompanies), _estimateInputVersion: 1,
        _estimateInputHash: hash, _inputSource: 'manually_confirmed_accounting_inputs' },
      calculatedByUserId: userId, version: period.version + 1, updatedAt: new Date(),
    }).where(and(eq(corporationTaxPeriods.id, periodId), eq(corporationTaxPeriods.companyId, companyId),
      eq(corporationTaxPeriods.version, parsed.data.expectedVersion))).returning();
    if (!saved) throw new CorporationTaxEstimateError('Version conflict. Reload the accounting period.', 'CONFLICT_VERSION');
    await tx.insert(taxAuditEvents).values({ companyId, eventType: 'corporation_tax_estimate_saved', actorUserId: userId,
      payload: { periodId, inputHash: hash, previousVersion: period.version, newVersion: saved.version } });
    return { calculation, newVersion: saved.version, calculationStatus: 'estimate', hmrcVerified: false,
      message: 'Draft estimate from manually confirmed accounting inputs. Not an HMRC balance, monthly payment demand or filed CT600.' };
  });
}
