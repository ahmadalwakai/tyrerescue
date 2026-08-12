import { baseEmailTemplate } from './base';

export interface StockDailyBuyReportItem {
  cityName: string;
  sizeDisplay: string;
  brand: string;
  pattern: string;
  currentStock: number;
  orderedStock: number;
  targetStock: number;
  reducedQuantity: number;
  soldQuantity: number;
  buyQuantity: number;
  reducedBy: string;
  channels: string;
}

export interface StockDailyAdditionItem {
  cityName: string;
  sizeDisplay: string;
  brand: string;
  pattern: string;
  addedQuantity: number;
  addedBy: string;
}

export interface StockDailyMissingItem {
  cityName: string;
  normalizedSize: string;
  requestCount: number;
  requestedBy: string;
}

export interface StockDailyBuyReportData {
  reportDateLabel: string;
  generatedAtLabel: string;
  inventoryUrl: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tyreLabel(item: { brand: string; pattern: string; sizeDisplay: string }): string {
  return [item.sizeDisplay, item.brand, item.pattern].filter(Boolean).join(' - ');
}

function tableRows(items: StockDailyBuyReportItem[]): string {
  if (items.length === 0) {
    return `
      <tr>
        <td colspan="7" style="padding: 18px 12px; color: #64748b; text-align: center;">
          No tyres were sold or reduced during this reporting day.
        </td>
      </tr>
    `;
  }

  return items
    .map(
      (item) => `
        <tr>
          <td><strong>${escapeHtml(item.cityName)}</strong></td>
          <td>
            <strong>${escapeHtml(item.sizeDisplay)}</strong><br>
            <span style="color: #64748b; font-size: 12px;">${escapeHtml(item.brand)} ${escapeHtml(item.pattern)}</span>
          </td>
          <td style="font-size: 20px; font-weight: 800; color: #ea580c;">${item.buyQuantity}</td>
          <td>${item.reducedQuantity}</td>
          <td>${item.soldQuantity}</td>
          <td>${item.currentStock}</td>
          <td>${escapeHtml(item.reducedBy || 'Unknown')}</td>
        </tr>
      `,
    )
    .join('');
}

function additionsRows(additions: StockDailyAdditionItem[]): string {
  if (additions.length === 0) {
    return '<li>No stock additions recorded.</li>';
  }

  return additions
    .map(
      (item) =>
        `<li><strong>${item.addedQuantity} x ${escapeHtml(item.sizeDisplay)}</strong> in ${escapeHtml(item.cityName)} by ${escapeHtml(item.addedBy || 'Unknown')} <span style="color: #64748b;">(${escapeHtml(item.brand)} ${escapeHtml(item.pattern)})</span></li>`,
    )
    .join('');
}

function missingRows(missingRequests: StockDailyMissingItem[]): string {
  if (missingRequests.length === 0) {
    return '<li>No missing-tyre requests recorded.</li>';
  }

  return missingRequests
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.normalizedSize)}</strong> in ${escapeHtml(item.cityName)} - ${item.requestCount} request${item.requestCount === 1 ? '' : 's'} by ${escapeHtml(item.requestedBy || 'Unknown')}</li>`,
    )
    .join('');
}

export function stockDailyBuyReport(data: StockDailyBuyReportData): { subject: string; html: string; text: string } {
  const subject = `Tyre Rescue Stock Purchase List by Size - ${data.reportDateLabel} - ${data.generatedAtLabel} UK`;
  const hasItems = data.items.length > 0;

  const content = `
    <h1>Daily stock buy list</h1>
    <p>Dear managers,</p>
    <p>Please buy the listed tyres according to the iOS stock app. This report is based on tyres sold or reduced during ${escapeHtml(data.reportDateLabel)} in UK time.</p>

    <div class="info-box" style="border-left: 4px solid #f97316;">
      <div class="info-row">
        <span class="label">Total to buy</span>
        <span class="value">${data.totals.buyQuantity}</span>
      </div>
      <div class="info-row">
        <span class="label">Sold / reduced</span>
        <span class="value">${data.totals.reducedQuantity}</span>
      </div>
      <div class="info-row">
        <span class="label">Stock added</span>
        <span class="value">${data.totals.addedQuantity}</span>
      </div>
      <div class="info-row">
        <span class="label">Generated</span>
        <span class="value">${escapeHtml(data.generatedAtLabel)}</span>
      </div>
    </div>

    ${hasItems ? '<p><strong>Buy these tyres:</strong></p>' : ''}
    <table>
      <thead>
        <tr>
          <th>City</th>
          <th>Tyre</th>
          <th>Buy</th>
          <th>Reduced</th>
          <th>Sold</th>
          <th>Current</th>
          <th>Reduced by</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows(data.items)}
      </tbody>
    </table>

    <h2>Stock added</h2>
    <ul style="padding-left: 20px; margin-top: 8px;">
      ${additionsRows(data.additions)}
    </ul>

    <h2>Missing tyre requests</h2>
    <ul style="padding-left: 20px; margin-top: 8px;">
      ${missingRows(data.missingRequests)}
    </ul>

    <p style="margin-top: 24px;">
      <a class="button" href="${data.inventoryUrl}">Open stock admin</a>
    </p>
  `;

  const textLines = [
    subject,
    '',
    'Dear managers,',
    `Please buy the listed tyres according to the iOS stock app for ${data.reportDateLabel}.`,
    '',
    `Total to buy: ${data.totals.buyQuantity}`,
    `Sold / reduced: ${data.totals.reducedQuantity}`,
    `Stock added: ${data.totals.addedQuantity}`,
    `Generated: ${data.generatedAtLabel}`,
    '',
    'Buy list:',
    ...(data.items.length
      ? data.items.map(
          (item) =>
            `Buy ${item.buyQuantity} x ${tyreLabel(item)} in ${item.cityName}. Reduced ${item.reducedQuantity}, sold ${item.soldQuantity}, current ${item.currentStock}. Reduced by: ${item.reducedBy || 'Unknown'}.`,
        )
      : ['No tyres were sold or reduced during this reporting day.']),
    '',
    'Stock added:',
    ...(data.additions.length
      ? data.additions.map(
          (item) =>
            `${item.addedQuantity} x ${tyreLabel(item)} in ${item.cityName} by ${item.addedBy || 'Unknown'}.`,
        )
      : ['No stock additions recorded.']),
    '',
    'Missing tyre requests:',
    ...(data.missingRequests.length
      ? data.missingRequests.map(
          (item) =>
            `${item.normalizedSize} in ${item.cityName}: ${item.requestCount} request${item.requestCount === 1 ? '' : 's'} by ${item.requestedBy || 'Unknown'}.`,
        )
      : ['No missing-tyre requests recorded.']),
    '',
    `Open stock admin: ${data.inventoryUrl}`,
  ];

  return {
    subject,
    html: baseEmailTemplate({
      preheader: `Daily tyres to buy: ${data.totals.buyQuantity}`,
      content,
    }),
    text: textLines.join('\n'),
  };
}
