import { baseEmailTemplate } from './base';

export interface AdminBookingData {
  refNumber: string;
  bookingType: 'emergency' | 'scheduled';
  serviceType: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: string;
  lat: number;
  lng: number;
  tyreSizeDisplay: string;
  quantity: number;
  total: number;
  scheduledAt?: Date;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

export function adminNewBooking(
  data: AdminBookingData,
  assignUrl: string
): { subject: string; html: string } {
  const {
    refNumber,
    bookingType,
    serviceType,
    customerName,
    customerPhone,
    customerEmail,
    address,
    lat,
    lng,
    tyreSizeDisplay,
    quantity,
    total,
    scheduledAt,
  } = data;

  const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const isEmergency = bookingType === 'emergency';

  const scheduledDateStr = scheduledAt
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(scheduledAt)
    : null;

  const content = `
    <h1>${isEmergency ? 'EMERGENCY BOOKING' : 'New Booking'}</h1>
    ${isEmergency ? '<p style="color: #dc2626; font-weight: bold; font-size: 18px;">Action Required: Assign driver immediately</p>' : ''}
    
    <div class="info-box" ${isEmergency ? 'style="border: 2px solid #dc2626;"' : ''}>
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Reference</div>
        <div style="font-size: 28px; font-weight: bold;">${refNumber}</div>
        <div style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin-top: 8px;">${formatPrice(total)}</div>
      </div>
    </div>

    <h2>Customer Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Name</span>
        <span class="value">${customerName}</span>
      </div>
      <div class="info-row">
        <span class="label">Phone</span>
        <span class="value"><a href="tel:${customerPhone}" style="color: #1a1a1a; font-weight: 600;">${customerPhone}</a></span>
      </div>
      <div class="info-row">
        <span class="label">Email</span>
        <span class="value">${customerEmail}</span>
      </div>
    </div>

    <h2>Location</h2>
    <div class="info-box">
      <p style="margin: 0 0 8px 0;">${address}</p>
      <a href="${mapUrl}" style="color: #1a1a1a; font-weight: 600;">View on Map</a>
    </div>

    <h2>Service Details</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Type</span>
        <span class="value">${isEmergency ? 'Emergency Callout' : 'Scheduled'}</span>
      </div>
      ${scheduledDateStr ? `
      <div class="info-row">
        <span class="label">Scheduled For</span>
        <span class="value">${scheduledDateStr}</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="label">Service</span>
        <span class="value">${serviceType}</span>
      </div>
      <div class="info-row">
        <span class="label">Tyre Size</span>
        <span class="value">${tyreSizeDisplay}</span>
      </div>
      <div class="info-row">
        <span class="label">Quantity</span>
        <span class="value">${quantity}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${assignUrl}" class="button">${isEmergency ? 'Assign Driver Now' : 'View and Assign Driver'}</a>
    </div>
  `;

  return {
    subject: `New Booking - ${refNumber} - ${formatPrice(total)}`,
    html: baseEmailTemplate({
      preheader: `${isEmergency ? 'EMERGENCY: ' : ''}New booking ${refNumber} - ${formatPrice(total)}`,
      content,
    }),
  };
}
