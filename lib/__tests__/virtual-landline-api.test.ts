import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: vi.fn(),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  parsePageParams: () => ({ page: 1, perPage: 25, offset: 0 }),
}));

vi.mock('@/lib/virtual-landline/server', () => ({
  getVirtualLandlineDraftPrefill: vi.fn(),
  importVirtualLandlineCalls: vi.fn(),
  isVirtualLandlineTableMissingError: vi.fn((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return code === '42P01' || /virtual_landline_interactions/i.test(message);
  }),
  listVirtualLandlineInteractions: vi.fn(),
  linkVirtualLandlineInteractionToBooking: vi.fn(),
  markVirtualLandlineInteractionReviewed: vi.fn(),
  serializeParsedCall: vi.fn((call) => call),
  validateVirtualLandlineCsvFile: vi.fn(() => null),
}));

vi.mock('@/lib/notifications/create-admin-notification', () => ({
  createAdminNotification: vi.fn(),
}));

const { getMobileAdminUser } = await import('@/app/api/mobile/admin/_lib');
const {
  getVirtualLandlineDraftPrefill,
  importVirtualLandlineCalls,
  listVirtualLandlineInteractions,
  linkVirtualLandlineInteractionToBooking,
  markVirtualLandlineInteractionReviewed,
} = await import('@/lib/virtual-landline/server');
const { createAdminNotification } = await import('@/lib/notifications/create-admin-notification');
const previewRoute = await import('../../app/api/mobile/admin/virtual-landline/preview/route');
const importRoute = await import('../../app/api/mobile/admin/virtual-landline/import/route');
const listRoute = await import('../../app/api/mobile/admin/virtual-landline/interactions/route');
const draftRoute = await import('../../app/api/mobile/admin/virtual-landline/interactions/[id]/draft/route');
const actionRoute = await import('../../app/api/mobile/admin/virtual-landline/interactions/[id]/route');

const getMobileAdminUserMock = vi.mocked(getMobileAdminUser);
const getVirtualLandlineDraftPrefillMock = vi.mocked(getVirtualLandlineDraftPrefill);
const importVirtualLandlineCallsMock = vi.mocked(importVirtualLandlineCalls);
const listVirtualLandlineInteractionsMock = vi.mocked(listVirtualLandlineInteractions);
const linkVirtualLandlineInteractionToBookingMock = vi.mocked(linkVirtualLandlineInteractionToBooking);
const markVirtualLandlineInteractionReviewedMock = vi.mocked(markVirtualLandlineInteractionReviewed);
const createAdminNotificationMock = vi.mocked(createAdminNotification);

function csvUploadRequest(url = 'https://example.test/api/mobile/admin/virtual-landline/import', confirm = true): Request {
  const formData = new FormData();
  if (confirm) formData.append('confirm', 'true');
  formData.append(
    'file',
    new File([
      [
        'Call ID,Caller Number,Direction,Start Time,Duration,Call Status',
        'missed-1,07700 900111,Missed,21/07/2026 03:00:00,0,Missed',
      ].join('\n'),
    ], 'calls.csv', { type: 'text/csv' }),
  );
  return new Request(url, { method: 'POST', body: formData });
}

describe('Virtual Landline mobile admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthorised CSV preview access', async () => {
    getMobileAdminUserMock.mockResolvedValue(null);

    const response = await previewRoute.POST(new Request('https://example.test/api/mobile/admin/virtual-landline/preview'));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({ error: 'Unauthorized' });
  });

  it('rejects unauthorised interaction list access', async () => {
    getMobileAdminUserMock.mockResolvedValue(null);

    const response = await listRoute.GET(
      new Request('https://example.test/api/mobile/admin/virtual-landline/interactions'),
    );

    expect(response.status).toBe(401);
  });

  it('loads stored interactions after Virtual Landline activation', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    listVirtualLandlineInteractionsMock.mockResolvedValue({
      items: [
        {
          id: 'interaction-1',
          direction: 'missed',
          callStatus: 'missed',
          callerNumberRaw: '07700 900111',
          destinationNumberRaw: '020 7946 0000',
          callerNumberNormalized: '447700900111',
          destinationNumberNormalized: '442079460000',
          customerPhoneNormalized: '447700900111',
          startedAt: '2026-07-22T14:00:00.000Z',
          endedAt: '2026-07-22T14:00:00.000Z',
          durationSeconds: 0,
          costRaw: '0',
          recordingUrl: null,
          sourceFileName: 'calls.csv',
          sourceRowNumber: 2,
          reviewed: false,
          reviewedAt: null,
          createdAt: '2026-07-22T14:01:00.000Z',
          matchedCustomer: null,
          linkedBooking: null,
          linkedQuickBooking: null,
        },
      ],
      totalCount: 1,
      pendingMissedCount: 1,
    });

    const response = await listRoute.GET(
      new Request('https://example.test/api/mobile/admin/virtual-landline/interactions'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      totalCount: 1,
      pendingMissedCount: 1,
    });
    expect(payload.items[0]).toMatchObject({
      id: 'interaction-1',
      direction: 'missed',
      customerPhoneNormalized: '447700900111',
      costRaw: '0',
    });
    expect(listVirtualLandlineInteractionsMock).toHaveBeenCalledTimes(1);
  });

  it('requires explicit confirmation before importing CSV rows', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });

    const response = await importRoute.POST(csvUploadRequest(undefined, false));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/confirmation/i);
    expect(importVirtualLandlineCallsMock).not.toHaveBeenCalled();
    expect(createAdminNotificationMock).not.toHaveBeenCalled();
  });

  it('imports confirmed valid rows and creates notifications for new missed calls only', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    importVirtualLandlineCallsMock.mockResolvedValue({
      imported: 2,
      skipped: 1,
      duplicate: 0,
      invalid: 1,
      missedCalls: 1,
      missedInteractionIds: ['missed-interaction-1'],
    });

    const response = await importRoute.POST(csvUploadRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'partially_succeeded',
      imported: 2,
      skipped: 1,
      duplicate: 0,
      invalid: 1,
      missedCalls: 1,
    });
    expect(importVirtualLandlineCallsMock).toHaveBeenCalledTimes(1);
    expect(createAdminNotificationMock).toHaveBeenCalledTimes(1);
    expect(createAdminNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'virtual_landline.missed_calls_imported',
        entityType: 'virtual_landline',
        entityId: 'missed-interaction-1',
        severity: 'info',
      }),
    );
  });

  it('does not duplicate notifications when confirmed import only returns duplicate rows', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    importVirtualLandlineCallsMock.mockResolvedValue({
      imported: 0,
      skipped: 2,
      duplicate: 2,
      invalid: 0,
      missedCalls: 0,
      missedInteractionIds: [],
    });

    const response = await importRoute.POST(csvUploadRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      state: 'duplicate_rows',
      imported: 0,
      duplicate: 2,
      missedCalls: 0,
    });
    expect(createAdminNotificationMock).not.toHaveBeenCalled();
  });

  it('returns booking draft prefill after Virtual Landline activation', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    getVirtualLandlineDraftPrefillMock.mockResolvedValue({
      phone: '+447700900111',
      interactionId: '11111111-1111-4111-8111-111111111111',
      matchedCustomer: null,
    });

    const response = await draftRoute.POST(
      new Request('https://example.test/api/mobile/admin/virtual-landline/interactions/11111111-1111-4111-8111-111111111111/draft', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      draft: {
        phone: '+447700900111',
        interactionId: '11111111-1111-4111-8111-111111111111',
        matchedCustomer: null,
      },
    });
    expect(getVirtualLandlineDraftPrefillMock).toHaveBeenCalledTimes(1);
  });

  it('links imported interactions to an existing booking after activation', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    linkVirtualLandlineInteractionToBookingMock.mockResolvedValue({
      ok: true,
      booking: {
        id: 'booking-1',
        refNumber: 'TYR-2026-12345',
      },
    });

    const response = await actionRoute.PATCH(
      new Request('https://example.test/api/mobile/admin/virtual-landline/interactions/11111111-1111-4111-8111-111111111111', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'link_booking', bookingRef: 'TYR-2026-12345' }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      booking: {
        refNumber: 'TYR-2026-12345',
      },
    });
    expect(linkVirtualLandlineInteractionToBookingMock).toHaveBeenCalledTimes(1);
  });

  it('marks interactions reviewed after activation', async () => {
    getMobileAdminUserMock.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    markVirtualLandlineInteractionReviewedMock.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });

    const response = await actionRoute.PATCH(
      new Request('https://example.test/api/mobile/admin/virtual-landline/interactions/11111111-1111-4111-8111-111111111111', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'mark_reviewed' }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(markVirtualLandlineInteractionReviewedMock).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'admin-1',
    );
  });

  it('keeps quick-book creation linked to Virtual Landline interactions after booking save', () => {
    const source = readFileSync(join(process.cwd(), 'app/api/admin/quick-book/route.ts'), 'utf8');
    const writeIndex = source.indexOf('db\n      .update(virtualLandlineInteractions)');
    const linkFieldIndex = source.indexOf('linkedQuickBookingId: created.id');

    expect(writeIndex).toBeGreaterThan(-1);
    expect(linkFieldIndex).toBeGreaterThan(writeIndex);
  });

  it('marks the linked missed-call admin notification read when an interaction is reviewed', () => {
    const source = readFileSync(join(process.cwd(), 'lib/virtual-landline/server.ts'), 'utf8');
    const reviewIndex = source.indexOf('markVirtualLandlineInteractionReviewed');
    const notificationUpdateIndex = source.indexOf('.update(adminNotifications)', reviewIndex);
    const entityLinkIndex = source.indexOf("eq(adminNotifications.entityId, id)", notificationUpdateIndex);

    expect(reviewIndex).toBeGreaterThan(-1);
    expect(notificationUpdateIndex).toBeGreaterThan(reviewIndex);
    expect(entityLinkIndex).toBeGreaterThan(notificationUpdateIndex);
  });
});
