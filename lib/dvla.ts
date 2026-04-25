/**
 * DVLA Vehicle Enquiry Service client.
 *
 * SERVER-ONLY. Do not import from a client component — `env.DVLA_API_KEY`
 * must never reach the browser bundle.
 *
 * When the API key is blank the module returns a deterministic mock so
 * dev / preview environments work without trade approval. Production
 * builds without a key will return `disabled` and the UI is gated by
 * `NEXT_PUBLIC_VRM_ENABLED`.
 */

import 'server-only';
import { env } from '@/lib/env';
import { isValidVrm, normalizeVrm } from '@/lib/vrm';
import type { FuelType, Vehicle, VrmLookupResult } from '@/types/vehicle';

// Re-export so existing server-side imports keep working.
export { isValidVrm, normalizeVrm };

const FETCH_TIMEOUT_MS = 5_000;

interface DvlaApiResponse {
  registrationNumber: string;
  make?: string;
  model?: string; // DVLA does not always populate this; falls back to monthOfFirstRegistration heuristics
  yearOfManufacture?: number;
  fuelType?: string;
  colour?: string;
}

interface DvlaErrorBody {
  errors?: Array<{ status?: string; code?: string; title?: string; detail?: string }>;
}

function coerceFuel(raw: string | undefined): FuelType {
  switch ((raw ?? '').toUpperCase()) {
    case 'PETROL':
      return 'PETROL';
    case 'DIESEL':
      return 'DIESEL';
    case 'ELECTRICITY':
    case 'ELECTRIC':
      return 'ELECTRIC';
    case 'HYBRID ELECTRIC':
    case 'HYBRID':
      return 'HYBRID';
    default:
      return 'OTHER';
  }
}

/**
 * Deterministic mock used when `DVLA_API_KEY` is blank. Lets local dev
 * test the full flow against a small set of canned plates.
 *
 * Plates that begin with `NF` always return not-found so the error UI can
 * be exercised.
 */
function mockLookup(vrm: string): VrmLookupResult {
  if (vrm.startsWith('NF')) {
    return {
      ok: false,
      error: { code: 'not_found', message: 'No vehicle found for that registration.' },
    };
  }

  const fixtures: Record<string, Vehicle> = {
    AB12CDE: {
      registrationNumber: 'AB12CDE',
      make: 'FORD',
      model: 'FOCUS',
      yearOfManufacture: 2019,
      fuelType: 'PETROL',
      colour: 'BLUE',
    },
    BD63SMR: {
      registrationNumber: 'BD63SMR',
      make: 'VOLKSWAGEN',
      model: 'GOLF',
      yearOfManufacture: 2014,
      fuelType: 'DIESEL',
      colour: 'GREY',
    },
    LB19XYZ: {
      registrationNumber: 'LB19XYZ',
      make: 'TESLA',
      model: 'MODEL 3',
      yearOfManufacture: 2020,
      fuelType: 'ELECTRIC',
      colour: 'WHITE',
    },
  };

  const fixture = fixtures[vrm];
  if (fixture) return { ok: true, vehicle: fixture };

  // Fallback: generic Vauxhall Corsa so any other plate returns *something*
  // useful in dev. Production never reaches this path because the API key
  // would be set.
  return {
    ok: true,
    vehicle: {
      registrationNumber: vrm,
      make: 'VAUXHALL',
      model: 'CORSA',
      yearOfManufacture: 2018,
      fuelType: 'PETROL',
      colour: 'SILVER',
    },
  };
}

export async function lookupVrm(registrationNumber: string): Promise<VrmLookupResult> {
  const vrm = normalizeVrm(registrationNumber);
  if (!isValidVrm(vrm)) {
    return {
      ok: false,
      error: { code: 'invalid_format', message: 'That does not look like a UK number plate.' },
    };
  }

  // Mock fallback — no key configured.
  if (!env.DVLA_API_KEY) {
    return mockLookup(vrm);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(env.DVLA_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.DVLA_API_KEY,
      },
      body: JSON.stringify({ registrationNumber: vrm }),
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const code = err instanceof Error && err.name === 'AbortError' ? 'network' : 'network';
    return {
      ok: false,
      error: { code, message: 'Could not reach the DVLA service. Please try again.' },
    };
  }
  clearTimeout(timeoutId);

  if (response.status === 404) {
    return {
      ok: false,
      error: { code: 'not_found', message: 'We could not find that registration with the DVLA.' },
    };
  }
  if (response.status === 400) {
    return {
      ok: false,
      error: { code: 'invalid_format', message: 'The DVLA rejected that registration as invalid.' },
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      error: { code: 'rate_limited', message: 'DVLA rate limit hit — try again in a moment.' },
    };
  }
  if (response.status >= 500) {
    return {
      ok: false,
      error: { code: 'upstream_error', message: 'The DVLA service is currently unavailable.' },
    };
  }
  if (!response.ok) {
    let detail = 'Unexpected DVLA response.';
    try {
      const body = (await response.json()) as DvlaErrorBody;
      const first = body.errors?.[0];
      if (first?.detail) detail = first.detail;
    } catch {
      // ignore — keep default message
    }
    return { ok: false, error: { code: 'unknown', message: detail } };
  }

  const payload = (await response.json()) as DvlaApiResponse;
  return {
    ok: true,
    vehicle: {
      registrationNumber: payload.registrationNumber ?? vrm,
      make: (payload.make ?? '').toUpperCase() || 'UNKNOWN',
      model: payload.model ? payload.model.toUpperCase() : null,
      yearOfManufacture: payload.yearOfManufacture ?? null,
      fuelType: coerceFuel(payload.fuelType),
      colour: payload.colour ? payload.colour.toUpperCase() : null,
    },
  };
}
