// Email templates index - exports all template functions

export { welcome } from './welcome';
export type { WelcomeEmailData } from './welcome';

export { verifyEmail } from './verify-email';
export type { VerifyEmailData } from './verify-email';

export { resetPassword } from './reset-password';
export type { ResetPasswordData } from './reset-password';

export { bookingConfirmed } from './booking-confirmed';
export type { BookingConfirmedData } from './booking-confirmed';

export { paymentReceipt } from './payment-receipt';
export type { BookingReceiptData, LineItem } from './payment-receipt';

export { driverWelcome } from './driver-welcome';
export type { DriverWelcomeData } from './driver-welcome';

export { driverAssigned } from './driver-assigned';
export type { DriverAssignedData } from './driver-assigned';

export { jobAssigned } from './job-assigned';
export type { JobAssignedData } from './job-assigned';

export { jobComplete } from './job-complete';
export type { JobCompleteData } from './job-complete';

export { refundIssued } from './refund-issued';
export type { RefundIssuedData } from './refund-issued';

export { adminNewBooking } from './admin-new-booking';
export type { AdminBookingData } from './admin-new-booking';

export { adminUrgentNoDriver } from './admin-urgent-no-driver';
export type { AdminUrgentNoDriverData } from './admin-urgent-no-driver';

export { adminLowStock } from './admin-low-stock';
export type { AdminLowStockData } from './admin-low-stock';

export { baseEmailTemplate } from './base';
export type { BaseEmailProps } from './base';
