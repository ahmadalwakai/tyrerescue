import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db, seoSnapshots, pageAnalysis } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const [snapshots, recentPages, issueRows] = await Promise.all([
    db.select().from(seoSnapshots).orderBy(desc(seoSnapshots.date)).limit(30),
    db.select().from(pageAnalysis).orderBy(desc(pageAnalysis.lastCrawled)).limit(50),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pageAnalysis)
      .where(sql`${pageAnalysis.issues} IS NOT NULL`),
  ]);

  const latest = snapshots[0] || null;

  return NextResponse.json({
    latest: latest
      ? {
          ...latest,
          date: latest.date?.toISOString() ?? null,
          createdAt: latest.createdAt?.toISOString() ?? null,
        }
      : null,
    history: snapshots.map((item) => ({
      ...item,
      date: item.date?.toISOString() ?? null,
      createdAt: item.createdAt?.toISOString() ?? null,
    })),
    pages: recentPages.map((page) => ({
      ...page,
      lastCrawled: page.lastCrawled?.toISOString() ?? null,
    })),
    summary: {
      totalPagesAnalysed: recentPages.length,
      pagesWithIssues: Number(issueRows[0]?.count || 0),
    },
  });
}
