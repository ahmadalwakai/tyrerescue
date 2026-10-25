import 'server-only';

/**
 * RTI (Real Time Information) payroll submission adapter.
 *
 * Builds FPS (Full Payment Submission), EPS (Employer Payment Summary),
 * and reads DPS (Data Provisioning Service) notices.
 *
 * Phase 4 scope:
 * - Build draft XML payloads for FPS and EPS
 * - Validate against schema rules
 * - Record submission attempt in database (status = 'draft')
 *
 * What this service does NOT do (production guard):
 * - Connect to HMRC Gateway (no outbound RTI calls in this phase)
 * - Use real PAYE reference numbers as submission targets
 * - Store or log real NINO values in submission payloads
 *
 * RTI spec: HMRC PAYE RTI Technical Pack 2026-27
 *
 * HMRC Schema namespace: http://www.govtalk.gov.uk/taxation/PAYE/RTI/...
 */

export type RtiSubmissionType = 'FPS' | 'EPS' | 'NINO_VER' | 'NVR';

export type RtiSubmissionStatus =
  | 'draft'
  | 'validated'
  | 'submission_pending'   // authorised but not yet submitted
  | 'submitted'
  | 'acknowledged'
  | 'rejected';

// ─── Fraud prevention headers (required by HMRC API spec) ────────────────────

export interface FraudPreventionHeaders {
  'Gov-Client-Connection-Method': string;
  'Gov-Client-Device-ID': string;
  'Gov-Client-Timezone': string;
  'Gov-Client-User-IDs': string;
  'Gov-Client-User-Agent': string;
  'Gov-Vendor-Version': string;
  'Gov-Vendor-Forwarded': string;
}

export function buildServerSideFraudHeaders(vendorVersion: string): FraudPreventionHeaders {
  // Server-side only (batch process) — uses a limited set of headers
  // per HMRC Fraud Prevention spec v3.0 for server-to-server.
  return {
    'Gov-Client-Connection-Method': 'SERVER_TOKEN',
    'Gov-Client-Device-ID': '', // populated at submission time from config
    'Gov-Client-Timezone': 'Europe/London',
    'Gov-Client-User-IDs': '', // populated at submission time
    'Gov-Client-User-Agent': 'TyreRescue-Tax/1.0',
    'Gov-Vendor-Version': vendorVersion,
    'Gov-Vendor-Forwarded': '',
  };
}

// ─── Employee record for FPS ──────────────────────────────────────────────────

export interface FpsEmployee {
  /** Employee ID (internal, not in XML). */
  employeeId: string;
  /** Encrypted NINO — decrypt before building XML. Service will redact in logs. */
  ninoEncrypted: string | null;
  legalFirstName: string;
  legalSurname: string;
  dateOfBirth: string | null;
  taxCode: string;
  taxCodeBasis: 'cumulative' | 'week1_month1';
  niCategory: string;
  paymentDate: string;
  periodNumber: number;
  frequency: 'W1' | 'M1' | 'W2' | 'W4' | 'M3' | 'M6' | 'MA';
  grossPayPence: number;
  taxForPeriodPence: number;
  employeeNiPence: number;
  grossYtdPence: number;
  taxYtdPence: number;
  employeeNiYtdPence: number;
  studentLoanDeductionPence: number;
  isNewStarter: boolean;
  isLeaver: boolean;
  leavingDate?: string;
}

export interface FpsInput {
  companyId: string;
  payeReference: string;     // e.g. "123/AB12345" — populated from company settings
  accountsOfficeRef: string; // e.g. "123PA00012345"
  taxYear: string;           // e.g. "2026-27"
  employees: FpsEmployee[];
  relatedTaxMonth: number;
  paymentDate: string;
  senderId: string;
}

// ─── FPS XML builder ──────────────────────────────────────────────────────────

export interface FpsDraftResult {
  submissionType: 'FPS';
  companyId: string;
  taxYear: string;
  paymentDate: string;
  employeeCount: number;
  xmlPayload: string;
  status: RtiSubmissionStatus;
  generatedAt: string;
  validationWarnings: string[];
}

export function buildFpsDraft(input: FpsInput): FpsDraftResult {
  const warnings: string[] = [];

  // Validate PAYE reference format
  if (!/^\d{3}\/[A-Z0-9]{1,10}$/.test(input.payeReference)) {
    warnings.push(`PAYE reference "${input.payeReference}" does not match expected format ###/XXXXXXXX`);
  }

  const xmlLines: string[] = [];
  xmlLines.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlLines.push('<GovTalkMessage xmlns="http://www.govtalk.gov.uk/schemas/govtalk/govtalkheader"');
  xmlLines.push('  xmlns:pn="http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/2013/09/12">');
  xmlLines.push('  <EnvelopeVersion>2.0</EnvelopeVersion>');
  xmlLines.push('  <Header>');
  xmlLines.push(`    <MessageDetails>`);
  xmlLines.push(`      <Class>HMRC-PAYE-RTI-FPS</Class>`);
  xmlLines.push(`      <Qualifier>request</Qualifier>`);
  xmlLines.push(`      <Function>submit</Function>`);
  xmlLines.push(`      <CorrelationID></CorrelationID>`);
  xmlLines.push(`      <Transformation>XML</Transformation>`);
  xmlLines.push(`    </MessageDetails>`);
  xmlLines.push('  </Header>');
  xmlLines.push('  <Body>');
  xmlLines.push('    <pn:FullPaymentSubmission>');
  xmlLines.push(`      <pn:PayeReference>${escapeXml(input.payeReference)}</pn:PayeReference>`);
  xmlLines.push(`      <pn:AccountsOfficeRef>${escapeXml(input.accountsOfficeRef)}</pn:AccountsOfficeRef>`);
  xmlLines.push(`      <pn:TaxYear>${escapeXml(input.taxYear.replace('-', ''))}</pn:TaxYear>`);
  xmlLines.push(`      <pn:PaymentDate>${input.paymentDate}</pn:PaymentDate>`);
  xmlLines.push(`      <pn:EarliestPayDate>${input.paymentDate}</pn:EarliestPayDate>`);

  for (const emp of input.employees) {
    if (!emp.ninoEncrypted) {
      warnings.push(`Employee ${emp.employeeId.slice(0, 8)}: NINO not held — using TEMP NINO placeholder (TN010101A)`);
    }

    // NINO is decrypted server-side — in this draft build we use a placeholder
    // The real value is injected by the submission service at submission time.
    const ninoPlaceholder = emp.ninoEncrypted ? '[NINO_REDACTED]' : 'TN010101A';

    xmlLines.push('      <pn:Employee>');
    xmlLines.push(`        <pn:NINO>${escapeXml(ninoPlaceholder)}</pn:NINO>`);
    xmlLines.push(`        <pn:Forename>${escapeXml(emp.legalFirstName)}</pn:Forename>`);
    xmlLines.push(`        <pn:Surname>${escapeXml(emp.legalSurname)}</pn:Surname>`);
    if (emp.dateOfBirth) {
      xmlLines.push(`        <pn:DateOfBirth>${emp.dateOfBirth}</pn:DateOfBirth>`);
    }
    xmlLines.push(`        <pn:TaxCode>${escapeXml(emp.taxCode)}</pn:TaxCode>`);
    xmlLines.push(`        <pn:TaxCodeBasisNonCumulative>${emp.taxCodeBasis === 'week1_month1' ? 'true' : 'false'}</pn:TaxCodeBasisNonCumulative>`);
    xmlLines.push(`        <pn:NICategory>${escapeXml(emp.niCategory)}</pn:NICategory>`);
    xmlLines.push(`        <pn:PayFrequency>${emp.frequency}</pn:PayFrequency>`);
    xmlLines.push(`        <pn:TaxablePay>${formatPence(emp.grossPayPence)}</pn:TaxablePay>`);
    xmlLines.push(`        <pn:TaxDeducted>${formatPence(emp.taxForPeriodPence)}</pn:TaxDeducted>`);
    xmlLines.push(`        <pn:EmployeeNICsInPeriod>${formatPence(emp.employeeNiPence)}</pn:EmployeeNICsInPeriod>`);
    xmlLines.push(`        <pn:GrossEarningsForNICs>${formatPence(emp.grossPayPence)}</pn:GrossEarningsForNICs>`);
    xmlLines.push(`        <pn:TaxablePayToDate>${formatPence(emp.grossYtdPence)}</pn:TaxablePayToDate>`);
    xmlLines.push(`        <pn:TotalTaxToDate>${formatPence(emp.taxYtdPence)}</pn:TotalTaxToDate>`);
    xmlLines.push(`        <pn:EmployeeNICsYTD>${formatPence(emp.employeeNiYtdPence)}</pn:EmployeeNICsYTD>`);
    if (emp.studentLoanDeductionPence > 0) {
      xmlLines.push(`        <pn:StudentLoan>${formatPence(emp.studentLoanDeductionPence)}</pn:StudentLoan>`);
    }
    if (emp.isLeaver && emp.leavingDate) {
      xmlLines.push(`        <pn:LeavingDate>${emp.leavingDate}</pn:LeavingDate>`);
    }
    xmlLines.push('      </pn:Employee>');
  }

  xmlLines.push('    </pn:FullPaymentSubmission>');
  xmlLines.push('  </Body>');
  xmlLines.push('</GovTalkMessage>');

  return {
    submissionType: 'FPS',
    companyId: input.companyId,
    taxYear: input.taxYear,
    paymentDate: input.paymentDate,
    employeeCount: input.employees.length,
    xmlPayload: xmlLines.join('\n'),
    status: 'draft',
    generatedAt: new Date().toISOString(),
    validationWarnings: warnings,
  };
}

// ─── EPS (Employer Payment Summary) ──────────────────────────────────────────

export interface EpsInput {
  companyId: string;
  payeReference: string;
  accountsOfficeRef: string;
  taxYear: string;
  taxMonth: number;
  reclaimedSmpPence: number;
  reclaimedSspPence: number;
  noEmployeesInPeriod: boolean;
  apprenticeLevyAmountPence: number;
  apprenticeLevyYtdPence: number;
}

export interface EpsDraftResult {
  submissionType: 'EPS';
  companyId: string;
  taxYear: string;
  taxMonth: number;
  xmlPayload: string;
  status: RtiSubmissionStatus;
  generatedAt: string;
}

export function buildEpsDraft(input: EpsInput): EpsDraftResult {
  const xmlLines: string[] = [];
  xmlLines.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlLines.push('<GovTalkMessage xmlns="http://www.govtalk.gov.uk/schemas/govtalk/govtalkheader"');
  xmlLines.push('  xmlns:eps="http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/2013/09/12">');
  xmlLines.push('  <EnvelopeVersion>2.0</EnvelopeVersion>');
  xmlLines.push('  <Header>');
  xmlLines.push('    <MessageDetails>');
  xmlLines.push('      <Class>HMRC-PAYE-RTI-EPS</Class>');
  xmlLines.push('      <Qualifier>request</Qualifier>');
  xmlLines.push('      <Function>submit</Function>');
  xmlLines.push('      <Transformation>XML</Transformation>');
  xmlLines.push('    </MessageDetails>');
  xmlLines.push('  </Header>');
  xmlLines.push('  <Body>');
  xmlLines.push('    <eps:EmployerPaymentSummary>');
  xmlLines.push(`      <eps:PayeReference>${escapeXml(input.payeReference)}</eps:PayeReference>`);
  xmlLines.push(`      <eps:TaxYear>${input.taxYear.replace('-', '')}</eps:TaxYear>`);
  xmlLines.push(`      <eps:RelatedTaxYear>${input.taxYear.slice(0, 4)}</eps:RelatedTaxYear>`);
  xmlLines.push(`      <eps:TaxMonth>${input.taxMonth}</eps:TaxMonth>`);
  if (input.noEmployeesInPeriod) {
    xmlLines.push('      <eps:NoPaymentDue>true</eps:NoPaymentDue>');
  }
  if (input.reclaimedSmpPence > 0) {
    xmlLines.push(`      <eps:SMPReclaimed>${formatPence(input.reclaimedSmpPence)}</eps:SMPReclaimed>`);
  }
  if (input.reclaimedSspPence > 0) {
    xmlLines.push(`      <eps:SSPReclaimed>${formatPence(input.reclaimedSspPence)}</eps:SSPReclaimed>`);
  }
  if (input.apprenticeLevyAmountPence > 0) {
    xmlLines.push(`      <eps:ApprenticeLevy>${formatPence(input.apprenticeLevyAmountPence)}</eps:ApprenticeLevy>`);
    xmlLines.push(`      <eps:ApprenticeLevyYTD>${formatPence(input.apprenticeLevyYtdPence)}</eps:ApprenticeLevyYTD>`);
  }
  xmlLines.push('    </eps:EmployerPaymentSummary>');
  xmlLines.push('  </Body>');
  xmlLines.push('</GovTalkMessage>');

  return {
    submissionType: 'EPS',
    companyId: input.companyId,
    taxYear: input.taxYear,
    taxMonth: input.taxMonth,
    xmlPayload: xmlLines.join('\n'),
    status: 'draft',
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format pence as pounds to 2dp (RTI XML uses pounds, not pence). */
function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}
