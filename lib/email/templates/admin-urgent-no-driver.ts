import { baseEmailTemplate } from './base';

export interface AdminUrgentNoDriverData {
  refNumber: string;
  customerPhone: string;
  address: string;
  bookingUrl: string;
}

export function adminUrgentNoDriver(data: AdminUrgentNoDriverData): { subject: string; html: string } {
  const { refNumber, customerPhone, address, bookingUrl } = data;

  const content = `
    <div style="background-color: #dc2626; color: #ffffff; padding: 16px; text-align: center; margin: -32px -24px 24px -24px;">
      <h1 style="color: #ffffff; margin: 0;">URGENT</h1>
      <p style="margin: 8px 0 0 0; font-size: 18px;">Emergency Booking - No Driver Available</p>
    </div>

    <p>An emergency booking has been placed but no driver is currently available to accept it. Immediate action is required.</p>
    
    <div class="info-box" style="border: 2px solid #dc2626;">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</div>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 2px;">${refNumber}</div>
      </div>
    </div>

    <h2>Customer Contact</h2>
    <div class="info-box" style="text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #666666;">Call the customer immediately</p>
      <p style="margin: 8px 0 0 0;">
        <a href="tel:${customerPhone}" style="font-size: 28px; font-weight: bold; color: #1a1a1a;">${customerPhone}</a>
      </p>
    </div>

    <h2>Customer Location</h2>
    <div class="info-box">
      <p style="margin: 0;">${address}</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${bookingUrl}" class="button" style="background-color: #dc2626;">View Booking in Admin</a>
    </div>

    <p style="font-size: 14px; color: #666666;">Please either:</p>
    <ul style="font-size: 14px; color: #666666;">
      <li>Manually assign an available driver</li>
      <li>Contact a driver directly to take the job</li>
      <li>Call the customer to discuss alternative arrangements</li>
    </ul>
  `;

  return {
    subject: `URGENT - Emergency Booking, No Driver Available`,
    html: baseEmailTemplate({
      preheader: `URGENT: Emergency booking ${refNumber} has no driver assigned`,
      content,
    }),
  };
}
