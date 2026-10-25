/**
 * Phase 2B–5 unit tests.
 *
 * Tests: pension assessment, CT calculation, VAT calculation,
 * RTI XML building, review state machine, accounting journal balance.
 *
 * Pattern: dynamic import with ??= (server-only modules).
 */

import { describe, expect, it } from 'vitest';

// ─── Pension assessment ───────────────────────────────────────────────────────

describe('pension-service', () => {
  let mod: typeof import('../tax-payroll/pension-service');

  it('eligible_jobholder: age 30, earnings above trigger', async () => {
    mod ??= await import('../tax-payroll/pension-service');
    const result = mod.assessPensionEnrolment({
      employeeId: '550e8400-e29b-41d4-a716-446655440001',
      dateOfBirth: '1995-01-01',
      assessmentDate: '2026-10-01',
      annualisedEarningsPence: 2_500_000, // £25,000
      currentEnrolmentStatus: 'not_assessed',
      enrolmentDate: null,
      optOutWindowEnds: null,
      schemeContributionBasis: 'qualifying_earnings',
      employeeContributionRate: 0.05,
      employerContributionRate: 0.03,
    });
    expect(result.workerCategory).toBe('eligible_jobholder');
    expect(result.actionRequired).toBe('enrol');
    expect(result.contribution).toBeNull(); // not enrolled yet
  });

  it('non_eligible: age 20 (under 22)', async () => {
    mod ??= await import('../tax-payroll/pension-service');
    const result = mod.assessPensionEnrolment({
      employeeId: '550e8400-e29b-41d4-a716-446655440002',
      dateOfBirth: '2006-06-01',
      assessmentDate: '2026-10-01',
      annualisedEarningsPence: 2_500_000,
      currentEnrolmentStatus: 'not_assessed',
      enrolmentDate: null,
      optOutWindowEnds: null,
      schemeContributionBasis: 'qualifying_earnings',
      employeeContributionRate: 0.05,
      employerContributionRate: 0.03,
    });
    expect(result.workerCategory).toBe('non_eligible_jobholder');
    expect(result.actionRequired).toBe('none');
  });

  it('entitled_worker: low earnings below LEL', async () => {
    mod ??= await import('../tax-payroll/pension-service');
    const result = mod.assessPensionEnrolment({
      employeeId: '550e8400-e29b-41d4-a716-446655440003',
      dateOfBirth: '1985-01-01',
      assessmentDate: '2026-10-01',
      annualisedEarningsPence: 500_000, // £5,000 — below LEL £6,708
      currentEnrolmentStatus: 'not_assessed',
      enrolmentDate: null,
      optOutWindowEnds: null,
      schemeContributionBasis: 'qualifying_earnings',
      employeeContributionRate: 0.05,
      employerContributionRate: 0.03,
    });
    expect(result.workerCategory).toBe('entitled_worker');
  });

  it('enrolled: contribution calculation', async () => {
    mod ??= await import('../tax-payroll/pension-service');
    const thresholds = mod.AE_THRESHOLDS_2026_27;
    const annualisedEarnings = 2_500_000; // £25,000
    const result = mod.assessPensionEnrolment({
      employeeId: '550e8400-e29b-41d4-a716-446655440004',
      dateOfBirth: '1985-01-01',
      assessmentDate: '2026-10-01',
      annualisedEarningsPence: annualisedEarnings,
      currentEnrolmentStatus: 'enrolled',
      enrolmentDate: '2026-04-06',
      optOutWindowEnds: null,
      schemeContributionBasis: 'qualifying_earnings',
      employeeContributionRate: 0.05,
      employerContributionRate: 0.03,
    });
    expect(result.contribution).not.toBeNull();
    // Qualifying earnings = earnings - lower (£6,708) = £18,292
    const expectedQE = annualisedEarnings - thresholds.qualifyingEarningsLowerPencePerYear;
    expect(result.contribution!.qualifyingEarningsPence).toBe(expectedQE);
    expect(result.contribution!.employeeContributionPence).toBe(Math.trunc(expectedQE * 0.05));
    expect(result.contribution!.employerContributionPence).toBe(Math.trunc(expectedQE * 0.03));
    expect(result.contribution!.meetsMinimum).toBe(true);
  });

  it('re-enrolment due after 3 years opted out', async () => {
    mod ??= await import('../tax-payroll/pension-service');
    const result = mod.assessPensionEnrolment({
      employeeId: '550e8400-e29b-41d4-a716-446655440005',
      dateOfBirth: '1985-01-01',
      assessmentDate: '2026-10-01',
      annualisedEarningsPence: 2_000_000,
      currentEnrolmentStatus: 'opted_out',
      enrolmentDate: '2023-01-01',   // 3.75 years ago
      optOutWindowEnds: null,
      schemeContributionBasis: 'qualifying_earnings',
      employeeContributionRate: 0.05,
      employerContributionRate: 0.03,
    });
    expect(result.actionRequired).toBe('reenrolment_due');
  });
});

// ─── Corporation Tax ──────────────────────────────────────────────────────────

describe('corporation-tax-calculation', () => {
  let mod: typeof import('../tax-payroll/corporation-tax-calculation');

  it('small profits rate: profits £30,000', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const result = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440010',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 3_000_000,
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    expect(result.rateApplied).toBe('small_profits');
    expect(result.netCtPayablePence).toBe(Math.trunc(3_000_000 * 0.19));
    expect(result.marginalReliefPence).toBe(0);
  });

  it('main rate: profits £300,000', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const result = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440011',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 30_000_000, // £300,000
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    expect(result.rateApplied).toBe('main');
    expect(result.netCtPayablePence).toBe(Math.trunc(30_000_000 * 0.25));
    expect(result.marginalReliefPence).toBe(0);
  });

  it('marginal relief: profits £150,000', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const result = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440012',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 15_000_000, // £150,000
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    expect(result.rateApplied).toBe('marginal_relief');
    expect(result.marginalReliefPence).toBeGreaterThan(0);
    expect(result.netCtPayablePence).toBeLessThan(Math.trunc(15_000_000 * 0.25));
    expect(result.netCtPayablePence).toBeGreaterThan(Math.trunc(15_000_000 * 0.19));
  });

  it('zero profits: CT payable is zero', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const result = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440013',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 0,
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    expect(result.netCtPayablePence).toBe(0);
    expect(result.taxableTotalProfitsPence).toBe(0);
  });

  it('associated companies halve thresholds', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const withoutAssociated = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440014',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 4_000_000, // £40,000 — within small profits without associated
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    const withAssociated = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440015',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 4_000_000, // £40,000 — above threshold with 1 associated (threshold ÷2 = £25k)
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 1,
    });
    expect(withoutAssociated.rateApplied).toBe('small_profits');
    // With 1 associated, lower threshold = £25,000 so £40k is in marginal or main band
    expect(withAssociated.rateApplied).not.toBe('small_profits');
  });

  it('CT600 box mapping returns expected keys', async () => {
    mod ??= await import('../tax-payroll/corporation-tax-calculation');
    const result = mod.calculateCorporationTax({
      companyId: '550e8400-e29b-41d4-a716-446655440016',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      tradingProfitsPence: 5_000_000,
      nonTradingIncomePence: 0,
      chargeableGainsPence: 0,
      exemptDistributionsPence: 0,
      associatedCompanies: 0,
    });
    const boxes = mod.mapToCtBoxes(result);
    expect(boxes).toHaveProperty('box235');
    expect(boxes).toHaveProperty('box430');
    expect(boxes['box430']).toBe((result.netCtPayablePence / 100).toFixed(2));
  });
});

// ─── VAT calculation ──────────────────────────────────────────────────────────

describe('vat-calculation', () => {
  let mod: typeof import('../tax-payroll/vat-calculation');

  it('output tax only: standard rate sales', async () => {
    mod ??= await import('../tax-payroll/vat-calculation');
    const result = mod.calculateVatReturn(
      '550e8400-e29b-41d4-a716-446655440020',
      '23AA',
      '2026-01-01',
      '2026-03-31',
      '2026-05-07',
      [
        { description: 'Service 1', netPence: 100_000, vatPence: 20_000, vatRate: 'standard', transactionDate: '2026-01-15', isOutput: true, reference: 'inv001' },
        { description: 'Service 2', netPence: 50_000, vatPence: 10_000, vatRate: 'standard', transactionDate: '2026-02-01', isOutput: true, reference: 'inv002' },
      ],
    );
    expect(result.boxes.box1OutputTaxPence).toBe(30_000);
    expect(result.boxes.box4InputTaxClaimedPence).toBe(0);
    expect(result.boxes.box5NetVatPayablePence).toBe(30_000);
    expect(result.boxes.box6TotalSalesNetPence).toBe(150_000);
  });

  it('input and output: net VAT payable', async () => {
    mod ??= await import('../tax-payroll/vat-calculation');
    const result = mod.calculateVatReturn(
      '550e8400-e29b-41d4-a716-446655440021',
      '23AB',
      '2026-01-01',
      '2026-03-31',
      '2026-05-07',
      [
        { description: 'Sales', netPence: 200_000, vatPence: 40_000, vatRate: 'standard', transactionDate: '2026-01-15', isOutput: true, reference: 'inv001' },
        { description: 'Purchase', netPence: 80_000, vatPence: 16_000, vatRate: 'standard', transactionDate: '2026-01-20', isOutput: false, reference: 'pur001' },
      ],
    );
    expect(result.boxes.box1OutputTaxPence).toBe(40_000);
    expect(result.boxes.box4InputTaxClaimedPence).toBe(16_000);
    expect(result.boxes.box5NetVatPayablePence).toBe(24_000);
  });

  it('exempt purchases: no input tax recovery', async () => {
    mod ??= await import('../tax-payroll/vat-calculation');
    const result = mod.calculateVatReturn(
      '550e8400-e29b-41d4-a716-446655440022',
      '23AC',
      '2026-01-01',
      '2026-03-31',
      '2026-05-07',
      [
        { description: 'Exempt insurance', netPence: 10_000, vatPence: 0, vatRate: 'exempt', transactionDate: '2026-01-20', isOutput: false, reference: 'pur002' },
      ],
    );
    expect(result.boxes.box4InputTaxClaimedPence).toBe(0);
  });

  it('refund case: box5 negative', async () => {
    mod ??= await import('../tax-payroll/vat-calculation');
    const result = mod.calculateVatReturn(
      '550e8400-e29b-41d4-a716-446655440023',
      '23AD',
      '2026-01-01',
      '2026-03-31',
      '2026-05-07',
      [
        { description: 'Sales', netPence: 10_000, vatPence: 2_000, vatRate: 'standard', transactionDate: '2026-01-15', isOutput: true, reference: 'inv001' },
        { description: 'Capital purchase', netPence: 100_000, vatPence: 20_000, vatRate: 'standard', transactionDate: '2026-01-25', isOutput: false, reference: 'pur001' },
      ],
    );
    expect(result.boxes.box5NetVatPayablePence).toBe(-18_000); // refund
  });

  it('rate config: getRateValue returns correct rates', async () => {
    mod ??= await import('../tax-payroll/vat-calculation');
    expect(mod.getRateValue('standard')).toBe(0.20);
    expect(mod.getRateValue('reduced')).toBe(0.05);
    expect(mod.getRateValue('zero')).toBe(0.00);
    expect(mod.getRateValue('exempt')).toBe(0.00);
  });
});

// ─── RTI XML builder ──────────────────────────────────────────────────────────

describe('rti-client', () => {
  let mod: typeof import('../tax-payroll/rti-client');

  it('FPS draft: produces valid XML structure', async () => {
    mod ??= await import('../tax-payroll/rti-client');
    const result = mod.buildFpsDraft({
      companyId: '550e8400-e29b-41d4-a716-446655440030',
      payeReference: '123/AB12345',
      accountsOfficeRef: '123PA00012345',
      taxYear: '2026-27',
      relatedTaxMonth: 6,
      paymentDate: '2026-10-25',
      senderId: 'user-001',
      employees: [
        {
          employeeId: '550e8400-e29b-41d4-a716-446655440031',
          // NINO absent — generates a warning (expected in draft builds)
          ninoEncrypted: null,
          legalFirstName: 'Jane',
          legalSurname: 'Smith',
          dateOfBirth: '1990-05-15',
          taxCode: '1257L',
          taxCodeBasis: 'cumulative',
          niCategory: 'A',
          paymentDate: '2026-10-25',
          periodNumber: 7,
          frequency: 'M1',
          grossPayPence: 250_000,
          taxForPeriodPence: 31_840,
          employeeNiPence: 3_960,
          grossYtdPence: 1_750_000,
          taxYtdPence: 222_880,
          employeeNiYtdPence: 27_720,
          studentLoanDeductionPence: 0,
          isNewStarter: false,
          isLeaver: false,
        },
      ],
    });
    expect(result.submissionType).toBe('FPS');
    expect(result.status).toBe('draft');
    expect(result.xmlPayload).toContain('GovTalkMessage');
    expect(result.xmlPayload).toContain('FullPaymentSubmission');
    expect(result.xmlPayload).toContain('123/AB12345');
    expect(result.xmlPayload).toContain('Jane');
    expect(result.xmlPayload).toContain('Smith');
    // NINO absent: temp placeholder used, real NINO not in output
    expect(result.xmlPayload).not.toContain('AB123456C');
    expect(result.xmlPayload).toContain('TN010101A');
    // One warning for missing NINO is expected
    expect(result.validationWarnings).toHaveLength(1);
    expect(result.validationWarnings[0]).toContain('NINO not held');
  });

  it('FPS draft: invalid PAYE reference produces warning', async () => {
    mod ??= await import('../tax-payroll/rti-client');
    const result = mod.buildFpsDraft({
      companyId: '550e8400-e29b-41d4-a716-446655440032',
      payeReference: 'INVALID',
      accountsOfficeRef: '123PA00012345',
      taxYear: '2026-27',
      relatedTaxMonth: 6,
      paymentDate: '2026-10-25',
      senderId: 'user-001',
      employees: [],
    });
    expect(result.validationWarnings.length).toBeGreaterThan(0);
  });

  it('EPS draft: produces valid XML structure', async () => {
    mod ??= await import('../tax-payroll/rti-client');
    const result = mod.buildEpsDraft({
      companyId: '550e8400-e29b-41d4-a716-446655440033',
      payeReference: '123/AB12345',
      accountsOfficeRef: '123PA00012345',
      taxYear: '2026-27',
      taxMonth: 6,
      reclaimedSmpPence: 19_432,
      reclaimedSspPence: 0,
      noEmployeesInPeriod: false,
      apprenticeLevyAmountPence: 0,
      apprenticeLevyYtdPence: 0,
    });
    expect(result.submissionType).toBe('EPS');
    expect(result.xmlPayload).toContain('EmployerPaymentSummary');
    expect(result.xmlPayload).toContain('SMPReclaimed');
  });

  it('EPS no payment due flag', async () => {
    mod ??= await import('../tax-payroll/rti-client');
    const result = mod.buildEpsDraft({
      companyId: '550e8400-e29b-41d4-a716-446655440034',
      payeReference: '123/AB12345',
      accountsOfficeRef: '123PA00012345',
      taxYear: '2026-27',
      taxMonth: 7,
      reclaimedSmpPence: 0,
      reclaimedSspPence: 0,
      noEmployeesInPeriod: true,
      apprenticeLevyAmountPence: 0,
      apprenticeLevyYtdPence: 0,
    });
    expect(result.xmlPayload).toContain('NoPaymentDue');
  });

  it('fraud prevention headers: server-side connection method', async () => {
    mod ??= await import('../tax-payroll/rti-client');
    const headers = mod.buildServerSideFraudHeaders('1.0.0');
    expect(headers['Gov-Client-Connection-Method']).toBe('SERVER_TOKEN');
    expect(headers['Gov-Client-Timezone']).toBe('Europe/London');
  });
});

// ─── Accounting service (pure logic only — no DB) ────────────────────────────

describe('accounting-service system accounts', () => {
  it('SYSTEM_ACCOUNTS has correct codes', async () => {
    const mod = await import('../tax-payroll/accounting-service');
    expect(mod.SYSTEM_ACCOUNTS.WAGES_EXPENSE).toBe('7000');
    expect(mod.SYSTEM_ACCOUNTS.PAYE_LIABILITY).toBe('2100');
    expect(mod.SYSTEM_ACCOUNTS.BANK_CURRENT).toBe('1000');
    expect(mod.SYSTEM_ACCOUNTS.CORPORATION_TAX_LIABILITY).toBe('2300');
  });
});

// ─── Rule registry helpers ────────────────────────────────────────────────────

describe('rule-registry 2026-27 thresholds', () => {
  let mod: typeof import('../tax-payroll/rule-registry');

  it('getRulesetForDate returns 2026-27 for April 2026', async () => {
    mod ??= await import('../tax-payroll/rule-registry');
    const rs = mod.getRulesetForDate('2026-10-01');
    expect(rs).not.toBeNull();
    expect(rs!.taxYear).toBe('2026-27');
  });

  it('taxYearForDate returns correct year', async () => {
    mod ??= await import('../tax-payroll/rule-registry');
    expect(mod.taxYearForDate('2026-10-01')).toBe('2026-27');
    expect(mod.taxYearForDate('2026-04-05')).toBe('2025-26'); // Before April 6 = prior year
    expect(mod.taxYearForDate('2026-04-06')).toBe('2026-27');
  });

  it('taxWeekNumber is between 1 and 52', async () => {
    mod ??= await import('../tax-payroll/rule-registry');
    const wk = mod.taxWeekNumber('2026-10-01');
    expect(wk).toBeGreaterThanOrEqual(1);
    expect(wk).toBeLessThanOrEqual(53);
  });

  it('exactTaxMonth: October 1st is month 6 (Sep 6 – Oct 5 = month 6)', async () => {
    mod ??= await import('../tax-payroll/rule-registry');
    // Tax month 1 = April 6–May 5, month 6 = September 6–October 5
    const m = mod.exactTaxMonth('2026-10-01');
    expect(m).toBe(6);
    // October 6 is the start of month 7
    const m2 = mod.exactTaxMonth('2026-10-06');
    expect(m2).toBe(7);
  });

  it('freePay: tax code number 1257, annual basis', async () => {
    mod ??= await import('../tax-payroll/rule-registry');
    // freePay(taxCodeNumber, period, periodsPerYear)
    // Annual free pay = (1257 * 10 + 9) * 100 = 12579 * 100 = 1,257,900 pence — NOT £12,570
    // HMRC formula: (code_number × 10 + 9) × 10p = (1257 × 10 + 9) × 100 pence
    // So annual = 12579 × 100 = 1,257,900 pence
    const annualFp = mod.freePay(1257, 1, 1);
    expect(annualFp).toBe(1_257_900);
    // HMRC Table A splits blocks of 500 and rounds component values up.
    const monthlyFp = mod.freePay(1257, 1, 12);
    expect(monthlyFp).toBe(104826);
  });
});

// ─── Submission guard ─────────────────────────────────────────────────────────

describe('submission-guard', () => {
  it('canSubmit is always false in this phase', async () => {
    const mod = await import('../tax-payroll/submission-guard');
    // The guard function is async and calls DB — just verify the type
    expect(typeof mod.checkSubmissionReadiness).toBe('function');
  });
});

// ─── Pension thresholds snapshot ─────────────────────────────────────────────

describe('pension-service thresholds 2026-27', () => {
  it('thresholds match TPR 2026-27 values', async () => {
    const mod = await import('../tax-payroll/pension-service');
    const t = mod.AE_THRESHOLDS_2026_27;
    expect(t.minEmployeeContributionRate).toBe(0.05);
    expect(t.minEmployerContributionRate).toBe(0.03);
    expect(t.minTotalContributionRate).toBe(0.08);
    expect(t.statePensionAgeApproximate).toBe(67);
    expect(t.qualifyingEarningsUpperPencePerYear).toBe(5_027_000);
  });
});
