import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { API, requestJson } from '@/src/api';
import { PHONE_DISPLAY, PHONE_TEL } from '@/src/config';
import {
  fallbackRouteCoordinates,
  getDrivingRouteCoordinates,
  routeLiveMapMarkers,
  type MapCoordinate,
} from '@/src/mapbox';
import { PulsingMap } from '@/src/pulsing-map';
import { colors, spacing, typography } from '@/src/theme';
import { Card, InlineNotice, Logo, PrimaryButton, Row, ScreenHeader, TextField, useScreenContentInsets } from '@/src/ui';

interface TrackingResponse {
  status: string;
  bookingType: string;
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  driverName: string | null;
  etaMinutes: number | null;
  distanceMiles: number | null;
  addressLine: string;
  scheduledAt: string | null;
}

function humanStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLiveTrackingStatus(status: string) {
  return !['completed', 'cancelled', 'refunded', 'refunded_partial'].includes(status);
}

export default function TrackScreen() {
  const params = useLocalSearchParams<{ ref?: string }>();
  const safeContentInsets = useScreenContentInsets();
  const [reference, setReference] = useState('');
  const [tracking, setTracking] = useState<TrackingResponse | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<MapCoordinate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedParamRef = useRef<string | null>(null);

  const mapMarkers = tracking
    ? routeLiveMapMarkers({
        customerLat: tracking.customerLat,
        customerLng: tracking.customerLng,
        driverLat: tracking.driverLat,
        driverLng: tracking.driverLng,
      })
    : [];
  const routeLineCoordinates = tracking
    ? routeCoordinates ??
      fallbackRouteCoordinates({
        customerLat: tracking.customerLat,
        customerLng: tracking.customerLng,
        driverLat: tracking.driverLat,
        driverLng: tracking.driverLng,
      })
    : [];

  const loadTrackingRef = useCallback(async (nextReference: string, options?: { silent?: boolean }) => {
    const ref = nextReference.trim().toUpperCase();
    if (!ref) return;
    if (!options?.silent) {
      setLoading(true);
      setTracking(null);
      setRouteCoordinates(null);
    }
    setError(null);
    try {
      const data = await requestJson<TrackingResponse>(`${API.tracking}/${encodeURIComponent(ref)}`);
      setTracking(data);
      void getDrivingRouteCoordinates({
        customerLat: data.customerLat,
        customerLng: data.customerLng,
        driverLat: data.driverLat,
        driverLng: data.driverLng,
      })
        .then(setRouteCoordinates)
        .catch(() => setRouteCoordinates(null));
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : 'Booking not found.');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const refParam = Array.isArray(params.ref) ? params.ref[0] : params.ref;
    if (!refParam) return;
    const normalized = refParam.trim().toUpperCase();
    if (!normalized || loadedParamRef.current === normalized) return;
    loadedParamRef.current = normalized;
    setReference(normalized);
    loadTrackingRef(normalized);
  }, [loadTrackingRef, params.ref]);

  async function loadTracking() {
    await loadTrackingRef(reference);
  }

  useEffect(() => {
    if (!tracking || !reference || !isLiveTrackingStatus(tracking.status)) return;
    const refresh = () => loadTrackingRef(reference, { silent: true });
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [loadTrackingRef, reference, tracking]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !tracking || !reference || !isLiveTrackingStatus(tracking.status)) return;
      void loadTrackingRef(reference, { silent: true });
    });

    return () => subscription.remove();
  }, [loadTrackingRef, reference, tracking]);

  return (
    <ScrollView contentContainerStyle={[styles.content, safeContentInsets]} keyboardShouldPersistTaps="handled">
      <Logo />
      <ScreenHeader eyebrow="Tracking" title="Track booking" detail="Enter your booking reference from the confirmation message." />
      <TextField label="Booking reference" value={reference} onChangeText={(value) => setReference(value.toUpperCase())} placeholder="TR-123456" autoCapitalize="characters" />
      <PrimaryButton icon="search" loading={loading} onPress={loadTracking}>Track</PrimaryButton>
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      {tracking ? (
        <View style={styles.gap}>
          <PulsingMap
            markers={mapMarkers}
            routeCoordinates={routeLineCoordinates}
            style={styles.map}
          />
          <Card>
            <Row label="Status" value={humanStatus(tracking.status)} valueStyle={{ color: colors.accent }} />
            <Row label="Type" value={humanStatus(tracking.bookingType)} />
            <Row label="Address" value={tracking.addressLine} />
            {tracking.scheduledAt ? <Row label="Scheduled" value={new Date(tracking.scheduledAt).toLocaleString('en-GB')} /> : null}
            {tracking.driverName ? <Row label="Driver" value={tracking.driverName} /> : null}
            {tracking.etaMinutes ? <Row label="ETA" value={`${tracking.etaMinutes} min`} /> : null}
            {tracking.distanceMiles ? <Row label="Distance" value={`${tracking.distanceMiles} mi`} /> : null}
          </Card>
        </View>
      ) : null}

      <PrimaryButton icon="phone" variant="secondary" onPress={() => Linking.openURL(`tel:${PHONE_TEL}`)}>
        {PHONE_DISPLAY}
      </PrimaryButton>
      <View style={styles.footerIcon}>
        <Feather name="shield" color={colors.muted} size={16} />
        <Text style={styles.footerText}>Tyre Rescue customer app</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.bg,
    gap: 16,
    minHeight: '100%',
    padding: spacing.page,
    paddingBottom: 42,
  },
  gap: {
    gap: 12,
  },
  map: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    height: 220,
    width: '100%',
  },
  footerIcon: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
  },
  footerText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
  },
});
