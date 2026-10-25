import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface TyreSizeSuggestion {
  size: string;
  count?: number;
}

function fallbackSizes(query: string): TyreSizeSuggestion[] {
  const sizes = [
    '195/55/R16',
    '205/55/R16',
    '215/55/R17',
    '225/45/R17',
    '225/40/R18',
    '235/45/R18',
    '245/40/R18',
    '255/35/R19',
  ];
  const key = query.toUpperCase().replace(/[^0-9R]/g, '');

  return sizes
    .filter((size) => size.toUpperCase().replace(/[^0-9R]/g, '').includes(key))
    .slice(0, 8)
    .map((size) => ({ size }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json({ sizes: [] });
  }

  const baseUrl = process.env.TYRE_RESCUE_API_BASE_URL || 'https://www.tyrerescue.uk';

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tyres/sizes?q=${encodeURIComponent(q)}`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as { sizes?: TyreSizeSuggestion[] } | TyreSizeSuggestion[] | null;
    const sizes = Array.isArray(payload) ? payload : payload?.sizes;

    if (!response.ok || !Array.isArray(sizes)) {
      throw new Error('Tyre size lookup failed');
    }

    return NextResponse.json({ sizes });
  } catch {
    return NextResponse.json({ sizes: fallbackSizes(q), fallback: true });
  }
}
