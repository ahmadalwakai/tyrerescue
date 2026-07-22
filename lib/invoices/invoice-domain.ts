import type { Invoice } from '@/lib/db';
import type { PaymentSummary } from '@/lib/payments/payment-summary';
import { isPaymentFullySettledForInvoice } from '@/lib/payments/payment-summary';

export class InvoiceDomainError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'InvoiceDomainError';
  }
}

export interface BookingCustomerInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  bookingReference: string;
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
  };
  vehicle: {
    registration: string | null;
    make: string | null;
    model: string | null;
  };
  tyreSizeDisplay: string | null;
  serviceInclusions: string[];
  payment: {
    status: string;
    method: string | null;
    paidPence: number;
    totalPence: number;
  };
  finalTotal: number;
}

export interface StandaloneAdminInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface StandaloneAdminInvoice {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVatNumber?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerAddress: string | null;
  items?: StandaloneAdminInvoiceLineItem[];
  subtotal?: number;
  vatRate?: number;
  vatAmount?: number;
  totalAmount: number;
  notes?: string | null;
  bookingReference?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  tyreSizeDisplay?: string | null;
  paymentStatus?: string | null;
  paymentMethod?: string | null;
}

export interface BookingInvoiceSource {
  id: string;
  refNumber: string;
  status: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  addressLine: string | null;
  totalAmount: string | number;
  createdAt: Date | string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  tyreSizeDisplay?: string | null;
  serviceType?: string | null;
  vatAmount?: string | number | null;
}

const FORBIDDEN_BOOKING_CUSTOMER_INVOICE_KEYS = new Set([
  'adminadjustment',
  'adminadjustmentamount',
  'adminadjustmentreason',
  'adjustment',
  'amountpaid',
  'breakdown',
  'callout',
  'calloutfee',
  'description',
  'emergency',
  'emergencysurcharge',
  'finalpayable',
  'invoiceitems',
  'invoicetotal',
  'items',
  'labour',
  'labourfee',
  'lineitems',
  'pricesnapshot',
  'pricingbreakdown',
  'quantity',
  'subtotal',
  'surcharge',
  'surcharges',
  'tyre',
  'tyrecost',
  'tyreprice',
  'unitprice',
  'vatamount',
  'vatrate',
]);

const ALLOWED_BOOKING_CUSTOMER_INVOICE_KEYS = new Set([
  'invoiceNumber',
  'invoiceDate',
  'bookingReference',
  'company',
  'customer',
  'vehicle',
  'payment',
  'tyreSizeDisplay',
  'serviceInclusions',
  'finalTotal',
]);

function normaliseKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function collectForbiddenKeys(value: unknown, path = ''): string[] {
  if (value == null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectForbiddenKeys(item, `${path}[${index}]`));
  }

  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_BOOKING_CUSTOMER_INVOICE_KEYS.has(normaliseKey(key))) {
      found.push(nextPath);
      continue;
    }
    found.push(...collectForbiddenKeys(child, nextPath));
  }
  return found;
}

function warnForbiddenFields(source: string, fields: string[]): void {
  if (fields.length === 0 || process.env.NODE_ENV === 'production') return;
  console.warn(
    `[invoice-domain] stripped forbidden customer invoice fields from ${source}: ${fields.join(', ')}`,
  );
}

function readRecord(value: unknown, source: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvoiceDomainError(`Invalid customer invoice DTO from ${source}`, 500);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string, source: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw new InvoiceDomainError(`Missing customer invoice field ${field} from ${source}`, 500);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function requiredNumber(value: unknown, field: string, source: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  throw new InvoiceDomainError(`Missing customer invoice field ${field} from ${source}`, 500);
}

function requiredInteger(value: unknown, field: string, source: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return Math.round(n);
  throw new InvoiceDomainError(`Missing customer invoice field ${field} from ${source}`, 500);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? cleanInvoiceText(item) : ''))
    .filter(Boolean);
}

function cleanInvoiceText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasPositiveMoney(value: string | number | null | undefined): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}

function normaliseServiceType(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => value && all.indexOf(value) === index);
}

export function buildBookingServiceInclusions(booking: Pick<
  BookingInvoiceSource,
  'serviceType' | 'vatAmount'
>): string[] {
  const serviceType = normaliseServiceType(booking.serviceType);
  const inclusions: string[] = [];

  if (serviceType === 'fit' || serviceType === 'tyre_replacement' || serviceType === 'replacement') {
    inclusions.push(
      'Mobile tyre fitting service',
      'Removal of the old tyre from the wheel',
      'Professional fitting and balancing (when applicable)',
      'Final safety inspection',
    );
  } else if (serviceType === 'repair' || serviceType === 'puncture_repair') {
    inclusions.push(
      'Mobile tyre repair service',
      'Puncture repair assessment and repair where safe',
      'Final safety inspection',
    );
  } else if (serviceType === 'assess' || serviceType === 'inspection' || serviceType === 'unknown') {
    inclusions.push(
      'Mobile tyre inspection service',
      'Inspection findings confirmed on site',
      'Final safety inspection',
    );
  } else {
    inclusions.push('Mobile tyre service', 'Final safety inspection');
  }

  if (hasPositiveMoney(booking.vatAmount)) {
    inclusions.push('VAT included where applicable');
  }

  return uniqueStrings(inclusions);
}

function toPence(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new InvoiceDomainError('Invalid invoice total amount', 500);
  return Math.round(n * 100);
}

function amountsMatch(aPence: number, bPence: number): boolean {
  return Math.abs(aPence - bPence) <= 1;
}

export function createBookingCustomerInvoice(value: unknown, source = 'unknown'): BookingCustomerInvoice {
  const record = readRecord(value, source);
  const topLevelUnexpected = Object.keys(record).filter((key) => !ALLOWED_BOOKING_CUSTOMER_INVOICE_KEYS.has(key));
  const forbidden = [...topLevelUnexpected, ...collectForbiddenKeys(record)]
    .filter((key, index, all) => all.indexOf(key) === index);
  warnForbiddenFields(source, forbidden);

  const company = readRecord(record.company, `${source}.company`);
  const customer = readRecord(record.customer, `${source}.customer`);
  const vehicle = readRecord(record.vehicle, `${source}.vehicle`);
  const payment = readRecord(record.payment, `${source}.payment`);

  return {
    invoiceNumber: requiredString(record.invoiceNumber, 'invoiceNumber', source),
    invoiceDate: requiredString(record.invoiceDate, 'invoiceDate', source),
    bookingReference: requiredString(record.bookingReference, 'bookingReference', source),
    company: {
      name: requiredString(company.name, 'company.name', source),
      address: requiredString(company.address, 'company.address', source),
      phone: requiredString(company.phone, 'company.phone', source),
      email: requiredString(company.email, 'company.email', source),
    },
    customer: {
      name: requiredString(customer.name, 'customer.name', source),
      email: requiredString(customer.email, 'customer.email', source),
      phone: nullableString(customer.phone),
      address: nullableString(customer.address),
    },
    vehicle: {
      registration: nullableString(vehicle.registration),
      make: nullableString(vehicle.make),
      model: nullableString(vehicle.model),
    },
    tyreSizeDisplay: nullableString(record.tyreSizeDisplay),
    serviceInclusions: stringList(record.serviceInclusions),
    payment: {
      status: requiredString(payment.status, 'payment.status', source),
      method: nullableString(payment.method),
      paidPence: requiredInteger(payment.paidPence, 'payment.paidPence', source),
      totalPence: requiredInteger(payment.totalPence, 'payment.totalPence', source),
    },
    finalTotal: requiredNumber(record.finalTotal, 'finalTotal', source),
  };
}

export function buildBookingCustomerInvoiceFromBooking(input: {
  booking: BookingInvoiceSource;
  paymentSummary: PaymentSummary;
  company: BookingCustomerInvoice['company'];
  invoiceNumber?: string;
  invoiceDate?: Date | string | null;
  source?: string;
  requireFullPayment?: boolean;
}): BookingCustomerInvoice {
  if (input.requireFullPayment !== false) {
    assertBookingInvoicePaymentSettlement({
      booking: input.booking,
      paymentSummary: input.paymentSummary,
    });
  }

  return createBookingCustomerInvoice({
    invoiceNumber: input.invoiceNumber ?? `INV-${input.booking.refNumber}`,
    invoiceDate: new Date(input.invoiceDate ?? input.booking.createdAt ?? new Date()).toISOString(),
    bookingReference: input.booking.refNumber,
    company: input.company,
    customer: {
      name: input.booking.customerName,
      email: input.booking.customerEmail,
      phone: input.booking.customerPhone,
      address: input.booking.addressLine,
    },
    vehicle: {
      registration: input.booking.vehicleReg,
      make: input.booking.vehicleMake,
      model: input.booking.vehicleModel,
    },
    tyreSizeDisplay: input.booking.tyreSizeDisplay ?? null,
    serviceInclusions: buildBookingServiceInclusions(input.booking),
    payment: {
      status: input.paymentSummary.label,
      method: input.paymentSummary.methodLabel,
      paidPence: input.paymentSummary.paidPence ?? 0,
      totalPence: input.paymentSummary.totalPence ?? 0,
    },
    finalTotal: Number(input.booking.totalAmount),
  }, input.source ?? 'booking');
}

export function buildBookingCustomerInvoiceFromStoredInvoice(input: {
  invoice: Pick<Invoice,
    | 'invoiceNumber'
    | 'issueDate'
    | 'totalAmount'
    | 'companyName'
    | 'companyAddress'
    | 'companyPhone'
    | 'companyEmail'
    | 'customerName'
    | 'customerEmail'
    | 'customerPhone'
    | 'customerAddress'
  >;
  booking: BookingInvoiceSource;
  paymentSummary: PaymentSummary;
  source?: string;
  requireFullPayment?: boolean;
}): BookingCustomerInvoice {
  if (input.requireFullPayment === false) {
    assertBookingInvoiceTotalMatches({
      booking: input.booking,
      invoiceTotalAmount: input.invoice.totalAmount.toString(),
    });
  } else {
    assertBookingInvoicePaymentSettlement({
      booking: input.booking,
      paymentSummary: input.paymentSummary,
      invoiceTotalAmount: input.invoice.totalAmount.toString(),
    });
  }

  return createBookingCustomerInvoice({
    invoiceNumber: input.invoice.invoiceNumber,
    invoiceDate: new Date(input.invoice.issueDate ?? input.booking.createdAt ?? new Date()).toISOString(),
    bookingReference: input.booking.refNumber,
    company: {
      name: input.invoice.companyName,
      address: input.invoice.companyAddress,
      phone: input.invoice.companyPhone,
      email: input.invoice.companyEmail,
    },
    customer: {
      name: input.invoice.customerName,
      email: input.invoice.customerEmail,
      phone: input.invoice.customerPhone,
      address: input.invoice.customerAddress,
    },
    vehicle: {
      registration: input.booking.vehicleReg,
      make: input.booking.vehicleMake,
      model: input.booking.vehicleModel,
    },
    tyreSizeDisplay: input.booking.tyreSizeDisplay ?? null,
    serviceInclusions: buildBookingServiceInclusions(input.booking),
    payment: {
      status: input.paymentSummary.label,
      method: input.paymentSummary.methodLabel,
      paidPence: input.paymentSummary.paidPence ?? 0,
      totalPence: input.paymentSummary.totalPence ?? 0,
    },
    finalTotal: Number(input.booking.totalAmount),
  }, input.source ?? 'stored-invoice');
}

export function assertBookingInvoicePaymentSettlement(input: {
  booking: Pick<BookingInvoiceSource, 'refNumber' | 'status' | 'totalAmount'>;
  paymentSummary: PaymentSummary;
  invoiceTotalAmount?: string | number | null;
}): void {
  if (!isPaymentFullySettledForInvoice(input.paymentSummary, input.booking.status)) {
    throw new InvoiceDomainError('Invoice is available after full payment is verified.', 409);
  }

  const bookingTotalPence = toPence(input.booking.totalAmount);
  const paidPence = input.paymentSummary.paidPence ?? 0;
  const summaryTotalPence = input.paymentSummary.totalPence ?? 0;

  if (!amountsMatch(bookingTotalPence, summaryTotalPence) || !amountsMatch(bookingTotalPence, paidPence)) {
    throw new InvoiceDomainError('Payment amount does not match booking final payable amount.', 409);
  }

  if (input.invoiceTotalAmount != null) {
    const invoiceTotalPence = toPence(input.invoiceTotalAmount);
    if (!amountsMatch(bookingTotalPence, invoiceTotalPence)) {
      throw new InvoiceDomainError('Existing invoice total does not match booking final payable amount.', 409);
    }
  }
}

export function assertBookingInvoiceTotalMatches(input: {
  booking: Pick<BookingInvoiceSource, 'refNumber' | 'totalAmount'>;
  invoiceTotalAmount: string | number;
}): void {
  const bookingTotalPence = toPence(input.booking.totalAmount);
  const invoiceTotalPence = toPence(input.invoiceTotalAmount);
  if (!amountsMatch(bookingTotalPence, invoiceTotalPence)) {
    throw new InvoiceDomainError('Existing invoice total does not match booking final payable amount.', 409);
  }
}
