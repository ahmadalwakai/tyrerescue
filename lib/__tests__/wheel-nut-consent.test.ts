import { describe, expect, it } from 'vitest';
import {
  bookingRequiresWheelNutConsent,
  isValidWheelNutConsent,
  serializeWheelNutConsentStatus,
} from '@/lib/wheel-nut-consent';

describe('wheel nut consent', () => {
  it('requires consent for no-key and locking nut work', () => {
    expect(bookingRequiresWheelNutConsent({ lockingNutStatus: 'no_key' })).toBe(true);
    expect(bookingRequiresWheelNutConsent({ serviceType: 'locking_nut' })).toBe(true);
    expect(bookingRequiresWheelNutConsent({ serviceType: 'locking_nut_removal' })).toBe(true);
    expect(bookingRequiresWheelNutConsent({ serviceType: 'fit', lockingNutStatus: 'has_key' })).toBe(false);
  });

  it('only treats evidence as valid when declaration, signature, PDF, and timestamp exist', () => {
    expect(isValidWheelNutConsent(null)).toBe(false);
    expect(isValidWheelNutConsent({
      declarationAccepted: true,
      signatureUrl: 'https://example.com/signature.png',
      pdfUrl: 'https://example.com/consent.pdf',
      createdAt: new Date('2026-08-04T10:00:00Z'),
    })).toBe(true);
    expect(isValidWheelNutConsent({
      declarationAccepted: true,
      signatureUrl: 'https://example.com/signature.png',
      pdfUrl: '',
      createdAt: new Date('2026-08-04T10:00:00Z'),
    })).toBe(false);
  });

  it('blocks completion until required consent has valid evidence', () => {
    const unsigned = serializeWheelNutConsentStatus(
      { serviceType: 'locking_nut_removal' },
      null,
    );
    expect(unsigned.required).toBe(true);
    expect(unsigned.canComplete).toBe(false);

    const signed = serializeWheelNutConsentStatus(
      { serviceType: 'locking_nut_removal' },
      {
        id: 'consent-1',
        bookingId: 'booking-1',
        bookingRef: 'TYR-2026-0001',
        driverId: 'driver-1',
        driverUserId: 'user-1',
        driverName: 'Driver',
        customerName: 'Customer',
        customerEmail: 'customer@example.com',
        vehicleReg: 'AB12 CDE',
        declarationText: 'Declaration',
        declarationAccepted: true,
        signatureUrl: 'https://example.com/signature.png',
        signatureMimeType: 'image/png',
        signatureFileSize: 1000,
        signaturePointCount: 12,
        signatureSha256: 'a'.repeat(64),
        pdfUrl: 'https://example.com/consent.pdf',
        pdfFileSize: 2000,
        pdfSha256: 'b'.repeat(64),
        gpsLat: null,
        gpsLng: null,
        gpsAccuracy: null,
        deviceId: null,
        deviceLabel: null,
        emailStatus: 'sent',
        emailSentAt: new Date('2026-08-04T10:01:00Z'),
        emailError: null,
        createdAt: new Date('2026-08-04T10:00:00Z'),
      },
    );
    expect(signed.canComplete).toBe(true);
    expect(signed.pdfUrl).toBe('https://example.com/consent.pdf');
  });
});
