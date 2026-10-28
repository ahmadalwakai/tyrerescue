import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cleanContactText, normalizeUkPhoneForMatching } from '@/lib/contact-normalization';

// These are evidence tiers, not verified identities. A shared or reassigned
// number can belong to a different person. Staff confirm before copying details.
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
  // Exact count of bookings matching this query for the candidate, not all
  // bookings ever placed by a person/account or just the five shown below.
  bookingCount: number;
  bookings: MatchedBooking[];
}

const MAX_CANDIDATES = 20;
const BOOKINGS_PER_MATCH = 5;
const UK_POSTCODE = /^[a-z]{1,2}\d[a-z\d]? ?\d[a-z]{2}$/;

/** UK numbers only; do not interpret letters/extensions as a different number. */
export function phoneMatchVariants(input: string | undefined): { normalized: string; variants: string[] } | null {
  if (!input || !/^\+?[\d\s().-]+$/.test(cleanContactText(input))) return null;
  const normalized = normalizeUkPhoneForMatching(input);
  if (!normalized || !/^44[1-9]\d{8,9}$/.test(normalized)) return null;
  return { normalized, variants: [normalized, `0${normalized.slice(2)}`, `00${normalized}`] };
}

/** Mirrors address_norm in the query: exact full address, never postcode alone. */
export function normalizeAddress(input: string | undefined | null): string {
  return (input ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ (united kingdom|uk)$/, '');
}

export function isCompleteAddress(normalized: string): boolean {
  if (!normalized || UK_POSTCODE.test(normalized) || normalized.split(' ').length < 3) return false;
  const withoutPostcode = normalized.replace(/\b[a-z]{1,2}\d[a-z\d]? ?\d[a-z]{2}$/, '').trim();
  return withoutPostcode.split(' ').filter(Boolean).length >= 2;
}

/** Full width/profile/rim only; a partial size cannot strengthen an address match. */
export function normalizeTyreSize(input: string | undefined | null): string | null {
  const match = (input ?? '').toUpperCase().replace(/\s+/g, '').match(/^(\d{3})\/?(\d{2})\/?Z?R?F?(\d{2})$/);
  return match ? `${match[1]}/${match[2]}R${match[3]}` : null;
}

export function isSupportedMatchQuery(query: MatchQuery): boolean {
  return Boolean(phoneMatchVariants(query.phone) || isCompleteAddress(normalizeAddress(query.address)));
}

interface CandidateRow {
  match_key: string;
  match_priority: number;
  booking_count: string | number;
  phone_matched: boolean;
  address_matched: boolean;
  user_id: string | null;
  ref_number: string;
  created_at_iso: string | null;
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
}

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? result as T[] : ((result as { rows?: T[] } | null)?.rows ?? []);
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: string | null, maxLength: number): string | null {
  return value === null ? null : value.slice(0, maxLength);
}

/** Read-only, staff-only candidates from bookings. Never merges or links accounts. */
export async function findReturningCustomers(query: MatchQuery): Promise<CustomerMatch[]> {
  const phone = phoneMatchVariants(query.phone);
  const address = normalizeAddress(query.address);
  const addressUsable = isCompleteAddress(address) ? address : '';
  const tyre = normalizeTyreSize(query.tyreSize)?.replace(/\D/g, '') ?? null;
  if (!phone && !addressUsable) throw new Error('Unsupported customer match query');

  const phoneMatch = phone ? sql`phone_norm = ${phone.normalized}` : sql`false`;
  const addressMatch = addressUsable ? sql`address_norm = ${addressUsable}` : sql`false`;
  const tyreMatch = addressUsable && tyre ? sql`address_norm = ${addressUsable} AND tyre_norm = ${tyre}` : sql`false`;

  // Count and rank all matching rows before limiting candidates/details. In
  // particular, many recent address-only results cannot hide an older phone hit.
  // One statement keeps the count and the displayed history on the same snapshot.
  const result = await db.execute(sql`
    WITH source AS (
      SELECT b.*,
        regexp_replace(replace(normalize(COALESCE(b.customer_phone, ''), NFKC), '(0)', ''), '[^0-9]', '', 'g') AS phone_digits,
        regexp_replace(trim(regexp_replace(lower(COALESCE(b.address_line, '')), '[^a-z0-9]+', ' ', 'g')), ' (united kingdom|uk)$', '') AS address_norm,
        regexp_replace(upper(COALESCE(b.tyre_size_display, '')), '\\s+', '', 'g') AS tyre_compact
      FROM bookings b
    ), normalized AS (
      SELECT source.*,
        CASE
          WHEN phone_digits ~ '^0044[1-9][0-9]{8,9}$' THEN substring(phone_digits FROM 3)
          WHEN phone_digits ~ '^0[1-9][0-9]{8,9}$' THEN '44' || substring(phone_digits FROM 2)
          WHEN phone_digits ~ '^44[1-9][0-9]{8,9}$' THEN phone_digits
          ELSE NULL
        END AS phone_norm,
        CASE WHEN tyre_compact ~ '^[0-9]{3}/?[0-9]{2}/?Z?R?F?[0-9]{2}$'
          THEN regexp_replace(tyre_compact, '[^0-9]', '', 'g') ELSE NULL END AS tyre_norm
      FROM source
    ), matched AS (
      SELECT normalized.*,
        CASE WHEN user_id IS NOT NULL THEN 'account:' || user_id::text
          WHEN phone_norm IS NOT NULL THEN 'phone:' || phone_norm
          ELSE 'booking:' || id::text END AS match_key,
        ${phoneMatch} AS phone_matched,
        ${addressMatch} AS address_matched,
        ${tyreMatch} AS tyre_matched
      FROM normalized
      WHERE (${phoneMatch}) OR (${addressMatch})
    ), candidates AS (
      SELECT match_key, count(*) AS booking_count, max(created_at) AS latest_at,
        bool_or(phone_matched) AS phone_matched, bool_or(address_matched) AS address_matched,
        CASE WHEN bool_or(phone_matched) AND bool_or(user_id IS NOT NULL) THEN 0
          WHEN bool_or(phone_matched) THEN 1
          WHEN bool_or(tyre_matched) THEN 2 ELSE 3 END AS match_priority
      FROM matched
      GROUP BY match_key
      ORDER BY match_priority, latest_at DESC NULLS LAST, match_key
      LIMIT ${MAX_CANDIDATES}
    ), ranked AS (
      SELECT m.*, c.booking_count, c.latest_at, c.match_priority,
        c.phone_matched AS group_phone_matched, c.address_matched AS group_address_matched,
        row_number() OVER (PARTITION BY m.match_key ORDER BY m.created_at DESC NULLS LAST, m.id DESC) AS booking_rank
      FROM matched m JOIN candidates c USING (match_key)
    )
    SELECT match_key, booking_count, match_priority, group_phone_matched AS phone_matched,
      group_address_matched AS address_matched, user_id, ref_number,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso,
      status, address_line, lat, lng, vehicle_reg, vehicle_make, vehicle_model,
      tyre_size_display, quantity, locking_nut_status, payment_type, total_amount,
      customer_name, customer_phone, customer_email
    FROM ranked
    WHERE booking_rank <= ${BOOKINGS_PER_MATCH}
    ORDER BY match_priority, latest_at DESC NULLS LAST, match_key, booking_rank`);

  const matches = new Map<string, CustomerMatch>();
  const confidenceByPriority: MatchConfidence[] = ['linked_account', 'phone', 'address_tyre', 'review'];
  for (const row of rowsOf<CandidateRow>(result)) {
    let match = matches.get(row.match_key);
    if (!match) {
      const confidence = confidenceByPriority[row.match_priority];
      const accountLinked = row.user_id !== null;
      const reasons = row.phone_matched
        ? [accountLinked ? 'Bookings linked to an account use the same phone number' : 'Bookings use the same phone number']
        : confidence === 'address_tyre' ? ['Same full address', 'Same tyre size'] : ['Same full address only: check before using'];
      if (row.phone_matched && row.address_matched) reasons.push('Same address');
      const bookingCount = Number(row.booking_count);
      if (!Number.isSafeInteger(bookingCount) || bookingCount < 1) throw new Error('Invalid customer history count');
      match = {
        key: row.match_key, confidence, reasons,
        customer: {
          name: text(row.customer_name, 200), phone: text(row.customer_phone, 40),
          email: text(row.customer_email, 254), accountLinked,
        },
        bookingCount, bookings: [],
      };
      matches.set(row.match_key, match);
    }
    match.bookings.push({
      refNumber: row.ref_number, createdAt: row.created_at_iso, status: text(row.status, 50) ?? '',
      addressLine: text(row.address_line, 500), lat: toNumber(row.lat), lng: toNumber(row.lng),
      vehicleReg: text(row.vehicle_reg, 30), vehicleMake: text(row.vehicle_make, 100), vehicleModel: text(row.vehicle_model, 100),
      tyreSize: text(row.tyre_size_display, 30), quantity: row.quantity,
      lockingNutStatus: text(row.locking_nut_status, 50), paymentType: text(row.payment_type, 50),
      totalAmount: row.total_amount === null ? null : String(row.total_amount),
    });
  }
  return [...matches.values()];
}
