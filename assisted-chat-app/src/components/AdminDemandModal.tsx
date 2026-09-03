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

interface DemandSnapshot {
  hourStart: string | null;
  pageViews: number | null;
  callClicks: number | null;
  bookingStarts: number | null;
  bookingCompletes: number | null;
  whatsappClicks: number | null;
  surchargeApplied: string | null;
}

interface AnalyticsData {
  bookings: { total: number; completed: number; revenue: string };
  visitors: { total: number; live: number; avgSessionSeconds: number };
  demandHistory: DemandSnapshot[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtHour(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London',
    }).format(new Date(iso));
  } catch { return iso; }
}

function surchargeLabel(v: string | null): string {
  if (!v) return '1.0×';
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}×` : v;
}

function surchargeColor(v: string | null): string {
  const n = Number(v ?? 1);
  if (n >= 1.5) return colors.danger;
  if (n >= 1.2) return colors.warning;
  return colors.success;
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Main component ────────────────────────────────────────────────────────

export function AdminDemandModal({ visible, onClose }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.get<AnalyticsData>('/api/mobile/admin/analytics');
      if (mountedRef.current) setData(res);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to load demand data.');
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const snapshots = data?.demandHistory ?? [];
  const maxPageViews = Math.max(...snapshots.map((s) => s.pageViews ?? 0), 1);
  const maxCallClicks = Math.max(...snapshots.map((s) => s.callClicks ?? 0), 1);
  const maxBookings = Math.max(...snapshots.map((s) => s.bookingStarts ?? 0), 1);

  const peakHour = snapshots.reduce<DemandSnapshot | null>((best, cur) => {
    if (!best) return cur;
    return (cur.pageViews ?? 0) > (best.pageViews ?? 0) ? cur : best;
  }, null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <AdminModalShell>
        <AdminModalHeader
          title="Demand Intelligence"
          subtitle="Last 24 hours · hourly demand signals"
          onClose={onClose}
        />

        {/* KPI row */}
        {data && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.kpiScroll} contentContainerStyle={s.kpiRow}>
            <View style={[s.kpiCard, { borderTopColor: colors.blue }]}>
              <Text style={s.kpiVal}>{data.visitors.live}</Text>
              <Text style={s.kpiLbl}>Live Now</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.accent }]}>
              <Text style={s.kpiVal}>{data.bookings.total}</Text>
              <Text style={s.kpiLbl}>Bookings (30d)</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.success }]}>
              <Text style={s.kpiVal}>{data.bookings.completed}</Text>
              <Text style={s.kpiLbl}>Completed</Text>
            </View>
            <View style={[s.kpiCard, { borderTopColor: colors.purple }]}>
              <Text style={s.kpiVal}>£{Number(data.bookings.revenue).toFixed(0)}</Text>
              <Text style={s.kpiLbl}>Revenue</Text>
            </View>
            {peakHour && (
              <View style={[s.kpiCard, { borderTopColor: colors.warning }]}>
                <Text style={s.kpiVal}>{fmtHour(peakHour.hourStart)}</Text>
                <Text style={s.kpiLbl}>Peak Hour</Text>
              </View>
            )}
          </ScrollView>
        )}

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
            {snapshots.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyIcon}>📊</Text>
                <Text style={s.emptyText}>No demand data yet. Demand snapshots are recorded hourly.</Text>
              </View>
            ) : (
              <>
                <Text style={s.sectionTitle}>Hourly Demand Signals</Text>
                {snapshots.map((snap, i) => {
                  const pvPct = ((snap.pageViews ?? 0) / maxPageViews) * 100;
                  const ccPct = ((snap.callClicks ?? 0) / maxCallClicks) * 100;
                  const bsPct = ((snap.bookingStarts ?? 0) / maxBookings) * 100;
                  const sColor = surchargeColor(snap.surchargeApplied);
                  return (
                    <View key={i} style={s.snapCard}>
                      <View style={s.snapHeader}>
                        <Text style={s.snapTime}>{fmtHour(snap.hourStart)}</Text>
                        <View style={[s.surchargePill, { borderColor: sColor, backgroundColor: `${sColor}22` }]}>
                          <Text style={[s.surchargeTxt, { color: sColor }]}>{surchargeLabel(snap.surchargeApplied)}</Text>
                        </View>
                      </View>

                      <View style={s.metricsRow}>
                        <View style={s.metric}>
                          <Text style={s.metricVal}>{snap.pageViews ?? 0}</Text>
                          <Text style={s.metricLbl}>Page Views</Text>
                        </View>
                        <View style={s.metric}>
                          <Text style={[s.metricVal, { color: colors.accent }]}>{snap.callClicks ?? 0}</Text>
                          <Text style={s.metricLbl}>Call Clicks</Text>
                        </View>
                        <View style={s.metric}>
                          <Text style={[s.metricVal, { color: colors.success }]}>{snap.bookingStarts ?? 0}</Text>
                          <Text style={s.metricLbl}>Booking Starts</Text>
                        </View>
                        <View style={s.metric}>
                          <Text style={[s.metricVal, { color: colors.cyan }]}>{snap.bookingCompletes ?? 0}</Text>
                          <Text style={s.metricLbl}>Completed</Text>
                        </View>
                        <View style={s.metric}>
                          <Text style={[s.metricVal, { color: '#25D366' }]}>{snap.whatsappClicks ?? 0}</Text>
                          <Text style={s.metricLbl}>WhatsApp</Text>
                        </View>
                      </View>

                      <View style={s.barsArea}>
                        <View style={s.barRowInline}>
                          <Text style={s.barRowLbl}>Views</Text>
                          <View style={s.barBg}>
                            <View style={[s.barFill, { width: `${pvPct}%` as `${number}%`, backgroundColor: colors.blue }]} />
                          </View>
                        </View>
                        <View style={s.barRowInline}>
                          <Text style={s.barRowLbl}>Calls</Text>
                          <View style={s.barBg}>
                            <View style={[s.barFill, { width: `${ccPct}%` as `${number}%`, backgroundColor: colors.accent }]} />
                          </View>
                        </View>
                        <View style={s.barRowInline}>
                          <Text style={s.barRowLbl}>Books</Text>
                          <View style={s.barBg}>
                            <View style={[s.barFill, { width: `${bsPct}%` as `${number}%`, backgroundColor: colors.success }]} />
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </AdminModalShell>
    </Modal>
  );
}

const s = StyleSheet.create({
  kpiScroll: { maxHeight: 80 },
  kpiRow: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm, alignItems: 'flex-start' },
  kpiCard: { backgroundColor: colors.card, borderRadius: radius.md, borderTopWidth: 2, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 90, alignItems: 'center' },
  kpiVal: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  kpiLbl: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, paddingBottom: 48, gap: space.sm },
  sectionTitle: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space.sm },
  snapCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border, gap: space.sm },
  snapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  snapTime: { color: colors.text, fontSize: fontSize.xs, fontWeight: '800' },
  surchargePill: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  surchargeTxt: { fontSize: 11, fontWeight: '900' },
  metricsRow: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  metric: { alignItems: 'center', minWidth: 52 },
  metricVal: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  metricLbl: { color: colors.subtle, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  barsArea: { gap: 4 },
  barRowInline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barRowLbl: { color: colors.subtle, fontSize: 9, fontWeight: '700', width: 32, textAlign: 'right' },
  barBg: { flex: 1, height: 5, backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: radius.pill },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.accent, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md },
  retryTxt: { color: colors.accentText, fontWeight: '800', fontSize: fontSize.xs },
  emptyWrap: { alignItems: 'center', paddingVertical: space.xxl, gap: space.md },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
} as const);
