import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true, rows: [] as unknown[][],
  select: vi.fn(), update: vi.fn(), insert: vi.fn(),
  ensure: vi.fn(), presentation: vi.fn(), context: vi.fn(), sent: vi.fn(),
  pdfData: vi.fn(), sendEmail: vi.fn(),
}));
vi.mock('@/lib/db', async () => {
  const schema = await import('../db/schema');
  function read() {
    const query = { from: () => query, where: () => query, limit: () => query, orderBy: () => query,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(state.rows.shift() ?? []).then(resolve) };
    state.select();
    return query;
  }
  return { ...schema, db: { select: read,
    update: (...args: unknown[]) => { state.update(...args); return { set: () => ({ where: async () => [] }) }; },
    insert: (...args: unknown[]) => { state.insert(...args); return { values: async () => [] }; },
  } };
});
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => state.authorized ? { id: '10000000-0000-4000-8000-000000000001', role: 'admin' } : null,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}));
vi.mock('@/lib/auth', () => ({ requireAdmin: async () => {
  if (!state.authorized) throw new Error('Unauthorized');
  return { user: { id: '10000000-0000-4000-8000-000000000001', role: 'admin' } };
} }));
vi.mock('@/lib/invoices/booking-invoice-sync', () => ({
  ensureBookingInvoice: state.ensure, updateBookingInvoicePresentation: state.presentation,
  getLinkedInvoiceContext: state.context, recordLinkedInvoiceSent: state.sent,
}));
vi.mock('@/lib/invoice-pdf-data', () => ({
  buildBookingCustomerInvoicePdfData: state.pdfData,
  buildStandaloneAdminInvoicePdfData: vi.fn(),
}));
vi.mock('@/lib/invoice-pdf', () => ({
  generateBookingCustomerInvoicePdf: async () => new Uint8Array([1, 2, 3]),
  generateStandaloneAdminInvoicePdf: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock('@/lib/email/resend', () => ({ sendEmail: state.sendEmail }));
vi.mock('@/lib/email/templates/invoice', () => ({ invoiceEmail: (data: unknown) => ({ subject: 'Synthetic invoice', html: JSON.stringify(data) }) }));
vi.mock('@/lib/config/site', () => ({ getOutboundUrl: () => 'https://isolated.invalid' }));

import { GET as presentationGet, PATCH as presentationPatch, POST as generate } from '../../app/api/mobile/admin/bookings/[ref]/invoice/route';
import { GET as mobileGet, PATCH as mobilePatch } from '../../app/api/mobile/admin/invoices/[id]/route';
import { GET as webGet, PATCH as webPatch } from '../../app/api/admin/invoices/[id]/route';
import { POST as mobileSend } from '../../app/api/mobile/admin/invoices/[id]/send/route';
import { POST as webSend } from '../../app/api/admin/invoices/[id]/send/route';

const refParams = { params: Promise.resolve({ ref: 'TYR-INVOICE-TEST' }) };
const idParams = { params: Promise.resolve({ id: '20000000-0000-4000-8000-000000000002' }) };
const at = new Date('2026-10-22T00:00:00Z');
const booking = {
  id: '30000000-0000-4000-8000-000000000003', refNumber: 'TYR-INVOICE-TEST', totalAmount: '144.00',
  customerName: 'Current customer', customerEmail: 'current@isolated.invalid', updatedAt: at,
  priceSnapshot: { customerInvoice: { version: 1, extraInformation: 'Front wheel', priceBreakdown: [{ label: 'Tyre service', amountPence: 14400 }] } },
};
const invoice = {
  id: '20000000-0000-4000-8000-000000000002', invoiceNumber: 'INV-2026-0042', bookingId: booking.id,
  customerName: 'Old name', customerEmail: 'old@isolated.invalid', customerAddress: 'Old address',
  totalAmount: '120.00', subtotal: '120.00', vatAmount: '0.00', vatRate: '0.00', status: 'issued',
  issueDate: at, dueDate: at, createdAt: at, updatedAt: at, sentAt: null, archivedAt: null, deletedAt: null,
  companyName: 'Synthetic company',
};
const freshInvoice = { ...invoice, customerName: booking.customerName, customerEmail: booking.customerEmail, totalAmount: '144.00', status: 'paid' };
const request = (method: string, body?: unknown) => new Request('https://isolated.invalid/invoice', {
  method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

beforeEach(() => {
  vi.clearAllMocks(); state.authorized = true; state.rows = [];
  state.context.mockResolvedValue({ invoice: freshInvoice, booking });
  state.ensure.mockResolvedValue({ booking, invoice: freshInvoice, reused: true });
  state.presentation.mockResolvedValue({ booking, invoices: [], changed: false });
  state.sent.mockResolvedValue(freshInvoice);
  state.sendEmail.mockResolvedValue({ id: 'synthetic-email' });
  state.pdfData.mockImplementation(async (_invoice: unknown, options: { onSynchronizedInvoice?: (value: unknown) => void }) => {
    options.onSynchronizedInvoice?.(freshInvoice);
    return { finalTotal: 144 };
  });
});

describe('protected linked booking invoice routes', () => {
  it('reads only explicit customer presentation and the canonical booking version', async () => {
    state.rows = [[booking]];
    const response = await presentationGet(request('GET'), refParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invoicePresentation: booking.priceSnapshot.customerInvoice,
      totalPence: 14400, bookingUpdatedAt: at.toISOString(), priceBreakdownStale: false });
    expect(state.context).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
  it('passes an explicit version to presentation validation inside the transaction', async () => {
    const payload = { invoicePresentation: booking.priceSnapshot.customerInvoice, expectedUpdatedAt: at.toISOString() };
    const response = await presentationPatch(request('PATCH', payload), refParams);
    expect(response.status).toBe(200);
    expect(state.presentation).toHaveBeenCalledWith(booking.refNumber, payload.invoicePresentation,
      expect.objectContaining({ expectedUpdatedAt: at.toISOString() }));
  });
  it.each([{ invoicePresentation: {} }, { expectedUpdatedAt: at.toISOString() },
    { invoicePresentation: {}, expectedUpdatedAt: 'invalid' },
    { invoicePresentation: {}, expectedUpdatedAt: at.toISOString(), totalAmount: 0 }])('rejects missing version and unrelated booking edits %j', async (body) => {
    expect((await presentationPatch(request('PATCH', body), refParams)).status).toBe(400);
    expect(state.presentation).not.toHaveBeenCalled();
  });
  it('reuses the synchronized invoice without stale-total 409', async () => {
    const response = await generate(request('POST'), refParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber,
      status: 'paid', totalAmount: '144.00' }, reused: true });
    expect(state.sendEmail).not.toHaveBeenCalled();
  });
  it('returns 201 only for a newly allocated invoice', async () => {
    state.ensure.mockResolvedValue({ booking, invoice: freshInvoice, reused: false });
    expect((await generate(request('POST'), refParams)).status).toBe(201);
  });
  it.each([['mobile', mobileGet], ['web', webGet]] as const)('%s invoice detail exposes current linked edit context inside invoice', async (_name, handler) => {
    state.rows = [[invoice], []];
    const response = await handler(request('GET'), idParams);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.invoice).toMatchObject({ totalAmount: '144.00', customerName: booking.customerName,
      bookingRef: booking.refNumber, bookingTotalPence: 14400, invoicePresentation: booking.priceSnapshot.customerInvoice,
      bookingUpdatedAt: at.toISOString(), priceBreakdownStale: false });
  });
  it.each([['mobile', mobilePatch], ['web', webPatch]] as const)('%s rejects linked financial/header edits instead of creating a competing total', async (_name, handler) => {
    state.rows = [[invoice]];
    const response = await handler(request('PATCH', { customerName: 'Competing name' }), idParams);
    expect(response.status).toBe(409);
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each([['mobile', mobilePatch], ['web', webPatch]] as const)('%s retains ordinary standalone customer edits', async (_name, handler) => {
    state.rows = [[{ ...invoice, bookingId: null }]];
    expect((await handler(request('PATCH', { customerName: 'Standalone name' }), idParams)).status).toBe(200);
    expect(state.update).toHaveBeenCalledOnce();
  });
  it.each([['mobile', mobileSend], ['web', webSend]] as const)('%s email and attachment share the synchronized customer and total', async (_name, handler) => {
    state.rows = [[invoice]];
    const response = await handler(request('POST'), idParams);
    expect(response.status).toBe(200);
    expect(state.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: booking.customerEmail,
      html: expect.stringContaining('144'), attachments: [expect.objectContaining({ filename: `${invoice.invoiceNumber}.pdf` })] }));
    expect(state.sent).toHaveBeenCalledWith(freshInvoice, expect.any(String));
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each([['mobile', mobileSend], ['web', webSend]] as const)('%s failed email never records a successful send', async (name, handler) => {
    state.rows = [[invoice]]; state.sendEmail.mockRejectedValueOnce(new Error('synthetic send failure'));
    if (name === 'mobile') await expect(handler(request('POST'), idParams)).rejects.toThrow('synthetic send failure');
    else expect((await handler(request('POST'), idParams)).status).toBe(500);
    expect(state.sent).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
  it.each([['mobile', mobileSend], ['web', webSend]] as const)('%s refuses a newly archived invoice before sending the prepared attachment', async (_name, handler) => {
    state.rows = [[invoice]];
    state.pdfData.mockImplementationOnce(async (_invoice: unknown, options: { onSynchronizedInvoice: (value: unknown) => void }) => {
      options.onSynchronizedInvoice({ ...freshInvoice, status: 'archived', archivedAt: at });
      return { finalTotal: 144 };
    });
    expect((await handler(request('POST'), idParams)).status).toBe(409);
    expect(state.sendEmail).not.toHaveBeenCalled();
    expect(state.sent).not.toHaveBeenCalled();
  });
  it.each([presentationGet, presentationPatch, generate, mobileGet, mobilePatch, mobileSend, webGet, webPatch, webSend])('unauthenticated access performs zero invoice or payment work', async (handler) => {
    state.authorized = false;
    const response = await (handler as (req: Request, params: typeof idParams) => Promise<Response>)(request('POST'), idParams);
    expect(response.status).toBe(401);
    expect(state.select).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled();
    expect(state.context).not.toHaveBeenCalled(); expect(state.sendEmail).not.toHaveBeenCalled();
  });
});
