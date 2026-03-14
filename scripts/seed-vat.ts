import 'dotenv/config';
import { db } from '../lib/db';
import { pricingRules } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const vatRows = [
  {
    key: 'vat_registered',
    value: 'false',
    type: 'boolean',
    label: 'Business is VAT Registered',
  },
  {
    key: 'vat_number',
    value: '',
    type: 'amount',
    label: 'VAT Registration Number',
  },
];

async function main() {
  for (const row of vatRows) {
    const [existing] = await db
      .select({ id: pricingRules.id })
      .from(pricingRules)
      .where(eq(pricingRules.key, row.key))
      .limit(1);

    if (!existing) {
      await db.insert(pricingRules).values({
        key: row.key,
        value: row.value,
        type: row.type,
        label: row.label,
      });
      console.log(`Inserted pricing rule: ${row.key}`);
    } else {
      console.log(`Pricing rule already exists: ${row.key}`);
    }
  }

  console.log('VAT seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
