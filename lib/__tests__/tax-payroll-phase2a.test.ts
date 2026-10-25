import { describe, expect, it } from 'vitest';

// ─── Phase 2A validation schemas ─────────────────────────────────────────────

let validation: typeof import('../tax-payroll/validation');

describe('createEmployeeSchema', () => {
  it('accepts a valid minimal employee', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createEmployeeSchema.safeParse({
      legalFirstName: 'Alice',
      legalSurname: 'Smith',
      employmentStartDate: '2026-04-06',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing legalFirstName', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createEmployeeSchema.safeParse({
      legalSurname: 'Smith',
      employmentStartDate: '2026-04-06',
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed start date', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createEmployeeSchema.safeParse({
      legalFirstName: 'Alice',
      legalSurname: 'Smith',
      employmentStartDate: '06/04/2026',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('employmentStartDate'))).toBe(true);
    }
  });

  it('accepts optional nino in valid format', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createEmployeeSchema.safeParse({
      legalFirstName: 'Alice',
      legalSurname: 'Smith',
      employmentStartDate: '2026-04-06',
      nino: 'AB123456C',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid NINO format', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createEmployeeSchema.safeParse({
      legalFirstName: 'Alice',
      legalSurname: 'Smith',
      employmentStartDate: '2026-04-06',
      nino: 'INVALID',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('nino'))).toBe(true);
    }
  });
});

describe('updateEmployeeSchema', () => {
  it('accepts a valid partial update', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateEmployeeSchema.safeParse({
      expectedVersion: 2,
      taxCode: '1257L',
      niCategory: 'A',
    });
    expect(result.success).toBe(true);
  });

  it('requires expectedVersion', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateEmployeeSchema.safeParse({ taxCode: '1257L' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields (strict mode)', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateEmployeeSchema.safeParse({
      expectedVersion: 1,
      someUnknownField: 'value',
    });
    expect(result.success).toBe(false);
  });
});

describe('createPayTermsSchema', () => {
  it('accepts a valid hourly basis', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayTermsSchema.safeParse({
      payBasis: 'hourly',
      hourlyRate: '12.50',
      payFrequency: 'weekly',
      effectiveFrom: '2026-04-06',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid fixed_period basis', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayTermsSchema.safeParse({
      payBasis: 'fixed_period',
      fixedPeriodGross: '2500.00',
      payFrequency: 'monthly',
      effectiveFrom: '2026-04-06',
    });
    expect(result.success).toBe(true);
  });

  it('rejects hourly without hourlyRate', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayTermsSchema.safeParse({
      payBasis: 'hourly',
      payFrequency: 'weekly',
      effectiveFrom: '2026-04-06',
    });
    expect(result.success).toBe(false);
  });

  it('rejects fixed_period without fixedPeriodGross', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayTermsSchema.safeParse({
      payBasis: 'fixed_period',
      payFrequency: 'monthly',
      effectiveFrom: '2026-04-06',
    });
    expect(result.success).toBe(false);
  });

  it('rejects hourly with fixedPeriodGross set', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayTermsSchema.safeParse({
      payBasis: 'hourly',
      hourlyRate: '12.00',
      fixedPeriodGross: '2000.00',
      payFrequency: 'monthly',
      effectiveFrom: '2026-04-06',
    });
    expect(result.success).toBe(false);
  });
});

describe('activatePayrollSchema', () => {
  it('accepts monthly with monthlyPayDay', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.activatePayrollSchema.safeParse({
      scheduleLabel: 'Monthly Payroll',
      payFrequency: 'monthly',
      monthlyPayDay: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects monthly without monthlyPayDay', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.activatePayrollSchema.safeParse({
      scheduleLabel: 'Monthly',
      payFrequency: 'monthly',
    });
    expect(result.success).toBe(false);
  });

  it('accepts weekly with scheduleAnchorDate', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.activatePayrollSchema.safeParse({
      scheduleLabel: 'Weekly',
      payFrequency: 'weekly',
      scheduleAnchorDate: '2026-04-11',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid monthlyPayDay (29)', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.activatePayrollSchema.safeParse({
      scheduleLabel: 'Monthly',
      payFrequency: 'monthly',
      monthlyPayDay: 29,
    });
    expect(result.success).toBe(false);
  });

  it('accepts monthlyPayDay = -1 (last working day)', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.activatePayrollSchema.safeParse({
      scheduleLabel: 'Monthly end',
      payFrequency: 'monthly',
      monthlyPayDay: -1,
    });
    expect(result.success).toBe(true);
  });
});

describe('createPayrollRunSchema', () => {
  it('accepts valid period dates', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayrollRunSchema.safeParse({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      intendedPaymentDate: '2026-10-25',
    });
    expect(result.success).toBe(true);
  });

  it('rejects periodEnd before periodStart', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createPayrollRunSchema.safeParse({
      periodStart: '2026-10-31',
      periodEnd: '2026-10-01',
      intendedPaymentDate: '2026-10-25',
    });
    expect(result.success).toBe(false);
  });
});

describe('upsertRunLinesSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid hourly line', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.upsertRunLinesSchema.safeParse({
      employeeId: VALID_UUID,
      lines: [{ lineType: 'hours_worked', workedMinutes: 2400 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects hours_worked without workedMinutes', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.upsertRunLinesSchema.safeParse({
      employeeId: VALID_UUID,
      lines: [{ lineType: 'hours_worked' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty lines array (remove all lines)', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.upsertRunLinesSchema.safeParse({
      employeeId: VALID_UUID,
      lines: [],
    });
    expect(result.success).toBe(true);
  });
});

// ─── Permissions ──────────────────────────────────────────────────────────────

let permissions: typeof import('../tax-payroll/permissions');

describe('Phase 2A permissions', () => {
  it('FOUNDER_CAPABILITIES does NOT include payroll capabilities', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(permissions.FOUNDER_CAPABILITIES).not.toContain('payroll.read');
    expect(permissions.FOUNDER_CAPABILITIES).not.toContain('payroll.settings.write');
    expect(permissions.FOUNDER_CAPABILITIES).not.toContain('payroll.employee.write');
  });

  it('ALL_PAYROLL_CAPABILITIES contains all payroll caps', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(permissions.ALL_PAYROLL_CAPABILITIES).toContain('payroll.read');
    expect(permissions.ALL_PAYROLL_CAPABILITIES).toContain('payroll.settings.write');
    expect(permissions.ALL_PAYROLL_CAPABILITIES).toContain('payroll.employee.write');
    expect(permissions.ALL_PAYROLL_CAPABILITIES).toContain('payroll.draft.write');
    expect(permissions.ALL_PAYROLL_CAPABILITIES).toContain('payroll.sensitive.read');
  });

  it('hasCapabilities checks payroll.read correctly', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(permissions.hasCapabilities(['payroll.read', 'payroll.employee.write'], ['payroll.read'])).toBe(true);
    expect(permissions.hasCapabilities(['tax.read'], ['payroll.read'])).toBe(false);
  });
});

// ─── Field encryption ─────────────────────────────────────────────────────────

let fieldEnc: typeof import('../tax-payroll/field-encryption');

describe('field-encryption pure helpers', () => {
  it('maskNino masks all but last 2 characters', async () => {
    fieldEnc ??= await import('../tax-payroll/field-encryption');
    expect(fieldEnc.maskNino('AB123456C')).toBe('*******6C');
    expect(fieldEnc.maskNino('XY')).toBe('**');
    expect(fieldEnc.maskNino('A')).toBe('**');
  });

  it('isEncryptedField returns true for enc: prefixed values', async () => {
    fieldEnc ??= await import('../tax-payroll/field-encryption');
    expect(fieldEnc.isEncryptedField('enc:v1:abc.def.ghi')).toBe(true);
    expect(fieldEnc.isEncryptedField('AB123456C')).toBe(false);
    expect(fieldEnc.isEncryptedField('')).toBe(false);
  });

  it('encryptedFieldVersion extracts the version from encoded value', async () => {
    fieldEnc ??= await import('../tax-payroll/field-encryption');
    expect(fieldEnc.encryptedFieldVersion('enc:v1:abc.def.ghi')).toBe('v1');
    expect(fieldEnc.encryptedFieldVersion('enc:v2:abc.def.ghi')).toBe('v2');
    expect(fieldEnc.encryptedFieldVersion('plaintext')).toBeNull();
  });

  it('CURRENT_ENCRYPTION_KEY_VERSION is v1', async () => {
    fieldEnc ??= await import('../tax-payroll/field-encryption');
    expect(fieldEnc.CURRENT_ENCRYPTION_KEY_VERSION).toBe('v1');
  });
});

// ─── Gross-pay calculation ────────────────────────────────────────────────────

let calc: typeof import('../tax-payroll/gross-pay-calculation');

describe('gross-pay calculation', () => {
  const emp = { id: 'e1', legalFirstName: 'Alice', legalSurname: 'Smith' };

  it('calculates hourly gross correctly (ROUND_HALF_UP)', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, [
      {
        id: 'l1', runId: 'r1', employeeId: 'e1', payTermsId: null,
        lineType: 'hours_worked', workedMinutes: 2400, // 40 hours
        hourlyRateOverride: '12.50', fixedAmount: null,
        description: null, enteredByUserId: 'u1', createdAt: '2026-10-01',
      },
    ]);
    expect(result.grossPay).toBe('500.00'); // 40h * £12.50
    expect(result.hasUnsupportedLines).toBe(false);
  });

  it('calculates fixed gross correctly', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, [
      {
        id: 'l2', runId: 'r1', employeeId: 'e1', payTermsId: null,
        lineType: 'bonus', workedMinutes: null,
        hourlyRateOverride: null, fixedAmount: '250.00',
        description: null, enteredByUserId: 'u1', createdAt: '2026-10-01',
      },
    ]);
    expect(result.grossPay).toBe('250.00');
  });

  it('marks line unsupported when hourly rate is unavailable', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, [
      {
        id: 'l3', runId: 'r1', employeeId: 'e1', payTermsId: null,
        lineType: 'hours_worked', workedMinutes: 480,
        hourlyRateOverride: null, fixedAmount: null,
        resolvedHourlyRate: null,
        description: null, enteredByUserId: 'u1', createdAt: '2026-10-01',
      },
    ]);
    expect(result.grossPay).toBeNull();
    expect(result.hasUnsupportedLines).toBe(true);
  });

  it('returns 0.00 gross for employee with no lines', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, []);
    expect(result.grossPay).toBe('0.00');
    expect(result.hasUnsupportedLines).toBe(false);
  });

  it('resolves hourly rate from pay terms when no override', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, [
      {
        id: 'l4', runId: 'r1', employeeId: 'e1', payTermsId: 'pt1',
        lineType: 'hours_worked', workedMinutes: 60, // 1 hour
        hourlyRateOverride: null, fixedAmount: null,
        resolvedHourlyRate: '15.33',
        description: null, enteredByUserId: 'u1', createdAt: '2026-10-01',
      },
    ]);
    expect(result.grossPay).toBe('15.33');
    expect(result.hasUnsupportedLines).toBe(false);
  });

  it('toPerEmployeeGrossDto includes required disclaimer + null deductions', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    const result = calc.calculateEmployeeGross(emp, []);
    const dto = calc.toPerEmployeeGrossDto(result);
    expect(dto.taxDeduction).toBeNull();
    expect(dto.niDeduction).toBeNull();
    expect(dto.netPay).toBeNull();
    expect(dto.disclaimer).toBe('Tax and deductions not calculated');
  });

  it('CALC_POLICY_VERSION is v1', async () => {
    calc ??= await import('../tax-payroll/gross-pay-calculation');
    expect(calc.CALC_POLICY_VERSION).toBe('v1');
  });
});

// ─── Payroll readiness ────────────────────────────────────────────────────────

let readiness: typeof import('../tax-payroll/payroll-readiness');

describe('payroll readiness', () => {
  it('returns not-ready with error when payroll is not activated', async () => {
    readiness ??= await import('../tax-payroll/payroll-readiness');
    const result = readiness.assessPayrollReadiness({ isActivated: false, employees: [], hasAtLeastOneActiveEmployee: false });
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.code === 'payroll_not_activated' && i.severity === 'error')).toBe(true);
  });

  it('warns when activated but no employees', async () => {
    readiness ??= await import('../tax-payroll/payroll-readiness');
    const result = readiness.assessPayrollReadiness({ isActivated: true, employees: [], hasAtLeastOneActiveEmployee: false });
    expect(result.ready).toBe(true); // warnings do not block
    expect(result.issues.some((i) => i.code === 'no_active_employees' && i.severity === 'warning')).toBe(true);
  });

  it('reports error for active employee missing pay terms', async () => {
    readiness ??= await import('../tax-payroll/payroll-readiness');
    const result = readiness.assessPayrollReadiness({
      isActivated: true,
      hasAtLeastOneActiveEmployee: true,
      employees: [{
        id: 'e1', legalFirstName: 'Alice', legalSurname: 'Smith',
        employeeStatus: 'active', taxCode: null, niCategory: null,
        hasActivePayTerms: false, hasNino: false,
      }],
    });
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => i.code === 'employee_missing_pay_terms' && i.severity === 'error')).toBe(true);
  });

  it('reports info for employee without NINO (non-blocking)', async () => {
    readiness ??= await import('../tax-payroll/payroll-readiness');
    const result = readiness.assessPayrollReadiness({
      isActivated: true,
      hasAtLeastOneActiveEmployee: true,
      employees: [{
        id: 'e1', legalFirstName: 'Alice', legalSurname: 'Smith',
        employeeStatus: 'active', taxCode: '1257L', niCategory: 'A',
        hasActivePayTerms: true, hasNino: false,
      }],
    });
    expect(result.issues.some((i) => i.code === 'employee_missing_nino' && i.severity === 'info')).toBe(true);
    // Missing NINO alone does not block
    expect(result.ready).toBe(true);
  });

  it('skips non-active employees', async () => {
    readiness ??= await import('../tax-payroll/payroll-readiness');
    const result = readiness.assessPayrollReadiness({
      isActivated: true,
      hasAtLeastOneActiveEmployee: false,
      employees: [{
        id: 'e1', legalFirstName: 'Bob', legalSurname: 'Jones',
        employeeStatus: 'left', taxCode: null, niCategory: null,
        hasActivePayTerms: false, hasNino: false,
      }],
    });
    // No issues from a left employee
    expect(result.issues.filter((i) => i.employeeId === 'e1')).toHaveLength(0);
  });
});
