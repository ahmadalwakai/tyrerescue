import 'server-only';

import Decimal from 'decimal.js';
import { createHash } from 'crypto';
import type {
  PayrollRunLineDto,
  PerEmployeeGrossDto,
  GrossPayPreviewDto,
  CompletenessState,
} from './contracts';

// Calc policy v1: ROUND_HALF_UP per line, then sum rounded values.
// Future policy changes bump CALC_POLICY_VERSION.
export const CALC_POLICY_VERSION = 'v1';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type LineType = 'hours_worked' | 'fixed_period' | 'overtime' | 'bonus' | 'commission';

export interface RawLine {
  id: string;
  runId: string;
  employeeId: string;
  payTermsId: string | null;
  lineType: LineType;
  workedMinutes: number | null;
  hourlyRateOverride: string | null;
  fixedAmount: string | null;
  description: string | null;
  enteredByUserId: string;
  createdAt: string;
  // Resolved from pay terms when not overridden
  resolvedHourlyRate?: string | null;
}

export interface EmployeeStub {
  id: string;
  legalFirstName: string;
  legalSurname: string;
}

interface LineCalcResult {
  lineId: string;
  grossPay: string | null;
  supported: boolean;
  reason?: string;
}

function calcLine(line: RawLine): LineCalcResult {
  const id = line.id;

  if (line.lineType === 'hours_worked' || line.lineType === 'overtime') {
    if (line.workedMinutes == null) {
      return { lineId: id, grossPay: null, supported: false, reason: 'workedMinutes missing' };
    }
    const rate = line.hourlyRateOverride ?? line.resolvedHourlyRate ?? null;
    if (!rate) {
      return { lineId: id, grossPay: null, supported: false, reason: 'hourly rate unavailable' };
    }
    try {
      const hours = new Decimal(line.workedMinutes).dividedBy(60);
      const gross = hours.times(new Decimal(rate)).toDecimalPlaces(2).toFixed(2);
      return { lineId: id, grossPay: gross, supported: true };
    } catch {
      return { lineId: id, grossPay: null, supported: false, reason: 'decimal parse error' };
    }
  }

  if (
    line.lineType === 'fixed_period' ||
    line.lineType === 'bonus' ||
    line.lineType === 'commission'
  ) {
    if (!line.fixedAmount) {
      return { lineId: id, grossPay: null, supported: false, reason: 'fixedAmount missing' };
    }
    try {
      const gross = new Decimal(line.fixedAmount).toDecimalPlaces(2).toFixed(2);
      return { lineId: id, grossPay: gross, supported: true };
    } catch {
      return { lineId: id, grossPay: null, supported: false, reason: 'decimal parse error' };
    }
  }

  return { lineId: id, grossPay: null, supported: false, reason: `unknown lineType ${line.lineType}` };
}

function sumDecimals(values: string[]): string {
  return values
    .reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0))
    .toDecimalPlaces(2)
    .toFixed(2);
}

export interface EmployeeCalcResult {
  employeeId: string;
  legalFirstName: string;
  legalSurname: string;
  grossPay: string | null;
  lineCount: number;
  hasUnsupportedLines: boolean;
}

export function calculateEmployeeGross(
  employee: EmployeeStub,
  lines: RawLine[],
): EmployeeCalcResult {
  if (lines.length === 0) {
    return {
      employeeId: employee.id,
      legalFirstName: employee.legalFirstName,
      legalSurname: employee.legalSurname,
      grossPay: '0.00',
      lineCount: 0,
      hasUnsupportedLines: false,
    };
  }

  const results = lines.map(calcLine);
  const supportedAmounts = results.filter((r) => r.supported && r.grossPay != null).map((r) => r.grossPay as string);
  const hasUnsupported = results.some((r) => !r.supported);

  const gross = supportedAmounts.length > 0 ? sumDecimals(supportedAmounts) : null;

  return {
    employeeId: employee.id,
    legalFirstName: employee.legalFirstName,
    legalSurname: employee.legalSurname,
    grossPay: hasUnsupported ? null : gross,
    lineCount: lines.length,
    hasUnsupportedLines: hasUnsupported,
  };
}

// Converts EmployeeCalcResult to the wire DTO format.
export function toPerEmployeeGrossDto(result: EmployeeCalcResult): PerEmployeeGrossDto {
  return {
    employeeId: result.employeeId,
    legalFirstName: result.legalFirstName,
    legalSurname: result.legalSurname,
    grossPay: result.grossPay,
    lineCount: result.lineCount,
    hasUnsupportedLines: result.hasUnsupportedLines,
    taxDeduction: null,
    niDeduction: null,
    netPay: null,
    disclaimer: 'Tax and deductions not calculated',
  };
}

export interface PreviewInput {
  runId: string;
  companyId: string;
  runVersion: number;
  settingsVersion: number;
  companyVersion: number;
  employeeLinesMap: Map<string, { employee: EmployeeStub; lines: RawLine[] }>;
  calculatedByUserId: string;
}

export interface PreviewResult {
  inputSnapshot: Record<string, unknown>;
  inputHash: string;
  perEmployeeResults: PerEmployeeGrossDto[];
  grossTotal: string | null;
  supportedSubtotal: string | null;
  hasUnsupportedLines: boolean;
  completenessState: CompletenessState;
}

export function buildPreviewResult(input: PreviewInput): PreviewResult {
  const allResults: EmployeeCalcResult[] = [];

  for (const { employee, lines } of input.employeeLinesMap.values()) {
    allResults.push(calculateEmployeeGross(employee, lines));
  }

  const hasUnsupported = allResults.some((r) => r.hasUnsupportedLines);
  const allHaveGross = allResults.every((r) => r.grossPay != null);

  const supportedAmounts = allResults
    .map((r) => r.grossPay)
    .filter((v): v is string => v != null);

  const supportedSubtotal = supportedAmounts.length > 0 ? sumDecimals(supportedAmounts) : null;
  const grossTotal = allHaveGross ? supportedSubtotal : null;

  let completenessState: CompletenessState;
  if (!hasUnsupported && allHaveGross) {
    completenessState = 'complete';
  } else if (supportedAmounts.length === 0) {
    completenessState = 'blocked';
  } else {
    completenessState = 'partial';
  }

  // Canonical input snapshot (no sensitive fields)
  const inputSnapshot: Record<string, unknown> = {
    runId: input.runId,
    runVersion: input.runVersion,
    settingsVersion: input.settingsVersion,
    companyVersion: input.companyVersion,
    employees: allResults.map((r) => ({
      employeeId: r.employeeId,
      lineCount: r.lineCount,
    })),
  };

  const inputHash = createHash('sha256')
    .update(JSON.stringify(inputSnapshot))
    .digest('hex');

  return {
    inputSnapshot,
    inputHash,
    perEmployeeResults: allResults.map(toPerEmployeeGrossDto),
    grossTotal,
    supportedSubtotal,
    hasUnsupportedLines: hasUnsupported,
    completenessState,
  };
}

// Converts a stored DB preview row to the wire DTO.
export function previewRowToDto(row: {
  id: string;
  runId: string;
  companyId: string;
  calcPolicyVersion: string;
  completenessState: string;
  grossTotal: string | null;
  supportedSubtotal: string | null;
  hasUnsupportedLines: boolean;
  perEmployeeResults: unknown;
  calculatedAt: Date;
  calculatedByUserId: string;
}): GrossPayPreviewDto {
  return {
    id: row.id,
    runId: row.runId,
    companyId: row.companyId,
    calcPolicyVersion: row.calcPolicyVersion,
    completenessState: row.completenessState as CompletenessState,
    grossTotal: row.grossTotal,
    supportedSubtotal: row.supportedSubtotal,
    hasUnsupportedLines: row.hasUnsupportedLines,
    perEmployeeResults: (row.perEmployeeResults as PerEmployeeGrossDto[]) ?? [],
    taxNotCalculated: true,
    netPayNotCalculated: true,
    disclaimer: 'Not a payslip. Tax and deductions not calculated.',
    calculatedAt: row.calculatedAt.toISOString(),
    calculatedByUserId: row.calculatedByUserId,
  };
}
