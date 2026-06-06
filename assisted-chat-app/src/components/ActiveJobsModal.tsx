import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
  driver: { id: string; name: string | null; phone: string | null } | null;
  driverLocation: { lat: number; lng: number; locationAt: string | null; isStale: boolean } | null;
  customer: { name: string | null; phone: string | null } | null;
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

// Base polling cadence while the modal is visible and the app is foregrounded.
const MAP_POLL_MS = 5_000;
// Backoff cadence when there is no driver location or the signal has been
// stale for a while — avoids hammering the backend for a position that is
// not moving.
const MAP_POLL_BACKOFF_MS = 12_000;
// Number of consecutive "no fresh fix" polls before backing off.
const BACKOFF_AFTER = 3;
// Maximum number of real driver points retained for the in-session trail.
const TRAIL_MAX_POINTS = 10;

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

function buildMapHtml(token: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}
.mk{position:relative;width:18px;height:18px}
.mk-dot{position:absolute;top:0;left:0;width:18px;height:18px;border-radius:50%;background:var(--c);border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,0.5);box-sizing:border-box;z-index:2}
/* Driver: live radar pulse. Two staggered expanding rings. */
.mk-ring{position:absolute;top:50%;left:50%;width:18px;height:18px;border-radius:50%;border:2px solid var(--c);transform:translate(-50%,-50%);opacity:0;z-index:1;animation:radar 1.8s ease-out infinite}
.mk-ring.r2{animation-delay:.8s}
/* Driver stale: slower, dimmer pulse to signal weak/old signal. */
.mk.stale .mk-ring{animation-duration:3.4s;opacity:0}
@keyframes radar{0%{transform:translate(-50%,-50%) scale(1);opacity:.7}100%{transform:translate(-50%,-50%) scale(3.6);opacity:0}}
/* Customer: fixed destination. Static, non-animated halo. No pulse. */
.mk-halo{position:absolute;top:50%;left:50%;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,var(--c) 0%,rgba(0,0,0,0) 70%);opacity:.28;transform:translate(-50%,-50%);z-index:1}
/* Marker info cards (popups). */
.mapboxgl-popup{max-width:240px!important}
.mapboxgl-popup-content{background:#18181B;color:#FAFAFA;border:1px solid #27272A;border-radius:10px;padding:10px 12px;box-shadow:0 6px 18px rgba(0,0,0,0.55)}
.mapboxgl-popup-tip{display:none}
.mapboxgl-popup-close-button{color:#A1A1AA;font-size:16px;padding:0 6px}
.pc-t{font-size:13px;font-weight:700;margin-bottom:2px}
.pc-r{font-size:12px;color:#A1A1AA;line-height:1.4}
.pc-b{display:inline-block;margin-top:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:6px}
.pc-b.on{background:rgba(34,197,94,0.18);color:#22c55e}
.pc-b.off{background:rgba(156,163,175,0.18);color:#9CA3AF}
</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken = ${JSON.stringify(token)};
var map = new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[-4.2518,55.8642],zoom:11,attributionControl:false});
var driverMarker = null, customerMarker = null, driverPopup = null, customerPopup = null;
var pendingState = null, loaded = false, lastState = null;
var didInitialFit = false, lastRouteKey = '';
function post(o){ try { if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
function esc(s){ return (s==null?'':String(s)).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';}); }
// Driver pin: animated radar pulse (live moving object).
function driverPin(color){var el=document.createElement('div');el.className='mk';el.style.setProperty('--c',color);el.innerHTML='<span class="mk-ring"></span><span class="mk-ring r2"></span><span class="mk-dot"></span>';return el;}
// Customer pin: fixed destination — static dot + subtle non-animated halo.
function customerPin(color){var el=document.createElement('div');el.className='mk';el.style.setProperty('--c',color);el.innerHTML='<span class="mk-halo"></span><span class="mk-dot"></span>';return el;}
function driverHtml(i){var h='<div class="pc-t">'+esc(i.name||'Driver')+'</div>';if(i.phone)h+='<div class="pc-r">'+esc(i.phone)+'</div>';if(i.updated)h+='<div class="pc-r">'+esc(i.updated)+'</div>';if(i.speed)h+='<div class="pc-r">'+esc(i.speed)+'</div>';if(i.status)h+='<span class="pc-b '+(i.live?'on':'off')+'">'+esc(i.status)+'</span>';return h;}
function customerHtml(i){var h='<div class="pc-t">'+esc(i.name||'Customer')+'</div>';if(i.phone)h+='<div class="pc-r">'+esc(i.phone)+'</div>';if(i.address)h+='<div class="pc-r">'+esc(i.address)+'</div>';return h;}
function routeKey(c){ if(!c||c.length<2) return ''; var a=c[0],b=c[c.length-1]; return c.length+':'+a[0]+','+a[1]+':'+b[0]+','+b[1]; }
function fitAll(s){
  if(s.driver && s.customer){
    var b=new mapboxgl.LngLatBounds().extend(s.driver).extend(s.customer);
    if(s.coords){ for(var i=0;i<s.coords.length;i++) b.extend(s.coords[i]); }
    map.fitBounds(b,{padding:80,maxZoom:15,duration:500});
  } else if(s.driver){ map.easeTo({center:s.driver,duration:500,zoom:Math.max(map.getZoom(),13)}); }
  else if(s.customer){ map.easeTo({center:s.customer,duration:500,zoom:Math.max(map.getZoom(),13)}); }
}
function setTrail(coords){
  var src=map.getSource('t');
  if(coords && coords.length>=2){
    var data={type:'Feature',geometry:{type:'LineString',coordinates:coords}};
    if(src){ src.setData(data); }
    else {
      map.addSource('t',{type:'geojson',data:data});
      var before = map.getLayer('rl-casing') ? 'rl-casing' : undefined;
      map.addLayer({id:'tl',type:'line',source:'t',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F59E0B','line-width':3,'line-opacity':0.45}}, before);
    }
  } else {
    if(map.getLayer('tl')) map.removeLayer('tl');
    if(map.getSource('t')) map.removeSource('t');
  }
}
function setRoute(coords, approx){
  var src=map.getSource('r');
  if(coords && coords.length>=2){
    var key=routeKey(coords);
    if(key!==lastRouteKey){
      var data={type:'Feature',geometry:{type:'LineString',coordinates:coords}};
      if(src){ src.setData(data); }
      else {
        map.addSource('r',{type:'geojson',data:data});
        map.addLayer({id:'rl-casing',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':8,'line-opacity':0.95}});
        map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2563EB','line-width':4,'line-opacity':1}});
      }
      lastRouteKey=key;
    }
    // Approximate (haversine) route is drawn as a dashed line with no casing.
    if(map.getLayer('rl-casing')) map.setLayoutProperty('rl-casing','visibility', approx?'none':'visible');
    if(map.getLayer('rl')) map.setPaintProperty('rl','line-dasharray', approx?[2,1.6]:[1,0]);
  } else {
    if(map.getLayer('rl')) map.removeLayer('rl');
    if(map.getLayer('rl-casing')) map.removeLayer('rl-casing');
    if(map.getSource('r')) map.removeSource('r');
    lastRouteKey='';
  }
}
function applyState(s){
  if(!s) return;
  if(s.customer){
    if(!customerMarker){ customerMarker = new mapboxgl.Marker({element:customerPin('#22c55e')}).setLngLat(s.customer).addTo(map); }
    else customerMarker.setLngLat(s.customer);
    if(s.customerInfo){ if(!customerPopup){ customerPopup=new mapboxgl.Popup({offset:16,closeButton:true}); customerMarker.setPopup(customerPopup); } customerPopup.setHTML(customerHtml(s.customerInfo)); }
  }
  if(s.driver){
    var driverColor = s.driverStale ? '#9CA3AF' : '#F97316';
    if(!driverMarker){ driverMarker = new mapboxgl.Marker({element:driverPin(driverColor)}).setLngLat(s.driver).addTo(map); }
    else { driverMarker.setLngLat(s.driver); driverMarker.getElement().style.setProperty('--c', driverColor); }
    driverMarker.getElement().classList.toggle('stale', !!s.driverStale);
    if(s.driverInfo){ if(!driverPopup){ driverPopup=new mapboxgl.Popup({offset:16,closeButton:true}); driverMarker.setPopup(driverPopup); } driverPopup.setHTML(driverHtml(s.driverInfo)); }
  }
  setTrail(s.trail);
  setRoute(s.coords, !!s.routeApprox);
  // Camera policy: fit once on first load with both points, otherwise only
  // move when the operator has enabled follow mode. Never auto-jump on poll.
  if(!didInitialFit && s.driver && s.customer){ fitAll(s); didInitialFit=true; }
  else if(s.follow && s.driver){ map.easeTo({center:s.driver,duration:600,zoom:Math.max(map.getZoom(),14)}); }
}
window.__applyState = function(json){
  try { var s = JSON.parse(json); lastState = s; if(loaded) applyState(s); else pendingState = s; } catch(e){}
};
window.__cmd = function(name){
  try {
    if(!loaded || !lastState) return;
    if(name==='fit'){ fitAll(lastState); }
    else if(name==='showCustomer' && lastState.customer){ map.easeTo({center:lastState.customer,duration:500,zoom:Math.max(map.getZoom(),14)}); }
    else if(name==='follow' && lastState.driver){ map.easeTo({center:lastState.driver,duration:600,zoom:Math.max(map.getZoom(),14)}); }
  } catch(e){}
};
window.__reset = function(){
  try {
    didInitialFit=false; lastRouteKey='';
    if(driverMarker){ driverMarker.remove(); driverMarker=null; }
    if(customerMarker){ customerMarker.remove(); customerMarker=null; }
    driverPopup=null; customerPopup=null;
    if(map.getLayer('tl')) map.removeLayer('tl');
    if(map.getSource('t')) map.removeSource('t');
    if(map.getLayer('rl')) map.removeLayer('rl');
    if(map.getLayer('rl-casing')) map.removeLayer('rl-casing');
    if(map.getSource('r')) map.removeSource('r');
  } catch(e){}
};
function onUserPan(e){ if(e && e.originalEvent) post({type:'userPan'}); }
map.on('dragstart', onUserPan);
map.on('rotatestart', onUserPan);
map.on('pitchstart', onUserPan);
map.on('zoomstart', onUserPan);
map.on('load', function(){ loaded = true; if(pendingState){ applyState(pendingState); pendingState = null; } });
</script></body></html>`;
}

interface TrailPoint {
  lng: number;
  lat: number;
  at: number;
}

// Great-circle distance in metres between two coordinates (for deriving
// driver speed from two real GPS fixes — never from a single location).
function metresBetween(a: TrailPoint, b: TrailPoint): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function ActiveJobMapModal({ visible, job, onClose }: MapModalProps) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [follow, setFollow] = useState(false);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [speedMph, setSpeedMph] = useState<number | null>(null);

  const aliveRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const noFixCountRef = useRef(0);
  const trailPointsRef = useRef<TrailPoint[]>([]);
  const pollNowRef = useRef<() => void>(() => {});
  const token = useMemo(() => getMapboxToken(), []);
  const html = useMemo(() => (token ? buildMapHtml(token) : ''), [token]);
  const webRef = useRef<WebView>(null);

  const bookingRef = job?.bookingRef ?? null;

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

  // Polling lifecycle: 5s base cadence, backing off to 12s when there has
  // been no fresh fix for a while. Stops on close / unmount / background and
  // never overlaps requests. The last good route is preserved on failure.
  useEffect(() => {
    aliveRef.current = true;
    setRoute(null);
    setError(null);
    setSpeedMph(null);
    setTrail([]);
    trailPointsRef.current = [];
    noFixCountRef.current = 0;
    // Clear any prior map state when switching between bookings.
    webRef.current?.injectJavaScript('window.__reset && window.__reset(); true;');

    if (!visible || !bookingRef) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return () => {
        aliveRef.current = false;
      };
    }

    const ref = bookingRef;
    setLoading(true);

    const ingestTrail = (data: RouteResponse): void => {
      const loc = data.driverLocation;
      if (!loc) return;
      const at = loc.locationAt ? Date.parse(loc.locationAt) : Date.now();
      const points = trailPointsRef.current;
      const last = points[points.length - 1];
      // Only record a point when the driver has genuinely moved — never grow
      // a trail from a repeated identical fix.
      if (last && last.lng === loc.lng && last.lat === loc.lat) return;
      const next: TrailPoint = { lng: loc.lng, lat: loc.lat, at };
      points.push(next);
      if (points.length > TRAIL_MAX_POINTS) points.shift();
      trailPointsRef.current = points;
      setTrail(points.map((p) => [p.lng, p.lat]));
      // Derive speed from the two most recent real fixes only.
      if (last && Number.isFinite(at) && Number.isFinite(last.at) && at > last.at) {
        const mps = metresBetween(last, next) / ((at - last.at) / 1000);
        const mph = mps * 2.236936;
        setSpeedMph(mph >= 0.5 && mph < 120 ? mph : null);
      }
    };

    const fetchOnce = async (): Promise<void> => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      try {
        const data = await api.get<RouteResponse>(
          `/api/admin/active-jobs/${encodeURIComponent(ref)}/route`,
        );
        if (!aliveRef.current) return;
        setRoute(data);
        setError(null);
        ingestTrail(data);
        const fresh = data.driverLocation != null && !data.driverLocation.isStale;
        noFixCountRef.current = fresh ? 0 : noFixCountRef.current + 1;
      } catch (err) {
        if (!aliveRef.current) return;
        // Keep the last good route visible; just surface the error.
        setError(err instanceof Error ? err.message : 'Tracking temporarily unavailable');
        noFixCountRef.current += 1;
      } finally {
        inflightRef.current = false;
        if (aliveRef.current) setLoading(false);
      }
    };

    const tick = async (): Promise<void> => {
      if (!aliveRef.current) return;
      if (AppState.currentState === 'active') await fetchOnce();
      if (!aliveRef.current) return;
      const delay = noFixCountRef.current >= BACKOFF_AFTER ? MAP_POLL_BACKOFF_MS : MAP_POLL_MS;
      timeoutRef.current = setTimeout(() => {
        void tick();
      }, delay);
    };

    pollNowRef.current = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void tick();
    };

    void tick();

    // Resume immediately when the app returns to the foreground.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && aliveRef.current) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        void tick();
      }
    });

    return () => {
      aliveRef.current = false;
      sub.remove();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [visible, bookingRef]);

  const isStale = route?.driverLocation?.isStale ?? job?.driver.isStale ?? false;
  const lastFix = route?.driverLocation?.locationAt ?? job?.driver.locationAt ?? null;
  const hasDriverLocation = driverPin != null;
  const hasCustomer = customerPin != null;
  const source = route?.source ?? 'none';
  const trackingStatus: 'live' | 'stale' | 'missing' = !hasDriverLocation
    ? 'missing'
    : isStale
      ? 'stale'
      : 'live';
  const trackingPill =
    trackingStatus === 'live'
      ? 'Live tracking'
      : trackingStatus === 'stale'
        ? 'Stale signal'
        : 'No driver location';
  const driverName = route?.driver?.name ?? job?.driver.name ?? 'Driver';
  const driverPhone = route?.driver?.phone ?? job?.driver.phone ?? null;
  const customerName = route?.customer?.name ?? job?.customer.name ?? 'Customer';
  const customerPhone = route?.customer?.phone ?? job?.customer.phone ?? null;
  const customerAddress = route?.customerLocation?.address ?? job?.customer.address ?? null;

  // Push the latest tracking state into the WebView. Geometry is only redrawn
  // when it actually changes (guarded inside the map script); the camera never
  // auto-jumps on poll — see the camera policy in buildMapHtml.
  useEffect(() => {
    if (!token || !visible || !bookingRef) return;
    const healthSub =
      trackingStatus === 'missing'
        ? 'Waiting for driver location'
        : trackingStatus === 'stale'
          ? lastFix
            ? `Last signal ${formatRelative(lastFix)}`
            : 'Signal lost'
          : lastFix
            ? `Updated ${formatRelative(lastFix)}`
            : 'Updated just now';
    const state = {
      driver: driverPin ? [driverPin.lng, driverPin.lat] : null,
      customer: customerPin ? [customerPin.lng, customerPin.lat] : null,
      coords: route?.geometry?.coordinates ?? null,
      routeApprox: source === 'haversine',
      driverStale: isStale,
      trail: trail.length >= 2 ? trail : null,
      follow,
      driverInfo: {
        name: driverName,
        phone: driverPhone,
        updated: healthSub,
        speed: speedMph != null ? `${Math.round(speedMph)} mph` : null,
        status: trackingPill,
        live: trackingStatus === 'live',
      },
      customerInfo: {
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
      },
    };
    const json = JSON.stringify(state).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    token,
    visible,
    bookingRef,
    driverPin?.lat,
    driverPin?.lng,
    customerPin?.lat,
    customerPin?.lng,
    route?.geometry,
    source,
    isStale,
    trail,
    follow,
    speedMph,
    trackingStatus,
    lastFix,
    driverName,
    driverPhone,
    customerName,
    customerPhone,
    customerAddress,
    trackingPill,
  ]);

  // A user-initiated pan/zoom turns off follow mode so the map never fights
  // the operator's manual control.
  const handleWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type?: string };
      if (msg.type === 'userPan') setFollow(false);
    } catch {
      /* ignore malformed messages */
    }
  }, []);

  const sendCmd = useCallback((name: 'fit' | 'showCustomer' | 'follow') => {
    webRef.current?.injectJavaScript(`window.__cmd && window.__cmd('${name}'); true;`);
  }, []);

  const handleFollow = useCallback(() => {
    setFollow((prev) => {
      const next = !prev;
      if (next) sendCmd('follow');
      return next;
    });
  }, [sendCmd]);

  if (!job) return null;

  const distance = route?.distanceMiles ?? job.distanceMiles;
  const duration = route?.durationMinutes ?? job.etaMinutes;
  const statusLabel = STATUS_LABEL[route?.status ?? job.status] ?? route?.status ?? job.status;
  const lastUpdateText = lastFix
    ? trackingStatus === 'stale'
      ? `Last signal ${formatRelative(lastFix)}`
      : `Updated ${formatRelative(lastFix)}`
    : 'Waiting for driver location';
  const routeBadge =
    source === 'haversine'
      ? 'Route unavailable — approximate line'
      : source === 'none' && hasDriverLocation && hasCustomer
        ? 'Route unavailable'
        : null;
  const showLoadingOverlay = loading && route == null;
  const showErrorOverlay = error != null && route == null;

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
            <Text style={styles.subtitle}>{statusLabel}</Text>
          </View>
          <View style={styles.pillCol}>
            <View
              style={[
                styles.trackingPill,
                trackingStatus === 'live' && styles.trackingPillLive,
                trackingStatus === 'stale' && styles.trackingPillStale,
                trackingStatus === 'missing' && styles.trackingPillMissing,
              ]}
            >
              <Text style={styles.trackingPillText}>{trackingPill}</Text>
            </View>
            <Text
              style={[styles.pillSub, trackingStatus === 'stale' && styles.pillSubStale]}
              numberOfLines={1}
            >
              {lastUpdateText}
            </Text>
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
              <Text style={styles.fallbackText}>
                {loading ? 'Loading tracking…' : 'Customer location missing'}
              </Text>
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
              onMessage={(e) => handleWebMessage(e.nativeEvent.data)}
            />
          )}

          {/* Floating map controls (native only). */}
          {token && Platform.OS !== 'web' && (driverPin || customerPin) ? (
            <View style={styles.mapControls} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fit route"
                onPress={() => sendCmd('fit')}
                style={({ pressed }) => [styles.ctrlBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.ctrlBtnText}>Fit route</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Follow driver"
                disabled={!hasDriverLocation}
                onPress={handleFollow}
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  follow && styles.ctrlBtnActive,
                  pressed && styles.btnPressed,
                  !hasDriverLocation && styles.btnDisabled,
                ]}
              >
                <Text style={[styles.ctrlBtnText, follow && styles.ctrlBtnTextActive]}>
                  Follow driver
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show customer"
                disabled={!hasCustomer}
                onPress={() => sendCmd('showCustomer')}
                style={({ pressed }) => [
                  styles.ctrlBtn,
                  pressed && styles.btnPressed,
                  !hasCustomer && styles.btnDisabled,
                ]}
              >
                <Text style={styles.ctrlBtnText}>Show customer</Text>
              </Pressable>
            </View>
          ) : null}

          {showLoadingOverlay ? (
            <View style={styles.mapState} pointerEvents="none">
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mapStateText}>Loading tracking…</Text>
            </View>
          ) : showErrorOverlay ? (
            <View style={styles.mapState}>
              <Text style={styles.mapStateText}>Tracking temporarily unavailable</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry"
                onPress={() => pollNowRef.current()}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {routeBadge ? (
          <View style={styles.routeBadge}>
            <Text style={styles.routeBadgeText}>{routeBadge}</Text>
          </View>
        ) : null}

        {/* Compact bottom tracking summary. */}
        <View style={styles.panel}>
          {hasDriverLocation ? (
            <>
              <View style={styles.panelTop}>
                <View style={styles.panelMetric}>
                  <Text style={styles.panelMetricValue}>
                    {distance != null ? distance.toFixed(1) : '—'}
                  </Text>
                  <Text style={styles.panelMetricUnit}>mi</Text>
                </View>
                <View style={styles.panelMetric}>
                  <Text style={styles.panelMetricValue}>{duration != null ? `${duration}` : '—'}</Text>
                  <Text style={styles.panelMetricUnit}>min ETA</Text>
                </View>
                <View style={styles.panelStatusWrap}>
                  <Text
                    style={[
                      styles.panelStatus,
                      trackingStatus === 'live' && styles.panelStatusLive,
                      trackingStatus === 'stale' && styles.panelStatusStale,
                    ]}
                  >
                    {trackingPill}
                  </Text>
                  <Text style={styles.panelMeta} numberOfLines={1}>
                    {lastUpdateText}
                    {speedMph != null ? ` · ${Math.round(speedMph)} mph` : ''}
                  </Text>
                </View>
              </View>
              <Text style={styles.panelLine} numberOfLines={1}>
                #{job.bookingRef} · {statusLabel} · {driverName}
              </Text>
              <View style={styles.actionRow}>
                {driverPhone ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => Linking.openURL(`tel:${driverPhone}`)}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
                  >
                    <Text style={styles.actionBtnText}>Call driver</Text>
                  </Pressable>
                ) : null}
                {customerPhone ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
                  >
                    <Text style={styles.actionBtnText}>Call customer</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.panelEmpty}>
              <Text style={styles.panelEmptyTitle}>Waiting for driver location</Text>
              <Text style={styles.panelEmptyMeta}>
                #{job.bookingRef} · {statusLabel} · {driverName}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Refresh tracking"
                  onPress={() => pollNowRef.current()}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.actionBtnText}>Refresh</Text>
                </Pressable>
                {customerPhone ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                    style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}
                  >
                    <Text style={styles.actionBtnText}>Call customer</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
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
  trackingPill: {
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: space.sm,
  },
  trackingPillLive: { backgroundColor: 'rgba(34,197,94,0.16)', borderColor: '#22c55e' },
  trackingPillStale: { backgroundColor: 'rgba(245,158,11,0.16)', borderColor: '#f59e0b' },
  trackingPillMissing: { backgroundColor: 'rgba(156,163,175,0.16)', borderColor: '#9CA3AF' },
  trackingPillText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  pillCol: { alignItems: 'flex-end', marginRight: space.sm, maxWidth: 150 },
  pillSub: { color: colors.muted, fontSize: 10, marginTop: 3 },
  pillSubStale: { color: colors.warning },
  mapControls: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    gap: space.sm,
  },
  ctrlBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.85)',
    alignItems: 'center',
  },
  ctrlBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  ctrlBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  ctrlBtnTextActive: { color: '#09090B' },
  mapState: {
    position: 'absolute',
    bottom: space.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.sm,
  },
  mapStateText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(24,24,27,0.85)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  retryBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  retryBtnText: { color: '#09090B', fontSize: fontSize.sm, fontWeight: '700' },
  routeBadge: {
    paddingHorizontal: space.lg,
    paddingVertical: 6,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  routeBadgeText: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '600' },
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
  panelTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  panelMetric: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  panelMetricValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  panelMetricUnit: { color: colors.muted, fontSize: fontSize.xs },
  panelStatusWrap: { flex: 1, alignItems: 'flex-end' },
  panelStatus: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700' },
  panelStatusLive: { color: '#22c55e' },
  panelStatusStale: { color: colors.warning },
  panelMeta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  panelLine: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  panelEmpty: { gap: 4 },
  panelEmptyTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  panelEmptyMeta: { color: colors.muted, fontSize: fontSize.xs },
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
