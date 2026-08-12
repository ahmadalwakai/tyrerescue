import type { WheelNutConsent } from '@/lib/db/schema';

export const WHEEL_NUT_DECLARATION_TEXT = [
  'I understand the risks explained above.',
  '',
  'I authorise Tyre Rescue to proceed with removing the locking wheel nut using specialist extraction methods.',
  '',
  'I accept that the locking wheel nut may need to be destroyed and that accidental damage to the wheel may occur despite reasonable care being taken.',
  '',
  'I confirm that I wish the work to proceed.',
].join('\n');

export const WHEEL_NUT_CONSENT_TITLE = 'Wheel Damage & Locking Wheel Nut Consent';

export interface WheelNutConsentBookingLike {
  lockingNutStatus?: string | null;
  serviceType?: string | null;
  wheelNutConsentRequiredAt?: Date | string | null;
  wheelNutConsentReason?: string | null;
}

export interface WheelNutConsentStatus {
  required: boolean;
  requiredAt: string | null;
  requiredReason: string | null;
  signedAt: string | null;
  consentId: string | null;
  customerName: string | null;
  vehicleReg: string | null;
  driverName: string | null;
  declarationAccepted: boolean;
  signatureUrl: string | null;
  pdfUrl: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  gpsLat: string | null;
  gpsLng: string | null;
  gpsAccuracy: number | null;
  deviceId: string | null;
  canComplete: boolean;
}

export function bookingRequiresWheelNutConsent(booking: WheelNutConsentBookingLike): boolean {
  return Boolean(booking.wheelNutConsentRequiredAt) ||
    booking.lockingNutStatus === 'no_key' ||
    booking.serviceType === 'locking_nut' ||
    booking.serviceType === 'locking_nut_removal';
}

export function isValidWheelNutConsent(consent: Pick<
  WheelNutConsent,
  'declarationAccepted' | 'signatureUrl' | 'pdfUrl' | 'createdAt'
> | null | undefined): boolean {
  return Boolean(
    consent?.declarationAccepted &&
      consent.signatureUrl &&
      consent.pdfUrl &&
      consent.createdAt,
  );
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function decimalToString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'object' && 'toString' in value) return String(value);
  return null;
}

export function serializeWheelNutConsentStatus(
  booking: WheelNutConsentBookingLike,
  consent: WheelNutConsent | null | undefined,
): WheelNutConsentStatus {
  const required = bookingRequiresWheelNutConsent(booking);
  const valid = isValidWheelNutConsent(consent);

  return {
    required,
    requiredAt: iso(booking.wheelNutConsentRequiredAt),
    requiredReason: booking.wheelNutConsentReason ?? null,
    signedAt: iso(consent?.createdAt),
    consentId: consent?.id ?? null,
    customerName: consent?.customerName ?? null,
    vehicleReg: consent?.vehicleReg ?? null,
    driverName: consent?.driverName ?? null,
    declarationAccepted: Boolean(consent?.declarationAccepted),
    signatureUrl: consent?.signatureUrl ?? null,
    pdfUrl: consent?.pdfUrl ?? null,
    emailStatus: consent?.emailStatus ?? null,
    emailSentAt: iso(consent?.emailSentAt),
    gpsLat: decimalToString(consent?.gpsLat),
    gpsLng: decimalToString(consent?.gpsLng),
    gpsAccuracy: consent?.gpsAccuracy ?? null,
    deviceId: consent?.deviceId ?? null,
    canComplete: !required || valid,
  };
}
