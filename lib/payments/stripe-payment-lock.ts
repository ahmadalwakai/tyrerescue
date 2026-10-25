import 'server-only';
import { Pool, type PoolClient } from '@neondatabase/serverless';

/** Serialize payment creation across Vercel instances, including iOS/web retries. */
export async function withStripePaymentLock<T>(key: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [`tyrerescue:payment:${key}`]);
    return await work(client);
  } finally {
    // Destroy the dedicated connection so session locks cannot escape to a
    // reused connection, including when the callback throws.
    client.release(true);
    await pool.end();
  }
}
