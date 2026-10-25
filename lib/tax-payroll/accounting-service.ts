import 'server-only';

/**
 * Accounting foundations — double-entry ledger and journal service.
 *
 * Phase 3A: chart of accounts, journal entries, trial balance.
 *
 * Uses double-entry bookkeeping (every debit has a matching credit).
 * All amounts are stored in pence. All journal entries are immutable
 * once posted; corrections are made via reversals.
 *
 * Does NOT:
 * - Initiate bank transfers or payments
 * - Connect to bank APIs
 * - Generate final accounts for filing (Companies House or HMRC)
 */

import { db } from '@/lib/db';
import {
  ledgerAccounts,
  journalEntries,
  journalLines,
  taxAuditEvents,
} from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

// ─── Chart of accounts ────────────────────────────────────────────────────────

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense';

export type NormalBalance = 'debit' | 'credit';

export interface LedgerAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentCode: string | null;
  isSystemAccount: boolean;
  version: number;
}

// System account codes — these are provisioned automatically
export const SYSTEM_ACCOUNTS = {
  // Payroll liabilities
  PAYE_LIABILITY: '2100',
  EMPLOYEE_NI_LIABILITY: '2101',
  EMPLOYER_NI_LIABILITY: '2102',
  PENSION_LIABILITY: '2103',
  STUDENT_LOAN_LIABILITY: '2104',
  NET_WAGES_CONTROL: '2105',

  // Payroll expenses
  WAGES_EXPENSE: '7000',
  EMPLOYER_NI_EXPENSE: '7001',
  EMPLOYER_PENSION_EXPENSE: '7002',

  // VAT
  VAT_OUTPUT_LIABILITY: '2200',
  VAT_INPUT_ASSET: '1210',
  VAT_CONTROL: '2201',

  // Corporation tax
  CORPORATION_TAX_LIABILITY: '2300',
  CORPORATION_TAX_EXPENSE: '7100',

  // Cash/bank
  BANK_CURRENT: '1000',
} as const;

export type SystemAccountCode = typeof SYSTEM_ACCOUNTS[keyof typeof SYSTEM_ACCOUNTS];

// ─── Journal entries ──────────────────────────────────────────────────────────

export interface JournalLineInput {
  accountCode: string;
  debitPence: number;
  creditPence: number;
  narration?: string;
}

export interface PostJournalInput {
  companyId: string;
  actorUserId: string;
  reference: string;
  referenceType: 'payroll_run' | 'vat_return' | 'corporation_tax' | 'bank_import' | 'manual';
  transactionDate: string; // YYYY-MM-DD
  narration: string;
  lines: JournalLineInput[];
}

export interface PostedJournal {
  id: string;
  companyId: string;
  reference: string;
  referenceType: string;
  transactionDate: string;
  narration: string;
  postedAt: string;
  lineCount: number;
  totalDebitPence: number;
}

export class AccountingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNBALANCED_ENTRY'
      | 'ACCOUNT_NOT_FOUND'
      | 'DUPLICATE_REFERENCE'
      | 'IMMUTABLE_ENTRY'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'AccountingError';
  }
}

// ─── Provision system accounts ────────────────────────────────────────────────

export async function provisionSystemAccounts(companyId: string, actorUserId: string): Promise<void> {
  const definitions: Array<{
    code: string;
    name: string;
    accountType: AccountType;
    normalBalance: NormalBalance;
    parentCode: string | null;
  }> = [
    { code: SYSTEM_ACCOUNTS.BANK_CURRENT, name: 'Current Account', accountType: 'asset', normalBalance: 'debit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.VAT_INPUT_ASSET, name: 'VAT Input Tax Recoverable', accountType: 'asset', normalBalance: 'debit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.PAYE_LIABILITY, name: 'PAYE Liability', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.EMPLOYEE_NI_LIABILITY, name: 'Employee NI Liability', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.EMPLOYER_NI_LIABILITY, name: 'Employer NI Liability', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.PENSION_LIABILITY, name: 'Pension Contributions Payable', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.STUDENT_LOAN_LIABILITY, name: 'Student Loan Deductions Payable', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.NET_WAGES_CONTROL, name: 'Net Wages Control', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.VAT_OUTPUT_LIABILITY, name: 'VAT Output Tax Collected', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.VAT_CONTROL, name: 'VAT Control Account', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.CORPORATION_TAX_LIABILITY, name: 'Corporation Tax Payable', accountType: 'liability', normalBalance: 'credit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.WAGES_EXPENSE, name: 'Wages & Salaries', accountType: 'expense', normalBalance: 'debit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.EMPLOYER_NI_EXPENSE, name: 'Employer National Insurance', accountType: 'expense', normalBalance: 'debit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.EMPLOYER_PENSION_EXPENSE, name: 'Employer Pension Contributions', accountType: 'expense', normalBalance: 'debit', parentCode: null },
    { code: SYSTEM_ACCOUNTS.CORPORATION_TAX_EXPENSE, name: 'Corporation Tax Charge', accountType: 'expense', normalBalance: 'debit', parentCode: null },
  ];

  for (const def of definitions) {
    // Upsert: insert if not exists (ignore conflict on company_id + code)
    await db
      .insert(ledgerAccounts)
      .values({
        companyId,
        code: def.code,
        name: def.name,
        accountType: def.accountType,
        normalBalance: def.normalBalance,
        parentCode: def.parentCode,
        isSystemAccount: true,
        version: 1,
      })
      .onConflictDoNothing();
  }

  await db.insert(taxAuditEvents).values({
    companyId,
    eventType: 'ledger_provisioned',
    actorUserId,
    payload: { accountCount: definitions.length },
  });
}

// ─── Post a double-entry journal ──────────────────────────────────────────────

export async function postJournal(input: PostJournalInput): Promise<PostedJournal> {
  // Validate balance
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    totalDebit += line.debitPence;
    totalCredit += line.creditPence;
  }
  if (totalDebit !== totalCredit) {
    throw new AccountingError(
      `Journal entry is unbalanced: debits ${totalDebit} ≠ credits ${totalCredit}`,
      'UNBALANCED_ENTRY',
    );
  }

  // Resolve account codes → IDs
  const codes = input.lines.map((l) => l.accountCode);
  const accounts = await db
    .select()
    .from(ledgerAccounts)
    .where(
      and(
        eq(ledgerAccounts.companyId, input.companyId),
        inArray(ledgerAccounts.code, codes),
      ),
    );

  const accountMap = new Map(accounts.map((a) => [a.code, a]));
  for (const code of codes) {
    if (!accountMap.has(code)) {
      throw new AccountingError(`Account code not found: ${code}`, 'ACCOUNT_NOT_FOUND');
    }
  }

  const { randomUUID } = await import('crypto');
  const journalId = randomUUID();
  const now = new Date();

  await db.insert(journalEntries).values({
    id: journalId,
    companyId: input.companyId,
    reference: input.reference,
    referenceType: input.referenceType,
    transactionDate: input.transactionDate,
    narration: input.narration,
    postedAt: now,
    postedByUserId: input.actorUserId,
  });

  for (const line of input.lines) {
    const account = accountMap.get(line.accountCode)!;
    await db.insert(journalLines).values({
      id: randomUUID(),
      journalId,
      companyId: input.companyId,
      accountId: account.id,
      accountCode: line.accountCode,
      debitPence: line.debitPence,
      creditPence: line.creditPence,
      narration: line.narration ?? null,
    });
  }

  return {
    id: journalId,
    companyId: input.companyId,
    reference: input.reference,
    referenceType: input.referenceType,
    transactionDate: input.transactionDate,
    narration: input.narration,
    postedAt: now.toISOString(),
    lineCount: input.lines.length,
    totalDebitPence: totalDebit,
  };
}

// ─── Payroll journal posting helper ──────────────────────────────────────────

export interface PayrollJournalInput {
  companyId: string;
  actorUserId: string;
  runId: string;
  paymentDate: string;
  grossWagesPence: number;
  taxPence: number;
  employeeNiPence: number;
  employerNiPence: number;
  employeePensionPence: number;
  employerPensionPence: number;
  studentLoanPence: number;
  netPayPence: number;
}

export async function postPayrollJournal(input: PayrollJournalInput): Promise<PostedJournal> {
  const {
    grossWagesPence,
    taxPence,
    employeeNiPence,
    employerNiPence,
    employeePensionPence,
    employerPensionPence,
    studentLoanPence,
    netPayPence,
  } = input;

  // Double-entry for payroll:
  // DR Wages Expense (gross)
  // DR Employer NI Expense
  // DR Employer Pension Expense
  //   CR PAYE Liability (tax)
  //   CR Employee NI Liability
  //   CR Employer NI Liability
  //   CR Pension Liability (employee + employer)
  //   CR Student Loan Liability
  //   CR Net Wages Control (net pay)

  const totalDebit = grossWagesPence + employerNiPence + employerPensionPence;
  const totalCredit = taxPence + employeeNiPence + employerNiPence + employeePensionPence + employerPensionPence + studentLoanPence + netPayPence;

  // Sanity: gross + employer costs = all liabilities
  if (totalDebit !== totalCredit) {
    throw new AccountingError(
      `Payroll journal input is inconsistent: gross+er_ni+er_pension=${totalDebit} ≠ all_credits=${totalCredit}. Check input values.`,
      'UNBALANCED_ENTRY',
    );
  }

  const lines: JournalLineInput[] = [
    { accountCode: SYSTEM_ACCOUNTS.WAGES_EXPENSE, debitPence: grossWagesPence, creditPence: 0, narration: 'Gross wages' },
    { accountCode: SYSTEM_ACCOUNTS.EMPLOYER_NI_EXPENSE, debitPence: employerNiPence, creditPence: 0, narration: 'Employer NI' },
    { accountCode: SYSTEM_ACCOUNTS.EMPLOYER_PENSION_EXPENSE, debitPence: employerPensionPence, creditPence: 0, narration: 'Employer pension' },
    { accountCode: SYSTEM_ACCOUNTS.PAYE_LIABILITY, debitPence: 0, creditPence: taxPence, narration: 'PAYE due to HMRC' },
    { accountCode: SYSTEM_ACCOUNTS.EMPLOYEE_NI_LIABILITY, debitPence: 0, creditPence: employeeNiPence, narration: 'Employee NI due to HMRC' },
    { accountCode: SYSTEM_ACCOUNTS.EMPLOYER_NI_LIABILITY, debitPence: 0, creditPence: employerNiPence, narration: 'Employer NI due to HMRC' },
    { accountCode: SYSTEM_ACCOUNTS.PENSION_LIABILITY, debitPence: 0, creditPence: employeePensionPence + employerPensionPence, narration: 'Pension contributions payable' },
    { accountCode: SYSTEM_ACCOUNTS.STUDENT_LOAN_LIABILITY, debitPence: 0, creditPence: studentLoanPence, narration: 'Student loan deductions payable' },
    { accountCode: SYSTEM_ACCOUNTS.NET_WAGES_CONTROL, debitPence: 0, creditPence: netPayPence, narration: 'Net wages payable' },
  ].filter((l) => l.debitPence > 0 || l.creditPence > 0);

  return postJournal({
    companyId: input.companyId,
    actorUserId: input.actorUserId,
    reference: input.runId,
    referenceType: 'payroll_run',
    transactionDate: input.paymentDate,
    narration: `Payroll run ${input.runId.slice(0, 8).toUpperCase()}`,
    lines,
  });
}

// ─── Trial balance ────────────────────────────────────────────────────────────

export interface TrialBalanceLine {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  debitTotalPence: number;
  creditTotalPence: number;
  netBalancePence: number;
}

export interface TrialBalance {
  companyId: string;
  asOf: string;
  lines: TrialBalanceLine[];
  totalDebitPence: number;
  totalCreditPence: number;
  isBalanced: boolean;
}

export async function computeTrialBalance(companyId: string, asOf?: string): Promise<TrialBalance> {
  const accounts = await db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.companyId, companyId));

  const accountIds = accounts.map((a) => a.id);

  // Aggregate journal lines
  const aggregated = await db
    .select({
      accountId: journalLines.accountId,
      totalDebit: sql<number>`sum(${journalLines.debitPence})`,
      totalCredit: sql<number>`sum(${journalLines.creditPence})`,
    })
    .from(journalLines)
    .where(
      and(
        eq(journalLines.companyId, companyId),
        accountIds.length > 0 ? inArray(journalLines.accountId, accountIds) : sql`false`,
      ),
    )
    .groupBy(journalLines.accountId);

  const balanceMap = new Map(
    aggregated.map((r) => [r.accountId, { debit: Number(r.totalDebit ?? 0), credit: Number(r.totalCredit ?? 0) }]),
  );

  const lines: TrialBalanceLine[] = accounts.map((acc) => {
    const bal = balanceMap.get(acc.id) ?? { debit: 0, credit: 0 };
    const net = acc.normalBalance === 'debit'
      ? bal.debit - bal.credit
      : bal.credit - bal.debit;
    return {
      code: acc.code,
      name: acc.name,
      accountType: acc.accountType as AccountType,
      normalBalance: acc.normalBalance as NormalBalance,
      debitTotalPence: bal.debit,
      creditTotalPence: bal.credit,
      netBalancePence: net,
    };
  });

  const totalDebitPence = lines.reduce((s, l) => s + l.debitTotalPence, 0);
  const totalCreditPence = lines.reduce((s, l) => s + l.creditTotalPence, 0);

  return {
    companyId,
    asOf: asOf ?? new Date().toISOString().slice(0, 10),
    lines,
    totalDebitPence,
    totalCreditPence,
    isBalanced: totalDebitPence === totalCreditPence,
  };
}
