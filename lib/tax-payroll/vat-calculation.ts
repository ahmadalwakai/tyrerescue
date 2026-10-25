import 'server-only';

/**
 * VAT calculation service.
 *
 * Handles UK VAT obligations for a VAT-registered company.
 *
 * Source: HMRC VAT Notice 700 and VAT Act 1994.
 *
 * Rates for 2026-27:
 * - Standard rate: 20%
 * - Reduced rate:   5%
 * - Zero rate:      0%
 * - Exempt:         not taxable; no input tax reclaimed on these supplies
 *
 * This service:
 * - Calculates output VAT on sales
 * - Calculates input VAT recoverable on purchases
 * - Computes net VAT position (Box 1-9 VAT Return)
 * - Prepares a draft VAT Return record
 *
 * This service does NOT:
 * - Submit to HMRC (MTD adapter handles that)
 * - Create bank payment instructions
 * - Validate MTD authorisation tokens
 *
 * All amounts in pence.
 */

export type VatRate = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside_scope';

export interface VatRateConfig {
  code: VatRate;
  rate: number;
  description: string;
}

export const VAT_RATES: VatRateConfig[] = [
  { code: 'standard', rate: 0.20, description: '20% Standard Rate' },
  { code: 'reduced',  rate: 0.05, description: '5% Reduced Rate' },
  { code: 'zero',     rate: 0.00, description: '0% Zero Rate' },
  { code: 'exempt',   rate: 0.00, description: 'Exempt' },
  { code: 'outside_scope', rate: 0.00, description: 'Outside Scope' },
];

export function getRateValue(code: VatRate): number {
  return VAT_RATES.find((r) => r.code === code)?.rate ?? 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VatTransactionLine {
  description: string;
  netPence: number;
  vatPence: number;
  vatRate: VatRate;
  transactionDate: string;
  isOutput: boolean; // true = sales/output, false = purchases/input
  reference: string;
}

export interface VatReturnBoxes {
  box1OutputTaxPence: number;          // VAT due on sales
  box2AcquisitionTaxPence: number;     // VAT due on EU acquisitions (post-Brexit: typically 0)
  box3TotalOutputPence: number;        // box1 + box2
  box4InputTaxClaimedPence: number;    // VAT reclaimed on purchases
  box5NetVatPayablePence: number;      // box3 - box4 (positive = owe HMRC, negative = refund)
  box6TotalSalesNetPence: number;      // Net value of all sales (ex VAT)
  box7TotalPurchasesNetPence: number;  // Net value of all purchases (ex VAT)
  box8GoodsSuppliedNetPence: number;   // Net value of goods supplied to EU (typically 0)
  box9GoodsAcquiredNetPence: number;   // Net value of goods acquired from EU (typically 0)
}

export interface VatReturnDraft {
  companyId: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  boxes: VatReturnBoxes;
  transactionCount: number;
  calculatedAt: string;
  status: 'draft';
}

export class VatCalculationError extends Error {
  constructor(message: string, public readonly code: 'NO_TRANSACTION_DATA' | 'INVALID_TRANSACTION_DATA') {
    super(message);
    this.name = 'VatCalculationError';
  }
}

// ─── Calculation ──────────────────────────────────────────────────────────────

export function calculateVatReturn(
  companyId: string,
  periodKey: string,
  periodStart: string,
  periodEnd: string,
  dueDate: string,
  transactions: VatTransactionLine[],
): VatReturnDraft {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new VatCalculationError('VAT cannot be calculated without complete reconciled transaction records. No nil return is inferred.', 'NO_TRANSACTION_DATA');
  }
  for (const transaction of transactions) {
    if (!Number.isSafeInteger(transaction.netPence) || !Number.isSafeInteger(transaction.vatPence)
      || !VAT_RATES.some((rate) => rate.code === transaction.vatRate)
      || typeof transaction.isOutput !== 'boolean'
      || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.transactionDate)
      || !Number.isFinite(Date.parse(`${transaction.transactionDate}T00:00:00Z`))
      || new Date(`${transaction.transactionDate}T00:00:00Z`).toISOString().slice(0, 10) !== transaction.transactionDate
      || transaction.transactionDate < periodStart || transaction.transactionDate > periodEnd
      || !transaction.reference?.trim()) {
      throw new VatCalculationError('A VAT transaction is invalid or outside the selected period.', 'INVALID_TRANSACTION_DATA');
    }
  }
  let outputVatPence = 0;
  let inputVatPence = 0;
  let totalSalesNetPence = 0;
  let totalPurchasesNetPence = 0;

  for (const txn of transactions) {
    if (txn.isOutput) {
      outputVatPence += txn.vatPence;
      totalSalesNetPence += txn.netPence;
    } else {
      // Only standard, reduced, and zero-rated purchases yield recoverable input tax
      // Exempt and outside-scope: no input tax recovery
      if (txn.vatRate !== 'exempt' && txn.vatRate !== 'outside_scope') {
        inputVatPence += txn.vatPence;
      }
      totalPurchasesNetPence += txn.netPence;
    }
  }

  const box3 = outputVatPence; // + acquisitions (0 for domestic)
  const box5 = box3 - inputVatPence; // positive = owe, negative = refund
  if (![box3, box5, inputVatPence, totalSalesNetPence, totalPurchasesNetPence].every(Number.isSafeInteger)) {
    throw new VatCalculationError('VAT monetary totals exceed the supported range.', 'INVALID_TRANSACTION_DATA');
  }

  return {
    companyId,
    periodKey,
    periodStart,
    periodEnd,
    dueDate,
    boxes: {
      box1OutputTaxPence: outputVatPence,
      box2AcquisitionTaxPence: 0,
      box3TotalOutputPence: box3,
      box4InputTaxClaimedPence: inputVatPence,
      box5NetVatPayablePence: box5,
      box6TotalSalesNetPence: totalSalesNetPence,
      box7TotalPurchasesNetPence: totalPurchasesNetPence,
      box8GoodsSuppliedNetPence: 0,
      box9GoodsAcquiredNetPence: 0,
    },
    transactionCount: transactions.length,
    calculatedAt: new Date().toISOString(),
    status: 'draft',
  };
}

// ─── VAT accounting journal lines helper ────────────────────────────────────

/** Returns accounting journal impact for a VAT period settlement. */
export function vatJournalLines(boxes: VatReturnBoxes): Array<{ accountCode: string; debitPence: number; creditPence: number; narration: string }> {
  // When net VAT is payable to HMRC:
  // DR VAT Control (clears the balance)
  // CR Bank (when paid — but bank payment is NOT authorised in this phase)
  // We only record the control account clearance here.

  const vatNet = boxes.box5NetVatPayablePence;
  if (vatNet === 0) return [];

  if (vatNet > 0) {
    // Owe HMRC: debit VAT control, credit VAT Output Liability
    return [
      { accountCode: '2201', debitPence: vatNet, creditPence: 0, narration: 'VAT period settlement — net payable' },
      { accountCode: '2200', debitPence: 0, creditPence: vatNet, narration: 'VAT output tax liability' },
    ];
  }

  // Refund due: HMRC owes us
  return [
    { accountCode: '2201', debitPence: 0, creditPence: Math.abs(vatNet), narration: 'VAT period settlement — refund due' },
    { accountCode: '1210', debitPence: Math.abs(vatNet), creditPence: 0, narration: 'VAT input tax recoverable' },
  ];
}
