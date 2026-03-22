import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVatNumber?: string | null; // Optional - VAT removed from system
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  items: { description: string; quantity: number; unitPrice: number; totalPrice: number }[];
  subtotal: number;
  vatRate?: number; // Deprecated - VAT removed
  vatAmount?: number; // Deprecated - VAT removed
  totalAmount: number;
  notes: string | null;
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

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
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

  page.drawText(sanitize(data.companyName.toUpperCase()), {
    x: marginLeft, y: y + 18, size: 22, font: fontBold, color: WHITE,
  });
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

  const metaLabels = ['Invoice No:', 'Issue Date:', 'Due Date:', 'Status:'];
  const metaValues = [data.invoiceNumber, fmtDate(data.issueDate), fmtDate(data.dueDate), data.status.toUpperCase()];
  let my = y;
  for (let i = 0; i < metaLabels.length; i++) {
    const labelW = fontNormal.widthOfTextAtSize(metaLabels[i], 9);
    page.drawText(metaLabels[i], {
      x: marginRight - 160, y: my, size: 9, font: fontNormal, color: GREY,
    });
    page.drawText(sanitize(metaValues[i]), {
      x: marginRight - 160 + labelW + 8, y: my, size: 9,
      font: i === 3 ? fontBold : fontNormal,
      color: i === 3 ? ORANGE : DARK,
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

  // ── Line items table ──
  const colX = [marginLeft, marginLeft + 250, marginLeft + 320, marginLeft + 400];
  const colHeaders = ['Description', 'Qty', 'Unit Price', 'Total'];
  const colAligns = ['left', 'center', 'right', 'right'] as const;

  // Header row
  page.drawRectangle({ x: marginLeft - 5, y: y - 5, width: marginRight - marginLeft + 10, height: 22, color: DARK });
  for (let i = 0; i < colHeaders.length; i++) {
    const tw = fontBold.widthOfTextAtSize(colHeaders[i], 8);
    let tx = colX[i];
    if (colAligns[i] === 'right') tx = colX[i] + (i === colHeaders.length - 1 ? 90 : 60) - tw;
    else if (colAligns[i] === 'center') tx = colX[i] + 30 - tw / 2;
    page.drawText(colHeaders[i], { x: tx, y: y + 3, size: 8, font: fontBold, color: WHITE });
  }
  y -= 28;

  // Data rows
  for (let r = 0; r < data.items.length; r++) {
    const item = data.items[r];
    if (r % 2 === 0) {
      page.drawRectangle({ x: marginLeft - 5, y: y - 5, width: marginRight - marginLeft + 10, height: 20, color: LIGHT_GREY });
    }
    // Truncate description if too long
    let desc = sanitize(item.description);
    const maxDescW = 240;
    while (fontNormal.widthOfTextAtSize(desc, 9) > maxDescW && desc.length > 3) {
      desc = desc.slice(0, -4) + '...';
    }

    page.drawText(sanitize(desc), { x: colX[0], y: y + 2, size: 9, font: fontNormal, color: DARK });

    const qtyStr = String(item.quantity);
    const qtyW = fontNormal.widthOfTextAtSize(qtyStr, 9);
    page.drawText(qtyStr, { x: colX[1] + 30 - qtyW / 2, y: y + 2, size: 9, font: fontNormal, color: DARK });

    const upStr = fmtPrice(item.unitPrice);
    const upW = fontNormal.widthOfTextAtSize(upStr, 9);
    page.drawText(upStr, { x: colX[2] + 60 - upW, y: y + 2, size: 9, font: fontNormal, color: DARK });

    const totStr = fmtPrice(item.totalPrice);
    const totW = fontNormal.widthOfTextAtSize(totStr, 9);
    page.drawText(totStr, { x: colX[3] + 90 - totW, y: y + 2, size: 9, font: fontNormal, color: DARK });

    y -= 22;
  }

  // ── Divider ──
  y -= 5;
  page.drawLine({ start: { x: marginLeft, y }, end: { x: marginRight, y }, thickness: 1, color: GREY });
  y -= 20;

  // ── Totals (right-aligned block) ──
  const totalsX = marginRight - 180;
  const valX = marginRight;

  function drawTotalRow(label: string, value: string, bold = false) {
    const f = bold ? fontBold : fontNormal;
    const sz = bold ? 12 : 10;
    const col = bold ? DARK : GREY;
    page.drawText(label, { x: totalsX, y, size: sz, font: f, color: col });
    const vw = f.widthOfTextAtSize(value, sz);
    page.drawText(value, { x: valX - vw, y, size: sz, font: bold ? fontBold : fontNormal, color: DARK });
    y -= bold ? 22 : 17;
  }

  drawTotalRow('Subtotal', fmtPrice(data.subtotal));
  page.drawLine({ start: { x: totalsX, y: y + 8 }, end: { x: valX, y: y + 8 }, thickness: 2, color: ORANGE });
  y -= 4;
  drawTotalRow('Total Due', fmtPrice(data.totalAmount), true);

  // ── Notes ──
  if (data.notes) {
    y -= 10;
    page.drawText('Notes', { x: marginLeft, y, size: 10, font: fontBold, color: ORANGE });
    y -= 14;
    const noteLines = data.notes.split('\n');
    for (const line of noteLines) {
      if (y < 60) break;
      page.drawText(sanitize(line), { x: marginLeft, y, size: 9, font: fontNormal, color: GREY });
      y -= 13;
    }
  }

  // ── Footer ──
  page.drawRectangle({ x: 0, y: 0, width, height: 35, color: DARK });
  page.drawText(sanitize(`${data.companyName} - ${data.companyPhone} - ${data.companyEmail}`), {
    x: marginLeft, y: 12, size: 8, font: fontNormal, color: GREY,
  });

  return doc.save();
}
