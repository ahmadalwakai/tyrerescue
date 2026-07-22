import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type InvoiceDomainModule = typeof import('../invoices/invoice-domain');
type InvoicePdfModule = typeof import('../invoice-pdf');
type BookingCustomerInvoice = import('../invoices/invoice-domain').BookingCustomerInvoice;
type BookingInvoiceSource = import('../invoices/invoice-domain').BookingInvoiceSource;
type StandaloneAdminInvoice = import('../invoices/invoice-domain').StandaloneAdminInvoice;
type PaymentSummary = import('../payments/payment-summary').PaymentSummary;

let invoiceDomain: InvoiceDomainModule;
let invoicePdf: InvoicePdfModule;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgresql://user:password@localhost:5432/test';
  invoiceDomain = await import('../invoices/invoice-domain');
  invoicePdf = await import('../invoice-pdf');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const company = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};
const quickAccessQrPath = path.resolve(__dirname, '../../public/images/invoices/customer-quick-access-qr.jpeg');
const quickAccessQrSha256 = '474C548471AF26FEA0661AEE5484A1AE0B6B23DD9FDA4FBAC3F4D2BCC5C1E36E';

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex').toUpperCase();
}

function customerInvoice(overrides: Partial<BookingCustomerInvoice> = {}): BookingCustomerInvoice {
  return {
    invoiceNumber: 'INV-TYR-2026-0001',
    invoiceDate: '2026-06-18T10:00:00.000Z',
    bookingReference: 'TYR-2026-0001',
    company,
    customer: {
      name: 'Amina Customer',
      email: 'amina@example.com',
      phone: '07123456789',
      address: '10 Test Street, Edinburgh',
    },
    vehicle: {
      registration: 'AB12 CDE',
      make: 'Ford',
      model: 'Focus',
    },
    tyreSizeDisplay: '205/55R17',
    serviceInclusions: [
      'Mobile tyre fitting service',
      'Removal of the old tyre from the wheel',
      'Professional fitting and balancing (when applicable)',
      'Final safety inspection',
    ],
    payment: {
      status: 'Paid',
      method: 'Payment link',
      paidPence: 12000,
      totalPence: 12000,
    },
    finalTotal: 120,
    ...overrides,
  };
}

const paidSummary: PaymentSummary = {
  state: 'paid',
  label: 'Paid',
  instruction: 'No payment to collect.',
  tone: 'success',
  method: 'card_link',
  methodLabel: 'Payment link',
  linkStatus: 'paid',
  paidVia: 'payment_link',
  totalPence: 12000,
  paidPence: 12000,
  depositAmountPence: null,
  depositPaidPence: null,
  remainingBalancePence: null,
  amountToCollectPence: 0,
  paymentUpdatedAt: '2026-06-18T10:00:00.000Z',
  depositPaidAt: null,
  linkSentAt: null,
  linkOpenedAt: null,
  linkExpiresAt: null,
  reason: 'paid_amount_covers_total',
};

const booking: BookingInvoiceSource = {
  id: 'booking-1',
  refNumber: 'TYR-2026-0001',
  status: 'paid',
  customerName: 'Amina Customer',
  customerEmail: 'amina@example.com',
  customerPhone: '07123456789',
  addressLine: '10 Test Street, Edinburgh',
  totalAmount: '120.00',
  createdAt: new Date('2026-06-18T10:00:00.000Z'),
  vehicleReg: 'AB12 CDE',
  vehicleMake: 'Ford',
  vehicleModel: 'Focus',
  tyreSizeDisplay: '205/55R17',
  serviceType: 'fit',
  vatAmount: '0.00',
};

function standaloneInvoice(overrides: Partial<StandaloneAdminInvoice> = {}): StandaloneAdminInvoice {
  return {
    invoiceNumber: 'INV-ADMIN-0001',
    issueDate: '2026-06-18T10:00:00.000Z',
    dueDate: '2026-06-18T10:00:00.000Z',
    status: 'draft',
    companyName: company.name,
    companyAddress: company.address,
    companyPhone: company.phone,
    companyEmail: company.email,
    customerName: 'Standalone Customer',
    customerEmail: 'standalone@example.com',
    customerPhone: null,
    customerAddress: null,
    items: [
      {
        description: 'Emergency Call-out',
        quantity: 1,
        unitPrice: 40,
        totalPrice: 40,
      },
      {
        description: 'Labour',
        quantity: 1,
        unitPrice: 80,
        totalPrice: 80,
      },
    ],
    subtotal: 120,
    vatRate: 0,
    vatAmount: 0,
    totalAmount: 120,
    notes: 'Admin-only standalone invoice',
    ...overrides,
  };
}

describe('BookingCustomerInvoice domain boundary', () => {
  it('strips line items and internal pricing fields from customer invoice DTOs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invoice = invoiceDomain.createBookingCustomerInvoice({
      ...customerInvoice(),
      lineItems: [{ description: 'Emergency Call-out', quantity: 1, unitPrice: 40 }],
      items: [{ description: 'Labour', quantity: 1, unitPrice: 80 }],
      pricingBreakdown: { tyrePrice: 80, labour: 40 },
      adminAdjustment: -10,
      finalPayable: 999,
      amountPaid: 999,
    }, 'customer-boundary-test');

    expect(invoice.finalTotal).toBe(120);
    expect(invoice).not.toHaveProperty('lineItems');
    expect(invoice).not.toHaveProperty('items');
    expect(invoice).not.toHaveProperty('pricingBreakdown');
    expect(invoice).not.toHaveProperty('adminAdjustment');
    expect(invoice.tyreSizeDisplay).toBe('205/55R17');
    expect(JSON.stringify(invoice)).not.toContain('Emergency Call-out');
    expect(JSON.stringify(invoice)).not.toContain('Labour');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lineItems'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pricingBreakdown'));
  });

  it('builds customer PDF text with only one financial amount: the final total', () => {
    const text = invoicePdf.buildBookingCustomerInvoicePdfText(customerInvoice()).join('\n');

    expect(text.match(/£\d+\.\d{2}/g)).toEqual(['£120.00']);
    expect(text).not.toContain('Admin Adjustment');
    expect(text).not.toContain('Tyre Price');
    expect(text).not.toContain('Emergency Call-out');
    expect(text).not.toContain('Call-out Fee');
    expect(text).not.toContain('Labour');
    expect(text).not.toContain('Weather Surcharge');
    expect(text).not.toContain('Traffic Surcharge');
    expect(text).not.toContain('Weekend Charge');
    expect(text).not.toContain('Same Day Charge');
    expect(text).not.toContain('Internal Pricing Breakdown');
    expect(text).toContain('Tyre Size');
    expect(text).toContain('205/55R17');
    expect(text).toContain('Included in Your Service');
    expect(text).toContain('Mobile tyre fitting service');
    expect(text.indexOf('Included in Your Service')).toBeLessThan(text.indexOf('TOTAL DUE'));
    expect(text).not.toContain('Disposal');
  });

  it('uses the new premium customer invoice language without copying reference data', () => {
    const invoice = customerInvoice({
      invoiceNumber: 'INV-TYR-DYNAMIC-42',
      bookingReference: 'TYR-DYNAMIC-42',
      customer: {
        name: 'Dynamic Customer',
        email: 'dynamic.customer@example.com',
        phone: '07900000000',
        address: '22 Live Booking Road, Glasgow',
      },
      finalTotal: 142.35,
    });
    const text = invoicePdf.buildBookingCustomerInvoicePdfText(invoice).join('\n');
    const rendererSource = readFileSync(path.resolve(__dirname, '../invoice-pdf.ts'), 'utf8');

    expect(text).toContain('COMPANY DETAILS');
    expect(text).toContain('BOOKING DETAILS');
    expect(text).toContain('Included in Your Service');
    expect(text).toContain('Final safety inspection');
    expect(text).toContain('TOTAL DUE');
    expect(text).toContain('THANK YOU');
    expect(text).toContain('QUICK ACCESS');
    expect(text).toContain('Scan to make a new booking, track your booking or contact us.');
    expect(text).toContain('INV-TYR-DYNAMIC-42');
    expect(text).toContain('TYR-DYNAMIC-42');
    expect(text).toContain('Dynamic Customer');
    expect(text.match(/£\d+\.\d{2}/g)).toEqual(['£142.35']);

    for (const copiedReferenceValue of ['INV-2026-0317', 'TYR-2026-56535', 'G44 5RF', '£95.24']) {
      expect(text).not.toContain(copiedReferenceValue);
      expect(rendererSource).not.toContain(copiedReferenceValue);
    }
    expect(rendererSource).not.toContain("page.drawText('FINAL AGREED CUSTOMER TOTAL'");
    expect(rendererSource).toContain("page.drawText('FINAL AGREED'");
    expect(rendererSource).toContain("page.drawText('CUSTOMER TOTAL'");
  });

  it('generates accurate service inclusions from existing booking fields only', () => {
    expect(invoiceDomain.buildBookingServiceInclusions({ serviceType: 'fit', vatAmount: '0.00' })).toEqual([
      'Mobile tyre fitting service',
      'Removal of the old tyre from the wheel',
      'Professional fitting and balancing (when applicable)',
      'Final safety inspection',
    ]);

    expect(invoiceDomain.buildBookingServiceInclusions({ serviceType: 'repair', vatAmount: '0.00' })).toEqual([
      'Mobile tyre repair service',
      'Puncture repair assessment and repair where safe',
      'Final safety inspection',
    ]);

    expect(invoiceDomain.buildBookingServiceInclusions({ serviceType: 'assess', vatAmount: '0.00' })).toEqual([
      'Mobile tyre inspection service',
      'Inspection findings confirmed on site',
      'Final safety inspection',
    ]);
  });

  it('does not claim disposal or VAT unless existing booking data supports it', () => {
    const repairInclusions = invoiceDomain.buildBookingServiceInclusions({
      serviceType: 'repair',
      vatAmount: '0.00',
    });
    const vatInclusions = invoiceDomain.buildBookingServiceInclusions({
      serviceType: 'fit',
      vatAmount: '12.34',
    });

    expect(repairInclusions.join('\n')).not.toContain('Disposal');
    expect(repairInclusions.join('\n')).not.toContain('recycling');
    expect(repairInclusions.join('\n')).not.toContain('VAT included');
    expect(vatInclusions).toContain('VAT included where applicable');
  });

  it('ships the exact official customer quick access QR asset', () => {
    expect(sha256(quickAccessQrPath)).toBe(quickAccessQrSha256);
  });

  it('keeps standalone admin invoices able to retain line items', () => {
    const invoice = standaloneInvoice();
    const text = invoicePdf.buildStandaloneAdminInvoicePdfText(invoice).join('\n');

    expect(invoice.items).toHaveLength(2);
    expect(invoice.items?.[0]).toMatchObject({
      description: 'Emergency Call-out',
      quantity: 1,
      unitPrice: 40,
      totalPrice: 40,
    });
    expect(text.match(/£\d+\.\d{2}/g)).toEqual(['£120.00']);
    expect(text).not.toContain('Included in Your Service');
  });

  it('rejects accidental interchange of admin invoice data into the customer renderer', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      invoicePdf.buildBookingCustomerInvoicePdfText(standaloneInvoice() as unknown as BookingCustomerInvoice),
    ).toThrow(invoiceDomain.InvoiceDomainError);
  });

  it('uses the stored final payable total and verified paid amount for booking invoices', () => {
    const invoice = invoiceDomain.buildBookingCustomerInvoiceFromStoredInvoice({
      invoice: {
        invoiceNumber: 'INV-TYR-2026-0001',
        issueDate: new Date('2026-06-18T10:00:00.000Z'),
        totalAmount: '120.00',
        companyName: company.name,
        companyAddress: company.address,
        companyPhone: company.phone,
        companyEmail: company.email,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        customerAddress: booking.addressLine,
      },
      booking,
      paymentSummary: paidSummary,
      source: 'stored-invoice-test',
    });

    expect(invoice.finalTotal).toBe(120);
    expect(invoice.payment.totalPence).toBe(12000);
    expect(invoice.payment.paidPence).toBe(12000);
    expect(invoicePdf.buildBookingCustomerInvoicePdfText(invoice).join('\n').match(/£\d+\.\d{2}/g)).toEqual(['£120.00']);
  });

  it('blocks invoice output when stored invoice total does not match booking final payable', () => {
    expect(() =>
      invoiceDomain.buildBookingCustomerInvoiceFromStoredInvoice({
        invoice: {
          invoiceNumber: 'INV-TYR-2026-0001',
          issueDate: new Date('2026-06-18T10:00:00.000Z'),
          totalAmount: '119.98',
          companyName: company.name,
          companyAddress: company.address,
          companyPhone: company.phone,
          companyEmail: company.email,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone,
          customerAddress: booking.addressLine,
        },
        booking,
        paymentSummary: paidSummary,
        source: 'stored-invoice-mismatch-test',
      }),
    ).toThrow('Existing invoice total does not match booking final payable amount.');
  });

  it('allows admin booking invoice output before full payment while preserving the stored final total', () => {
    const pendingSummary: PaymentSummary = {
      ...paidSummary,
      state: 'cash_to_collect',
      label: 'Cash to collect',
      method: 'cash',
      methodLabel: 'Cash',
      linkStatus: 'not_sent',
      paidVia: null,
      paidPence: null,
      amountToCollectPence: 12000,
      reason: 'cash_unpaid',
    };
    const invoice = invoiceDomain.buildBookingCustomerInvoiceFromStoredInvoice({
      invoice: {
        invoiceNumber: 'INV-TYR-2026-CASH',
        issueDate: new Date('2026-06-18T10:00:00.000Z'),
        totalAmount: '120.00',
        companyName: company.name,
        companyAddress: company.address,
        companyPhone: company.phone,
        companyEmail: company.email,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        customerAddress: booking.addressLine,
      },
      booking: { ...booking, status: 'awaiting_payment' },
      paymentSummary: pendingSummary,
      source: 'admin-unpaid-invoice-test',
      requireFullPayment: false,
    });

    expect(invoice.finalTotal).toBe(120);
    expect(invoice.payment.status).toBe('Cash to collect');
    expect(invoicePdf.buildBookingCustomerInvoicePdfText(invoice).join('\n').match(/£\d+\.\d{2}/g)).toEqual(['£120.00']);
  });

  it('blocks customer invoice output for partial or deposit-only payment states', () => {
    const partialSummary = {
      ...paidSummary,
      paidPence: 6000,
      amountToCollectPence: 6000,
    };
    const depositOnlySummary = {
      ...paidSummary,
      state: 'balance_due' as const,
      paidPence: 2400,
      depositPaidPence: 2400,
      depositAmountPence: 2400,
      remainingBalancePence: 9600,
      amountToCollectPence: 9600,
      method: 'deposit_link' as const,
      methodLabel: 'Deposit link',
      reason: 'deposit_paid_balance_due' as const,
    };

    expect(() =>
      invoiceDomain.assertBookingInvoicePaymentSettlement({
        booking,
        paymentSummary: partialSummary,
      }),
    ).toThrow(invoiceDomain.InvoiceDomainError);
    expect(() =>
      invoiceDomain.assertBookingInvoicePaymentSettlement({
        booking,
        paymentSummary: depositOnlySummary,
      }),
    ).toThrow(invoiceDomain.InvoiceDomainError);
  });

  it('renders the customer PDF from the booking-only DTO', async () => {
    const bytes = await invoicePdf.generateBookingCustomerInvoicePdf(customerInvoice());

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
