import { describe, expect, it } from 'vitest';
import { isPayrollDate, londonToday, payrollTaxMonth } from '../tax-payroll/tax-month';

describe('UK PAYE tax month selection', () => {
  it('starts on the 6th, using the payment date rather than the working period', () => {
    expect(payrollTaxMonth('2026-10-06', '2026-10-21')).toEqual({
      start: '2026-10-06', end: '2026-11-05', taxYear: '2026-27', taxMonth: 7,
      electronicDueDate: '2026-11-22', chequeDueDate: '2026-11-19', isOpen: true,
    });
  });
  it('keeps the 5th in the previous tax month', () => {
    expect(payrollTaxMonth('2026-10-05', '2026-10-21')).toMatchObject({
      start: '2026-09-06', end: '2026-10-05', taxMonth: 6, electronicDueDate: '2026-10-22', isOpen: false,
    });
  });
  it('ends the tax year on April 5th', () => {
    expect(payrollTaxMonth('2027-04-05', '2027-04-06')).toMatchObject({ start: '2027-03-06', end: '2027-04-05', taxYear: '2026-27', taxMonth: 12 });
    expect(payrollTaxMonth('2027-04-06', '2027-04-06')).toMatchObject({ start: '2027-04-06', taxYear: '2027-28', taxMonth: 1 });
  });
  it('rolls December into January without changing the tax year', () => {
    expect(payrollTaxMonth('2027-01-01', '2027-01-07')).toMatchObject({
      start: '2026-12-06', end: '2027-01-05', taxYear: '2026-27', taxMonth: 9, electronicDueDate: '2027-01-22',
    });
  });
  it('handles leap days and keeps the 5th open until the following London date', () => {
    expect(payrollTaxMonth('2028-02-29', '2028-03-05')).toMatchObject({ start: '2028-02-06', end: '2028-03-05', isOpen: true });
    expect(payrollTaxMonth('2028-02-29', '2028-03-06').isOpen).toBe(false);
  });
  it.each(['2026-02-29', '2026-13-01', '2026-10-32', '2026-10-01T00:00:00Z', '', '10/21/2026'])('rejects invalid date %s', (date) => {
    expect(isPayrollDate(date)).toBe(false);
    expect(() => payrollTaxMonth(date)).toThrow();
  });
  it('uses the UK date near midnight during British Summer Time', () => {
    expect(londonToday(new Date('2026-04-05T23:30:00.000Z'))).toBe('2026-04-06');
    expect(londonToday(new Date('2026-12-31T23:30:00.000Z'))).toBe('2026-12-31');
  });
});
