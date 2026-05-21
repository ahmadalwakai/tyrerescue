import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { useActiveJobs, type ActiveJobItem } from '@/hooks/useActiveJobs';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  driver_assigned: 'Assigned',
  en_route: 'En route',
  arrived: 'Arrived',
  in_progress: 'In progress',
};

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

function formatRelative(at: string | null): string {
  if (!at) return '—';
  const ms = Date.now() - new Date(at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

function paymentLines(item: ActiveJobItem): string[] {
  const p = item.payment;
  if (!p) return ['Payment: unknown'];
  const out: string[] = [];
  if (p.totalAmountPence != null && p.totalAmountPence > 0) {
    out.push(`Job price: ${gbpFormatter.format(p.totalAmountPence / 100)}`);
  }
  if (p.status === 'paid' || p.amountToCollectPence === 0) {
    out.push('Paid · nothing to collect');
  } else if (p.amountToCollectPence > 0) {
    out.push(`Amount to collect: ${gbpFormatter.format(p.amountToCollectPence / 100)}`);
  } else {
    out.push('Confirm with driver');
  }
  return out;
}

export function ActiveJobsModal({ visible, onClose }: Props) {
  const { items, loading, error, lastUpdated, refresh } = useActiveJobs(visible);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ActiveJobItem | null>(null);
  const [copyingRef, setCopyingRef] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedRef(null);
      setReassignTarget(null);
    }
  }, [visible]);

  const selectedItem = useMemo(
    () => items.find((j) => j.bookingRef === selectedRef) ?? null,
    [items, selectedRef],
  );

  const handleCopyTracking = useCallback(async (item: ActiveJobItem) => {
    setCopyingRef(item.bookingRef);
    try {
      const data = await api.post<{ customerUrl: string }>(
        `/api/admin/bookings/${encodeURIComponent(item.bookingId)}/tracking/ensure`,
      );
      if (data?.customerUrl) {
        await Clipboard.setStringAsync(data.customerUrl);
        Alert.alert('Tracking link copied', data.customerUrl);
      } else {
        Alert.alert('Tracking link', 'No tracking URL returned.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch tracking link';
      Alert.alert('Copy failed', msg);
    } finally {
      setCopyingRef(null);
    }
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">Active jobs</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {items.length} active · {loading ? 'updating…' : lastUpdated ? `updated ${formatRelative(new Date(lastUpdated).toISOString())}` : 'idle'}
          </Text>
          <Pressable
            onPress={refresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh active jobs"
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={items}
          keyExtractor={(it) => it.bookingRef}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No active jobs right now.</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open live map for ${item.bookingRef}`}
                onPress={() => setSelectedRef(item.bookingRef)}
                style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
              >
                <View style={styles.rowHeader}>
                  <Text style={styles.rowRef}>#{item.bookingRef}</Text>
                  <Text style={[styles.rowStatus, item.driver.isStale && styles.rowStatusStale]}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
                <Text style={styles.rowPrimary}>{item.customer.name || 'Customer'}</Text>
                {item.customer.address ? (
                  <Text style={styles.rowAddress} numberOfLines={2}>
                    {item.customer.address}
                  </Text>
                ) : null}
                <View style={styles.rowFacts}>
                  <Text style={styles.rowFact}>
                    {item.distanceMiles != null ? `${item.distanceMiles.toFixed(1)} mi` : '— mi'}
                  </Text>
                  <Text style={styles.rowFactSep}>·</Text>
                  <Text style={styles.rowFact}>
                    {item.etaMinutes != null ? `${item.etaMinutes} min` : '— min'}
                  </Text>
                  <Text style={styles.rowFactSep}>·</Text>
                  <Text
                    style={[styles.rowFact, item.driver.isStale && styles.rowFactStale]}
                  >
                    GPS {item.driver.locationAt ? formatRelative(item.driver.locationAt) : 'unknown'}
                  </Text>
                </View>
                <Text style={styles.rowDriver}>
                  Driver: {item.driver.name}
                  {item.driver.phone ? ` · ${item.driver.phone}` : ''}
                </Text>
                {paymentLines(item).map((line, idx) => (
                  <Text key={idx} style={styles.rowPayment}>
                    {line}
                  </Text>
                ))}
              </Pressable>
              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy tracking link"
                  onPress={() => handleCopyTracking(item)}
                  disabled={copyingRef === item.bookingRef}
                  style={({ pressed }) => [
                    styles.rowActionBtn,
                    pressed && styles.btnPressed,
                    copyingRef === item.bookingRef && styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.rowActionText}>
                    {copyingRef === item.bookingRef ? 'Copying…' : 'Copy tracking link'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reassign driver"
                  onPress={() => setReassignTarget(item)}
                  style={({ pressed }) => [styles.rowActionBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.rowActionText}>Reassign driver</Text>
                </Pressable>
              </View>
            </View>
          )}
          refreshing={loading && items.length > 0}
          onRefresh={refresh}
        />

        {loading && items.length === 0 ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </SafeAreaView>

      <ActiveJobMapModal
        visible={selectedItem != null}
        job={selectedItem}
        onClose={() => setSelectedRef(null)}
      />
      <ReassignDriverModal
        visible={reassignTarget != null}
        target={reassignTarget}
        onClose={() => setReassignTarget(null)}
        onSuccess={() => {
          setReassignTarget(null);
          refresh();
        }}
      />
    </Modal>
  );
}

interface RouteResponse {
  bookingRef: string;
  status: string;
  driverLocation: { lat: number; lng: number; locationAt: string | null; isStale: boolean } | null;
  customerLocation: { lat: number; lng: number; address: string | null } | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
  source: 'mapbox' | 'haversine' | 'none';
  lastUpdatedAt: string;
}

interface MapModalProps {
  visible: boolean;
  job: ActiveJobItem | null;
  onClose: () => void;
}

const MAP_POLL_MS = 12_000;

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

function buildMapHtml(token: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken = ${JSON.stringify(token)};
var map = new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[-4.2518,55.8642],zoom:11,attributionControl:false});
var driverMarker = null, customerMarker = null;
var pendingState = null, loaded = false;
function pin(color){var el=document.createElement('div');el.style.cssText='width:18px;height:18px;border-radius:50%;background:'+color+';border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,0.5)';return el;}
function applyState(s){
  if(!s) return;
  if(s.customer){
    if(!customerMarker) customerMarker = new mapboxgl.Marker({element:pin('#22c55e')}).setLngLat(s.customer).addTo(map);
    else customerMarker.setLngLat(s.customer);
  }
  if(s.driver){
    if(!driverMarker) driverMarker = new mapboxgl.Marker({element:pin('#F97316')}).setLngLat(s.driver).addTo(map);
    else driverMarker.setLngLat(s.driver);
  }
  if(s.driver && s.customer){
    var b = new mapboxgl.LngLatBounds().extend(s.driver).extend(s.customer);
    map.fitBounds(b,{padding:80,maxZoom:15,duration:300});
  } else if(s.driver){ map.easeTo({center:s.driver,duration:300}); }
  else if(s.customer){ map.easeTo({center:s.customer,duration:300}); }
  var src = map.getSource('r');
  if(s.coords && s.coords.length >= 2){
    var data = {type:'Feature',geometry:{type:'LineString',coordinates:s.coords}};
    if(src){ src.setData(data); }
    else {
      map.addSource('r',{type:'geojson',data:data});
      map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F97316','line-width':4,'line-opacity':0.9}});
    }
  } else if(src){
    if(map.getLayer('rl')) map.removeLayer('rl');
    map.removeSource('r');
  }
}
window.__applyState = function(json){
  try { var s = JSON.parse(json); if(loaded) applyState(s); else pendingState = s; } catch(e){}
};
map.on('load', function(){ loaded = true; if(pendingState){ applyState(pendingState); pendingState = null; } });
</script></body></html>`;
}

export function ActiveJobMapModal({ visible, job, onClose }: MapModalProps) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);
  const token = useMemo(() => getMapboxToken(), []);
  const html = useMemo(() => (token ? buildMapHtml(token) : ''), [token]);
  const webRef = useRef<WebView>(null);

  const driverPin = route?.driverLocation
    ? { lat: route.driverLocation.lat, lng: route.driverLocation.lng }
    : job?.driver.lat != null && job?.driver.lng != null
      ? { lat: job.driver.lat, lng: job.driver.lng }
      : null;
  const customerPin = route?.customerLocation
    ? { lat: route.customerLocation.lat, lng: route.customerLocation.lng }
    : job?.customer.lat != null && job?.customer.lng != null
      ? { lat: job.customer.lat, lng: job.customer.lng }
      : null;

  useEffect(() => {
    aliveRef.current = true;
    setRoute(null);
    setError(null);
    if (!visible || !job) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return () => {
        aliveRef.current = false;
      };
    }
    const ref = job.bookingRef;
    const fetchOnce = async () => {
      try {
        const data = await api.get<RouteResponse>(
          `/api/admin/active-jobs/${encodeURIComponent(ref)}/route`,
        );
        if (!aliveRef.current) return;
        setRoute(data);
        setError(null);
      } catch (err) {
        if (!aliveRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load route');
      }
    };
    fetchOnce();
    timerRef.current = setInterval(fetchOnce, MAP_POLL_MS);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [visible, job]);

  useEffect(() => {
    if (!token || !visible || !job) return;
    const state = {
      driver: driverPin ? [driverPin.lng, driverPin.lat] : null,
      customer: customerPin ? [customerPin.lng, customerPin.lat] : null,
      coords: route?.geometry?.coordinates ?? null,
    };
    const json = JSON.stringify(state).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    token,
    visible,
    job,
    driverPin?.lat,
    driverPin?.lng,
    customerPin?.lat,
    customerPin?.lng,
    route?.geometry,
  ]);

  if (!job) return null;

  const isStale = route?.driverLocation?.isStale ?? job.driver.isStale;
  const lastFix = route?.driverLocation?.locationAt ?? job.driver.locationAt;
  const distance = route?.distanceMiles ?? job.distanceMiles;
  const duration = route?.durationMinutes ?? job.etaMinutes;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>#{job.bookingRef}</Text>
            <Text style={styles.subtitle}>{STATUS_LABEL[job.status] ?? job.status}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close map"
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.mapWrap}>
          {!token ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>
                Mapbox token not configured. Set EXPO_PUBLIC_MAPBOX_TOKEN.
              </Text>
            </View>
          ) : !driverPin && !customerPin ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>Waiting for first location…</Text>
            </View>
          ) : Platform.OS === 'web' ? (
            (() => {
              const Iframe = 'iframe' as unknown as React.ComponentType<{
                srcDoc: string;
                style: { width: string; height: string; border: number; background: string };
                sandbox: string;
                referrerPolicy: string;
                title: string;
              }>;
              return (
                <Iframe
                  srcDoc={html}
                  style={{ width: '100%', height: '100%', border: 0, background: colors.bg }}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  title={`Live map for ${job.bookingRef}`}
                />
              );
            })()
          ) : (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html }}
              style={styles.web}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              androidLayerType="hardware"
              mixedContentMode="always"
              setSupportMultipleWindows={false}
            />
          )}
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryValue}>
              {distance != null ? `${distance.toFixed(1)} mi` : '— mi'}
            </Text>
            <Text style={styles.summarySep}>·</Text>
            <Text style={styles.summaryValue}>
              {duration != null ? `${duration} min` : '— min'}
            </Text>
          </View>
          <Text style={[styles.summaryMeta, isStale && styles.summaryMetaStale]}>
            GPS {lastFix ? formatRelative(lastFix) : 'unknown'} · {route?.source ?? 'pending'}
          </Text>
          {route?.source === 'haversine' ? (
            <Text style={styles.summaryApprox}>
              Approximate line — live ETA unavailable
            </Text>
          ) : null}
          {error ? <Text style={styles.errorInline}>{error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <Text style={styles.driverLine}>
            Driver: {job.driver.name}
            {job.driver.phone ? ` · ${job.driver.phone}` : ''}
          </Text>
          <Text style={styles.customerLine}>
            Customer: {job.customer.name}
            {job.customer.phone ? ` · ${job.customer.phone}` : ''}
          </Text>
          <View style={styles.actionRow}>
            {job.driver.phone ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => Linking.openURL(`tel:${job.driver.phone}`)}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.actionBtnText}>Call driver</Text>
              </Pressable>
            ) : null}
            {job.customer.phone ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => Linking.openURL(`tel:${job.customer.phone}`)}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.actionBtnText}>Call customer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700', flex: 1 },
  subtitle: { color: colors.muted, fontSize: fontSize.sm, marginTop: 2 },
  closeBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  btnPressed: { opacity: 0.65 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  metaText: { color: colors.muted, fontSize: fontSize.xs },
  refreshBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  errorBanner: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorBannerText: { color: colors.danger, fontSize: fontSize.sm },
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  empty: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 4,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { gap: 4 },
  rowActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowActionBtn: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  rowActionText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  summaryApprox: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowRef: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  rowStatus: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowStatusStale: { color: colors.warning },
  rowPrimary: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowAddress: { color: colors.muted, fontSize: fontSize.xs },
  rowFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  rowFact: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  rowFactSep: { color: colors.subtle, fontSize: fontSize.xs },
  rowFactStale: { color: colors.warning },
  rowDriver: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
  rowPayment: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '600' },
  loadingOverlay: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  mapWrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  web: { flex: 1, backgroundColor: colors.bg },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  fallbackText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
  summary: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  summaryValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  summarySep: { color: colors.subtle, fontSize: fontSize.lg },
  summaryMeta: { color: colors.muted, fontSize: fontSize.xs },
  summaryMetaStale: { color: colors.warning },
  errorInline: { color: colors.danger, fontSize: fontSize.xs, marginTop: 4 },
  actions: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    backgroundColor: colors.surface,
    gap: 4,
  },
  driverLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  customerLine: { color: colors.muted, fontSize: fontSize.sm },
  actionRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  actionBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '80%',
    paddingBottom: space.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  pickerItem: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerItemDisabled: { opacity: 0.45 },
  pickerName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  pickerMeta: { color: colors.muted, fontSize: fontSize.xs, marginTop: 2 },
});

interface DriverListItem {
  id: string;
  name: string;
  phone: string | null;
  isOnline: boolean;
  status: string;
  currentLat: number | null;
  currentLng: number | null;
  locationAt: string | null;
}

interface ReassignProps {
  visible: boolean;
  target: ActiveJobItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ReassignDriverModal({ visible, target, onClose, onSuccess }: ReassignProps) {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !target) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    api
      .get<DriverListItem[]>('/api/admin/drivers')
      .then((data) => {
        if (alive) setDrivers(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : 'Failed to load drivers');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, target]);

  const handlePick = useCallback(
    async (driver: DriverListItem) => {
      if (!target) return;
      setSubmitting(driver.id);
      try {
        await api.patch(
          `/api/admin/bookings/${encodeURIComponent(target.bookingRef)}/assign`,
          { driverId: driver.id },
        );
        Alert.alert('Driver reassigned', `${driver.name} assigned to #${target.bookingRef}.`);
        onSuccess();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to reassign';
        Alert.alert('Reassign failed', msg);
      } finally {
        setSubmitting(null);
      }
    },
    [target, onSuccess],
  );

  if (!target) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Reassign #{target.bookingRef}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          {err ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{err}</Text>
            </View>
          ) : null}
          {loading ? (
            <View style={{ padding: space.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={drivers}
              keyExtractor={(d) => d.id}
              ListEmptyComponent={
                <View style={{ padding: space.xl, alignItems: 'center' }}>
                  <Text style={{ color: colors.muted }}>No drivers available.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isCurrent = target.driver.id === item.id;
                const isBusy = submitting === item.id;
                return (
                  <Pressable
                    onPress={() => handlePick(item)}
                    disabled={isCurrent || isBusy || submitting != null}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      pressed && styles.btnPressed,
                      isCurrent && styles.pickerItemDisabled,
                    ]}
                  >
                    <Text style={styles.pickerName}>
                      {item.name} {isCurrent ? '(current)' : ''}
                    </Text>
                    <Text style={styles.pickerMeta}>
                      {item.isOnline ? 'Online' : 'Offline'} · {item.status}
                      {item.phone ? ` · ${item.phone}` : ''}
                      {isBusy ? ' · assigning…' : ''}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
