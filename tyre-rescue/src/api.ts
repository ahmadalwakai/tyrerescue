import { Platform } from 'react-native';
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
  customerRegister: '/api/mobile/customer/auth/register',
  customerLogin: '/api/mobile/customer/auth/login',
  customerForgotPassword: '/api/mobile/customer/auth/forgot-password',
  customerMe: '/api/mobile/customer/me',
  customerProfile: '/api/mobile/customer/profile',
  customerDeleteAccount: '/api/mobile/customer/account',
  customerAssistedHelp: '/api/mobile/customer/assisted-help',
  customerInvoices: '/api/mobile/customer/invoices',
  customerPushToken: '/api/mobile/customer/push-token',
  callBack: '/api/call-back',
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

/** Native sessions use explicit bearer/booking headers, never the shared cookie jar. */
export function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  return fetch(endpoint(path), {
    ...init,
    ...(Platform.OS === 'web' ? {} : { credentials: 'omit' as const }),
  });
}

type CustomerApiErrorKind = 'http' | 'timeout' | 'network' | 'aborted';

export class CustomerApiError extends Error {
  readonly kind: CustomerApiErrorKind;
  readonly status: number | null;

  constructor(message: string, kind: CustomerApiErrorKind, status: number | null = null) {
    super(message);
    this.name = kind === 'aborted' ? 'AbortError' : 'CustomerApiError';
    this.kind = kind;
    this.status = status;
  }
}

export function isCustomerConnectionError(error: unknown): error is CustomerApiError {
  return error instanceof CustomerApiError && (error.kind === 'timeout' || error.kind === 'network');
}

/** A deadline covers both the response and its body. Mutations are never retried automatically. */
export async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  if (init?.signal?.aborted) throw new CustomerApiError('Request cancelled.', 'aborted');

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  let interrupt = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    interrupt = () => reject(new CustomerApiError(
      timedOut ? 'Connection timed out. Check your connection and try again.' : 'Request cancelled.',
      timedOut ? 'timeout' : 'aborted',
    ));
    controller.signal.addEventListener('abort', interrupt, { once: true });
  });
  init?.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    return await Promise.race([interrupted, (async () => {
      const res = await fetchApi(path, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : null),
          ...(init?.headers || {}),
        },
      });
      const data = await res.json().catch((error: unknown) => {
        if (controller.signal.aborted || !(error instanceof SyntaxError)) throw error;
        return null;
      });
      if (!res.ok) {
        const message = data && typeof data === 'object'
          ? (typeof data.message === 'string' && data.message) || (typeof data.error === 'string' && data.error)
          : null;
        throw new CustomerApiError(message || `Request failed (${res.status})`, 'http', res.status);
      }
      return data as T;
    })()]);
  } catch (error) {
    if (error instanceof CustomerApiError) throw error;
    if (controller.signal.aborted) throw new CustomerApiError(
      timedOut ? 'Connection timed out. Check your connection and try again.' : 'Request cancelled.',
      timedOut ? 'timeout' : 'aborted',
    );
    throw new CustomerApiError('Unable to connect. Check your connection and try again.', 'network');
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', interrupt);
  }
}
