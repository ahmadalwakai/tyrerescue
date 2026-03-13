import { db, pricingRules } from '@/lib/db';
import { ilike } from 'drizzle-orm';
import { ContentClient } from './ContentClient';

export default async function AdminContentPage() {
  const items = await db
    .select({
      id: pricingRules.id,
      key: pricingRules.key,
      value: pricingRules.value,
      label: pricingRules.label,
    })
    .from(pricingRules)
    .where(ilike(pricingRules.key, 'site_%'));

  return <ContentClient items={items} />;
}
