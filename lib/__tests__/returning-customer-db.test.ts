import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseIncomingCallerHistory } from '../../assisted-chat-app/src/lib/incoming-caller-history';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return { ...schema, db: new Proxy({}, { get: (_, prop) => (state.db as Record<string | symbol, unknown>)[prop] }) };
});

import {
  findReturningCustomers,
  isCompleteAddress,
  isSupportedMatchQuery,
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
    expect(phoneMatchVariants('+44 (0)7700 900123')?.normalized).toBe('447700900123');
    expect(phoneMatchVariants('07700 900123')?.variants).toEqual(['447700900123', '07700900123', '00447700900123']);
    expect(phoneMatchVariants('+1 415 555 0100')).toBeNull();
    expect(phoneMatchVariants('12345')).toBeNull();
    expect(phoneMatchVariants('phone07700900123')).toBeNull();
    expect(phoneMatchVariants('07700900123 ext. 5')).toBeNull();
    expect(phoneMatchVariants('++447700900123')).toBeNull();
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

  it('rejects unsupported inputs rather than implying there is no customer history', async () => {
    for (const query of [{ address: 'G1 2AB' }, { address: 'Glasgow G1 2AB', tyreSize: '205/55R16' }, { phone: '+1 415 555 0100' }, {}]) {
      expect(isSupportedMatchQuery(query)).toBe(false);
      await expect(findReturningCustomers(query)).rejects.toThrow('Unsupported customer match query');
    }
    expect(await findReturningCustomers({ phone: '07700900666' })).toEqual([]);
  });

  it('matches national, international, optional trunk and full-width stored phone formats', async () => {
    for (const phone of ['07700 900321', '+44 7700 900321', '0044-7700-900321', '+44 (0)7700 900321', '０７７００９００３２１']) {
      await booking({ phone, name: 'Same number', address: '45 Number Lane, Glasgow G2 1AA', day: 12 });
    }
    for (const phone of ['07700900321', '+447700900321', '00447700900321', '+44 (0)7700 900321']) {
      const matches = await findReturningCustomers({ phone });
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ key: 'phone:447700900321', bookingCount: 5, confidence: 'phone' });
    }
  });

  it('does not merge multiple accounts or guest bookings using the same phone', async () => {
    const phone = '07700900444';
    for (const user of [account, otherAccount, null]) {
      await booking({ user, phone, name: 'Shared number', address: '9 Shared Road, Glasgow G3 1AA', day: 15 });
    }
    const matches = await findReturningCustomers({ phone });
    expect(matches).toHaveLength(3);
    expect(new Set(matches.map((match) => match.key)).size).toBe(3);
    expect(matches.map((match) => match.confidence)).toEqual(['linked_account', 'linked_account', 'phone']);
    expect(matches.every((match) => match.bookingCount === 1)).toBe(true);
    expect(matches[0].reasons[0]).toBe('Bookings linked to an account use the same phone number');
    expect(JSON.stringify(matches)).not.toContain('belongs to');
  });

  it('counts every matching booking beyond 60 while returning only the five latest', async () => {
    const phone = '07700901555';
    for (let index = 0; index < 75; index++) {
      await booking({ user: account, phone, name: 'Long history', address: '70 History Road, Glasgow G4 1AA', day: index });
    }
    // Same account, different number/address: it is not part of this query's count.
    await booking({ user: account, phone: '07700901556', name: 'Other number', address: '71 Other Road, Glasgow G4 1AB', day: 90 });
    const matches = await findReturningCustomers({ phone });
    expect(matches).toHaveLength(1);
    expect(matches[0].bookingCount).toBe(75);
    expect(matches[0].bookings).toHaveLength(5);
    expect(matches[0].bookings.map((entry) => entry.createdAt)).toEqual(
      [74, 73, 72, 71, 70].map((day) => new Date(Date.UTC(2026, 9, 1 + day, 10)).toISOString()),
    );
  });

  it('bounds candidates after ranking so an older phone hit survives many newer address matches', async () => {
    const address = '8 Busy Street, Glasgow G5 1AA';
    await booking({ phone: '07700900600', name: 'Phone hit', address: '22 Different Street, Glasgow G5 1AB', day: 0 });
    for (let index = 0; index < 65; index++) {
      await booking({ phone: `07700800${String(index).padStart(3, '0')}`, name: 'Address hit', address, tyre: '205/55R16', day: 40 + index });
    }
    const matches = await findReturningCustomers({ phone: '07700900600', address, tyreSize: '205/55R16' });
    expect(matches).toHaveLength(20);
    expect(matches[0]).toMatchObject({ confidence: 'phone', customer: { name: 'Phone hit' } });
    expect(matches.slice(1).every((match) => match.confidence === 'address_tyre')).toBe(true);
  });

  it('keeps different anonymous bookings separate even at the same full address', async () => {
    const address = '10 Anonymous Road, Glasgow G6 1AA';
    for (const name of ['One visitor', 'Another visitor']) {
      await booking({ phone: 'withheld', name, address, day: 3 });
    }
    const matches = await findReturningCustomers({ address });
    expect(matches).toHaveLength(2);
    expect(matches.every((match) => match.key.startsWith('booking:') && match.bookingCount === 1)).toBe(true);
  });

  it('bounds free text returned from historical data', async () => {
    await booking({ phone: '07700901777', name: 'N'.repeat(2_000), address: 'A'.repeat(2_000), status: 'S'.repeat(2_000), day: 2 });
    const [match] = await findReturningCustomers({ phone: '07700901777' });
    expect(match.customer.name).toHaveLength(200);
    expect(match.bookings[0].addressLine).toHaveLength(500);
    expect(match.bookings[0].status).toHaveLength(50);
  });

  it('preserves found histories through the database-to-mobile contract, including stored phone formats', async () => {
    const incomingPhone = '+447700901888';
    const storedPhones = ['+44 (0)7700 901888', '０７７００９０１８８８'];
    for (let index = 0; index < 6; index++) {
      await booking({
        user: account, phone: storedPhones[index % 2], name: 'سارة / Contract Account',
        address: '18 Contract Road, Glasgow G7 1AA', tyre: '205/55R16', day: 20 + index,
      });
    }
    await booking({
      phone: storedPhones[0], name: 'Contract Guest',
      address: '19 Contract Road, Glasgow G7 1AB', day: 26,
    });

    // Exercise the actual SQL result and JSON transport shape, not a hand-built
    // mobile fixture. No conversion or cleanup is allowed between the two ends.
    const payload = JSON.parse(JSON.stringify({ matches: await findReturningCustomers({ phone: incomingPhone }) }));
    const parsed = parseIncomingCallerHistory(payload, incomingPhone);

    expect(parsed.status).toBe('found');
    expect(parsed.matches).toEqual(payload.matches);
    expect(parsed.matches.map((match) => [match.bookingCount, match.bookings.length])).toEqual([[6, 5], [1, 1]]);
    expect(parsed.matches[0].customer).toMatchObject({
      name: 'سارة / Contract Account', phone: storedPhones[1], email: 'c@isolated.invalid', accountLinked: true,
    });
    expect(parsed.matches[1].customer).toMatchObject({ phone: storedPhones[0], accountLinked: false });
    expect(parsed.matches[0].bookings[0]).toMatchObject({
      createdAt: '2026-10-26T10:00:00.000Z', status: 'completed', quantity: 2,
      lat: 55.86, lng: -4.25, tyreSize: '205/55R16', totalAmount: '120.5',
      vehicleReg: 'SN12ABC', vehicleMake: null, vehicleModel: null,
    });
  });

  it('preserves a successful empty lookup through the database-to-mobile contract as not_found', async () => {
    const incomingPhone = '+447700901999';
    const payload = JSON.parse(JSON.stringify({ matches: await findReturningCustomers({ phone: incomingPhone }) }));
    expect(payload).toEqual({ matches: [] });
    expect(parseIncomingCallerHistory(payload, incomingPhone)).toEqual({ status: 'not_found', matches: [] });
  });
});
