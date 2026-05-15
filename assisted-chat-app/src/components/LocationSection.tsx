import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { copyToClipboard } from '@/lib/clipboard';
import { extractPostcode, getMapboxToken, searchMapboxAddress, type MapboxFeature } from '@/lib/mapbox';
import { isValidUkPhone } from '@/lib/money';
import type { AssistedChatDraft, AssistedChatLocationMethod } from '@/types/assisted-chat';
import type { LocationShareMessage, LocationShareMethod, LocationShareProgress } from '@/hooks/useAssistedChatLocationShare';
import { AppButton, FieldLabel, SectionCard, StatusBanner } from './ui';
import { colors, fontSize, radius } from './theme';

const GARAGE_LOCATION = { lat: 55.8547, lng: -4.2206 } as const;
const GARAGE_LABEL = 'Tyre Rescue Garage';
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 4;

interface Props {
  draft: AssistedChatDraft;
  update: (patch: Partial<AssistedChatDraft>) => void;
  locationShare: {
    busy: LocationShareMethod | null;
    message: LocationShareMessage | null;
    isPolling: LocationShareProgress['isPolling'];
    lastPollAt: LocationShareProgress['lastPollAt'];
    lastPollingError: LocationShareProgress['lastPollingError'];
    staleReason: LocationShareProgress['staleReason'];
    setMessage: (message: LocationShareMessage | null) => void;
    requestLink: (method: LocationShareMethod) => Promise<void>;
  };
  showInlineActions?: boolean;
  displayMode?: 'full' | 'mapOnly';
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

type LocationRequestState =
  | 'IDLE'
  | 'CREATING_LINK'
  | 'LINK_READY'
  | 'WAITING_FOR_CUSTOMER'
  | 'POLLING'
  | 'LOCATION_RECEIVED'
  | 'ROUTE_READY'
  | 'FAILED'
  | 'EXPIRED_OR_STALE';

interface LocationRequestViewState {
  state: LocationRequestState;
  label: string;
  detail: string;
  helper: string | null;
  tone: 'idle' | 'busy' | 'ok' | 'warn' | 'err';
}

function secondsSince(timestamp: number | null, now: number): number | null {
  if (!timestamp) return null;
  return Math.max(0, Math.floor((now - timestamp) / 1000));
}

function buildLocationRequestViewState({
  busy,
  hasLink,
  hasCoords,
  hasRoute,
  isPolling,
  lastPollingError,
  staleReason,
  message,
}: {
  busy: LocationShareMethod | null;
  hasLink: boolean;
  hasCoords: boolean;
  hasRoute: boolean;
  isPolling: boolean;
  lastPollingError: string | null;
  staleReason: string | null;
  message: LocationShareMessage | null;
}): LocationRequestViewState {
  if (staleReason) {
    return {
      state: 'EXPIRED_OR_STALE',
      label: 'Request expired or no longer available',
      detail: 'Send a fresh location link to continue.',
      helper: staleReason,
      tone: 'err',
    };
  }

  if (message?.kind === 'err' || lastPollingError) {
    return {
      state: 'FAILED',
      label: 'Location request failed',
      detail: message?.text ?? lastPollingError ?? 'Try sending the link again if the customer is stuck.',
      helper: hasLink ? 'Try sending the link again if the customer is stuck.' : null,
      tone: 'err',
    };
  }

  if (hasRoute) {
    return {
      state: 'ROUTE_READY',
      label: 'Route calculated',
      detail: 'Customer location and route are ready.',
      helper: null,
      tone: 'ok',
    };
  }

  if (hasCoords) {
    return {
      state: 'LOCATION_RECEIVED',
      label: 'Location received',
      detail: 'Customer coordinates have arrived.',
      helper: null,
      tone: 'ok',
    };
  }

  if (busy) {
    return {
      state: 'CREATING_LINK',
      label: 'Creating secure location link...',
      detail: 'Preparing the request for the customer.',
      helper: 'Please keep this screen open for a moment.',
      tone: 'busy',
    };
  }

  if (hasLink && isPolling) {
    return {
      state: 'POLLING',
      label: 'Checking for location every few seconds...',
      detail: "Keep this screen open. We are listening for the customer's location.",
      helper: 'Try sending the link again if the customer is stuck.',
      tone: 'busy',
    };
  }

  if (hasLink) {
    return {
      state: 'WAITING_FOR_CUSTOMER',
      label: 'Waiting for customer to share location...',
      detail: "Keep this screen open. We are listening for the customer's location.",
      helper: 'Try sending the link again if the customer is stuck.',
      tone: 'warn',
    };
  }

  return {
    state: 'IDLE',
    label: 'No location request yet',
    detail: 'Send a secure link when the customer needs to share their position.',
    helper: null,
    tone: 'idle',
  };
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

function clampMapZoom(value: number): number {
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, value));
}

function buildLiveRoutePathOverlays(encodedPolyline: string | null, fallbackPolyline: string | null): string[] {
  const polyline = encodedPolyline ?? fallbackPolyline;
  if (!polyline) return [];
  const encoded = encodeURIComponent(polyline);
  return [
    `path-9+111827-0.28(${encoded})`,
    `path-6+f97316-0.96(${encoded})`,
    `path-2+fff7ed-0.9(${encoded})`,
  ];
}

export function LocationSection({
  draft,
  update,
  locationShare,
  showInlineActions = true,
  displayMode = 'full',
}: Props) {
  const { busy, message, setMessage, requestLink } = locationShare;
  const [addressInput, setAddressInput] = useState(draft.location.address);
  const [lastAddress, setLastAddress] = useState(draft.location.address);
  if (lastAddress !== draft.location.address) {
    setLastAddress(draft.location.address);
    setAddressInput(draft.location.address);
  }

  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo>({
    encodedPolyline: null,
    drivingKm: null,
    drivingMinutes: null,
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapImageFailed, setMapImageFailed] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapPinchStartZoom = useRef(1);
  const mapPanStart = useRef({ x: 0, y: 0 });
  const pinchHandlerRef = useRef(null);
  const panHandlerRef = useRef(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const routePathOverlays = buildLiveRoutePathOverlays(routeInfo.encodedPolyline, fallbackPolyline);
  const overlays = hasCoords
    ? [
        `pin-s-g+f97316(${GARAGE_LOCATION.lng},${GARAGE_LOCATION.lat})`,
        ...routePathOverlays,
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
    setMapPan({ x: 0, y: 0 });
  }, [staticMapUrl]);

  const [pollClock, setPollClock] = useState(Date.now());
  useEffect(() => {
    if (!locationShare.isPolling || !locationShare.lastPollAt) return;
    const interval = setInterval(() => setPollClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [locationShare.isPolling, locationShare.lastPollAt]);

  const hasRoute = hasCoords && (distanceMiles != null || eta != null);
  const requestViewState = buildLocationRequestViewState({
    busy,
    hasLink: Boolean(draft.location.link),
    hasCoords,
    hasRoute,
    isPolling: locationShare.isPolling,
    lastPollingError: locationShare.lastPollingError,
    staleReason: locationShare.staleReason,
    message,
  });
  const lastCheckedSeconds = secondsSince(locationShare.lastPollAt, pollClock);

  const zoomInMap = () => setMapZoom((value) => Math.min(MAP_MAX_ZOOM, Number((value + 0.15).toFixed(2))));
  const zoomOutMap = () => {
    setMapZoom((value) => {
      const next = Math.max(MAP_MIN_ZOOM, Number((value - 0.15).toFixed(2)));
      if (next <= MAP_MIN_ZOOM) setMapPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleMapPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    const { state } = event.nativeEvent;
    if (state === State.BEGAN) {
      mapPinchStartZoom.current = mapZoom;
      return;
    }

    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      setMapZoom((value) => {
        const clamped = Number(clampMapZoom(value).toFixed(2));
        if (clamped <= MAP_MIN_ZOOM) setMapPan({ x: 0, y: 0 });
        return clamped;
      });
    }
  };
  const handleMapPinch = (event: PinchGestureHandlerGestureEvent) => {
    setMapZoom(Number(clampMapZoom(mapPinchStartZoom.current * event.nativeEvent.scale).toFixed(2)));
  };
  const handleMapPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    const { state } = event.nativeEvent;
    if (state === State.BEGAN) {
      mapPanStart.current = mapPan;
    }
  };
  const handleMapPan = (event: PanGestureHandlerGestureEvent) => {
    if (mapZoom <= MAP_MIN_ZOOM) return;
    setMapPan({
      x: mapPanStart.current.x + event.nativeEvent.translationX,
      y: mapPanStart.current.y + event.nativeEvent.translationY,
    });
  };

  return (
    <SectionCard title={displayMode === 'mapOnly' ? 'Route map' : 'Location'}>
      {displayMode === 'full' ? (
        <>
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
          <LocationRequestStatusCard
            viewState={requestViewState}
            lastCheckedSeconds={lastCheckedSeconds}
            hasLink={Boolean(draft.location.link)}
            canSendWhatsApp={Boolean(draft.customer.phone.trim())}
            canSendSms={isValidUkPhone(draft.customer.phone)}
            canSendEmail={Boolean(draft.customer.email.trim())}
            busy={busy}
            requestLink={requestLink}
          />
        </View>
      )}
        </>
      ) : null}

      {hasCoords ? (
        <View style={styles.confirmedBox}>
          <View style={[styles.mapWrap, mapExpanded && styles.mapWrapExpanded]}>
            <PanGestureHandler
              ref={panHandlerRef}
              simultaneousHandlers={pinchHandlerRef}
              minPointers={1}
              maxPointers={1}
              avgTouches
              enabled={mapZoom > MAP_MIN_ZOOM}
              onGestureEvent={handleMapPan}
              onHandlerStateChange={handleMapPanStateChange}
            >
              <PinchGestureHandler
                ref={pinchHandlerRef}
                simultaneousHandlers={panHandlerRef}
                onGestureEvent={handleMapPinch}
                onHandlerStateChange={handleMapPinchStateChange}
              >
                <View style={styles.mapGestureLayer}>
                  {staticMapUrl && !mapImageFailed ? (
                    <Image
                      source={{ uri: staticMapUrl }}
                      style={[
                        styles.mapPreview,
                        {
                          transform: [
                            { translateX: mapPan.x },
                            { translateY: mapPan.y },
                            { scale: mapZoom },
                          ],
                        },
                      ]}
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
                </View>
              </PinchGestureHandler>
            </PanGestureHandler>
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
                  disabled={mapZoom <= MAP_MIN_ZOOM}
                  accessibilityLabel="Zoom route map out"
                  style={({ pressed }) => [
                    styles.mapControlButton,
                    styles.mapZoomButton,
                    mapZoom <= MAP_MIN_ZOOM && styles.mapControlButtonDisabled,
                    pressed && mapZoom > MAP_MIN_ZOOM && styles.mapControlButtonPressed,
                  ]}
                >
                  <Text style={[styles.mapControlText, mapZoom <= MAP_MIN_ZOOM && styles.mapControlTextDisabled]}>-</Text>
                </Pressable>
                <Pressable
                  onPress={zoomInMap}
                  disabled={mapZoom >= MAP_MAX_ZOOM}
                  accessibilityLabel="Zoom route map in"
                  style={({ pressed }) => [
                    styles.mapControlButton,
                    styles.mapZoomButton,
                    mapZoom >= MAP_MAX_ZOOM && styles.mapControlButtonDisabled,
                    pressed && mapZoom < MAP_MAX_ZOOM && styles.mapControlButtonPressed,
                  ]}
                >
                  <Text style={[styles.mapControlText, mapZoom >= MAP_MAX_ZOOM && styles.mapControlTextDisabled]}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.mapBottomOverlay}>
              <View style={styles.mapRouteHeader}>
                <Text style={styles.mapRouteTitle} numberOfLines={1}>{GARAGE_LABEL} route</Text>
                <View style={styles.routeStatusPill}>
                  <View style={styles.routeStatusDot} />
                  <Text style={styles.routeStatusText}>Active</Text>
                </View>
              </View>
              <Text style={styles.mapRouteMeta}>
                {routeLoading
                  ? 'Calculating active route...'
                  : distanceMiles != null && eta != null
                  ? `Live route · ${distanceMiles.toFixed(1)} mi · ${eta} min`
                  : 'Live route preview'}
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
          {showInlineActions ? (
          <View style={styles.actionGrid}>
            <AppButton label="Google Maps" variant="secondary" onPress={openMaps} fullWidth />
            <AppButton label="Directions" variant="secondary" onPress={openDirections} fullWidth />
            <AppButton label="Waze" variant="secondary" onPress={openWaze} fullWidth />
            <AppButton label="Copy route" variant="secondary" onPress={copyRouteLink} fullWidth />
            <AppButton label="Copy coords" variant="secondary" onPress={copyCoords} fullWidth />
            <AppButton label="Refresh route" variant="ghost" onPress={fetchGarageRoute} loading={routeLoading} fullWidth />
          </View>
          ) : null}
        </View>
      ) : null}

      {message ? <View style={{ marginTop: 10 }}><StatusBanner kind={message.kind} message={message.text} /></View> : null}
    </SectionCard>
  );
}

function LocationRequestStatusCard({
  viewState,
  lastCheckedSeconds,
  hasLink,
  canSendWhatsApp,
  canSendSms,
  canSendEmail,
  busy,
  requestLink,
}: {
  viewState: LocationRequestViewState;
  lastCheckedSeconds: number | null;
  hasLink: boolean;
  canSendWhatsApp: boolean;
  canSendSms: boolean;
  canSendEmail: boolean;
  busy: LocationShareMethod | null;
  requestLink: (method: LocationShareMethod) => Promise<void>;
}) {
  const showActions = hasLink || viewState.state === 'EXPIRED_OR_STALE' || viewState.state === 'FAILED';
  const linkDone = !['IDLE', 'CREATING_LINK', 'FAILED', 'EXPIRED_OR_STALE'].includes(viewState.state);
  const shareDone = viewState.state === 'LOCATION_RECEIVED' || viewState.state === 'ROUTE_READY';
  const routeDone = viewState.state === 'ROUTE_READY';
  const listeningActive = viewState.state === 'WAITING_FOR_CUSTOMER' || viewState.state === 'POLLING';
  const routeActive = viewState.state === 'LOCATION_RECEIVED';

  return (
    <View style={[styles.requestCard, getRequestCardToneStyle(viewState.tone)]}>
      <View style={styles.requestHeader}>
        <View style={[styles.requestChip, getRequestChipToneStyle(viewState.tone)]}>
          <Text style={[styles.requestChipText, getRequestChipTextToneStyle(viewState.tone)]}>{viewState.state.replace(/_/g, ' ')}</Text>
        </View>
        {lastCheckedSeconds != null ? <Text style={styles.requestLastChecked}>Last checked {lastCheckedSeconds}s ago</Text> : null}
      </View>

      <Text style={styles.requestTitle}>{viewState.label}</Text>
      <Text style={styles.requestDetail}>{viewState.detail}</Text>
      {viewState.helper ? <Text style={styles.requestHelper}>{viewState.helper}</Text> : null}

      <View style={styles.requestSteps}>
        <LocationRequestStep label="Link" done={linkDone} active={viewState.state === 'CREATING_LINK' || viewState.state === 'LINK_READY'} />
        <LocationRequestStep label="Share" done={shareDone} active={listeningActive} />
        <LocationRequestStep label="Route" done={routeDone} active={routeActive} />
      </View>

      {showActions ? (
        <View style={styles.requestActions}>
          <AppButton label="Copy again" variant="secondary" onPress={() => requestLink('copy')} loading={busy === 'copy'} style={styles.requestActionButton} />
          <AppButton label="WhatsApp" variant="secondary" onPress={() => requestLink('whatsapp')} loading={busy === 'whatsapp'} disabled={!canSendWhatsApp} style={styles.requestActionButton} />
          <AppButton label="SMS" variant="secondary" onPress={() => requestLink('sms')} loading={busy === 'sms'} disabled={!canSendSms} style={styles.requestActionButton} />
          <AppButton label="Email" variant="secondary" onPress={() => requestLink('email')} loading={busy === 'email'} disabled={!canSendEmail} style={styles.requestActionButton} />
        </View>
      ) : null}
    </View>
  );
}

function LocationRequestStep({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <View style={styles.requestStep}>
      <View style={[styles.requestStepDot, done && styles.requestStepDotDone, active && styles.requestStepDotActive]} />
      <Text style={[styles.requestStepLabel, (done || active) && styles.requestStepLabelActive]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function getRequestCardToneStyle(tone: LocationRequestViewState['tone']) {
  if (tone === 'busy') return styles.requestCard_busy;
  if (tone === 'ok') return styles.requestCard_ok;
  if (tone === 'warn') return styles.requestCard_warn;
  if (tone === 'err') return styles.requestCard_err;
  return styles.requestCard_idle;
}

function getRequestChipToneStyle(tone: LocationRequestViewState['tone']) {
  if (tone === 'busy') return styles.requestChip_busy;
  if (tone === 'ok') return styles.requestChip_ok;
  if (tone === 'warn') return styles.requestChip_warn;
  if (tone === 'err') return styles.requestChip_err;
  return styles.requestChip_idle;
}

function getRequestChipTextToneStyle(tone: LocationRequestViewState['tone']) {
  if (tone === 'busy') return styles.requestChipText_busy;
  if (tone === 'ok') return styles.requestChipText_ok;
  if (tone === 'warn') return styles.requestChipText_warn;
  if (tone === 'err') return styles.requestChipText_err;
  return styles.requestChipText_idle;
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
    minHeight: 48,
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
  requestCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
  },
  requestCard_idle: { backgroundColor: colors.card, borderColor: colors.border },
  requestCard_busy: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
  requestCard_ok: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  requestCard_warn: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  requestCard_err: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  requestChip: {
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  requestChip_idle: { backgroundColor: colors.surface, borderColor: colors.border },
  requestChip_busy: { backgroundColor: colors.card, borderColor: colors.infoBorder },
  requestChip_ok: { backgroundColor: colors.card, borderColor: colors.successBorder },
  requestChip_warn: { backgroundColor: colors.card, borderColor: colors.warningBorder },
  requestChip_err: { backgroundColor: colors.card, borderColor: colors.dangerBorder },
  requestChipText_idle: { color: colors.muted },
  requestChipText_busy: { color: colors.info },
  requestChipText_ok: { color: colors.success },
  requestChipText_warn: { color: colors.warning },
  requestChipText_err: { color: colors.danger },
  requestChipText: { fontSize: fontSize.xs, fontWeight: '900' },
  requestLastChecked: { color: colors.muted, fontSize: fontSize.xs, flexShrink: 0 },
  requestTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  requestDetail: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 18 },
  requestHelper: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 16 },
  requestSteps: { flexDirection: 'row', gap: 8 },
  requestStep: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  requestStepDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.borderStrong,
  },
  requestStepDotDone: { backgroundColor: colors.success },
  requestStepDotActive: { backgroundColor: colors.accent },
  requestStepLabel: { color: colors.subtle, fontSize: fontSize.xs, fontWeight: '700', flexShrink: 1 },
  requestStepLabelActive: { color: colors.text },
  requestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  requestActionButton: { flexGrow: 1, flexBasis: 128, minHeight: 48 },
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
  mapGestureLayer: {
    flex: 1,
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
    minHeight: 48,
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
    width: 48,
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
  mapRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mapRouteTitle: { color: '#111827', fontSize: fontSize.sm, fontWeight: '800', flexShrink: 1 },
  mapRouteMeta: { color: '#4B5563', fontSize: fontSize.xs, marginTop: 2 },
  routeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.14)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  routeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  routeStatusText: {
    color: '#14532D',
    fontSize: 10,
    fontWeight: '900',
  },
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
