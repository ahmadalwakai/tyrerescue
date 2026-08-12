import { readFile } from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { WHEEL_NUT_CONSENT_TITLE } from '@/lib/wheel-nut-consent';

const COLORS = {
  ink: rgb(0.09, 0.09, 0.1),
  muted: rgb(0.37, 0.37, 0.42),
  border: rgb(0.86, 0.86, 0.88),
  soft: rgb(0.97, 0.96, 0.94),
  warning: rgb(0.99, 0.45, 0.08),
  dangerBg: rgb(1, 0.94, 0.88),
  white: rgb(1, 1, 1),
};

export interface WheelNutConsentPdfData {
  bookingRef: string;
  customerName: string;
  customerEmail: string | null;
  vehicleReg: string | null;
  driverName: string | null;
  driverId: string | null;
  signedAt: Date;
  gpsLat: string | null;
  gpsLng: string | null;
  gpsAccuracy: number | null;
  deviceId: string | null;
  deviceLabel: string | null;
  declarationText: string;
  signaturePng: Uint8Array;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of cleanText(text).split(/\n+/)) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawTextBlock(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color = COLORS.ink,
): number {
  for (const line of wrapText(text, font, size, maxWidth)) {
    if (line) {
      page.drawText(line, { x, y, size, font, color });
    }
    y -= lineHeight;
  }
  return y;
}

function formatDate(value: Date): string {
  return value.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function drawRow(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  label: string,
  value: string | null,
  x: number,
  y: number,
  width: number,
): void {
  page.drawText(label, { x, y, size: 8.5, font, color: COLORS.muted });
  page.drawText(cleanText(value || 'Not available').slice(0, 80), {
    x: x + 140,
    y,
    size: 9.5,
    font: bold,
    color: COLORS.ink,
    maxWidth: width - 150,
  });
}

async function drawLogo(page: PDFPage, pdfDoc: PDFDocument, bold: PDFFont): Promise<void> {
  try {
    const logoBytes = await readFile(path.join(process.cwd(), 'public', 'icon-192x192.png'));
    const logo = await pdfDoc.embedPng(logoBytes);
    page.drawImage(logo, { x: 48, y: 756, width: 44, height: 44 });
  } catch {
    page.drawCircle({ x: 70, y: 778, size: 22, color: COLORS.warning });
    page.drawCircle({ x: 70, y: 778, size: 15, color: COLORS.ink });
  }

  page.drawText('TYRE RESCUE', { x: 104, y: 782, size: 20, font: bold, color: COLORS.ink });
  page.drawText('Emergency Mobile Tyre Fitting', { x: 106, y: 766, size: 8.5, font: bold, color: COLORS.warning });
}

export async function generateWheelNutConsentPdf(data: WheelNutConsentPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  await drawLogo(page, pdfDoc, bold);

  page.drawText(WHEEL_NUT_CONSENT_TITLE, {
    x: 48,
    y: 720,
    size: 20,
    font: bold,
    color: COLORS.ink,
  });
  page.drawText(`Job ${cleanText(data.bookingRef)}`, {
    x: 48,
    y: 699,
    size: 10,
    font: bold,
    color: COLORS.warning,
  });

  page.drawRectangle({
    x: 48,
    y: 590,
    width: 499,
    height: 86,
    color: COLORS.dangerBg,
    borderColor: COLORS.warning,
    borderWidth: 1,
  });
  page.drawText('Important Notice', { x: 64, y: 651, size: 12, font: bold, color: COLORS.ink });
  drawTextBlock(
    page,
    'During removal of the locking wheel nut, specialist extraction tools may be required. Although every care will be taken, the locking wheel nut may be destroyed, the alloy wheel may suffer cosmetic or physical damage, and replacement locking nuts may be required.',
    64,
    633,
    465,
    font,
    9,
    12,
    COLORS.ink,
  );

  page.drawText('Customer Declaration', { x: 48, y: 558, size: 13, font: bold, color: COLORS.ink });
  let y = drawTextBlock(page, data.declarationText, 48, 538, 499, font, 10, 14, COLORS.ink);

  y -= 12;
  page.drawRectangle({ x: 48, y: y - 100, width: 499, height: 104, color: COLORS.soft, borderColor: COLORS.border, borderWidth: 1 });
  page.drawText('Customer Details', { x: 64, y: y - 18, size: 11, font: bold, color: COLORS.ink });

  const rowY = y - 40;
  drawRow(page, font, bold, 'Customer Name', data.customerName, 64, rowY, 465);
  drawRow(page, font, bold, 'Vehicle Registration', data.vehicleReg, 64, rowY - 18, 465);
  drawRow(page, font, bold, 'Date & Time', formatDate(data.signedAt), 64, rowY - 36, 465);
  drawRow(page, font, bold, 'Driver Name', data.driverName, 64, rowY - 54, 465);
  drawRow(page, font, bold, 'Job Number', data.bookingRef, 64, rowY - 72, 465);

  y -= 124;
  page.drawRectangle({ x: 48, y: y - 50, width: 499, height: 54, color: COLORS.white, borderColor: COLORS.border, borderWidth: 1 });
  drawRow(
    page,
    font,
    bold,
    'GPS Location',
    data.gpsLat && data.gpsLng
      ? `${data.gpsLat}, ${data.gpsLng}${data.gpsAccuracy != null ? ` (+/- ${Math.round(data.gpsAccuracy)}m)` : ''}`
      : null,
    64,
    y - 18,
    465,
  );
  drawRow(page, font, bold, 'Device ID', data.deviceId || data.deviceLabel, 64, y - 36, 465);

  y -= 88;
  page.drawText('Signature', { x: 48, y, size: 13, font: bold, color: COLORS.ink });
  page.drawRectangle({ x: 48, y: y - 116, width: 260, height: 96, color: COLORS.white, borderColor: COLORS.border, borderWidth: 1 });

  const signature = await pdfDoc.embedPng(data.signaturePng);
  const scale = Math.min(230 / signature.width, 72 / signature.height);
  page.drawImage(signature, {
    x: 63,
    y: y - 105,
    width: signature.width * scale,
    height: signature.height * scale,
  });

  page.drawText('I have read and understood this declaration.', {
    x: 330,
    y: y - 40,
    size: 10.5,
    font: bold,
    color: COLORS.ink,
  });
  page.drawText(`Signed electronically on ${formatDate(data.signedAt)}`, {
    x: 330,
    y: y - 58,
    size: 8.5,
    font,
    color: COLORS.muted,
  });

  page.drawText('This document was generated automatically by Tyre Rescue at the point of customer consent.', {
    x: 48,
    y: 36,
    size: 7.5,
    font,
    color: COLORS.muted,
  });

  return pdfDoc.save();
}
