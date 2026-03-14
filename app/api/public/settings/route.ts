import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pricingRules } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

export async function GET() {
  const keys = ['vat_registered', 'vat_number', 'emergency_available', 'emergency_banner_message'];

  const rules = await db
    .select({ key: pricingRules.key, value: pricingRules.value })
    .from(pricingRules)
    .where(inArray(pricingRules.key, keys));

  const map = new Map(rules.map((r) => [r.key, r.value]));

  return NextResponse.json({
    vatRegistered: map.get('vat_registered') === 'true',
    vatNumber: map.get('vat_number') || '',
    emergencyAvailable: map.get('emergency_available') !== 'false',
    bannerMessage: map.get('emergency_banner_message') || '',
  });
}
