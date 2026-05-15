import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, radius, space } from './theme';
import {
  useAdminVisitors,
  type VisitorItem,
  type VisitorPeriod,
  type VisitorStats,
  type LiveVisitorItem,
} from '@/hooks/useAdminVisitors';

// ── Accent palette matching the web app ──────────────────────────────────
const A = {
  indigo: '#818cf8',
  emerald: '#10b981',
  orange: '#f97316',
  cyan: '#06b6d4',
  pink: '#ec4899',
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#8b5cf6',
};

const PIE_COLORS = [A.indigo, A.emerald, A.orange, A.cyan, A.pink, A.yellow, A.purple];

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', opts ?? {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date(d));
  } catch {
    return '—';
  }
}

function fmtDuration(secs: number | null | undefined): string {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function shortRef(str: string | null | undefined): string {
  if (!str) return '—';
  return str.slice(0, 8);
}

// ── Sub-components ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}
function StatCard({ label, value, color, sub }: StatCardProps) {
  return (
    <View style={[s.statCard, { borderTopColor: color }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
      {sub ? <Text style={[s.statSub, { color: A.emerald }]}>{sub}</Text> : null}
    </View>
  );
}

// Horizontal bar chart row
interface BarRowProps {
  label: string;
  count: number;
  maxCount: number;
  color: string;
  index?: number;
}
function BarRow({ label, count, maxCount, color }: BarRowProps) {
  const pct = maxCount > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 4;
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel} numberOfLines={1}>{label || 'Direct / Unknown'}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.barCount, { color }]}>{count}</Text>
    </View>
  );
}

// New arrival toast
function ArrivalToast({ visitor, onDismiss }: { visitor: LiveVisitorItem; onDismiss: () => void }) {
  return (
    <Pressable style={s.toast} onPress={onDismiss}>
      <View style={s.toastDot} />
      <View style={{ flex: 1 }}>
        <Text style={s.toastTitle}>NEW VISITOR · {fmt(visitor.createdAt)}</Text>
        <Text style={s.toastBody} numberOfLines={1}>
          {[visitor.city, visitor.device, visitor.browser].filter(Boolean).join(' · ') || 'Unknown'}
        </Text>
        {visitor.searchKeyword
          ? <Text style={[s.toastBody, { color: A.indigo }]} numberOfLines={1}>🔍 {visitor.searchKeyword}</Text>
          : null}
        {(visitor.visitCount ?? 0) > 1
          ? <Text style={[s.toastSub, { color: A.orange }]}>×{visitor.visitCount} returning</Text>
          : null}
      </View>
    </Pressable>
  );
}

// Expandable visitor row (Live Feed)
function VisitorRow({ visitor }: { visitor: VisitorItem }) {
  const [expanded, setExpanded] = useState(false);
  const isOnline = visitor.isOnline;

  return (
    <Pressable onPress={() => setExpanded((x) => !x)} style={s.visitorRow}>
      {/* Row summary */}
      <View style={s.visitorRowTop}>
        <View style={[s.onlineDot, { backgroundColor: isOnline ? A.emerald : colors.border }]} />
        <View style={{ flex: 1 }}>
          <Text style={s.visitorCity} numberOfLines={1}>
            {visitor.city || 'Unknown'}{visitor.country ? `, ${visitor.country}` : ''}
            {(visitor.visitCount ?? 0) > 1
              ? <Text style={{ color: A.orange }}> ×{visitor.visitCount}</Text>
              : null}
          </Text>
          <Text style={s.visitorMeta} numberOfLines={1}>
            {[visitor.device, visitor.referrer].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.visitorBrowser}>{visitor.browser || '—'}</Text>
          <Text style={s.visitorPages}>{visitor.pagesVisited.length} pages</Text>
        </View>
        <Text style={[s.expandArrow, { color: expanded ? A.indigo : colors.muted }]}>{expanded ? '▴' : '▾'}</Text>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={s.visitorExpanded}>
          {/* Session */}
          <View style={s.expandSection}>
            <Text style={s.expandSectionTitle}>Session</Text>
            <View style={s.expandGrid}>
              <View style={s.expandCell}>
                <Text style={s.expandKey}>Arrived</Text>
                <Text style={[s.expandVal, { color: A.emerald }]}>{fmt(visitor.createdAt)}</Text>
              </View>
              <View style={s.expandCell}>
                <Text style={s.expandKey}>Left</Text>
                <Text style={[s.expandVal, { color: visitor.exitedAt ? A.red : colors.subtle }]}>
                  {visitor.exitedAt ? fmt(visitor.exitedAt) : 'still here'}
                </Text>
              </View>
              <View style={s.expandCell}>
                <Text style={s.expandKey}>Duration</Text>
                <Text style={[s.expandVal, { color: A.orange }]}>{fmtDuration(visitor.sessionDuration)}</Text>
              </View>
              <View style={s.expandCell}>
                <Text style={s.expandKey}>IP</Text>
                <Text style={s.expandVal}>{shortRef(visitor.ipHash)}</Text>
              </View>
            </View>
          </View>

          {/* Pages */}
          {visitor.pagesVisited.length > 0 && (
            <View style={s.expandSection}>
              <Text style={s.expandSectionTitle}>Pages Visited</Text>
              {visitor.pagesVisited.slice(0, 6).map((p, i) => (
                <Text key={i} style={s.expandPage} numberOfLines={1}>→ {p.path}</Text>
              ))}
            </View>
          )}

          {/* Clicks */}
          {visitor.buttonsClicked.length > 0 && (
            <View style={s.expandSection}>
              <Text style={s.expandSectionTitle}>Buttons Clicked</Text>
              <View style={s.tagRow}>
                {visitor.buttonsClicked.map((b, i) => (
                  <View key={i} style={s.tag}>
                    <Text style={s.tagText}>{b.buttonText}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Search & Tech */}
          <View style={s.expandSection}>
            <Text style={s.expandSectionTitle}>Search & Tech</Text>
            <View style={s.expandGrid}>
              {visitor.searchKeyword && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Keyword</Text>
                  <Text style={[s.expandVal, { color: A.indigo }]}>{visitor.searchKeyword}</Text>
                </View>
              )}
              {visitor.searchEngine && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Engine</Text>
                  <Text style={[s.expandVal, { color: A.cyan }]}>{visitor.searchEngine}</Text>
                </View>
              )}
              {visitor.browser && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Browser</Text>
                  <Text style={s.expandVal}>{visitor.browser}</Text>
                </View>
              )}
              {visitor.device && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Device</Text>
                  <Text style={s.expandVal}>{visitor.device}</Text>
                </View>
              )}
              {visitor.referrer && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Referrer</Text>
                  <Text style={s.expandVal} numberOfLines={1}>{visitor.referrer}</Text>
                </View>
              )}
              {visitor.ageGroup && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Age</Text>
                  <Text style={s.expandVal}>{visitor.ageGroup}</Text>
                </View>
              )}
              {visitor.gender && (
                <View style={s.expandCell}>
                  <Text style={s.expandKey}>Gender</Text>
                  <Text style={s.expandVal}>{visitor.gender}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ── Tab content components ────────────────────────────────────────────────

function LiveFeedTab({ visitors, totalCount }: { visitors: VisitorItem[]; totalCount: number }) {
  if (visitors.length === 0) {
    return <Text style={s.emptyText}>No visitors in this period</Text>;
  }
  return (
    <>
      {visitors.map((v) => <VisitorRow key={v.id} visitor={v} />)}
      <Text style={s.feedFooter}>Showing {visitors.length} of {totalCount} · Auto-refreshing</Text>
    </>
  );
}

function WeeklyTab({ stats }: { stats: VisitorStats }) {
  const max = Math.max(...stats.dailyTrend.map(d => d.visitors), 1);
  const trend = stats.trendPct;
  return (
    <>
      <View style={s.sectionCard}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>Daily Trend</Text>
          <Text style={[s.trendBadge, { color: trend >= 0 ? A.emerald : A.red }]}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs prior week
          </Text>
        </View>
        {stats.dailyTrend.length === 0
          ? <Text style={s.emptyText}>No data</Text>
          : stats.dailyTrend.map((d, i) => (
              <BarRow key={i} label={d.day} count={d.visitors} maxCount={max} color={A.indigo} />
            ))}
      </View>
    </>
  );
}

function MonthlyTab({ stats }: { stats: VisitorStats }) {
  const maxM = Math.max(...stats.monthlyTrend.map(d => d.visitors), 1);
  const maxR = Math.max(...stats.referrerBreakdown.map(r => r.count), 1);
  return (
    <>
      <View style={s.sectionCard}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>Monthly Trend</Text>
          <Text style={[s.cardSub, { color: A.indigo }]}>Total: {stats.totalVisitors}</Text>
        </View>
        {stats.monthlyTrend.length === 0
          ? <Text style={s.emptyText}>No data</Text>
          : stats.monthlyTrend.map((d, i) => (
              <BarRow key={i} label={d.month} count={d.visitors} maxCount={maxM} color={A.indigo} />
            ))}
      </View>
      <View style={s.sectionCard}>
        <Text style={s.cardTitle}>Traffic Sources</Text>
        {stats.referrerBreakdown.slice(0, 8).map((r, i) => (
          <BarRow
            key={i}
            label={r.referrer || 'Direct / Unknown'}
            count={r.count}
            maxCount={maxR}
            color={PIE_COLORS[i % PIE_COLORS.length]}
          />
        ))}
      </View>
    </>
  );
}

function ClicksTab({ stats }: { stats: VisitorStats }) {
  const max = Math.max(...stats.buttonBreakdown.map(b => b.count), 1);
  return (
    <View style={s.sectionCard}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>Button Click Heatmap</Text>
        <Text style={s.cardSub}>{stats.buttonBreakdown.length} tracked</Text>
      </View>
      {stats.buttonBreakdown.length === 0
        ? <Text style={s.emptyText}>No clicks recorded</Text>
        : stats.buttonBreakdown.map((b, i) => (
            <BarRow key={i} label={b.buttonText} count={b.count} maxCount={max} color={A.orange} />
          ))}
    </View>
  );
}

function KeywordsTab({ stats }: { stats: VisitorStats }) {
  const maxK = Math.max(...stats.topKeywords.map(k => k.count), 1);
  const maxB = Math.max(...stats.browserBreakdown.slice(0, 8).map(b => b.count), 1);
  return (
    <>
      <View style={s.sectionCard}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>Search Keywords</Text>
          <Text style={s.cardSub}>{stats.topKeywords.length} unique</Text>
        </View>
        {stats.topKeywords.length === 0
          ? <Text style={s.emptyText}>No keyword data</Text>
          : stats.topKeywords.map((k, i) => (
              <BarRow key={i} label={k.keyword || '(not set)'} count={k.count} maxCount={maxK} color={A.indigo} />
            ))}
      </View>
      <View style={s.sectionCard}>
        <Text style={s.cardTitle}>Search Engines</Text>
        <View style={s.engineGrid}>
          {stats.engineBreakdown.map((e, i) => (
            <View key={i} style={[s.engineTile, { borderColor: PIE_COLORS[i % PIE_COLORS.length] }]}>
              <Text style={[s.engineCount, { color: PIE_COLORS[i % PIE_COLORS.length] }]}>{e.count}</Text>
              <Text style={s.engineName}>{e.engine || 'Other'}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.sectionCard}>
        <Text style={s.cardTitle}>Browsers</Text>
        {stats.browserBreakdown.slice(0, 8).map((b, i) => (
          <BarRow key={i} label={b.browser || 'Unknown'} count={b.count} maxCount={maxB} color={A.cyan} />
        ))}
      </View>
      <View style={s.sectionCard}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>Returning Visitors</Text>
        </View>
        <Text style={[s.bigStat, { color: A.orange }]}>{stats.returningVisitors}</Text>
        <Text style={s.bigStatSub}>
          of {stats.totalVisitors} total (
          {stats.totalVisitors > 0
            ? Math.round((stats.returningVisitors / stats.totalVisitors) * 100)
            : 0}%)
        </Text>
      </View>
    </>
  );
}

function GeoTab({ stats }: { stats: VisitorStats }) {
  const maxA = Math.max(...stats.ageBreakdown.map(a => a.count), 1);
  const maxG = Math.max(...stats.genderBreakdown.map(g => g.count), 1);
  const hasDemo = stats.ageBreakdown.length > 0 || stats.genderBreakdown.length > 0;
  return (
    <>
      <View style={s.sectionCard}>
        <Text style={s.cardTitle}>Visitor Locations</Text>
        <View style={s.cityGrid}>
          {stats.cityBreakdown.slice(0, 8).map((c, i) => (
            <View key={i} style={[s.cityTile, { borderColor: A.indigo }]}>
              <Text style={[s.cityCount, { color: A.indigo }]}>{c.count}</Text>
              <Text style={s.cityName}>{c.city || 'Unknown'}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.sectionCard}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>Demographics</Text>
          <View style={s.gdprBadge}><Text style={s.gdprText}>UK GDPR · Consent-only</Text></View>
        </View>
        {!hasDemo
          ? <Text style={s.emptyText}>No consent-based data available</Text>
          : (
            <>
              {stats.ageBreakdown.length > 0 && (
                <>
                  <Text style={s.demoSubtitle}>Age Groups</Text>
                  {stats.ageBreakdown.map((a, i) => (
                    <BarRow key={i} label={a.ageGroup || 'Unknown'} count={a.count} maxCount={maxA} color={A.cyan} />
                  ))}
                </>
              )}
              {stats.genderBreakdown.length > 0 && (
                <>
                  <Text style={[s.demoSubtitle, { marginTop: space.md }]}>Gender</Text>
                  {stats.genderBreakdown.map((g, i) => (
                    <BarRow
                      key={i}
                      label={g.gender || 'Unknown'}
                      count={g.count}
                      maxCount={maxG}
                      color={g.gender?.toLowerCase() === 'female' ? A.pink : A.indigo}
                    />
                  ))}
                </>
              )}
            </>
          )}
      </View>
    </>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'live', label: '⚡ Live Feed' },
  { id: 'weekly', label: '📊 Weekly' },
  { id: 'monthly', label: '📈 Monthly' },
  { id: 'clicks', label: '🔥 Clicks' },
  { id: 'keywords', label: '🔍 Keywords' },
  { id: 'geo', label: '🌍 Locations' },
] as const;

type TabId = typeof TABS[number]['id'];
type Period = VisitorPeriod;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AdminVisitorsModal({ visible, onClose }: Props) {
  const [period, setPeriod] = useState<Period>('week');
  const [activeTab, setActiveTab] = useState<TabId>('live');

  const { visitors, stats, totalCount, loading, error, newArrivals, dismissArrival, refresh } =
    useAdminVisitors(period, visible);

  const PERIODS: Array<{ id: Period; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={s.root}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Visitors</Text>
            <Text style={s.subtitle}>Real-time analytics · UK GDPR Compliant</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {stats && (
              <View style={s.livePill}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>{stats.liveCount} LIVE</Text>
              </View>
            )}
            <Pressable onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Period selector */}
        <View style={s.periodRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPeriod(p.id)}
              style={[s.periodBtn, period === p.id && s.periodBtnActive]}
            >
              <Text style={[s.periodBtnText, period === p.id && s.periodBtnTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={refresh} style={s.refreshBtn} disabled={loading}>
            <Text style={s.refreshBtnText}>{loading ? '…' : '↺'}</Text>
          </Pressable>
        </View>

        {/* Stat cards */}
        {stats && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.statsScroll} contentContainerStyle={s.statsRow}>
            <StatCard
              label={period === 'today' ? 'Today' : period === 'month' ? 'This Month' : 'This Week'}
              value={stats.totalVisitors}
              color={A.indigo}
              sub={`${stats.trendPct >= 0 ? '▲' : '▼'} ${Math.abs(stats.trendPct)}%`}
            />
            <StatCard label="Live Now" value={stats.liveCount} color={A.emerald} />
            <StatCard label="Avg Session" value={fmtDuration(stats.avgSessionDuration)} color={A.orange} />
            <StatCard label="Conv. Rate" value="0%" color={A.cyan} />
            <StatCard label="Mobile %" value={`${stats.mobilePct}%`} color={A.pink} />
          </ScrollView>
        )}

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => setActiveTab(t.id)} style={[s.tabBtn, activeTab === t.id && s.tabBtnActive]}>
              <Text style={[s.tabBtnText, activeTab === t.id && s.tabBtnTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Body */}
        <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
          {/* New arrival toasts */}
          {newArrivals.length > 0 && (
            <View style={s.toastStack}>
              {newArrivals.map((v) => (
                <ArrivalToast key={v.id} visitor={v} onDismiss={() => dismissArrival(v.id)} />
              ))}
            </View>
          )}

          {error && <Text style={s.errorText}>{error}</Text>}

          {loading && !stats ? (
            <ActivityIndicator color={A.indigo} style={{ marginTop: 40 }} />
          ) : stats ? (
            <>
              {activeTab === 'live' && <LiveFeedTab visitors={visitors} totalCount={totalCount} />}
              {activeTab === 'weekly' && <WeeklyTab stats={stats} />}
              {activeTab === 'monthly' && <MonthlyTab stats={stats} />}
              {activeTab === 'clicks' && <ClicksTab stats={stats} />}
              {activeTab === 'keywords' && <KeywordsTab stats={stats} />}
              {activeTab === 'geo' && <GeoTab stats={stats} />}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.subtle, fontFamily: 'monospace', marginTop: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    paddingHorizontal: space.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: A.emerald,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: A.emerald },
  liveText: { fontSize: fontSize.xs, color: A.emerald, fontFamily: 'monospace', fontWeight: '700' },
  closeBtn: { padding: space.sm },
  closeBtnText: { fontSize: fontSize.lg, color: colors.muted },

  // Period
  periodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm,
  },
  periodBtn: {
    paddingHorizontal: space.md, paddingVertical: space.xs,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  periodBtnActive: { borderColor: A.indigo, backgroundColor: `${A.indigo}22` },
  periodBtnText: { fontSize: fontSize.sm, color: colors.muted },
  periodBtnTextActive: { color: A.indigo, fontWeight: '600' },
  refreshBtn: {
    marginLeft: 'auto' as never, paddingHorizontal: space.md, paddingVertical: space.xs,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
  },
  refreshBtnText: { fontSize: fontSize.lg, color: colors.muted },

  // Stats row
  statsScroll: { flexGrow: 0 },
  statsRow: { flexDirection: 'row', paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  statCard: {
    width: 96, backgroundColor: colors.surface,
    borderRadius: radius.md, padding: space.sm,
    borderTopWidth: 2, borderWidth: 1, borderColor: colors.border,
  },
  statValue: { fontSize: fontSize.lg, fontWeight: '800', fontFamily: 'monospace' },
  statLabel: { fontSize: fontSize.xs, color: colors.subtle, marginTop: 2 },
  statSub: { fontSize: fontSize.xs, fontFamily: 'monospace', marginTop: 2 },

  // Tab bar
  tabScroll: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { flexDirection: 'row', paddingHorizontal: space.md, paddingBottom: 0, gap: 2 },
  tabBtn: { paddingHorizontal: space.md, paddingVertical: space.sm },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: A.indigo },
  tabBtnText: { fontSize: fontSize.sm, color: colors.muted },
  tabBtnTextActive: { color: A.indigo, fontWeight: '600' },

  // Body
  body: { flex: 1 },
  bodyContent: { padding: space.md, paddingBottom: 40 },
  emptyText: { color: colors.subtle, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.xl },
  errorText: { color: colors.danger, fontSize: fontSize.sm, textAlign: 'center', marginTop: space.lg },

  // Toast / arrivals
  toastStack: { marginBottom: space.md, gap: space.sm },
  toast: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderLeftWidth: 3, borderLeftColor: A.emerald,
    borderWidth: 1, borderColor: colors.border,
    padding: space.sm,
  },
  toastDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: A.emerald, marginTop: 3 },
  toastTitle: { fontSize: fontSize.xs, color: A.emerald, fontFamily: 'monospace', fontWeight: '700' },
  toastBody: { fontSize: fontSize.xs, color: colors.muted, marginTop: 1 },
  toastSub: { fontSize: fontSize.xs, fontFamily: 'monospace', marginTop: 1 },

  // Section cards
  sectionCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: space.md, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: fontSize.xs, color: colors.muted, fontFamily: 'monospace' },
  trendBadge: { fontSize: fontSize.xs, fontFamily: 'monospace', fontWeight: '700' },

  // Bar charts
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: space.sm },
  barLabel: { fontSize: fontSize.xs, color: colors.muted, width: 110 },
  barTrack: { flex: 1, height: 6, backgroundColor: colors.card, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  barCount: { fontSize: fontSize.xs, fontFamily: 'monospace', width: 36, textAlign: 'right' },

  // Engine grid
  engineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  engineTile: {
    borderWidth: 1, borderRadius: radius.md, padding: space.sm,
    minWidth: 80, alignItems: 'center',
  },
  engineCount: { fontSize: fontSize.xl, fontWeight: '800', fontFamily: 'monospace' },
  engineName: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  // City grid
  cityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  cityTile: {
    borderWidth: 1, borderRadius: radius.md, padding: space.sm,
    minWidth: 80, alignItems: 'center',
  },
  cityCount: { fontSize: fontSize.xl, fontWeight: '800', fontFamily: 'monospace' },
  cityName: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },

  // Big stat
  bigStat: { fontSize: 40, fontWeight: '800', fontFamily: 'monospace', marginTop: space.xs },
  bigStatSub: { fontSize: fontSize.sm, color: colors.muted, marginTop: space.xs },

  // Demo
  gdprBadge: {
    backgroundColor: colors.card, borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  gdprText: { fontSize: 10, color: colors.subtle },
  demoSubtitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.muted, marginBottom: space.xs },

  // Live feed
  feedFooter: { fontSize: fontSize.xs, color: colors.subtle, textAlign: 'center', marginTop: space.md, fontFamily: 'monospace' },

  // Visitor row
  visitorRow: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: 6,
    overflow: 'hidden',
  },
  visitorRowTop: { flexDirection: 'row', alignItems: 'center', padding: space.sm, gap: space.sm },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  visitorCity: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  visitorMeta: { fontSize: fontSize.xs, color: A.indigo, marginTop: 1 },
  visitorBrowser: { fontSize: fontSize.xs, color: colors.muted },
  visitorPages: { fontSize: fontSize.xs, color: colors.subtle, marginTop: 1 },
  expandArrow: { fontSize: fontSize.sm, paddingLeft: space.xs },

  // Expanded
  visitorExpanded: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: space.sm, paddingBottom: space.sm,
  },
  expandSection: { marginTop: space.sm },
  expandSectionTitle: { fontSize: fontSize.xs, fontWeight: '700', color: colors.subtle, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  expandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  expandCell: { minWidth: 100 },
  expandKey: { fontSize: fontSize.xs, color: colors.subtle },
  expandVal: { fontSize: fontSize.xs, color: colors.text, fontFamily: 'monospace', marginTop: 1 },
  expandPage: { fontSize: fontSize.xs, color: colors.muted, marginBottom: 3 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: {
    backgroundColor: `${A.orange}22`, borderRadius: radius.sm,
    paddingHorizontal: space.xs, paddingVertical: 2,
    borderWidth: 1, borderColor: A.orange,
  },
  tagText: { fontSize: fontSize.xs, color: A.orange },
});
