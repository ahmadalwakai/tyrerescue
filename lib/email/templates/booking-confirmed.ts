import { baseEmailTemplate } from './base';

export interface BookingConfirmedData {
  customerName: string;
  refNumber: string;
  bookingType: 'emergency' | 'scheduled';
  serviceType: string;
  scheduledAt?: Date;
  address: string;
  tyreSummary: string;
  quantity: number;
  trackingUrl: string;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

export function bookingConfirmed(data: BookingConfirmedData): { subject: string; html: string } {
  const {
    customerName,
    refNumber,
    bookingType,
    serviceType,
    scheduledAt,
    address,
    tyreSummary,
    quantity,
    trackingUrl,
  } = data;

  const scheduledDateStr = scheduledAt
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(scheduledAt)
    : null;

  const content = `
    <h1>Booking Confirmed</h1>
    <p>Hi ${customerName},</p>
    <p>Thank you for your booking. Your ${bookingType === 'emergency' ? 'emergency callout' : 'scheduled appointment'} has been confirmed.</p>
    
    <div class="info-box">
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Reference Number</div>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 2px;">${refNumber}</div>
      </div>
    </div>

    <h2>Service Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Service Type</span>
        <span class="value">${serviceType}</span>
      </div>
      ${bookingType === 'scheduled' && scheduledDateStr ? `
      <div class="info-row">
        <span class="label">Date and Time</span>
        <span class="value">${scheduledDateStr}</span>
      </div>
      ` : ''}
    </div>

    ${bookingType === 'emergency' ? `
    <div class="info-box">
      <p style="margin: 0; text-align: center;"><strong>A driver will be assigned shortly.</strong></p>
      <p style="margin: 8px 0 0 0; text-align: center; font-size: 14px; color: #666666;">We will send you another email when a driver is on the way.</p>
    </div>
    ` : ''}

    <h2>Service Location</h2>
    <div class="info-box">
      <p style="margin: 0;">${address}</p>
    </div>

    <h2>Tyre Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">${tyreSummary}</span>
        <span class="value">x${quantity}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${trackingUrl}" class="button">Track Your Booking</a>
    </div>

    <p style="font-size: 14px; color: #666666;">If you have any questions, please call us on 0141 266 0690.</p>
  `;

  return {
    subject: `Booking Confirmed - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `Your booking ${refNumber} has been confirmed.`,
      content,
    }),
  };
}
