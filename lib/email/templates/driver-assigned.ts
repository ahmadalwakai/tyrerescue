import { baseEmailTemplate } from './base';

export interface DriverAssignedData {
  customerName: string;
  refNumber: string;
  driverName: string;
  driverPhone: string;
  etaMinutes?: number;
  trackingUrl: string;
}

export function driverAssigned(data: DriverAssignedData): { subject: string; html: string } {
  const {
    customerName,
    refNumber,
    driverName,
    driverPhone,
    etaMinutes,
    trackingUrl,
  } = data;

  const etaSection = etaMinutes
    ? `
        <div style="font-size: 48px; font-weight: bold; color: #1a1a1a;">${etaMinutes}</div>
        <div style="font-size: 14px; color: #666666;">minutes estimated arrival</div>
      `
    : '';

  const content = `
    <h1>Your Driver Has Been Assigned</h1>
    <p>Hi ${customerName},</p>
    <p>Great news! A driver has been assigned to your booking and will be with you shortly.</p>
    
    <div class="info-box">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Reference</div>
        <div style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">${refNumber}</div>
        ${etaSection}
      </div>
    </div>

    <h2>Your Driver</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Name</span>
        <span class="value">${driverName}</span>
      </div>
      <div class="info-row">
        <span class="label">Direct Phone</span>
        <span class="value"><a href="tel:${driverPhone}" style="color: #1a1a1a; font-weight: 600;">${driverPhone}</a></span>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${trackingUrl}" class="button">Track Live Location</a>
    </div>

    <p style="font-size: 14px; color: #666666;">You can track your driver in real-time using the link above. Please ensure you are at the service location when the driver arrives.</p>
  `;

  return {
    subject: `Your Driver Has Been Assigned - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: etaMinutes 
        ? `Your driver ${driverName} is on the way - ETA ${etaMinutes} minutes`
        : `Your driver ${driverName} is on the way`,
      content,
    }),
  };
}
