import { neon } from '@neondatabase/serverless';

const client = neon(process.env.DATABASE_URL!);

async function run() {
  // Check what exists first
  const all = await client`SELECT key, value FROM cookie_settings`;
  console.log('All cookie_settings:', all);

  if (all.length === 0) {
    console.log('No rows — seeding ga4 settings...');
    await client`INSERT INTO cookie_settings (key, value, label, description) VALUES ('ga4_measurement_id', 'G-MLH80KPV1T', 'Google Analytics 4 Measurement ID', 'Format: G-XXXXXXXXXX')`;
    await client`INSERT INTO cookie_settings (key, value, label, description) VALUES ('ga4_enabled', 'true', 'Enable Google Analytics 4', 'When enabled, GA4 loads for users who accepted cookies.')`;
  } else {
    await client`UPDATE cookie_settings SET value = 'G-MLH80KPV1T' WHERE key = 'ga4_measurement_id'`;
    await client`UPDATE cookie_settings SET value = 'true' WHERE key = 'ga4_enabled'`;
  }

  const rows = await client`SELECT key, value FROM cookie_settings WHERE key IN ('ga4_measurement_id', 'ga4_enabled')`;
  console.log('GA4 settings:', rows);
}

run().catch(console.error);
