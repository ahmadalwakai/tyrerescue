import { db, pricingRules } from '@/lib/db';
import { asc } from 'drizzle-orm';
import { PricingClient } from './PricingClient';

export default async function AdminPricingPage() {
  const rules = await db
    .select({
      id: pricingRules.id,
      key: pricingRules.key,
      value: pricingRules.value,
      label: pricingRules.label,
      type: pricingRules.type,
    })
    .from(pricingRules)
    .orderBy(asc(pricingRules.key));

  return <PricingClient rules={rules} />;
}
