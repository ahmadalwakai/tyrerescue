/**
 * Tyre Rescue → tyrerepair.uk + TyreSOS stock push.
 *
 * Tyre Rescue is the single source of truth for stock. Whenever a tyre's
 * quantity / price / availability changes here, we push the change to both
 * tyrerepair.uk and TyreSOS (Perth) so their local mirrors update instantly.
 * Each receiver also pulls a full reconcile on a cron as a safety net.
 *
 * Server-to-server, authenticated with the shared integration secret.
 */
import { inArray, eq } from 'drizzle-orm';
import { db, tyreProducts, tyreCatalogue } from '@/lib/db';

const BASE_URL_ENV = 'TYREREPAIR_API_BASE_URL';
const SECRET_ENV = 'TYRERESCUE_INTEGRATION_SECRET';
const WEBHOOK_PATH = '/api/integrations/tyrerescue/stock-webhook';

// TyreSOS (Perth) mirror destination
const TYRESOS_BASE_URL_ENV = 'TYRESOS_API_BASE_URL';
const TYRESOS_SECRET_ENV = 'TYRESOS_INTEGRATION_SECRET';
const TYRESOS_WEBHOOK_PATH = '/api/integrations/tyrerepair/stock';

function getConfig(): { url: string; secret: string } | null {
  const baseUrl = (process.env[BASE_URL_ENV] ?? '').trim().replace(/\/$/, '');
  const secret = (process.env[SECRET_ENV] ?? '').trim();
  if (!baseUrl || !secret) return null;
  return { url: `${baseUrl}${WEBHOOK_PATH}`, secret };
}

function getTyreSOSConfig(): { url: string; secret: string } | null {
  const baseUrl = (process.env[TYRESOS_BASE_URL_ENV] ?? '').trim().replace(/\/$/, '');
  const secret = (process.env[TYRESOS_SECRET_ENV] ?? '').trim();
  if (!baseUrl || !secret) return null;
  return { url: `${baseUrl}${TYRESOS_WEBHOOK_PATH}`, secret };
}

export function isTyrerepairPushConfigured(): boolean {
  return getConfig() !== null;
}

export function isTyreSosPushConfigured(): boolean {
  return getTyreSOSConfig() !== null;
}

async function postToUrl(url: string, secret: string, body: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-integration-key': secret,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // Best-effort; cron reconcile is the safety net.
  }
}

async function postWebhook(body: unknown): Promise<void> {
  const config = getConfig();
  const tyreSosConfig = getTyreSOSConfig();
  await Promise.allSettled([
    config ? postToUrl(config.url, config.secret, body) : Promise.resolve(),
    tyreSosConfig ? postToUrl(tyreSosConfig.url, tyreSosConfig.secret, body) : Promise.resolve(),
  ]);
}

/** Shape tyrerepair's webhook expects (mirrors the inbound stock GET endpoint). */
async function buildItems(productIds: string[]) {
  const ids = [...new Set(productIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      barcode: tyreProducts.barcode,
      priceNew: tyreProducts.priceNew,
      stockNew: tyreProducts.stockNew,
      stockOrdered: tyreProducts.stockOrdered,
      isLocalStock: tyreProducts.isLocalStock,
      availableNew: tyreProducts.availableNew,
      tier: tyreCatalogue.tier,
      updatedAt: tyreProducts.updatedAt,
    })
    .from(tyreProducts)
    .leftJoin(tyreCatalogue, eq(tyreCatalogue.id, tyreProducts.catalogueId))
    .where(inArray(tyreProducts.id, ids));

  return rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    pattern: r.pattern,
    width: r.width,
    aspect: r.aspect,
    rim: r.rim,
    sizeDisplay: r.sizeDisplay,
    season: r.season,
    tier: r.tier ?? 'mid',
    barcode: r.barcode ?? null,
    priceNew: r.priceNew != null ? Number(r.priceNew) : null,
    stockNew: r.stockNew ?? 0,
    stockOrdered: r.stockOrdered ?? 0,
    isLocalStock: Boolean(r.isLocalStock),
    availableNew: Boolean(r.availableNew),
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }));
}

/**
 * Push the current state of the given products to tyrerepair. Fire-and-forget:
 * call without awaiting from request handlers.
 */
export async function notifyTyrerepairStockChanged(productIds: string[]): Promise<void> {
  if (!isTyrerepairPushConfigured()) return;
  const items = await buildItems(productIds);
  if (items.length === 0) return;
  await postWebhook({ items });
}

/** Push deletions so tyrerepair marks the mirrored tyres unavailable. */
export async function notifyTyrerepairStockRemoved(productIds: string[]): Promise<void> {
  if (!isTyrerepairPushConfigured()) return;
  const removedIds = [...new Set(productIds.filter((id) => typeof id === 'string' && id.length > 0))];
  if (removedIds.length === 0) return;
  await postWebhook({ removedIds });
}

/**
 * Convenience: fire a change push without awaiting. Swallows all errors so it
 * can be dropped into any mutation path safely.
 */
export function fireTyrerepairStockChanged(productIds: string[]): void {
  void notifyTyrerepairStockChanged(productIds).catch(() => {});
}

export function fireTyrerepairStockRemoved(productIds: string[]): void {
  void notifyTyrerepairStockRemoved(productIds).catch(() => {});
}
