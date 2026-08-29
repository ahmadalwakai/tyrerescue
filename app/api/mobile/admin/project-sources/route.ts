import { NextRequest } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db, bookings } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { PROJECT_SOURCES } from '@/lib/integrations/project-sources';
import {
  getProjectIntegrationLink,
  isProjectIntegrationSecretConfigured,
} from '@/lib/integrations/project-links';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';

export const dynamic = 'force-dynamic';

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request: NextRequest) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const rows = await db
    .select({
      sourceApp: bookings.sourceApp,
      sourceLabel: bookings.sourceLabel,
      totalCount: sql<number>`count(*)::int`,
      activeCount: sql<number>`
        count(*) filter (
          where ${bookings.status} not in (
            'completed',
            'cancelled',
            'refunded',
            'refunded_partial',
            'cancelled_refund_pending'
          )
        )::int
      `,
      todayCount: sql<number>`
        count(*) filter (
          where ${bookings.createdAt} >= date_trunc('day', now() at time zone 'Europe/London')
        )::int
      `,
      latestCreatedAt: sql<Date | null>`max(${bookings.createdAt})`,
    })
    .from(bookings)
    .groupBy(bookings.sourceApp, bookings.sourceLabel)
    .orderBy(desc(sql`count(*)`));

  const countBySource = new Map(rows.map((row) => [row.sourceApp, row]));
  const unknownRows = rows.filter((row) => !PROJECT_SOURCES.some((source) => source.app === row.sourceApp));

  const configuredItems = PROJECT_SOURCES.map((source) => {
    const row = countBySource.get(source.app);
    const link = getProjectIntegrationLink(source.app);
    return {
      sourceApp: source.app,
      sourceLabel: row?.sourceLabel ?? source.label,
      origin: source.origin,
      description: source.description,
      bookingHandoffPath: link?.bookingHandoffPath ?? null,
      genericBookingHandoffPath: link?.genericBookingHandoffPath ?? null,
      assistedChatPopupLinked: link?.assistedChatPopupLinked ?? false,
      integrationSecretConfigured: link ? isProjectIntegrationSecretConfigured(source) : true,
      totalCount: Number(row?.totalCount ?? 0),
      activeCount: Number(row?.activeCount ?? 0),
      todayCount: Number(row?.todayCount ?? 0),
      latestCreatedAt: isoDate(row?.latestCreatedAt),
      configured: true,
    };
  });

  const unknownItems = unknownRows.map((row) => ({
    sourceApp: row.sourceApp,
    sourceLabel: row.sourceLabel,
    origin: null,
    description: 'External booking source not in the configured project registry.',
    totalCount: Number(row.totalCount ?? 0),
    activeCount: Number(row.activeCount ?? 0),
    todayCount: Number(row.todayCount ?? 0),
    latestCreatedAt: isoDate(row.latestCreatedAt),
    configured: false,
  }));

  return jsonWithExpoDevCors(request, {
    items: [...configuredItems, ...unknownItems],
  });
}

export async function OPTIONS(request: NextRequest) {
  return expoDevCorsPreflight(request);
}
