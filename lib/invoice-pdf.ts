import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
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
  currency: string;
  bookingReference?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
}

interface InvoiceFonts {
  bold: PDFFont;
  normal: PDFFont;
}

const DEFAULT_CURRENCY = 'GBP';
const QUICK_ACCESS_QR_ASSET_PATH = path.join(
  process.cwd(),
  'public',
  'images',
  'invoices',
  'customer-quick-access-qr.jpeg',
);
const QUICK_ACCESS_SUBTITLE = 'Scan to make a new booking, track your booking or contact us.';

const COLORS = {
  page: rgb(248 / 255, 248 / 255, 247 / 255),
  ink: rgb(7 / 255, 10 / 255, 18 / 255),
  graphite: rgb(16 / 255, 20 / 255, 31 / 255),
  graphite2: rgb(29 / 255, 34 / 255, 46 / 255),
  softPanel: rgb(1, 1, 1),
  palePanel: rgb(252 / 255, 247 / 255, 242 / 255),
  border: rgb(224 / 255, 226 / 255, 232 / 255),
  muted: rgb(88 / 255, 93 / 255, 105 / 255),
  softMuted: rgb(156 / 255, 163 / 255, 175 / 255),
  white: rgb(1, 1, 1),
  orange: rgb(249 / 255, 115 / 255, 22 / 255),
  orangeDeep: rgb(194 / 255, 65 / 255, 12 / 255),
};

/** Strip characters outside the WinAnsi range that pdf-lib StandardFonts cannot encode. */
function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '');
}

function cleanText(value: string | number | null | undefined, fallback = 'Not provided'): string {
  const text = value == null ? '' : String(value);
  const cleaned = sanitize(text).replace(/\s+/g, ' ').trim();
  return cleaned || fallback;
}

function fmtPrice(n: number, currency = DEFAULT_CURRENCY): string {
  const value = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `£${value.toFixed(2)}`;
  }
}

function fmtDate(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return cleanText(d);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const cleaned = cleanText(text, '');
  if (font.widthOfTextAtSize(cleaned, size) <= maxWidth) return cleaned;
  const suffix = '...';
  let fitted = cleaned;
  while (fitted.length > 0 && font.widthOfTextAtSize(`${fitted}${suffix}`, size) > maxWidth) {
    fitted = fitted.slice(0, -1).trimEnd();
  }
  return fitted ? `${fitted}${suffix}` : suffix;
}

function fitFontSize(text: string, font: PDFFont, preferredSize: number, minSize: number, maxWidth: number): number {
  let size = preferredSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return Math.max(size, minSize);
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    maxLines?: number;
    lineHeight: number;
    size: number;
    font: PDFFont;
    color: ReturnType<typeof rgb>;
  },
): number {
  const words = cleanText(text, '').split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (options.font.widthOfTextAtSize(next, options.size) <= options.maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  const maxLines = options.maxLines ?? lines.length;
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    visible[visible.length - 1] = fitText(visible[visible.length - 1], options.font, options.size, options.maxWidth);
  }

  let y = options.y;
  for (const line of visible) {
    page.drawText(line, {
      x: options.x,
      y,
      size: options.size,
      font: options.font,
      color: options.color,
    });
    y -= options.lineHeight;
  }
  return y;
}

function drawPanel(
  page: PDFPage,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: ReturnType<typeof rgb>;
    border?: ReturnType<typeof rgb>;
    accent?: boolean;
  },
): void {
  page.drawRectangle({
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    color: options.fill ?? COLORS.softPanel,
  });
  if (options.border) {
    page.drawRectangle({
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      borderColor: options.border,
      borderWidth: 0.8,
      opacity: 0.99,
    });
  }
  if (options.accent) {
    page.drawRectangle({
      x: options.x,
      y: options.y,
      width: 4,
      height: options.height,
      color: COLORS.orange,
    });
  }
}

function drawSectionHeading(
  page: PDFPage,
  title: string,
  x: number,
  y: number,
  fonts: InvoiceFonts,
  light = false,
): void {
  page.drawText(title, {
    x,
    y,
    size: 12,
    font: fonts.bold,
    color: light ? COLORS.white : COLORS.ink,
  });
  page.drawRectangle({
    x,
    y: y - 6,
    width: 34,
    height: 2,
    color: COLORS.orange,
  });
}

function drawWheelMark(page: PDFPage, x: number, y: number, radius: number, opacity = 1): void {
  page.drawCircle({ x, y, size: radius, borderWidth: 4, borderColor: COLORS.orange, opacity });
  page.drawCircle({ x, y, size: radius * 0.66, borderWidth: 1.6, borderColor: COLORS.orange, opacity: opacity * 0.8 });
  page.drawCircle({ x, y, size: radius * 0.18, color: COLORS.orange, opacity });
  const spokes = [
    { x: 0, y: radius * 0.66 },
    { x: radius * 0.57, y: radius * 0.33 },
    { x: radius * 0.57, y: -radius * 0.33 },
    { x: 0, y: -radius * 0.66 },
    { x: -radius * 0.57, y: -radius * 0.33 },
    { x: -radius * 0.57, y: radius * 0.33 },
  ];
  for (const spoke of spokes) {
    page.drawLine({
      start: { x, y },
      end: { x: x + spoke.x, y: y + spoke.y },
      thickness: 1.4,
      color: COLORS.orange,
      opacity: opacity * 0.82,
    });
  }
}

function drawBranding(
  page: PDFPage,
  data: InvoiceRenderData,
  fonts: InvoiceFonts,
  x: number,
  y: number,
): void {
  drawWheelMark(page, x + 24, y + 21, 23, 1);
  const name = cleanText(data.companyName, 'Tyre Rescue').toUpperCase();
  const parts = name.split(/\s+/);
  const first = parts[0] ?? name;
  const rest = parts.slice(1).join(' ');

  page.drawText(fitText(first, fonts.bold, 20, 155), {
    x: x + 58,
    y: y + 26,
    size: 20,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText(fitText(rest || 'RESCUE', fonts.bold, 20, 155), {
    x: x + 58,
    y: y + 5,
    size: 20,
    font: fonts.bold,
    color: COLORS.orange,
  });
}

function drawHeroArtwork(page: PDFPage): void {
  const wheelX = 530;
  const wheelY = 735;
  const outerRadius = 49;

  page.drawCircle({ x: wheelX, y: wheelY, size: outerRadius, borderWidth: 8, borderColor: COLORS.graphite2, opacity: 0.8 });
  page.drawCircle({ x: wheelX, y: wheelY, size: 36, borderWidth: 2.2, borderColor: COLORS.softMuted, opacity: 0.22 });
  page.drawCircle({ x: wheelX, y: wheelY, size: 23, borderWidth: 1.1, borderColor: COLORS.orange, opacity: 0.66 });
  page.drawCircle({ x: wheelX, y: wheelY, size: 7, color: COLORS.orange, opacity: 0.78 });

  for (const angle of [0, 40, 80, 120, 160, 200, 240, 280, 320]) {
    const radians = (angle * Math.PI) / 180;
    page.drawLine({
      start: { x: wheelX, y: wheelY },
      end: { x: wheelX + Math.cos(radians) * 35, y: wheelY + Math.sin(radians) * 35 },
      thickness: angle % 80 === 0 ? 1.6 : 0.9,
      color: angle % 80 === 0 ? COLORS.orange : COLORS.softMuted,
      opacity: angle % 80 === 0 ? 0.55 : 0.16,
    });
  }

  page.drawLine({
    start: { x: 474, y: 662 },
    end: { x: 584, y: 796 },
    thickness: 10,
    color: COLORS.orangeDeep,
    opacity: 0.2,
  });
  page.drawLine({
    start: { x: 490, y: 660 },
    end: { x: 588, y: 785 },
    thickness: 2,
    color: COLORS.orange,
    opacity: 0.7,
  });

  for (let i = 0; i < 9; i += 1) {
    const x = 470 + i * 10;
    page.drawRectangle({
      x,
      y: 675 + (i % 3) * 6,
      width: 7,
      height: 2,
      color: COLORS.orange,
      opacity: 0.16 + i * 0.025,
    });
  }
}

function drawPremiumHeader(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, width: number, height: number): void {
  const headerHeight = 190;
  const y = height - headerHeight;
  page.drawRectangle({ x: 0, y, width, height: headerHeight, color: COLORS.ink });
  page.drawRectangle({ x: 0, y, width, height: headerHeight, color: COLORS.graphite, opacity: 0.34 });
  page.drawRectangle({ x: 0, y, width: 240, height: headerHeight, color: COLORS.orangeDeep, opacity: 0.12 });
  page.drawRectangle({ x: 0, y, width, height: 5, color: COLORS.orange });
  drawHeroArtwork(page);
  drawBranding(page, data, fonts, 42, height - 84);

  page.drawText('INVOICE', {
    x: 322,
    y: height - 78,
    size: 33,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText('Premium mobile tyre service', {
    x: 324,
    y: height - 100,
    size: 9.5,
    font: fonts.bold,
    color: COLORS.orange,
  });

  page.drawText('Fast response. Clear payment. Final total only.', {
    x: 42,
    y: y + 30,
    size: 10,
    font: fonts.normal,
    color: COLORS.white,
    opacity: 0.92,
  });
}

function drawCompanyDetails(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number): void {
  drawPanel(page, { x, y, width: 236, height: 104, fill: COLORS.ink, border: COLORS.graphite2, accent: true });
  drawSectionHeading(page, 'COMPANY DETAILS', x + 18, y + 76, fonts, true);
  let lineY = y + 52;
  for (const line of [data.companyAddress, data.companyPhone, data.companyEmail]) {
    page.drawCircle({ x: x + 21, y: lineY + 4, size: 2.4, color: COLORS.orange });
    page.drawText(fitText(cleanText(line), fonts.normal, 9, 185), {
      x: x + 34,
      y: lineY,
      size: 9,
      font: fonts.normal,
      color: COLORS.white,
      opacity: 0.92,
    });
    lineY -= 16;
  }
}

function drawInvoiceInfo(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number): void {
  drawPanel(page, { x, y, width: 244, height: 104, fill: COLORS.softPanel, border: COLORS.border });
  const paymentStatus = cleanText(data.paymentStatus ?? data.status);
  const rows = [
    ['Invoice No', data.invoiceNumber],
    ['Invoice Date', fmtDate(data.issueDate)],
    ['Payment Status', paymentStatus],
    ...(data.paymentMethod ? [['Payment Method', data.paymentMethod]] : []),
  ];

  let rowY = y + 75;
  for (const [label, value] of rows) {
    page.drawText(label, { x: x + 18, y: rowY, size: 8.5, font: fonts.normal, color: COLORS.muted });
    page.drawText(fitText(cleanText(value), fonts.bold, 9, 102), {
      x: x + 122,
      y: rowY,
      size: 9,
      font: fonts.bold,
      color: label === 'Payment Status' ? COLORS.orangeDeep : COLORS.ink,
    });
    page.drawLine({
      start: { x: x + 18, y: rowY - 8 },
      end: { x: x + 226, y: rowY - 8 },
      thickness: 0.6,
      color: COLORS.border,
      opacity: 0.7,
    });
    rowY -= 22;
  }
}

function drawBillTo(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number): void {
  drawPanel(page, { x, y, width: 245, height: 132, fill: COLORS.softPanel, border: COLORS.border });
  drawSectionHeading(page, 'BILL TO', x + 18, y + 104, fonts);
  let textY = y + 79;
  page.drawText(fitText(cleanText(data.customerName), fonts.bold, 12, 200), {
    x: x + 18,
    y: textY,
    size: 12,
    font: fonts.bold,
    color: COLORS.ink,
  });
  textY -= 16;
  if (data.customerAddress) {
    textY = drawWrappedText(page, data.customerAddress, {
      x: x + 18,
      y: textY,
      maxWidth: 190,
      maxLines: 3,
      lineHeight: 11,
      size: 8.4,
      font: fonts.normal,
      color: COLORS.muted,
    });
  }
  page.drawText(fitText(cleanText(data.customerEmail), fonts.normal, 8.5, 200), {
    x: x + 18,
    y: textY,
    size: 8.5,
    font: fonts.normal,
    color: COLORS.muted,
  });
  textY -= 12;
  if (data.customerPhone) {
    page.drawText(fitText(cleanText(data.customerPhone), fonts.normal, 8.5, 200), {
      x: x + 18,
      y: textY,
      size: 8.5,
      font: fonts.normal,
      color: COLORS.muted,
    });
  }
}

function vehicleText(data: InvoiceRenderData): string | null {
  const vehicle = [data.vehicleRegistration, data.vehicleMake, data.vehicleModel]
    .map((item) => cleanText(item, ''))
    .filter(Boolean)
    .join(' ');
  return vehicle || null;
}

function drawBookingDetails(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number): void {
  drawPanel(page, { x, y, width: 250, height: 132, fill: COLORS.palePanel, border: COLORS.border });
  drawSectionHeading(page, 'BOOKING DETAILS', x + 18, y + 104, fonts);
  const rows = [
    ['Booking Reference', data.bookingReference ?? 'Not available'],
    ['Payment Status', data.paymentStatus ?? data.status],
    ...(data.paymentMethod ? [['Payment Method', data.paymentMethod]] : []),
    ...(vehicleText(data) ? [['Vehicle', vehicleText(data)!]] : []),
  ];

  let rowY = y + 78;
  for (const [label, value] of rows.slice(0, 4)) {
    page.drawText(label, { x: x + 18, y: rowY, size: 8.5, font: fonts.normal, color: COLORS.muted });
    page.drawText(fitText(cleanText(value), fonts.bold, 8.8, 112), {
      x: x + 122,
      y: rowY,
      size: 8.8,
      font: fonts.bold,
      color: COLORS.ink,
    });
    rowY -= 20;
  }
}

function drawTrustStrip(page: PDFPage, fonts: InvoiceFonts, x: number, y: number, width: number): void {
  drawPanel(page, { x, y, width, height: 50, fill: COLORS.ink, border: COLORS.graphite2 });
  const features = [
    ['24/7 RESPONSE', 'Ready when you need us'],
    ['MOBILE SERVICE', 'Home, work or roadside'],
    ['SECURE PAYMENT', 'Clear final payable total'],
    ['CUSTOMER FOCUSED', 'Support after the job'],
  ];
  const columnWidth = width / features.length;
  features.forEach(([title, body], index) => {
    const left = x + index * columnWidth;
    if (index > 0) {
      page.drawLine({
        start: { x: left, y: y + 10 },
        end: { x: left, y: y + 40 },
        thickness: 0.7,
        color: COLORS.softMuted,
        opacity: 0.35,
      });
    }
    page.drawCircle({ x: left + 22, y: y + 29, size: 8, borderColor: COLORS.orange, borderWidth: 1.4 });
    page.drawText(title, { x: left + 38, y: y + 31, size: 7.8, font: fonts.bold, color: COLORS.white });
    page.drawText(fitText(body, fonts.normal, 7, columnWidth - 46), {
      x: left + 38,
      y: y + 18,
      size: 7,
      font: fonts.normal,
      color: COLORS.softMuted,
    });
  });
}

function drawTotalDue(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number, width: number): void {
  const orangeWidth = 168;
  const orangeX = x + width - orangeWidth;
  const amountX = x + 170;
  const amountMaxWidth = orangeX - amountX - 18;
  const amount = fmtPrice(data.totalAmount, data.currency);
  const amountSize = fitFontSize(amount, fonts.bold, 36, 25, amountMaxWidth);

  drawPanel(page, { x, y, width, height: 118, fill: COLORS.ink, border: COLORS.graphite2 });
  page.drawRectangle({ x: orangeX, y, width: orangeWidth, height: 118, color: COLORS.orange });
  page.drawLine({
    start: { x: orangeX - 8, y },
    end: { x: orangeX + 36, y: y + 118 },
    thickness: 4,
    color: COLORS.orangeDeep,
    opacity: 0.7,
  });
  drawWheelMark(page, x + 74, y + 59, 37, 0.7);
  page.drawText('TOTAL DUE', {
    x: amountX,
    y: y + 77,
    size: 17,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawRectangle({ x: amountX, y: y + 69, width: 42, height: 3, color: COLORS.orange });
  page.drawText(amount, {
    x: amountX,
    y: y + 30,
    size: amountSize,
    font: fonts.bold,
    color: COLORS.orange,
  });
  page.drawText(`All amounts are in ${data.currency.toUpperCase()}`, {
    x: amountX,
    y: y + 16,
    size: 8,
    font: fonts.normal,
    color: COLORS.softMuted,
  });
  page.drawText('FINAL AGREED', {
    x: orangeX + 28,
    y: y + 70,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText('CUSTOMER TOTAL', {
    x: orangeX + 28,
    y: y + 58,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText('Stored payable amount only.', {
    x: orangeX + 28,
    y: y + 39,
    size: 7.4,
    font: fonts.normal,
    color: COLORS.white,
    opacity: 0.9,
  });
  page.drawText('No pricing breakdown shown.', {
    x: orangeX + 28,
    y: y + 28,
    size: 7.4,
    font: fonts.normal,
    color: COLORS.white,
    opacity: 0.9,
  });
}

function drawThankYou(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, x: number, y: number, width: number): void {
  drawPanel(page, { x, y, width, height: 44, fill: COLORS.softPanel, border: COLORS.border });
  page.drawText('THANK YOU', { x: x + 18, y: y + 25, size: 13, font: fonts.bold, color: COLORS.orangeDeep });
  page.drawText('We appreciate your trust in our mobile tyre service.', {
    x: x + 18,
    y: y + 11,
    size: 8.5,
    font: fonts.normal,
    color: COLORS.muted,
  });
  page.drawText(fitText(cleanText(data.companyName), fonts.bold, 11, 165), {
    x: x + width - 190,
    y: y + 20,
    size: 11,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawText('Customer safety comes first.', {
    x: x + width - 190,
    y: y + 8,
    size: 8,
    font: fonts.normal,
    color: COLORS.muted,
  });
}

function drawSmartphoneIcon(page: PDFPage, x: number, y: number): void {
  page.drawRectangle({
    x,
    y,
    width: 22,
    height: 34,
    color: COLORS.graphite,
    borderColor: COLORS.orange,
    borderWidth: 1.2,
    opacity: 0.98,
  });
  page.drawRectangle({ x: x + 5, y: y + 27, width: 12, height: 1.2, color: COLORS.softMuted, opacity: 0.72 });
  page.drawCircle({ x: x + 11, y: y + 5, size: 1.8, color: COLORS.orange, opacity: 0.95 });
}

function drawQuickAccess(
  page: PDFPage,
  fonts: InvoiceFonts,
  qrImage: PDFImage,
  x: number,
  y: number,
  width: number,
): void {
  const height = 64;
  const qrBoxSize = 56;
  const qrImageSize = 50;
  const qrBoxX = x + width - qrBoxSize - 18;
  const qrBoxY = y + (height - qrBoxSize) / 2;
  const copyX = x + 66;
  const copyMaxWidth = qrBoxX - copyX - 18;

  drawPanel(page, { x, y, width, height, fill: COLORS.softPanel, border: COLORS.border, accent: true });
  page.drawRectangle({
    x: x + 4,
    y,
    width: width - 4,
    height,
    color: COLORS.palePanel,
    opacity: 0.42,
  });
  page.drawCircle({ x: x + 35, y: y + 32, size: 23, color: COLORS.orange, opacity: 0.1 });
  drawSmartphoneIcon(page, x + 24, y + 15);

  page.drawText('QUICK ACCESS', {
    x: copyX,
    y: y + 40,
    size: 13,
    font: fonts.bold,
    color: COLORS.ink,
  });
  page.drawRectangle({ x: copyX, y: y + 34, width: 34, height: 2, color: COLORS.orange });
  drawWrappedText(page, QUICK_ACCESS_SUBTITLE, {
    x: copyX,
    y: y + 22,
    maxWidth: copyMaxWidth,
    maxLines: 2,
    lineHeight: 10,
    size: 8,
    font: fonts.normal,
    color: COLORS.muted,
  });

  page.drawRectangle({
    x: qrBoxX,
    y: qrBoxY,
    width: qrBoxSize,
    height: qrBoxSize,
    color: COLORS.white,
    borderColor: COLORS.border,
    borderWidth: 0.8,
  });
  page.drawImage(qrImage, {
    x: qrBoxX + (qrBoxSize - qrImageSize) / 2,
    y: qrBoxY + (qrBoxSize - qrImageSize) / 2,
    width: qrImageSize,
    height: qrImageSize,
  });
}

function drawFooter(page: PDFPage, data: InvoiceRenderData, fonts: InvoiceFonts, width: number): void {
  const footerHeight = 58;
  page.drawRectangle({ x: 0, y: 0, width, height: footerHeight, color: COLORS.ink });
  page.drawRectangle({ x: 0, y: footerHeight - 2, width, height: 2, color: COLORS.orange });
  const blocks = [
    ['NEED HELP?', data.companyPhone],
    ['EMAIL US', data.companyEmail],
    ['COMPANY', data.companyName],
  ];
  blocks.forEach(([label, value], index) => {
    const left = 44 + index * 176;
    if (index > 0) {
      page.drawLine({
        start: { x: left - 20, y: 14 },
        end: { x: left - 20, y: 45 },
        thickness: 0.7,
        color: COLORS.softMuted,
        opacity: 0.45,
      });
    }
    page.drawText(label, { x: left, y: 36, size: 7.6, font: fonts.bold, color: COLORS.white });
    page.drawText(fitText(cleanText(value), fonts.normal, 9, 132), {
      x: left,
      y: 23,
      size: 8.4,
      font: fonts.normal,
      color: COLORS.orange,
    });
  });
  page.drawText(fitText(`${data.companyName} | ${data.companyAddress}`, fonts.normal, 7, width - 80), {
    x: 44,
    y: 7,
    size: 7,
    font: fonts.normal,
    color: COLORS.softMuted,
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
    currency: DEFAULT_CURRENCY,
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
    currency: DEFAULT_CURRENCY,
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

async function embedQuickAccessQrImage(doc: PDFDocument): Promise<PDFImage> {
  const bytes = await readFile(QUICK_ACCESS_QR_ASSET_PATH);
  return doc.embedJpg(bytes);
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
    'COMPANY DETAILS',
    data.companyAddress,
    data.companyPhone,
    data.companyEmail,
    'INVOICE INFORMATION',
    'Invoice No',
    data.invoiceNumber,
    'Invoice Date',
    fmtDate(data.issueDate),
    'Payment Status',
    paymentStatus,
    ...(data.paymentMethod ? ['Payment Method', data.paymentMethod] : []),
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
    ...(vehicleText(data) ? ['Vehicle', vehicleText(data)!] : []),
    '24/7 RESPONSE',
    'MOBILE SERVICE',
    'SECURE PAYMENT',
    'CUSTOMER FOCUSED',
    'TOTAL DUE',
    fmtPrice(data.totalAmount, data.currency),
    `All amounts are in ${data.currency.toUpperCase()}`,
    'THANK YOU',
    'We appreciate your trust in our mobile tyre service.',
    'QUICK ACCESS',
    QUICK_ACCESS_SUBTITLE,
    `${data.companyName} | ${data.companyAddress} | ${data.companyPhone} | ${data.companyEmail}`,
  ];
  return rows.filter(Boolean);
}

async function renderInvoicePdf(data: InvoiceRenderData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fonts: InvoiceFonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    normal: await doc.embedFont(StandardFonts.Helvetica),
  };
  const quickAccessQr = await embedQuickAccessQrImage(doc);

  page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.page });

  drawPremiumHeader(page, data, fonts, width, height);
  drawCompanyDetails(page, data, fonts, 40, 526);
  drawInvoiceInfo(page, data, fonts, 312, 526);
  drawBillTo(page, data, fonts, 40, 366);
  drawBookingDetails(page, data, fonts, 305, 366);
  drawTrustStrip(page, fonts, 40, 314, width - 80);
  drawTotalDue(page, data, fonts, 40, 186, width - 80);
  drawThankYou(page, data, fonts, 40, 138, width - 80);
  drawQuickAccess(page, fonts, quickAccessQr, 40, 66, width - 80);
  drawFooter(page, data, fonts, width);

  return doc.save();
}
