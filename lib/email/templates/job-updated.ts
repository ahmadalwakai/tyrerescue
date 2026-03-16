import { baseEmailTemplate } from './base';

export interface JobUpdatedData {
  driverName: string;
  refNumber: string;
  changedFields: string;
  customerAddress: string;
  customerPhone: string;
}

export function jobUpdated(data: JobUpdatedData): { subject: string; html: string } {
  const { driverName, refNumber, changedFields, customerAddress, customerPhone } = data;

  const content = `
    <h1>Job Updated</h1>
    <p>Hi ${driverName},</p>
    <p>An active job assigned to you has been updated by the admin. Please review the latest details.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="label">Booking Reference</span>
        <span class="value">${refNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Fields Changed</span>
        <span class="value">${changedFields}</span>
      </div>
    </div>

    <h2>Current Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Customer Address</span>
        <span class="value">${customerAddress}</span>
      </div>
      <div class="info-row">
        <span class="label">Customer Phone</span>
        <span class="value">${customerPhone}</span>
      </div>
    </div>

    <p>Please check the updated job details in your driver dashboard.</p>
    <p style="font-size: 14px; color: #666666; margin-top: 24px;">If you have any questions, contact the office on <strong>0141 266 0690</strong>.</p>
  `;

  return {
    subject: `Job Updated - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `Job ${refNumber} has been updated`,
      content,
    }),
  };
}
