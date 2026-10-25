// Disposable PostgreSQL only: no environment files, network, or live records.
// Advisory locks are intercepted because a single PGlite connection cannot
// establish production, multi-connection lock contention correctness.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect, getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({
  query: null as unknown as (text: string, values?: unknown[]) => Promise<{
    rows: Record<string, unknown>[]; rowCount: number;
  }>,
  queries: [] as string[],
  failAudit: false,
  numberCollisions: 0,
  sendEmail: vi.fn(() => { throw new Error('Invoice synchronization must not send email'); }),
}));
vi.mock('@neondatabase/serverless', () => ({
  Pool: class {
    async connect() { return { query: state.query, release() {} }; }
    async query(text: string, values?: unknown[]) { return state.query(text, values); }
    async end() {}
  },
}));
vi.mock('@/lib/db', async () => ({
  ...await import('../db/schema'),
  db: new Proxy({}, { get() { throw new Error('Unexpected non-transactional database read'); } }),
}));
vi.mock('@/lib/email/resend', () => ({ sendEmail: state.sendEmail }));

import {
  applyBookingEditAndSyncInvoices,
  ensureBookingInvoice,
  getLinkedInvoiceContext,
  recordLinkedInvoiceSent,
  synchronizeBookingInvoices,
  synchronizeLinkedInvoice,
  updateBookingInvoicePresentation,
} from '../invoices/booking-invoice-sync';

const pg = new PGlite();
const actor = '10000000-0000-4000-8000-000000000001';
const bookingId = '20000000-0000-4000-8000-000000000002';
const invoiceId = '30000000-0000-4000-8000-000000000003';
const otherBookingId = '40000000-0000-4000-8000-000000000004';
const updatedAt = new Date('2026-10-22T10:00:00.000Z');
const issueDate = new Date('2026-10-01T09:00:00.000Z');
const sentAt = new Date('2026-10-02T09:00:00.000Z');
const ref = 'TYR-SYNTHETIC-1';
const options = { actorUserId: actor, reason: 'isolated_regression' };

function snake(value: string) { return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`); }
function camel(value: string) { return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()); }
function camelRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camel(key), value]));
}
async function insert(table: string, values: Record<string, unknown>) {
  const entries = Object.entries(values);
  await pg.query(`INSERT INTO "${table}" (${entries.map(([key]) => `"${snake(key)}"`).join(',')})
    VALUES (${entries.map((_, index) => `$${index + 1}`).join(',')})`, entries.map(([, value]) => value));
}
async function seedBooking(overrides: Record<string, unknown> = {}) {
  await insert('bookings', {
    id: bookingId, refNumber: ref, status: 'confirmed', bookingType: 'scheduled', serviceType: 'fit',
    addressLine: '1 Synthetic Street, Glasgow', lat: '55.860000', lng: '-4.250000', quantity: 1,
    customerName: 'Current Customer', customerEmail: 'current@isolated.invalid', customerPhone: '07000000000',
    priceSnapshot: {}, subtotal: '120.00', vatAmount: '0.00', totalAmount: '120.00', paymentType: 'cash',
    vehicleReg: 'AB12CDE', vehicleMake: 'Ford', vehicleModel: 'Focus', tyreSizeDisplay: '205/55R16',
    createdAt: issueDate, updatedAt, ...overrides,
  });
}
async function seedInvoice(overrides: Record<string, unknown> = {}) {
  await insert('invoices', {
    id: invoiceId, invoiceNumber: 'INV-2026-0007', bookingId, status: 'issued',
    customerName: 'Old Customer', customerEmail: 'old@isolated.invalid', customerPhone: '07111111111',
    customerAddress: 'Old synthetic address', companyName: 'Tyre Rescue', companyAddress: 'Fixture garage',
    companyPhone: '01410000000', companyEmail: 'company@isolated.invalid', issueDate,
    dueDate: issueDate, subtotal: '80.00', vatRate: '0.00', vatAmount: '0.00', totalAmount: '80.00',
    notes: 'Retain customer note', internalNotes: 'Retain internal note', createdBy: actor, updatedBy: actor,
    createdAt: issueDate, updatedAt, ...overrides,
  });
}
async function seedEvent(overrides: Record<string, unknown> = {}) {
  await insert('payment_events', {
    id: randomUUID(), bookingId, bookingRef: ref, eventType: 'payment_succeeded',
    paymentMethod: 'card_link', paidVia: 'payment_link', linkStatus: 'paid', amountPence: 12000,
    currency: 'gbp', stripePaymentIntentId: 'pi_synthetic_full', source: 'stripe_webhook',
    status: 'succeeded', occurredAt: updatedAt, createdAt: updatedAt, updatedAt, ...overrides,
  });
}
async function invoiceRow(id = invoiceId) {
  return (await pg.query<Record<string, unknown>>('SELECT * FROM invoices WHERE id=$1', [id])).rows[0];
}
async function bookingRow() {
  return (await pg.query<Record<string, unknown>>('SELECT * FROM bookings WHERE id=$1', [bookingId])).rows[0];
}
async function counts() {
  return (await pg.query<{ invoices: number; audits: number; payments: number; events: number }>(`SELECT (SELECT count(*)::int FROM invoices) AS invoices,
    (SELECT count(*)::int FROM audit_logs) AS audits,
    (SELECT count(*)::int FROM payments) AS payments,
    (SELECT count(*)::int FROM payment_events) AS events`)).rows[0];
}
async function createTable(table: PgTable) {
  const dialect = new PgDialect();
  const { name, columns } = getTableConfig(table);
  const definitions = columns.map((column) => {
    const defaultValue = column.default;
    let defaultSql = '';
    if (defaultValue !== undefined) {
      const expression = typeof defaultValue === 'object'
        ? dialect.sqlToQuery(defaultValue as Parameters<PgDialect['sqlToQuery']>[0]).sql
        : typeof defaultValue === 'string' ? `'${defaultValue.replace(/'/g, "''")}'` : String(defaultValue);
      defaultSql = ` DEFAULT ${expression}`;
    }
    return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultSql}`;
  });
  // Match the uniqueness relevant to invoice reuse/number allocation, without
  // creating unrelated application tables or foreign key fixture dependencies.
  if (name === 'invoices') definitions.push('UNIQUE (invoice_number)');
  if (name === 'bookings') definitions.push('UNIQUE (ref_number)');
  if (name === 'payments') definitions.push('UNIQUE (stripe_pi_id)');
  await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`);
}

beforeAll(async () => {
  for (const table of [schema.users, schema.bookings, schema.invoices, schema.invoiceItems,
    schema.paymentEvents, schema.payments, schema.auditLogs, schema.bookingStatusHistory]) await createTable(table);
  state.query = async (text, values) => {
    state.queries.push(text);
    if (/pg_advisory_(?:xact_)?lock\s*\(/i.test(text)) return { rows: [], rowCount: 1 };
    if (state.failAudit && /INSERT\s+INTO\s+"?audit_logs"?/i.test(text)) throw new Error('Synthetic audit failure');
    if (state.numberCollisions > 0 && /INSERT\s+INTO\s+invoices\b/i.test(text)) {
      state.numberCollisions -= 1;
      throw Object.assign(new Error('Synthetic concurrent invoice number collision'), { code: '23505' });
    }
    const result = await pg.query<Record<string, unknown>>(text, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
}, 30_000);
beforeEach(async () => {
  state.failAudit = false; state.numberCollisions = 0; state.queries = [];
  state.sendEmail.mockClear();
  await pg.exec('TRUNCATE booking_status_history,audit_logs,payment_events,payments,invoice_items,invoices,bookings,users');
  await insert('users', { id: actor, email: 'admin@isolated.invalid', name: 'Synthetic Admin', role: 'admin' });
});
afterAll(async () => { await pg.close(); });

describe('booking-linked invoice synchronisation with isolated PostgreSQL', () => {
  it('rolls back a concurrent standalone number collision and retries without duplicate invoices or audits', async () => {
    await seedBooking();
    state.numberCollisions = 1;
    const result = await ensureBookingInvoice(ref, options);
    expect(result.reused).toBe(false);
    expect(await counts()).toMatchObject({ invoices: 1, audits: 1, payments: 0, events: 0 });
    expect(state.queries.filter((query) => query === 'BEGIN')).toHaveLength(2);
    expect(state.queries.filter((query) => query === 'ROLLBACK')).toHaveLength(1);
  });
  it('stops after three number collisions with no partial creation', async () => {
    await seedBooking();
    state.numberCollisions = 3;
    await expect(ensureBookingInvoice(ref, options)).rejects.toMatchObject({ code: '23505' });
    expect(await counts()).toMatchObject({ invoices: 0, audits: 0, payments: 0, events: 0 });
    expect(state.queries.filter((query) => query === 'BEGIN')).toHaveLength(3);
  });
  it('refreshes customer and final price while retaining invoice identity, dates, notes and sent history', async () => {
    await seedBooking(); await seedInvoice({ status: 'sent', sentAt });
    const originalBooking = await bookingRow();
    await synchronizeBookingInvoices(bookingId, options);
    const invoice = await invoiceRow();
    expect(invoice).toMatchObject({ invoice_number: 'INV-2026-0007', status: 'sent',
      customer_name: 'Current Customer', customer_email: 'current@isolated.invalid',
      customer_phone: '07000000000', customer_address: '1 Synthetic Street, Glasgow',
      subtotal: '120.00', vat_rate: '0.00', vat_amount: '0.00', total_amount: '120.00',
      notes: 'Retain customer note', internal_notes: 'Retain internal note' });
    expect(invoice.issue_date).toEqual(issueDate); expect(invoice.due_date).toEqual(issueDate);
    expect(invoice.sent_at).toEqual(sentAt); expect(await bookingRow()).toEqual(originalBooking);
    expect(state.queries.some((query) => /^BEGIN\b/i.test(query))).toBe(true);
    expect(state.queries.some((query) => /^COMMIT\b/i.test(query))).toBe(true);
  });

  it('does not create an invoice merely because a booking is synchronised', async () => {
    await seedBooking();
    const result = await synchronizeBookingInvoices(bookingId, options);
    expect(result.invoices).toHaveLength(0); expect((await counts()).invoices).toBe(0);
  });

  it.each(['synchronize', 'generate'])('preserves coherent recorded net, VAT and final total during %s', async (operation) => {
    await seedBooking({ subtotal: '100.00', vatAmount: '20.00', totalAmount: '120.00' });
    if (operation === 'synchronize') await seedInvoice();
    const bookingBefore = await bookingRow();
    const id = operation === 'synchronize'
      ? (await synchronizeBookingInvoices(bookingId, options)).invoices[0].id
      : (await ensureBookingInvoice(ref, { actorUserId: actor })).invoice.id;
    expect(await invoiceRow(id)).toMatchObject({ subtotal: '100.00', vat_amount: '20.00',
      vat_rate: '20.00', total_amount: '120.00' });
    expect(await bookingRow()).toEqual(bookingBefore);
  });

  it('atomically updates coherent booking net, VAT and gross figures in the existing invoice', async () => {
    await seedBooking({ subtotal: '100.00', vatAmount: '20.00', totalAmount: '120.00' });
    await seedInvoice();
    await applyBookingEditAndSyncInvoices(bookingId,
      { subtotal: '120.00', vatAmount: '24.00', totalAmount: '144.00' },
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() });
    expect(await bookingRow()).toMatchObject({ subtotal: '120.00', vat_amount: '24.00', total_amount: '144.00' });
    expect(await invoiceRow()).toMatchObject({ subtotal: '120.00', vat_amount: '24.00',
      vat_rate: '20.00', total_amount: '144.00' });
  });

  it.each(['synchronize', 'generate'])('retains recorded VAT and derives final net after a canonical adjustment during %s', async (operation) => {
    await seedBooking({ subtotal: '100.00', vatAmount: '20.00', totalAmount: '150.00' });
    if (operation === 'synchronize') await seedInvoice();
    const bookingBefore = await bookingRow();
    const id = operation === 'synchronize'
      ? (await synchronizeBookingInvoices(bookingId, options)).invoices[0].id
      : (await ensureBookingInvoice(ref, { actorUserId: actor })).invoice.id;
    expect(await invoiceRow(id)).toMatchObject({ subtotal: '130.00', vat_amount: '20.00',
      vat_rate: '15.38', total_amount: '150.00' });
    // Invoice projection cannot rewrite the historical canonical booking.
    expect(await bookingRow()).toEqual(bookingBefore);
  });

  it('uses the final total as net when a historical subtotal differs and VAT is zero', async () => {
    await seedBooking({ subtotal: '100.00', vatAmount: '0.00', totalAmount: '150.00' });
    await seedInvoice();
    await synchronizeBookingInvoices(bookingId, options);
    expect(await invoiceRow()).toMatchObject({ subtotal: '150.00', vat_amount: '0.00',
      vat_rate: '0.00', total_amount: '150.00' });
    expect(await bookingRow()).toMatchObject({ subtotal: '100.00', vat_amount: '0.00', total_amount: '150.00' });
  });

  it('rejects a booking VAT amount greater than its final total before invoice creation', async () => {
    await seedBooking({ subtotal: '100.00', vatAmount: '121.00', totalAmount: '120.00' });
    const before = await bookingRow();
    await expect(ensureBookingInvoice(ref, { actorUserId: actor })).rejects.toMatchObject({ status: 409 });
    expect(await bookingRow()).toEqual(before); expect((await counts()).invoices).toBe(0);
    expect((await counts()).audits).toBe(0);
    expect(state.queries.some((query) => /^ROLLBACK\b/i.test(query))).toBe(true);
  });

  it('rolls booking and invoice edits back together when edited VAT would exceed the final total', async () => {
    await seedBooking({ subtotal: '100.00', vatAmount: '20.00', totalAmount: '120.00' }); await seedInvoice();
    const before = await bookingRow(); const oldInvoice = await invoiceRow();
    await expect(applyBookingEditAndSyncInvoices(bookingId,
      { subtotal: '100.00', vatAmount: '130.00', totalAmount: '120.00' },
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toMatchObject({ status: 409 });
    expect(await bookingRow()).toEqual(before); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
    expect(state.queries.some((query) => /^ROLLBACK\b/i.test(query))).toBe(true);
  });

  it('returns an unlinked standalone invoice unchanged without a transaction', async () => {
    await seedInvoice({ bookingId: null });
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    state.queries = [];
    expect(await synchronizeLinkedInvoice(input, options)).toBe(input);
    expect(state.queries).toHaveLength(0);
  });

  it('fails closed when an invoice refers to a missing booking', async () => {
    await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    await expect(synchronizeLinkedInvoice(input, options)).rejects.toThrow();
    expect((await invoiceRow()).total_amount).toBe('80.00');
  });

  it('returns a current linked invoice and booking from one transaction without sending email', async () => {
    await seedBooking({ vehicleReg: 'XY34ZAB', vehicleMake: 'Toyota', vehicleModel: 'Yaris' });
    await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const context = await getLinkedInvoiceContext(input, options);
    expect(context.invoice).toMatchObject({ id: invoiceId, customerName: 'Current Customer', totalAmount: '120.00' });
    expect(context.booking).toMatchObject({ id: bookingId, refNumber: ref, vehicleReg: 'XY34ZAB', vehicleMake: 'Toyota', vehicleModel: 'Yaris' });
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('leaves standalone context unchanged without any query or email', async () => {
    await seedInvoice({ bookingId: null });
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    state.queries = [];
    expect(await getLinkedInvoiceContext(input, options)).toEqual({ invoice: input, booking: null });
    expect(state.queries).toHaveLength(0); expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it.each(['context', 'record-sent'])('fails closed for a missing linked booking during %s', async (action) => {
    await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const before = await invoiceRow();
    await expect(action === 'context' ? getLinkedInvoiceContext(input, options) : recordLinkedInvoiceSent(input, actor))
      .rejects.toMatchObject({ status: 404 });
    expect(await invoiceRow()).toEqual(before); expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('records an issued invoice as sent without claiming that sending collected payment', async () => {
    await seedBooking(); await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const updated = await recordLinkedInvoiceSent(input, actor);
    expect(updated.status).toBe('sent'); expect(updated.sentAt).toBeInstanceOf(Date);
    expect(await invoiceRow()).toMatchObject({ status: 'sent', total_amount: '120.00', updated_by: actor });
    expect(await counts()).toMatchObject({ payments: 0, events: 0 });
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('preserves strictly verified paid status when marking an invoice sent', async () => {
    await seedBooking({ paymentType: 'full' }); await seedInvoice({ status: 'paid', totalAmount: '120.00' });
    await seedEvent();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const updated = await recordLinkedInvoiceSent(input, actor);
    expect(updated.status).toBe('paid'); expect(updated.sentAt).toBeInstanceOf(Date);
    expect((await invoiceRow()).status).toBe('paid');
    expect(await counts()).toMatchObject({ payments: 0, events: 1 });
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('refreshes a receipt arriving after PDF preparation so recording send cannot erase the payment', async () => {
    await seedBooking({ paymentType: 'full' }); await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const prepared = await getLinkedInvoiceContext(input, options);
    expect(prepared.invoice.status).toBe('issued');
    await seedEvent(); // Synthetic payment arrives while the caller is sending.
    const recorded = await recordLinkedInvoiceSent(prepared.invoice, actor);
    expect(recorded.status).toBe('paid'); expect((await invoiceRow()).status).toBe('paid');
    expect((await counts()).events).toBe(1); expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it('refreshes a price increase after the paid snapshot and records sent without inventing a paid balance', async () => {
    await seedBooking({ paymentType: 'full' }); await seedInvoice({ status: 'paid', totalAmount: '120.00' });
    await seedEvent();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    const prepared = await getLinkedInvoiceContext(input, options);
    expect(prepared.invoice.status).toBe('paid');
    await pg.query('UPDATE bookings SET total_amount=$2,subtotal=$2,updated_at=NOW() WHERE id=$1', [bookingId, '150.00']);
    const recorded = await recordLinkedInvoiceSent(prepared.invoice, actor);
    expect(recorded.status).toBe('sent'); expect(recorded.totalAmount).toBe('150.00');
    expect((await pg.query<{ amount_pence: number }>('SELECT amount_pence FROM payment_events')).rows).toEqual([{ amount_pence: 12000 }]);
    expect((await counts()).payments).toBe(0); expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'deleted', field: 'deleted_at', value: sentAt },
    { label: 'archived', field: 'archived_at', value: sentAt },
    { label: 'cancelled', field: 'status', value: 'cancelled' },
  ])('rejects recording a $label invoice from an earlier active snapshot', async ({ field, value }) => {
    await seedBooking(); await seedInvoice();
    const input = camelRow(await invoiceRow()) as unknown as typeof schema.invoices.$inferSelect;
    await pg.query(`UPDATE invoices SET ${field}=$2 WHERE id=$1`, [invoiceId, value]);
    const before = await invoiceRow();
    await expect(recordLinkedInvoiceSent(input, actor)).rejects.toMatchObject({ status: 409 });
    expect(await invoiceRow()).toEqual(before); expect((await counts()).audits).toBe(0);
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'deleted', fields: { deletedAt: sentAt } },
    { label: 'archived', fields: { status: 'archived', archivedAt: sentAt } },
    { label: 'cancelled', fields: { status: 'cancelled' } },
  ])('leaves $label invoices untouched', async ({ fields }) => {
    await seedBooking(); await seedInvoice(fields);
    const before = await invoiceRow();
    await synchronizeBookingInvoices(bookingId, options);
    expect(await invoiceRow()).toEqual(before);
  });

  it('changes lifecycle-only paid claims back to an unpaid invoice', async () => {
    await seedBooking({ status: 'completed' }); await seedInvoice({ status: 'paid' });
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).not.toBe('paid');
  });

  it('marks full, correctly owned GBP receipts paid and preserves all payment records', async () => {
    await seedBooking({ paymentType: 'full' }); await seedInvoice(); await seedEvent();
    const before = await pg.query('SELECT * FROM payment_events');
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).toBe('paid');
    expect((await pg.query('SELECT * FROM payment_events')).rows).toEqual(before.rows);
    expect((await counts()).payments).toBe(0);
  });

  it('keeps deposit-only payments unpaid even when booking and old invoice claim paid', async () => {
    await seedBooking({ paymentType: 'deposit', status: 'paid', depositAmountPence: 3000,
      remainingBalancePence: 9000, depositPaidAt: updatedAt });
    await seedInvoice({ status: 'paid' });
    await seedEvent({ eventType: 'deposit_succeeded', amountPence: 3000 });
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).not.toBe('paid');
    expect((await invoiceRow()).total_amount).toBe('120.00');
  });

  it.each([
    { label: 'partial cash confirmation', events: [{ eventType: 'cash_confirmed', paymentMethod: 'cash', paidVia: 'cash', amountPence: 3000, source: 'admin' }] },
    { label: 'amountless legacy cash confirmation', events: [{ eventType: 'cash_confirmed', paymentMethod: 'cash', paidVia: 'cash', amountPence: null, source: 'admin' }] },
    { label: 'duplicate partial Stripe receipts', events: [{ amountPence: 6000 }, { amountPence: 6000 }] },
    { label: 'conflicting duplicate amounts', events: [{ amountPence: 12000 }, { amountPence: 6000 }] },
    { label: 'foreign currency receipt', events: [{ currency: 'usd' }] },
    { label: 'mismatched booking reference', events: [{ bookingRef: 'TYR-OTHER' }] },
    { label: 'failed receipt', events: [{ eventType: 'payment_failed', status: 'failed' }] },
    { label: 'expired session', events: [{ eventType: 'link_expired', status: 'expired' }] },
    { label: 'refund after full payment', events: [{}, { eventType: 'refund_succeeded', amountPence: 3000, metadata: { stripeRefundId: 're_synthetic_1' } }] },
    { label: 'pending refund after full payment', events: [{}, { eventType: 'refund_created', status: 'pending', amountPence: 3000 }] },
  ])('never turns $label into a paid invoice', async ({ events }) => {
    await seedBooking(); await seedInvoice({ status: 'paid' });
    for (const event of events) await seedEvent(event);
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).not.toBe('paid');
  });

  it('accepts an exact legacy successful Stripe payment without counting its ledger copy twice', async () => {
    await seedBooking({ paymentType: 'full' }); await seedInvoice();
    await insert('payments', { id: randomUUID(), bookingId, stripePiId: 'pi_synthetic_full',
      amount: '120.00', currency: 'gbp', status: 'succeeded', createdAt: updatedAt, updatedAt });
    await seedEvent();
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).toBe('paid');
    expect(await counts()).toMatchObject({ payments: 1, events: 1 });
  });

  it('marks a cash booking paid only after the deposit and a distinct cash balance cover its final total', async () => {
    await seedBooking({ paymentType: 'cash', depositAmountPence: 3000, remainingBalancePence: 9000 });
    await seedInvoice();
    await seedEvent({ eventType: 'deposit_succeeded', amountPence: 3000 });
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).not.toBe('paid');
    await seedEvent({ eventType: 'cash_confirmed', amountPence: 9000, paymentMethod: 'cash', paidVia: 'cash',
      source: 'admin', stripePaymentIntentId: null, metadata: { stripeEventId: 'synthetic-cash-balance' } });
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).status).toBe('paid');
  });

  it('refreshes every active linked invoice but leaves an unrelated invoice unchanged', async () => {
    await seedBooking(); await seedInvoice();
    const anotherInvoiceId = randomUUID(); const unrelatedInvoiceId = randomUUID();
    await seedInvoice({ id: anotherInvoiceId, invoiceNumber: 'INV-2026-0008' });
    await seedInvoice({ id: unrelatedInvoiceId, invoiceNumber: 'INV-2026-0009', bookingId: otherBookingId });
    const unrelatedBefore = await invoiceRow(unrelatedInvoiceId);
    await synchronizeBookingInvoices(bookingId, options);
    expect((await invoiceRow()).total_amount).toBe('120.00');
    expect((await invoiceRow(anotherInvoiceId)).total_amount).toBe('120.00');
    expect(await invoiceRow(unrelatedInvoiceId)).toEqual(unrelatedBefore);
  });

  it('atomically edits booking customer, amount and vehicle while synchronising an existing invoice', async () => {
    await seedBooking(); await seedInvoice();
    const result = await applyBookingEditAndSyncInvoices(bookingId, {
      customerName: 'Revised Customer', customerEmail: 'revised@isolated.invalid', customerPhone: '07222222222',
      addressLine: '22 Revised Fixture Road', totalAmount: '150.00', subtotal: '150.00', vatAmount: '0.00',
      vehicleReg: 'XY34ZAB', vehicleMake: 'Toyota', vehicleModel: 'Yaris', tyreSizeDisplay: '195/55R16',
    }, { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() });
    expect(result.booking).toMatchObject({ customerName: 'Revised Customer', vehicleReg: 'XY34ZAB', vehicleMake: 'Toyota', vehicleModel: 'Yaris' });
    expect(await bookingRow()).toMatchObject({ customer_name: 'Revised Customer', vehicle_reg: 'XY34ZAB', total_amount: '150.00' });
    expect(await invoiceRow()).toMatchObject({ invoice_number: 'INV-2026-0007', customer_name: 'Revised Customer',
      customer_email: 'revised@isolated.invalid', customer_address: '22 Revised Fixture Road', total_amount: '150.00' });
  });

  it('rejects stale booking updates without changing invoice, booking or audit records', async () => {
    await seedBooking(); await seedInvoice();
    const oldBooking = await bookingRow(); const oldInvoice = await invoiceRow(); const oldCounts = await counts();
    await expect(applyBookingEditAndSyncInvoices(bookingId, { totalAmount: '999.00' },
      { actorUserId: actor, expectedUpdatedAt: '2026-10-21T10:00:00.000Z' })).rejects.toMatchObject({ status: 409 });
    expect(await bookingRow()).toEqual(oldBooking); expect(await invoiceRow()).toEqual(oldInvoice);
    expect(await counts()).toEqual(oldCounts);
  });

  it('rolls back booking and invoice edits together if the audit write fails', async () => {
    await seedBooking(); await seedInvoice();
    const oldBooking = await bookingRow(); const oldInvoice = await invoiceRow();
    state.failAudit = true;
    await expect(applyBookingEditAndSyncInvoices(bookingId,
      { customerName: 'Never Committed', totalAmount: '175.00', subtotal: '175.00', vatAmount: '0.00' },
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toThrow('Synthetic audit failure');
    state.failAudit = false;
    expect(await bookingRow()).toEqual(oldBooking); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
    expect(state.queries.some((query) => /^ROLLBACK\b/i.test(query))).toBe(true);
  });

  it('rolls an invalid final amount back without modifying the booking or linked invoices', async () => {
    await seedBooking(); await seedInvoice();
    const oldBooking = await bookingRow(); const oldInvoice = await invoiceRow();
    await expect(applyBookingEditAndSyncInvoices(bookingId, { totalAmount: '-0.01' },
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toMatchObject({ status: 409 });
    expect(await bookingRow()).toEqual(oldBooking); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
  });

  it('reuses the active invoice and never allocates duplicates during repeated generation', async () => {
    await seedBooking(); await seedInvoice();
    const first = await ensureBookingInvoice(` ${ref.toLowerCase()} `, { actorUserId: actor });
    const second = await ensureBookingInvoice(ref, { actorUserId: actor });
    expect(first.reused).toBe(true); expect(second.reused).toBe(true);
    expect(first.invoice.id).toBe(invoiceId); expect(second.invoice.id).toBe(invoiceId);
    expect(first.invoice.invoiceNumber).toBe('INV-2026-0007');
    expect((await counts()).invoices).toBe(1);
  });

  it('allocates one unique number beyond existing sparse suffixes across unrelated bookings', async () => {
    await seedBooking();
    await seedBooking({ id: otherBookingId, refNumber: 'TYR-SYNTHETIC-2' });
    const year = new Date().getUTCFullYear();
    await seedInvoice({ id: randomUUID(), bookingId: otherBookingId, invoiceNumber: `INV-${year}-0002` });
    await seedInvoice({ id: randomUUID(), bookingId: otherBookingId, invoiceNumber: `INV-${year}-0099` });
    const first = await ensureBookingInvoice(ref, { actorUserId: actor });
    const second = await ensureBookingInvoice(ref, { actorUserId: actor });
    expect(first.reused).toBe(false); expect(second.reused).toBe(true);
    expect(first.invoice.id).toBe(second.invoice.id);
    expect(first.invoice.invoiceNumber).not.toBe(`INV-${year}-0002`);
    expect(first.invoice.invoiceNumber).not.toBe(`INV-${year}-0099`);
    expect(first.invoice.invoiceNumber).toBe(`INV-${year}-0100`);
    expect((await counts()).invoices).toBe(3);
    expect((await pg.query<{ count: number }>('SELECT count(*)::int AS count FROM invoices WHERE booking_id=$1', [bookingId])).rows[0].count).toBe(1);
  });

  it('allocates against only valid current-year numeric suffixes, including reserved deleted numbers', async () => {
    await seedBooking();
    const year = new Date().getFullYear();
    await seedInvoice({ id: randomUUID(), bookingId: null, invoiceNumber: `INV-${year}-0088`, deletedAt: sentAt });
    await seedInvoice({ id: randomUUID(), bookingId: null, invoiceNumber: `INV-${year - 1}-9999` });
    await seedInvoice({ id: randomUUID(), bookingId: null, invoiceNumber: `INV-${year}-NOTE-9999` });
    const created = await ensureBookingInvoice(ref, { actorUserId: actor });
    expect(created.invoice.invoiceNumber).toBe(`INV-${year}-0089`);
    expect(created.reused).toBe(false);
  });

  it('does not reuse a cancelled invoice when explicitly generating a current booking invoice', async () => {
    await seedBooking(); await seedInvoice({ status: 'cancelled' });
    const cancelledBefore = await invoiceRow();
    const first = await ensureBookingInvoice(ref, { actorUserId: actor });
    const second = await ensureBookingInvoice(ref, { actorUserId: actor });
    expect(first.reused).toBe(false); expect(first.invoice.id).not.toBe(invoiceId);
    expect(second.reused).toBe(true); expect(second.invoice.id).toBe(first.invoice.id);
    expect(await invoiceRow()).toEqual(cancelledBefore); expect((await counts()).invoices).toBe(2);
  });

  it('allows explicit customer invoice presentation after completion without changing price, inventory selections or payment records', async () => {
    const priceSnapshot = { tyreId: 'synthetic-tyre', internalCost: 57.25, quantity: 1,
      priceBreakdown: { internalLabour: 25 }, reservedStockId: 'synthetic-stock' };
    await seedBooking({ status: 'completed', priceSnapshot });
    const presentation = { version: 1, extraInformation: 'Customer requested the receipt.',
      priceBreakdown: [{ label: 'Tyre and fitting', amountPence: 12000 }] };
    const result = await updateBookingInvoicePresentation(ref, presentation,
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() });
    expect(result.invoices).toHaveLength(0);
    expect(await bookingRow()).toMatchObject({ status: 'completed', total_amount: '120.00', subtotal: '120.00',
      vat_amount: '0.00', payment_type: 'cash', price_snapshot: { ...priceSnapshot, customerInvoice: presentation } });
    expect(await counts()).toMatchObject({ invoices: 0, payments: 0, events: 0, audits: 1 });
  });

  it('rejects stale presentation edits without changing the current snapshot', async () => {
    await seedBooking({ priceSnapshot: { tyreId: 'preserved' } }); await seedInvoice();
    const before = await bookingRow(); const oldInvoice = await invoiceRow();
    await expect(updateBookingInvoicePresentation(ref, { version: 1, extraInformation: 'Stale edit', priceBreakdown: null },
      { actorUserId: actor, expectedUpdatedAt: '2026-10-21T10:00:00.000Z' })).rejects.toMatchObject({ status: 409 });
    expect(await bookingRow()).toEqual(before); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
  });

  it.each([
    { label: 'breakdown sum different from the locked booking total', raw: { version: 1, extraInformation: null, priceBreakdown: [{ label: 'Tyre', amountPence: 11999 }] } },
    { label: 'more than twelve customer lines', raw: { version: 1, extraInformation: null, priceBreakdown: Array.from({ length: 13 }, () => ({ label: 'Tyre', amountPence: 0 })) } },
    { label: 'a line label longer than 160 characters', raw: { version: 1, extraInformation: null, priceBreakdown: [{ label: 'x'.repeat(161), amountPence: 12000 }] } },
    { label: 'customer information longer than 1500 characters', raw: { version: 1, extraInformation: 'x'.repeat(1501), priceBreakdown: null } },
    { label: 'unexpected internal pricing fields', raw: { version: 1, extraInformation: null, priceBreakdown: null, internalCost: 1 } },
  ])('rolls back $label without changing the booking or invoice', async ({ raw }) => {
    await seedBooking({ priceSnapshot: { tyreId: 'preserved' } }); await seedInvoice();
    const before = await bookingRow(); const oldInvoice = await invoiceRow();
    await expect(updateBookingInvoicePresentation(ref, raw,
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toMatchObject({ status: 400 });
    expect(await bookingRow()).toEqual(before); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
  });

  it('rolls the customer presentation and invoice synchronization back together on audit failure', async () => {
    await seedBooking({ priceSnapshot: { tyreId: 'preserved' } }); await seedInvoice();
    const before = await bookingRow(); const oldInvoice = await invoiceRow();
    state.failAudit = true;
    await expect(updateBookingInvoicePresentation(ref,
      { version: 1, extraInformation: 'Never committed', priceBreakdown: null },
      { actorUserId: actor, expectedUpdatedAt: updatedAt.toISOString() })).rejects.toThrow('Synthetic audit failure');
    state.failAudit = false;
    expect(await bookingRow()).toEqual(before); expect(await invoiceRow()).toEqual(oldInvoice);
    expect((await counts()).audits).toBe(0);
  });
});
