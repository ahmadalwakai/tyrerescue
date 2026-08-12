import { Buffer } from 'node:buffer';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import type {
  StockDailyAdditionItem,
  StockDailyBuyReportItem,
  StockDailyMissingItem,
} from '@/lib/email/templates';

export interface StockDailyBuyReportPdfData {
  reportDateLabel: string;
  generatedAtLabel: string;
  items: StockDailyBuyReportItem[];
  additions: StockDailyAdditionItem[];
  missingRequests: StockDailyMissingItem[];
  totals: {
    buyQuantity: number;
    reducedQuantity: number;
    soldQuantity: number;
    addedQuantity: number;
    missingRequests: number;
  };
}

interface PdfFonts {
  bold: PDFFont;
  normal: PDFFont;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  page: rgb(247 / 255, 248 / 255, 250 / 255),
  ink: rgb(10 / 255, 15 / 255, 25 / 255),
  muted: rgb(87 / 255, 99 / 255, 120 / 255),
  border: rgb(214 / 255, 221 / 255, 232 / 255),
  panel: rgb(1, 1, 1),
  soft: rgb(242 / 255, 246 / 255, 251 / 255),
  orange: rgb(249 / 255, 115 / 255, 22 / 255),
  green: rgb(22 / 255, 163 / 255, 74 / 255),
};

function sanitize(value: string | number | null | undefined, fallback = ''): string {
  const text = value == null ? '' : String(value);
  return text.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, '').replace(/\s+/g, ' ').trim() || fallback;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitize(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  const suffix = '...';
  let fitted = clean;
  while (fitted.length > 0 && font.widthOfTextAtSize(`${fitted}${suffix}`, size) > maxWidth) {
    fitted = fitted.slice(0, -1).trimEnd();
  }
  return fitted ? `${fitted}${suffix}` : suffix;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; maxWidth?: number },
) {
  const value = options.maxWidth ? fitText(text, options.font, options.size, options.maxWidth) : sanitize(text);
  page.drawText(value, {
    x,
    y,
    size: options.size,
    font: options.font,
    color: options.color ?? COLORS.ink,
  });
}

function drawPageBackground(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COLORS.page });
}

function drawHeader(page: PDFPage, fonts: PdfFonts, data: StockDailyBuyReportPdfData) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 104,
    width: PAGE_WIDTH,
    height: 104,
    color: COLORS.ink,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 107,
    width: PAGE_WIDTH,
    height: 3,
    color: COLORS.orange,
  });
  drawText(page, 'TYRE RESCUE', MARGIN, PAGE_HEIGHT - 42, {
    font: fonts.bold,
    size: 11,
    color: COLORS.orange,
  });
  drawText(page, 'Daily Buy List by Tyre Size', MARGIN, PAGE_HEIGHT - 70, {
    font: fonts.bold,
    size: 22,
    color: rgb(1, 1, 1),
  });
  drawText(page, data.reportDateLabel, MARGIN, PAGE_HEIGHT - 90, {
    font: fonts.normal,
    size: 10,
    color: rgb(214 / 255, 221 / 255, 232 / 255),
  });
  drawText(page, `Generated ${data.generatedAtLabel}`, PAGE_WIDTH - MARGIN - 178, PAGE_HEIGHT - 90, {
    font: fonts.normal,
    size: 9,
    color: rgb(214 / 255, 221 / 255, 232 / 255),
    maxWidth: 178,
  });
}

function drawSummary(page: PDFPage, fonts: PdfFonts, data: StockDailyBuyReportPdfData, y: number): number {
  const cards = [
    ['TO BUY', data.totals.buyQuantity, COLORS.orange],
    ['REDUCED', data.totals.reducedQuantity, COLORS.muted],
    ['ADDED', data.totals.addedQuantity, COLORS.green],
    ['MISSING REQUESTS', data.totals.missingRequests, COLORS.muted],
  ] as const;
  const gap = 10;
  const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;

  cards.forEach(([label, value, accent], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    page.drawRectangle({
      x,
      y: y - 54,
      width: cardWidth,
      height: 54,
      color: COLORS.panel,
      borderColor: COLORS.border,
      borderWidth: 0.8,
    });
    page.drawRectangle({ x, y: y - 54, width: 4, height: 54, color: accent });
    drawText(page, String(value), x + 14, y - 26, { font: fonts.bold, size: 19, color: COLORS.ink });
    drawText(page, label, x + 14, y - 43, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: cardWidth - 24 });
  });

  return y - 76;
}

function ensureSpace(
  doc: PDFDocument,
  page: PDFPage,
  fonts: PdfFonts,
  data: StockDailyBuyReportPdfData,
  y: number,
  required: number,
): { page: PDFPage; y: number } {
  if (y - required >= MARGIN) return { page, y };
  const nextPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageBackground(nextPage);
  drawHeader(nextPage, fonts, data);
  return { page: nextPage, y: PAGE_HEIGHT - 132 };
}

function groupBySize(items: StockDailyBuyReportItem[]): Array<{ size: string; totalBuy: number; rows: StockDailyBuyReportItem[] }> {
  const groups = new Map<string, StockDailyBuyReportItem[]>();
  for (const item of [...items].sort((a, b) => a.sizeDisplay.localeCompare(b.sizeDisplay, 'en-GB'))) {
    const key = sanitize(item.sizeDisplay, 'Unknown size');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].map(([size, rows]) => ({
    size,
    rows,
    totalBuy: rows.reduce((sum, row) => sum + row.buyQuantity, 0),
  }));
}

function drawTableHeader(page: PDFPage, fonts: PdfFonts, y: number): number {
  page.drawRectangle({
    x: MARGIN,
    y: y - 24,
    width: CONTENT_WIDTH,
    height: 24,
    color: COLORS.soft,
    borderColor: COLORS.border,
    borderWidth: 0.7,
  });
  drawText(page, 'CITY', MARGIN + 10, y - 16, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: 72 });
  drawText(page, 'TYRE', MARGIN + 88, y - 16, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: 160 });
  drawText(page, 'BUY', MARGIN + 272, y - 16, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: 34 });
  drawText(page, 'REDUCED BY', MARGIN + 318, y - 16, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: 128 });
  drawText(page, 'CURRENT', MARGIN + 462, y - 16, { font: fonts.bold, size: 7.5, color: COLORS.muted, maxWidth: 52 });
  return y - 24;
}

function drawBuyList(
  doc: PDFDocument,
  initialPage: PDFPage,
  fonts: PdfFonts,
  data: StockDailyBuyReportPdfData,
  startY: number,
): { page: PDFPage; y: number } {
  let page = initialPage;
  let y = startY;

  drawText(page, 'Tyres to buy grouped by size', MARGIN, y, { font: fonts.bold, size: 14 });
  y -= 22;

  if (data.items.length === 0) {
    page.drawRectangle({
      x: MARGIN,
      y: y - 42,
      width: CONTENT_WIDTH,
      height: 42,
      color: COLORS.panel,
      borderColor: COLORS.border,
      borderWidth: 0.8,
    });
    drawText(page, 'No tyres were sold or reduced during this reporting day.', MARGIN + 12, y - 26, {
      font: fonts.normal,
      size: 10,
      color: COLORS.muted,
      maxWidth: CONTENT_WIDTH - 24,
    });
    return { page, y: y - 62 };
  }

  y = drawTableHeader(page, fonts, y);
  for (const group of groupBySize(data.items)) {
    ({ page, y } = ensureSpace(doc, page, fonts, data, y, 78));
    page.drawRectangle({
      x: MARGIN,
      y: y - 28,
      width: CONTENT_WIDTH,
      height: 28,
      color: rgb(255 / 255, 247 / 255, 237 / 255),
      borderColor: rgb(253 / 255, 186 / 255, 116 / 255),
      borderWidth: 0.7,
    });
    drawText(page, group.size, MARGIN + 10, y - 18, { font: fonts.bold, size: 11, color: COLORS.ink, maxWidth: 210 });
    drawText(page, `BUY ${group.totalBuy}`, PAGE_WIDTH - MARGIN - 70, y - 18, {
      font: fonts.bold,
      size: 11,
      color: COLORS.orange,
      maxWidth: 66,
    });
    y -= 28;

    for (const item of group.rows) {
      ({ page, y } = ensureSpace(doc, page, fonts, data, y, 44));
      page.drawRectangle({
        x: MARGIN,
        y: y - 38,
        width: CONTENT_WIDTH,
        height: 38,
        color: COLORS.panel,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });
      drawText(page, item.cityName, MARGIN + 10, y - 16, { font: fonts.bold, size: 9, maxWidth: 72 });
      drawText(page, `${item.brand} ${item.pattern}`, MARGIN + 88, y - 14, {
        font: fonts.bold,
        size: 9,
        maxWidth: 160,
      });
      drawText(page, `${item.reducedQuantity} reduced / ${item.soldQuantity} sold`, MARGIN + 88, y - 29, {
        font: fonts.normal,
        size: 7.5,
        color: COLORS.muted,
        maxWidth: 160,
      });
      drawText(page, String(item.buyQuantity), MARGIN + 272, y - 22, {
        font: fonts.bold,
        size: 16,
        color: COLORS.orange,
        maxWidth: 34,
      });
      drawText(page, item.reducedBy, MARGIN + 318, y - 22, {
        font: fonts.bold,
        size: 8.5,
        maxWidth: 128,
      });
      drawText(page, String(item.currentStock), MARGIN + 462, y - 22, {
        font: fonts.bold,
        size: 10,
        maxWidth: 52,
      });
      y -= 38;
    }
  }

  return { page, y: y - 18 };
}

function drawSmallSection(
  doc: PDFDocument,
  initialPage: PDFPage,
  fonts: PdfFonts,
  data: StockDailyBuyReportPdfData,
  startY: number,
  title: string,
  lines: string[],
): { page: PDFPage; y: number } {
  let page = initialPage;
  let y = startY;
  ({ page, y } = ensureSpace(doc, page, fonts, data, y, 58));
  drawText(page, title, MARGIN, y, { font: fonts.bold, size: 13 });
  y -= 20;

  const visibleLines = lines.length ? lines : ['None recorded.'];
  for (const line of visibleLines) {
    ({ page, y } = ensureSpace(doc, page, fonts, data, y, 22));
    drawText(page, `- ${line}`, MARGIN + 4, y, {
      font: fonts.normal,
      size: 9,
      color: COLORS.muted,
      maxWidth: CONTENT_WIDTH - 8,
    });
    y -= 16;
  }

  return { page, y: y - 14 };
}

export async function createStockDailyBuyReportPdf(data: StockDailyBuyReportPdfData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fonts = {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    normal: await doc.embedFont(StandardFonts.Helvetica),
  };
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageBackground(page);
  drawHeader(page, fonts, data);

  let y = PAGE_HEIGHT - 132;
  y = drawSummary(page, fonts, data, y);

  ({ page, y } = drawBuyList(doc, page, fonts, data, y));

  const additionLines = data.additions.map(
    (item) =>
      `${item.addedQuantity} x ${item.sizeDisplay} in ${item.cityName} by ${item.addedBy} (${item.brand} ${item.pattern})`,
  );
  ({ page, y } = drawSmallSection(doc, page, fonts, data, y, 'Stock added', additionLines));

  const missingLines = data.missingRequests.map(
    (item) => `${item.normalizedSize} in ${item.cityName}: ${item.requestCount} request${item.requestCount === 1 ? '' : 's'} by ${item.requestedBy}`,
  );
  drawSmallSection(doc, page, fonts, data, y, 'Missing tyre requests', missingLines);

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
