import type { PayrollTaxMonth } from './monthly-liability-contracts';

export function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function isPayrollDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' && value <= '2199-12-31';
}

function dateString(year: number, monthZeroBased: number, day: number): string {
  return new Date(Date.UTC(year, monthZeroBased, day, 12)).toISOString().slice(0, 10);
}

/** HMRC tax months run from the 6th through the following 5th, by payment date. */
export function payrollTaxMonth(date: string, today = londonToday()): PayrollTaxMonth {
  if (!isPayrollDate(date) || !isPayrollDate(today)) throw new Error('Enter a valid YYYY-MM-DD date');
  const [year, month, day] = date.split('-').map(Number);
  const start = dateString(year, month - 1 - (day < 6 ? 1 : 0), 6);
  const [startYear, startMonth] = start.split('-').map(Number);
  const taxYearStart = startMonth >= 4 ? startYear : startYear - 1;
  return {
    start,
    end: dateString(startYear, startMonth, 5),
    taxYear: `${taxYearStart}-${String(taxYearStart + 1).slice(-2)}`,
    taxMonth: ((startMonth - 4 + 12) % 12) + 1,
    electronicDueDate: dateString(startYear, startMonth, 22),
    chequeDueDate: dateString(startYear, startMonth, 19),
    isOpen: today <= dateString(startYear, startMonth, 5),
  };
}
