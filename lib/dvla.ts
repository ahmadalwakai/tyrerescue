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
  // Not guaranteed by official DVLA VES. Some mocks/proxies may enrich it,
  // so callers must keep treating model as nullable.
  model?: string;
  yearOfManufacture?: number;
  /** Format: "YYYY-MM". More reliable than yearOfManufacture for matching
   *  UK catalog data which is organised by registration year. */
  monthOfFirstRegistration?: string;
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
      monthOfFirstRegistration: '2019-03',
      fuelType: 'PETROL',
      colour: 'BLUE',
    },
    BD63SMR: {
      registrationNumber: 'BD63SMR',
      make: 'VOLKSWAGEN',
      model: 'GOLF',
      yearOfManufacture: 2013,
      monthOfFirstRegistration: '2013-09',
      fuelType: 'DIESEL',
      colour: 'GREY',
    },
    LB19XYZ: {
      registrationNumber: 'LB19XYZ',
      make: 'TESLA',
      model: 'MODEL 3',
      yearOfManufacture: 2019,
      monthOfFirstRegistration: '2019-03',
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
      monthOfFirstRegistration: '2018-03',
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
    if (process.env.NODE_ENV === 'production') {
      // Never silently return fake data in production — the admin would see
      // wrong vehicle details. Surface a clear error instead.
      return {
        ok: false,
        error: { code: 'disabled', message: 'DVLA lookup is not configured. Please contact support.' },
      };
    }
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
        Accept: 'application/json',
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
      error: {
        code: 'not_found',
        message: `DVLA did not find registration ${vrm}. Check the plate characters and try again.`,
      },
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

  let payload: DvlaApiResponse;
  try {
    payload = (await response.json()) as DvlaApiResponse;
  } catch {
    return {
      ok: false,
      error: { code: 'malformed_response', message: 'DVLA returned a malformed vehicle response.' },
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      error: { code: 'malformed_response', message: 'DVLA returned an empty vehicle response.' },
    };
  }

  return {
    ok: true,
    vehicle: {
      registrationNumber: payload.registrationNumber ?? vrm,
      make: (payload.make ?? '').toUpperCase() || 'UNKNOWN',
      model: payload.model ? payload.model.toUpperCase() : null,
      yearOfManufacture: payload.yearOfManufacture ?? null,
      monthOfFirstRegistration: payload.monthOfFirstRegistration ?? null,
      fuelType: coerceFuel(payload.fuelType),
      colour: payload.colour ? payload.colour.toUpperCase() : null,
    },
  };
}
