import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({ user: null as null | { id: string }, access: false, rows: [] as unknown[][], writes: [] as unknown[] }));
vi.mock('@/app/api/mobile/customer/_lib', () => ({ getCustomerMobileUser: async () => mocks.user, unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) }));
vi.mock('@/lib/customer-booking-access', () => ({ authorizeCustomerBooking: async () => mocks.access }));
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from() { return this; }, where() { return this; }, limit: async () => mocks.rows.shift() ?? [] }),
  execute: async (statement: unknown) => { mocks.writes.push(statement); return { rows: [] }; },
  // Interactive transactions are intentionally absent: production uses Neon HTTP.
} }));
import { POST, DELETE } from '@/app/api/mobile/customer/push-token/route';

const token = 'ExponentPushToken[device_a]';
const request = (method: string, body: unknown) => new NextRequest('https://example.test/api/mobile/customer/push-token', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const query = () => new PgDialect().sqlToQuery(mocks.writes[0] as Parameters<PgDialect['sqlToQuery']>[0]);
beforeEach(() => { mocks.user = null; mocks.access = false; mocks.rows = []; mocks.writes = []; });

describe('customer device subscription access', () => {
  it('rejects a guessed reference and matching email without a capability', async () => {
    mocks.rows.push([{ id: 'booking-a', refNumber: 'TR-A', userId: 'owner-a' }]);
    expect((await POST(request('POST', { token, refNumber: 'TR-A', email: 'customer@example.test' }))).status).toBe(403);
    expect(mocks.writes).toHaveLength(0);
  });
  it('rejects another customer even when the booking has not been claimed', async () => {
    mocks.user = { id: 'attacker' };
    mocks.rows.push([{ id: 'booking-a', refNumber: 'TR-A', userId: null }]);
    expect((await POST(request('POST', { token, refNumber: 'TR-A' }))).status).toBe(403);
    expect(mocks.writes).toHaveLength(0);
  });
  it('atomically registers a guest proof without adopting its booking owner account', async () => {
    mocks.access = true;
    mocks.rows.push([{ id: 'booking-a', refNumber: 'TR-A', userId: 'owner-a' }]);
    expect((await POST(request('POST', { token, refNumber: 'TR-A' }))).status).toBe(200);
    expect(mocks.writes).toHaveLength(1);
    expect(query().params).toEqual([null, token, 'ios', 'booking-a', null, 'booking-a']);
    expect(query().sql).toContain('WITH device AS');
    expect(query().sql).toContain('ON CONFLICT (push_token_id, booking_id)');
    expect(query().params).not.toContain('owner-a');
  });
  it('binds an authenticated device without requiring one latest booking', async () => {
    mocks.user = { id: 'owner-a' };
    expect((await POST(request('POST', { token }))).status).toBe(200);
    expect(query().params).toEqual(['owner-a', token, 'ios', null, 'owner-a', null]);
  });
  it('requires the current device token for logout and clears only its account subscriptions atomically', async () => {
    mocks.user = { id: 'owner-a' };
    expect((await DELETE(request('DELETE', {}))).status).toBe(400);
    expect((await DELETE(request('DELETE', { token }))).status).toBe(200);
    expect(mocks.writes).toHaveLength(1);
    expect(query().params).toEqual(['owner-a', token]);
    expect(query().sql).toContain('AND token =');
    expect(query().sql).toContain('WHERE id IN (SELECT id FROM target)');
  });
});
