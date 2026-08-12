import { Pool, type QueryResultRow } from '@neondatabase/serverless';

import {
  forbiddenResponse,
  getStockApiUser,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 14;
const MAX_DAYS = 90;

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoValue(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : value;
  }
  return null;
}

function parseDays(request: Request): number {
  const url = new URL(request.url);
  const raw = Number.parseInt(url.searchParams.get('days') || String(DEFAULT_DAYS), 10);
  if (!Number.isFinite(raw)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, raw));
}

function requestedCityId(request: Request): string | null {
  const url = new URL(request.url);
  const cityId = url.searchParams.get('cityId');
  return cityId && /^[0-9a-f-]{36}$/i.test(cityId) ? cityId : null;
}

function movementItem(row: QueryResultRow) {
  return {
    id: textValue(row.id) ?? '',
    movementType: textValue(row.movement_type) ?? '',
    quantityDelta: numberValue(row.quantity_delta),
    quantity: Math.abs(numberValue(row.quantity_delta)),
    resultingBalance: numberValue(row.resulting_balance),
    saleChannel: textValue(row.sale_channel),
    reason: textValue(row.reason),
    note: textValue(row.note),
    occurredAt: isoValue(row.occurred_at),
    actor: {
      id: textValue(row.actor_user_id),
      name: textValue(row.actor_name) ?? textValue(row.actor_email) ?? 'Unknown',
      email: textValue(row.actor_email),
      role: textValue(row.actor_role),
    },
    shift: {
      id: textValue(row.shift_id),
      startedAt: isoValue(row.shift_started_at),
    },
    booking: {
      id: textValue(row.booking_id),
      refNumber: textValue(row.booking_ref),
    },
    product: {
      id: textValue(row.tyre_product_id) ?? '',
      brand: textValue(row.brand) ?? '',
      pattern: textValue(row.pattern) ?? '',
      sizeDisplay: textValue(row.size_display) ?? '',
    },
  };
}

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (user.role !== 'admin') return forbiddenResponse('Admin access required', request);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const days = parseDays(request);

  try {
    const cityRows = await client.query(
      `SELECT id, slug, name, is_active
         FROM stock_cities
        WHERE is_active = true
        ORDER BY name ASC`,
    );
    const cities = cityRows.rows.map((row) => ({
      id: textValue(row.id) ?? '',
      slug: textValue(row.slug) ?? '',
      name: textValue(row.name) ?? '',
      isActive: Boolean(row.is_active),
    }));

    const requested = requestedCityId(request);
    const selectedCity = cities.find((city) => city.id === requested) ?? cities[0] ?? null;
    if (!selectedCity) {
      return stockJsonResponse(request, {
        cities: [],
        selectedCityId: null,
        days,
        summary: {
          products: 0,
          currentStock: 0,
          availableStock: 0,
          reservedStock: 0,
          orderedStock: 0,
          toBuy: 0,
          reduced: 0,
          added: 0,
        },
        toBuy: [],
        missingTyres: [],
        reductions: [],
        additions: [],
        shifts: [],
      });
    }

    const cityId = selectedCity.id;
    const [
      summaryResult,
      toBuyResult,
      missingResult,
      reductionsResult,
      additionsResult,
      shiftsResult,
    ] = await Promise.all([
      client.query(
        `WITH recent_totals AS (
           SELECT
             COALESCE(SUM(CASE WHEN quantity_delta < 0 THEN ABS(quantity_delta) ELSE 0 END), 0)::int AS reduced,
             COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0)::int AS added
           FROM stock_movements
           WHERE city_id = $1
             AND occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
         ),
         recent_by_product AS (
           SELECT
             tyre_product_id,
             COALESCE(SUM(ABS(quantity_delta)), 0)::int AS recent_reduced
           FROM stock_movements
           WHERE city_id = $1
             AND quantity_delta < 0
             AND occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
           GROUP BY tyre_product_id
         )
         SELECT
           COUNT(b.id)::int AS products,
           COALESCE(SUM(b.current_stock), 0)::int AS current_stock,
           COALESCE(SUM(GREATEST(b.current_stock - b.reserved_stock, 0)), 0)::int AS available_stock,
           COALESCE(SUM(b.reserved_stock), 0)::int AS reserved_stock,
           COALESCE(SUM(b.ordered_stock), 0)::int AS ordered_stock,
           COALESCE(SUM(GREATEST(
             GREATEST(b.target_stock - b.current_stock - b.ordered_stock, 0),
             COALESCE(r.recent_reduced, 0)
           )), 0)::int AS to_buy,
           recent_totals.reduced,
           recent_totals.added
         FROM stock_inventory_balances b
         CROSS JOIN recent_totals
         LEFT JOIN recent_by_product r ON r.tyre_product_id = b.tyre_product_id
         WHERE b.city_id = $1
         GROUP BY recent_totals.reduced, recent_totals.added`,
        [cityId, days],
      ),
      client.query(
        `WITH recent_reductions AS (
           SELECT
             m.tyre_product_id,
             SUM(ABS(m.quantity_delta))::int AS recent_reduced,
             MAX(m.occurred_at) AS last_reduced_at,
             STRING_AGG(DISTINCT COALESCE(u.name, u.email, 'Unknown'), ', ' ORDER BY COALESCE(u.name, u.email, 'Unknown')) AS reduced_by
           FROM stock_movements m
           LEFT JOIN users u ON u.id = m.actor_user_id
           WHERE m.city_id = $1
             AND m.quantity_delta < 0
             AND m.occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
           GROUP BY m.tyre_product_id
         )
         SELECT
           b.tyre_product_id,
           p.brand,
           p.pattern,
           p.size_display,
           b.current_stock,
           b.reserved_stock,
           b.ordered_stock,
           b.min_stock,
           b.target_stock,
           GREATEST(b.target_stock - b.current_stock - b.ordered_stock, 0)::int AS suggested_buy,
           COALESCE(r.recent_reduced, 0)::int AS recent_reduced,
           GREATEST(
             GREATEST(b.target_stock - b.current_stock - b.ordered_stock, 0),
             COALESCE(r.recent_reduced, 0)
           )::int AS buy_quantity,
           r.last_reduced_at,
           r.reduced_by
         FROM stock_inventory_balances b
         INNER JOIN tyre_products p ON p.id = b.tyre_product_id
         LEFT JOIN recent_reductions r ON r.tyre_product_id = b.tyre_product_id
         WHERE b.city_id = $1
           AND (
             GREATEST(b.target_stock - b.current_stock - b.ordered_stock, 0) > 0
             OR COALESCE(r.recent_reduced, 0) > 0
           )
         ORDER BY buy_quantity DESC, r.last_reduced_at DESC NULLS LAST, p.size_display ASC
         LIMIT 40`,
        [cityId, days],
      ),
      client.query(
        `SELECT
           normalized_size,
           COUNT(*)::int AS request_count,
           MAX(r.created_at) AS last_requested_at,
           STRING_AGG(DISTINCT COALESCE(u.name, u.email, 'Unknown'), ', ' ORDER BY COALESCE(u.name, u.email, 'Unknown')) AS requested_by
         FROM missing_tyre_requests r
         LEFT JOIN users u ON u.id = r.requester_user_id
         WHERE r.city_id = $1
           AND r.created_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY normalized_size
         ORDER BY request_count DESC, last_requested_at DESC
         LIMIT 25`,
        [cityId, days],
      ),
      client.query(
        `SELECT
           m.id,
           m.tyre_product_id,
           m.movement_type,
           m.quantity_delta,
           m.resulting_balance,
           m.sale_channel,
           m.reason,
           m.note,
           m.occurred_at,
           m.actor_user_id,
           m.shift_id,
           m.booking_id,
           u.name AS actor_name,
           u.email AS actor_email,
           u.role AS actor_role,
           s.started_at AS shift_started_at,
           bk.ref_number AS booking_ref,
           p.brand,
           p.pattern,
           p.size_display
         FROM stock_movements m
         INNER JOIN tyre_products p ON p.id = m.tyre_product_id
         LEFT JOIN users u ON u.id = m.actor_user_id
         LEFT JOIN stock_shifts s ON s.id = m.shift_id
         LEFT JOIN bookings bk ON bk.id = m.booking_id
         WHERE m.city_id = $1
           AND m.quantity_delta < 0
           AND m.occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
         ORDER BY m.occurred_at DESC
         LIMIT 50`,
        [cityId, days],
      ),
      client.query(
        `SELECT
           m.id,
           m.tyre_product_id,
           m.movement_type,
           m.quantity_delta,
           m.resulting_balance,
           m.sale_channel,
           m.reason,
           m.note,
           m.occurred_at,
           m.actor_user_id,
           m.shift_id,
           m.booking_id,
           u.name AS actor_name,
           u.email AS actor_email,
           u.role AS actor_role,
           s.started_at AS shift_started_at,
           bk.ref_number AS booking_ref,
           p.brand,
           p.pattern,
           p.size_display
         FROM stock_movements m
         INNER JOIN tyre_products p ON p.id = m.tyre_product_id
         LEFT JOIN users u ON u.id = m.actor_user_id
         LEFT JOIN stock_shifts s ON s.id = m.shift_id
         LEFT JOIN bookings bk ON bk.id = m.booking_id
         WHERE m.city_id = $1
           AND m.quantity_delta > 0
           AND m.occurred_at >= NOW() - ($2::int * INTERVAL '1 day')
         ORDER BY m.occurred_at DESC
         LIMIT 50`,
        [cityId, days],
      ),
      client.query(
        `SELECT
           s.id,
           s.user_id,
           s.city_id,
           s.started_at,
           s.ended_at,
           s.status,
           s.admin_override_reason,
           u.name AS user_name,
           u.email AS user_email,
           COALESCE(COUNT(m.id) FILTER (WHERE m.movement_type = 'SALE'), 0)::int AS sale_count,
           COALESCE(SUM(ABS(m.quantity_delta)) FILTER (WHERE m.movement_type = 'SALE'), 0)::int AS tyres_sold
         FROM stock_shifts s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN stock_movements m ON m.shift_id = s.id AND m.movement_type = 'SALE'
         WHERE s.city_id = $1
           AND s.started_at >= NOW() - ($2::int * INTERVAL '1 day')
         GROUP BY s.id, u.name, u.email
         ORDER BY s.started_at DESC
         LIMIT 60`,
        [cityId, days],
      ),
    ]);

    const summaryRow = summaryResult.rows[0] ?? {};

    return stockJsonResponse(request, {
      cities,
      selectedCityId: cityId,
      days,
      summary: {
        products: numberValue(summaryRow.products),
        currentStock: numberValue(summaryRow.current_stock),
        availableStock: numberValue(summaryRow.available_stock),
        reservedStock: numberValue(summaryRow.reserved_stock),
        orderedStock: numberValue(summaryRow.ordered_stock),
        toBuy: numberValue(summaryRow.to_buy),
        reduced: numberValue(summaryRow.reduced),
        added: numberValue(summaryRow.added),
      },
      toBuy: toBuyResult.rows.map((row) => ({
        tyreProductId: textValue(row.tyre_product_id) ?? '',
        brand: textValue(row.brand) ?? '',
        pattern: textValue(row.pattern) ?? '',
        sizeDisplay: textValue(row.size_display) ?? '',
        currentStock: numberValue(row.current_stock),
        reservedStock: numberValue(row.reserved_stock),
        orderedStock: numberValue(row.ordered_stock),
        minStock: numberValue(row.min_stock),
        targetStock: numberValue(row.target_stock),
        suggestedBuy: numberValue(row.suggested_buy),
        recentReduced: numberValue(row.recent_reduced),
        buyQuantity: numberValue(row.buy_quantity),
        lastReducedAt: isoValue(row.last_reduced_at),
        reducedBy: textValue(row.reduced_by),
      })),
      missingTyres: missingResult.rows.map((row) => ({
        normalizedSize: textValue(row.normalized_size) ?? '',
        requestCount: numberValue(row.request_count),
        lastRequestedAt: isoValue(row.last_requested_at),
        requestedBy: textValue(row.requested_by),
      })),
      reductions: reductionsResult.rows.map(movementItem),
      additions: additionsResult.rows.map(movementItem),
      shifts: shiftsResult.rows.map((row) => ({
        id: textValue(row.id) ?? '',
        userId: textValue(row.user_id),
        userName: textValue(row.user_name) ?? textValue(row.user_email) ?? 'Unknown',
        userEmail: textValue(row.user_email),
        cityId: textValue(row.city_id),
        startedAt: isoValue(row.started_at),
        endedAt: isoValue(row.ended_at),
        status: textValue(row.status) ?? '',
        adminOverrideReason: textValue(row.admin_override_reason),
        saleCount: numberValue(row.sale_count),
        tyresSold: numberValue(row.tyres_sold),
      })),
    });
  } catch (error) {
    console.error('[stock/garage] failed to load garage summary', error);
    return stockJsonResponse(request, { error: 'Failed to load garage summary' }, { status: 500 });
  } finally {
    client.release();
    await pool.end();
  }
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
