import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getCityBySlug } from '@/lib/cities';
import { askGroqJSON } from '@/lib/groq';
import { z } from 'zod';

const schema = z.object({
  citySlug: z.string().min(1).max(50),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const city = getCityBySlug(parsed.data.citySlug);
    if (!city) {
      return NextResponse.json({ error: 'City not found' }, { status: 404 });
    }

    const result = await askGroqJSON(
      `You are an SEO content writer for Tyre Rescue, a mobile tyre fitting company based in Glasgow, Scotland.
Write content for their city service page. The content must be unique, locally relevant, and SEO-optimised.
Return JSON:
{
  "heroSubtext": "string 20-30 words — punchy subheading for the hero section",
  "coverageDescription": "string 60-80 words — paragraph about coverage in this area",
  "localKnowledge": "string 40-60 words — mention specific landmarks, roads, or local context",
  "metaDescription": "string 150-160 chars — SEO meta description"
}
Do NOT mention competitors. Focus on speed, reliability, mobile service, and local expertise.`,
      JSON.stringify({
        cityName: city.name,
        county: city.county,
        distanceFromGlasgow: city.distanceMilesFromGlasgow,
        landmarks: city.landmarks,
        nearbyAreas: city.nearbyAreas,
        postcodePrefix: city.postcodePrefix,
      }),
      600
    );

    if (!result) {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    return NextResponse.json({
      citySlug: city.slug,
      cityName: city.name,
      content: result,
      aiPowered: true,
    });
  } catch (error) {
    console.error('SEO content generation error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
