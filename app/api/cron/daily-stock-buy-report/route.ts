import { NextResponse } from 'next/server';

import { sendDailyStockBuyReport } from '@/lib/stock/daily-buy-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  try {
    const result = await sendDailyStockBuyReport({ force });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cron/daily-stock-buy-report] failed', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to send daily stock buy report',
      },
      { status: 500 },
    );
  }
}
