import { describe, expect, it } from 'vitest';
import { calculatePayrollForEmployee, type EmployeeCalcInput, type EmploymentYtd } from '../tax-payroll/payroll-calculation';
import { freePay, getRuleset2026_27, getRulesetForDate } from '../tax-payroll/rule-registry';

const zero: EmploymentYtd = {lastPeriodNumber:0,grossPayToDatePence:0,taxPaidToDatePence:0,employeeNiToDatePence:0,
  employerNiToDatePence:0,studentLoanToDatePence:0,pgLoanToDatePence:0,niableEarningsToDatePence:0};
function input(overrides: Partial<EmployeeCalcInput> = {}): EmployeeCalcInput {
  return {employeeId:'employee',legalFirstName:'Test',legalSurname:'Employee',paymentDate:'2026-04-30',taxCode:'1257L',
    taxCodeBasis:'cumulative',taxCountry:'GB',niCategory:'A',niMethod:'periodic',frequency:'monthly',periodNumber:1,
    grossPayPence:250_000,ytd:{...zero},studentLoan:{plans:[],postgraduate:false},...overrides};
}

describe('source-verified 2026/27 payroll calculations',()=>{
  it('uses HMRC published NI rates rather than the reduced-rate category B rate for everyone',()=>{
    const r=getRuleset2026_27();
    expect(r.niCategories.A.ptToUelEmployee).toBe(.08);
    expect(r.niCategories.B.ptToUelEmployee).toBe(.0185);
    expect(r.niCategories.J.ptToUelEmployee).toBe(.02);
    expect(r.niCategories.Z.ptToUelEmployee).toBe(.02);
  });
  it('Table A rounds each component UP before cumulative multiplication (PAYErout24 §4.3.1)',()=>{
    expect(freePay(1257,1,12)).toBe(104826);
    expect(freePay(1257,2,12)).toBe(209652);
    expect(freePay(1257,12,12)).toBe(1257912);
    expect(freePay(0,1,12)).toBe(0);
  });
  it('calculates PAYE, both NI contributions and net pay for a £2,500 monthly salary',()=>{
    const r=calculatePayrollForEmployee(input());
    expect(r.overallStatus).toBe('calculated');
    expect(r.tax.taxForPeriodPence).toBe(29020);
    expect(r.ni.employeeNiPeriodPence).toBe(11616);
    expect(r.ni.employerNiPeriodPence).toBe(31245);
    expect(r.netPayPence).toBe(209364);
  });
  it('uses previous tax paid for month2 and carries forward free pay instead of zeroing YTD',()=>{
    const r=calculatePayrollForEmployee(input({paymentDate:'2026-05-29',periodNumber:2,
      ytd:{...zero,lastPeriodNumber:1,grossPayToDatePence:250000,taxPaidToDatePence:29020,employeeNiToDatePence:11616,employerNiToDatePence:31245,niableEarningsToDatePence:250000}}));
    expect(r.tax.taxForPeriodPence).toBe(29040);
    expect(r.tax.taxPaidToDatePence).toBe(58060);
  });
  it('scales higher-rate bands to the current cumulative tax period',()=>{
    const r=calculatePayrollForEmployee(input({grossPayPence:600000}));
    // Taxable £4,951 after £1,048.26 free pay; period basic band £3,141.6666.
    expect(r.tax.taxForPeriodPence).toBe(135206);
    expect(r.ni.employeeNiPeriodPence).toBe(28750);
  });
  it('uses Scottish tax only when the employee tax code has the S prefix',()=>{
    const scot=calculatePayrollForEmployee(input({taxCode:'S1257L'}));
    const rest=calculatePayrollForEmployee(input({taxCountry:'GB-SCT'}));
    expect(scot.tax.isScottish).toBe(true);
    // £3,351.53 annual tax through band2 /12, plus (£1,451−£1,413)×21%.
    expect(scot.tax.taxForPeriodPence).toBe(28727);
    expect(rest.tax.taxForPeriodPence).toBe(29020);
  });
  it('0T has no free pay, and unsupported codes never invent emergency deductions',()=>{
    const zeroCode=calculatePayrollForEmployee(input({taxCode:'0T'}));
    expect(zeroCode.tax.freePayToDatePence).toBe(0);
    expect(zeroCode.tax.taxForPeriodPence).toBe(50000);
    expect(calculatePayrollForEmployee(input({taxCode:'INVALID'})).overallStatus).toBe('unsupported_tax_code');
  });
  it('W1/M1 ignores earlier taxable pay while retaining historical reporting totals',()=>{
    const r=calculatePayrollForEmployee(input({taxCode:'1257L M1',periodNumber:7,ytd:{...zero,grossPayToDatePence:5000000,taxPaidToDatePence:1000000}}));
    expect(r.tax.isCumulative).toBe(false);
    expect(r.tax.taxForPeriodPence).toBe(29020);
  });
  it('applies the 50% current-payment limit to all codes and permits cumulative refunds',()=>{
    const limited=calculatePayrollForEmployee(input({taxCode:'K9999',grossPayPence:100000}));
    expect(limited.tax.taxForPeriodPence).toBe(50000);
    const refund=calculatePayrollForEmployee(input({taxCode:'NT',ytd:{...zero,taxPaidToDatePence:10000}}));
    expect(refund.tax.taxForPeriodPence).toBe(-10000);
  });
  it('uses official student loan thresholds and whole-pound deduction rounding',()=>{
    const r=calculatePayrollForEmployee(input({grossPayPence:300000,studentLoan:{plans:[2],postgraduate:true}}));
    expect(r.studentLoans).toEqual([{plan:2,status:'calculated',deductionPence:4900},{plan:'pg',status:'calculated',deductionPence:7500}]);
    expect(r.totalStudentLoanPence).toBe(12400);
  });
  it('deducts undergraduate loans once at the lowest threshold even if several plans are recorded',()=>{
    const r=calculatePayrollForEmployee(input({grossPayPence:300000,studentLoan:{plans:[1,2,4,5],postgraduate:false}}));
    expect(r.studentLoans).toEqual([{plan:5,status:'calculated',deductionPence:8200}]);
  });
  it('divides the annual student threshold by the actual number of pay periods before rounding',()=>{
    const r=calculatePayrollForEmployee(input({frequency:'fortnightly',grossPayPence:104572,studentLoan:{plans:[1],postgraduate:false}}));
    // Plan1 £26,900 /26 =£1,034.61; excess£11.11 ×9%=£0.9999 ->£0.
    expect(r.studentLoans[0].deductionPence).toBe(0);
  });
  it('uses the published weekly NI threshold (£242), not annual /52',()=>{
    const r=calculatePayrollForEmployee(input({frequency:'weekly',grossPayPence:30000}));
    expect(r.ni.employeeNiPeriodPence).toBe(464);
    expect(r.ni.employerNiPeriodPence).toBe(3060);
  });
  it('uses HMRC NI rounding: only the third decimal pounds digit counts, and 5 rounds down',()=>{
    // £0.015 employer NI rounds to £0.01; £0.0152 employee NI also rounds to £0.01.
    expect(calculatePayrollForEmployee(input({grossPayPence:41710})).ni.employerNiPeriodPence).toBe(1);
    expect(calculatePayrollForEmployee(input({grossPayPence:104819})).ni.employeeNiPeriodPence).toBe(1);
  });
  it('rounds NI below and above the upper earnings limit separately before adding',()=>{
    // Category B: £58.1085 -> £58.11, plus £0.007 -> £0.01, total £58.12.
    const r=calculatePayrollForEmployee(input({grossPayPence:418935,niCategory:'B'}));
    expect(r.ni.employeeNiPeriodPence).toBe(5812);
  });
  it('rounds multiweek NI thresholds upward from annual thresholds before applying the rates',()=>{
    const fortnight=calculatePayrollForEmployee(input({frequency:'fortnightly',grossPayPence:60000}));
    expect(fortnight.ni.employeeNiPeriodPence).toBe(928); // (£600−£484)×8%.
    expect(fortnight.ni.employerNiPeriodPence).toBe(6105); // (£600−£193)×15%.
    const fourWeek=calculatePayrollForEmployee(input({frequency:'four_weekly',grossPayPence:120000}));
    expect(fourWeek.ni.employeeNiPeriodPence).toBe(1864); // (£1,200−£967)×8%.
    expect(fourWeek.ni.employerNiPeriodPence).toBe(12225); // (£1,200−£385)×15%.
  });
  it('calculates annual director NI against actual previous NI deductions',()=>{
    const r=calculatePayrollForEmployee(input({niMethod:'director_annual',periodNumber:7,paymentDate:'2026-10-30',grossPayPence:250000,
      ytd:{...zero,grossPayToDatePence:1500000,niableEarningsToDatePence:1500000,employeeNiToDatePence:19440,employerNiToDatePence:150000}}));
    expect(r.ni.employeeNiPeriodPence).toBe(20000);
    expect(r.ni.employerNiPeriodPence).toBe(37500);
  });
  it.each(['2026-02-30','2027-04-06','2026-04-30T00:00:00Z'])('does not use rules for invalid/unsupported date %s',(paymentDate)=>{
    expect(getRulesetForDate(paymentDate)).toBeNull();
    expect(calculatePayrollForEmployee(input({paymentDate})).overallStatus).toBe('no_ruleset_for_date');
  });
  it('blocks unsupported NI, alternative director NI, additional year-end weeks and negative pay',()=>{
    expect(calculatePayrollForEmployee(input({niCategory:'X'})).overallStatus).toBe('unsupported_ni_category');
    expect(calculatePayrollForEmployee(input({niMethod:'director_alternative'})).overallStatus).toBe('not_configured');
    expect(calculatePayrollForEmployee(input({frequency:'weekly',periodNumber:53})).overallStatus).toBe('not_configured');
    expect(calculatePayrollForEmployee(input({grossPayPence:-1})).overallStatus).toBe('not_configured');
  });
});
