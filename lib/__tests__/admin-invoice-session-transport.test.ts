import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), verify: vi.fn(), invoices: vi.fn() }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({ getMobileAdminUser: mocks.user }));
vi.mock('@/lib/auth', () => ({ verifyMobileToken: mocks.verify }));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.invoices }) }) }) }, invoices: { id: 'invoice-id' } }));
vi.mock('@/lib/invoice-pdf', () => ({ generateBookingCustomerInvoicePdf: vi.fn(), generateStandaloneAdminInvoicePdf: vi.fn() }));
vi.mock('@/lib/invoice-pdf-data', () => ({ buildBookingCustomerInvoicePdfData: vi.fn(), buildStandaloneAdminInvoicePdfData: vi.fn() }));
import { GET } from '@/app/api/mobile/admin/invoices/[id]/pdf/route';

const token = 'acs_v1.11111111-1111-4111-8111-111111111111.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const params = { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) };
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue(null); mocks.invoices.mockResolvedValue([]); mocks.verify.mockResolvedValue({ role: 'admin' }); });
describe('durable admin credentials never use invoice URLs', () => {
  it('refuses an opaque credential in a query string without verifying or reading invoices', async () => {
    const response = await GET(new Request(`https://isolated.invalid/api/mobile/admin/invoices/id/pdf?token=${token}`), params);
    expect(response.status).toBe(401); expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.invoices).not.toHaveBeenCalled();
  });
  it('accepts normal authenticated Bearer access with the new device session', async () => {
    mocks.user.mockResolvedValue({ id: 'isolated-admin', role: 'admin' });
    const response = await GET(new Request('https://isolated.invalid/api/mobile/admin/invoices/id/pdf', { headers: { Authorization: `Bearer ${token}` } }), params);
    expect(response.status).toBe(404); expect(mocks.invoices).toHaveBeenCalledOnce(); expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('preserves the existing legacy JWT browser fallback', async () => {
    const response = await GET(new Request('https://isolated.invalid/api/mobile/admin/invoices/id/pdf?token=isolated-legacy-jwt'), params);
    expect(response.status).toBe(404); expect(mocks.verify).toHaveBeenCalledWith('isolated-legacy-jwt');
  });
});
