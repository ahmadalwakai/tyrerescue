import { describe, expect, it } from 'vitest';

// ─── Validation schemas ───────────────────────────────────────────────────────

let validation: typeof import('../tax-payroll/validation');

describe('tax-payroll validation', () => {
  it('createCompanySchema: accepts a valid GORBALS TYRES LTD payload', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: 'GORBALS TYRES LTD',
      registeredAddressLine1: 'Unit 3, 10 Gateside Street',
      registeredCity: 'Glasgow',
      registeredCountry: 'Scotland',
      registeredPostcode: 'G31 1PB',
    });
    expect(result.success).toBe(true);
  });

  it('createCompanySchema: rejects missing legal name', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: '',
      registeredAddressLine1: '10 Gateside Street',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('legalName'))).toBe(true);
    }
  });

  it('createCompanySchema: rejects invalid UK company number', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'INVALID!!',
      legalName: 'Test Ltd',
      registeredAddressLine1: '1 Street',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('companyNumber'))).toBe(true);
    }
  });

  it('createCompanySchema: accepts various valid UK company number formats', async () => {
    validation ??= await import('../tax-payroll/validation');
    const numbers = ['12345678', 'NI123456', 'OC123456', 'FC12345', 'SC784534'];
    for (const num of numbers) {
      const r = validation.createCompanySchema.safeParse({
        companyNumber: num,
        legalName: 'Test Ltd',
        registeredAddressLine1: '1 Street',
      });
      expect(r.success, `Expected ${num} to be valid`).toBe(true);
    }
  });

  it('createCompanySchema: rejects malformed UK postcode', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: 'Test Ltd',
      registeredAddressLine1: '1 Street',
      registeredPostcode: 'NOT-A-POSTCODE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('registeredPostcode'))).toBe(true);
    }
  });

  it('createCompanySchema: accepts empty/null optional fields', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: 'Test Ltd',
      registeredAddressLine1: '1 Street',
      registeredAddressLine2: null,
      tradingName: null,
      businessEmail: null,
      businessPhone: null,
    });
    expect(result.success).toBe(true);
  });

  it('createCompanySchema: accepts the native creation form with optional fields left blank', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: 'GORBALS TYRES LTD',
      registeredAddressLine1: 'Unit 3, 10 Gateside Street',
      registeredAddressLine2: '',
      registeredCity: 'Glasgow',
      registeredCountry: 'Scotland',
      registeredPostcode: 'G31 1PB',
      tradingName: '',
      businessEmail: '',
      businessPhone: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.businessEmail).toBeNull();
  });

  it('company email schemas allow clearing an email without accepting invalid nonempty addresses', async () => {
    validation ??= await import('../tax-payroll/validation');
    expect(validation.updateCompanySchema.parse({ expectedVersion: 1, businessEmail: '  ' }).businessEmail).toBeNull();
    expect(validation.updateCompanySchema.safeParse({ expectedVersion: 1, businessEmail: 'not-an-email' }).success).toBe(false);
  });

  it('createCompanySchema: rejects invalid email', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: 'SC784534',
      legalName: 'Test Ltd',
      registeredAddressLine1: '1 Street',
      businessEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('updateCompanySchema: requires expectedVersion', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateCompanySchema.safeParse({
      legalName: 'New Name',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('expectedVersion'))).toBe(true);
    }
  });

  it('updateCompanySchema: accepts a valid partial update', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateCompanySchema.safeParse({
      expectedVersion: 2,
      legalName: 'Updated Name Ltd',
      businessEmail: 'hello@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('updateCompanySchema: rejects companyNumber field (strict mode)', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateCompanySchema.safeParse({
      expectedVersion: 1,
      companyNumber: 'SC000001',
    });
    expect(result.success).toBe(false);
  });

  it('updateCompanySchema: rejects non-integer expectedVersion', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.updateCompanySchema.safeParse({
      expectedVersion: 1.5,
      legalName: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('declareRegistrationSchema: accepts valid service+status pairs', async () => {
    validation ??= await import('../tax-payroll/validation');
    for (const taxService of ['corporation_tax', 'vat', 'paye'] as const) {
      for (const status of ['unknown', 'not_registered', 'registered'] as const) {
        const r = validation.declareRegistrationSchema.safeParse({ taxService, status });
        expect(r.success).toBe(true);
      }
    }
  });

  it('declareRegistrationSchema: rejects unknown service or status', async () => {
    validation ??= await import('../tax-payroll/validation');
    expect(
      validation.declareRegistrationSchema.safeParse({ taxService: 'national_insurance', status: 'registered' }).success,
    ).toBe(false);
    expect(
      validation.declareRegistrationSchema.safeParse({ taxService: 'paye', status: 'pending' }).success,
    ).toBe(false);
  });

  it('flattenZodErrors: returns a flat record keyed by field name', async () => {
    validation ??= await import('../tax-payroll/validation');
    const result = validation.createCompanySchema.safeParse({
      companyNumber: '',
      legalName: '',
      registeredAddressLine1: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = validation.flattenZodErrors(result.error);
      expect(typeof flat).toBe('object');
      expect(flat['companyNumber']).toBeTruthy();
      expect(flat['legalName']).toBeTruthy();
    }
  });
});

// ─── Permissions – pure helpers only ─────────────────────────────────────────

let permissions: typeof import('../tax-payroll/permissions');

describe('tax-payroll permissions', () => {
  it('hasCapabilities: returns true when all required caps are present', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(
      permissions.hasCapabilities(
        ['tax.read', 'tax.company.write', 'tax.audit.read'],
        ['tax.read'],
      ),
    ).toBe(true);
    expect(
      permissions.hasCapabilities(
        ['tax.read', 'tax.company.write', 'tax.audit.read'],
        ['tax.read', 'tax.company.write'],
      ),
    ).toBe(true);
  });

  it('hasCapabilities: returns false when a required cap is missing', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(
      permissions.hasCapabilities(['tax.read'], ['tax.read', 'tax.company.write']),
    ).toBe(false);
  });

  it('hasCapabilities: returns true for empty requirements', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(permissions.hasCapabilities([], [])).toBe(true);
    expect(permissions.hasCapabilities(['tax.read'], [])).toBe(true);
  });

  it('FOUNDER_CAPABILITIES includes read, write, and audit', async () => {
    permissions ??= await import('../tax-payroll/permissions');
    expect(permissions.FOUNDER_CAPABILITIES).toContain('tax.read');
    expect(permissions.FOUNDER_CAPABILITIES).toContain('tax.company.write');
    expect(permissions.FOUNDER_CAPABILITIES).toContain('tax.audit.read');
  });
});

// ─── Company service – pure helpers only ──────────────────────────────────────

let companyService: typeof import('../tax-payroll/company-service');

describe('tax-payroll company-service', () => {
  it('CompanyServiceError carries the correct code', async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/tyrerescue_test';
    companyService ??= await import('../tax-payroll/company-service');

    const err = new companyService.CompanyServiceError('duplicate', 'CONFLICT_DUPLICATE');
    expect(err.code).toBe('CONFLICT_DUPLICATE');
    expect(err.message).toBe('duplicate');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CompanyServiceError');
  });

  it('entityToDto maps DB row fields to DTO correctly', async () => {
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/tyrerescue_test';
    companyService ??= await import('../tax-payroll/company-service');

    const now = new Date('2026-01-15T12:00:00.000Z');
    const row = {
      id: 'abc-123',
      companyNumber: 'SC784534',
      legalName: 'GORBALS TYRES LTD',
      registeredAddressLine1: 'Unit 3, 10 Gateside Street',
      registeredAddressLine2: null,
      registeredCity: 'Glasgow',
      registeredCountry: 'Scotland',
      registeredPostcode: 'G31 1PB',
      tradingName: null,
      tradingAddress: null,
      businessEmail: null,
      businessPhone: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const dto = companyService.entityToDto(row);
    expect(dto.id).toBe('abc-123');
    expect(dto.companyNumber).toBe('SC784534');
    expect(dto.legalName).toBe('GORBALS TYRES LTD');
    expect(dto.version).toBe(1);
    expect(dto.createdAt).toBe(now.toISOString());
    expect(dto.updatedAt).toBe(now.toISOString());
    expect(dto.registeredAddressLine2).toBeNull();
  });
});
