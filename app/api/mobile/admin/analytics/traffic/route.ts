import { NextResponse } from 'next/server';
import { sql, gte } from 'drizzle-orm';
import { db, bookings, siteVisitors } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || '30')));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const [bookingChannels, campaignRows, landingRows, visitorChannels, dailyRows] = await Promise.all([
    // Booking-level channel attribution
    db
      .select({
        channel: sql<string>`
          case
            when ${bookings.gclid} is not null then 'Google Ads'
            when lower(${bookings.utmMedium}) = 'cpc' then 'Google Ads'
            when lower(${bookings.utmMedium}) = 'paid' then 'Paid Search'
            when lower(${bookings.utmSource}) in ('google','bing','yahoo') and ${bookings.utmMedium} is null then 'Organic Search'
            when ${bookings.utmSource} is not null and ${bookings.utmMedium} is not null then 'Other Campaign'
            when ${bookings.referrer} like '%google.%' and ${bookings.utmMedium} is null then 'Organic Search'
            when ${bookings.referrer} like '%bing.%' and ${bookings.utmMedium} is null then 'Organic Search'
            when ${bookings.referrer} is not null and ${bookings.referrer} != '' then 'Referral'
            else 'Direct'
          end
        `,
        bookingCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
        completed: sql<number>`count(*) filter (where ${bookings.status} = 'completed')::int`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(sql`1`),

    // Top campaigns
    db
      .select({
        utmSource: bookings.utmSource,
        utmMedium: bookings.utmMedium,
        utmCampaign: bookings.utmCampaign,
        bookingCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
      })
      .from(bookings)
      .where(sql`${bookings.createdAt} >= ${since} and ${bookings.utmCampaign} is not null`)
      .groupBy(bookings.utmSource, bookings.utmMedium, bookings.utmCampaign)
      .orderBy(sql`count(*) desc`)
      .limit(10),

    // Top landing pages
    db
      .select({
        landingPage: bookings.landingPage,
        bookingCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${bookings.totalAmount}), 0)::numeric`,
      })
      .from(bookings)
      .where(sql`${bookings.createdAt} >= ${since} and ${bookings.landingPage} is not null`)
      .groupBy(bookings.landingPage)
      .orderBy(sql`count(*) desc`)
      .limit(10),

    // Visitor-level channel (from referrer + searchEngine)
    db
      .select({
        channel: sql<string>`
          case
            when ${siteVisitors.searchEngine} is not null then 'Organic Search'
            when ${siteVisitors.referrer} like '%google.%' then 'Google Referral'
            when ${siteVisitors.referrer} like '%facebook.%' or ${siteVisitors.referrer} like '%instagram.%' then 'Social'
            when ${siteVisitors.referrer} is not null and ${siteVisitors.referrer} != '' then 'Referral'
            else 'Direct'
          end
        `,
        visitorCount: sql<number>`count(*)::int`,
        avgDuration: sql<number>`coalesce(avg(${siteVisitors.sessionDuration}), 0)::int`,
      })
      .from(siteVisitors)
      .where(gte(siteVisitors.createdAt, since))
      .groupBy(sql`1`),

    // Daily booking counts by channel (last 30 days max for chart)
    db
      .select({
        date: sql<string>`date_trunc('day', ${bookings.createdAt})::date::text`,
        channel: sql<string>`
          case
            when ${bookings.gclid} is not null or lower(${bookings.utmMedium}) = 'cpc' then 'Google Ads'
            when ${bookings.referrer} like '%google.%' and ${bookings.utmMedium} is null then 'Organic Search'
            when ${bookings.utmSource} is not null then 'Campaign'
            else 'Direct'
          end
        `,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(sql`1, 2`)
      .orderBy(sql`1`),
  ]);

  const totalBookings = bookingChannels.reduce((s, r) => s + Number(r.bookingCount), 0);
  const totalRevenue = bookingChannels.reduce((s, r) => s + Number(r.revenue), 0);

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    totals: { bookings: totalBookings, revenue: totalRevenue.toFixed(2) },
    bookingChannels: bookingChannels.map((r) => ({
      channel: r.channel,
      bookingCount: Number(r.bookingCount),
      revenue: Number(r.revenue).toFixed(2),
      completed: Number(r.completed),
      conversionRate: totalBookings > 0 ? ((Number(r.bookingCount) / totalBookings) * 100).toFixed(1) : '0',
    })),
    visitorChannels: visitorChannels.map((r) => ({
      channel: r.channel,
      visitorCount: Number(r.visitorCount),
      avgDuration: Number(r.avgDuration),
    })),
    campaigns: campaignRows.map((r) => ({
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
      bookingCount: Number(r.bookingCount),
      revenue: Number(r.revenue).toFixed(2),
    })),
    landingPages: landingRows.map((r) => ({
      landingPage: r.landingPage,
      bookingCount: Number(r.bookingCount),
      revenue: Number(r.revenue).toFixed(2),
    })),
    dailyTrend: dailyRows.map((r) => ({
      date: r.date,
      channel: r.channel,
      count: Number(r.count),
    })),
  });
}
