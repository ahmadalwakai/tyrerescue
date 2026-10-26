import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { normalizeUkPhoneForMatching } from '@/lib/contact-normalization';

/**
 * Returning-customer matching for staff, strongest evidence first:
 *
 * 1. linked_account — the phone matches bookings owned by one customer account.
 * 2. phone          — the exact normalised UK phone matches guest bookings.
 * 3. address_tyre   — the complete normalised address and the full tyre size
 *                     (width/profile/rim) both match.
 * 4. review         — the complete address matches but nothing else does;
 *                     shown as a suggestion that needs the operator's judgement.
 *
 * Bookings store no validated address identifier (only the address text and
 * coordinates), so there is no "exact address ID" tier. A postcode on its own
 * never matches. Different accounts, and account vs guest bookings, are never
 * merged: each identity is returned as its own candidate.
 */

export type MatchConfidence = 'linked_account' | 'phone' | 'address_tyre' | 'review';

export interface MatchQuery {
  phone?: string;
  address?: string;
  tyreSize?: string;
}

export interface MatchedBooking {
  refNumber: string;
  createdAt: string | null;
  status: string;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  tyreSize: string | null;
  quantity: number | null;
  lockingNutStatus: string | null;
  paymentType: string | null;
  totalAmount: string | null;
}

export interface CustomerMatch {
  key: string;
  confidence: MatchConfidence;
  reasons: string[];
  customer: { name: string | null; phone: string | null; email: string | null; accountLinked: boolean };
  bookingCount: number;
  bookings: MatchedBooking[];
}

const CONFIDENCE_ORDER: MatchConfidence[] = ['linked_account', 'phone', 'address_tyre', 'review'];
const MAX_CANDIDATE_BOOKINGS = 60;
const BOOKINGS_PER_MATCH = 5;
const UK_POSTCODE = /^[a-z]{1,2}\d[a-z\d]? ?\d[a-z]{2}$/;

/** UK numbers only; returns the digit strings the same number is stored as. */
export function phoneMatchVariants(input: string | undefined): { normalized: string; variants: string[] } | null {
  const normalized = normalizeUkPhoneForMatching(input);
  if (!normalized) return null;
  const national = normalized.slice(2);
  return { normalized, variants: [normalized, `0${national}`, `00${normalized}`] };
}

/** Lower-case, punctuation-free, single-spaced, without a trailing country. Mirrors addressSql. */
export function normalizeAddress(input: string | undefined | null): string {
  return (input ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ (united kingdom|uk)$/, '');
}

/** A usable address has more than a postcode: at least three words and something besides the postcode. */
export function isCompleteAddress(normalized: string): boolean {
  if (!normalized || UK_POSTCODE.test(normalized)) return false;
  const words = normalized.split(' ');
  if (words.length < 3) return false;
  const withoutPostcode = normalized.replace(/\b[a-z]{1,2}\d[a-z\d]? ?\d[a-z]{2}$/, '').trim();
  return withoutPostcode.split(' ').filter(Boolean).length >= 2;
}

/** Full size only (width/profile/rim, e.g. 205/55R16); anything partial returns null. */
export function normalizeTyreSize(input: string | undefined | null): string | null {
  const match = (input ?? '').toUpperCase().replace(/\s+/g, '').match(/^(\d{3})\/?(\d{2})\/?Z?R?F?(\d{2})$/);
  return match ? `${match[1]}/${match[2]}R${match[3]}` : null;
}

const addressSql = sql`trim(regexp_replace(lower(COALESCE(b.address_line, '')), '[^a-z0-9]+', ' ', 'g'))`;

interface CandidateRow {
  user_id: string | null;
  ref_number: string;
  created_at: string | null;
  status: string;
  address_line: string | null;
  lat: string | number | null;
  lng: string | number | null;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  tyre_size_display: string | null;
  quantity: number | null;
  locking_nut_status: string | null;
  payment_type: string | null;
  total_amount: string | number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  phone_digits: string | null;
  address_norm: string;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []);
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function findReturningCustomers(query: MatchQuery): Promise<CustomerMatch[]> {
  const phone = phoneMatchVariants(query.phone);
  const address = normalizeAddress(query.address);
  const addressUsable = isCompleteAddress(address) ? address.replace(/ (united kingdom|uk)$/, '') : '';
  const tyre = normalizeTyreSize(query.tyreSize);
  if (!phone && !addressUsable) return [];

  const conditions = [];
  if (phone) conditions.push(sql`regexp_replace(COALESCE(b.customer_phone, ''), '\\D', '', 'g') IN (${sql.join(phone.variants.map((value) => sql`${value}`), sql`, `)})`);
  if (addressUsable) conditions.push(sql`regexp_replace(${addressSql}, ' (united kingdom|uk)$', '') = ${addressUsable}`);

  const result = await db.execute(sql`
    SELECT b.user_id, b.ref_number,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
      b.status, b.address_line, b.lat, b.lng, b.vehicle_reg, b.vehicle_make, b.vehicle_model,
      b.tyre_size_display, b.quantity, b.locking_nut_status, b.payment_type, b.total_amount,
      b.customer_name, b.customer_phone, b.customer_email,
      regexp_replace(COALESCE(b.customer_phone, ''), '\\D', '', 'g') AS phone_digits,
      regexp_replace(${addressSql}, ' (united kingdom|uk)$', '') AS address_norm
    FROM bookings b
    WHERE ${sql.join(conditions, sql` OR `)}
    ORDER BY b.created_at DESC NULLS LAST, b.id DESC
    LIMIT ${MAX_CANDIDATE_BOOKINGS}`);

  const groups = new Map<string, { rows: CandidateRow[]; phoneMatched: boolean; addressMatched: boolean; tyreMatched: boolean }>();
  for (const row of rowsOf<CandidateRow>(result)) {
    const rowPhone = normalizeUkPhoneForMatching(row.customer_phone ?? undefined);
    const phoneMatched = Boolean(phone && rowPhone === phone.normalized);
    const addressMatched = Boolean(addressUsable && row.address_norm === addressUsable);
    // Never merge: an account is one identity; guest bookings group by their own phone.
    const key = row.user_id ? `account:${row.user_id}` : rowPhone ? `phone:${rowPhone}` : `address:${row.address_norm}`;
    const group = groups.get(key) ?? { rows: [], phoneMatched: false, addressMatched: false, tyreMatched: false };
    group.rows.push(row);
    group.phoneMatched ||= phoneMatched;
    group.addressMatched ||= addressMatched;
    group.tyreMatched ||= Boolean(addressMatched && tyre && normalizeTyreSize(row.tyre_size_display) === tyre);
    groups.set(key, group);
  }

  const matches: CustomerMatch[] = [];
  for (const [key, group] of groups) {
    const accountLinked = key.startsWith('account:');
    let confidence: MatchConfidence;
    const reasons: string[] = [];
    if (group.phoneMatched) {
      confidence = accountLinked ? 'linked_account' : 'phone';
      reasons.push(accountLinked ? 'Phone number belongs to a customer account' : 'Same phone number');
      if (group.addressMatched) reasons.push('Same address');
    } else if (group.tyreMatched) {
      confidence = 'address_tyre';
      reasons.push('Same full address', 'Same tyre size');
    } else if (group.addressMatched) {
      confidence = 'review';
      reasons.push('Same full address only: check before using');
    } else {
      continue;
    }
    const latest = group.rows[0];
    matches.push({
      key,
      confidence,
      reasons,
      customer: { name: latest.customer_name, phone: latest.customer_phone, email: latest.customer_email, accountLinked },
      bookingCount: group.rows.length,
      bookings: group.rows.slice(0, BOOKINGS_PER_MATCH).map((row) => ({
        refNumber: row.ref_number,
        createdAt: row.created_at,
        status: row.status,
        addressLine: row.address_line,
        lat: toNumber(row.lat),
        lng: toNumber(row.lng),
        vehicleReg: row.vehicle_reg,
        vehicleMake: row.vehicle_make,
        vehicleModel: row.vehicle_model,
        tyreSize: row.tyre_size_display,
        quantity: row.quantity,
        lockingNutStatus: row.locking_nut_status,
        paymentType: row.payment_type,
        totalAmount: row.total_amount === null ? null : String(row.total_amount),
      })),
    });
  }
  return matches.sort((a, b) => CONFIDENCE_ORDER.indexOf(a.confidence) - CONFIDENCE_ORDER.indexOf(b.confidence)
    || (b.bookings[0]?.createdAt ?? '').localeCompare(a.bookings[0]?.createdAt ?? ''));
}
