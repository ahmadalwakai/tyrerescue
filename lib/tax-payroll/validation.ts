import { z } from 'zod';

// UK company number formats (Companies House):
// England/Wales: 8 digits, or OC/LP/FC prefix variants.
// Scotland: SC + 6 digits.
// Northern Ireland: NI + 6 digits.
// This regex accepts the most common formats without over-rejecting.
const COMPANY_NUMBER_RE = /^(SC|NI|OC|SO|NC|R|FC|IP|LP|SP|RS)?\d{5,8}$/i;

// UK postcode loose validation — full strict format is enforced server-side
// via a stricter regex only when the field is non-empty.
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

// Native forms submit optional text inputs as empty strings. Treat an empty
// email as absent while continuing to reject a nonempty invalid address.
const optionalCompanyEmail = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().email('Enter a valid email address').max(255).nullish(),
);

export const createCompanySchema = z.object({
  companyNumber: z
    .string()
    .trim()
    .min(1, 'Company number is required')
    .max(20)
    .regex(COMPANY_NUMBER_RE, 'Enter a valid UK company number (e.g. SC784534)'),
  legalName: z
    .string()
    .trim()
    .min(1, 'Legal name is required')
    .max(255),
  registeredAddressLine1: z
    .string()
    .trim()
    .min(1, 'Address line 1 is required')
    .max(255),
  registeredAddressLine2: z.string().trim().max(255).nullish(),
  registeredCity: z.string().trim().max(120).nullish(),
  registeredCountry: z.string().trim().max(120).nullish(),
  registeredPostcode: z
    .string()
    .trim()
    .max(10)
    .refine(
      (v) => !v || UK_POSTCODE_RE.test(v),
      'Enter a valid UK postcode (e.g. G31 1PB)',
    )
    .nullish(),
  tradingName: z.string().trim().max(255).nullish(),
  tradingAddress: z.string().trim().max(1000).nullish(),
  businessEmail: optionalCompanyEmail,
  businessPhone: z.string().trim().max(30).nullish(),
});

export const updateCompanySchema = z
  .object({
    expectedVersion: z
      .number()
      .int()
      .min(1, 'expectedVersion must be a positive integer'),
    legalName: z.string().trim().min(1).max(255).optional(),
    registeredAddressLine1: z.string().trim().min(1).max(255).optional(),
    registeredAddressLine2: z.string().trim().max(255).nullish(),
    registeredCity: z.string().trim().max(120).nullish(),
    registeredCountry: z.string().trim().max(120).nullish(),
    registeredPostcode: z
      .string()
      .trim()
      .max(10)
      .refine(
        (v) => !v || UK_POSTCODE_RE.test(v),
        'Enter a valid UK postcode',
      )
      .nullish(),
    tradingName: z.string().trim().max(255).nullish(),
    tradingAddress: z.string().trim().max(1000).nullish(),
    businessEmail: optionalCompanyEmail,
    businessPhone: z.string().trim().max(30).nullish(),
  })
  .strict(); // reject any unknown keys (including companyNumber)

export const declareRegistrationSchema = z.object({
  taxService: z.enum(['corporation_tax', 'vat', 'paye']),
  status: z.enum(['unknown', 'not_registered', 'registered']),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type DeclareRegistrationInput = z.infer<typeof declareRegistrationSchema>;

// Convert Zod field errors to a flat record suitable for TaxApiError.fieldErrors
export function flattenZodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

// ─── Phase 2A: shared primitives ─────────────────────────────────────────────

// ISO 8601 date only (YYYY-MM-DD)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z
  .string()
  .trim()
  .regex(ISO_DATE_RE, 'Date must be in YYYY-MM-DD format')
  .refine((v) => {
    const parsed = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v;
  }, 'Invalid date');

// Positive monetary amount as string (≤4 decimal places, e.g. "12.50")
const MONEY_RE = /^\d{1,9}(\.\d{1,4})?$/;
const monetaryString = z
  .string()
  .trim()
  .regex(MONEY_RE, 'Enter a valid positive amount (e.g. 12.50)')
  .refine((v) => parseFloat(v) > 0, 'Amount must be greater than zero');

// NI number — lenient format check: 2 letters + 6 digits + letter (A–D).
// We validate shape without guessing category meanings.
const NINO_RE = /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/i;
const ninoOptional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(NINO_RE, 'Enter a valid National Insurance number (e.g. AB123456C)')
  .nullable()
  .optional();

const payFrequency = z.enum(['weekly', 'fortnightly', 'four_weekly', 'monthly']);
const payBasis = z.enum(['hourly', 'fixed_period']);
const employeeStatus = z.enum(['active', 'left', 'suspended']);
const taxCodeBasis = z.enum(['cumulative', 'week1_month1']);
const taxCodeSource = z.enum(['p45', 'starter_checklist', 'hmrc_notification']);

// ─── Phase 2A: employee schemas ───────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  legalFirstName: z.string().trim().min(1, 'First name is required').max(100),
  legalSurname: z.string().trim().min(1, 'Surname is required').max(100),
  employmentStartDate: isoDate,
  employeeReference: z.string().trim().max(50).nullable().optional(),
  isDirector: z.boolean().optional(),
  dateOfBirth: isoDate.nullable().optional(),
  addressLine1: z.string().trim().max(255).nullable().optional(),
  addressLine2: z.string().trim().max(255).nullable().optional(),
  addressCity: z.string().trim().max(120).nullable().optional(),
  addressPostcode: z.string().trim().max(10).nullable().optional(),
  taxCode: z.string().trim().max(20).nullable().optional(),
  taxCodeBasis: taxCodeBasis.nullable().optional(),
  taxCodeEffectiveDate: isoDate.nullable().optional(),
  taxCodeSource: taxCodeSource.nullable().optional(),
  niCategory: z.string().trim().length(1).toUpperCase().nullable().optional(),
  nino: ninoOptional,
  linkedUserId: z.string().uuid().nullable().optional(),
  payrollIdMigrationRef: z.string().trim().max(100).nullable().optional(),
  idempotencyKey: z.string().trim().max(128).optional(),
});

export const updateEmployeeSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    legalFirstName: z.string().trim().min(1).max(100).optional(),
    legalSurname: z.string().trim().min(1).max(100).optional(),
    employmentStartDate: isoDate.optional(),
    employmentEndDate: isoDate.nullable().optional(),
    employeeReference: z.string().trim().max(50).nullable().optional(),
    isDirector: z.boolean().optional(),
    employeeStatus: employeeStatus.optional(),
    dateOfBirth: isoDate.nullable().optional(),
    addressLine1: z.string().trim().max(255).nullable().optional(),
    addressLine2: z.string().trim().max(255).nullable().optional(),
    addressCity: z.string().trim().max(120).nullable().optional(),
    addressPostcode: z.string().trim().max(10).nullable().optional(),
    taxCode: z.string().trim().max(20).nullable().optional(),
    taxCodeBasis: taxCodeBasis.nullable().optional(),
    taxCodeEffectiveDate: isoDate.nullable().optional(),
    taxCodeSource: taxCodeSource.nullable().optional(),
    niCategory: z.string().trim().length(1).toUpperCase().nullable().optional(),
    nino: ninoOptional,
  })
  .strict();

// ─── Phase 2A: pay terms schema ───────────────────────────────────────────────

export const createPayTermsSchema = z
  .object({
    payBasis,
    hourlyRate: monetaryString.nullable().optional(),
    fixedPeriodGross: monetaryString.nullable().optional(),
    payFrequency,
    effectiveFrom: isoDate,
    contractedHoursPerWeek: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter hours as a number (e.g. 37.5)')
      .refine((v) => parseFloat(v) > 0, 'Contracted hours must be greater than zero')
      .nullable()
      .optional(),
    annualSalaryNote: monetaryString.nullable().optional(),
    sourceNote: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.payBasis === 'hourly' && !val.hourlyRate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hourlyRate'], message: 'Hourly rate is required for hourly pay basis' });
    }
    if (val.payBasis === 'fixed_period' && !val.fixedPeriodGross) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedPeriodGross'], message: 'Fixed gross is required for fixed period pay basis' });
    }
    if (val.payBasis === 'hourly' && val.fixedPeriodGross != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedPeriodGross'], message: 'fixedPeriodGross must be omitted for hourly pay basis' });
    }
    if (val.payBasis === 'fixed_period' && val.hourlyRate != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hourlyRate'], message: 'hourlyRate must be omitted for fixed period pay basis' });
    }
  });

// ─── Phase 2A: payroll settings schemas ──────────────────────────────────────

export const activatePayrollSchema = z
  .object({
    scheduleLabel: z.string().trim().min(1, 'Schedule label is required').max(100),
    payFrequency,
    scheduleAnchorDate: isoDate.nullable().optional(),
    monthlyPayDay: z
      .number()
      .int()
      .refine((v) => (v >= 1 && v <= 28) || v === -1, 'monthlyPayDay must be 1–28 or -1 for last working day')
      .nullable()
      .optional(),
    timezone: z.string().trim().max(50).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.payFrequency === 'monthly' && val.monthlyPayDay == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['monthlyPayDay'], message: 'monthlyPayDay is required for monthly pay frequency' });
    }
    if (val.payFrequency !== 'monthly' && val.scheduleAnchorDate == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleAnchorDate'], message: 'scheduleAnchorDate is required for non-monthly pay frequencies' });
    }
  });

export const updatePayrollSettingsSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    scheduleLabel: z.string().trim().min(1).max(100).optional(),
    scheduleAnchorDate: isoDate.nullable().optional(),
    monthlyPayDay: z
      .number()
      .int()
      .refine((v) => (v >= 1 && v <= 28) || v === -1, 'monthlyPayDay must be 1–28 or -1')
      .nullable()
      .optional(),
    timezone: z.string().trim().max(50).optional(),
  })
  .strict();

// ─── Phase 2A: pay run schemas ────────────────────────────────────────────────

export const createPayrollRunSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    intendedPaymentDate: isoDate,
    idempotencyKey: z.string().trim().max(128).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.periodEnd < val.periodStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'periodEnd must not be before periodStart' });
    }
  });

const runLineTypeEnum = z.enum(['hours_worked', 'fixed_period', 'overtime', 'bonus', 'commission']);

const runLineSchema = z
  .object({
    lineType: runLineTypeEnum,
    workedMinutes: z.number().int().min(1).nullable().optional(),
    hourlyRateOverride: monetaryString.nullable().optional(),
    fixedAmount: monetaryString.nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    payTermsId: z.string().uuid().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    const isHourly = val.lineType === 'hours_worked' || val.lineType === 'overtime';
    if (isHourly && val.workedMinutes == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['workedMinutes'], message: 'workedMinutes is required for hourly line types' });
    }
    if (!isHourly && val.fixedAmount == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fixedAmount'], message: 'fixedAmount is required for non-hourly line types' });
    }
  });

export const upsertRunLinesSchema = z.object({
  employeeId: z.string().uuid(),
  expectedVersion: z.number().int().min(1).optional(),
  lines: z.array(runLineSchema).min(0).max(50),
}).strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreatePayTermsInput = z.infer<typeof createPayTermsSchema>;
export type ActivatePayrollInput = z.infer<typeof activatePayrollSchema>;
export type UpdatePayrollSettingsInput = z.infer<typeof updatePayrollSettingsSchema>;
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
export type UpsertRunLinesInput = z.infer<typeof upsertRunLinesSchema>;

export const payrollHmrcSettingsSchema = z.object({
  expectedVersion: z.number().int().min(1),
  payeReference: z.string().trim().max(20).nullable().optional(),
  accountsOfficeRef: z.string().trim().max(25).nullable().optional(),
  employerPensionSchemeRef: z.string().trim().max(50).nullable().optional(),
  pensionProviderName: z.string().trim().max(200).nullable().optional(),
  employeePensionRate: z.number().finite().min(0).max(1).nullable().optional(),
  employerPensionRate: z.number().finite().min(0).max(1).nullable().optional(),
  pensionContributionBasis: z.enum(['qualifying_earnings', 'pensionable_pay', 'salary_sacrifice']).nullable().optional(),
}).strict();

export const submitPayrollReviewSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const processPayrollReviewSchema = z.object({
  action: z.enum(['approve', 'reject']), expectedVersion: z.number().int().min(1),
  notes: z.string().trim().max(2000).optional(),
}).strict();
