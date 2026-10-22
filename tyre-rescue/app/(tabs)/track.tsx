import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { API, requestJson } from '@/src/api';
import { PHONE_DISPLAY, PHONE_TEL } from '@/src/config';
import { useCustomerAccount } from '@/src/customer-account';
import { loadBookingAccess, saveBookingAccess } from '@/src/customer-booking-access';
import { notifyCustomerDriverNearbyAsync } from '@/src/customer-notifications';
import { fallbackRouteCoordinates, routeLiveMapMarkers, type MapCoordinate } from '@/src/mapbox';
import { PulsingMap } from '@/src/pulsing-map';
import { createTrackingRequestScope, isTrackingLocationFresh } from '@/src/tracking-state';
import { useBookingParamAccess } from '@/src/use-booking-param-access';
import { colors, spacing, typography } from '@/src/theme';
import { Card, InlineNotice, Logo, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from '@/src/ui';

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
  distanceMiles: number | null;
  routeCoordinates: MapCoordinate[] | null;
  addressLine: string;
  scheduledAt: string | null;
}
type LoadedTracking = { ref: string; data: TrackingResponse; receivedAt: number };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const humanStatus = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const isActive = (status: string) => !['completed', 'cancelled', 'refunded', 'refunded_partial'].includes(status);

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
  const requestScope = useRef(createTrackingRequestScope());
  const accountScope = useRef(0);
  const activeReference = useRef<string | null>(null);
  const nearbyNotified = useRef(new Set<string>());
  const tracking = loaded?.data ?? null;
  const locationFresh = tracking ? isTrackingLocationFresh(tracking.driverLocationAt, now) : false;
  const mapTracking = tracking ? { ...tracking, driverLat: locationFresh ? tracking.driverLat : null, driverLng: locationFresh ? tracking.driverLng : null } : null;

  const load = useCallback(async (requestedRef: string, silent = false, suppliedAccess?: string) => {
    const ref = requestedRef.trim().toUpperCase();
    if (!ref || accountLoading) return;
    if (silent && activeReference.current !== ref) return;
    if (!silent) activeReference.current = ref;
    const scope = requestScope.current;
    const revision = scope.begin();
    if (!silent) { setLoading(true); setLoaded(null); setError(null); }
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
      if (fresh && nearby && isActive(data.status) && !nearbyNotified.current.has(ref)) {
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
    if (!loadedRef || !loadedStatus || !isActive(loadedStatus)) return;
    const refresh = () => { void load(loadedRef, true); };
    const timer = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [load, loadedRef, loadedStatus]);

  return (
    <ScrollView contentContainerStyle={[styles.content, safeContentInsets]} keyboardShouldPersistTaps="handled">
      <Logo />
      <ScreenHeader eyebrow="Tracking" title="Track booking" detail="Use your booking account or the secure link from your confirmation." />
      <TextField label="Booking reference" value={reference} onChangeText={(value) => setReference(value.toUpperCase())} placeholder="TR-123456" autoCapitalize="characters" />
      <PrimaryButton icon="search" loading={loading} disabled={!reference.trim()} onPress={() => load(reference)}>Track</PrimaryButton>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {!token && error ? <PrimaryButton icon="log-in" variant="secondary" onPress={() => router.push('/account')}>Sign in to your account</PrimaryButton> : null}
      {tracking && loaded && mapTracking ? <View style={styles.gap}>
        {refreshFailed ? <InlineNotice>Connection interrupted. Showing the last received update; retrying automatically.</InlineNotice> : null}
        {isActive(tracking.status) && tracking.driverName && !locationFresh ? <InlineNotice>Waiting for a fresh driver location. The arrival estimate will return when tracking updates.</InlineNotice> : null}
        <PulsingMap markers={routeLiveMapMarkers(mapTracking)} routeCoordinates={locationFresh ? tracking.routeCoordinates ?? fallbackRouteCoordinates(mapTracking) : []} style={styles.map} />
        <Card>
          <Row label="Reference" value={loaded.ref} />
          <Row label="Status" value={humanStatus(tracking.status)} valueStyle={{ color: colors.accent }} />
          <Row label="Type" value={humanStatus(tracking.bookingType)} />
          <Row label="Address" value={tracking.addressLine} />
          {tracking.scheduledAt ? <Row label="Scheduled" value={new Date(tracking.scheduledAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })} /> : null}
          {tracking.driverName ? <Row label="Driver" value={tracking.driverName} /> : null}
          {locationFresh && tracking.etaMinutes !== null ? <Row label="Estimated arrival" value={`${tracking.etaMinutes} min`} /> : null}
          {locationFresh && tracking.distanceMiles !== null ? <Row label="Distance" value={`${tracking.distanceMiles} mi`} /> : null}
          <Row label="Last received" value={new Date(loaded.receivedAt).toLocaleTimeString('en-GB')} />
          {tracking.driverLocationAt ? <Row label="Driver location updated" value={new Date(tracking.driverLocationAt).toLocaleTimeString('en-GB')} /> : null}
        </Card>
        {tracking.canChat !== false ? <>
          <PrimaryButton icon="message-circle" onPress={() => router.push({ pathname: '/chat', params: { bookingId: tracking.bookingId, ref: loaded.ref } })}>Chat with us</PrimaryButton>
          <PrimaryButton icon="share-2" loading={shareBusy} variant="secondary" onPress={() => manageShare()}>Share journey with family</PrimaryButton>
          <PrimaryButton icon="lock" disabled={shareBusy} variant="secondary" onPress={() => manageShare(true)}>Revoke shared links</PrimaryButton>
        </> : <InlineNotice>This link provides tracking access. Sign in or use your booking confirmation to chat and share the journey.</InlineNotice>}
        {shareMessage ? <InlineNotice>{shareMessage}</InlineNotice> : null}
        <PrimaryButton icon="refresh-cw" variant="secondary" onPress={() => load(loaded.ref, true)}>Refresh tracking</PrimaryButton>
      </View> : null}
      <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>{PHONE_DISPLAY}</PrimaryButton>
      <View style={styles.footerIcon}><Feather name="shield" color={colors.muted} size={16} /><Text style={styles.footerText}>Your booking location is protected</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { backgroundColor: colors.bg, gap: 16, minHeight: '100%', padding: spacing.page, paddingBottom: 42 },
  gap: { gap: 12 },
  map: { backgroundColor: colors.surface, borderRadius: 8, height: 220, width: '100%' },
  footerIcon: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 8 },
  footerText: { color: colors.muted, fontFamily: typography.body, fontSize: 12 },
});
