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
} from 'react-native';
import { colors, fontSize, radius, space } from './theme';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────

interface DailyRevenue {
  date: string;
  revenue: number;
  bookings: number;
  completed: number;
}

interface SourceRevenue {
  sourceLabel: string;
  sourceApp: string;
  revenue: number;
  bookings: number;
}

interface StatusRevenue {
  status: string;
  revenue: number;
  count: number;
}

interface RevenueData {
  period: { days: number };
  totals: {
    revenue: string;
    bookings: number;
    completed: number;
    avgOrderValue: string;
    completionRate: string;
  };
  daily: DailyRevenue[];
  bySource: SourceRevenue[];
  byStatus: StatusRevenue[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtCurrency(v: number | string): string {
  const n = Number(v);
  return Number.isFinite(n) ? `£${n.toFixed(2)}` : '£0.00';
}

function fmtK(v: number): string {
  if (v >= 1000) return `£${(v / 1000).toFixed(1)}k`;
  return fmtCurrency(v);
}

const STATUS_COLORS: Record<string, string> = {
  completed: colors.success,
  cancelled: colors.danger,
  refunded: colors.danger,
  awaiting_payment: colors.warning,
  paid: colors.success,
  in_progress: colors.accent,
  confirmed: '#FDBA74',
  default: colors.muted,
};

function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? STATUS_COLORS.default;
}

const PERIODS = [7, 30, 90];

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Tab = 'overview' | 'daily' | 'sources';

// ── Main component ────────────────────────────────────────────────────────

export function AdminRevenueModal({ visible, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<RevenueData>(`/api/mobile/admin/analytics/revenue?days=${days}`);
      if (mountedRef.current) setData(res);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load revenue data.');
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

  const maxDailyRevenue = Math.max(...(data?.daily ?? []).map((d) => d.revenue), 1);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader
          title="Revenue"
          subtitle={data ? `Last ${data.period.days}d · ${fmtCurrency(data.totals.revenue)} total` : 'Loading…'}
          onClose={onClose}
        />

        {/* Period selector */}
        <View style={s.periodRow}>
          {PERIODS.map((d) => (
            <Pressable key={d} onPress={() => setDays(d)} style={[s.periodBtn, days === d && s.periodBtnActive]}>
              <Text style={[s.periodTxt, days === d && s.periodTxtActive]}>{d}d</Text>
            </Pressable>
          ))}
        </View>

        {/* KPI stat row */}
        {data && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.kpiScroll} contentContainerStyle={s.kpiRow}>
            <View style={[s.kpiCard, { borderTopColor: colors.accent }]}>
              <Text style={s.kpiVal}>{fmtK(Number(data.totals.revenue))}</Text>
              <Text style={s.kpiLbl}>Revenue</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.blue }]}>
              <Text style={s.kpiVal}>{data.totals.bookings}</Text>
              <Text style={s.kpiLbl}>Bookings</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.success }]}>
              <Text style={s.kpiVal}>{data.totals.completed}</Text>
              <Text style={s.kpiLbl}>Completed</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.purple }]}>
              <Text style={s.kpiVal}>{fmtCurrency(data.totals.avgOrderValue)}</Text>
              <Text style={s.kpiLbl}>Avg Order</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.cyan }]}>
              <Text style={s.kpiVal}>{data.totals.completionRate}%</Text>
              <Text style={s.kpiLbl}>Completion</Text>
            </View>
          </ScrollView>
        )}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
          {([
            { key: 'overview', label: 'Status Breakdown' },
            { key: 'daily', label: 'Daily Trend' },
            { key: 'sources', label: 'By Source' },
          ] as { key: Tab; label: string }[]).map((t) => (
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
            {tab === 'overview' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Revenue by Status</Text>
                {(data?.byStatus ?? []).map((st) => {
                  const maxRev = Math.max(...(data?.byStatus ?? []).map((x) => x.revenue), 1);
                  const pct = (st.revenue / maxRev) * 100;
                  return (
                    <View key={st.status} style={s.statusRow}>
                      <View style={s.statusRowTop}>
                        <Text style={[s.statusName, { color: statusColor(st.status) }]}>
                          {st.status.replace(/_/g, ' ')}
                        </Text>
                        <Text style={s.statusCount}>{st.count} bookings</Text>
                        <Text style={[s.statusRev, { color: statusColor(st.status) }]}>{fmtCurrency(st.revenue)}</Text>
                      </View>
                      <View style={s.barBg}>
                        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: statusColor(st.status) }]} />
                      </View>
                    </View>
                  );
                })}
                {(data?.byStatus ?? []).length === 0 && <Text style={s.emptyText}>No revenue data.</Text>}
              </View>
            )}

            {tab === 'daily' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Daily Revenue</Text>
                {(data?.daily ?? []).map((d) => {
                  const pct = (d.revenue / maxDailyRevenue) * 100;
                  return (
                    <View key={d.date} style={s.dailyRow}>
                      <View style={s.dailyRowTop}>
                        <Text style={s.dailyDate}>{d.date}</Text>
                        <Text style={s.dailyBookings}>{d.bookings} bookings</Text>
                        <Text style={[s.dailyRev, { color: d.revenue > 0 ? colors.success : colors.muted }]}>
                          {fmtCurrency(d.revenue)}
                        </Text>
                      </View>
                      <View style={s.barBg}>
                        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: colors.accent }]} />
                      </View>
                    </View>
                  );
                })}
                {(data?.daily ?? []).length === 0 && <Text style={s.emptyText}>No daily data available.</Text>}
              </View>
            )}

            {tab === 'sources' && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Revenue by Project Source</Text>
                {(data?.bySource ?? []).map((src) => {
                  const maxSrc = Math.max(...(data?.bySource ?? []).map((x) => x.revenue), 1);
                  const pct = (src.revenue / maxSrc) * 100;
                  return (
                    <View key={src.sourceApp} style={s.sourceRow}>
                      <View style={s.sourceRowTop}>
                        <Text style={s.sourceName}>{src.sourceLabel}</Text>
                        <Text style={s.sourceBookings}>{src.bookings} bookings</Text>
                        <Text style={[s.sourceRev, { color: colors.accent }]}>{fmtCurrency(src.revenue)}</Text>
                      </View>
                      <View style={s.barBg}>
                        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: colors.accent }]} />
                      </View>
                    </View>
                  );
                })}
                {(data?.bySource ?? []).length === 0 && <Text style={s.emptyText}>No source data available.</Text>}
              </View>
            )}
          </ScrollView>
        )}
      </AdminModalShell>
    </Modal>
  );
}

const s = StyleSheet.create({
  periodRow: { flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  periodBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  periodBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  periodTxt: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  periodTxtActive: { color: colors.accentText },
  kpiScroll: { maxHeight: 80 },
  kpiRow: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm, alignItems: 'flex-start' },
  kpiCard: { backgroundColor: colors.card, borderRadius: radius.md, borderTopWidth: 2, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 80, alignItems: 'center' },
  kpiVal: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  kpiLbl: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  tabBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  tab: { paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  tabTextActive: { color: colors.accent },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: 48, gap: space.md },
  section: { gap: space.sm },
  sectionTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.xs },
  statusRow: { gap: 6 },
  statusRowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusName: { flex: 1, fontSize: fontSize.xs, fontWeight: '800', textTransform: 'capitalize' },
  statusCount: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  statusRev: { fontSize: fontSize.xs, fontWeight: '900' },
  dailyRow: { gap: 4 },
  dailyRowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dailyDate: { flex: 1, color: colors.muted, fontSize: fontSize.xs, fontWeight: '600' },
  dailyBookings: { color: colors.subtle, fontSize: 10 },
  dailyRev: { fontSize: fontSize.xs, fontWeight: '900' },
  sourceRow: { gap: 4 },
  sourceRowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sourceName: { flex: 1, color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  sourceBookings: { color: colors.muted, fontSize: 10 },
  sourceRev: { fontSize: fontSize.xs, fontWeight: '900' },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  retryTxt: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.xs },
  emptyText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center', paddingVertical: space.xl },
} as const);
