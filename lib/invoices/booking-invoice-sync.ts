import { Pool, type PoolClient } from '@neondatabase/serverless';
import type { Booking, Invoice, PaymentEvent } from '@/lib/db';
import { buildDriverPaymentSummary } from '@/lib/payments/payment-summary';
import { GARAGE_ADDRESS } from '@/lib/garage';
import { InvoiceDomainError } from './invoice-domain';
import { parseInvoicePresentation, withInvoicePresentation } from './invoice-presentation';

type QueryClient = Pick<PoolClient, 'query'>;
type LegacyReceipt = NonNullable<Parameters<typeof buildDriverPaymentSummary>[2]>[number];
type SyncOptions = { actorUserId?: string | null; reason?: string };
type EditOptions = SyncOptions & { actorUserId: string; expectedUpdatedAt: Date | string | null };
export interface BookingInvoiceSyncResult {
  booking: Booking;
  invoices: Invoice[];
  changed: boolean;
}

const PROTECTED_INVOICE_STATUSES = new Set(['archived', 'cancelled']);
const TERMINAL_BOOKING_STATUSES = new Set(['completed', 'cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending']);
const EDIT_COLUMNS: Record<string, string> = {
  customerName: 'customer_name', customerEmail: 'customer_email', customerPhone: 'customer_phone',
  addressLine: 'address_line', vehicleReg: 'vehicle_reg', vehicleMake: 'vehicle_make', vehicleModel: 'vehicle_model',
  notes: 'notes', lockingNutStatus: 'locking_nut_status', scheduledAt: 'scheduled_at', serviceType: 'service_type',
  bookingType: 'booking_type', tyreSizeDisplay: 'tyre_size_display', quantity: 'quantity', subtotal: 'subtotal',
  vatAmount: 'vat_amount', totalAmount: 'total_amount', priceSnapshot: 'price_snapshot', updatedAt: 'updated_at',
};

function camelRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()), value])) as T;
}

function canonicalMoney(value: unknown): string {
  const amount = Number(value);
  if (value == null || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new InvoiceDomainError('Booking has an invalid final amount.', 409);
  }
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function bookingFinancials(booking: Booking) {
  const totalAmount = canonicalMoney(booking.totalAmount);
  const vatAmount = canonicalMoney(booking.vatAmount ?? 0);
  const totalPence = Math.round(Number(totalAmount) * 100);
  const vatPence = Math.round(Number(vatAmount) * 100);
  if (vatPence > totalPence) throw new InvoiceDomainError('Booking VAT exceeds its final amount.', 409);
  // Preserve coherent booking tax figures. A canonical admin adjustment may
  // make its historical subtotal differ, so use the final net amount while
  // retaining the recorded VAT rather than silently erasing it.
  const recordedSubtotal = canonicalMoney(booking.subtotal ?? totalAmount);
  const subtotal = Math.round(Number(recordedSubtotal) * 100) + vatPence === totalPence
    ? recordedSubtotal : ((totalPence - vatPence) / 100).toFixed(2);
  const vatRate = Number(subtotal) > 0 ? (Number(vatAmount) / Number(subtotal) * 100).toFixed(2) : '0.00';
  return { totalAmount, subtotal, vatAmount, vatRate };
}

async function withInvoiceTransaction<T>(work: (client: QueryClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function lockedBooking(client: QueryClient, id: string): Promise<Booking> {
  const result = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
  if (!result.rows[0]) throw new InvoiceDomainError('Linked booking not found.', 404);
  return camelRow<Booking>(result.rows[0]);
}

async function strictPaid(client: QueryClient, booking: Booking): Promise<boolean> {
  const events = await client.query('SELECT * FROM payment_events WHERE booking_id = $1 ORDER BY created_at', [booking.id]);
  const legacy = await client.query('SELECT * FROM payments WHERE booking_id = $1', [booking.id]);
  const summary = buildDriverPaymentSummary({
    id: booking.id, refNumber: booking.refNumber, status: booking.status, paymentType: booking.paymentType,
    totalAmount: booking.totalAmount, subtotal: booking.subtotal, vatAmount: booking.vatAmount,
    depositAmountPence: booking.depositAmountPence, remainingBalancePence: booking.remainingBalancePence,
    depositPaidAt: booking.depositPaidAt, stripePiId: booking.stripePiId, stripeDepositPiId: booking.stripeDepositPiId,
  }, events.rows.map((row) => camelRow<PaymentEvent>(row)), legacy.rows.map((row) => camelRow<LegacyReceipt>(row)));
  return summary.settlementVerified === true;
}

function synchronizedStatus(invoice: Invoice, paid: boolean): string {
  if (paid) return 'paid';
  if (invoice.status === 'paid') return invoice.sentAt ? 'sent' : 'issued';
  return invoice.status;
}

async function synchronizeLockedBooking(client: QueryClient, booking: Booking, options: SyncOptions): Promise<BookingInvoiceSyncResult> {
  const financials = bookingFinancials(booking);
  const { totalAmount } = financials;
  const rows = await client.query('SELECT * FROM invoices WHERE booking_id = $1 AND deleted_at IS NULL ORDER BY created_at, id FOR UPDATE', [booking.id]);
  const allInvoices = rows.rows.map((row) => camelRow<Invoice>(row));
  const activeInvoices = allInvoices.filter((invoice) => !invoice.archivedAt && !PROTECTED_INVOICE_STATUSES.has(invoice.status));
  if (activeInvoices.length === 0) return { booking, invoices: allInvoices, changed: false };
  const paid = await strictPaid(client, booking);
  const updatedInvoices: Invoice[] = [];
  let changed = false;

  for (const invoice of allInvoices) {
    if (invoice.archivedAt || PROTECTED_INVOICE_STATUSES.has(invoice.status)) {
      updatedInvoices.push(invoice);
      continue;
    }
    const next = {
      customerName: booking.customerName, customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone, customerAddress: booking.addressLine,
      ...financials,
      status: synchronizedStatus(invoice, paid),
    };
    const keys = Object.keys(next) as (keyof typeof next)[];
    const hasChanges = keys.some((key) => (invoice[key] ?? null)?.toString() !== (next[key] ?? null)?.toString());
    if (!hasChanges) { updatedInvoices.push(invoice); continue; }
    const result = await client.query(`UPDATE invoices SET customer_name=$2, customer_email=$3,
      customer_phone=$4, customer_address=$5, subtotal=$10, vat_rate=$11, vat_amount=$12,
      total_amount=$6, status=$7, updated_by=COALESCE($8,updated_by), updated_at=NOW()
      WHERE id=$1 AND booking_id=$9 AND deleted_at IS NULL RETURNING *`,
    [invoice.id, next.customerName, next.customerEmail, next.customerPhone, next.customerAddress,
      totalAmount, next.status, options.actorUserId ?? null, booking.id,
      financials.subtotal, financials.vatRate, financials.vatAmount]);
    const updated = camelRow<Invoice>(result.rows[0]);
    await client.query(`INSERT INTO audit_logs (actor_user_id,actor_role,entity_type,entity_id,action,before_json,after_json)
      VALUES ($1,$2,'invoice',$3,'sync_booking_invoice',$4::jsonb,$5::jsonb)`,
    [options.actorUserId ?? null, options.actorUserId ? 'admin' : 'system', invoice.id,
      JSON.stringify(Object.fromEntries(keys.map((key) => [key, invoice[key]]))),
      JSON.stringify({ ...next, bookingRef: booking.refNumber, reason: options.reason ?? 'booking_sync' })]);
    updatedInvoices.push(updated);
    changed = true;
  }
  return { booking, invoices: updatedInvoices, changed };
}

export async function synchronizeBookingInvoices(bookingId: string, options: SyncOptions = {}): Promise<BookingInvoiceSyncResult> {
  return withInvoiceTransaction(async (client) => synchronizeLockedBooking(client, await lockedBooking(client, bookingId), options));
}

export async function synchronizeLinkedInvoice(invoice: Invoice, options: SyncOptions = {}): Promise<Invoice> {
  if (!invoice.bookingId || invoice.deletedAt || invoice.archivedAt || PROTECTED_INVOICE_STATUSES.has(invoice.status)) return invoice;
  const synced = await synchronizeBookingInvoices(invoice.bookingId, options);
  const latest = synced.invoices.find((item) => item.id === invoice.id);
  if (!latest) throw new InvoiceDomainError('Invoice is no longer available.', 409);
  return latest;
}

export async function getLinkedInvoiceContext(invoice: Invoice, options: SyncOptions = {}): Promise<{ invoice: Invoice; booking: Booking | null }> {
  if (!invoice.bookingId) return { invoice, booking: null };
  return withInvoiceTransaction(async (client) => {
    const booking = await lockedBooking(client, invoice.bookingId!);
    if (invoice.deletedAt || invoice.archivedAt || PROTECTED_INVOICE_STATUSES.has(invoice.status)) return { invoice, booking };
    const result = await synchronizeLockedBooking(client, booking, options);
    const current = result.invoices.find((item) => item.id === invoice.id);
    if (!current) throw new InvoiceDomainError('Invoice is no longer available.', 409);
    return { invoice: current, booking };
  });
}

/** Refresh after a successful send so a concurrent payment cannot be erased. */
export async function recordLinkedInvoiceSent(invoice: Invoice, actorUserId: string): Promise<Invoice> {
  if (!invoice.bookingId) throw new InvoiceDomainError('Invoice is not linked to a booking.', 400);
  return withInvoiceTransaction(async (client) => {
    const booking = await lockedBooking(client, invoice.bookingId!);
    const synced = await synchronizeLockedBooking(client, booking, { actorUserId, reason: 'invoice_sent' });
    const current = synced.invoices.find((item) => item.id === invoice.id);
    if (!current || current.archivedAt || PROTECTED_INVOICE_STATUSES.has(current.status)) throw new InvoiceDomainError('Invoice is no longer available for sending.', 409);
    const result = await client.query(`UPDATE invoices SET status=CASE WHEN status IN ('draft','issued') THEN 'sent' ELSE status END,
      sent_at=NOW(),updated_by=$2,updated_at=NOW() WHERE id=$1 AND booking_id=$3 AND deleted_at IS NULL RETURNING *`,
    [current.id, actorUserId, booking.id]);
    return camelRow<Invoice>(result.rows[0]);
  });
}

function assertBookingEditVersion(booking: Booking, expectedUpdatedAt: Date | string | null): void {
  const expected = expectedUpdatedAt == null ? null : new Date(expectedUpdatedAt).getTime();
  const actual = booking.updatedAt == null ? null : new Date(booking.updatedAt).getTime();
  if (expected !== actual) throw new InvoiceDomainError('Booking changed. Refresh it before saving.', 409);
  if (TERMINAL_BOOKING_STATUSES.has(booking.status)) throw new InvoiceDomainError(`Cannot edit booking in ${booking.status} status`, 400);
}

export async function applyBookingEditAndSyncInvoices(bookingId: string, updates: Record<string, unknown>, options: EditOptions): Promise<BookingInvoiceSyncResult> {
  return withInvoiceTransaction(async (client) => {
    const booking = await lockedBooking(client, bookingId);
    assertBookingEditVersion(booking, options.expectedUpdatedAt);
    const fields = Object.keys(updates).filter((field) => field !== 'updatedAt');
    if (fields.length === 0 || fields.some((field) => !EDIT_COLUMNS[field])) throw new InvoiceDomainError('Invalid booking edit fields.', 400);
    const values = fields.map((field) => field === 'priceSnapshot' ? JSON.stringify(updates[field]) : updates[field]);
    const assignments = fields.map((field, index) => `${EDIT_COLUMNS[field]}=$${index + 2}${field === 'priceSnapshot' ? '::jsonb' : ''}`);
    const result = await client.query(`UPDATE bookings SET ${assignments.join(',')}, updated_at=NOW() WHERE id=$1 RETURNING *`, [bookingId, ...values]);
    const updated = camelRow<Booking>(result.rows[0]);
    const synced = await synchronizeLockedBooking(client, updated, options);
    await client.query(`INSERT INTO audit_logs (actor_user_id,actor_role,entity_type,entity_id,action,before_json,after_json)
      VALUES ($1,'admin','booking',$2,'edit_booking_and_sync_invoices',$3::jsonb,$4::jsonb)`,
    [options.actorUserId, bookingId, JSON.stringify(Object.fromEntries(fields.map((field) => [field, booking[field as keyof Booking]]))),
      JSON.stringify({ ...Object.fromEntries(fields.map((field) => [field, updated[field as keyof Booking]])),
        synchronizedInvoiceIds: synced.invoices.filter((invoice) => !invoice.archivedAt && !PROTECTED_INVOICE_STATUSES.has(invoice.status)).map((invoice) => invoice.id) })]);
    return synced;
  });
}

export async function updateBookingInvoicePresentation(bookingRef: string, raw: unknown, options: EditOptions): Promise<BookingInvoiceSyncResult> {
  return withInvoiceTransaction(async (client) => {
    const found = await client.query('SELECT * FROM bookings WHERE ref_number=$1 FOR UPDATE', [bookingRef.trim().toUpperCase()]);
    if (!found.rows[0]) throw new InvoiceDomainError('Booking not found.', 404);
    const booking = camelRow<Booking>(found.rows[0]);
    // Presentation is optional document content, and can be reviewed after a
    // completed job. It cannot change a booking's price, stock or paid status.
    const expected = options.expectedUpdatedAt == null ? null : new Date(options.expectedUpdatedAt).getTime();
    const actual = booking.updatedAt == null ? null : new Date(booking.updatedAt).getTime();
    if (expected !== actual) throw new InvoiceDomainError('Booking changed. Refresh it before saving.', 409);
    const presentation = parseInvoicePresentation(raw, Math.round(Number(canonicalMoney(booking.totalAmount)) * 100));
    const snapshot = withInvoicePresentation(booking.priceSnapshot, presentation);
    const result = await client.query('UPDATE bookings SET price_snapshot=$2::jsonb, updated_at=NOW() WHERE id=$1 RETURNING *', [booking.id, JSON.stringify(snapshot)]);
    const updated = camelRow<Booking>(result.rows[0]);
    const synced = await synchronizeLockedBooking(client, updated, { ...options, reason: 'invoice_presentation_updated' });
    await client.query(`INSERT INTO audit_logs (actor_user_id,actor_role,entity_type,entity_id,action,before_json,after_json)
      VALUES ($1,'admin','booking',$2,'update_invoice_presentation',$3::jsonb,$4::jsonb)`,
    [options.actorUserId, booking.id, JSON.stringify({ customerInvoice: (booking.priceSnapshot as Record<string, unknown> | null)?.customerInvoice ?? null }),
      JSON.stringify({ customerInvoice: presentation })]);
    return synced;
  });
}

export async function ensureBookingInvoice(bookingRef: string, options: SyncOptions & { actorUserId: string }): Promise<{ booking: Booking; invoice: Invoice; reused: boolean }> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await ensureBookingInvoiceOnce(bookingRef, options); }
    catch (error) {
      // Legacy standalone creators do not take the allocation lock. If one
      // wins the number concurrently, roll back and allocate from the new max.
      if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== '23505') throw error;
    }
  }
}

async function ensureBookingInvoiceOnce(bookingRef: string, options: SyncOptions & { actorUserId: string }): Promise<{ booking: Booking; invoice: Invoice; reused: boolean }> {
  return withInvoiceTransaction(async (client) => {
    const found = await client.query('SELECT * FROM bookings WHERE ref_number=$1 FOR UPDATE', [bookingRef.trim().toUpperCase()]);
    if (!found.rows[0]) throw new InvoiceDomainError('Booking not found.', 404);
    const booking = camelRow<Booking>(found.rows[0]);
    const synced = await synchronizeLockedBooking(client, booking, options);
    const existing = synced.invoices.filter((invoice) => !invoice.archivedAt && !PROTECTED_INVOICE_STATUSES.has(invoice.status)).at(-1);
    if (existing) return { booking, invoice: existing, reused: true };
    const financials = bookingFinancials(booking);
    const { totalAmount } = financials;
    const paid = await strictPaid(client, booking);
    const prefix = `INV-${new Date().getFullYear()}-`;
    // One numbering lock across bookings, alongside each booking lock. Use the
    // greatest allocated suffix, so archived/deleted/gapped numbers stay used.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['booking-invoice-number-allocation']);
    const allocated = await client.query(`SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM $2)::bigint),0) AS last_number
      FROM invoices WHERE invoice_number LIKE $1 AND invoice_number ~ $2`, [`${prefix}%`, `^${prefix}([0-9]+)$`]);
    const invoiceNumber = `${prefix}${String(Number(allocated.rows[0]?.last_number ?? 0) + 1).padStart(4, '0')}`;
    const result = await client.query(`INSERT INTO invoices
      (invoice_number,booking_id,user_id,status,customer_name,customer_email,customer_phone,customer_address,
       company_name,company_address,company_phone,company_email,issue_date,due_date,subtotal,vat_rate,vat_amount,
       total_amount,notes,internal_notes,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Tyre Rescue',$9,'01932 509613','support@tyrerescue.uk',NOW(),NOW(),$13,$14,$15,$10,NULL,$11,$12,$12)
      RETURNING *`, [invoiceNumber, booking.id, booking.userId, paid ? 'paid' : 'issued', booking.customerName,
      booking.customerEmail, booking.customerPhone, booking.addressLine, GARAGE_ADDRESS, totalAmount,
      `Generated from booking ${booking.refNumber} final payable amount.`, options.actorUserId,
      financials.subtotal, financials.vatRate, financials.vatAmount]);
    const invoice = camelRow<Invoice>(result.rows[0]);
    await client.query(`INSERT INTO audit_logs (actor_user_id,actor_role,entity_type,entity_id,action,after_json)
      VALUES ($1,'admin','invoice',$2,'create_booking_invoice_mobile',$3::jsonb)`,
    [options.actorUserId, invoice.id, JSON.stringify({ bookingRef: booking.refNumber, invoiceNumber, totalAmount })]);
    return { booking, invoice, reused: false };
  });
}
