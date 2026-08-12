import { describe, expect, it, vi } from 'vitest';
import { adminNewBooking } from '../email/templates/admin-new-booking';
import { bookingConfirmed } from '../email/templates/booking-confirmed';
import { jobAssigned } from '../email/templates/job-assigned';

vi.mock('@/lib/auth', () => ({
  authMobile: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

const tyreLines = [
  'Front: 225/40R18 92Y XL x1',
  'Rear: 255/35R18 run-flat x2',
];

describe('tyre-line notification rendering', () => {
  it('renders every canonical tyre line in customer and admin booking emails', () => {
    const customer = bookingConfirmed({
      customerName: 'Amina Customer',
      refNumber: 'TYR-2026-0001',
      bookingType: 'emergency',
      serviceType: 'Tyre replacement',
      address: '10 Test Street, Glasgow',
      tyreSummary: '195/55R16',
      quantity: 1,
      tyreLines,
      totalTyreQuantity: 3,
      trackingUrl: 'https://example.test/track',
    }).html;
    const admin = adminNewBooking({
      refNumber: 'TYR-2026-0001',
      bookingType: 'emergency',
      serviceType: 'Tyre replacement',
      customerName: 'Amina Customer',
      customerPhone: '07123456789',
      customerEmail: 'amina@example.com',
      address: '10 Test Street, Glasgow',
      lat: 55.86,
      lng: -4.25,
      tyreSizeDisplay: '195/55R16',
      quantity: 1,
      tyreLines,
      totalTyreQuantity: 3,
      total: 120,
    }, 'https://example.test/admin');

    for (const html of [customer, admin.html]) {
      expect(html).toContain('Front: 225/40R18 92Y XL x1');
      expect(html).toContain('Rear: 255/35R18 run-flat x2');
      expect(html).toContain('Total Quantity');
      expect(html).toContain('>3<');
      expect(html).not.toContain('>195/55R16<');
    }
  });

  it('renders every canonical tyre line in driver assignment emails', () => {
    const html = jobAssigned({
      driverName: 'Driver',
      refNumber: 'TYR-2026-0001',
      customerAddress: '10 Test Street, Glasgow',
      customerLat: 55.86,
      customerLng: -4.25,
      tyreSizeDisplay: '195/55R16',
      quantity: 1,
      tyreLines,
      totalTyreQuantity: 3,
      serviceType: 'Tyre replacement',
      customerPhone: '07123456789',
    }).html;

    expect(html).toContain('Front: 225/40R18 92Y XL x1');
    expect(html).toContain('Rear: 255/35R18 run-flat x2');
    expect(html).toContain('Total Quantity');
    expect(html).toContain('>3<');
    expect(html).not.toContain('>195/55R16<');
  });

  it('renders every structured tyre line in admin quote WhatsApp copy', async () => {
    process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
    const { buildAdminQuoteWhatsAppMessage } = await import('../admin-quotes');
    const message = buildAdminQuoteWhatsAppMessage({
      quoteRef: 'AQ-1',
      priceAmount: 120,
      quantity: 1,
      tyreSize: '195/55R16',
      tyreLines: [
        { axle: 'front', sizeDisplay: '225/40R18', quantity: 1, loadIndex: '92', speedIndex: 'Y', xl: true },
        { axle: 'rear', sizeDisplay: '255/35R18', quantity: 2, runFlat: true },
      ],
      expiresAt: new Date('2026-06-18T10:00:00.000Z'),
    });

    expect(message).toContain('- front: 225/40R18 92Y XL x1');
    expect(message).toContain('- rear: 255/35R18 run-flat x2');
    expect(message).not.toContain('for 1 tyre(s), size 195/55R16');
  });
});
