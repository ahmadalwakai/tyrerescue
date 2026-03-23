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

/** Get current London time details */
export function getLondonTime(): { hour: number; hourStartIso: string; hourEndIso: string } {
  const now = new Date();
  const londonStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour12: false });
  // Parse "DD/MM/YYYY, HH:MM:SS"
  const parts = londonStr.split(', ');
  const timeParts = parts[1].split(':');
  const hour = parseInt(timeParts[0], 10);

  // Build hour window ISO strings in Europe/London
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const datePart = formatter.format(now); // YYYY-MM-DD
  const hourStartIso = `${datePart}T${String(hour).padStart(2, '0')}:00:00`;
  const nextHour = (hour + 1) % 24;
  const hourEndIso = `${datePart}T${String(nextHour).padStart(2, '0')}:00:00`;

  return { hour, hourStartIso, hourEndIso };
}

/** Helper to check if current time is in the night window (Europe/London) */
export function isNightWindow(config: PricingConfig): boolean {
  const { hour } = getLondonTime();
  const start = config.nightStartHour ?? 18;
  const end = config.nightEndHour ?? 6;

  // Night spans midnight: e.g. 18:00 → 06:00
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}
