import { API_BASE_URL } from './config';

export const API = {
  driverAvailable: '/api/driver/status/available',
  validateLocation: '/api/bookings/validate-location',
  eligibility: '/api/availability/eligibility',
  tyreSizes: '/api/tyres/sizes',
  popularTyreSizes: '/api/tyres/popular-sizes',
  tyres: '/api/tyres',
  availabilitySlots: '/api/availability/slots',
  vehicleLookup: '/api/vehicle-lookup',
  uploadTyrePhoto: '/api/upload/tyre-photo',
  quote: '/api/bookings/quote',
  createBooking: '/api/bookings/create',
  confirmBooking: '/api/bookings/confirm',
  tracking: '/api/tracking',
  customerClaimBooking: '/api/mobile/customer/auth/claim-booking',
  customerLogin: '/api/mobile/customer/auth/login',
  customerForgotPassword: '/api/mobile/customer/auth/forgot-password',
  customerMe: '/api/mobile/customer/me',
  customerInvoices: '/api/mobile/customer/invoices',
  customerPushToken: '/api/mobile/customer/push-token',
} as const;

export function endpoint(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function customerInvoiceUrl(refNumber: string, token: string) {
  const ref = encodeURIComponent(refNumber);
  const invoiceToken = encodeURIComponent(token);
  return endpoint(`${API.customerInvoices}/${ref}?token=${invoiceToken}`);
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(endpoint(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : null),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === 'object'
        ? (data.message as string) || (data.error as string)
        : null;
    throw new Error(message || `Request failed (${res.status})`);
  }
  return data as T;
}
