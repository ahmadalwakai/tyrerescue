import { baseEmailTemplate } from './base';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface BookingReceiptData {
  customerName: string;
  refNumber: string;
  invoiceDate: Date;
  lineItems: LineItem[];
  subtotal: number;
  vatAmount?: number; // Deprecated - VAT removed from system
  total: number;
  vatRegistered?: boolean; // Deprecated - VAT removed from system
  vatNumber?: string; // Deprecated - VAT removed from system
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function paymentReceipt(data: BookingReceiptData): { subject: string; html: string } {
  const {
    customerName,
    refNumber,
    invoiceDate,
    lineItems,
    subtotal,
    total,
  } = data;

  const lineItemsHtml = lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">${item.description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.unitPrice)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPrice(item.total)}</td>
      </tr>
    `
    )
    .join('');

  const content = `
    <h1>Payment Receipt</h1>
    <p>Hi ${customerName},</p>
    <p>Thank you for your payment. Please find your receipt below.</p>
    
    <div class="info-box">
      <div class="info-row">
        <span class="label">Invoice Number</span>
        <span class="value">${refNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Date</span>
        <span class="value">${formatDate(invoiceDate)}</span>
      </div>
    </div>

    <h2>Order Details</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="background-color: #f9f9f9;">
          <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #666666;">Description</th>
          <th style="padding: 12px; text-align: center; font-size: 12px; text-transform: uppercase; color: #666666;">Qty</th>
          <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #666666;">Unit Price</th>
          <th style="padding: 12px; text-align: right; font-size: 12px; text-transform: uppercase; color: #666666;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div style="max-width: 280px; margin-left: auto;">
      <div class="info-box">
        <div class="info-row">
          <span class="label">Subtotal</span>
          <span class="value">${formatPrice(subtotal)}</span>
        </div>
        <div class="info-row total-row">
          <span>Total Paid</span>
          <span>${formatPrice(total)}</span>
        </div>
      </div>
    </div>

    <p style="font-size: 14px; color: #666666; margin-top: 24px;">
      If you have any questions about this receipt, please contact us on 0141 266 0690.
    </p>
  `;

  return {
    subject: `Payment Receipt - ${refNumber} - ${formatPrice(total)}`,
    html: baseEmailTemplate({
      preheader: `Payment receipt for booking ${refNumber}`,
      content,
    }),
  };
}
