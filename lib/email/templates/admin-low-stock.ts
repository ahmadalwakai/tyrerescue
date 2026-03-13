import { baseEmailTemplate } from './base';

export interface AdminLowStockData {
  brand: string;
  pattern: string;
  size: string;
  stockNew: number;
  stockUsed: number;
  inventoryUrl: string;
}

export function adminLowStock(data: AdminLowStockData): { subject: string; html: string } {
  const { brand, pattern, size, stockNew, stockUsed, inventoryUrl } = data;

  const content = `
    <h1>Low Stock Alert</h1>
    <p>The following tyre is running low on stock and may need to be reordered.</p>
    
    <div class="info-box">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">${brand}</div>
        <div style="font-size: 24px; font-weight: bold;">${pattern}</div>
        <div style="font-size: 18px; color: #666666;">${size}</div>
      </div>
    </div>

    <h2>Current Stock Levels</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">New Tyres</span>
        <span class="value" style="${stockNew <= 2 ? 'color: #dc2626;' : ''}">${stockNew} units</span>
      </div>
      <div class="info-row">
        <span class="label">Part-Worn Tyres</span>
        <span class="value" style="${stockUsed <= 2 ? 'color: #dc2626;' : ''}">${stockUsed} units</span>
      </div>
    </div>

    ${stockNew === 0 || stockUsed === 0 ? `
    <div class="info-box" style="background-color: #fef2f2; border: 1px solid #fecaca;">
      <p style="margin: 0; color: #dc2626; font-weight: 600;">
        ${stockNew === 0 && stockUsed === 0 ? 'Both new and part-worn stock are depleted.' : stockNew === 0 ? 'New tyre stock is depleted.' : 'Part-worn tyre stock is depleted.'}
      </p>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 32px 0;">
      <a href="${inventoryUrl}" class="button">Manage Inventory</a>
    </div>

    <p style="font-size: 14px; color: #666666;">This alert is triggered when stock falls below 5 units for any condition.</p>
  `;

  return {
    subject: `Low Stock Alert - ${size} ${brand} ${pattern}`,
    html: baseEmailTemplate({
      preheader: `Low stock: ${brand} ${pattern} ${size}`,
      content,
    }),
  };
}
