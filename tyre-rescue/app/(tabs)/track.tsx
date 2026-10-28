import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { API, requestJson } from '@/src/api';
import { PHONE_DISPLAY, PHONE_TEL } from '@/src/config';
import { useCustomerAccount } from '@/src/customer-account';
import { loadBookingAccess, saveBookingAccess } from '@/src/customer-booking-access';
import { notifyCustomerDriverNearbyAsync } from '@/src/customer-notifications';
import { fallbackRouteCoordinates, routeLiveMapMarkers, type MapCoordinate } from '@/src/mapbox';
import { PulsingMap } from '@/src/pulsing-map';
import { createTrackingRequestScope, isTrackingLocationFresh, isTrackingStatusActive, trackingFinishedSummary } from '@/src/tracking-state';
import { trackingClock, trackingJourneySteps, trackingPresentation } from '@/src/tracking-presentation';
import { useBookingParamAccess } from '@/src/use-booking-param-access';
import { colors, spacing, typography } from '@/src/theme';
import { AppHeader, Card, InlineNotice, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from '@/src/ui';

interface TrackingResponse {
  bookingId: string;
  canChat?: boolean;
  status: string;
  bookingType: string;
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  driverName: string | null;
  etaMinutes: number | null;
  estimatedArrivalAt?: string | null;
  distanceMiles: number | null;
  routeCoordinates: MapCoordinate[] | null;
  addressLine: string;
  scheduledAt: string | null;
  completedAt?: string | null;
  statusHistory?: { status: string; timestamp: string }[];
}
type LoadedTracking = { ref: string; data: TrackingResponse; receivedAt: number };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const humanStatus = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export default function TrackScreen() {
  const params = useLocalSearchParams<{ ref?: string; accessToken?: string; trackingToken?: string }>();
  const { token, loading: accountLoading, sessionRevision } = useCustomerAccount();
  const parameterAccess = useBookingParamAccess(first(params.accessToken) ?? '', sessionRevision);
  const parameterTracking = useBookingParamAccess(first(params.trackingToken) ?? '', sessionRevision);
  const legacyTrackingToken = parameterTracking.value;
  const legacyTrackingRef = first(params.ref)?.trim().toUpperCase();
  useEffect(() => {
    if (parameterAccess.invalidated || parameterTracking.invalidated) router.setParams({
      ...(parameterAccess.invalidated ? { accessToken: undefined } : {}),
      ...(parameterTracking.invalidated ? { trackingToken: undefined } : {}),
    });
  }, [parameterAccess.invalidated, parameterTracking.invalidated]);
  const safeContentInsets = useScreenContentInsets();
  const [reference, setReference] = useState('');
  const [loaded, setLoaded] = useState<LoadedTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [lookupExpanded, setLookupExpanded] = useState(false);
  const requestScope = useRef(createTrackingRequestScope());
  const accountScope = useRef(0);
  const activeReference = useRef<string | null>(null);
  const nearbyNotified = useRef(new Set<string>());
  const tracking = loaded?.data ?? null;
  const trackingActive = tracking ? isTrackingStatusActive(tracking.status) : false;
  const finishedSummary = tracking ? trackingFinishedSummary(tracking.status) : null;
  const presentation = tracking && loaded ? trackingPresentation(tracking, { now, receivedAt: loaded.receivedAt, refreshFailed }) : null;
  const journeySteps = tracking ? trackingJourneySteps(tracking.status, tracking.statusHistory) : [];
  const mapTracking = tracking ? { ...tracking, driverLat: presentation?.showDriver ? tracking.driverLat : null, driverLng: presentation?.showDriver ? tracking.driverLng : null } : null;

  const load = useCallback(async (requestedRef: string, silent = false, suppliedAccess?: string) => {
    const ref = requestedRef.trim().toUpperCase();
    if (!ref || accountLoading) return;
    if (silent && activeReference.current !== ref) return;
    if (!silent) activeReference.current = ref;
    const scope = requestScope.current;
    const revision = scope.begin();
    if (!silent) { setLoading(true); setLoaded(null); setError(null); setDetailsExpanded(false); setLookupExpanded(false); }
    try {
      const access = suppliedAccess ?? await loadBookingAccess(ref);
      if (!scope.current(revision)) return;
      const data = await requestJson<TrackingResponse>(`${API.tracking}/${encodeURIComponent(ref)}`, { headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(access ? { 'X-Booking-Access': access } : {}),
        ...(legacyTrackingToken && ref === legacyTrackingRef ? { 'X-Tracking-Token': legacyTrackingToken } : {}),
      } });
      if (!scope.current(revision)) return;
      setLoaded({ ref, data, receivedAt: Date.now() });
      setRefreshFailed(false);
      setError(null);
      if (suppliedAccess) await saveBookingAccess(ref, suppliedAccess);
      if (!scope.current(revision)) return;
      const fresh = isTrackingLocationFresh(data.driverLocationAt);
      const nearby = (data.distanceMiles !== null && data.distanceMiles <= 0.35) || (data.etaMinutes !== null && data.etaMinutes <= 5);
      if (fresh && nearby && isTrackingStatusActive(data.status) && !nearbyNotified.current.has(ref)) {
        nearbyNotified.current.add(ref);
        void notifyCustomerDriverNearbyAsync({ refNumber: ref, driverName: data.driverName, etaMinutes: data.etaMinutes, distanceMiles: data.distanceMiles });
      }
    } catch (err) {
      if (!scope.current(revision)) return;
      if (silent) setRefreshFailed(true);
      else setError(err instanceof Error ? err.message : 'Unable to load tracking. Please try again.');
    } finally {
      if (scope.current(revision)) setLoading(false);
    }
  }, [accountLoading, legacyTrackingRef, legacyTrackingToken, token]);

  useEffect(() => {
    const scope = requestScope.current;
    scope.invalidate();
    accountScope.current += 1;
    activeReference.current = null;
    setLoaded(null);
    setShareMessage(null);
    setDetailsExpanded(false);
    setLookupExpanded(false);
    const ref = first(params.ref)?.trim().toUpperCase();
    const access = parameterAccess.value;
    if (ref && !accountLoading) {
      setReference(ref);
      void load(ref, false, access);
    }
    return () => scope.invalidate();
  }, [accountLoading, load, parameterAccess.value, params.ref, sessionRevision, token]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const loadedRef = loaded?.ref;
  const loadedStatus = tracking?.status;
  async function manageShare(revoke = false) {
    if (!loaded) return;
    const revision = accountScope.current;
    setShareBusy(true);
    setShareMessage(null);
    try {
      const access = await loadBookingAccess(loaded.ref);
      const response = await requestJson<{ url?: string }>(`${API.tracking}/${encodeURIComponent(loaded.ref)}/share`, { method: revoke ? 'DELETE' : 'POST', headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(access ? { 'X-Booking-Access': access } : {}),
      } });
      if (revision !== accountScope.current) return;
      if (revoke) setShareMessage('Shared tracking links have been revoked.');
      else if (response.url) await Share.share({ message: `Follow my Tyre Rescue journey. This private link expires in 24 hours: ${response.url}`, url: response.url });
    } catch (err) { setShareMessage(err instanceof Error ? err.message : 'Unable to share tracking. Please try again.'); }
    finally { setShareBusy(false); }
  }
  useEffect(() => {
    if (!loadedRef || !loadedStatus || !isTrackingStatusActive(loadedStatus)) return;
    const refresh = () => { void load(loadedRef, true); };
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [load, loadedRef, loadedStatus]);

  return (
    <ScrollView contentContainerStyle={[styles.content, safeContentInsets]} keyboardShouldPersistTaps="handled">
      <AppHeader />
      <ScreenHeader title={loaded ? 'Your rescue' : 'Track your rescue'} detail={!loaded ? 'Open your secure confirmation link or enter your booking reference.' : undefined} />
      {loaded ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: lookupExpanded }} onPress={() => setLookupExpanded(value => !value)} style={styles.changeBooking}>
        <Text style={styles.changeBookingText}>Track another booking</Text><Feather name={lookupExpanded ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={16} />
      </Pressable> : null}
      {!loaded || lookupExpanded ? <Card style={styles.lookupCard}>
        <TextField label="Booking reference" value={reference} onChangeText={(value) => setReference(value.toUpperCase())} placeholder="TR-123456" autoCapitalize="characters" />
        <PrimaryButton icon="search" variant={loaded ? 'secondary' : 'primary'} loading={loading} disabled={!reference.trim()} onPress={() => load(reference)}>Track</PrimaryButton>
      </Card> : null}
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {!token && error ? <PrimaryButton icon="log-in" variant="secondary" onPress={() => router.push('/account')}>Sign in to your account</PrimaryButton> : null}
      {tracking && loaded && mapTracking && presentation ? <View style={styles.gap}>
        {refreshFailed ? <InlineNotice>{trackingActive ? 'Connection interrupted. Showing the last received update; retrying automatically.' : 'Unable to refresh this booking. Showing the last received update; tap Refresh tracking to retry.'}</InlineNotice> : null}
        {finishedSummary ? <Card style={styles.finishedCard}>
          <View style={styles.finishedIcon}><Feather name={tracking.status === 'completed' ? 'check-circle' : 'info'} size={26} color={tracking.status === 'completed' ? colors.success : colors.accent} /></View>
          <Text style={styles.summaryTitle} accessibilityRole="header">{finishedSummary.title}</Text>
          <Text style={styles.summaryDetail}>{finishedSummary.detail}</Text>
          {tracking.status === 'completed' && tracking.completedAt ? <Row label="Completed" value={new Date(tracking.completedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })} /> : null}
        </Card> : <View style={styles.arrivalCard} accessibilityLiveRegion="polite">
          <View style={styles.arrivalTop}><Text style={styles.eyebrow}>{presentation.label}</Text><Text style={styles.bookingRef}>{loaded.ref}</Text></View>
          <Text style={styles.arrivalTitle} accessibilityRole="header">{presentation.title}</Text>
          {presentation.etaMinutes !== null ? <>
            <View style={styles.etaRow} accessible accessibilityLabel={`Estimated arrival in ${presentation.etaMinutes} minutes`}>
              <Text testID="tracking-eta-value" style={styles.etaValue}>{presentation.etaMinutes}</Text><Text style={styles.etaUnit}>min</Text>
            </View>
            <Text testID="tracking-arrival-time" style={styles.arrivalTime}>Arriving around {presentation.arrivalTime}</Text>
          </> : null}
          <Text style={styles.arrivalDetail}>{presentation.detail}</Text>
          {tracking.driverName ? <View style={styles.driverBadge}><Feather name="user" color={colors.accent} size={16} /><Text style={styles.driverName}>{tracking.driverName} · Your fitter</Text></View> : null}
        </View>}
        {journeySteps.length ? <View style={styles.journeyCard} accessibilityLabel="Booking progress">
          {journeySteps.map((step, index) => <View key={step.label} style={styles.journeyStep} accessible accessibilityLabel={`${step.label}, ${step.state}${step.time ? `, ${step.time}` : ''}`}>
            <View style={styles.stepTop}>
              <View style={[styles.stepLine, index === 0 ? styles.invisible : null, step.state !== 'upcoming' ? styles.stepLineDone : null]} />
              <View style={[styles.stepDot, step.state === 'current' ? styles.stepDotCurrent : step.state === 'complete' ? styles.stepDotComplete : null]}>
                {step.state === 'complete' ? <Feather name="check" color={colors.bg} size={12} /> : <View style={[styles.stepInner, step.state === 'current' ? styles.stepInnerCurrent : null]} />}
              </View>
              <View style={[styles.stepLine, index === journeySteps.length - 1 ? styles.invisible : null, step.state === 'complete' ? styles.stepLineDone : null]} />
            </View>
            <Text style={[styles.stepLabel, step.state === 'current' ? styles.stepLabelCurrent : null]}>{step.label}</Text>
            <Text style={styles.stepTime}>{step.time ?? (step.state === 'current' ? 'Now' : ' ')}</Text>
          </View>)}
        </View> : null}
        {trackingActive ? <View style={styles.mapCard}>
          <View style={styles.mapHeading}><Text style={styles.sectionLabel}>{presentation.showDriver ? 'YOUR RESCUE ROUTE' : 'YOUR SERVICE LOCATION'}</Text><View style={styles.mapStatus}><View style={[styles.statusDot, { backgroundColor: presentation.showDriver ? colors.success : colors.muted }]} /><Text style={styles.mapStatusText}>{presentation.showDriver ? 'Live' : 'Saved location'}</Text></View></View>
          <PulsingMap markers={routeLiveMapMarkers(mapTracking)} routeCoordinates={presentation.showDriver ? tracking.routeCoordinates ?? fallbackRouteCoordinates(mapTracking) : []} style={styles.map} />
          <View style={styles.mapFooter}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.success }]} /><Text style={styles.legendText}>You</Text></View>{presentation.showDriver ? <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.accent }]} /><Text style={styles.legendText}>Your fitter</Text></View> : null}<Text style={styles.updatedAt}>Updated {trackingClock(loaded.receivedAt)}</Text></View>
        </View> : null}
        <View style={styles.contactRow}>
          {tracking.canChat !== false ? <PrimaryButton icon="message-circle" style={styles.contactButton} onPress={() => router.push({ pathname: '/chat', params: { bookingId: tracking.bookingId, ref: loaded.ref } })}>Chat with us</PrimaryButton> : null}
          <PrimaryButton icon="phone" variant={tracking.canChat === false ? 'primary' : 'secondary'} style={styles.contactButton} onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>Call us</PrimaryButton>
        </View>
        <Text style={styles.supportNumber}>{PHONE_DISPLAY} · Here when you need us</Text>
        <View style={styles.detailsCard}>
          <Pressable testID="booking-details-toggle" accessibilityRole="button" accessibilityLabel="Booking details" accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded(value => !value)} style={styles.detailsToggle}>
            <View style={styles.detailsTitleRow}><View style={styles.detailsIcon}><Feather name="file-text" color={colors.muted} size={19} /></View><View style={styles.detailsText}><Text style={styles.detailsTitle}>Booking details</Text><Text style={styles.detailsHint}>Service, address & updates</Text></View></View>
            <Feather name={detailsExpanded ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={20} />
          </Pressable>
          {detailsExpanded ? <View style={styles.detailsBody}>
            <Row label="Reference" value={loaded.ref} />
            <Row label="Status" value={humanStatus(tracking.status)} />
            <Row label="Type" value={humanStatus(tracking.bookingType)} />
            <Row label="Address" value={tracking.addressLine} />
            {tracking.scheduledAt ? <Row label="Scheduled" value={new Date(tracking.scheduledAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })} /> : null}
            {tracking.driverName ? <Row label="Driver" value={tracking.driverName} /> : null}
            {presentation.showDriver && tracking.distanceMiles !== null ? <Row label="Distance" value={`${tracking.distanceMiles} mi`} /> : null}
            <Row label="Last received" value={trackingClock(loaded.receivedAt) ?? 'Unavailable'} />
            {presentation.showDriver && tracking.driverLocationAt ? <Row label="Driver location updated" value={trackingClock(tracking.driverLocationAt) ?? 'Unavailable'} /> : null}
          </View> : null}
        </View>
        <PrimaryButton icon="refresh-cw" variant="secondary" onPress={() => load(loaded.ref, true)}>Refresh tracking</PrimaryButton>
        {tracking.canChat !== false ? <View style={styles.shareSection}>
          <View style={styles.shareHeading}><Feather name="shield" color={colors.muted} size={15} /><Text style={styles.sectionLabel}>PRIVATE JOURNEY SHARING</Text></View>
          {trackingActive ? <PrimaryButton icon="share-2" loading={shareBusy} variant="secondary" onPress={() => manageShare()}>Share journey with family</PrimaryButton> : null}
          <PrimaryButton icon="lock" disabled={shareBusy} variant="secondary" onPress={() => manageShare(true)}>Revoke shared links</PrimaryButton>
        </View> : <InlineNotice>{trackingActive ? 'This link provides tracking access. Sign in or use your booking confirmation to chat and share the journey.' : 'Sign in or use your booking confirmation to contact us about this booking.'}</InlineNotice>}
        {shareMessage ? <InlineNotice>{shareMessage}</InlineNotice> : null}
      </View> : null}
      {!loaded ? <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>{PHONE_DISPLAY}</PrimaryButton> : null}
      <View style={styles.footerIcon}><Feather name="shield" color={colors.muted} size={16} /><Text style={styles.footerText}>Your booking location is protected</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.bg, gap: 16, minHeight: '100%', padding: spacing.page, paddingBottom: 42 },
  gap: { gap: 16 },
  changeBooking: { alignItems: 'center', flexDirection: 'row', alignSelf: 'flex-start', gap: 6, minHeight: 44, marginTop: -10 },
  changeBookingText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 13 },
  lookupCard: { gap: 14 },
  arrivalCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderTopColor: colors.accent, borderTopWidth: 3, borderRadius: 22, padding: 22, gap: 12 },
  arrivalTop: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  eyebrow: { color: colors.accent, fontFamily: typography.bodyBold, fontSize: 10, letterSpacing: 1.6 },
  bookingRef: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  arrivalTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 22, lineHeight: 29 },
  etaRow: { alignItems: 'baseline', flexDirection: 'row', gap: 10, marginTop: 1 },
  etaValue: { color: colors.text, fontFamily: typography.display, fontSize: 86, lineHeight: 90, flexShrink: 1 },
  etaUnit: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 24 },
  arrivalTime: { color: colors.accent, fontFamily: typography.bodyMedium, fontSize: 15, marginTop: -8 },
  arrivalDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  driverBadge: { alignItems: 'center', flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14, marginTop: 2 },
  driverName: { color: colors.text, fontFamily: typography.bodyMedium, fontSize: 13, flexShrink: 1 },
  finishedCard: { borderRadius: 22, padding: 22, gap: 13 },
  finishedIcon: { marginBottom: 2 },
  journeyCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, flexDirection: 'row', paddingVertical: 17, paddingHorizontal: 8 },
  journeyStep: { flex: 1, alignItems: 'center', gap: 7 },
  stepTop: { width: '100%', alignItems: 'center', flexDirection: 'row' },
  stepLine: { backgroundColor: colors.border, height: 2, flex: 1 },
  stepLineDone: { backgroundColor: colors.success },
  invisible: { opacity: 0 },
  stepDot: { alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  stepDotCurrent: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepDotComplete: { backgroundColor: colors.success, borderColor: colors.success },
  stepInner: { backgroundColor: colors.muted, width: 5, height: 5, borderRadius: 3 },
  stepInnerCurrent: { backgroundColor: colors.bg, width: 7, height: 7, borderRadius: 4 },
  stepLabel: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 10, textAlign: 'center' },
  stepLabelCurrent: { color: colors.text, fontFamily: typography.bodyBold },
  stepTime: { color: colors.muted, fontFamily: typography.body, fontSize: 9, textAlign: 'center' },
  mapCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  mapHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, padding: 15 },
  sectionLabel: { color: colors.muted, fontFamily: typography.bodyBold, fontSize: 10, letterSpacing: 1.2 },
  mapStatus: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  mapStatusText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 10 },
  map: { backgroundColor: colors.surface, height: 300, width: '100%' },
  mapFooter: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 14 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  updatedAt: { color: colors.muted, fontFamily: typography.body, fontSize: 10, marginLeft: 'auto' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contactButton: { flex: 1, minWidth: 130 },
  supportNumber: { color: colors.muted, fontFamily: typography.body, fontSize: 11, textAlign: 'center', marginTop: -7 },
  detailsCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, overflow: 'hidden' },
  detailsToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 17, minHeight: 74, gap: 12 },
  detailsTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, flex: 1 },
  detailsIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  detailsText: { flex: 1, gap: 4 },
  detailsTitle: { color: colors.text, fontFamily: typography.bodyMedium, fontSize: 14 },
  detailsHint: { color: colors.muted, fontFamily: typography.body, fontSize: 11 },
  detailsBody: { borderTopWidth: 1, borderTopColor: colors.border, padding: 17, gap: 12 },
  shareSection: { gap: 10, paddingTop: 5 },
  shareHeading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  summaryTitle: { color: colors.text, fontFamily: typography.bodyBold, fontSize: 24 },
  summaryDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  footerIcon: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8 },
  footerText: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
});
