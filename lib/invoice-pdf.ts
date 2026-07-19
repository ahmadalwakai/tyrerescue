import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  createBookingCustomerInvoice,
  type BookingCustomerInvoice,
  type StandaloneAdminInvoice,
} from '@/lib/invoices/invoice-domain';

export type InvoicePdfData = StandaloneAdminInvoice;

interface InvoiceRenderData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: number;
  bookingReference?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
}

const ORANGE = rgb(249 / 255, 115 / 255, 22 / 255);
const DARK = rgb(9 / 255, 9 / 255, 11 / 255);
const GREY = rgb(161 / 255, 161 / 255, 170 / 255);
const LIGHT_GREY = rgb(245 / 255, 245 / 255, 245 / 255);
const WHITE = rgb(1, 1, 1);

/** Strip characters outside the WinAnsi range that pdf-lib StandardFonts cannot encode */
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

function fmtPrice(n: number): string {
  return `£${n.toFixed(2)}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function drawTyreRescueLogo(
  page: PDFPage,
  options: {
    x: number;
    y: number;
    fontBold: PDFFont;
    lightText?: boolean;
  },
): void {
  const { x, y, fontBold, lightText = true } = options;
  const iconX = x + 15;
  const iconY = y + 15;
  const textX = x + 42;

  page.drawCircle({
    x: iconX,
    y: iconY,
    size: 26,
    borderWidth: 4,
    borderColor: ORANGE,
  });
  page.drawCircle({
    x: iconX,
    y: iconY,
    size: 14,
    borderWidth: 1.6,
    borderColor: ORANGE,
  });
  page.drawCircle({
    x: iconX,
    y: iconY,
    size: 4,
    color: ORANGE,
  });

  const spokes = [
    { x: 0, y: 14 },
    { x: 13, y: 8 },
    { x: 13, y: -8 },
    { x: -13, y: -8 },
    { x: -13, y: 8 },
  ];
  for (const spoke of spokes) {
    page.drawLine({
      start: { x: iconX, y: iconY },
      end: { x: iconX + spoke.x, y: iconY + spoke.y },
      thickness: 1.5,
      color: ORANGE,
    });
  }

  page.drawText('TYRE', {
    x: textX,
    y: y + 18,
    size: 15,
    font: fontBold,
    color: lightText ? WHITE : DARK,
  });
  page.drawText('RESCUE', {
    x: textX,
    y: y + 2,
    size: 15,
    font: fontBold,
    color: ORANGE,
  });
}

function bookingCustomerInvoiceToRenderData(invoice: BookingCustomerInvoice): InvoiceRenderData {
  const safe = createBookingCustomerInvoice(invoice, 'booking-customer-pdf');
  return {
    invoiceNumber: safe.invoiceNumber,
    issueDate: safe.invoiceDate,
    dueDate: safe.invoiceDate,
    status: safe.payment.status,
    companyName: safe.company.name,
    companyAddress: safe.company.address,
    companyPhone: safe.company.phone,
    companyEmail: safe.company.email,
    customerName: safe.customer.name,
    customerEmail: safe.customer.email,
    customerPhone: safe.customer.phone,
    customerAddress: safe.customer.address,
    totalAmount: safe.finalTotal,
    bookingReference: safe.bookingReference,
    vehicleRegistration: safe.vehicle.registration,
    vehicleMake: safe.vehicle.make,
    vehicleModel: safe.vehicle.model,
    paymentStatus: safe.payment.status,
    paymentMethod: safe.payment.method,
  };
}

function standaloneAdminInvoiceToRenderData(invoice: StandaloneAdminInvoice): InvoiceRenderData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    companyName: invoice.companyName,
    companyAddress: invoice.companyAddress,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    customerAddress: invoice.customerAddress,
    totalAmount: invoice.totalAmount,
    bookingReference: invoice.bookingReference,
    vehicleRegistration: invoice.vehicleRegistration,
    vehicleMake: invoice.vehicleMake,
    vehicleModel: invoice.vehicleModel,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod,
  };
}

export function buildBookingCustomerInvoicePdfText(data: BookingCustomerInvoice): string[] {
  const renderData = bookingCustomerInvoiceToRenderData(data);
  return collectInvoicePdfText(renderData);
}

export function buildStandaloneAdminInvoicePdfText(data: StandaloneAdminInvoice): string[] {
  const renderData = standaloneAdminInvoiceToRenderData(data);
  return collectInvoicePdfText(renderData);
}

export async function generateBookingCustomerInvoicePdf(data: BookingCustomerInvoice): Promise<Uint8Array> {
  return renderInvoicePdf(bookingCustomerInvoiceToRenderData(data));
}

export async function generateStandaloneAdminInvoicePdf(data: StandaloneAdminInvoice): Promise<Uint8Array> {
  return renderInvoicePdf(standaloneAdminInvoiceToRenderData(data));
}

/** @deprecated Use generateStandaloneAdminInvoicePdf or generateBookingCustomerInvoicePdf explicitly. */
export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  return generateStandaloneAdminInvoicePdf(data);
}

function collectInvoicePdfText(data: InvoiceRenderData): string[] {
  const paymentStatus = data.paymentStatus ?? data.status;
  const rows = [
    data.companyName.toUpperCase(),
    'INVOICE',
    data.companyAddress,
    data.companyPhone,
    data.companyEmail,
    'Invoice No:',
    data.invoiceNumber,
    'Invoice Date:',
    fmtDate(data.issueDate),
    'Payment Status:',
    paymentStatus.toUpperCase(),
    ...(data.paymentMethod ? ['Payment Method:', data.paymentMethod] : []),
    'BILL TO',
    data.customerName,
    data.customerAddress ?? '',
    data.customerEmail,
    data.customerPhone ?? '',
    'BOOKING DETAILS',
    'Booking Reference',
    data.bookingReference ?? 'Not available',
    'Payment Status',
    paymentStatus,
    ...(data.paymentMethod ? ['Payment Method', data.paymentMethod] : []),
    ...(data.vehicleRegistration || data.vehicleMake || data.vehicleModel
      ? ['Vehicle', [data.vehicleRegistration, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ')]
      : []),
    'TOTAL',
    fmtPrice(data.totalAmount),
    `${data.companyName} - ${data.companyPhone} - ${data.companyEmail}`,
  ];
  return rows.filter(Boolean);
}

async function renderInvoicePdf(data: InvoiceRenderData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica);

  let y = height - 50;
  const marginLeft = 50;
  const marginRight = width - 50;

  // ── Header bar ──
  page.drawRectangle({ x: 0, y: y - 10, width, height: 60, color: DARK });
  page.drawRectangle({ x: 0, y: y - 12, width, height: 2, color: ORANGE });

  drawTyreRescueLogo(page, { x: marginLeft, y: y + 3, fontBold, lightText: true });
  page.drawText('INVOICE', {
    x: marginRight - fontBold.widthOfTextAtSize('INVOICE', 22),
    y: y + 18, size: 22, font: fontBold, color: ORANGE,
  });

  y -= 40;

  // ── Company details (left) & Invoice meta (right) ──
  y -= 20;
  const companyLines = [
    data.companyAddress,
    data.companyPhone,
    data.companyEmail,
    // VAT number removed from system
  ];
  let cy = y;
  for (const line of companyLines) {
    page.drawText(sanitize(line), { x: marginLeft, y: cy, size: 9, font: fontNormal, color: GREY });
    cy -= 14;
  }

  const paymentStatus = data.paymentStatus ?? data.status;
  const metaRows = [
    ['Invoice No:', data.invoiceNumber],
    ['Invoice Date:', fmtDate(data.issueDate)],
    ['Payment Status:', paymentStatus.toUpperCase()],
    ...(data.paymentMethod ? [['Payment Method:', data.paymentMethod]] : []),
  ];
  let my = y;
  for (const [label, value] of metaRows) {
    const labelW = fontNormal.widthOfTextAtSize(label, 9);
    page.drawText(label, {
      x: marginRight - 160, y: my, size: 9, font: fontNormal, color: GREY,
    });
    page.drawText(sanitize(value), {
      x: marginRight - 160 + labelW + 8, y: my, size: 9,
      font: label === 'Payment Status:' ? fontBold : fontNormal,
      color: label === 'Payment Status:' ? ORANGE : DARK,
    });
    my -= 14;
  }

  y = Math.min(cy, my) - 20;

  // ── Bill To ──
  page.drawText('BILL TO', { x: marginLeft, y, size: 10, font: fontBold, color: ORANGE });
  y -= 16;
  page.drawText(sanitize(data.customerName), { x: marginLeft, y, size: 10, font: fontBold, color: DARK });
  y -= 14;
  if (data.customerAddress) {
    // Wrap address into lines
    const addrLines = data.customerAddress.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    for (const line of addrLines) {
      page.drawText(sanitize(line), { x: marginLeft, y, size: 9, font: fontNormal, color: GREY });
      y -= 13;
    }
  }
  page.drawText(sanitize(data.customerEmail), { x: marginLeft, y, size: 9, font: fontNormal, color: GREY });
  y -= 13;
  if (data.customerPhone) {
    page.drawText(sanitize(data.customerPhone), { x: marginLeft, y, size: 9, font: fontNormal, color: GREY });
    y -= 13;
  }

  y -= 20;

  // ── Booking and vehicle details ──
  const detailRows = [
    ['Booking Reference', data.bookingReference ?? 'Not available'],
    ['Payment Status', paymentStatus],
    ...(data.paymentMethod ? [['Payment Method', data.paymentMethod]] : []),
  ];
  if (data.vehicleRegistration || data.vehicleMake || data.vehicleModel) {
    detailRows.push(['Vehicle', [data.vehicleRegistration, data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ')]);
  }

  page.drawText('BOOKING DETAILS', { x: marginLeft, y, size: 10, font: fontBold, color: ORANGE });
  y -= 18;
  for (const [label, value] of detailRows) {
    page.drawText(sanitize(label), { x: marginLeft, y, size: 9, font: fontNormal, color: GREY });
    page.drawText(sanitize(value), { x: marginLeft + 130, y, size: 9, font: fontBold, color: DARK });
    y -= 15;
  }

  y -= 30;

  // ── Final agreed customer total only ──
  const totalBoxHeight = 110;
  page.drawRectangle({ x: marginLeft, y: y - totalBoxHeight, width: marginRight - marginLeft, height: totalBoxHeight, color: LIGHT_GREY });
  page.drawRectangle({ x: marginLeft, y: y - totalBoxHeight, width: 5, height: totalBoxHeight, color: ORANGE });
  page.drawText('TOTAL', { x: marginLeft + 28, y: y - 42, size: 18, font: fontBold, color: DARK });
  const amount = fmtPrice(data.totalAmount);
  const amountWidth = fontBold.widthOfTextAtSize(amount, 34);
  page.drawText(amount, { x: marginRight - amountWidth - 28, y: y - 54, size: 34, font: fontBold, color: DARK });

  // ── Footer ──
  page.drawRectangle({ x: 0, y: 0, width, height: 35, color: DARK });
  page.drawText(sanitize(`${data.companyName} - ${data.companyPhone} - ${data.companyEmail}`), {
    x: marginLeft, y: 12, size: 8, font: fontNormal, color: GREY,
  });

  return doc.save();
}
