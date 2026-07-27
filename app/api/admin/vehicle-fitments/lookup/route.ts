import { z } from 'zod';
import { requireAdminMobile } from '@/lib/auth';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';
import { resolveVehicleFitmentLookup } from '@/lib/vehicle-fitment-lookup';

export const runtime = 'nodejs';

const bodySchema = z.object({
  registrationNumber: z.string().min(2).max(24),
});

const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get('authorization')?.slice(0, 24) ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function consumeRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) return false;
  bucket.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    await requireAdminMobile(request);
  } catch {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { code: 'unknown', message: 'Unauthorized' } },
      { status: 401 },
    );
  }

  if (!consumeRateLimit(clientKey(request))) {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { code: 'rate_limited', message: 'Too many vehicle lookups.' } },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { code: 'invalid_format', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { code: 'invalid_format', message: 'A registration is required.' } },
      { status: 400 },
    );
  }

  const result = await resolveVehicleFitmentLookup(parsed.data.registrationNumber);
  return jsonWithExpoDevCors(request, result, {
    status: result.error?.code === 'invalid_format' ? 400 : 200,
  });
}

export async function OPTIONS(request: Request) {
  return expoDevCorsPreflight(request);
}
