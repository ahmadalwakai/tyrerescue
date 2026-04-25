/**
 * Pure quote calculator — produces a price-range estimate for a service +
 * tyre size + quantity. Used by the instant-quote page before the user
 * commits to the full booking flow.
 *
 * Single source of truth for service "from" prices is `SERVICE_PRICING` in
 * `lib/pricing.ts`. Real invoice totals come from the pricing engine plus
 * the live tyre catalogue — this module is intentionally an estimator.
 *
 * No I/O, no env access. Easy to unit test.
 */

import { SERVICE_PRICING } from '@/lib/pricing';
import type { QuoteRequest, QuoteResult, TyreSize } from '@/types/vehicle';

/** Indicative budget/premium retail bands per tyre, by rim diameter. */
interface TyreBand {
  budget: number;
  premium: number;
}

const TYRE_BANDS_BY_RIM: Record<number, TyreBand> = {
  13: { budget: 38, premium: 70 },
  14: { budget: 40, premium: 78 },
  15: { budget: 45, premium: 90 },
  16: { budget: 55, premium: 110 },
  17: { budget: 70, premium: 140 },
  18: { budget: 90, premium: 175 },
  19: { budget: 115, premium: 220 },
  20: { budget: 140, premium: 270 },
  21: { budget: 170, premium: 320 },
  22: { budget: 200, premium: 380 },
};

/** Linear extrapolation for unusual rim sizes. */
function bandFor(rim: number): TyreBand {
  if (TYRE_BANDS_BY_RIM[rim]) return TYRE_BANDS_BY_RIM[rim];
  if (rim < 13) return TYRE_BANDS_BY_RIM[13];
  if (rim > 22) return TYRE_BANDS_BY_RIM[22];
  // step between adjacent known bands
  const lower = Math.floor(rim);
  const upper = Math.ceil(rim);
  const a = TYRE_BANDS_BY_RIM[lower] ?? TYRE_BANDS_BY_RIM[16];
  const b = TYRE_BANDS_BY_RIM[upper] ?? TYRE_BANDS_BY_RIM[16];
  return {
    budget: Math.round((a.budget + b.budget) / 2),
    premium: Math.round((a.premium + b.premium) / 2),
  };
}

function isLargeRim(rim: number): boolean {
  return rim >= 17;
}

function isLowProfile(aspect: number): boolean {
  return aspect <= 40;
}

/**
 * Heuristic: ultra-low-profile fitments (<= 40 series) are usually
 * run-flats on premium German marques. We can't tell for sure without
 * vehicle-trim data, so we surface this as a +25% premium NOTE rather
 * than baking it into the floor price.
 */
function looksRunFlat(tyre: TyreSize): boolean {
  const aspect = Number(tyre.aspect);
  const rim = Number(tyre.rim);
  return Number.isFinite(aspect) && Number.isFinite(rim) && aspect <= 40 && rim >= 18;
}

function clampQuantity(q: number): number {
  if (!Number.isFinite(q)) return 1;
  if (q < 1) return 1;
  if (q > 4) return 4;
  return Math.floor(q);
}

/** Night hours in local time: 22:00 – 05:59 inclusive. */
export function isNightTime(date: Date = new Date()): boolean {
  const h = date.getHours();
  return h >= 22 || h < 6;
}

/** +15% night surcharge applied to emergency callouts only. */
const NIGHT_SURCHARGE_MULTIPLIER = 1.15;

export function calculateQuote(request: QuoteRequest, now: Date = new Date()): QuoteResult {
  const { service, tyreSize } = request;
  const quantity = clampQuantity(request.quantity);

  const rim = Number.parseInt(tyreSize.rim, 10);
  const aspect = Number.parseInt(tyreSize.aspect, 10);
  const safeRim = Number.isFinite(rim) ? rim : 16;
  const band = bandFor(safeRim);

  const sizePremium = isLargeRim(safeRim) ? 1.2 : 1; // larger sizes +20%
  const fittingFee = SERVICE_PRICING[service].from;

  const breakdown: QuoteResult['breakdown'] = [];
  const notes: string[] = [];

  let from: number;
  let to: number;

  if (service === 'punctureRepair') {
    // Repair pricing is flat per tyre — the SERVICE_PRICING band already
    // covers the realistic spread.
    from = SERVICE_PRICING.punctureRepair.from * quantity;
    to = SERVICE_PRICING.punctureRepair.typicalMax * quantity;
    breakdown.push({ label: `Repair × ${quantity}`, amount: from });
  } else {
    const tyreFrom = Math.round(band.budget * sizePremium);
    const tyreTo = Math.round(band.premium * sizePremium);

    const tyresFrom = tyreFrom * quantity;
    const tyresTo = tyreTo * quantity;
    const fittingTotal = fittingFee * quantity;

    from = tyresFrom + fittingTotal;
    to = tyresTo + fittingTotal;

    breakdown.push({
      label: `${service === 'emergency' ? 'Callout' : 'Fitting'} fee × ${quantity}`,
      amount: fittingTotal,
    });
    breakdown.push({ label: `Budget tyres × ${quantity}`, amount: tyresFrom });
    breakdown.push({ label: `Premium tyres × ${quantity}`, amount: tyresTo });

    if (isLargeRim(safeRim)) {
      notes.push(`Large diameter (${safeRim}") fitments carry a ~20% price premium.`);
    }
    if (looksRunFlat(tyreSize) || isLowProfile(aspect)) {
      notes.push('Low-profile / run-flat sizes are typically ~25% more than equivalent standard tyres.');
    }
    if (service === 'emergency') {
      notes.push('Emergency callout is dispatched as soon as a fitter is available.');
    }
  }

  let surcharge: QuoteResult['surcharge'];
  if (service === 'emergency' && isNightTime(now)) {
    const baseFrom = from;
    from = Math.round(from * NIGHT_SURCHARGE_MULTIPLIER);
    to = Math.round(to * NIGHT_SURCHARGE_MULTIPLIER);
    const amount = from - baseFrom;
    surcharge = {
      label: 'Night surcharge (22:00–06:00)',
      multiplier: NIGHT_SURCHARGE_MULTIPLIER,
      amount,
    };
    breakdown.push({ label: 'Night surcharge (+15%)', amount });
    notes.push('A +15% night surcharge applies to emergency callouts between 22:00 and 06:00.');
  }

  return {
    service,
    quantity,
    tyreSize,
    from,
    to,
    fittingFee,
    currency: 'GBP',
    breakdown,
    notes,
    ...(surcharge ? { surcharge } : {}),
  };
}
