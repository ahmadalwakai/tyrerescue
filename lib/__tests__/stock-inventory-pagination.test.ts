import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown, sharedWorkerMode: false, authorized: true, access: true }));
vi.mock('@/lib/db', async () => ({
  ...(await import('../db/schema')),
  db: new Proxy({}, { get: (_target, property) => (state.db as Record<PropertyKey, unknown>)[property] }),
}));
vi.mock('../../app/api/stock/_lib', () => ({
  canUseSharedStockWorkerMode: () => state.sharedWorkerMode,
  getStockApiUser: async () => state.authorized ? { id: USER_ID, role: 'admin', email: 'fixture@example.test', name: 'Fixture' } : null,
  getStockCityAccess: async (_user: unknown, cityId: string) => state.access ? { city: { id: cityId, slug: 'glasgow', name: 'Glasgow' }, roleInCity: 'manager' } : null,
  stockJsonResponse: (_request: Request, payload: unknown, init?: ResponseInit) => NextResponse.json(payload, init),
  stockCorsPreflight: () => new NextResponse(null, { status: 204 }),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: () => NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  validationErrorResponse: (error: unknown) => NextResponse.json({ error }, { status: 400 }),
}));

import { GET as getInventory } from '../../app/api/stock/cities/[cityId]/inventory/route';
import { GET as getCities } from '../../app/api/stock/cities/route';
import { GET as getMovements } from '../../app/api/stock/cities/[cityId]/movements/route';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const CITY_ID = '20000000-0000-4000-8000-000000000002';
const OTHER_CITY_ID = '30000000-0000-4000-8000-000000000003';
const pg = new PGlite();

async function inventory(query = '') {
  const response = await getInventory(new Request(`https://isolated.test/api/stock/cities/${CITY_ID}/inventory?${query}`), {
    params: Promise.resolve({ cityId: CITY_ID }),
  });
  expect(response.status).toBe(200);
  return response.json();
}

beforeAll(async () => {
  state.db = drizzle(pg, { schema });
  await pg.exec(`
    CREATE TABLE tyre_products (
      id uuid PRIMARY KEY, brand text, pattern text, size_display text, season text,
      price_new numeric, available_new boolean
    );
    CREATE TABLE stock_inventory_balances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid, tyre_product_id uuid,
      current_stock int, reserved_stock int, ordered_stock int, min_stock int, target_stock int,
      updated_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE stock_cities (
      id uuid PRIMARY KEY, slug text, name text, is_active boolean,
      created_at timestamptz DEFAULT NOW(), updated_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE stock_user_city_access (
      user_id uuid, city_id uuid, role_in_city text, is_active boolean
    );
    CREATE TABLE users (id uuid PRIMARY KEY, name text);
    CREATE TABLE stock_movements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), city_id uuid, tyre_product_id uuid,
      movement_type text, quantity_delta int, previous_balance int, resulting_balance int,
      actor_user_id uuid, shift_id uuid, booking_id uuid, sale_channel text,
      reverses_movement_id uuid, idempotency_key text, reason text, note text,
      occurred_at timestamptz DEFAULT NOW()
    );
    INSERT INTO stock_cities (id,slug,name,is_active) VALUES ('${CITY_ID}','glasgow','Glasgow',true);
    INSERT INTO stock_user_city_access VALUES ('${USER_ID}','${CITY_ID}','manager',true);
    INSERT INTO tyre_products (id,brand,pattern,size_display,season,price_new,available_new)
      SELECT ('40000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
        CASE WHEN i = 1 THEN 'Find me' ELSE 'Other' END, 'Road',
        '205/55/R' || lpad(i::text,3,'0'), CASE WHEN i = 1 THEN 'winter' ELSE 'summer' END,50,true
      FROM generate_series(1,55) AS i;
    INSERT INTO stock_inventory_balances (city_id,tyre_product_id,current_stock,reserved_stock,ordered_stock,min_stock,target_stock)
      SELECT '${CITY_ID}',id,2,3,1,1,7 FROM tyre_products;
    INSERT INTO stock_inventory_balances (city_id,tyre_product_id,current_stock,reserved_stock,ordered_stock,min_stock,target_stock)
      SELECT '${OTHER_CITY_ID}',id,500,0,0,0,1000 FROM tyre_products;
    INSERT INTO users VALUES ('${USER_ID}', 'Fixture User');
    INSERT INTO stock_movements (city_id,tyre_product_id,movement_type,quantity_delta,previous_balance,resulting_balance,actor_user_id,idempotency_key,sale_channel)
      VALUES ('${CITY_ID}','40000000-0000-4000-8000-000000000001','SALE',-2,10,8,'${USER_ID}','saved-sale:key/1','GARAGE'),
        ('${OTHER_CITY_ID}','40000000-0000-4000-8000-000000000001','SALE',-1,10,9,'${USER_ID}','other-city:key/2','GARAGE'),
        ('${CITY_ID}','40000000-0000-4000-8000-000000000002','RECEIVED',3,10,13,'${USER_ID}','another-receipt',NULL);
  `);
}, 30_000);

afterAll(async () => { await pg.close(); });
beforeEach(() => { state.sharedWorkerMode = false; state.authorized = true; state.access = true; });

describe('city inventory totals and pagination against isolated PostgreSQL', () => {
  it('returns all 55 products across pages while keeping city totals constant', async () => {
    const first = await inventory();
    const second = await inventory('page=2');
    expect(first).toMatchObject({ page: 1, totalPages: 2, totalCount: 55 });
    expect(first.items).toHaveLength(50);
    expect(second).toMatchObject({ page: 2, totalPages: 2, totalCount: 55 });
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map(item => item.tyreProductId)).size).toBe(55);
    expect(first.summary).toEqual({ current: 110, available: -55, reserved: 165, toBuy: 220, totalProducts: 55 });
    expect(second.summary).toEqual(first.summary);
  });

  it('keeps totals independent of search, season filters and an empty result', async () => {
    const filtered = await inventory('search=Find&season=winter');
    const empty = await inventory('search=No-such-brand');
    expect(filtered.totalCount).toBe(1);
    expect(empty.totalCount).toBe(0);
    expect(empty.items).toEqual([]);
    expect(filtered.summary).toEqual({ current: 110, available: -55, reserved: 165, toBuy: 220, totalProducts: 55 });
    expect(empty.summary).toEqual(filtered.summary);
  });

  it('finds the exact selected product beyond the first page while preserving city totals', async () => {
    const tyreProductId = '40000000-0000-4000-8000-000000000055';
    const first = await inventory();
    expect(first.items.some(item => item.tyreProductId === tyreProductId)).toBe(false);
    const selected = await inventory(`tyreProductId=${tyreProductId}`);
    expect(selected.totalCount).toBe(1);
    expect(selected.items[0].tyreProductId).toBe(tyreProductId);
    expect(selected.summary).toEqual(first.summary);
    expect((await inventory(`tyreProductId=${tyreProductId}&season=winter`)).totalCount).toBe(0);
    const invalid = await getInventory(new Request('https://isolated.test/inventory?tyreProductId=invalid'), { params: Promise.resolve({ cityId: CITY_ID }) });
    expect(invalid.status).toBe(400);
  });

  it('sums purchase needs per product without letting excess stock offset another size', async () => {
    await pg.exec('BEGIN');
    try {
      await pg.query('UPDATE stock_inventory_balances SET current_stock=30 WHERE city_id=$1 AND tyre_product_id=$2', [
        CITY_ID, '40000000-0000-4000-8000-000000000001',
      ]);
      expect((await inventory()).summary).toEqual({ current: 138, available: -27, reserved: 165, toBuy: 216, totalProducts: 55 });
    } finally {
      await pg.exec('ROLLBACK');
    }
  });

  it('sorts by available stock after reservations rather than physical stock', async () => {
    await pg.exec('BEGIN');
    try {
      await pg.query('UPDATE stock_inventory_balances SET current_stock=10,reserved_stock=9 WHERE city_id=$1 AND tyre_product_id=$2', [CITY_ID, '40000000-0000-4000-8000-000000000001']);
      await pg.query('UPDATE stock_inventory_balances SET current_stock=5,reserved_stock=0 WHERE city_id=$1 AND tyre_product_id=$2', [CITY_ID, '40000000-0000-4000-8000-000000000002']);
      const sorted = await inventory('sort=stock');
      expect(sorted.items.slice(0, 2).map(item => ({ id: item.tyreProductId, current: item.currentStock, available: item.availableStock }))).toEqual([
        { id: '40000000-0000-4000-8000-000000000002', current: 5, available: 5 },
        { id: '40000000-0000-4000-8000-000000000001', current: 10, available: 1 },
      ]);
    } finally {
      await pg.exec('ROLLBACK');
    }
  });

  it('normalizes invalid pagination and returns zero totals for an empty city', async () => {
    expect((await inventory('page=invalid')).page).toBe(1);
    await pg.query('DELETE FROM stock_inventory_balances WHERE city_id=$1', [CITY_ID]);
    const empty = await inventory();
    expect(empty.summary).toEqual({ current: 0, available: 0, reserved: 0, toBuy: 0, totalProducts: 0 });
    expect(empty.totalCount).toBe(0);
  });

  it('returns server-authorized shared worker capability with existing city fields', async () => {
    const read = async () => (await getCities(new Request('https://isolated.test/api/stock/cities'))).json();
    expect(await read()).toMatchObject({ capabilities: { sharedWorkerMode: false }, items: [{ id: CITY_ID, roleInCity: 'manager' }] });
    state.sharedWorkerMode = true;
    expect((await read()).capabilities.sharedWorkerMode).toBe(true);
  });
});

describe('stock movement receipt lookup', () => {
  const lookup = (key: string, cityId = CITY_ID) => getMovements(new Request(`https://isolated.test/movements?perPage=1&idempotencyKey=${encodeURIComponent(key)}`), { params: Promise.resolve({ cityId }) });

  it('returns an exact saved receipt in the requested city without needing an active shift', async () => {
    const response = await lookup('saved-sale:key/1');
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.totalCount).toBe(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ cityId: CITY_ID, tyreProductId: '40000000-0000-4000-8000-000000000001', movementType: 'SALE', quantityDelta: -2, idempotencyKey: 'saved-sale:key/1' });
    expect((await (await lookup('saved-sale:key/1', OTHER_CITY_ID)).json()).items).toEqual([]);
    expect((await (await lookup('unknown-key')).json()).items).toEqual([]);
  });

  it('retains authentication and city access checks', async () => {
    state.authorized = false;
    expect((await lookup('saved-sale:key/1')).status).toBe(401);
    state.authorized = true;
    state.access = false;
    expect((await lookup('saved-sale:key/1')).status).toBe(403);
  });

  it.each(['', '   ', 'x'.repeat(201)])('rejects invalid receipt key lengths', async (key) => {
    expect((await lookup(key)).status).toBe(400);
  });
});
