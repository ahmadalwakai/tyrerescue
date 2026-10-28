import type { CompanyListDto, CompanyProfileDto, CreateCompanyRequest, TaxApiError } from '../types/tax-payroll';

const PROFILE_REQUIRED = ['id', 'companyNumber', 'legalName', 'registeredAddressLine1', 'createdAt', 'updatedAt'] as const;
const PROFILE_NULLABLE = ['registeredAddressLine2', 'registeredCity', 'registeredCountry', 'registeredPostcode',
  'tradingName', 'tradingAddress', 'businessEmail', 'businessPhone'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TaxCompanyResponseError extends Error {
  constructor(message = 'The server did not return a valid company profile. Refresh to check whether it was saved.') {
    super(message);
    this.name = 'TaxCompanyResponseError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** HTTP success alone cannot confirm a company was saved. */
export function parseTaxCompanyProfile(value: unknown): CompanyProfileDto {
  const raw = record(value);
  if (!raw || !PROFILE_REQUIRED.every((key) => typeof raw[key] === 'string' && Boolean(raw[key].trim()) && raw[key].length <= 1000)
    || !PROFILE_NULLABLE.every((key) => raw[key] === null || (typeof raw[key] === 'string' && raw[key].length <= 1000))
    || !UUID.test(raw.id as string) || !Number.isSafeInteger(raw.version) || (raw.version as number) < 1
    || !Number.isFinite(Date.parse(raw.createdAt as string)) || !Number.isFinite(Date.parse(raw.updatedAt as string))) {
    throw new TaxCompanyResponseError();
  }
  return Object.fromEntries([...PROFILE_REQUIRED, ...PROFILE_NULLABLE, 'version'].map((key) => [key, raw[key]])) as unknown as CompanyProfileDto;
}

export function parseTaxCompanyList(value: unknown): CompanyListDto {
  const raw = record(value);
  if (!raw || typeof raw.canCreate !== 'boolean' || !Array.isArray(raw.companies)) {
    throw new TaxCompanyResponseError('Tax & Payroll returned an invalid company list. Please refresh or update the server.');
  }
  const companies = raw.companies.map(parseTaxCompanyProfile);
  if (new Set(companies.map((company) => company.id)).size !== companies.length
    || new Set(companies.map((company) => company.companyNumber.toUpperCase())).size !== companies.length) {
    throw new TaxCompanyResponseError('Tax & Payroll returned an inconsistent company list. Please refresh.');
  }
  return { companies, canCreate: raw.canCreate };
}

/** Empty optional form fields must not become invalid email addresses. */
export function normaliseTaxCompanyInput(input: CreateCompanyRequest): CreateCompanyRequest {
  const result: CreateCompanyRequest = {
    companyNumber: input.companyNumber.trim().toUpperCase(),
    legalName: input.legalName.trim(),
    registeredAddressLine1: input.registeredAddressLine1.trim(),
  };
  for (const key of PROFILE_NULLABLE) {
    const value = input[key]?.trim();
    if (value) result[key] = value;
  }
  return result;
}

export function matchesTaxCompanyInput(company: CompanyProfileDto, input: CreateCompanyRequest): boolean {
  return company.companyNumber.trim().toUpperCase() === input.companyNumber.trim().toUpperCase()
    && company.legalName.trim() === input.legalName.trim()
    && company.registeredAddressLine1.trim() === input.registeredAddressLine1.trim()
    && PROFILE_NULLABLE.every((key) => {
      const submitted = input[key]?.trim();
      if (!submitted) return true;
      const saved = company[key]?.trim();
      return key === 'registeredPostcode' ? saved?.toUpperCase() === submitted.toUpperCase() : saved === submitted;
    });
}

export function taxCompanyRequestError(error: unknown): TaxApiError {
  const raw = record(error);
  const status = raw?.status;
  if (status === 404 || status === 405) return {
    code: 'FEATURE_UNAVAILABLE',
    error: 'Tax & Payroll is not available on this server yet. A server update is required before a company profile can be saved.',
  };
  const details = record(raw?.details);
  if (details && typeof details.error === 'string' && typeof details.code === 'string') {
    const fields = record(details.fieldErrors);
    return { error: details.error, code: details.code,
      ...(fields ? { fieldErrors: Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) } : {}) };
  }
  return { code: error instanceof TaxCompanyResponseError ? 'INVALID_RESPONSE' : 'REQUEST_FAILED',
    error: error instanceof Error ? error.message : 'Could not verify the company profile. Please refresh before trying again.' };
}
