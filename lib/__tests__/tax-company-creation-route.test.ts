import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  userId: '10000000-0000-4000-8000-000000000001' as string | null,
  create: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireAdminMobile: async () => {
    if (!state.userId) throw new Error('Unauthorized');
    return { user: { id: state.userId } };
  },
}));
vi.mock('@/lib/tax-payroll/company-service', () => ({
  createCompany: state.create,
  getCompaniesByUserId: state.list,
  CompanyServiceError: class extends Error {
    constructor(message: string, public readonly code: string) { super(message); }
  },
}));

import { GET, POST } from '@/app/api/admin/tax/companies/route';
import { CompanyServiceError } from '@/lib/tax-payroll/company-service';

const profile = {
  id: '20000000-0000-4000-8000-000000000002',
  companyNumber: 'SC784534',
  legalName: 'GORBALS TYRES LTD',
  registeredAddressLine1: 'Unit 3, 10 Gateside Street',
  registeredAddressLine2: null,
  registeredCity: 'Glasgow',
  registeredCountry: 'Scotland',
  registeredPostcode: 'G31 1PB',
  tradingName: null, tradingAddress: null, businessEmail: null, businessPhone: null,
  version: 1,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
};
const nativeForm = {
  companyNumber: profile.companyNumber,
  legalName: profile.legalName,
  registeredAddressLine1: profile.registeredAddressLine1,
  registeredAddressLine2: '',
  registeredCity: profile.registeredCity,
  registeredCountry: profile.registeredCountry,
  registeredPostcode: profile.registeredPostcode,
  tradingName: '', businessEmail: '', businessPhone: '',
};
const request = (body: unknown) => new Request('https://isolated.invalid/api/admin/tax/companies', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
beforeEach(() => {
  state.userId = '10000000-0000-4000-8000-000000000001';
  state.create.mockReset().mockResolvedValue(profile);
  state.list.mockReset().mockResolvedValue([profile]);
});

describe('tax company API response contract', () => {
  it('returns a flat named company on 201 for the actual native form, including a blank optional email', async () => {
    const response = await POST(request(nativeForm));
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(profile);
    expect(state.create).toHaveBeenCalledWith(state.userId, { ...nativeForm, businessEmail: null });
  });

  it('returns the company list in the client envelope for the authenticated administrator', async () => {
    const response = await GET(new Request('https://isolated.invalid/api/admin/tax/companies'));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ companies: [profile], canCreate: true });
    expect(state.list).toHaveBeenCalledWith(state.userId);
  });

  it('rejects a nonempty invalid email and never attempts company creation', async () => {
    const response = await POST(request({ ...nativeForm, businessEmail: 'invalid-address' }));
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors.businessEmail).toBeTruthy();
    expect(state.create).not.toHaveBeenCalled();
  });

  it('does not show creation success for a duplicate company number', async () => {
    state.create.mockRejectedValue(new CompanyServiceError('A company with this number already exists.', 'CONFLICT_DUPLICATE'));
    const response = await POST(request(nativeForm));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'CONFLICT_DUPLICATE', fieldErrors: { companyNumber: expect.any(String) } });
  });

  it('does not create or read companies without administrator authentication', async () => {
    state.userId = null;
    expect((await POST(request(nativeForm))).status).toBe(401);
    const listResponse = await GET(new Request('https://isolated.invalid/api/admin/tax/companies'));
    expect(listResponse.status).toBe(401);
    expect(state.create).not.toHaveBeenCalled();
    expect(state.list).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without attempting a write', async () => {
    const response = await POST(new Request('https://isolated.invalid/api/admin/tax/companies', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(state.create).not.toHaveBeenCalled();
  });
});
