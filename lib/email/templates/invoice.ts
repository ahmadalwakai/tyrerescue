import { baseEmailTemplate } from './base';

export interface InvoiceEmailData {
  customerName: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  companyName: string;
  viewUrl: string;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function invoiceEmail(data: InvoiceEmailData): { subject: string; html: string } {
  const content = `
    <h1>Invoice ${data.invoiceNumber}</h1>
    <p>Hi ${data.customerName},</p>
    <p>Please find attached your invoice from ${data.companyName}.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="label">Invoice Number</span>
        <span class="value">${data.invoiceNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Issue Date</span>
        <span class="value">${formatDate(data.issueDate)}</span>
      </div>
      <div class="info-row">
        <span class="label">Due Date</span>
        <span class="value">${formatDate(data.dueDate)}</span>
      </div>
      <div class="info-row total-row">
        <span>Total Due</span>
        <span>${formatPrice(data.totalAmount)}</span>
      </div>
    </div>

    <p style="text-align: center;">
      <a href="${data.viewUrl}" class="button">View Invoice</a>
    </p>

    <p style="font-size: 14px; color: #666666;">
      A PDF copy of the invoice is attached to this email. If you have any questions, please contact us on 0141 266 0690.
    </p>
  `;

  return {
    subject: `Invoice ${data.invoiceNumber} from ${data.companyName}`,
    html: baseEmailTemplate({ preheader: `Invoice ${data.invoiceNumber} — ${formatPrice(data.totalAmount)} due`, content }),
  };
}
