import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors, fontSize, radius, space } from './theme';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface ChannelRow {
  channel: string;
  bookingCount: number;
  revenue: string;
  completed: number;
  conversionRate: string;
}

interface VisitorChannelRow {
  channel: string;
  visitorCount: number;
  avgDuration: number;
}

interface CampaignRow {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  bookingCount: number;
  revenue: string;
}

interface LandingPageRow {
  landingPage: string | null;
  bookingCount: number;
  revenue: string;
}

interface DailyTrendRow {
  date: string;
  channel: string;
  count: number;
}

interface TrafficData {
  period: { days: number; since: string };
  totals: { bookings: number; revenue: string };
  bookingChannels: ChannelRow[];
  visitorChannels: VisitorChannelRow[];
  campaigns: CampaignRow[];
  landingPages: LandingPageRow[];
  dailyTrend: DailyTrendRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  'Google Ads':      '#FBBC04',
  'Organic Search':  '#34A853',
  'Direct':          '#4F8CFF',
  'Referral':        '#A78BFA',
  'Social':          '#EC4899',
  'Campaign':        '#F97316',
  'Paid Search':     '#FBBC04',
  'Other Campaign':  '#9CA3AF',
  'Google Referral': '#34A853',
};

function channelColor(ch: string): string {
  return CHANNEL_COLORS[ch] ?? colors.muted;
}

const CHANNEL_ICONS: Record<string, string> = {
  'Google Ads':     '📢',
  'Organic Search': '🔍',
  'Direct':         '🔗',
  'Referral':       '↗️',
  'Social':         '📱',
  'Campaign':       '📣',
  'Paid Search':    '💰',
};

function channelIcon(ch: string): string {
  return CHANNEL_ICONS[ch] ?? '•';
}

function fmtCurrency(v: string | number): string {
  const n = Number(v);
  return Number.isFinite(n) ? `£${n.toFixed(2)}` : '£0.00';
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function shortPath(p: string | null): string {
  if (!p) return '/';
  try {
    const u = new URL(p);
    return u.pathname || '/';
  } catch {
    return p.length > 42 ? p.slice(0, 42) + '…' : p;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Tab = 'channels' | 'campaigns' | 'landing' | 'visitors';

const TABS: { key: Tab; label: string }[] = [
  { key: 'channels', label: 'Channels' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'landing', label: 'Pages' },
  { key: 'visitors', label: 'Visitors' },
];

const PERIODS = [7, 30, 90];

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={[s.statCard, { borderTopColor: color }]}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function BarRow({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={s.barRow}>
      <View style={s.barRowTop}>
        <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={[s.barVal, { color }]}>{value}</Text>
      </View>
      {sub ? <Text style={s.barSub}>{sub}</Text> : null}
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function AdminTrafficModal({ visible, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('channels');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<TrafficData>(`/api/mobile/admin/analytics/traffic?days=${days}`);
      if (mountedRef.current) setData(res);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load traffic data.');
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const totalBookings = data?.totals.bookings ?? 0;
  const totalRevenue = data?.totals.revenue ?? '0';

  const seoAdsData = (() => {
    if (!data) return null;
    const ads = data.bookingChannels.find((c) => c.channel === 'Google Ads');
    const seo = data.bookingChannels.find((c) => c.channel === 'Organic Search');
    const direct = data.bookingChannels.find((c) => c.channel === 'Direct');
    return { ads, seo, direct };
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader
          title="Traffic Attribution"
          subtitle={data ? `Last ${data.period.days} days · ${totalBookings} bookings · ${fmtCurrency(totalRevenue)}` : 'Loading…'}
          onClose={onClose}
        />

        {/* Period selector */}
        <View style={s.periodRow}>
          {PERIODS.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDays(d)}
              style={[s.periodBtn, days === d && s.periodBtnActive]}
            >
              <Text style={[s.periodTxt, days === d && s.periodTxtActive]}>{d}d</Text>
            </Pressable>
          ))}
        </View>

        {/* SEO vs Ads hero cards */}
        {seoAdsData && (
          <View style={s.heroRow}>
            <View style={[s.heroCard, { borderColor: '#34A853' }]}>
              <Text style={s.heroIcon}>🔍</Text>
              <Text style={[s.heroCount, { color: '#34A853' }]}>{seoAdsData.seo?.bookingCount ?? 0}</Text>
              <Text style={s.heroLabel}>SEO / Organic</Text>
              <Text style={s.heroSub}>{fmtCurrency(seoAdsData.seo?.revenue ?? '0')}</Text>
            </View>
            <View style={[s.heroCard, { borderColor: '#FBBC04' }]}>
              <Text style={s.heroIcon}>📢</Text>
              <Text style={[s.heroCount, { color: '#FBBC04' }]}>{seoAdsData.ads?.bookingCount ?? 0}</Text>
              <Text style={s.heroLabel}>Google Ads</Text>
              <Text style={s.heroSub}>{fmtCurrency(seoAdsData.ads?.revenue ?? '0')}</Text>
            </View>
            <View style={[s.heroCard, { borderColor: colors.blue }]}>
              <Text style={s.heroIcon}>🔗</Text>
              <Text style={[s.heroCount, { color: colors.blue }]}>{seoAdsData.direct?.bookingCount ?? 0}</Text>
              <Text style={s.heroLabel}>Direct</Text>
              <Text style={s.heroSub}>{fmtCurrency(seoAdsData.direct?.revenue ?? '0')}</Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabActive]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={colors.accent} size="large" /></View>
        ) : error ? (
          <View style={s.center}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={() => void load()} style={s.retryBtn}><Text style={s.retryTxt}>Retry</Text></Pressable>
          </View>
        ) : (
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} />}
          >
            {tab === 'channels' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Booking Channels</Text>
                {(data?.bookingChannels ?? []).map((ch) => (
                  <View key={ch.channel} style={s.channelCard}>
                    <View style={s.channelHeader}>
                      <Text style={s.channelIcon}>{channelIcon(ch.channel)}</Text>
                      <Text style={[s.channelName, { color: channelColor(ch.channel) }]}>{ch.channel}</Text>
                      <Text style={s.channelRate}>{ch.conversionRate}%</Text>
                    </View>
                    <View style={s.channelStats}>
                      <View style={s.channelStat}>
                        <Text style={s.channelStatVal}>{ch.bookingCount}</Text>
                        <Text style={s.channelStatLbl}>Bookings</Text>
                      </View>
                      <View style={s.channelStat}>
                        <Text style={s.channelStatVal}>{fmtCurrency(ch.revenue)}</Text>
                        <Text style={s.channelStatLbl}>Revenue</Text>
                      </View>
                      <View style={s.channelStat}>
                        <Text style={s.channelStatVal}>{ch.completed}</Text>
                        <Text style={s.channelStatLbl}>Completed</Text>
                      </View>
                    </View>
                    <View style={s.barBg}>
                      <View style={[s.barFill, { width: `${ch.conversionRate}%` as `${number}%`, backgroundColor: channelColor(ch.channel) }]} />
                    </View>
                  </View>
                ))}
                {(data?.bookingChannels ?? []).length === 0 && (
                  <Text style={s.emptyText}>No booking channel data for this period.</Text>
                )}
              </View>
            )}

            {tab === 'campaigns' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>UTM Campaigns</Text>
                {(data?.campaigns ?? []).map((c, i) => (
                  <View key={i} style={s.rowCard}>
                    <View style={s.rowCardTop}>
                      <Text style={s.rowCardMain} numberOfLines={1}>{c.utmCampaign ?? '—'}</Text>
                      <Text style={[s.rowCardCount, { color: colors.accent }]}>{c.bookingCount}</Text>
                    </View>
                    <Text style={s.rowCardSub}>{[c.utmSource, c.utmMedium].filter(Boolean).join(' / ')} · {fmtCurrency(c.revenue)}</Text>
                  </View>
                ))}
                {(data?.campaigns ?? []).length === 0 && (
                  <Text style={s.emptyText}>No UTM campaign data found. Make sure your Google Ads links include UTM parameters.</Text>
                )}
              </View>
            )}

            {tab === 'landing' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Top Landing Pages</Text>
                {(data?.landingPages ?? []).map((p, i) => {
                  const maxCount = Math.max(...(data?.landingPages ?? []).map((x) => x.bookingCount), 1);
                  return (
                    <BarRow
                      key={i}
                      label={shortPath(p.landingPage)}
                      value={p.bookingCount}
                      max={maxCount}
                      color={colors.accent}
                      sub={fmtCurrency(p.revenue)}
                    />
                  );
                })}
                {(data?.landingPages ?? []).length === 0 && (
                  <Text style={s.emptyText}>No landing page data available.</Text>
                )}
              </View>
            )}

            {tab === 'visitors' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Visitor Channels</Text>
                {(data?.visitorChannels ?? []).map((vc) => {
                  const maxV = Math.max(...(data?.visitorChannels ?? []).map((x) => x.visitorCount), 1);
                  return (
                    <BarRow
                      key={vc.channel}
                      label={`${channelIcon(vc.channel)} ${vc.channel}`}
                      value={vc.visitorCount}
                      max={maxV}
                      color={channelColor(vc.channel)}
                      sub={`Avg ${fmtDuration(vc.avgDuration)} session`}
                    />
                  );
                })}
                {(data?.visitorChannels ?? []).length === 0 && (
                  <Text style={s.emptyText}>No visitor channel data for this period.</Text>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </AdminModalShell>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  periodRow: { flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  periodBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  periodBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  periodTxt: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  periodTxtActive: { color: colors.accentText },
  heroRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  heroCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1.5, padding: space.sm, alignItems: 'center' },
  heroIcon: { fontSize: 20, marginBottom: 2 },
  heroCount: { fontSize: fontSize.xl, fontWeight: '900' },
  heroLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  heroSub: { color: colors.subtle, fontSize: 10, marginTop: 1 },
  tabBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  tab: { paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  tabTextActive: { color: colors.accent },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: 48 },
  section: { gap: space.sm },
  sectionTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.xs },
  channelCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, gap: space.sm, borderWidth: 1, borderColor: colors.border },
  channelHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  channelIcon: { fontSize: 18 },
  channelName: { flex: 1, fontSize: fontSize.sm, fontWeight: '800' },
  channelRate: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  channelStats: { flexDirection: 'row', gap: space.sm },
  channelStat: { flex: 1, alignItems: 'center' },
  channelStatVal: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  channelStatLbl: { color: colors.subtle, fontSize: 10, fontWeight: '600', marginTop: 2 },
  rowCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border },
  rowCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCardMain: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  rowCardCount: { fontSize: fontSize.md, fontWeight: '900' },
  rowCardSub: { color: colors.muted, fontSize: fontSize.xs, marginTop: 4 },
  barRow: { marginBottom: space.sm },
  barRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { flex: 1, color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  barVal: { fontSize: fontSize.xs, fontWeight: '900' },
  barSub: { color: colors.muted, fontSize: 10, marginBottom: 4 },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  retryTxt: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.xs },
  emptyText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: space.xl },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderTopWidth: 2, padding: space.md },
  statValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  statSub: { color: colors.subtle, fontSize: 10, marginTop: 1 },
} as const);
