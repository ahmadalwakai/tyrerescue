import { Pool, type QueryResultRow } from '@neondatabase/serverless';

import { getOutboundUrl } from '@/lib/config/site';
import { db } from '@/lib/db';
import { adminNotifications } from '@/lib/db/schema';
import { sendEmail } from '@/lib/email/resend';
import { stockDailyBuyReport } from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { createStockDailyBuyReportPdf } from '@/lib/stock/daily-buy-report-pdf';
import { and, eq } from 'drizzle-orm';

const RECIPIENTS = ['dukesttyres@gmail.com', 'ahmadalwakai76@gmail.com'];
const LONDON_TIME_ZONE = 'Europe/London';
const REPORT_TYPE = 'stock.daily_buy_report';

interface DailyBuyRow extends QueryResultRow {
  city_name: string | null;
  size_display: string | null;
  brand: string | null;
  pattern: string | null;
  current_stock: number | string | null;
  ordered_stock: number | string | null;
  target_stock: number | string | null;
  reduced_quantity: number | string | null;
  sold_quantity: number | string | null;
  buy_quantity: number | string | null;
  reduced_by: string | null;
  channels: string | null;
}

interface DailyAdditionRow extends QueryResultRow {
  city_name: string | null;
  size_display: string | null;
  brand: string | null;
  pattern: string | null;
  added_quantity: number | string | null;
  added_by: string | null;
}

interface DailyMissingRow extends QueryResultRow {
  city_name: string | null;
  normalized_size: string | null;
  request_count: number | string | null;
  requested_by: string | null;
}

export interface SendDailyStockBuyReportOptions {
  now?: Date;
  force?: boolean;
}

export interface SendDailyStockBuyReportResult {
  sent: boolean;
  skippedReason?: string;
  reportDate: string;
  reportDateLabel: string;
  recipients: string[];
  itemCount: number;
  attachmentFilename?: string;
  subject?: string;
  totals: {
    buyQuantity: number;
    reducedQuantity: number;
    soldQuantity: number;
    addedQuantity: number;
    missingRequests: number;
  };
  messageId?: string;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function londonParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function londonDateKey(date: Date): string {
  const parts = londonParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function reportDateFor(now: Date): string {
  // At midnight London time, the report covers the full previous London day.
  return londonDateKey(new Date(now.getTime() - 12 * 60 * 60 * 1000));
}

function isLondonMidnightWindow(date: Date): boolean {
  const parts = londonParts(date);
  return parts.hour === '00';
}

function formatReportDateLabel(reportDate: string): string {
  const utcNoon = new Date(`${reportDate}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    dateStyle: 'full',
  }).format(utcNoon);
}

function formatLondonDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatLondonFileStamp(date: Date): string {
  const parts = londonParts(date);
  return `${parts.hour}${parts.minute}`;
}

async function alreadySent(reportDate: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: adminNotifications.id })
    .from(adminNotifications)
    .where(and(eq(adminNotifications.type, REPORT_TYPE), eq(adminNotifications.entityId, reportDate)))
    .limit(1);

  return Boolean(existing);
}

async function fetchDailyReportData(reportDate: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const [buyResult, additionResult, missingResult] = await Promise.all([
      client.query<DailyBuyRow>(
        `WITH report_window AS (
           SELECT
             ($1::date::timestamp AT TIME ZONE 'Europe/London') AS starts_at,
             (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/London') AS ends_at
         ),
         daily_reductions AS (
           SELECT
             m.city_id,
             m.tyre_product_id,
             SUM(ABS(m.quantity_delta))::int AS reduced_quantity,
             COALESCE(SUM(ABS(m.quantity_delta)) FILTER (WHERE m.movement_type = 'SALE'), 0)::int AS sold_quantity,
             STRING_AGG(DISTINCT COALESCE(u.name, u.email, 'Unknown'), ', ' ORDER BY COALESCE(u.name, u.email, 'Unknown')) AS reduced_by,
             STRING_AGG(DISTINCT COALESCE(m.sale_channel::text, m.movement_type::text), ', ' ORDER BY COALESCE(m.sale_channel::text, m.movement_type::text)) AS channels
           FROM stock_movements m
           CROSS JOIN report_window w
           LEFT JOIN users u ON u.id = m.actor_user_id
           WHERE m.quantity_delta < 0
             AND m.occurred_at >= w.starts_at
             AND m.occurred_at < w.ends_at
           GROUP BY m.city_id, m.tyre_product_id
         )
         SELECT
           c.name AS city_name,
           p.size_display,
           p.brand,
           p.pattern,
           COALESCE(b.current_stock, 0)::int AS current_stock,
           COALESCE(b.ordered_stock, 0)::int AS ordered_stock,
           COALESCE(b.target_stock, 0)::int AS target_stock,
           r.reduced_quantity,
           r.sold_quantity,
           GREATEST(
             GREATEST(COALESCE(b.target_stock, 0) - COALESCE(b.current_stock, 0) - COALESCE(b.ordered_stock, 0), 0),
             r.reduced_quantity
           )::int AS buy_quantity,
           r.reduced_by,
           r.channels
         FROM daily_reductions r
         INNER JOIN stock_cities c ON c.id = r.city_id
         INNER JOIN tyre_products p ON p.id = r.tyre_product_id
         LEFT JOIN stock_inventory_balances b
           ON b.city_id = r.city_id
          AND b.tyre_product_id = r.tyre_product_id
         WHERE GREATEST(
           GREATEST(COALESCE(b.target_stock, 0) - COALESCE(b.current_stock, 0) - COALESCE(b.ordered_stock, 0), 0),
           r.reduced_quantity
         ) > 0
         ORDER BY c.name ASC, buy_quantity DESC, p.size_display ASC, p.brand ASC`,
        [reportDate],
      ),
      client.query<DailyAdditionRow>(
        `WITH report_window AS (
           SELECT
             ($1::date::timestamp AT TIME ZONE 'Europe/London') AS starts_at,
             (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/London') AS ends_at
         )
         SELECT
           c.name AS city_name,
           p.size_display,
           p.brand,
           p.pattern,
           SUM(m.quantity_delta)::int AS added_quantity,
           STRING_AGG(DISTINCT COALESCE(u.name, u.email, 'Unknown'), ', ' ORDER BY COALESCE(u.name, u.email, 'Unknown')) AS added_by
         FROM stock_movements m
         CROSS JOIN report_window w
         INNER JOIN stock_cities c ON c.id = m.city_id
         INNER JOIN tyre_products p ON p.id = m.tyre_product_id
         LEFT JOIN users u ON u.id = m.actor_user_id
         WHERE m.quantity_delta > 0
           AND m.occurred_at >= w.starts_at
           AND m.occurred_at < w.ends_at
         GROUP BY c.name, p.size_display, p.brand, p.pattern
         ORDER BY c.name ASC, added_quantity DESC, p.size_display ASC
         LIMIT 30`,
        [reportDate],
      ),
      client.query<DailyMissingRow>(
        `WITH report_window AS (
           SELECT
             ($1::date::timestamp AT TIME ZONE 'Europe/London') AS starts_at,
             (($1::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/London') AS ends_at
         )
         SELECT
           c.name AS city_name,
           r.normalized_size,
           COUNT(*)::int AS request_count,
           STRING_AGG(DISTINCT COALESCE(u.name, u.email, 'Unknown'), ', ' ORDER BY COALESCE(u.name, u.email, 'Unknown')) AS requested_by
         FROM missing_tyre_requests r
         CROSS JOIN report_window w
         INNER JOIN stock_cities c ON c.id = r.city_id
         LEFT JOIN users u ON u.id = r.requester_user_id
         WHERE r.created_at >= w.starts_at
           AND r.created_at < w.ends_at
         GROUP BY c.name, r.normalized_size
         ORDER BY request_count DESC, c.name ASC, r.normalized_size ASC
         LIMIT 30`,
        [reportDate],
      ),
    ]);

    const items = buyResult.rows.map((row) => ({
      cityName: textValue(row.city_name, 'Unknown city'),
      sizeDisplay: textValue(row.size_display, 'Unknown size'),
      brand: textValue(row.brand),
      pattern: textValue(row.pattern),
      currentStock: numberValue(row.current_stock),
      orderedStock: numberValue(row.ordered_stock),
      targetStock: numberValue(row.target_stock),
      reducedQuantity: numberValue(row.reduced_quantity),
      soldQuantity: numberValue(row.sold_quantity),
      buyQuantity: numberValue(row.buy_quantity),
      reducedBy: textValue(row.reduced_by, 'Unknown'),
      channels: textValue(row.channels),
    }));

    const additions = additionResult.rows.map((row) => ({
      cityName: textValue(row.city_name, 'Unknown city'),
      sizeDisplay: textValue(row.size_display, 'Unknown size'),
      brand: textValue(row.brand),
      pattern: textValue(row.pattern),
      addedQuantity: numberValue(row.added_quantity),
      addedBy: textValue(row.added_by, 'Unknown'),
    }));

    const missingRequests = missingResult.rows.map((row) => ({
      cityName: textValue(row.city_name, 'Unknown city'),
      normalizedSize: textValue(row.normalized_size, 'Unknown size'),
      requestCount: numberValue(row.request_count),
      requestedBy: textValue(row.requested_by, 'Unknown'),
    }));

    return {
      items,
      additions,
      missingRequests,
      totals: {
        buyQuantity: items.reduce((sum, item) => sum + item.buyQuantity, 0),
        reducedQuantity: items.reduce((sum, item) => sum + item.reducedQuantity, 0),
        soldQuantity: items.reduce((sum, item) => sum + item.soldQuantity, 0),
        addedQuantity: additions.reduce((sum, item) => sum + item.addedQuantity, 0),
        missingRequests: missingRequests.reduce((sum, item) => sum + item.requestCount, 0),
      },
    };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function sendDailyStockBuyReport(
  options: SendDailyStockBuyReportOptions = {},
): Promise<SendDailyStockBuyReportResult> {
  const now = options.now ?? new Date();
  const force = options.force === true;
  const reportDate = reportDateFor(now);
  const reportDateLabel = formatReportDateLabel(reportDate);

  if (!force && !isLondonMidnightWindow(now)) {
    return {
      sent: false,
      skippedReason: 'not-london-midnight',
      reportDate,
      reportDateLabel,
      recipients: RECIPIENTS,
      itemCount: 0,
      totals: {
        buyQuantity: 0,
        reducedQuantity: 0,
        soldQuantity: 0,
        addedQuantity: 0,
        missingRequests: 0,
      },
    };
  }

  if (!force && (await alreadySent(reportDate))) {
    return {
      sent: false,
      skippedReason: 'already-sent',
      reportDate,
      reportDateLabel,
      recipients: RECIPIENTS,
      itemCount: 0,
      totals: {
        buyQuantity: 0,
        reducedQuantity: 0,
        soldQuantity: 0,
        addedQuantity: 0,
        missingRequests: 0,
      },
    };
  }

  const reportData = await fetchDailyReportData(reportDate);
  const inventoryUrl = `${getOutboundUrl()}/admin/inventory`;
  const emailData = {
    reportDateLabel,
    generatedAtLabel: formatLondonDateTime(now),
    inventoryUrl,
    items: reportData.items,
    additions: reportData.additions,
    missingRequests: reportData.missingRequests,
    totals: reportData.totals,
  };
  const email = stockDailyBuyReport(emailData);
  const pdf = await createStockDailyBuyReportPdf(emailData);
  const attachmentFilename = `tyre-rescue-buy-list-by-size-${reportDate}-${formatLondonFileStamp(now)}.pdf`;

  const sendResult = await sendEmail({
    to: RECIPIENTS,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      {
        filename: attachmentFilename,
        content: pdf,
        contentType: 'application/pdf',
      },
    ],
  });

  if (!sendResult.success) {
    throw new Error(sendResult.error ?? 'Failed to send daily stock buy report');
  }

  await createAdminNotification({
    type: REPORT_TYPE,
    title: `Daily stock buy list sent - ${reportDateLabel}`,
    body: `Sent ${reportData.totals.buyQuantity} tyres to buy across ${reportData.items.length} stock item${reportData.items.length === 1 ? '' : 's'}.`,
    entityType: 'stock',
    entityId: reportDate,
    link: '/admin/inventory',
    severity: 'info',
    createdBy: 'cron',
    metadata: {
      reportDate,
      recipients: RECIPIENTS,
      itemCount: reportData.items.length,
      totals: reportData.totals,
    },
  });

  return {
    sent: true,
    reportDate,
    reportDateLabel,
    recipients: RECIPIENTS,
    itemCount: reportData.items.length,
    attachmentFilename,
    subject: email.subject,
    totals: reportData.totals,
    messageId: sendResult.messageId,
  };
}
