import 'server-only';

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';

export type TaxWriteTransaction = Parameters<Parameters<NeonDatabase<typeof schema>['transaction']>[0]>[0];

/**
 * neon-http cannot run dependent transaction callbacks. Keep tax/payroll writes
 * on one request-scoped WebSocket connection, with rollback and pool disposal.
 * Read-only queries continue using the existing HTTP database client.
 */
export async function withTaxWriteTransaction<T>(
  callback: (tx: TaxWriteTransaction) => Promise<T>,
): Promise<T> {
  if (!globalThis.WebSocket && !neonConfig.webSocketConstructor) {
    const { default: WebSocket } = await import('ws');
    neonConfig.webSocketConstructor = WebSocket;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 10_000,
  });
  try {
    return await drizzle(pool, { schema }).transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      await tx.execute(sql`SET LOCAL lock_timeout = '8s'`);
      return callback(tx);
    });
  } finally {
    await pool.end();
  }
}
