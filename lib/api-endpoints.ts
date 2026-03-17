/**
 * API endpoint constants — single source of truth.
 * Prevents typos and makes refactoring trivial.
 */
export const API = {
  // Auth
  AUTH_REGISTER: '/api/auth/register',
  AUTH_FORGOT_PASSWORD: '/api/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/api/auth/reset-password',

  // Bookings
  BOOKINGS_CREATE: '/api/bookings/create',
  BOOKINGS_QUOTE: '/api/bookings/quote',
  BOOKINGS_VALIDATE_LOCATION: '/api/bookings/validate-location',

  // Availability
  AVAILABILITY_SLOTS: '/api/availability/slots',
  AVAILABILITY_ELIGIBILITY: '/api/availability/eligibility',

  // Driver
  DRIVER_STATUS_AVAILABLE: '/api/driver/status/available',
  DRIVER_LOCATION: '/api/driver/location',

  // Tyres
  TYRES: '/api/tyres',
  TYRES_SIZES: '/api/tyres/sizes',
  TYRES_POPULAR_SIZES: '/api/tyres/popular-sizes',

  // Vehicle Lookup
  VEHICLE_LOOKUP: '/api/vehicle-lookup',

  // Upload
  UPLOAD_TYRE_PHOTO: '/api/upload/tyre-photo',
} as const;
