import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cookieSettings } from '@/lib/db/schema';

export const revalidate = 60;

export async function GET() {
  const rows = await db.select().from(cookieSettings);

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return NextResponse.json({
    ga4MeasurementId: map['ga4_measurement_id'] ?? '',
    ga4Enabled: map['ga4_enabled'] === 'true',
    metaPixelId: map['meta_pixel_id'] ?? '',
    metaPixelEnabled: map['meta_pixel_enabled'] === 'true',
    clarityId: map['microsoft_clarity_id'] ?? '',
    clarityEnabled: map['clarity_enabled'] === 'true',
    bannerTitle: map['cookie_banner_title'] ?? 'We use cookies',
    bannerMessage:
      map['cookie_banner_message'] ??
      'We use essential cookies to make this site work. With your consent, we also use analytics cookies to improve your experience.',
  });
}
