import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
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
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { useActiveJobs, type ActiveJobItem } from '@/hooks/useActiveJobs';
import { AdminModalHeader, AdminModalShell } from './layout/AdminModalShell';

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

const JOB_REF_SHIMMER_WIDTH = 78;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

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
  const p = item.paymentSummary ?? item.payment;
  if (!p) return ['Payment: unknown'];
  const out: string[] = [];
  if (p.totalPence != null && p.totalPence > 0) {
    out.push(`Job price: ${gbpFormatter.format(p.totalPence / 100)}`);
  }

  const amountToCollectPence = p.amountToCollectPence ?? 0;
  const due =
    amountToCollectPence > 0
      ? gbpFormatter.format(amountToCollectPence / 100)
      : null;

  if (p.state === 'paid' && amountToCollectPence === 0) {
    out.push('Paid · nothing to collect');
  } else if (p.state === 'paid') {
    out.push(due ? `Payment needs checking · ${due}` : 'Payment needs checking');
  } else if (p.state === 'needs_checking') {
    out.push(due ? `Payment needs checking · ${due}` : 'Payment needs checking');
  } else if (p.state === 'failed') {
    out.push(due ? `Payment failed · ${due}` : 'Payment failed');
  } else if (p.state === 'cash_to_collect' || p.method === 'cash') {
    out.push(due ? `Cash to collect: ${due}` : 'Cash to collect');
  } else if (p.state === 'balance_due' || p.state === 'deposit_paid') {
    out.push(due ? `Deposit paid · balance due: ${due}` : 'Deposit paid');
  } else if (p.state === 'pending') {
    out.push(due ? `Payment pending · ${due}` : 'Payment pending');
  } else if (amountToCollectPence > 0) {
    out.push(`Amount due: ${due ?? gbpFormatter.format(amountToCollectPence / 100)}`);
  } else {
    out.push(`${p.label || 'Confirm payment'} · ${p.instruction || 'Confirm with driver'}`);
  }
  return out;
}

function situationTone(status: string): 'ok' | 'warn' | 'bad' | 'muted' {
  if (status === 'on_time') return 'ok';
  if (status === 'at_risk') return 'warn';
  if (status === 'late' || status === 'offline') return 'bad';
  return 'muted';
}

function situationText(item: ActiveJobItem): string {
  const situation = item.driverSituation;
  const reason = Array.isArray(situation.reasonLabels) ? situation.reasonLabels[0] : null;
  return reason ? `${situation.label} · ${reason}` : situation.label;
}

function ShimmeringJobRef({ bookingRef }: { bookingRef: string }) {
  const [shimmer] = useState(() => new Animated.Value(0));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    shimmer.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1650,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [bookingRef, shimmer]);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [
      -JOB_REF_SHIMMER_WIDTH,
      Math.max(width, 220) + JOB_REF_SHIMMER_WIDTH,
    ],
  });

  return (
    <View
      style={styles.jobRefTitleWrap}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Text style={styles.jobRefTitleText} numberOfLines={1}>
        #{bookingRef}
      </Text>
      <Animated.View
        style={[
          styles.jobRefShimmer,
          { pointerEvents: 'none' },
          {
            transform: [
              { translateX: shimmerTranslate },
              { skewX: '-18deg' },
            ],
          },
        ]}
      />
    </View>
  );
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
      <AdminModalShell>
        <AdminModalHeader title="Active jobs" onClose={onClose} />

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
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Retry active jobs"
              style={({ pressed }) => [styles.errorRetryBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.errorRetryText}>Retry</Text>
            </Pressable>
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
                <Text
                  style={[
                    styles.rowSituation,
                    situationTone(item.driverSituation.status) === 'ok' && styles.rowSituationOk,
                    situationTone(item.driverSituation.status) === 'warn' && styles.rowSituationWarn,
                    situationTone(item.driverSituation.status) === 'bad' && styles.rowSituationBad,
                  ]}
                >
                  {situationText(item)}
                </Text>
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
      </AdminModalShell>

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

interface ActiveJobMapState {
  driver: [number, number] | null;
  customer: [number, number] | null;
  coords: [number, number][] | null;
  routeApprox: boolean;
  driverStale: boolean;
  trail: [number, number][] | null;
  follow: boolean;
  driverInfo: {
    name: string | null;
    phone: string | null;
    updated: string;
    speed: string | null;
    status: string;
    live: boolean;
  };
  customerInfo: {
    name: string | null;
    phone: string | null;
    address: string | null;
  };
}

type WebFrameRef = {
  contentWindow?: {
    postMessage?: (message: unknown, targetOrigin: string) => void;
  };
};

// Driver tracking should feel live to the operator. Keep polling at a fixed
// cadence while the modal is open; stale GPS is shown as stale, not as a reason
// to stop refreshing the server state.
const MAP_POLL_MS = 5_000;
// Maximum number of real driver points retained for the in-session trail.
const TRAIL_MAX_POINTS = 10;
const ACTIVE_JOB_MAP_MESSAGE_SOURCE = 'tyrerescue-active-job-map';

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
/* Driver/customer: live radar pulse. Two staggered expanding rings. */
.mk-ring{position:absolute;top:50%;left:50%;width:18px;height:18px;border-radius:50%;border:2px solid var(--c);transform:translate(-50%,-50%);opacity:0;z-index:1;animation:radar 1.8s ease-out infinite}
.mk-ring.r2{animation-delay:.8s}
/* Driver stale: slower, dimmer pulse to signal weak/old signal. */
.mk.stale .mk-ring{animation-duration:3.4s;opacity:0}
@keyframes radar{0%{transform:translate(-50%,-50%) scale(1);opacity:.7}100%{transform:translate(-50%,-50%) scale(3.6);opacity:0}}
@media (prefers-reduced-motion: reduce){.mk-ring{animation:none;transform:translate(-50%,-50%) scale(1.8);opacity:.16}.mk-ring.r2{display:none}}
/* Marker info cards (popups). */
.mapboxgl-popup{max-width:240px!important}
.mapboxgl-popup-content{background:#18181B;color:#FAFAFA;border:1px solid #27272A;border-radius:10px;padding:10px 12px;box-shadow:0 6px 18px rgba(0,0,0,0.55)}
.mapboxgl-popup-tip{display:none}
.mapboxgl-popup-close-button{color:#A1A1AA;font-size:16px;padding:0 6px}
.driver-pop{filter:drop-shadow(0 18px 26px rgba(0,0,0,.55))}
.driver-pop .mapboxgl-popup-content{background:transparent;border:0;padding:0;box-shadow:none}
.driver-pop .mapboxgl-popup-close-button{top:4px;right:5px;color:#FAFAFA;text-shadow:0 1px 2px rgba(0,0,0,.7);z-index:5}
.driver-badge{position:relative;min-width:204px;overflow:hidden;isolation:isolate;border-radius:14px;padding:12px 14px;background:linear-gradient(145deg,#2A2A2F 0%,#18181B 48%,#0F0F12 100%);border:1px solid rgba(249,115,22,.58);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -18px 30px rgba(0,0,0,.22),0 12px 24px rgba(0,0,0,.48);transform:perspective(520px) rotateX(5deg);transform-origin:center bottom}
.driver-badge:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.10),transparent 38%,rgba(249,115,22,.08));pointer-events:none;z-index:1}
.driver-shimmer{position:absolute;z-index:4;top:-38%;bottom:-38%;left:-120px;width:88px;transform:skewX(-18deg);background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 14%,rgba(255,255,255,.58) 50%,rgba(255,255,255,.08) 86%,transparent 100%);filter:blur(.2px);opacity:.84;mix-blend-mode:screen;pointer-events:none;animation:driverShimmer 1.65s cubic-bezier(.4,0,.2,1) infinite}
.driver-badge:after{content:"";position:absolute;left:13px;right:13px;bottom:0;height:3px;border-radius:999px;background:linear-gradient(90deg,rgba(249,115,22,.1),rgba(249,115,22,.86),rgba(34,197,94,.5));box-shadow:0 -6px 18px rgba(249,115,22,.22)}
.driver-badge-top{position:relative;z-index:2;display:flex;align-items:center;gap:10px}
.driver-avatar{width:36px;height:36px;border-radius:12px;background:linear-gradient(145deg,#F97316,#EA580C);box-shadow:inset 0 1px 0 rgba(255,255,255,.38),0 7px 14px rgba(249,115,22,.24);display:flex;align-items:center;justify-content:center;color:#09090B;font-size:15px;font-weight:900}
.driver-name-wrap{min-width:0;flex:1}
.driver-kicker{font-size:9px;font-weight:800;color:#FCD34D;text-transform:uppercase;letter-spacing:0}
.driver-name{font-size:15px;font-weight:900;color:#FAFAFA;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px rgba(0,0,0,.8)}
.driver-meta{position:relative;z-index:2;margin-top:8px;color:#D4D4D8;font-size:11px;line-height:1.35}
.driver-status{position:relative;z-index:2;display:inline-block;margin-top:8px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0;padding:3px 8px;border-radius:999px}
.driver-status.on{background:rgba(34,197,94,.18);color:#86EFAC;border:1px solid rgba(34,197,94,.42)}
.driver-status.off{background:rgba(156,163,175,.16);color:#D4D4D8;border:1px solid rgba(156,163,175,.32)}
.driver-call{position:relative;z-index:2;width:100%;min-height:34px;margin-top:10px;border:1px solid rgba(249,115,22,.72);border-radius:10px;background:linear-gradient(180deg,#F97316,#EA580C);color:#09090B;font-size:12px;font-weight:900;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 16px rgba(249,115,22,.18)}
.driver-call:active{transform:translateY(1px)}
@keyframes driverShimmer{0%{left:-120px}100%{left:calc(100% + 120px)}}
@media (prefers-reduced-motion: reduce){.driver-shimmer{animation:driverShimmer 2.4s ease-in-out infinite}.driver-badge{transform:none}}
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
var MSG_SOURCE=${JSON.stringify(ACTIVE_JOB_MAP_MESSAGE_SOURCE)};
var driverMarker = null, customerMarker = null, driverPopup = null, customerPopup = null;
var pendingState = null, loaded = false, lastState = null;
var didInitialFit = false, lastRouteKey = '';
var routeFlowFrame = null;
function post(o){ try { if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); else if(window.parent&&window.parent!==window) window.parent.postMessage({source:MSG_SOURCE,payload:o},'*'); } catch(e){} }
function esc(s){ return (s==null?'':String(s)).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';}); }
function escAttr(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;';}); }
// Driver pin: animated radar pulse (live moving object).
function driverPin(color){var el=document.createElement('div');el.className='mk';el.style.setProperty('--c',color);el.innerHTML='<span class="mk-ring"></span><span class="mk-ring r2"></span><span class="mk-dot"></span>';return el;}
// Customer pin: same staggered radar pulse so both route endpoints feel live.
function customerPin(color){var el=document.createElement('div');el.className='mk';el.style.setProperty('--c',color);el.innerHTML='<span class="mk-ring"></span><span class="mk-ring r2"></span><span class="mk-dot"></span>';return el;}
function initials(name){var parts=String(name||'D').trim().split(/\s+/).filter(Boolean);var a=(parts[0]||'D').charAt(0);var b=(parts[1]||'').charAt(0);return (a+b).toUpperCase();}
function driverHtml(i){var name=i.name||'Driver';var h='<div class="driver-badge"><span class="driver-shimmer"></span><div class="driver-badge-top"><div class="driver-avatar">'+esc(initials(name))+'</div><div class="driver-name-wrap"><div class="driver-kicker">Driver</div><div class="driver-name">'+esc(name)+'</div></div></div><div class="driver-meta">';if(i.phone)h+=esc(i.phone)+'<br>';if(i.updated)h+=esc(i.updated)+'<br>';if(i.speed)h+=esc(i.speed);h+='</div>';if(i.status)h+='<span class="driver-status '+(i.live?'on':'off')+'">'+esc(i.status)+'</span>';if(i.phone)h+='<button type="button" class="driver-call" data-phone="'+escAttr(i.phone)+'">Call driver</button>';h+='</div>';return h;}
function customerHtml(i){var h='<div class="pc-t">'+esc(i.name||'Customer')+'</div>';if(i.phone)h+='<div class="pc-r">'+esc(i.phone)+'</div>';if(i.address)h+='<div class="pc-r">'+esc(i.address)+'</div>';return h;}
function routeKey(c){ if(!c||c.length<2) return ''; var a=c[0],b=c[c.length-1]; return c.length+':'+a[0]+','+a[1]+':'+b[0]+','+b[1]; }
function routeFeature(coords){return{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}};}
function pointDistance(a,b){if(!a||!b)return 0;var lat=(a[1]+b[1])/2*Math.PI/180;var dx=(b[0]-a[0])*Math.cos(lat);var dy=b[1]-a[1];return Math.sqrt(dx*dx+dy*dy);}
function orientRoute(coords,driver,customer){
  if(!coords||coords.length<2)return coords;
  var out=coords.slice();
  if(!driver||!customer)return out;
  var first=out[0],last=out[out.length-1];
  var driverFirst=pointDistance(first,driver)+pointDistance(last,customer);
  var customerFirst=pointDistance(first,customer)+pointDistance(last,driver);
  if(customerFirst<driverFirst)out.reverse();
  return out;
}
function segmentLength(a,b){return pointDistance(a,b);}
function buildMeasures(coords){var measures=[0],total=0;for(var i=1;i<coords.length;i++){total+=segmentLength(coords[i-1],coords[i]);measures.push(total);}return{measures:measures,total:total};}
function pointAt(coords,measures,distance){
  if(distance<=0)return coords[0];
  var last=coords.length-1;
  if(distance>=measures[last])return coords[last];
  for(var i=1;i<coords.length;i++){
    if(distance<=measures[i]){
      var span=Math.max(measures[i]-measures[i-1],0.0000001);
      var t=(distance-measures[i-1])/span;
      return[
        coords[i-1][0]+(coords[i][0]-coords[i-1][0])*t,
        coords[i-1][1]+(coords[i][1]-coords[i-1][1])*t
      ];
    }
  }
  return coords[last];
}
function routeSlice(coords,measures,from,to){
  var out=[pointAt(coords,measures,from)];
  for(var i=1;i<coords.length-1;i++){
    if(measures[i]>from&&measures[i]<to)out.push(coords[i]);
  }
  out.push(pointAt(coords,measures,to));
  if(out.length<2)out.push(out[0]);
  return out;
}
function stopRouteFlow(){
  if(routeFlowFrame)cancelAnimationFrame(routeFlowFrame);
  routeFlowFrame=null;
}
function startRouteFlow(coords){
  stopRouteFlow();
  if(!coords||coords.length<2)return;
  var measured=buildMeasures(coords);
  if(!measured.total)return;
  var started=performance.now();
  var duration=2600;
  var tail=measured.total*0.18;
  function tick(now){
    var source=map.getSource('route-flow');
    if(source){
      var phase=((now-started)%duration)/duration;
      var head=phase*measured.total;
      var from=Math.max(0,head-tail);
      source.setData(routeFeature(routeSlice(coords,measured.measures,from,head)));
    }
    routeFlowFrame=requestAnimationFrame(tick);
  }
  routeFlowFrame=requestAnimationFrame(tick);
}
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
function setRoute(rawCoords, approx, driver, customer){
  var src=map.getSource('r');
  var coords=orientRoute(rawCoords,driver,customer);
  if(coords && coords.length>=2){
    var key=routeKey(coords);
    if(key!==lastRouteKey){
      var data=routeFeature(coords);
      if(src){ src.setData(data); }
      else {
        map.addSource('r',{type:'geojson',data:data});
        map.addLayer({id:'rl-casing',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':8,'line-opacity':0.95}});
        map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F97316','line-width':4,'line-opacity':1}});
      }
      if(map.getSource('route-flow')){
        map.getSource('route-flow').setData(routeFeature([coords[0],coords[0]]));
      }else{
        map.addSource('route-flow',{type:'geojson',data:routeFeature([coords[0],coords[0]])});
        map.addLayer({id:'route-flow-glow',type:'line',source:'route-flow',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FDE68A','line-width':11,'line-opacity':.34,'line-blur':2.2}});
        map.addLayer({id:'route-flow-line',type:'line',source:'route-flow',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':4.8,'line-opacity':.96}});
      }
      startRouteFlow(coords);
      lastRouteKey=key;
    }
    // Approximate (haversine) route is drawn as a dashed line with no casing.
    if(map.getLayer('rl-casing')) map.setLayoutProperty('rl-casing','visibility', approx?'none':'visible');
    if(map.getLayer('rl')) map.setPaintProperty('rl','line-dasharray', approx?[2,1.6]:[1,0]);
  } else {
    if(map.getLayer('rl')) map.removeLayer('rl');
    if(map.getLayer('rl-casing')) map.removeLayer('rl-casing');
    if(map.getSource('r')) map.removeSource('r');
    if(map.getLayer('route-flow-line')) map.removeLayer('route-flow-line');
    if(map.getLayer('route-flow-glow')) map.removeLayer('route-flow-glow');
    if(map.getSource('route-flow')) map.removeSource('route-flow');
    stopRouteFlow();
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
    if(s.driverInfo){ if(!driverPopup){ driverPopup=new mapboxgl.Popup({offset:18,closeButton:true,className:'driver-pop'}); driverMarker.setPopup(driverPopup); } driverPopup.setHTML(driverHtml(s.driverInfo)); }
  }
  setTrail(s.trail);
  setRoute(s.coords, !!s.routeApprox, s.driver, s.customer);
  // Camera policy: fit once on first load with both points, otherwise only
  // move when the operator has enabled follow mode. Never auto-jump on poll.
  if(!didInitialFit && s.driver && s.customer){ fitAll(s); didInitialFit=true; }
  else if(s.follow && s.driver){ map.easeTo({center:s.driver,duration:600,zoom:Math.max(map.getZoom(),14)}); }
}
function receiveState(s){ if(!s) return; lastState = s; if(loaded) applyState(s); else pendingState = s; }
window.__applyState = function(json){
  try { receiveState(JSON.parse(json)); } catch(e){}
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
    stopRouteFlow();
    if(map.getLayer('tl')) map.removeLayer('tl');
    if(map.getSource('t')) map.removeSource('t');
    if(map.getLayer('route-flow-line')) map.removeLayer('route-flow-line');
    if(map.getLayer('route-flow-glow')) map.removeLayer('route-flow-glow');
    if(map.getSource('route-flow')) map.removeSource('route-flow');
    if(map.getLayer('rl')) map.removeLayer('rl');
    if(map.getLayer('rl-casing')) map.removeLayer('rl-casing');
    if(map.getSource('r')) map.removeSource('r');
  } catch(e){}
};
window.addEventListener('message', function(event){
  try {
    var msg = event.data || {};
    if(msg.source !== MSG_SOURCE) return;
    if(msg.type === 'state') receiveState(msg.state);
    else if(msg.type === 'cmd' && msg.name) window.__cmd(msg.name);
  } catch(e){}
});
function onUserPan(e){ if(e && e.originalEvent) post({type:'userPan'}); }
document.addEventListener('click', function(e){
  var btn = e.target && e.target.closest ? e.target.closest('.driver-call') : null;
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  post({type:'callDriver', phone: btn.getAttribute('data-phone') || ''});
});
map.on('dragstart', onUserPan);
map.on('rotatestart', onUserPan);
map.on('pitchstart', onUserPan);
map.on('zoomstart', onUserPan);
map.on('load', function(){ loaded = true; if(pendingState){ applyState(pendingState); pendingState = null; } post({type:'ready'}); });
</script></body></html>`;
}

interface TrailPoint {
  lng: number;
  lat: number;
  at: number;
}

type UnknownRecord = Record<string, unknown>;

function recordOrNull(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validLat(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= -90 && parsed <= 90 ? parsed : null;
}

function validLng(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= -180 && parsed <= 180 ? parsed : null;
}

function validDateOrNull(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  return Number.isFinite(Date.parse(text)) ? text : null;
}

function validBoolean(value: unknown): boolean {
  return value === true;
}

function validMapCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = validLng(value[0]);
  const lat = validLat(value[1]);
  return lng != null && lat != null ? [lng, lat] : null;
}

function validGeometry(value: unknown): RouteResponse['geometry'] {
  const raw = recordOrNull(value);
  if (!raw || raw.type !== 'LineString' || !Array.isArray(raw.coordinates)) return null;
  const coordinates = raw.coordinates.flatMap((coord) => {
    const valid = validMapCoordinate(coord);
    return valid ? [valid] : [];
  });
  return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
}

function normalizeRouteResponse(value: unknown): RouteResponse | null {
  const raw = recordOrNull(value);
  if (!raw) return null;

  const driverLocationRaw = recordOrNull(raw.driverLocation);
  const driverLat = validLat(driverLocationRaw?.lat);
  const driverLng = validLng(driverLocationRaw?.lng);
  const driverLocation = driverLat != null && driverLng != null
    ? {
        lat: driverLat,
        lng: driverLng,
        locationAt: validDateOrNull(driverLocationRaw?.locationAt),
        isStale: validBoolean(driverLocationRaw?.isStale),
      }
    : null;

  const customerLocationRaw = recordOrNull(raw.customerLocation);
  const customerLat = validLat(customerLocationRaw?.lat);
  const customerLng = validLng(customerLocationRaw?.lng);
  const customerLocation = customerLat != null && customerLng != null
    ? {
        lat: customerLat,
        lng: customerLng,
        address: textOrNull(customerLocationRaw?.address),
      }
    : null;

  const driverRaw = recordOrNull(raw.driver);
  const customerRaw = recordOrNull(raw.customer);
  const source = raw.source === 'mapbox' || raw.source === 'haversine' ? raw.source : 'none';

  return {
    bookingRef: textOrNull(raw.bookingRef) ?? '',
    status: textOrNull(raw.status) ?? 'driver_assigned',
    driver: driverRaw
      ? {
          id: textOrNull(driverRaw.id) ?? '',
          name: textOrNull(driverRaw.name),
          phone: textOrNull(driverRaw.phone),
        }
      : null,
    driverLocation,
    customer: customerRaw
      ? {
          name: textOrNull(customerRaw.name),
          phone: textOrNull(customerRaw.phone),
        }
      : null,
    customerLocation,
    distanceMiles: finiteNumber(raw.distanceMiles),
    durationMinutes: finiteNumber(raw.durationMinutes),
    geometry: validGeometry(raw.geometry),
    source,
    lastUpdatedAt: validDateOrNull(raw.lastUpdatedAt) ?? new Date().toISOString(),
  };
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
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false);
  const trailPointsRef = useRef<TrailPoint[]>([]);
  const pollNowRef = useRef<() => void>(() => {});
  const token = useMemo(() => getMapboxToken(), []);
  const html = useMemo(() => (token ? buildMapHtml(token) : ''), [token]);
  const webRef = useRef<WebView>(null);
  const webFrameRef = useRef<WebFrameRef | null>(null);

  const bookingRef = job?.bookingRef ?? null;

  const driverPin = useMemo(() => (
    route?.driverLocation
      ? { lat: route.driverLocation.lat, lng: route.driverLocation.lng }
      : job?.driver.lat != null && job?.driver.lng != null
        ? { lat: job.driver.lat, lng: job.driver.lng }
        : null
  ), [job?.driver.lat, job?.driver.lng, route?.driverLocation]);
  const customerPin = useMemo(() => (
    route?.customerLocation
      ? { lat: route.customerLocation.lat, lng: route.customerLocation.lng }
      : job?.customer.lat != null && job?.customer.lng != null
        ? { lat: job.customer.lat, lng: job.customer.lng }
        : null
  ), [job?.customer.lat, job?.customer.lng, route?.customerLocation]);

  // Polling lifecycle: fixed 5s cadence while the modal is visible. It never
  // overlaps requests and preserves the last good route if a refresh fails.
  useEffect(() => {
    aliveRef.current = true;
    setRoute(null);
    setError(null);
    setLoading(false);
    setSpeedMph(null);
    setLastRefreshAt(null);
    setTrail([]);
    trailPointsRef.current = [];
    // Clear any prior map state when switching between bookings.
    webRef.current?.injectJavaScript('window.__reset && window.__reset(); true;');

    if (!visible || !bookingRef) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return () => {
        aliveRef.current = false;
      };
    }

    const ref = bookingRef;
    setLoading(true);

    const ingestTrail = (data: RouteResponse): void => {
      const loc = data.driverLocation;
      if (!loc) return;
      const parsedAt = loc.locationAt ? Date.parse(loc.locationAt) : Date.now();
      const at = Number.isFinite(parsedAt) ? parsedAt : Date.now();
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
      if (aliveRef.current) setLoading(true);
      try {
        const rawData = await api.get<unknown>(
          `/api/admin/active-jobs/${encodeURIComponent(ref)}/route`,
        );
        const data = normalizeRouteResponse(rawData);
        if (!data) throw new Error('Tracking data unavailable');
        if (!aliveRef.current) return;
        setRoute(data);
        setLastRefreshAt(data.lastUpdatedAt || new Date().toISOString());
        setError(null);
        ingestTrail(data);
      } catch (err) {
        if (!aliveRef.current) return;
        console.error('[active-jobs:route] load failed', err);
        // Keep the last good route visible; just surface the error.
        setError(err instanceof Error ? err.message : 'Tracking temporarily unavailable');
        setLastRefreshAt(new Date().toISOString());
      } finally {
        inflightRef.current = false;
        if (aliveRef.current) setLoading(false);
      }
    };

    const refreshIfActive = async (): Promise<void> => {
      if (!aliveRef.current) return;
      if (Platform.OS === 'web' || AppState.currentState === 'active') await fetchOnce();
    };

    pollNowRef.current = () => {
      void fetchOnce();
    };

    void fetchOnce();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      void refreshIfActive();
    }, MAP_POLL_MS);

    // Resume immediately when the app returns to the foreground.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && aliveRef.current) {
        void fetchOnce();
      }
    });

    return () => {
      aliveRef.current = false;
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
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

  const mapState = useMemo<ActiveJobMapState>(() => {
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
    return {
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
  }, [
    driverPin,
    customerPin,
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

  const postMapStateToWebFrame = useCallback((nextState: ActiveJobMapState = mapState) => {
    webFrameRef.current?.contentWindow?.postMessage?.(
      {
        source: ACTIVE_JOB_MAP_MESSAGE_SOURCE,
        type: 'state',
        state: nextState,
      },
      '*',
    );
  }, [mapState]);

  // Push the latest tracking state into the map. Geometry is only redrawn
  // when it actually changes (guarded inside the map script); the camera never
  // auto-jumps on poll — see the camera policy in buildMapHtml.
  useEffect(() => {
    if (!token || !visible || !bookingRef) return;
    if (Platform.OS === 'web') {
      postMapStateToWebFrame();
      return;
    }
    const json = JSON.stringify(mapState).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    token,
    visible,
    bookingRef,
    mapState,
    postMapStateToWebFrame,
  ]);

  // A user-initiated pan/zoom turns off follow mode so the map never fights
  // the operator's manual control.
  const handleWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type?: string; phone?: string };
      if (msg.type === 'ready') postMapStateToWebFrame();
      if (msg.type === 'userPan') setFollow(false);
      if (msg.type === 'callDriver' && msg.phone?.trim()) {
        void Linking.openURL(`tel:${msg.phone.trim()}`).catch(() => undefined);
      }
    } catch {
      /* ignore malformed messages */
    }
  }, [postMapStateToWebFrame]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleIframeMessage = (event: MessageEvent) => {
      const message = event.data as { source?: string; payload?: unknown };
      if (!message || message.source !== ACTIVE_JOB_MAP_MESSAGE_SOURCE) return;
      handleWebMessage(JSON.stringify(message.payload ?? {}));
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [handleWebMessage, visible]);

  const sendCmd = useCallback((name: 'fit' | 'showCustomer' | 'follow') => {
    if (Platform.OS === 'web') {
      webFrameRef.current?.contentWindow?.postMessage?.(
        { source: ACTIVE_JOB_MAP_MESSAGE_SOURCE, type: 'cmd', name },
        '*',
      );
      return;
    }
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
  const autoRefreshText = lastRefreshAt
    ? `Auto refresh · checked ${formatRelative(lastRefreshAt)}`
    : 'Auto refresh · starting';
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
      <AdminModalShell>
        <AdminModalHeader
          title={`#${job.bookingRef}`}
          titleNode={<ShimmeringJobRef bookingRef={job.bookingRef} />}
          subtitle={statusLabel}
          onClose={onClose}
          actions={
          <View style={styles.pillCol}>
            <Pressable
              onPress={() => pollNowRef.current()}
              accessibilityRole="button"
              accessibilityLabel="Refresh driver tracking now"
              disabled={loading}
              style={({ pressed }) => [
                styles.refreshTrackingBtn,
                pressed && !loading && styles.btnPressed,
                loading && styles.btnDisabled,
              ]}
            >
              <Text style={styles.refreshTrackingText}>
                {loading ? 'Refreshing...' : 'Refresh now'}
              </Text>
            </Pressable>
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
            <Text style={styles.autoRefreshText} numberOfLines={1}>
              {autoRefreshText}
            </Text>
          </View>
          }
        />

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
                ref?: React.Ref<WebFrameRef>;
                onLoad?: () => void;
              }>;
              return (
                <Iframe
                  key={bookingRef ?? 'active-job-map'}
                  ref={webFrameRef}
                  onLoad={() => postMapStateToWebFrame()}
                  srcDoc={html}
                  style={{ width: '100%', height: '100%', border: 0, background: colors.bg }}
                  sandbox="allow-scripts"
                  referrerPolicy="strict-origin-when-cross-origin"
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
            <View style={[styles.mapControls, styles.boxNonePointerEvents]}>
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
            <View style={[styles.mapState, styles.noPointerEvents]}>
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
                #{job.bookingRef} · {statusLabel} · {job.driverSituation?.label ?? 'Situation unavailable'} · {driverName}
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
                #{job.bookingRef} · {statusLabel} · {job.driverSituation?.label ?? 'Situation unavailable'} · {driverName}
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
      </AdminModalShell>
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
  jobRefTitleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 30,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingRight: 6,
  },
  jobRefTitleText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  jobRefShimmer: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    width: JOB_REF_SHIMMER_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.38)',
    opacity: 0.72,
  },
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
  pillCol: { alignItems: 'flex-end', marginRight: space.sm, maxWidth: 190, gap: 3 },
  pillSub: { color: colors.muted, fontSize: 10, marginTop: 3 },
  pillSubStale: { color: colors.warning },
  autoRefreshText: { color: colors.subtle, fontSize: 10 },
  refreshTrackingBtn: {
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshTrackingText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  mapControls: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    gap: space.sm,
  },
  boxNonePointerEvents: {
    pointerEvents: 'box-none',
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
  noPointerEvents: {
    pointerEvents: 'none',
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
    borderTopColor: colors.glowBorder,
    backgroundColor: colors.surface,
    gap: space.sm,
    shadowColor: colors.accent,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 5,
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
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelSoft,
  },
  refreshBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorBannerText: { color: colors.danger, fontSize: fontSize.sm, flex: 1 },
  errorRetryBtn: {
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  errorRetryText: { color: '#fff', fontSize: fontSize.xs, fontWeight: '700' },
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.md,
    gap: 4,
    shadowColor: colors.blue,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
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
    borderColor: colors.borderStrong,
    alignItems: 'center',
    backgroundColor: colors.panelSoft,
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
  rowSituation: { color: colors.muted, fontSize: fontSize.xs, fontWeight: '700', marginTop: 4 },
  rowSituationOk: { color: colors.success },
  rowSituationWarn: { color: colors.warning },
  rowSituationBad: { color: colors.danger },
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    borderTopColor: colors.glowBorder,
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
    backgroundColor: colors.card,
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
    borderWidth: 1,
    borderColor: colors.glowBorder,
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
  currentLat: number | string | null;
  currentLng: number | string | null;
  locationAt: string | null;
  activeJobRef?: string | null;
  driverSituation?: ActiveJobItem['driverSituation'] | null;
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
        if (alive) {
          setDrivers(
            Array.isArray(data)
              ? data.filter((driver) => typeof driver?.id === 'string' && driver.id.trim().length > 0)
              : [],
          );
        }
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
                      {item.driverSituation ? ` · ${item.driverSituation.label}` : ''}
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
