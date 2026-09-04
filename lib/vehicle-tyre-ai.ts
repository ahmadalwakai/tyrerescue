/**
 * SERVER-ONLY Groq assistance for tyre fitment selection.
 *
 * Groq is used only to pick/explain one of the normalized catalog options.
 * It must never invent tyre sizes.
 */

import type {
  TyreFitmentAssistance,
  TyreFitmentOption,
  TyreFitmentResolution,
  Vehicle,
} from '@/types/vehicle';

interface GroqFitmentResponse {
  recommendedOptionId?: string | null;
  rankedOptionIds?: string[];
  summary?: string;
  warnings?: string[];
}

const VERIFIED_RECOMMENDATION_SOURCES = new Set<TyreFitmentOption['source']>([
  'local_vrm_catalog',
]);

const NO_VERIFIED_FITMENT_WARNING =
  'No verified tyre-size data is available for this registration. Confirm the size from the tyre sidewall or door placard before quoting.';

export function isVerifiedTyreFitmentRecommendation(option: TyreFitmentOption): boolean {
  return (
    option.confidence === 'high' &&
    VERIFIED_RECOMMENDATION_SOURCES.has(option.source) &&
    !option.front.fallback &&
    !option.rear.fallback
  );
}

function formatSize(option: TyreFitmentOption): string {
  const front = option.front.sizeDisplay ?? `${option.front.width}/${option.front.aspect}R${option.front.rim}`;
  const rear = option.rear.sizeDisplay ?? `${option.rear.width}/${option.rear.aspect}R${option.rear.rim}`;
  return option.staggered ? `Front ${front}, rear ${rear}` : front;
}

function confidenceRank(option: TyreFitmentOption): number {
  if (option.confidence === 'high') return 3;
  if (option.confidence === 'medium') return 2;
  return 1;
}

function chooseDeterministicOption(options: TyreFitmentOption[]): TyreFitmentOption | null {
  return options.filter(isVerifiedTyreFitmentRecommendation).sort((a, b) => {
    const confidence = confidenceRank(b) - confidenceRank(a);
    if (confidence !== 0) return confidence;
    if (a.optional !== b.optional) return a.optional ? 1 : -1;
    return 0;
  })[0] ?? null;
}

function deterministicAssistance(
  options: TyreFitmentOption[],
  resolution: TyreFitmentResolution
): TyreFitmentAssistance {
  const recommended = chooseDeterministicOption(options);
  const warnings: string[] = [];

  if (!recommended && options.length > 0) {
    warnings.push(NO_VERIFIED_FITMENT_WARNING);
  }
  if (options.some((option) => !isVerifiedTyreFitmentRecommendation(option))) {
    warnings.push('Any catalogue candidate or estimate shown must be checked against the tyre sidewall before quoting.');
  }
  if (!recommended && options.length === 0) {
    warnings.push(NO_VERIFIED_FITMENT_WARNING);
  }
  if (resolution.status === 'error' && !recommended) {
    warnings.push('The configured tyre catalog could not be reached. Enter the sidewall size manually.');
  }
  if (options.length > 1) {
    warnings.push('This vehicle may have optional wheel fitments.');
  }
  if (recommended?.staggered) {
    warnings.push('Front and rear sizes differ for the recommended fitment.');
  }

  return {
    provider: 'deterministic',
    recommendedOptionId: recommended?.id ?? null,
    summary: recommended
      ? `Verified tyre fitment ${formatSize(recommended)} from ${recommended.sourceLabel}.`
      : options.length > 0
        ? 'Vehicle found, but no verified registration-level tyre fitment is available. Use these details only to guide a sidewall or door-placard check.'
        : 'Vehicle found, but no tyre fitment candidate is available from the configured catalogs.',
    warnings,
  };
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 220) : fallback;
}

function cleanWarnings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const modelWarnings = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => {
      const warning = item.trim();
      return /full\s+vrm\s+tyre\s+catalog/i.test(warning)
        ? NO_VERIFIED_FITMENT_WARNING
        : warning.slice(0, 180);
    })
    .slice(0, 3);
  return [...new Set([...fallback, ...modelWarnings])].slice(0, 3);
}

const MAX_DISPLAY_OPTIONS = 4;

export async function assistTyreFitmentSelection(
  vehicle: Vehicle,
  options: TyreFitmentOption[],
  resolution: TyreFitmentResolution
): Promise<TyreFitmentAssistance> {
  const fallback = deterministicAssistance(options, resolution);
  if (!process.env.GROQ_API_KEY || options.length === 0) return fallback;

  try {
    const { askGroqStructured } = await import('@/lib/groq');
    const allOptionIds = new Set(options.map((o) => o.id));
    const recommendableOptionIds = new Set(
      options.filter(isVerifiedTyreFitmentRecommendation).map((option) => option.id)
    );

    const result = await askGroqStructured<GroqFitmentResponse>({
      schemaName: 'TyreFitmentRecommendation',
      schema: {
        type: 'object',
        properties: {
          recommendedOptionId: { type: ['string', 'null'] },
          rankedOptionIds: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        required: ['recommendedOptionId', 'rankedOptionIds', 'summary', 'warnings'],
      },
      maxTokens: 320,
      systemPrompt:
        'You help a UK mobile tyre fitting admin select the correct tyre fitment for a vehicle. Your primary job is to RANK and FILTER the candidate list to the 1-4 most likely fitments for this specific vehicle — eliminating unlikely variants. Use make, model, year, and fuel type to determine which fitment sizes are most common for this exact vehicle. Rank from most likely to least likely. Return rankedOptionIds with the IDs of the top 4 most plausible options only — exclude obscure trims, performance variants, and optional upgrades unless that is clearly the vehicle. Return recommendedOptionId only if one option is clearly the standard fitment with high confidence. Never invent or modify tyre sizes. Use only the IDs provided.',
      userMessage: JSON.stringify({
        vehicle: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.yearOfManufacture,
          fuelType: vehicle.fuelType,
          colour: vehicle.colour,
        },
        options: options.map((option) => ({
          id: option.id,
          size: formatSize(option),
          source: option.source,
          confidence: option.confidence,
          oem: Boolean(option.oem ?? (option.source === 'local_vrm_catalog')),
          optional: Boolean(option.optional),
          staggered: Boolean(option.staggered),
          variant: option.vehicleVariant ?? null,
        })),
      }),
    });

    if (!result) return fallback;

    // Filter rankedOptionIds to only valid IDs from our list
    const rankedOptionIds = Array.isArray(result.rankedOptionIds)
      ? result.rankedOptionIds.filter((id) => allOptionIds.has(id)).slice(0, MAX_DISPLAY_OPTIONS)
      : [];

    const rejectedModelRecommendation = Boolean(
      result.recommendedOptionId && !recommendableOptionIds.has(result.recommendedOptionId)
    );
    const recommendedOptionId =
      result.recommendedOptionId && recommendableOptionIds.has(result.recommendedOptionId)
        ? result.recommendedOptionId
        : fallback.recommendedOptionId;

    return {
      provider: 'groq',
      recommendedOptionId,
      rankedOptionIds: rankedOptionIds.length > 0 ? rankedOptionIds : undefined,
      summary: cleanText(result.summary, fallback.summary),
      warnings: cleanWarnings(
        result.warnings,
        rejectedModelRecommendation
          ? [...fallback.warnings, 'AI recommendation was ignored because it was not a verified fitment.']
          : fallback.warnings
      ),
    };
  } catch {
    return fallback;
  }
}
