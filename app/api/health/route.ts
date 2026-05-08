import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckStatus = 'ok' | 'skipped' | 'error';

interface HealthResponse {
  ok: boolean;
  service: 'tyrerescue';
  timestamp: string;
  environment: string;
  checks: {
    app: 'ok';
    database: CheckStatus;
  };
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
} as const;

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const environment = process.env.NODE_ENV ?? 'development';
  const hasDbUrl = Boolean(process.env.DATABASE_URL);

  let database: CheckStatus;
  let httpStatus = 200;

  if (!hasDbUrl) {
    if (environment === 'production') {
      database = 'error';
      httpStatus = 503;
    } else {
      database = 'skipped';
    }
  } else {
    try {
      await db.execute(sql`SELECT 1`);
      database = 'ok';
    } catch (err) {
      // Never leak the DB URL or driver internals — log server-side only.
      console.error('[health] database check failed:', err);
      database = 'error';
      httpStatus = 503;
    }
  }

  const body: HealthResponse = {
    ok: httpStatus === 200,
    service: 'tyrerescue',
    timestamp: new Date().toISOString(),
    environment,
    checks: {
      app: 'ok',
      database,
    },
  };

  return NextResponse.json(body, { status: httpStatus, headers: NO_STORE_HEADERS });
}
