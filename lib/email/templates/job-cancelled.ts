import { baseEmailTemplate } from './base';

export interface JobCancelledData {
  driverName: string;
  refNumber: string;
  customerAddress: string;
  reason?: string;
}

export function jobCancelled(data: JobCancelledData): { subject: string; html: string } {
  const { driverName, refNumber, customerAddress, reason } = data;

  const content = `
    <h1>Job Cancelled</h1>
    <p>Hi ${driverName},</p>
    <p>A job that was assigned to you has been cancelled by the admin.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="label">Booking Reference</span>
        <span class="value">${refNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Customer Address</span>
        <span class="value">${customerAddress}</span>
      </div>
    </div>

    ${reason ? `
    <div class="info-box">
      <div class="info-row">
        <span class="label">Reason</span>
        <span class="value">${reason}</span>
      </div>
    </div>
    ` : ''}

    <p>No further action is required from you for this booking.</p>
    <p style="font-size: 14px; color: #666666; margin-top: 24px;">If you have any questions, please contact the office on <strong>0141 266 0690</strong>.</p>
  `;

  return {
    subject: `Job Cancelled - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `Job ${refNumber} has been cancelled`,
      content,
    }),
  };
}
