import 'server-only';

/**
 * Payslip PDF generation using pdf-lib.
 *
 * Generates actual server-side PDFs for finalised payroll results.
 * These are drafts for review; finalised payslips require an approved run.
 *
 * NOTE: This does not generate statutory forms (P45/P60 are separate workflows).
 * NOTE: PDFs are not stored — callers must persist the bytes via document-service.
 *
 * Required payslip content (per HMRC/statutory guidance):
 * - Employer name and address
 * - Employee name and payroll reference
 * - Tax code and NI category
 * - Pay period and payment date
 * - Gross pay (all earnings items)
 * - All deductions itemised
 * - Net pay
 * - YTD totals
 * - Disclaimer when calculations are partial
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import type { FinalisedEmployeeResult, FinalisationResult } from './payroll-finalisation';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PayslipInput {
  employer: {
    legalName: string;
    addressLine1: string;
    addressLine2?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  employee: FinalisedEmployeeResult;
  run: {
    periodStart: string;
    periodEnd: string;
    intendedPaymentDate: string;
    finalisedAt: string;
    rulesetVersion: string;
  };
  earnings: Array<{
    description: string;
    amountPounds: string;
  }>;
  ytd: {
    grossPayYtdPounds: string;
    taxYtdPounds: string;
    employeeNiYtdPounds: string;
    netPayYtdPounds: string;
  };
  /** If true, add disclaimer that calculations are partial/subject to review. */
  isPartial: boolean;
}

export interface PayslipGenerationResult {
  employeeId: string;
  pdfBytes: Uint8Array;
  contentHash: string;
  generatedAt: string;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const MARGIN = 40;
const PAGE_WIDTH = 595; // A4 points
const PAGE_HEIGHT = 842;
const COL1_X = MARGIN;
const COL2_X = PAGE_WIDTH / 2 + MARGIN;
const LABEL_FONT_SIZE = 8;
const VALUE_FONT_SIZE = 9;
const HEADING_SIZE = 11;
const TITLE_SIZE = 14;

interface DrawState {
  page: PDFPage;
  y: number;
  regularFont: PDFFont;
  boldFont: PDFFont;
}

function drawText(
  state: DrawState,
  text: string,
  x: number,
  y: number,
  size: number,
  bold = false,
  color = rgb(0.1, 0.1, 0.1),
) {
  state.page.drawText(text, {
    x,
    y,
    size,
    font: bold ? state.boldFont : state.regularFont,
    color,
  });
}

function drawLine(state: DrawState, x1: number, y1: number, x2: number, y2: number) {
  state.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
}

function drawRect(state: DrawState, x: number, y: number, w: number, h: number, fill = rgb(0.95, 0.95, 0.95)) {
  state.page.drawRectangle({ x, y, width: w, height: h, color: fill });
}

function gbp(pounds: string): string {
  const num = parseFloat(pounds);
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(num);
}

// ─── Payslip generation ───────────────────────────────────────────────────────

export async function generatePayslipPdf(input: PayslipInput): Promise<PayslipGenerationResult> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const state: DrawState = { page, y: PAGE_HEIGHT - MARGIN, regularFont, boldFont };

  // ── Header bar ────────────────────────────────────────────────────────────
  drawRect(state, 0, PAGE_HEIGHT - 60, PAGE_WIDTH, 60, rgb(0.12, 0.12, 0.25));
  page.drawText('PAYSLIP', {
    x: MARGIN, y: PAGE_HEIGHT - 38,
    size: TITLE_SIZE, font: boldFont, color: rgb(1, 1, 1),
  });
  page.drawText('CONFIDENTIAL', {
    x: PAGE_WIDTH - 130, y: PAGE_HEIGHT - 38,
    size: LABEL_FONT_SIZE, font: regularFont, color: rgb(0.7, 0.7, 0.9),
  });
  page.drawText(`Tax Year: ${input.run.rulesetVersion}`, {
    x: PAGE_WIDTH - 130, y: PAGE_HEIGHT - 52,
    size: LABEL_FONT_SIZE, font: regularFont, color: rgb(0.7, 0.7, 0.9),
  });

  state.y = PAGE_HEIGHT - 80;

  // ── Employer info ─────────────────────────────────────────────────────────
  drawText(state, 'EMPLOYER', COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 14;
  drawText(state, input.employer.legalName, COL1_X, state.y, HEADING_SIZE, true);
  state.y -= 12;
  if (input.employer.addressLine1) {
    drawText(state, input.employer.addressLine1, COL1_X, state.y, VALUE_FONT_SIZE);
    state.y -= 12;
  }
  if (input.employer.city || input.employer.postcode) {
    drawText(state, [input.employer.city, input.employer.postcode].filter(Boolean).join(' '), COL1_X, state.y, VALUE_FONT_SIZE);
    state.y -= 12;
  }

  // ── Employee info (right column) ──────────────────────────────────────────
  let rightY = PAGE_HEIGHT - 94;
  drawText(state, 'EMPLOYEE', COL2_X, rightY, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  rightY -= 14;
  drawText(state, `${input.employee.legalFirstName} ${input.employee.legalSurname}`, COL2_X, rightY, HEADING_SIZE, true);
  rightY -= 12;
  drawText(state, `Employee ID: ${input.employee.employeeId.slice(0, 8).toUpperCase()}`, COL2_X, rightY, VALUE_FONT_SIZE);
  rightY -= 12;
  drawText(state, `Tax Code: ${input.employee.taxCode}`, COL2_X, rightY, VALUE_FONT_SIZE);
  rightY -= 12;
  drawText(state, `NI Category: ${input.employee.niCategory}`, COL2_X, rightY, VALUE_FONT_SIZE);
  rightY -= 12;
  drawText(state, `NI Calc: Period ${input.employee.periodNumber}`, COL2_X, rightY, VALUE_FONT_SIZE);

  state.y = Math.min(state.y, rightY) - 10;
  drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y -= 14;

  // ── Pay period ────────────────────────────────────────────────────────────
  drawText(state, 'PAY PERIOD', COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  drawText(state, 'PAYMENT DATE', COL2_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 13;
  drawText(state, `${input.run.periodStart} to ${input.run.periodEnd}`, COL1_X, state.y, VALUE_FONT_SIZE, true);
  drawText(state, input.run.intendedPaymentDate, COL2_X, state.y, VALUE_FONT_SIZE, true);
  state.y -= 20;

  drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y -= 14;

  // ── Earnings ──────────────────────────────────────────────────────────────
  drawText(state, 'EARNINGS', COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  drawText(state, 'AMOUNT', PAGE_WIDTH - MARGIN - 80, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 13;

  for (const earning of input.earnings) {
    drawText(state, earning.description, COL1_X + 10, state.y, VALUE_FONT_SIZE);
    const amtStr = gbp(earning.amountPounds);
    const amtW = boldFont.widthOfTextAtSize(amtStr, VALUE_FONT_SIZE);
    drawText(state, amtStr, PAGE_WIDTH - MARGIN - amtW, state.y, VALUE_FONT_SIZE, true);
    state.y -= 12;
  }

  // Gross total
  drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y -= 13;
  drawText(state, 'Gross Pay', COL1_X + 10, state.y, VALUE_FONT_SIZE, true);
  const grossStr = gbp(input.employee.grossPayPounds);
  const grossW = boldFont.widthOfTextAtSize(grossStr, VALUE_FONT_SIZE);
  drawText(state, grossStr, PAGE_WIDTH - MARGIN - grossW, state.y, VALUE_FONT_SIZE, true);
  state.y -= 20;

  // ── Deductions ────────────────────────────────────────────────────────────
  drawText(state, 'DEDUCTIONS', COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  drawText(state, 'AMOUNT', PAGE_WIDTH - MARGIN - 80, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 13;

  const deductions = [
    { label: `Income Tax (${input.employee.taxCode})`, amount: input.employee.taxForPeriodPounds },
    { label: `Employee NI (Cat ${input.employee.niCategory})`, amount: input.employee.employeeNiPounds },
  ];
  if (parseFloat(input.employee.studentLoanPounds) > 0) {
    deductions.push({ label: 'Student Loan', amount: input.employee.studentLoanPounds });
  }

  for (const ded of deductions) {
    drawText(state, ded.label, COL1_X + 10, state.y, VALUE_FONT_SIZE);
    const dedStr = gbp(ded.amount);
    const dedW = boldFont.widthOfTextAtSize(dedStr, VALUE_FONT_SIZE);
    drawText(state, dedStr, PAGE_WIDTH - MARGIN - dedW, state.y, VALUE_FONT_SIZE, true);
    state.y -= 12;
  }

  drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y -= 13;
  drawText(state, 'Total Deductions', COL1_X + 10, state.y, VALUE_FONT_SIZE, true);
  const dedTotalStr = gbp(input.employee.totalDeductionsPounds);
  const dedTotalW = boldFont.widthOfTextAtSize(dedTotalStr, VALUE_FONT_SIZE);
  drawText(state, dedTotalStr, PAGE_WIDTH - MARGIN - dedTotalW, state.y, VALUE_FONT_SIZE, true);
  state.y -= 20;

  // ── Net pay highlight box ─────────────────────────────────────────────────
  drawRect(state, MARGIN, state.y - 28, PAGE_WIDTH - 2 * MARGIN, 38, rgb(0.12, 0.12, 0.25));
  drawText(state, 'NET PAY', COL1_X + 12, state.y - 8, HEADING_SIZE, true, rgb(1, 1, 1));
  const netStr = gbp(input.employee.netPayPounds);
  const netW = boldFont.widthOfTextAtSize(netStr, 14);
  page.drawText(netStr, {
    x: PAGE_WIDTH - MARGIN - netW - 12,
    y: state.y - 12,
    size: 14, font: boldFont, color: rgb(1, 1, 1),
  });
  state.y -= 50;

  // ── Employer NI (informational) ───────────────────────────────────────────
  drawText(state, `Employer NI Contribution (Cat ${input.employee.niCategory}): ${gbp(input.employee.employerNiPounds)}`, COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 20;

  // ── YTD table ─────────────────────────────────────────────────────────────
  drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
  state.y -= 14;
  drawText(state, 'YEAR-TO-DATE TOTALS', COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
  state.y -= 13;

  const ytdItems = [
    { label: 'Gross Pay', value: input.ytd.grossPayYtdPounds },
    { label: 'Income Tax', value: input.ytd.taxYtdPounds },
    { label: 'Employee NI', value: input.ytd.employeeNiYtdPounds },
    { label: 'Net Pay', value: input.ytd.netPayYtdPounds },
  ];

  const ytdColW = (PAGE_WIDTH - 2 * MARGIN) / ytdItems.length;
  for (let i = 0; i < ytdItems.length; i++) {
    const x = MARGIN + i * ytdColW;
    drawText(state, ytdItems[i].label, x, state.y, LABEL_FONT_SIZE, false, rgb(0.5, 0.5, 0.5));
    drawText(state, gbp(ytdItems[i].value), x, state.y - 14, VALUE_FONT_SIZE, true);
  }
  state.y -= 35;

  // ── Warnings / disclaimer ─────────────────────────────────────────────────
  if (input.employee.warnings.length > 0 || input.isPartial) {
    drawLine(state, MARGIN, state.y, PAGE_WIDTH - MARGIN, state.y);
    state.y -= 14;
    const disclaimer = input.isPartial
      ? 'This payslip contains partial calculations. Some deductions may be subject to review. Not a final payslip.'
      : input.employee.warnings.join(' | ');
    drawText(state, disclaimer, COL1_X, state.y, LABEL_FONT_SIZE, false, rgb(0.7, 0.3, 0.1));
    state.y -= 14;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 24;
  drawLine(state, MARGIN, footerY + 8, PAGE_WIDTH - MARGIN, footerY + 8);
  page.drawText(
    `Generated: ${new Date().toLocaleDateString('en-GB')} | Rules: ${input.run.rulesetVersion} | Keep this payslip for your records`,
    { x: MARGIN, y: footerY, size: 7, font: regularFont, color: rgb(0.6, 0.6, 0.6) },
  );

  const pdfBytes = await pdfDoc.save();

  // SHA-256 hash of bytes
  const { createHash } = await import('crypto');
  const contentHash = createHash('sha256').update(pdfBytes).digest('hex');

  return {
    employeeId: input.employee.employeeId,
    pdfBytes,
    contentHash,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate payslips for all employees in a finalised run.
 */
export async function generatePayslipsForRun(
  finalisationResult: FinalisationResult,
  employerInfo: PayslipInput['employer'],
): Promise<PayslipGenerationResult[]> {
  const results: PayslipGenerationResult[] = [];

  for (const emp of finalisationResult.employeeResults) {
    const result = await generatePayslipPdf({
      employer: employerInfo,
      employee: emp,
      run: {
        periodStart: finalisationResult.periodStart,
        periodEnd: finalisationResult.periodEnd,
        intendedPaymentDate: finalisationResult.intendedPaymentDate,
        finalisedAt: finalisationResult.finalisedAt,
        rulesetVersion: finalisationResult.rulesetVersion,
      },
      earnings: [
        { description: 'Gross Pay', amountPounds: emp.grossPayPounds },
      ],
      ytd: {
        grossPayYtdPounds: emp.grossPayPounds,
        taxYtdPounds: emp.taxForPeriodPounds,
        employeeNiYtdPounds: emp.employeeNiPounds,
        netPayYtdPounds: emp.netPayPounds,
      },
      isPartial: emp.calculationStatus !== 'calculated',
    });
    results.push(result);
  }

  return results;
}
