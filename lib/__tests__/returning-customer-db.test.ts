import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return { ...schema, db: new Proxy({}, { get: (_, prop) => (state.db as Record<string | symbol, unknown>)[prop] }) };
});

import {
  findReturningCustomers,
  isCompleteAddress,
  normalizeAddress,
  normalizeTyreSize,
  phoneMatchVariants,
} from '../customers/returning-customer';

const pg = new PGlite();
const account = '10000000-0000-4000-8000-000000000001';
const otherAccount = '10000000-0000-4000-8000-000000000002';
let n = 0;
async function booking(values: { user?: string | null; phone: string; name: string; address: string; tyre?: string; day: number; status?: string }) {
  n += 1;
  await pg.query(`INSERT INTO bookings (id, ref_number, user_id, customer_name, customer_phone, customer_email, address_line, lat, lng,
      tyre_size_display, quantity, vehicle_reg, locking_nut_status, payment_type, total_amount, status, created_at)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, 'c@isolated.invalid', $5, 55.86, -4.25, $6, 2, 'SN12ABC', 'has_key', 'card', 120.5, $7,
      TIMESTAMPTZ '2026-10-01 10:00+00' + make_interval(days => $8))`,
  [`TYR-T-${n}`, values.user ?? null, values.name, values.phone, values.address, values.tyre ?? null, values.status ?? 'completed', values.day]);
}

beforeAll(async () => {
  state.db = drizzle(pg);
  await pg.exec(`CREATE TABLE bookings (id uuid PRIMARY KEY, ref_number text, user_id uuid, customer_name text, customer_phone text,
    customer_email text, address_line text, lat numeric, lng numeric, tyre_size_display text, quantity integer, vehicle_reg text,
    vehicle_make text, vehicle_model text, locking_nut_status text, payment_type text, total_amount numeric, status text, created_at timestamptz)`);
  // One account customer who also once booked as a guest with the same number.
  await booking({ user: account, phone: '07700 900123', name: 'Cara Account', address: '12 High Street, Glasgow G1 2AB', tyre: '205/55R16', day: 1 });
  await booking({ user: account, phone: '+44 7700 900123', name: 'Cara Account', address: '12 High Street, Glasgow G1 2AB', tyre: '205/55R16', day: 5 });
  await booking({ user: null, phone: '0044 7700-900123', name: 'Cara Guest', address: '3 Other Road, Paisley PA1 1AA', day: 3 });
  // A different account at the same address with a different number.
  await booking({ user: otherAccount, phone: '07700 900999', name: 'Neighbour', address: '12 High Street, Glasgow G1 2AB, United Kingdom', tyre: '205 55 16', day: 2 });
  // Abbreviations are not guessed: this is treated as a different address.
  await booking({ user: null, phone: '07700 900888', name: 'Abbreviated', address: '12 High St, Glasgow G1 2AB', tyre: '205/55R16', day: 7 });
  await booking({ user: null, phone: '07700 900555', name: 'Same Street Guest', address: '12 High Street, Glasgow G1 2AB', tyre: '195/65R15', day: 4 });
  // Postcode-only address must never match anything.
  await booking({ user: null, phone: '07700 900777', name: 'Postcode only', address: 'G1 2AB', day: 6 });
}, 30_000);
afterAll(async () => { await pg.close(); });

describe('returning customer normalisation', () => {
  it('accepts UK numbers in every stored format and rejects others', () => {
    expect(phoneMatchVariants('+44 (0)7700 900123')?.normalized ?? phoneMatchVariants('+44 7700 900123')?.normalized).toBe('447700900123');
    expect(phoneMatchVariants('07700 900123')?.variants).toEqual(['447700900123', '07700900123', '00447700900123']);
    expect(phoneMatchVariants('+1 415 555 0100')).toBeNull();
    expect(phoneMatchVariants('12345')).toBeNull();
  });

  it('never treats a postcode as a complete address and needs full tyre sizes', () => {
    expect(isCompleteAddress(normalizeAddress('G1 2AB'))).toBe(false);
    expect(isCompleteAddress(normalizeAddress('Glasgow G1 2AB'))).toBe(false);
    expect(isCompleteAddress(normalizeAddress('12 High Street, Glasgow G1 2AB'))).toBe(true);
    expect(normalizeAddress('12 High Street, Glasgow G1 2AB, United Kingdom')).toBe('12 high street glasgow g1 2ab');
    expect(normalizeTyreSize('205 55 r16')).toBe('205/55R16');
    expect(normalizeTyreSize('2055516')).toBe('205/55R16');
    expect(normalizeTyreSize('205/55')).toBeNull();
  });
});

describe('returning customer matching on disposable PostgreSQL', () => {
  it('finds the account by any phone format and keeps the guest identity separate', async () => {
    const matches = await findReturningCustomers({ phone: '00447700900123' });
    expect(matches.map((match) => [match.confidence, match.customer.name, match.bookingCount])).toEqual([
      ['linked_account', 'Cara Account', 2],
      ['phone', 'Cara Guest', 1],
    ]);
    expect(matches[0].bookings[0]).toMatchObject({ refNumber: 'TYR-T-2', tyreSize: '205/55R16', lat: 55.86, paymentType: 'card', totalAmount: '120.5' });
    expect(matches[0].bookings[0].createdAt).toBe('2026-10-06T10:00:00.000Z');
  });

  it('ranks address plus full tyre size above an address-only suggestion and never merges accounts', async () => {
    const matches = await findReturningCustomers({ address: '12 High Street, Glasgow G1 2AB', tyreSize: '205/55R16' });
    const byName = Object.fromEntries(matches.map((match) => [match.customer.name, match.confidence]));
    expect(byName).toEqual({ 'Cara Account': 'address_tyre', Neighbour: 'address_tyre', 'Same Street Guest': 'review' });
    expect(new Set(matches.map((match) => match.key)).size).toBe(3);
    expect(matches.at(-1)?.confidence).toBe('review');
  });

  it('matches nothing from a postcode, a partial address or an invalid phone', async () => {
    expect(await findReturningCustomers({ address: 'G1 2AB' })).toEqual([]);
    expect(await findReturningCustomers({ address: 'Glasgow G1 2AB', tyreSize: '205/55R16' })).toEqual([]);
    expect(await findReturningCustomers({ phone: '+1 415 555 0100' })).toEqual([]);
  });
});
