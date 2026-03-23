import { db, bookings, drivers, surgePricingLog, bankHolidays } from '@/lib/db';
import { eq, and, sql, gte } from 'drizzle-orm';
import { askGroqJSON } from '@/lib/groq';
import { getLondonTime } from '@/lib/pricing-config';
import { shouldDriverAppearOnline } from '@/lib/driver-presence';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DemandMetrics {
  activeBookingsToday: number;
  emergencyPending: number;
  availableDrivers: number;
  currentHour: number;
  dayOfWeek: number;
  isWeekend: boolean;
  isBankHoliday: boolean;
  timestamp: string;
}

export interface SurgeResult {
  /** Clamped demand multiplier actually used (0.90–1.20) */
  demandMultiplier: number;
  /** Confidence level of the recommendation */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable explanation */
  reason: string;
  /** Raw metrics used for the decision */
  metrics: DemandMetrics;
  /** Whether Groq advisory was used or fell back to deterministic */
  source: 'groq' | 'deterministic' | 'fallback';
}

// ─── Deterministic Demand Multiplier (no Groq) ─────────────────────────────

/**
 * Compute a demand multiplier from raw metrics without any AI call.
 * Used as both the ground-truth clamp and the fallback when Groq is unavailable.
 */
export function computeDeterministicDemand(m: DemandMetrics): {
  multiplier: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  let multiplier = 1.0;
  const reasons: string[] = [];

  // Driver scarcity: fewer drivers → higher multiplier
  if (m.availableDrivers === 0) {
    multiplier += 0.10;
    reasons.push('No drivers available');
  } else if (m.availableDrivers === 1) {
    multiplier += 0.05;
    reasons.push('Only 1 driver available');
  }

  // Emergency backlog
  if (m.emergencyPending >= 3) {
    multiplier += 0.05;
    reasons.push(`${m.emergencyPending} emergency bookings pending`);
  }

  // High volume day
  if (m.activeBookingsToday >= 10) {
    multiplier += 0.05;
    reasons.push(`${m.activeBookingsToday} active bookings today`);
  }

  // Bank holiday premium
  if (m.isBankHoliday) {
    multiplier += 0.03;
    reasons.push('Bank holiday');
  }

  // Early morning / late night
  if (m.currentHour < 7 || m.currentHour >= 21) {
    multiplier += 0.02;
    reasons.push('Out-of-hours');
  }

  // Clamp
  multiplier = clampMultiplier(multiplier);

  const reason = reasons.length > 0 ? reasons.join('; ') : 'Normal demand';
  const confidence = reasons.length >= 2 ? 'high' : reasons.length === 1 ? 'medium' : 'low';

  return { multiplier, confidence, reason };
}

// ─── Clamp helper ───────────────────────────────────────────────────────────

const SURGE_MIN = 0.90;
const SURGE_MAX = 1.20;

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(SURGE_MIN, Math.min(SURGE_MAX, Math.round(value * 100) / 100));
}

// ─── Collect Live Demand Metrics ────────────────────────────────────────────

export async function collectDemandMetrics(): Promise<DemandMetrics> {
  const now = new Date();
  const london = getLondonTime();
  const hour = london.hour;
  const dayOfWeek = now.getDay();
  const todayStr = now.toISOString().split('T')[0];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [activeBookingsResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, todayStart),
        sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'draft')`
      )
    );

  const [emergencyPendingResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        gte(bookings.createdAt, todayStart),
        eq(bookings.bookingType, 'emergency'),
        sql`${bookings.status} NOT IN ('cancelled', 'completed', 'refunded', 'draft')`
      )
    );

  const allDrivers = await db
    .select({
      id: drivers.id,
      isOnline: drivers.isOnline,
      locationAt: drivers.locationAt,
      status: drivers.status,
    })
    .from(drivers);

  const availableDriverCount = allDrivers.filter((d) =>
    shouldDriverAppearOnline(
      { isOnline: d.isOnline ?? false, locationAt: d.locationAt, status: d.status },
      null,
    ),
  ).length;

  const [isHoliday] = await db
    .select()
    .from(bankHolidays)
    .where(eq(bankHolidays.date, todayStr))
    .limit(1);

  return {
    activeBookingsToday: Number(activeBookingsResult.count),
    emergencyPending: Number(emergencyPendingResult.count),
    availableDrivers: availableDriverCount,
    currentHour: hour,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isBankHoliday: !!isHoliday,
    timestamp: now.toISOString(),
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Get the surge/demand multiplier.
 *
 * Uses Groq as an *advisory* layer. The final multiplier is always clamped
 * deterministically and never exceeds the SURGE_MIN / SURGE_MAX bounds.
 * Falls back to pure deterministic calculation if Groq fails.
 */
export async function getSurgeMultiplier(): Promise<number> {
  const result = await getSurgeResult();
  return result.demandMultiplier;
}

export async function getSurgeResult(): Promise<SurgeResult> {
  try {
    const metrics = await collectDemandMetrics();

    // Always compute deterministic baseline
    const deterministic = computeDeterministicDemand(metrics);

    // Try Groq advisory (non-blocking, advisory only)
    let groqMultiplier: number | null = null;
    let groqSource: 'groq' | 'deterministic' = 'deterministic';
    try {
      const result = await askGroqJSON(
        `You are a surge pricing engine for a mobile tyre fitting company in Glasgow.
Return a price multiplier based on demand. Range: 0.90 to 1.20.
Normal: 1.0, High demand: up to 1.20, Low demand: down to 0.90.
Return JSON: { "multiplier": number }`,
        JSON.stringify(metrics),
        150
      );

      if (result?.multiplier !== undefined && result.multiplier !== null) {
        const raw = Number(result.multiplier);
        if (Number.isFinite(raw)) {
          groqMultiplier = clampMultiplier(raw);
          groqSource = 'groq';
        }
      }
    } catch {
      // Groq failed — use deterministic only
    }

    // Final multiplier: prefer Groq advisory when available,
    // but always clamp deterministically
    const finalMultiplier = groqMultiplier ?? deterministic.multiplier;

    const surgeResult: SurgeResult = {
      demandMultiplier: finalMultiplier,
      confidence: groqMultiplier !== null ? 'high' : deterministic.confidence,
      reason: groqMultiplier !== null
        ? `Groq advisory: ${finalMultiplier}x (deterministic baseline: ${deterministic.multiplier}x — ${deterministic.reason})`
        : deterministic.reason,
      metrics,
      source: groqSource,
    };

    // Log to surgePricingLog
    try {
      await db.insert(surgePricingLog).values({
        groqInput: metrics as unknown as Record<string, unknown>,
        groqOutput: {
          finalMultiplier,
          groqMultiplier,
          deterministicMultiplier: deterministic.multiplier,
          source: groqSource,
          confidence: surgeResult.confidence,
          reason: surgeResult.reason,
        } as Record<string, unknown>,
        multiplierUsed: String(finalMultiplier),
        applied: true,
      });
    } catch (logError) {
      console.error('[surge] Failed to log surge result:', logError);
    }

    return surgeResult;
  } catch (error) {
    console.error('getSurgeMultiplier error:', error);
    return {
      demandMultiplier: 1.0,
      confidence: 'low',
      reason: 'Surge calculation failed; using neutral multiplier',
      metrics: {
        activeBookingsToday: 0,
        emergencyPending: 0,
        availableDrivers: 0,
        currentHour: 0,
        dayOfWeek: 0,
        isWeekend: false,
        isBankHoliday: false,
        timestamp: new Date().toISOString(),
      },
      source: 'fallback',
    };
  }
}
