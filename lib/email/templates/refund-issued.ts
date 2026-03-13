import { baseEmailTemplate } from './base';

export interface RefundIssuedData {
  customerName: string;
  amount: number;
  refNumber: string;
  last4: string;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

export function refundIssued(data: RefundIssuedData): { subject: string; html: string } {
  const { customerName, amount, refNumber, last4 } = data;

  const content = `
    <h1>Refund Processed</h1>
    <p>Hi ${customerName},</p>
    <p>We have processed a refund for your booking. Please find the details below.</p>
    
    <div class="info-box">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Refund Amount</div>
        <div style="font-size: 36px; font-weight: bold; color: #1a1a1a;">${formatPrice(amount)}</div>
      </div>
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="label">Booking Reference</span>
        <span class="value">${refNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Refund To</span>
        <span class="value">Card ending in ${last4}</span>
      </div>
    </div>

    <h2>Processing Time</h2>
    <p>The refund has been submitted to your bank. Please allow <strong>3 to 5 business days</strong> for the funds to appear in your account, depending on your bank's processing times.</p>

    <p style="font-size: 14px; color: #666666; margin-top: 24px;">If you do not see the refund after 5 business days, please contact your bank first, then get in touch with us on 0141 266 0690.</p>
  `;

  return {
    subject: `Refund Processed - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `Refund of ${formatPrice(amount)} has been processed`,
      content,
    }),
  };
}
