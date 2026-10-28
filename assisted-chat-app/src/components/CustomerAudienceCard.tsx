import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCustomerAudience } from '@/hooks/useCustomerAudience';
import { AppButton } from './ui';
import { colors, fontSize, radius, space } from './theme';

interface Props {
  enabled: boolean;
  projectId?: string | null;
}

function checkedAt(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

function reportDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
}

function Detail({ label, value }: { label: string; value: number }) {
  return <View style={styles.detail}><Text style={styles.hint}>{label}</Text><Text style={styles.detailValue}>{value.toLocaleString('en-GB')}</Text></View>;
}

export function CustomerAudienceCard({ enabled, projectId }: Props) {
  const audience = useCustomerAudience(enabled, projectId);
  const [expanded, setExpanded] = useState(false);
  if (!enabled) return null;
  const customer = audience.customers;
  const download = audience.downloads;
  const apple = download.data;
  const stats = customer.data?.stats;
  const count = stats ? stats.customers.toLocaleString('en-GB') : customer.loading ? '…' : '—';
  const downloadCount = apple?.status === 'ready' && apple.firstTimeDownloads !== null ? apple.firstTimeDownloads.toLocaleString('en-GB') : download.loading ? '…' : '—';
  const downloadStale = Boolean(download.error || apple?.stale);
  const loading = customer.loading || (download.visible && download.loading);

  return (
    <View style={styles.card} testID="customer-audience-card">
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.label}>Registered customers</Text>
          <Text style={styles.value} testID="registered-customers-count" accessibilityLabel={stats ? `${stats.customers} registered customer accounts` : customer.loading ? 'Loading registered customers' : 'Registered customer count unavailable'}>{count}</Text>
          <Text style={styles.hint}>Customer accounts only</Text>
          {customer.data ? <Text style={styles.time}>{customer.error ? 'Last available' : 'Checked'} {checkedAt(customer.data.checkedAt)} UK</Text> : null}
          {customer.error ? <Text style={styles.error} accessibilityRole="alert">{customer.error}</Text> : null}
        </View>
        {download.visible ? <View style={[styles.metric, styles.downloadMetric]}>
          <Text style={styles.label}>First-time App Store downloads</Text>
          <Text style={styles.value} testID="app-store-downloads-count" accessibilityLabel={apple?.status === 'ready' ? `${apple.firstTimeDownloads} first-time App Store downloads` : apple?.status === 'pending' ? 'Preparing Apple reports' : 'App Store download count unavailable'}>{downloadCount}</Text>
          {apple?.status === 'ready' ? <>
            <Text style={styles.hint} testID="app-store-downloads-period">{apple.coverage === 'all_time' ? 'All time' : `Reported days: ${reportDate(apple.periodStart!)} – ${reportDate(apple.periodEnd!)}`}</Text>
            {apple.lastReportDate ? <Text style={styles.time}>{downloadStale ? 'Last available report processed' : 'Report processed'} {reportDate(apple.lastReportDate)}</Text> : null}
          </> : <Text style={styles.hint}>{apple?.status === 'pending' ? 'Preparing Apple reports' : apple?.status === 'not_configured' ? 'App Store reporting not connected' : download.loading ? 'Checking Apple reports…' : 'Report unavailable'}</Text>}
          {apple ? <Text style={styles.time}>Checked {checkedAt(apple.checkedAt)} UK</Text> : null}
          {download.error ? <Text style={styles.error} accessibilityRole="alert">{download.error}</Text> : apple?.message ? <Text style={downloadStale || apple.status !== 'ready' ? styles.error : styles.hint}>{apple.message}</Text> : null}
          {!downloadStale && apple?.status === 'ready' ? <Text style={styles.time}>Apple reports are delayed, not live.</Text> : null}
        </View> : null}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? 'Hide customer details' : 'Show customer details'} onPress={() => setExpanded((value) => !value)} style={styles.detailsButton} testID="customer-audience-details">
          <Text style={styles.detailsLabel}>{expanded ? 'Hide details' : 'Details'} {expanded ? '⌃' : '⌄'}</Text>
        </Pressable>
        <AppButton label={loading ? 'Refreshing…' : 'Refresh'} variant="ghost" disabled={loading} onPress={() => { void audience.refresh(); }} testID="customer-audience-refresh" />
      </View>
      {expanded ? (
        <View style={styles.expanded}>
          {stats ? <>
            <Detail label="Verified email" value={stats.verifiedCustomers} />
            <Detail label="Email not verified" value={stats.unverifiedCustomers} />
            <Detail label="Registered today" value={stats.customersToday} />
            <Detail label="Registered in last 7 days" value={stats.customersLast7Days} />
            <Detail label="Registered in last 30 days" value={stats.customersLast30Days} />
          </> : null}
          <Text style={styles.hint}>Counts update every minute while this screen is active. Customer totals exclude staff and anonymous visitors.</Text>
          {download.visible ? <Text style={styles.hint}>Tyre Rescue on the App Store. Apple counts first-time downloads by Apple ID, not unique people. Updates and redownloads are excluded. Downloading the app does not mean the customer registered.</Text> : null}
          {download.visible && apple?.status === 'pending' ? <Text style={styles.hint}>Apple normally needs 24–48 hours to prepare the first report. The count will appear automatically when a report is available.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.cardMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: space.md, marginBottom: space.sm },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metric: { flex: 1, minWidth: 125, gap: 4 },
  downloadMetric: { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: space.md },
  label: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '600', lineHeight: 17 },
  value: { color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hint: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 17 },
  time: { color: colors.subtle, fontSize: 10, lineHeight: 15 },
  error: { color: colors.warning, fontSize: fontSize.xs, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailsButton: { minHeight: 44, justifyContent: 'center', paddingRight: space.md },
  detailsLabel: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '600' },
  expanded: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, paddingBottom: space.md, gap: space.xs },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  detailValue: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
