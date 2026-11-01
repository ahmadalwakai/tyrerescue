export type CustomerVerification = 'all' | 'verified' | 'unverified';
export type CustomerStatus = 'active' | 'suspended';
export type CustomerStatusFilter = 'all' | CustomerStatus;

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  status: CustomerStatus;
  suspendedAt: string | null;
  suspensionReason: string | null;
  sessionVersion: number;
  pendingEmail: string | null;
  pendingEmailExpiresAt: string | null;
}

export interface AdminCustomerRow extends Omit<AdminCustomer, 'updatedAt'> {
  bookingCount: number;
  lastBookingAt: string | null;
}

export interface AdminCustomerList {
  customers: AdminCustomerRow[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AdminCustomerDetail {
  customer: AdminCustomer;
  bookings: {
    id: string;
    refNumber: string;
    status: string;
    serviceType: string;
    bookingType: string;
    totalAmount: string;
    scheduledAt: string | null;
    createdAt: string | null;
  }[];
  stats: { totalBookings: number };
}

export interface AdminCustomerUpdate {
  name: string;
  phone: string | null;
  expectedUpdatedAt: string | null;
}

export type CustomerLifecycleAction =
  | { action: 'suspend'; reason: string; expectedUpdatedAt: string | null }
  | { action: 'reactivate' | 'revoke_sessions'; expectedUpdatedAt: string | null }
  | { action: 'delete'; confirmation: 'DELETE'; expectedUpdatedAt: string | null };

export type CustomerAccountAction = CustomerLifecycleAction
  | { action: 'email_change'; email: string; expectedUpdatedAt: string | null }
  | { action: 'password_reset'; expectedUpdatedAt: string | null };

export interface CustomerActionResult {
  success: true;
  action: CustomerAccountAction['action'];
  customer: AdminCustomer | null;
  deleted: boolean;
  message: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Customer information could not be read. Please retry.');
  return value as Record<string, unknown>;
}

function date(value: unknown): boolean {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function customer(value: unknown, withUpdatedAt: boolean): boolean {
  const row = record(value);
  return typeof row.id === 'string' && row.id.length > 0 && typeof row.name === 'string'
    && typeof row.email === 'string' && (row.phone === null || typeof row.phone === 'string')
    && typeof row.emailVerified === 'boolean' && date(row.createdAt)
    && (row.status === 'active' || row.status === 'suspended') && date(row.suspendedAt)
    && (row.suspensionReason === null || typeof row.suspensionReason === 'string') && count(row.sessionVersion)
    && (row.pendingEmail === null || typeof row.pendingEmail === 'string') && date(row.pendingEmailExpiresAt)
    && (!withUpdatedAt || date(row.updatedAt));
}

function count(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseAdminCustomerList(value: unknown): AdminCustomerList {
  const body = record(value);
  if (!Array.isArray(body.customers) || !count(body.total) || !count(body.page) || (body.page as number) < 1
    || !count(body.perPage) || (body.perPage as number) < 1 || (body.perPage as number) > 100
    || !count(body.totalPages) || (body.totalPages as number) < 1
    || body.customers.length > (body.perPage as number)
    || body.customers.some((value) => {
      const row = record(value);
      return !customer(row, false) || !count(row.bookingCount) || !date(row.lastBookingAt);
    })) throw new Error('Customer list could not be read. Please retry.');
  return body as unknown as AdminCustomerList;
}

export function parseAdminCustomer(value: unknown): AdminCustomer {
  if (!customer(value, true)) throw new Error('Customer information could not be read. Please retry.');
  return value as AdminCustomer;
}

export function parseCustomerActionResult(value: unknown, action: CustomerLifecycleAction['action'], customerId: string): CustomerActionResult {
  const body = record(value);
  if (body.success !== true || body.action !== action || typeof body.message !== 'string' || !body.message.trim()
    || body.deleted !== (action === 'delete') || (action === 'delete' && body.customer !== null)) {
    throw new Error('The account action could not be confirmed. Reload this customer before trying again.');
  }
  if (action !== 'delete' && parseAdminCustomer(body.customer).id !== customerId) {
    throw new Error('The account action response did not match this customer. Reload their details.');
  }
  return body as unknown as CustomerActionResult;
}

export function parseCustomerMailResult(value: unknown, action: 'email_change' | 'password_reset', customerId: string): CustomerActionResult {
  const body = record(value);
  if (body.success !== true || typeof body.message !== 'string' || !body.message.trim()) {
    throw new Error('The email request could not be confirmed. Reload this customer before trying again.');
  }
  const updated = action === 'email_change' ? parseAdminCustomer(body.customer) : null;
  if (updated && updated.id !== customerId) throw new Error('The email response did not match this customer. Reload their details.');
  return { success: true, action, customer: updated, deleted: false, message: body.message };
}

export function parseAdminCustomerDetail(value: unknown): AdminCustomerDetail {
  const body = record(value);
  parseAdminCustomer(body.customer);
  const stats = record(body.stats);
  if (!count(stats.totalBookings) || !Array.isArray(body.bookings) || body.bookings.length > 20
    || body.bookings.some((value) => {
      const row = record(value);
      return ['id', 'refNumber', 'status', 'serviceType', 'bookingType', 'totalAmount'].some((key) => typeof row[key] !== 'string')
        || !Number.isFinite(Number(row.totalAmount)) || !date(row.createdAt) || !date(row.scheduledAt);
    })) throw new Error('Customer booking history could not be read. Please retry.');
  return body as unknown as AdminCustomerDetail;
}
