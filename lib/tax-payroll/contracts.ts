// Shared DTOs and type contracts for Tax & Payroll Phase 1.
// These types are the public API surface between the Next.js routes
// and the iOS client. Keep them serialisation-safe (no Date objects;
// timestamps are ISO 8601 strings).

// ─── Enumerations ────────────────────────────────────────────────────────────

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
  | 'draft_cancelled'
  | 'hmrc_payment_recorded'
  | 'hmrc_adjustment_recorded'
  | 'hmrc_payment_voided'
  | 'hmrc_adjustment_voided';

// ─── Company profile ─────────────────────────────────────────────────────────

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

export interface CompanyProfileRevisionDto {
  id: string;
  companyId: string;
  version: number;
  snapshot: CompanyProfileDto;
  changedFields: string[];
  changedByUserId: string;
  createdAt: string;
}

// ─── Registration status ─────────────────────────────────────────────────────

export interface CompanyRegistrationStatusDto {
  taxService: TaxService;
  status: RegistrationStatus;
  declaredAt: string | null;
}

// ─── Capabilities / membership ───────────────────────────────────────────────

export interface MemberCapabilitiesDto {
  userId: string;
  capabilities: TaxCapability[];
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface PayrollSetupDto {
  state: 'not_activated' | 'active' | 'restricted';
  canActivate: boolean;
  canRead: boolean;
  canEditSettings: boolean;
}

export interface TaxPayrollOverviewDto {
  company: CompanyProfileDto | null;
  setupComplete: boolean;
  registrationStatuses: CompanyRegistrationStatusDto[];
  capabilities: TaxCapability[];
  payrollAvailable: boolean;
  payrollSummary: PayrollOverviewSummaryDto | null;
  /** Additive readiness metadata; older installed clients may ignore it. */
  payrollSetup?: PayrollSetupDto;
  vatAvailable: false;
  corporationTaxAvailable: false;
  documentsAvailable: false;
  submissionsAvailable: false;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

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

// ─── Request bodies ──────────────────────────────────────────────────────────

export interface CreateCompanyRequest {
  companyNumber: string;
  legalName: string;
  registeredAddressLine1: string;
  registeredAddressLine2?: string | null;
  registeredCity?: string | null;
  registeredCountry?: string | null;
  registeredPostcode?: string | null;
  tradingName?: string | null;
  tradingAddress?: string | null;
  businessEmail?: string | null;
  businessPhone?: string | null;
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
  // companyNumber is never accepted — it is immutable after creation
}

export interface DeclareRegistrationRequest {
  taxService: TaxService;
  status: RegistrationStatus;
}

// ─── Structured API errors ───────────────────────────────────────────────────

export type TaxApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT_VERSION'
  | 'CONFLICT_DUPLICATE'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface TaxApiError {
  error: string;
  code: TaxApiErrorCode;
  fieldErrors?: Record<string, string>;
}

// ─── Company list (GET /companies) ───────────────────────────────────────────

export interface CompanyListDto {
  companies: CompanyProfileDto[];
  canCreate: boolean;
}

// ─── Tax & Payroll Phase 2A: enumerations ─────────────────────────────────────

export type PayBasis = 'hourly' | 'fixed_period';

export type PayFrequency = 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly';

export type EmployeeStatus = 'active' | 'left' | 'suspended';

export type PayRunStatus = 'draft' | 'cancelled';

export type TaxCodeBasis = 'cumulative' | 'week1_month1';

export type TaxCodeSource = 'p45' | 'starter_checklist' | 'hmrc_notification';

export type StarterDeclaration = 'A' | 'B' | 'C';

export type CompletenessState = 'complete' | 'partial' | 'blocked';

export type PayrollReadinessSeverity = 'error' | 'warning' | 'info';

export type StarterSourceType = 'p45' | 'starter_checklist' | 'none_confirmed';

// ─── Payroll overview summary ─────────────────────────────────────────────────

export interface PayrollOverviewSummaryDto {
  isActivated: boolean;
  payFrequency: PayFrequency | null;
  scheduleLabel: string | null;
  activeEmployeeCount: number;
  draftRunCount: number;
  settingsVersion: number | null;
}

// ─── Employee DTOs ────────────────────────────────────────────────────────────

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
  /** Date of birth — only present when actor has payroll.sensitive.read */
  dateOfBirth: string | null | undefined;
  /** NINO masked (e.g. ******2C) — only present when actor has payroll.sensitive.read; null if not supplied */
  ninoMasked: string | null | undefined;
  linkedUserId: string | null;
  payrollIdMigrationRef: string | null;
  currentPayTerms: PayTermsDto | null;
}

/** Only returned when the actor has payroll.sensitive.read. */
export interface EmployeeSensitiveDto {
  employeeId: string;
  /** Plaintext NINO — never log or cache. Null if not supplied. */
  nino: string | null;
}

// ─── Starter data ─────────────────────────────────────────────────────────────

export interface StarterDataDto {
  id: string;
  employeeId: string;
  sourceType: StarterSourceType;
  sourceReference: string | null;
  p45LeavingDate: string | null;
  p45TotalPayPrevEmployment: string | null;
  p45TotalTaxPrevEmployment: string | null;
  p45TaxCode: string | null;
  p45Week1Month1: boolean | null;
  starterDeclaration: StarterDeclaration | null;
  studentLoanPlans: string[];
  postgraduateLoan: boolean;
  studentLoanUnknown: boolean;
  openingYtdTaxYear: string | null;
  openingYtdEffectiveDate: string | null;
  openingYtdGrossPay: string | null;
  openingYtdCompleteness: string;
  recordedAt: string;
}

// ─── Pay terms ────────────────────────────────────────────────────────────────

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

// ─── Payroll settings ─────────────────────────────────────────────────────────

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

// ─── Draft pay runs ───────────────────────────────────────────────────────────

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
  /** Always null — PAYE not calculated in Phase 2A */
  taxDeduction: null;
  /** Always null — NI not calculated in Phase 2A */
  niDeduction: null;
  /** Always null — net pay not available in Phase 2A */
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

// ─── Readiness ────────────────────────────────────────────────────────────────

export interface PayrollReadinessIssue {
  code: string;
  severity: PayrollReadinessSeverity;
  fieldPath: string | null;
  message: string;
  employeeId: string | null;
}

export interface PayrollReadinessDto {
  ready: boolean;
  issues: PayrollReadinessIssue[];
}

// ─── Employee list ────────────────────────────────────────────────────────────

export interface EmployeeListDto {
  employees: EmployeeSummaryDto[];
}

// ─── Phase 2A request types ───────────────────────────────────────────────────

export interface CreateEmployeeRequest {
  legalFirstName: string;
  legalSurname: string;
  employmentStartDate: string;
  employeeReference?: string | null;
  isDirector?: boolean;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressPostcode?: string | null;
  taxCode?: string | null;
  taxCodeBasis?: TaxCodeBasis | null;
  taxCodeEffectiveDate?: string | null;
  taxCodeSource?: TaxCodeSource | null;
  niCategory?: string | null;
  /** Plaintext NINO — encrypted server-side; never returned in list responses */
  nino?: string | null;
  linkedUserId?: string | null;
  payrollIdMigrationRef?: string | null;
  idempotencyKey?: string;
}

export interface UpdateEmployeeRequest {
  expectedVersion: number;
  legalFirstName?: string;
  legalSurname?: string;
  employmentStartDate?: string;
  employmentEndDate?: string | null;
  employeeReference?: string | null;
  isDirector?: boolean;
  employeeStatus?: EmployeeStatus;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressCity?: string | null;
  addressPostcode?: string | null;
  taxCode?: string | null;
  taxCodeBasis?: TaxCodeBasis | null;
  taxCodeEffectiveDate?: string | null;
  taxCodeSource?: TaxCodeSource | null;
  niCategory?: string | null;
  /** Provide to update the encrypted NINO. Omit entirely to leave unchanged. */
  nino?: string | null;
}

export interface CreatePayTermsRequest {
  payBasis: PayBasis;
  hourlyRate?: string | null;
  fixedPeriodGross?: string | null;
  payFrequency: PayFrequency;
  effectiveFrom: string;
  contractedHoursPerWeek?: string | null;
  annualSalaryNote?: string | null;
  sourceNote?: string | null;
}

export interface ActivatePayrollRequest {
  scheduleLabel: string;
  payFrequency: PayFrequency;
  scheduleAnchorDate?: string | null;
  monthlyPayDay?: number | null;
  timezone?: string;
}

export interface UpdatePayrollSettingsRequest {
  expectedVersion: number;
  scheduleLabel?: string;
  scheduleAnchorDate?: string | null;
  monthlyPayDay?: number | null;
  timezone?: string;
}

export interface CreatePayrollRunRequest {
  periodStart: string;
  periodEnd: string;
  intendedPaymentDate: string;
  idempotencyKey?: string;
}

export interface UpsertRunLinesRequest {
  /** Version last read by the client; a stale edit is rejected. */
  expectedVersion?: number;
  /** Replaces all lines for this employee in this run */
  employeeId: string;
  lines: Array<{
    lineType: 'hours_worked' | 'fixed_period' | 'overtime' | 'bonus' | 'commission';
    workedMinutes?: number | null;
    hourlyRateOverride?: string | null;
    fixedAmount?: string | null;
    description?: string | null;
    payTermsId?: string | null;
  }>;
}

// ─── Phase 2B–5 DTOs ─────────────────────────────────────────────────────────

export interface UpdatePayrollSettingsHmrcRequest {
  expectedVersion: number;
  payeReference?: string | null;
  accountsOfficeRef?: string | null;
  employerPensionSchemeRef?: string | null;
  pensionProviderName?: string | null;
  employeePensionRate?: number | null;
  employerPensionRate?: number | null;
  pensionContributionBasis?: 'qualifying_earnings' | 'pensionable_pay' | 'salary_sacrifice' | null;
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

export interface FinaliseRunRequest {
  expectedVersion: number;
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
  employeeId: string;
  filename: string;
  sizeBytes: number;
  contentHash: string;
  generatedAt: string;
  downloadUrl: string;
}

export interface PensionEnrolmentDto {
  employeeId: string;
  enrolmentStatus: string;
  workerCategory: string | null;
  enrolmentDate: string | null;
  optOutWindowEnds: string | null;
  lastAssessmentDate: string | null;
  thresholdsVersion: string | null;
}

export interface UpdatePensionEnrolmentRequest {
  action: 'enrol' | 'opt_out' | 'cease' | 'record_assessment';
  enrolmentDate?: string;
  optOutDate?: string;
  cessationDate?: string;
  assessmentDate?: string;
  annualisedEarningsPence?: number;
}

// ─── Phase 3A: Accounting ─────────────────────────────────────────────────────

export interface LedgerAccountDto {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  isSystemAccount: boolean;
}

export interface TrialBalanceDto {
  asOf: string;
  isBalanced: boolean;
  totalDebitPounds: string;
  totalCreditPounds: string;
  lines: Array<{
    code: string;
    name: string;
    accountType: string;
    normalBalance: string;
    debitTotalPounds: string;
    creditTotalPounds: string;
    netBalancePounds: string;
  }>;
}

// ─── Phase 3B: VAT ────────────────────────────────────────────────────────────

export interface VatPeriodDto {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: string;
}

export interface VatReturnDraftDto {
  id: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  box1OutputTaxPounds: string;
  box4InputTaxClaimedPounds: string;
  box5NetVatPayablePounds: string;
  box6TotalSalesNetPounds: string;
  box7TotalPurchasesNetPounds: string;
  transactionCount: number;
  status: string;
  version: number;
}

export interface CreateVatReturnRequest {
  periodId: string;
}

// ─── Phase 5: Corporation Tax ─────────────────────────────────────────────────

export interface CorporationTaxPeriodDto {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  taxableTotalProfitsPounds: string;
  netCtPayablePounds: string;
  marginalReliefPounds: string;
  rateApplied: string | null;
  effectiveRatePercent: string | null;
  version: number;
}

export interface UpdateCorporationTaxPeriodRequest {
  expectedVersion: number;
  tradingProfitsPence?: number;
  nonTradingIncomePence?: number;
  chargeableGainsPence?: number;
  exemptDistributionsPence?: number;
  associatedCompanies?: number;
}

// ─── Phase 4: RTI ─────────────────────────────────────────────────────────────

export interface RtiSubmissionDto {
  id: string;
  submissionType: 'FPS' | 'EPS';
  taxYear: string;
  paymentDate: string | null;
  employeeCount: number;
  status: string;
  validationWarnings: string[];
  createdAt: string;
}

export interface BuildFpsDraftRequest {
  runId: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

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

export interface MarkNotificationReadRequest {
  notificationId: string;
}

// ─── Documents ────────────────────────────────────────────────────────────────

export interface TaxDocumentListItemDto {
  id: string;
  kind: string;
  entityId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  generatedAt: string;
}

// ─── Submission guard ─────────────────────────────────────────────────────────

export interface SubmissionReadinessDto {
  canSubmit: false;
  checks: Array<{ name: string; passed: boolean; reason: string | null }>;
  blockedReason: string;
}

