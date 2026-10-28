// Mirrors lib/tax-payroll/contracts.ts — keep in sync when adding fields.
// Phase 2A enumerations
export type PayBasis = 'hourly' | 'fixed_period';
export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';
export type EmployeeStatus = 'active' | 'left' | 'suspended';
export type PayRunStatus = 'draft' | 'cancelled' | 'submitted_for_review' | 'approved' | 'finalised';
export type TaxCodeBasis = 'cumulative' | 'week1_month1';
export type TaxCodeSource = 'p45' | 'starter_checklist' | 'hmrc_notification';
export type CompletenessState = 'complete' | 'partial' | 'blocked';
export type PayrollReadinessSeverity = 'error' | 'warning' | 'info';

export type TaxService = 'corporation_tax' | 'vat' | 'paye';
export type RegistrationStatus = 'unknown' | 'not_registered' | 'registered';
export type TaxCapability =
  | 'tax.read'
  | 'tax.company.write'
  | 'tax.audit.read'
  | 'payroll.read'
  | 'payroll.settings.write'
  | 'payroll.employee.write'
  | 'payroll.draft.write'
  | 'payroll.sensitive.read';

export type TaxAuditEventType =
  | 'company_created'
  | 'profile_updated'
  | 'registration_declared'
  | 'payroll_activated'
  | 'payroll_settings_updated'
  | 'employee_created'
  | 'employee_updated'
  | 'pay_terms_created'
  | 'draft_created'
  | 'draft_lines_updated'
  | 'draft_calculated'
  | 'draft_cancelled';

export interface CompanyProfileDto {
  id: string;
  companyNumber: string;
  legalName: string;
  registeredAddressLine1: string;
  registeredAddressLine2: string | null;
  registeredCity: string | null;
  registeredCountry: string | null;
  registeredPostcode: string | null;
  tradingName: string | null;
  tradingAddress: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRegistrationStatusDto {
  taxService: TaxService;
  status: RegistrationStatus;
  declaredAt: string | null;
}

export interface PayrollOverviewSummaryDto {
  isActivated: boolean;
  payFrequency: PayFrequency | null;
  scheduleLabel: string | null;
  activeEmployeeCount: number;
  draftRunCount: number;
  settingsVersion: number | null;
}

export interface PayrollSetupDto {
  state: 'not_activated' | 'active' | 'restricted';
  canActivate: boolean;
  canRead: boolean;
  canEditSettings: boolean;
}

export interface TaxPayrollOverviewDto {
  company: CompanyProfileDto;
  setupComplete: boolean;
  registrationStatuses: CompanyRegistrationStatusDto[];
  capabilities: TaxCapability[];
  payrollAvailable: boolean;
  payrollSummary: PayrollOverviewSummaryDto | null;
  vatAvailable: boolean;
  corporationTaxAvailable: boolean;
  documentsAvailable: boolean;
  submissionsAvailable: boolean;
  payrollSetup?: PayrollSetupDto;
}

export interface CompanyListDto {
  companies: CompanyProfileDto[];
  canCreate: boolean;
}

export interface TaxAuditEventDto {
  id: string;
  companyId: string;
  eventType: TaxAuditEventType;
  actorUserId: string;
  summary: string;
  changedFields: string[] | null;
  createdAt: string;
}

export interface TaxAuditPageDto {
  events: TaxAuditEventDto[];
  nextCursor: string | null;
}

export interface CreateCompanyRequest {
  companyNumber: string;
  legalName: string;
  registeredAddressLine1: string;
  registeredAddressLine2?: string;
  registeredCity?: string;
  registeredCountry?: string;
  registeredPostcode?: string;
  tradingName?: string;
  tradingAddress?: string;
  businessEmail?: string;
  businessPhone?: string;
}

export interface UpdateCompanyRequest {
  expectedVersion: number;
  legalName?: string;
  registeredAddressLine1?: string;
  registeredAddressLine2?: string | null;
  registeredCity?: string | null;
  registeredCountry?: string | null;
  registeredPostcode?: string | null;
  tradingName?: string | null;
  tradingAddress?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
}

export interface TaxApiError {
  error: string;
  code: string;
  fieldErrors?: Record<string, string>;
}

// ─── Phase 2A DTOs ────────────────────────────────────────────────────────────

export interface EmployeeSummaryDto {
  id: string;
  companyId: string;
  legalFirstName: string;
  legalSurname: string;
  employeeReference: string | null;
  employmentStartDate: string;
  employmentEndDate: string | null;
  isDirector: boolean;
  employeeStatus: EmployeeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PayTermsDto {
  id: string;
  employeeId: string;
  companyId: string;
  payBasis: PayBasis;
  hourlyRate: string | null;
  fixedPeriodGross: string | null;
  currency: string;
  annualSalaryNote: string | null;
  payFrequency: PayFrequency;
  contractedHoursPerWeek: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceNote: string | null;
  version: number;
  createdAt: string;
}

export interface EmployeeDetailDto extends EmployeeSummaryDto {
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostcode: string | null;
  taxCode: string | null;
  taxCodeBasis: TaxCodeBasis | null;
  taxCodeEffectiveDate: string | null;
  taxCodeSource: TaxCodeSource | null;
  niCategory: string | null;
  dateOfBirth?: string | null;
  ninoMasked?: string | null;
  linkedUserId: string | null;
  payrollIdMigrationRef: string | null;
  currentPayTerms: PayTermsDto | null;
}

export interface EmployeeListDto {
  employees: EmployeeSummaryDto[];
}

export interface PayrollSettingsDto {
  id: string;
  companyId: string;
  scheduleLabel: string;
  payFrequency: PayFrequency;
  scheduleAnchorDate: string | null;
  monthlyPayDay: number | null;
  timezone: string;
  version: number;
  activatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollRunLineDto {
  id: string;
  runId: string;
  employeeId: string;
  payTermsId: string | null;
  lineType: 'hours_worked' | 'fixed_period' | 'overtime' | 'bonus' | 'commission';
  workedMinutes: number | null;
  hourlyRateOverride: string | null;
  fixedAmount: string | null;
  description: string | null;
  enteredByUserId: string;
  createdAt: string;
}

export interface PerEmployeeGrossDto {
  employeeId: string;
  legalFirstName: string;
  legalSurname: string;
  grossPay: string | null;
  lineCount: number;
  hasUnsupportedLines: boolean;
  taxDeduction: null;
  niDeduction: null;
  netPay: null;
  disclaimer: 'Tax and deductions not calculated';
}

export interface GrossPayPreviewDto {
  id: string;
  runId: string;
  companyId: string;
  calcPolicyVersion: string;
  completenessState: CompletenessState;
  grossTotal: string | null;
  supportedSubtotal: string | null;
  hasUnsupportedLines: boolean;
  perEmployeeResults: PerEmployeeGrossDto[];
  taxNotCalculated: true;
  netPayNotCalculated: true;
  disclaimer: 'Not a payslip. Tax and deductions not calculated.';
  calculatedAt: string;
  calculatedByUserId: string;
}

export interface PayrollRunSummaryDto {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  intendedPaymentDate: string;
  runStatus: PayRunStatus;
  employeeCount: number;
  latestPreview: GrossPayPreviewDto | null;
  version: number;
  createdAt: string;
}

export interface PayrollRunDto extends PayrollRunSummaryDto {
  lines: PayrollRunLineDto[];
  settingsId: string;
}

export interface PayrollReadinessIssue {
  code: string;
  severity: PayrollReadinessSeverity;
  fieldPath: string | null;
  message: string;
  employeeId: string | null;
}

// ─── Phase 2A request types ───────────────────────────────────────────────────

export interface CreateEmployeeRequest {
  legalFirstName: string;
  legalSurname: string;
  employmentStartDate: string;
  employeeReference?: string | null;
  isDirector?: boolean;
  dateOfBirth?: string | null;
  taxCode?: string | null;
  taxCodeBasis?: TaxCodeBasis | null;
  niCategory?: string | null;
  nino?: string | null;
  idempotencyKey?: string;
}

export interface UpdateEmployeeRequest {
  expectedVersion: number;
  legalFirstName?: string;
  legalSurname?: string;
  employmentStartDate?: string;
  employmentEndDate?: string | null;
  employeeStatus?: EmployeeStatus;
  taxCode?: string | null;
  taxCodeBasis?: TaxCodeBasis | null;
  niCategory?: string | null;
  nino?: string | null;
}

export interface CreatePayTermsRequest {
  payBasis: PayBasis;
  hourlyRate?: string | null;
  fixedPeriodGross?: string | null;
  payFrequency: PayFrequency;
  effectiveFrom: string;
  contractedHoursPerWeek?: string | null;
}

export interface ActivatePayrollRequest {
  scheduleLabel: string;
  payFrequency: PayFrequency;
  scheduleAnchorDate?: string | null;
  monthlyPayDay?: number | null;
}

export interface UpdatePayrollSettingsRequest {
  expectedVersion: number;
  scheduleLabel?: string;
  scheduleAnchorDate?: string | null;
  monthlyPayDay?: number | null;
}

export interface CreatePayrollRunRequest {
  periodStart: string;
  periodEnd: string;
  intendedPaymentDate: string;
  idempotencyKey?: string;
}

export interface UpsertRunLinesRequest {
  employeeId: string;
  expectedVersion?: number;
  lines: Array<{
    lineType: 'hours_worked' | 'fixed_period' | 'overtime' | 'bonus' | 'commission';
    workedMinutes?: number | null;
    hourlyRateOverride?: string | null;
    fixedAmount?: string | null;
    description?: string | null;
    payTermsId?: string | null;
  }>;
}

// ─── Phase 2B–5 types ─────────────────────────────────────────────────────────

export interface FinaliseRunRequest {
  expectedVersion: number;
}

export interface SubmitRunForReviewRequest {
  expectedVersion: number;
}

export interface ProcessReviewRequest {
  action: 'approve' | 'reject';
  expectedVersion: number;
  notes?: string;
}

export interface ReviewDto {
  id: string;
  entityType: string;
  entityId: string;
  submittedByUserId: string;
  reviewedByUserId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  version: number;
}

export interface FinalisedRunSummaryDto {
  runId: string;
  periodStart: string;
  periodEnd: string;
  intendedPaymentDate: string;
  finalisedAt: string;
  employeeCount: number;
  blockedEmployeeCount: number;
  totalGrossPounds: string;
  totalTaxPounds: string;
  totalEmployeeNiPounds: string;
  totalEmployerNiPounds: string;
  totalNetPayPounds: string;
  rulesetVersion: string;
}

export interface PayslipDocumentDto {
  id: string;
  kind: string;
  filename: string;
  mimeType?: string;
  sizeBytes: number;
  contentHash?: string;
  generatedAt: string;
  downloadUrl?: string;
}

export interface TaxNotificationDto {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'action_required';
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface VatPeriodDto {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: string;
  version: number;
}

export interface VatReturnDto {
  id: string;
  periodKey: string;
  box1OutputTaxPence: number;
  box4InputTaxClaimedPence: number;
  box5NetVatPayablePence: number;
  box6TotalSalesNetPence: number;
  box7TotalPurchasesNetPence: number;
  status: string;
  version: number;
}

export interface CorporationTaxPeriodDto {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  taxableTotalProfitsPence: number;
  netCtPayablePence: number;
  marginalReliefPence: number;
  rateApplied: string | null;
  effectiveRateBps: number | null;
  version: number;
}

export interface SubmissionReadinessDto {
  canSubmit: false;
  checks: Array<{ name: string; passed: boolean; reason: string | null }>;
  blockedReason: string;
}
