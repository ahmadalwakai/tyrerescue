import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getWeatherScheduleSummaries } from '@/lib/weather';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  dates: z
    .string()
    .min(10)
    .max(170)
    .transform((value) =>
      value
        .split(',')
        .map((date) => date.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(15)),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    lat: request.nextUrl.searchParams.get('lat'),
    lng: request.nextUrl.searchParams.get('lng'),
    dates: request.nextUrl.searchParams.get('dates'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid weather schedule query', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { lat, lng, dates } = parsed.data;
  const summary = await getWeatherScheduleSummaries({
    latitude: lat,
    longitude: lng,
    dates,
  });

  return NextResponse.json(summary);
}
