import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/clipboard';
import { extractPostcode, getMapboxToken, searchMapboxAddress, type MapboxFeature } from '@/lib/mapbox';
import type {
  AssistedChatDraft,
  AssistedChatLocationMethod,
  AssistedChatQuoteBreakdown,
  QuickBookCreateResponse,
  QuickBookGetResponse,
  SendLinkResponse,
} from '@/types/assisted-chat';
import { AppButton, FieldLabel, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

const PLACEHOLDER_NAME = 'Walk-in customer';
const PLACEHOLDER_PHONE = '0000000000';
const GARAGE_LOCATION = { lat: 55.8547, lng: -4.2206 } as const;
const GARAGE_LABEL = 'Tyre Rescue Garage';

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
}

interface RouteInfo {
  encodedPolyline: string | null;
  drivingKm: number | null;
  drivingMinutes: number | null;
}

interface DirectionsResponse {
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: string;
  }>;
}

function encodeSigned(value: number): string {
  let coordinate = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (coordinate >= 0x20) {
    output += String.fromCharCode((0x20 | (coordinate & 0x1f)) + 63);
    coordinate >>= 5;
  }
  output += String.fromCharCode(coordinate + 63);
  return output;
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let previousLat = 0;
  let previousLng = 0;
  return points
    .map((point) => {
      const lat = Math.round(point.lat * 100000);
      const lng = Math.round(point.lng * 100000);
      const encoded = encodeSigned(lat - previousLat) + encodeSigned(lng - previousLng);
      previousLat = lat;
      previousLng = lng;
      return encoded;
    })
    .join('');
}

function quoteFromBooking(booking: QuickBookCreateResponse['booking']): AssistedChatQuoteBreakdown | null {
  if (!booking.priceBreakdown) return null;
  return {
    subtotal: booking.priceBreakdown.subtotal,
    vatAmount: booking.priceBreakdown.vatAmount,
    total: booking.priceBreakdown.total,
    lineItems: booking.priceBreakdown.lineItems,
    serviceOrigin: booking.priceBreakdown.serviceOrigin ?? null,
    distanceKm: booking.distanceKm ? Number(booking.distanceKm) : null,
  };
}

export function LocationSection({ draft, update }: Props) {
  const [addressInput, setAddressInput] = useState(draft.location.address);
  const [lastAddress, setLastAddress] = useState(draft.location.address);
  if (lastAddress !== draft.location.address) {
    setLastAddress(draft.location.address);
    setAddressInput(draft.location.address);
  }

  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<'copy' | 'whatsapp' | 'sms' | 'email' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info' | 'warn'; text: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo>({
    encodedPolyline: null,
    drivingKm: null,
    drivingMinutes: null,
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapImageFailed, setMapImageFailed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyBooking = useCallback(
    (booking: QuickBookCreateResponse['booking'], extra?: Partial<AssistedChatDraft['location']>) => {
      const lat = booking.locationLat ? Number(booking.locationLat) : null;
      const lng = booking.locationLng ? Number(booking.locationLng) : null;
      const quote = quoteFromBooking(booking);
      update({
        quickBookingId: booking.id,
        location: {
          ...draft.location,
          ...extra,
          address: booking.locationAddress ?? extra?.address ?? draft.location.address,
          lat,
          lng,
          postcode: booking.locationPostcode ?? extra?.postcode ?? draft.location.postcode,
          status: lat != null && lng != null ? 'received' : extra?.status ?? draft.location.status,
        },
        quote: quote ?? draft.quote,
        priceNeedsRefresh: false,
        paymentChoice: null,
        paymentLink: null,
        dispatchedRefNumber: null,
      });
    },
    [draft.location, draft.quote, update],
  );

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      setSuggestions(await searchMapboxAddress(query));
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const setMethod = (method: AssistedChatLocationMethod) => {
    update({
      location: {
        ...draft.location,
        method,
        status: method === 'link' && draft.location.link ? 'pending' : draft.location.status,
      },
      ...(draft.quote ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null } : {}),
    });
    setMessage(null);
  };

  const handleAddressChange = (value: string) => {
    setAddressInput(value);
    update({
      location: {
        ...draft.location,
        method: 'address',
        address: value,
        lat: null,
        lng: null,
        postcode: null,
        status: 'idle',
      },
      quote: null,
      priceNeedsRefresh: Boolean(draft.quote || draft.priceNeedsRefresh),
      paymentChoice: null,
      paymentLink: null,
      dispatchedRefNumber: null,
    });
    setShowSuggestions(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value), 250);
  };

  const selectAddress = (feature: MapboxFeature) => {
    const [lng, lat] = feature.center;
    const postcode = extractPostcode(feature);
    setAddressInput(feature.place_name);
    setSuggestions([]);
    setShowSuggestions(false);
    update({
      location: {
        ...draft.location,
        method: 'address',
        address: feature.place_name,
        lat,
        lng,
        postcode,
        link: null,
        whatsappLink: null,
        status: 'received',
      },
      quote: null,
      priceNeedsRefresh: Boolean(draft.quote || draft.priceNeedsRefresh),
      paymentChoice: null,
      paymentLink: null,
      dispatchedRefNumber: null,
    });
  };

  const ensureQuickBooking = useCallback(
    async (method: AssistedChatLocationMethod): Promise<{ id: string; locationLink: string | null; whatsappLink: string | null }> => {
      if (draft.quickBookingId) {
        return {
          id: draft.quickBookingId,
          locationLink: draft.location.link,
          whatsappLink: draft.location.whatsappLink,
        };
      }
      const created = await api.post<QuickBookCreateResponse>('/api/admin/quick-book', {
        customerName: draft.customer.name.trim() || PLACEHOLDER_NAME,
        customerPhone: draft.customer.phone.trim() || PLACEHOLDER_PHONE,
        customerEmail: draft.customer.email.trim() || undefined,
        locationMethod: method,
        locationAddress: method === 'address' ? draft.location.address : undefined,
        locationLat: method === 'address' && draft.location.lat != null ? draft.location.lat : undefined,
        locationLng: method === 'address' && draft.location.lng != null ? draft.location.lng : undefined,
        serviceType: 'fit',
        tyreSize: draft.tyre.size.trim() || undefined,
        tyreCount: draft.tyre.quantity,
        notes: draft.note || undefined,
      });
      applyBooking(created.booking, {
        method,
        link: created.locationLink,
        whatsappLink: created.whatsappLink,
        status: method === 'link' ? 'pending' : created.booking.locationLat ? 'received' : 'idle',
      });
      return {
        id: created.booking.id,
        locationLink: created.locationLink,
        whatsappLink: created.whatsappLink,
      };
    },
    [applyBooking, draft],
  );

  const requestLink = useCallback(
    async (method: 'copy' | 'whatsapp' | 'sms' | 'email') => {
      setMessage(null);
      setBusy(method);
      try {
        const ensured = await ensureQuickBooking('link');
        const result = await api.post<SendLinkResponse>('/api/admin/quick-book/send-link', {
          quickBookingId: ensured.id,
          method,
        });
        if (!result.ok && result.error) {
          setMessage({ kind: 'err', text: result.error });
          return;
        }

        const rawLocationLink = method === 'copy' ? result.link ?? ensured.locationLink : ensured.locationLink;
        const whatsappLink = method === 'whatsapp' ? result.link ?? ensured.whatsappLink : ensured.whatsappLink;
        update({
          location: {
            ...draft.location,
            method: 'link',
            link: rawLocationLink,
            whatsappLink,
            status: 'pending',
          },
          ...(draft.quote || draft.priceNeedsRefresh
            ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null }
            : {}),
        });

        if (method === 'copy') {
          const ok = await copyToClipboard(result.message ?? result.link ?? '');
          setMessage({ kind: ok ? 'ok' : 'err', text: ok ? 'Location message copied.' : 'Could not copy location message.' });
        } else if (method === 'whatsapp' && result.link) {
          await Linking.openURL(result.link);
          setMessage({ kind: 'ok', text: 'WhatsApp opened.' });
        } else if (method === 'sms') {
          setMessage({ kind: 'ok', text: result.message ?? 'SMS sent successfully.' });
        } else if (method === 'email') {
          setMessage({ kind: 'ok', text: result.message ?? 'Email sent successfully.' });
        }
      } catch (err) {
        setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Location link action failed.' });
      } finally {
        setBusy(null);
      }
    },
    [draft.location, draft.priceNeedsRefresh, draft.quote, ensureQuickBooking, update],
  );

  useEffect(() => {
    if (draft.location.method !== 'link' || draft.location.status !== 'pending' || !draft.quickBookingId) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.get<QuickBookGetResponse>(`/api/admin/quick-book/${draft.quickBookingId}`);
        if (data.booking.locationLat && data.booking.locationLng) {
          applyBooking(data.booking, { method: 'link' });
          setMessage({ kind: 'ok', text: 'Location shared by customer.' });
        }
      } catch {
        // Keep polling; transient network errors should not reset the operator flow.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [applyBooking, draft.location.method, draft.location.status, draft.quickBookingId]);

  const openMaps = async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://www.google.com/maps?q=${draft.location.lat},${draft.location.lng}`);
  };

  const openDirections = async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&origin=55.8547,-4.2206&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`,
    );
  };

  const routeUrl = (() => {
    if (draft.location.lat == null || draft.location.lng == null) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${GARAGE_LOCATION.lat},${GARAGE_LOCATION.lng}&destination=${draft.location.lat},${draft.location.lng}&travelmode=driving`;
  })();

  const openWaze = async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    await Linking.openURL(`https://waze.com/ul?ll=${draft.location.lat},${draft.location.lng}&navigate=yes`);
  };

  const copyRouteLink = async () => {
    if (!routeUrl) return;
    const ok = await copyToClipboard(routeUrl);
    setMessage({ kind: ok ? 'ok' : 'err', text: ok ? 'Route link copied.' : 'Could not copy route link.' });
  };

  const copyCoords = async () => {
    if (draft.location.lat == null || draft.location.lng == null) return;
    const coords = `${draft.location.lat.toFixed(6)}, ${draft.location.lng.toFixed(6)}`;
    const ok = await copyToClipboard(coords);
    setMessage({ kind: ok ? 'ok' : 'err', text: ok ? 'Coordinates copied.' : 'Could not copy coordinates.' });
  };

  const hasCoords = draft.location.lat != null && draft.location.lng != null;
  const mapToken = getMapboxToken();
  const fetchGarageRoute = useCallback(async () => {
    if (!mapToken || draft.location.lat == null || draft.location.lng == null) {
      setRouteInfo({ encodedPolyline: null, drivingKm: null, drivingMinutes: null });
      return;
    }

    setRouteLoading(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
          `${GARAGE_LOCATION.lng},${GARAGE_LOCATION.lat};${draft.location.lng},${draft.location.lat}` +
          `?geometries=polyline&overview=simplified&access_token=${encodeURIComponent(mapToken)}`,
      );
      if (!response.ok) {
        setRouteInfo({ encodedPolyline: null, drivingKm: null, drivingMinutes: null });
        return;
      }
      const data = (await response.json()) as DirectionsResponse;
      const route = data.routes?.[0];
      setRouteInfo({
        encodedPolyline: route?.geometry ?? null,
        drivingKm: typeof route?.distance === 'number' ? route.distance / 1000 : null,
        drivingMinutes: typeof route?.duration === 'number' ? Math.round(route.duration / 60) : null,
      });
    } catch {
      setRouteInfo({ encodedPolyline: null, drivingKm: null, drivingMinutes: null });
    } finally {
      setRouteLoading(false);
    }
  }, [draft.location.lat, draft.location.lng, mapToken]);

  useEffect(() => {
    void fetchGarageRoute();
  }, [fetchGarageRoute]);

  const distanceKm = routeInfo.drivingKm ?? draft.quote?.distanceKm ?? null;
  const distanceMiles = distanceKm != null ? distanceKm * 0.621371 : null;
  const eta = routeInfo.drivingMinutes ?? draft.quote?.serviceOrigin?.etaMinutes ?? null;
  const fallbackPolyline = hasCoords
    ? encodePolyline([
        GARAGE_LOCATION,
        { lat: draft.location.lat!, lng: draft.location.lng! },
      ])
    : null;
  const overlays = hasCoords
    ? [
        `pin-s-g+f97316(${GARAGE_LOCATION.lng},${GARAGE_LOCATION.lat})`,
        routeInfo.encodedPolyline
          ? `path-5+f97316-0.85(${encodeURIComponent(routeInfo.encodedPolyline)})`
          : fallbackPolyline
          ? `path-4+f97316-0.65(${encodeURIComponent(fallbackPolyline)})`
          : null,
        `pin-s-c+22c55e(${draft.location.lng},${draft.location.lat})`,
      ].filter(Boolean)
    : [];
  const staticMapUrl =
    hasCoords && mapToken
      ? `https://api.mapbox.com/styles/v1/mapbox/navigation-day-v1/static/` +
        `${overlays.join(',')}/auto/960x540@2x` +
        `?padding=90&logo=false&attribution=false&access_token=${encodeURIComponent(mapToken)}`
      : null;

  useEffect(() => {
    setMapImageFailed(false);
    setMapZoom(1);
  }, [staticMapUrl]);

  const zoomInMap = () => setMapZoom((value) => Math.min(1.75, Number((value + 0.15).toFixed(2))));
  const zoomOutMap = () => setMapZoom((value) => Math.max(1, Number((value - 0.15).toFixed(2))));

  return (
    <SectionCard title="Location">
      <View style={styles.modeRow}>
        {(['address', 'link'] as const).map((method) => (
          <Pressable
            key={method}
            onPress={() => setMethod(method)}
            style={({ pressed }) => [
              styles.modeButton,
              draft.location.method === method && styles.modeButtonActive,
              pressed && styles.modeButtonPressed,
            ]}
          >
            <Text style={[styles.modeLabel, draft.location.method === method && styles.modeLabelActive]}>
              {method === 'address' ? 'Enter Address' : 'Send Link'}
            </Text>
          </Pressable>
        ))}
      </View>

      {draft.location.method === 'address' ? (
        <View style={{ marginTop: 12 }}>
          <FieldLabel>Start typing address or postcode</FieldLabel>
          <View>
            <TextInput
              value={addressInput}
              onChangeText={handleAddressChange}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Start typing address or postcode..."
              placeholderTextColor={colors.subtle}
              autoCorrect={false}
              style={styles.input}
            />
            {searching ? <ActivityIndicator color={colors.accent} style={styles.searching} /> : null}
          </View>
          {showSuggestions && suggestions.length > 0 ? (
            <View style={styles.suggestionsBox}>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
                {suggestions.map((suggestion) => (
                  <Pressable key={suggestion.id} onPress={() => selectAddress(suggestion)} style={styles.suggestionItem}>
                    <Text style={styles.suggestionText}>{suggestion.place_name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {hasCoords ? (
            <Text style={styles.confirmedText}>
              Location confirmed ({draft.location.lat?.toFixed(4)}, {draft.location.lng?.toFixed(4)})
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.linkBox}>
          <Text style={styles.linkHelp}>A location sharing link will be generated. Send via WhatsApp, SMS, email, or copy it. Expires in 2 hours.</Text>
          {draft.location.link ? <Text style={styles.linkText} selectable>{draft.location.link}</Text> : null}
          {draft.location.status === 'pending' ? <StatusBanner kind="warn" message="Waiting for customer location. Polling every 3 seconds." /> : null}
          <View style={styles.actionGrid}>
            <AppButton label="Copy" variant="secondary" onPress={() => requestLink('copy')} loading={busy === 'copy'} fullWidth />
            <AppButton label="WhatsApp" variant="secondary" onPress={() => requestLink('whatsapp')} loading={busy === 'whatsapp'} fullWidth />
            <AppButton label="SMS" variant="secondary" onPress={() => requestLink('sms')} loading={busy === 'sms'} fullWidth />
            <AppButton label="Email" variant="secondary" onPress={() => requestLink('email')} loading={busy === 'email'} disabled={!draft.customer.email.trim()} fullWidth />
          </View>
        </View>
      )}

      {hasCoords ? (
        <View style={styles.confirmedBox}>
          <View style={[styles.mapWrap, mapExpanded && styles.mapWrapExpanded]}>
            {staticMapUrl && !mapImageFailed ? (
              <Image
                source={{ uri: staticMapUrl }}
                style={[styles.mapPreview, { transform: [{ scale: mapZoom }] }]}
                resizeMode="cover"
                alt="Garage to customer route map preview"
                onError={() => setMapImageFailed(true)}
              />
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackTitle}>Route map preview unavailable</Text>
                <Text style={styles.mapFallbackText}>
                  Open directions or refresh the route to use live navigation.
                </Text>
              </View>
            )}
            <View style={styles.mapTopOverlay}>
              <View style={styles.legendPill}>
                <View style={[styles.legendDot, styles.garageDot]} />
                <Text style={styles.legendText}>Garage</Text>
              </View>
              <View style={styles.legendPill}>
                <View style={[styles.legendDot, styles.customerDot]} />
                <Text style={styles.legendText}>Customer</Text>
              </View>
            </View>
            <View style={styles.mapControlPanel}>
              <Pressable
                onPress={() => setMapExpanded((value) => !value)}
                accessibilityLabel={mapExpanded ? 'Collapse route map' : 'Expand route map'}
                style={({ pressed }) => [styles.mapControlButton, styles.mapExpandButton, pressed && styles.mapControlButtonPressed]}
              >
                <Text style={styles.mapControlText}>{mapExpanded ? 'Collapse' : 'Expand'}</Text>
              </Pressable>
              <View style={styles.mapZoomRow}>
                <Pressable
                  onPress={zoomOutMap}
                  disabled={mapZoom <= 1}
                  accessibilityLabel="Zoom route map out"
                  style={({ pressed }) => [
                    styles.mapControlButton,
                    styles.mapZoomButton,
                    mapZoom <= 1 && styles.mapControlButtonDisabled,
                    pressed && mapZoom > 1 && styles.mapControlButtonPressed,
                  ]}
                >
                  <Text style={[styles.mapControlText, mapZoom <= 1 && styles.mapControlTextDisabled]}>-</Text>
                </Pressable>
                <Pressable
                  onPress={zoomInMap}
                  disabled={mapZoom >= 1.75}
                  accessibilityLabel="Zoom route map in"
                  style={({ pressed }) => [
                    styles.mapControlButton,
                    styles.mapZoomButton,
                    mapZoom >= 1.75 && styles.mapControlButtonDisabled,
                    pressed && mapZoom < 1.75 && styles.mapControlButtonPressed,
                  ]}
                >
                  <Text style={[styles.mapControlText, mapZoom >= 1.75 && styles.mapControlTextDisabled]}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.mapBottomOverlay}>
              <Text style={styles.mapRouteTitle}>{GARAGE_LABEL} route</Text>
              <Text style={styles.mapRouteMeta}>
                {routeLoading
                  ? 'Calculating route...'
                  : distanceMiles != null && eta != null
                  ? `${distanceMiles.toFixed(1)} mi · ${eta} min`
                  : 'Route preview'}
              </Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Garage Route</Text>
              <Text style={styles.metricValue}>{distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : '-'}</Text>
              {distanceKm != null ? <Text style={styles.metricSub}>{distanceKm.toFixed(1)} km</Text> : null}
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Drive Time</Text>
              <Text style={styles.metricValue}>{routeLoading ? '...' : eta != null ? `${eta} min` : '-'}</Text>
            </View>
          </View>
          <View style={styles.coordsBox}>
            <Text style={styles.coordsLabel}>Coordinates</Text>
            <Text style={styles.coordsText}>{draft.location.lat?.toFixed(6)}, {draft.location.lng?.toFixed(6)}</Text>
            {draft.location.address ? <Text style={styles.addressText}>{draft.location.address}</Text> : null}
          </View>
          <View style={styles.actionGrid}>
            <AppButton label="Google Maps" variant="secondary" onPress={openMaps} fullWidth />
            <AppButton label="Directions" variant="secondary" onPress={openDirections} fullWidth />
            <AppButton label="Waze" variant="secondary" onPress={openWaze} fullWidth />
            <AppButton label="Copy route" variant="secondary" onPress={copyRouteLink} fullWidth />
            <AppButton label="Copy coords" variant="secondary" onPress={copyCoords} fullWidth />
            <AppButton label="Refresh route" variant="ghost" onPress={fetchGarageRoute} loading={routeLoading} fullWidth />
          </View>
        </View>
      ) : null}

      {message ? <View style={{ marginTop: 10 }}><StatusBanner kind={message.kind} message={message.text} /></View> : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 8 },
  modeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modeButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.10)',
  },
  modeButtonPressed: { borderColor: colors.borderStrong },
  modeLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  modeLabelActive: { color: colors.accent },
  input: {
    minHeight: 44,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  searching: { position: 'absolute', right: 12, top: 12 },
  suggestionsBox: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  suggestionText: { color: colors.text, fontSize: fontSize.sm },
  confirmedText: { marginTop: 6, color: colors.success, fontSize: fontSize.xs, fontWeight: '700' },
  linkBox: { marginTop: 12, gap: 10 },
  linkHelp: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  linkText: { color: colors.accent, fontSize: fontSize.sm, lineHeight: 18 },
  actionGrid: { marginTop: 10, gap: 8 },
  confirmedBox: { marginTop: 12, gap: 10 },
  mapWrap: {
    position: 'relative',
    width: '100%',
    height: 340,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#DDE7F0',
    overflow: 'hidden',
  },
  mapWrapExpanded: {
    height: 520,
  },
  mapPreview: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#DDE7F0',
  },
  mapFallbackTitle: {
    color: '#111827',
    fontSize: fontSize.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapFallbackText: {
    color: '#374151',
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  mapTopOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 132,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(9,9,11,0.82)',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  garageDot: { backgroundColor: colors.accent },
  customerDot: { backgroundColor: '#22c55e' },
  legendText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  mapControlPanel: {
    position: 'absolute',
    top: 10,
    right: 10,
    alignItems: 'flex-end',
    gap: 8,
  },
  mapZoomRow: {
    flexDirection: 'row',
    gap: 6,
  },
  mapControlButton: {
    minHeight: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapExpandButton: {
    minWidth: 96,
    paddingHorizontal: 10,
  },
  mapZoomButton: {
    width: 38,
  },
  mapControlButtonPressed: {
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(249,115,22,0.55)',
  },
  mapControlButtonDisabled: {
    opacity: 0.55,
  },
  mapControlText: {
    color: '#111827',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  mapControlTextDisabled: {
    color: '#6B7280',
  },
  mapBottomOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    minWidth: 160,
    maxWidth: 270,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.12)',
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapRouteTitle: { color: '#111827', fontSize: fontSize.sm, fontWeight: '800' },
  mapRouteMeta: { color: '#4B5563', fontSize: fontSize.xs, marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 10,
  },
  metricLabel: { color: colors.muted, fontSize: fontSize.xs, marginBottom: 4 },
  metricValue: { color: colors.accent, fontSize: fontSize.lg, fontWeight: '800' },
  metricSub: { color: colors.subtle, fontSize: fontSize.xs, marginTop: 2 },
  coordsBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
    padding: 10,
    gap: 4,
  },
  coordsLabel: { color: colors.info, fontSize: fontSize.xs, fontWeight: '700' },
  coordsText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  addressText: { color: colors.muted, fontSize: fontSize.xs },
});
