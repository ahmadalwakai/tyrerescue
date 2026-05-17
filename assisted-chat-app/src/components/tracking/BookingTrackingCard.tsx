import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AppButton, StatusBanner } from '@/components/ui';
import { colors, fontSize, radius, space } from '@/components/theme';
import { copyToClipboard } from '@/lib/clipboard';
import { buildWhatsAppUrl } from '@/lib/customer-message';
import { LiveTrackingMapMobile } from './LiveTrackingMapMobile';
import type {
  BookingTrackingData,
  TrackingDerivedStatus,
} from '@/hooks/useBookingTracking';

interface Props {
  data: BookingTrackingData | null;
  ensureFailed: boolean;
  busy: boolean;
  /** Phone number from the draft. Used to gate SMS/WhatsApp share buttons. */
  customerPhone: string | null;
  /** Optional driver phone (rare in assisted-chat flow; usually null). */
  driverPhone?: string | null;
  /** Called when operator taps "Retry" after a failed ensure. */
  onRetryEnsure: () => void;
  /** Called when operator taps "Refresh now" to force a poll. */
  onRefresh?: () => void;
}

const TONE: Record<TrackingDerivedStatus, 'ok' | 'err' | 'info' | 'warn'> = {
  pending: 'info',
  in_progress: 'ok',
  paused: 'warn',
  completed: 'ok',
  expired: 'err',
};

const TITLE: Record<TrackingDerivedStatus, string> = {
  pending: 'Waiting for driver to start',
  in_progress: 'Driver is on the way',
  paused: 'Tracking paused',
  completed: 'Tracking completed',
  expired: 'Tracking link expired',
};

const SUB: Record<TrackingDerivedStatus, string | null> = {
  pending: 'Share the driver link below so they can open the tracking page.',
  in_progress: null,
  paused: 'Driver location has not updated recently. They may be out of signal.',
  completed: null,
  expired: 'Generate a new tracking session if needed.',
};

const STALE_AFTER_MS = 90_000;

function isStale(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > STALE_AFTER_MS;
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1_000)} seconds ago`;
  if (diff < 3_600_000) {
    const m = Math.round(diff / 60_000);
    return m === 1 ? '1 minute ago' : `${m} minutes ago`;
  }
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDistanceMiles(miles: number | null): string {
  if (miles == null || !Number.isFinite(miles) || miles < 0) return '—';
  if (miles < 0.1) return '<0.1 mi';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function haversineMiles(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): number | null {
  if (!a || !b) return null;
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))) / 1609.344;
}

/**
 * Operator-facing live tracking card shown after dispatch. Surfaces the
 * status banner, distance/last-update metrics, an embedded live map
 * (toggleable), and Copy/SMS/WhatsApp share controls for both tracking
 * links. Raw coordinates are tucked behind a "Technical details" toggle
 * so the default view stays clean.
 */
export function BookingTrackingCard({
  data,
  ensureFailed,
  busy,
  customerPhone,
  driverPhone,
  onRetryEnsure,
  onRefresh,
}: Props) {
  const [mapVisible, setMapVisible] = useState(true);
  const [techVisible, setTechVisible] = useState(false);

  type BtnState = 'idle' | 'loading' | 'success' | 'error';
  const [customerCopyState, setCustomerCopyState] = useState<BtnState>('idle');
  const [customerSendState, setCustomerSendState] = useState<BtnState>('idle');
  const [driverCopyState, setDriverCopyState] = useState<BtnState>('idle');
  const [driverSendState, setDriverSendState] = useState<BtnState>('idle');

  const resetAfter = useCallback((set: (s: BtnState) => void) => {
    setTimeout(() => set('idle'), 2_000);
  }, []);

  const withBtnState = useCallback(
    (set: (s: BtnState) => void, action: () => Promise<void>) => {
      set('loading');
      action().then(
        () => { set('success'); resetAfter(set); },
        () => { set('error');   resetAfter(set); },
      );
    },
    [resetAfter],
  );

  const customerHasPhone = useMemo(
    () => !!(customerPhone && customerPhone.trim().length > 0),
    [customerPhone],
  );
  const driverHasPhone = useMemo(
    () => !!(driverPhone && driverPhone.trim().length > 0),
    [driverPhone],
  );

  // If the driver's GPS ping is older than 90s, surface a "Tracking
  // paused" status so the operator gets a clear signal that the live
  // location is stale (matches the customer & driver pages).
  const derivedStatus: TrackingDerivedStatus | null = useMemo(() => {
    if (!data) return null;
    const raw = data.state.status;
    if (raw === 'in_progress' && isStale(data.state.lastUpdatedAt)) return 'paused';
    return raw;
  }, [data]);

  const driverPoint = useMemo(
    () =>
      data?.state.driverLat != null && data?.state.driverLng != null
        ? { lat: data.state.driverLat, lng: data.state.driverLng }
        : null,
    [data],
  );
  const customerPoint = useMemo(
    () =>
      data?.customerLat != null && data?.customerLng != null
        ? { lat: data.customerLat, lng: data.customerLng }
        : null,
    [data],
  );
  const distanceMiles = useMemo(
    () => haversineMiles(driverPoint, customerPoint),
    [driverPoint, customerPoint],
  );

  // ── Failure to create tracking links — show retry, never block dispatch.
  if (ensureFailed && !data) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>BOOKING TRACKING</Text>
        <StatusBanner kind="err" message="Tracking links could not be created." />
        <AppButton
          label="Retry"
          variant="primary"
          onPress={onRetryEnsure}
          loading={busy}
          fullWidth
          style={{ marginTop: space.sm }}
        />
      </View>
    );
  }

  // ── First load — being created.
  if (!data || !derivedStatus) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>BOOKING TRACKING</Text>
        <Text style={styles.muted}>Creating tracking links…</Text>
      </View>
    );
  }

  const { state, customerUrl, driverUrl, refNumber, customerAddress } = data;
  const tone = TONE[derivedStatus];
  // Promote "Driver is nearby" copy when the trip is live and the driver
  // is within 0.5 mi of the customer — same threshold used by the public
  // customer tracking page so operators see the same beat.
  const title =
    derivedStatus === 'in_progress' && distanceMiles != null && distanceMiles < 0.5
      ? 'Driver is nearby'
      : TITLE[derivedStatus];
  const sub = SUB[derivedStatus];
  const showLiveMetrics =
    derivedStatus === 'in_progress' || derivedStatus === 'paused';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BOOKING TRACKING</Text>
        {refNumber ? <Text style={styles.refNumber}>{refNumber}</Text> : null}
      </View>

      <StatusBanner kind={tone} message={title} />
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}

      {showLiveMetrics ? (
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>DISTANCE</Text>
            <Text style={styles.metricValue}>{formatDistanceMiles(distanceMiles)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>LAST UPDATE</Text>
            <Text style={styles.metricValue}>{formatLastUpdated(state.lastUpdatedAt) || '—'}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Live map ─────────────────────────────────────── */}
      {derivedStatus !== 'expired' ? (
        <View style={styles.mapBlock}>
          <View style={styles.mapHeader}>
            <Text style={styles.mapLabel}>Live map</Text>
            <View style={styles.mapHeaderActions}>
              <AppButton
                label={mapVisible ? 'Hide map' : 'Show live map'}
                variant="secondary"
                onPress={() => setMapVisible((v) => !v)}
              />
              {onRefresh ? (
                <AppButton label="Refresh now" variant="ghost" onPress={onRefresh} />
              ) : null}
            </View>
          </View>
          {mapVisible ? (
            <View style={{ marginTop: space.sm }}>
              <LiveTrackingMapMobile driver={driverPoint} customer={customerPoint} />
            </View>
          ) : null}
        </View>
      ) : null}

      {customerAddress ? (
        <View style={styles.addressBlock}>
          <Text style={styles.linkLabel}>Destination</Text>
          <Text style={styles.addressText}>{customerAddress}</Text>
        </View>
      ) : null}

      {/* ── Customer tracking link ───────────────────────── */}
      <View style={styles.linkBlock}>
        <Text style={styles.linkLabel}>Customer tracking link</Text>
        <View style={styles.linkActions}>
          <AppButton
            label={
              customerCopyState === 'success' ? 'Copied ✓'
              : customerCopyState === 'error'   ? 'Could not copy. Try again.'
              : 'Copy'
            }
            loading={customerCopyState === 'loading'}
            variant="secondary"
            disabled={customerCopyState === 'loading'}
            onPress={() =>
              withBtnState(setCustomerCopyState, async () => {
                const ok = await copyToClipboard(customerUrl);
                if (!ok) throw new Error('copy failed');
              })
            }
          />
          <AppButton
            label={
              customerSendState === 'loading' ? 'Sending...'
              : customerSendState === 'success' ? 'Sent ✓'
              : customerSendState === 'error'   ? 'Could not send. Try again.'
              : 'Send to customer'
            }
            loading={customerSendState === 'loading'}
            variant="secondary"
            disabled={!customerHasPhone || customerSendState === 'loading'}
            onPress={() =>
              withBtnState(setCustomerSendState, async () => {
                if (!customerPhone) throw new Error('no phone');
                const msg = `Your Tyre Rescue booking is confirmed.\nYou can track your driver here:\n${customerUrl}`;
                const waUrl = buildWhatsAppUrl(customerPhone, msg);
                if (!waUrl) throw new Error('no wa url');
                await Linking.openURL(waUrl);
              })
            }
          />
        </View>
        {!customerHasPhone ? (
          <Text style={styles.hint}>Add a customer phone to enable sending.</Text>
        ) : null}
      </View>

      {/* ── Driver tracking link ─────────────────────────── */}
      <View style={styles.linkBlock}>
        <Text style={styles.linkLabel}>Driver tracking link</Text>
        <View style={styles.linkActions}>
          <AppButton
            label={
              driverCopyState === 'success' ? 'Copied ✓'
              : driverCopyState === 'error'   ? 'Could not copy. Try again.'
              : 'Copy'
            }
            loading={driverCopyState === 'loading'}
            variant="secondary"
            disabled={driverCopyState === 'loading'}
            onPress={() =>
              withBtnState(setDriverCopyState, async () => {
                const ok = await copyToClipboard(driverUrl);
                if (!ok) throw new Error('copy failed');
              })
            }
          />
          <AppButton
            label={
              driverSendState === 'loading' ? 'Sending...'
              : driverSendState === 'success' ? 'Sent ✓'
              : driverSendState === 'error'   ? 'Could not send. Try again.'
              : 'Send to driver'
            }
            loading={driverSendState === 'loading'}
            variant="secondary"
            disabled={!driverHasPhone || driverSendState === 'loading'}
            onPress={() =>
              withBtnState(setDriverSendState, async () => {
                if (!driverPhone) throw new Error('no phone');
                const msg = `New Tyre Rescue job.\nOpen this page, press Start journey, and keep it open until the job is finished:\n${driverUrl}`;
                const waUrl = buildWhatsAppUrl(driverPhone, msg);
                if (!waUrl) throw new Error('no wa url');
                await Linking.openURL(waUrl);
              })
            }
          />
        </View>
        {!driverHasPhone ? (
          <Text style={styles.hint}>Driver phone not on file — share the link manually.</Text>
        ) : null}
      </View>

      {derivedStatus !== 'completed' && derivedStatus !== 'expired' ? (
        <AppButton
          label="Open customer live view"
          variant="ghost"
          onPress={() => Linking.openURL(customerUrl).catch(() => undefined)}
          fullWidth
          style={{ marginTop: space.sm }}
        />
      ) : null}

      {/* ── Technical details ────────────────────────────── */}
      <View style={styles.techBlock}>
        <AppButton
          label={techVisible ? 'Hide technical details' : 'Show technical details'}
          variant="ghost"
          onPress={() => setTechVisible((v) => !v)}
        />
        {techVisible ? (
          <View style={{ marginTop: space.xs, gap: space.xs / 2 }}>
            {state.driverLat != null && state.driverLng != null ? (
              <Text style={styles.techLine}>
                Driver: {state.driverLat.toFixed(5)}, {state.driverLng.toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.techLine}>Driver: no fix yet</Text>
            )}
            {customerPoint ? (
              <Text style={styles.techLine}>
                Customer: {customerPoint.lat.toFixed(5)}, {customerPoint.lng.toFixed(5)}
              </Text>
            ) : null}
            {state.accuracyMeters != null ? (
              <Text style={styles.techLine}>Accuracy: ±{Math.round(state.accuracyMeters)} m</Text>
            ) : null}
            {state.speedMetersPerSecond != null ? (
              <Text style={styles.techLine}>
                Speed: {(state.speedMetersPerSecond * 2.237).toFixed(1)} mph
              </Text>
            ) : null}
            <Text style={styles.techLine}>Booking id: {data.bookingId}</Text>
          </View>
        ) : null}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  refNumber: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sub: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.sm,
  },
  metricLabel: {
    color: colors.subtle,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: 2,
  },
  mapBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  mapLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  mapHeaderActions: {
    flexDirection: 'row',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  addressBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    gap: space.xs / 2,
  },
  addressText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  linkBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
    gap: space.xs,
  },
  linkLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  linkUrl: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  linkActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  hint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
  muted: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  techBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  techLine: {
    color: colors.subtle,
    fontSize: fontSize.xs,
  },
  notice: {
    color: colors.success,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
});
