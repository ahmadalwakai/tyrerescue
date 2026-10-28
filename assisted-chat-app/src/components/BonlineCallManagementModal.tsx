import { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useBonlineRequestScope } from '@/hooks/useBonlineRequestScope';
import { useBonlineResource } from '@/hooks/useBonlineResource';
import { formatBonlineCallTime, formatBonlineMoneyPence, formatBonlineRate, normalizeBonlineDestination } from '@/lib/bonline-call-presentation';
import type { BonlineAnalyticsResponse, BonlineAttributionContext, BonlineCallsResponse, BonlineFollowUpAction, BonlineManagedCall, BonlineOutboundCapability } from '@/types/bonline';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';
import { BonlineCallButton } from './BonlineCallButton';
import { AppButton } from './ui';
import { colors, fontSize, radius, space } from './theme';

type Tab = 'followups' | 'calls' | 'report';
export interface BonlineCallManagementModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  attributionContext?: BonlineAttributionContext;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'followups', label: 'Follow-ups' }, { key: 'calls', label: 'Calls' }, { key: 'report', label: 'Report' },
];
const OUTCOME_LABELS = { missed: 'Missed', answered: 'Answered', ringing: 'Ringing', unknown: 'Outcome unknown' };

export function isBonlineFollowUpOverdue(call: BonlineManagedCall, now = Date.now()): boolean {
  if (!call.followUp || call.followUp.status === 'resolved') return false;
  const started = Date.parse(call.followUp.createdAt || call.endedAt || call.firstReceivedAt);
  return Number.isFinite(started) && now - started >= 15 * 60_000;
}

export function canLinkBonlineCall(call: BonlineManagedCall, context?: BonlineAttributionContext): boolean {
  const destination = normalizeBonlineDestination(call.phone ?? '');
  return Boolean(destination && context && (context.bookingId || context.quoteId)
    && destination === normalizeBonlineDestination(context.phone));
}

export function BonlineCallManagementModal({ visible, onClose, onDismiss, attributionContext }: BonlineCallManagementModalProps) {
  const [tab, setTab] = useState<Tab>('followups');
  const [followUpFilter, setFollowUpFilter] = useState<'open' | 'resolved'>('open');
  const [days, setDays] = useState(30);
  const [before, setBefore] = useState<string | null>(null);
  const [mutating, setMutating] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [linkedIds, setLinkedIds] = useState<Set<string>>(() => new Set());
  const mutationLock = useRef(false);
  const contextKey = JSON.stringify([attributionContext?.phone, attributionContext?.bookingId, attributionContext?.quoteId]);
  const { scopeKey, captureScope, isCurrent } = useBonlineRequestScope(visible, `${tab}:${followUpFilter}:${before}:${contextKey}`);
  const callsPath = `/api/mobile/admin/phone/calls?limit=40${tab === 'followups' ? `&followUp=${followUpFilter}` : ''}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
  const calls = useBonlineResource<BonlineCallsResponse>(visible && tab !== 'report', callsPath);
  const report = useBonlineResource<BonlineAnalyticsResponse>(visible && tab === 'report', `/api/mobile/admin/phone/analytics?days=${days}`);
  const outbound = useBonlineResource<BonlineOutboundCapability>(visible && tab !== 'report', '/api/mobile/admin/phone/outbound');
  const active = tab === 'report' ? report : calls;
  const refreshVisibleData = async () => {
    await Promise.allSettled([active.refresh(), ...(tab === 'report' ? [] : [outbound.refresh()])]);
  };

  useLayoutEffect(() => {
    mutationLock.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear previous admin/workspace actions before this modal becomes visible.
    setMutating(null); setMutationError(null); setResolutionId(null); setResolution(''); setLinkedIds(new Set());
  }, [scopeKey, visible]);

  const changeTab = (next: Tab) => { setTab(next); setBefore(null); };
  const updateFollowUp = (call: BonlineManagedCall, action: BonlineFollowUpAction) => {
    const scope = captureScope();
    if (!isCurrent(scope) || mutationLock.current) return;
    const titles = { claim: 'Claim follow-up', release: 'Release follow-up', resolve: 'Resolve follow-up' };
    const note = resolution.trim();
    Alert.alert(titles[action], action === 'resolve'
      ? `Mark the follow-up for ${call.phone} as completed?`
      : `${action === 'claim' ? 'Assign this follow-up to you' : 'Return this follow-up to the unassigned queue'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: titles[action], onPress: async () => {
        if (!isCurrent(scope) || mutationLock.current) return;
        mutationLock.current = true; setMutating(call.id); setMutationError(null);
        try {
          await api.patch(`/api/mobile/admin/phone/calls/${encodeURIComponent(call.id)}/follow-up`, {
            action, ...(action === 'resolve' && note ? { resolution: note } : {}),
          });
          if (isCurrent(scope)) {
            setResolutionId(null); setResolution(''); await calls.refresh();
          }
        } catch (cause) {
          if (isCurrent(scope)) {
            setMutationError(cause instanceof Error ? cause.message : 'Unable to update the follow-up.');
            await calls.refresh();
          }
        } finally {
          if (isCurrent(scope)) { mutationLock.current = false; setMutating(null); }
        }
      } },
    ]);
  };

  const linkCall = (call: BonlineManagedCall) => {
    const scope = captureScope();
    if (!isCurrent(scope) || mutationLock.current || !canLinkBonlineCall(call, attributionContext) || !attributionContext) return;
    const body = {
      ...(attributionContext.bookingId ? { bookingId: attributionContext.bookingId } : {}),
      ...(attributionContext.quoteId ? { quoteId: attributionContext.quoteId } : {}),
    };
    Alert.alert('Link this call', `Link the call from ${call.phone} to the current ${attributionContext.bookingId ? 'booking' : 'quote'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Link call', onPress: async () => {
        if (!isCurrent(scope) || mutationLock.current) return;
        mutationLock.current = true; setMutating(call.id); setMutationError(null);
        try {
          await api.post(`/api/mobile/admin/phone/calls/${encodeURIComponent(call.id)}/link`, body);
          if (isCurrent(scope)) setLinkedIds((current) => new Set([...current, call.id]));
        } catch (cause) {
          if (isCurrent(scope)) setMutationError(cause instanceof Error ? cause.message : 'Unable to link this call.');
        } finally {
          if (isCurrent(scope)) { mutationLock.current = false; setMutating(null); }
        }
      } },
    ]);
  };

  const renderCall = (call: BonlineManagedCall) => {
    const task = call.followUp;
    const mine = task?.assignedTo === calls.data?.currentAdminId;
    const overdue = isBonlineFollowUpOverdue(call);
    const linking = canLinkBonlineCall(call, attributionContext);
    return (
      <View key={call.id} style={[s.card, overdue && s.overdueCard]} testID="bonline-call-card">
        <View style={s.headingRow}>
          <Text selectable style={s.phone}>{call.phone || 'Number unavailable'}</Text>
          <View style={[s.badge, call.outcome === 'missed' ? s.missedBadge : call.outcome === 'answered' ? s.answeredBadge : null]}>
            <Text style={s.badgeText}>{OUTCOME_LABELS[call.outcome]}</Text>
          </View>
        </View>
        <Text style={s.caption}>{formatBonlineCallTime(call.startedAt || call.firstReceivedAt)} · London</Text>
        {task ? (
          <View style={s.taskStatus}>
            <Text style={s.body}>{task.status === 'resolved' ? 'Follow-up resolved' : task.status === 'claimed'
              ? mine ? 'Assigned to you' : 'Assigned to another admin' : 'Unassigned follow-up'}</Text>
            {overdue ? <Text style={s.overdue}>Overdue · 15m+</Text> : null}
          </View>
        ) : null}
        {task?.status === 'resolved' && task.resolution ? <Text style={s.caption}>{task.resolution}</Text> : null}
        {task && task.status !== 'resolved' ? (
          <View style={s.actions}>
            {task.status === 'pending' ? <AppButton label="Claim follow-up" disabled={Boolean(mutating)} loading={mutating === call.id} onPress={() => updateFollowUp(call, 'claim')} /> : null}
            {task.status === 'claimed' && mine ? <>
              <AppButton label="Resolve" disabled={Boolean(mutating)} loading={mutating === call.id} onPress={() => { setResolutionId(call.id); setResolution(''); }} />
              <AppButton label="Release" variant="ghost" disabled={Boolean(mutating)} onPress={() => updateFollowUp(call, 'release')} />
            </> : null}
          </View>
        ) : null}
        {resolutionId === call.id ? (
          <View style={s.resolvePanel}>
            <TextInput value={resolution} onChangeText={setResolution} placeholder="Outcome / notes (optional)" placeholderTextColor={colors.subtle}
              maxLength={500} multiline style={s.input} accessibilityLabel="Follow-up resolution notes" />
            <Text style={s.caption}>{resolution.length}/500</Text>
            <View style={s.actions}>
              <AppButton label="Mark resolved" disabled={Boolean(mutating)} onPress={() => updateFollowUp(call, 'resolve')} />
              <AppButton label="Cancel" variant="ghost" disabled={Boolean(mutating)} onPress={() => setResolutionId(null)} />
            </View>
          </View>
        ) : null}
        {call.phone ? <BonlineCallButton phone={call.phone} callId={call.callId} visible={visible && tab !== 'report'} capability={outbound.data}
          bookingId={linking ? attributionContext?.bookingId : undefined} /> : null}
        {linking ? <AppButton label={linkedIds.has(call.id) ? 'Linked to current record' : `Link current ${attributionContext?.bookingId ? 'booking' : 'quote'}`}
          variant="ghost" disabled={Boolean(mutating) || linkedIds.has(call.id)} onPress={() => linkCall(call)} /> : null}
      </View>
    );
  };

  const metrics = report.data?.metrics;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} onDismiss={onDismiss}>
      <AdminModalShell>
        <AdminModalHeader title="bOnline calls" subtitle="Follow-ups, bookings and business-line calls" onClose={onClose} />
        <View style={s.tabs} accessibilityRole="tablist">
          {TABS.map((item) => <Pressable key={item.key} onPress={() => changeTab(item.key)} style={[s.tab, tab === item.key && s.selectedTab]}
            accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }}>
            <Text style={[s.tabText, tab === item.key && s.selectedText]}>{item.label}</Text>
          </Pressable>)}
        </View>
        {tab === 'followups' ? <View style={s.filters}>
          {(['open', 'resolved'] as const).map((value) => <Pressable key={value} style={[s.filter, followUpFilter === value && s.selectedTab]}
            accessibilityRole="button" accessibilityState={{ selected: followUpFilter === value }} onPress={() => { setFollowUpFilter(value); setBefore(null); }}>
            <Text style={s.tabText}>{value === 'open' ? 'Needs follow-up' : 'Resolved'}</Text>
          </Pressable>)}
        </View> : tab === 'report' ? <View style={s.filters}>
          {[7, 30, 90].map((value) => <Pressable key={value} style={[s.filter, days === value && s.selectedTab]}
            accessibilityRole="button" accessibilityState={{ selected: days === value }} onPress={() => setDays(value)}><Text style={s.tabText}>{value} days</Text></Pressable>)}
        </View> : null}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={active.refreshing && !active.loading} onRefresh={() => void refreshVisibleData()} tintColor={colors.accent} />}>
          {active.error || mutationError ? <View style={s.errorCard}><Text style={s.error}>{mutationError || active.error}</Text>
            <AppButton label="Refresh" variant="ghost" onPress={() => void refreshVisibleData()} /></View> : null}
          {active.loading ? <View style={s.empty}><ActivityIndicator size="large" color={colors.accent} /><Text style={s.caption}>Loading calls…</Text></View> : null}
          {active.data?.enabled === false ? <View style={s.card}><Text style={s.cardTitle}>Call management is unavailable</Text><Text style={s.caption}>bOnline call management has not been enabled for this workspace.</Text></View> : null}
          {tab !== 'report' && calls.data?.enabled ? <>
            <Text style={s.caption}>{tab === 'followups' ? 'Only calls confirmed as unanswered create a follow-up. Open tasks become overdue after 15 minutes.' : 'Unknown outcomes remain unconfirmed; they are not counted as missed calls.'}</Text>
            {outbound.error ? <Text style={s.error}>Call availability could not be checked. Pull to refresh.</Text> : null}
            {calls.data.calls.length ? calls.data.calls.map(renderCall) : <View style={s.empty}><Text style={s.cardTitle}>{tab === 'followups' ? 'No follow-ups in this view' : 'No recorded calls yet'}</Text><Text style={s.caption}>New call events appear here automatically.</Text></View>}
            <View style={s.actions}>
              {before ? <AppButton label="Newest calls" variant="secondary" onPress={() => setBefore(null)} /> : null}
              {calls.data.nextCursor ? <AppButton label="Older calls" variant="secondary" onPress={() => setBefore(calls.data?.nextCursor ?? null)} /> : null}
            </View>
          </> : null}
          {tab === 'report' && report.data?.enabled && metrics ? <>
            <Text style={s.caption}>Calls first received in the last {report.data.period.days} days. Totals include their linked records.</Text>
            <View style={s.metricGrid}>
              <Metric label="Incoming calls" value={metrics.totalCalls} />
              <Metric label="Answered" value={metrics.answeredCalls} />
              <Metric label="Missed" value={metrics.missedCalls} />
              <Metric label="Unconfirmed / ongoing" value={metrics.unknownCalls} />
              <Metric label="Open follow-ups" value={metrics.openFollowUps} />
              <Metric label="Overdue follow-ups" value={metrics.overdueFollowUps} warning={metrics.overdueFollowUps > 0} />
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Calls that became business</Text>
              <ReportLine label="Unique quotes linked" value={String(metrics.linkedQuotes)} />
              <ReportLine label="Unique bookings linked" value={String(metrics.linkedBookings)} />
              <ReportLine label="Calls linked to a quote" value={formatBonlineRate(metrics.quoteConversionRate)} />
              <ReportLine label="Calls linked to a booking" value={formatBonlineRate(metrics.bookingConversionRate)} />
              <Text style={s.caption}>Conversion rates use all incoming calls in this period. Several calls can link to the same booking.</Text>
            </View>
            <View style={[s.card, s.revenueCard]}>
              <Text style={s.caption}>Received revenue from linked bookings</Text>
              <Text style={s.revenue}>{formatBonlineMoneyPence(metrics.paidRevenuePence)}</Text>
              <Text style={s.body}>{metrics.paidBookings} bookings with payments received</Text>
              <Text style={s.caption}>GBP payments received, including deposits, less recorded refunds. Quote values and unpaid balances are excluded.</Text>
            </View>
          </> : null}
        </ScrollView>
      </AdminModalShell>
    </Modal>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <View style={s.metric}><Text style={[s.metricValue, warning && s.overdue]}>{value}</Text><Text style={s.caption}>{label}</Text></View>;
}
function ReportLine({ label, value }: { label: string; value: string }) {
  return <View style={s.reportLine}><Text style={s.body}>{label}</Text><Text style={s.reportValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: space.lg, gap: space.xs, marginBottom: space.sm },
  tab: { flex: 1, paddingVertical: space.md, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border },
  selectedTab: { backgroundColor: colors.accentSoft, borderColor: colors.glowBorder },
  tabText: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '700' },
  selectedText: { color: colors.accent },
  filters: { flexDirection: 'row', gap: space.sm, marginHorizontal: space.lg, marginBottom: space.sm },
  filter: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderColor: colors.border, borderWidth: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  overdueCard: { borderColor: colors.warningBorder },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  phone: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  badge: { backgroundColor: colors.infoBg, borderRadius: radius.pill, paddingVertical: space.xxs, paddingHorizontal: space.sm },
  missedBadge: { backgroundColor: colors.dangerBg },
  answeredBadge: { backgroundColor: colors.successBg },
  badgeText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  caption: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 18 },
  body: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 20, flexShrink: 1 },
  cardTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
  taskStatus: { gap: space.xxs },
  overdue: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  resolvePanel: { backgroundColor: colors.panelSoft, padding: space.md, borderRadius: radius.sm, gap: space.sm },
  input: { minHeight: 76, color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: space.md, textAlignVertical: 'top', fontSize: fontSize.sm },
  errorCard: { backgroundColor: colors.dangerBg, borderRadius: radius.sm, padding: space.md, gap: space.sm },
  error: { color: colors.danger, fontSize: fontSize.sm, lineHeight: 20 },
  empty: { alignItems: 'center', paddingVertical: space.xxl, gap: space.md },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.card, padding: space.lg, borderRadius: radius.md, gap: space.xs, borderColor: colors.border, borderWidth: 1 },
  metricValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '900' },
  reportLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  reportValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  revenueCard: { backgroundColor: colors.accentMuted, borderColor: colors.glowBorder },
  revenue: { color: colors.accent, fontSize: fontSize.heroSmall, fontWeight: '900' },
});
