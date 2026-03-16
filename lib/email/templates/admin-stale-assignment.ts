import { baseEmailTemplate } from './base';

export interface StaleBooking {
  refNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  assignedMinutesAgo: number;
  driverName: string;
  driverOnline: boolean;
}

export interface AdminStaleAssignmentData {
  staleBookings: StaleBooking[];
  adminUrl: string;
}

export function adminStaleAssignment(data: AdminStaleAssignmentData): { subject: string; html: string } {
  const { staleBookings, adminUrl } = data;

  const rows = staleBookings
    .map(
      (b) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
          <a href="${adminUrl}/admin/bookings/${b.refNumber}" style="color: #F97316; font-weight: bold;">${b.refNumber}</a>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${b.customerName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${b.driverName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">
          <span style="color: ${b.driverOnline ? '#22c55e' : '#ef4444'}; font-weight: bold;">${b.driverOnline ? 'Online' : 'OFFLINE'}</span>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5;">${b.assignedMinutesAgo} min</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e5e5; font-size: 13px;">${b.address}</td>
      </tr>`
    )
    .join('');

  const content = `
    <div style="background-color: #f59e0b; color: #000000; padding: 16px; text-align: center; margin: -32px -24px 24px -24px;">
      <h1 style="color: #000000; margin: 0;">Stale Assignment Alert</h1>
      <p style="margin: 8px 0 0 0; font-size: 16px;">${staleBookings.length} booking${staleBookings.length > 1 ? 's have' : ' has'} not progressed after driver assignment</p>
    </div>

    <p>The following bookings were assigned to a driver but the driver has not started the journey within the expected time. Please review and consider reassigning.</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="padding: 10px; text-align: left;">Ref</th>
          <th style="padding: 10px; text-align: left;">Customer</th>
          <th style="padding: 10px; text-align: left;">Driver</th>
          <th style="padding: 10px; text-align: left;">Status</th>
          <th style="padding: 10px; text-align: left;">Assigned</th>
          <th style="padding: 10px; text-align: left;">Location</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${adminUrl}/admin/bookings" class="button" style="background-color: #F97316;">View All Bookings</a>
    </div>

    <p style="font-size: 14px; color: #666666;">This alert is sent automatically when a booking stays in "Driver Assigned" status for more than 30 minutes without the driver starting their journey.</p>
  `;

  return {
    subject: `Stale Assignment Alert - ${staleBookings.length} booking${staleBookings.length > 1 ? 's' : ''} need attention`,
    html: baseEmailTemplate({
      preheader: `${staleBookings.length} booking${staleBookings.length > 1 ? 's' : ''} stuck in driver_assigned status`,
      content,
    }),
  };
}
