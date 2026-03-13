import { baseEmailTemplate } from './base';

export interface JobAssignedData {
  driverName: string;
  refNumber: string;
  customerAddress: string;
  customerLat: number;
  customerLng: number;
  tyreSizeDisplay: string;
  tyreCondition: 'new' | 'used';
  quantity: number;
  serviceType: string;
  customerPhone: string;
  tyrePhotoUrl?: string;
}

export function jobAssigned(data: JobAssignedData): { subject: string; html: string } {
  const {
    driverName,
    refNumber,
    customerAddress,
    customerLat,
    customerLng,
    tyreSizeDisplay,
    tyreCondition,
    quantity,
    serviceType,
    customerPhone,
    tyrePhotoUrl,
  } = data;

  const mapUrl = `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`;

  const content = `
    <h1>New Job Assigned</h1>
    <p>Hi ${driverName},</p>
    <p>You have been assigned a new job. Please review the details below and proceed to the customer location.</p>
    
    <div class="info-box">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</div>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 2px;">${refNumber}</div>
      </div>
    </div>

    <h2>Customer Location</h2>
    <div class="info-box">
      <p style="margin: 0 0 12px 0;">${customerAddress}</p>
      <a href="${mapUrl}" style="color: #1a1a1a; font-weight: 600;">Open in Google Maps</a>
    </div>

    <h2>Service Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Service Type</span>
        <span class="value">${serviceType}</span>
      </div>
      <div class="info-row">
        <span class="label">Tyre Size</span>
        <span class="value">${tyreSizeDisplay}</span>
      </div>
      <div class="info-row">
        <span class="label">Condition</span>
        <span class="value">${tyreCondition === 'new' ? 'New' : 'Part-Worn'}</span>
      </div>
      <div class="info-row">
        <span class="label">Quantity</span>
        <span class="value">${quantity}</span>
      </div>
    </div>

    <h2>Customer Contact</h2>
    <div class="info-box">
      <p style="margin: 0;">
        <a href="tel:${customerPhone}" style="font-size: 20px; font-weight: bold; color: #1a1a1a;">${customerPhone}</a>
      </p>
    </div>

    ${tyrePhotoUrl ? `
    <h2>Tyre Photo</h2>
    <div class="info-box">
      <p style="margin: 0;">
        <a href="${tyrePhotoUrl}" style="color: #1a1a1a; font-weight: 600;">View Customer's Tyre Photo</a>
      </p>
    </div>
    ` : ''}

    <p style="font-size: 14px; color: #666666; margin-top: 24px;">Update your job status in the driver portal as you progress through the job.</p>
  `;

  return {
    subject: `New Job Assigned - ${refNumber}`,
    html: baseEmailTemplate({
      preheader: `New job assigned: ${refNumber} - ${serviceType}`,
      content,
    }),
  };
}
