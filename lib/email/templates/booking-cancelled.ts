import { baseEmailTemplate } from './base';

export interface BookingCancelledData {
  customerName: string;
  refNumber: string;
  reason?: string;
  serviceType: string;
  scheduledAt?: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

export function bookingCancelled(data: BookingCancelledData): { subject: string; html: string } {
  const { customerName, refNumber, reason, serviceType, scheduledAt } = data;

  const scheduledInfo = scheduledAt
    ? `<div class="info-row">
        <span class="label">Scheduled For</span>
        <span class="value">${new Date(scheduledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>`
    : '';

  const content = `
    <h1>Booking Cancelled</h1>
    <p>Hi ${customerName},</p>
    <p>We're writing to confirm that your booking has been cancelled.</p>

    <div class="info-box">
      <div class="info-row">
        <span class="label">Booking Reference</span>
        <span class="value">${refNumber}</span>
      </div>
      <div class="info-row">
        <span class="label">Service</span>
        <span class="value">${SERVICE_LABELS[serviceType] || serviceType}</span>
      </div>
      ${scheduledInfo}
    </div>

    ${reason ? `
    <div class="info-box">
      <div class="info-row">
        <span class="label">Reason</span>
        <span class="value">${reason}</span>
      </div>
    </div>
    ` : ''}

    <p>If a payment was taken, a refund will be processed separately and you will receive a confirmation email once it has been issued.</p>

    <p style="font-size: 14px; color: #666666; margin-top: 24px;">If you have any questions or believe this was done in error, please contact us on <strong>0141 266 0690</strong> or email <strong>support@tyrerescue.uk</strong>.</p>
  `;

  return {
    subject: `Booking Cancelled - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `Your booking ${refNumber} has been cancelled`,
      content,
    }),
  };
}
