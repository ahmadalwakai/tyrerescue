/**
 * Cached pricing configuration reader.
 * Reads pricingConfig from DB with 60-second in-memory cache.
 */
import { db } from '@/lib/db';
import { pricingConfig } from '@/lib/db/schema';
import type { PricingConfig } from '@/lib/db/schema';

let cachedConfig: PricingConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function getPricingConfig(): Promise<PricingConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const rows = await db.select().from(pricingConfig).limit(1);

  if (rows.length === 0) {
    // Insert default row
    const [inserted] = await db.insert(pricingConfig).values({}).returning();
    cachedConfig = inserted;
    cacheTimestamp = now;
    return inserted;
  }

  cachedConfig = rows[0];
  cacheTimestamp = now;
  return rows[0];
}

/** Invalidate cache after admin updates */
export function invalidatePricingConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/** Helper to check if current time is in the night window (Europe/London) */
export function isNightWindow(config: PricingConfig): boolean {
  const londonTime = new Date(
    new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })
  );
  const hour = londonTime.getHours();
  const start = config.nightStartHour ?? 18;
  const end = config.nightEndHour ?? 6;

  // Night spans midnight: e.g. 18:00 → 06:00
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}
