import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { cookieSettings } from '../lib/db/schema';
import { sql } from 'drizzle-orm';

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

const defaults = [
  {
    key: 'ga4_measurement_id',
    value: '',
    label: 'Google Analytics 4 Measurement ID',
    description: 'Format: G-XXXXXXXXXX. Leave empty to disable GA4.',
  },
  {
    key: 'ga4_enabled',
    value: 'false',
    label: 'Enable Google Analytics 4',
    description: 'When enabled, GA4 loads for users who accepted cookies.',
  },
  {
    key: 'meta_pixel_id',
    value: '',
    label: 'Meta (Facebook) Pixel ID',
    description: 'Your Meta Pixel ID. Leave empty to disable.',
  },
  {
    key: 'meta_pixel_enabled',
    value: 'false',
    label: 'Enable Meta Pixel',
    description: 'When enabled, Meta Pixel loads for users who accepted cookies.',
  },
  {
    key: 'microsoft_clarity_id',
    value: '',
    label: 'Microsoft Clarity Project ID',
    description: 'Free session recording and heatmaps. Leave empty to disable.',
  },
  {
    key: 'clarity_enabled',
    value: 'false',
    label: 'Enable Microsoft Clarity',
    description: 'When enabled, Clarity records sessions for UX analysis.',
  },
  {
    key: 'cookie_banner_title',
    value: 'We use cookies',
    label: 'Cookie Banner Title',
    description: 'Headline shown in the cookie consent banner.',
  },
  {
    key: 'cookie_banner_message',
    value: 'We use essential cookies to make this site work. With your consent, we also use analytics cookies to improve your experience.',
    label: 'Cookie Banner Message',
    description: 'Body text shown in the cookie consent banner.',
  },
];

async function seed() {
  console.log('Seeding cookie settings...');

  for (const row of defaults) {
    await db
      .insert(cookieSettings)
      .values(row)
      .onConflictDoNothing({ target: cookieSettings.key });
  }

  const rows = await db.select().from(cookieSettings);
  console.log(`Done — ${rows.length} cookie settings in table.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
