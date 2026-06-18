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
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { isValidCoordinate, haversineMiles, formatDistanceMiles } from '@/lib/geo';
import { useTracking, type TrackingDriver, type TrackingJob, type TrackingPaymentSummary } from '@/hooks/useTracking';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function formatGbpPence(pence: number): string {
  return GBP.format(pence / 100);
}

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

function freshnessLabel(freshness: TrackingDriver['locationFreshness']): string {
  if (freshness === 'live') return 'Live';
  if (freshness === 'stale') return 'Stale signal';
  if (freshness === 'offline') return 'Offline';
  return 'Unknown';
}

function paymentLine(payment: TrackingPaymentSummary | null): string {
  if (!payment) return 'Payment needs checking';
  const due =
    payment.amountToCollectPence > 0
      ? formatGbpPence(payment.amountToCollectPence)
      : null;

  if (
    payment.status === 'paid' &&
    payment.amountToCollectPence === 0 &&
    (payment.remainingBalancePence == null || payment.remainingBalancePence <= 0)
  ) {
    return 'Paid · nothing to collect';
  }
  if (payment.status === 'paid') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.status === 'needs_checking') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.status === 'failed') return due ? `Payment failed · ${due}` : 'Payment failed';
  if (payment.type === 'cash') return due ? `Cash to collect: ${due}` : 'Cash to collect';
  if (payment.status === 'deposit_paid') return due ? `Deposit paid · balance due: ${due}` : 'Deposit paid';
  if (payment.status === 'pending') return due ? `Payment pending · ${due}` : 'Payment pending';
  if (payment.status === 'unpaid') return due ? `Unpaid · ${due}` : 'Unpaid';
  if (due) return `Amount due: ${due}`;
  return 'Confirm payment with driver';
}

function needsPaymentWarning(payment: TrackingPaymentSummary | null): boolean {
  if (!payment) return true;
  return !(payment.status === 'paid' && payment.amountToCollectPence === 0);
}

// ─── Map HTML ────────────────────────────────────────────────────────────────

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

function buildTrackingMapHtml(token: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}
.pin{display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;-webkit-user-select:none}
.pdot{width:16px;height:16px;border-radius:50%;border:2px solid #09090B;transition:background 0.1s}
.plbl{margin-top:3px;font-size:9px;font-weight:700;color:#FAFAFA;background:rgba(9,9,11,0.82);padding:1px 5px;border-radius:3px;white-space:nowrap;max-width:84px;overflow:hidden;text-overflow:ellipsis;font-family:system-ui,sans-serif;line-height:1.4}
</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken=${JSON.stringify(token)};
var map=new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[-4.2518,55.8642],zoom:11,attributionControl:false});
var mks={};
var loaded=false,pending=null,didFit=false;
function post(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
function esc(s){return(s==null?'':String(s)).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
function driverColor(status,fresh){
  if(fresh==='offline')return'#6B7280';
  if(fresh==='stale')return'#D97706';
  if(status==='busy')return'#F97316';
  if(status==='available')return'#22c55e';
  return'#9CA3AF';
}
function jobColor(aStatus){return aStatus==='unassigned'?'#EF4444':'#3B82F6';}
function makeEl(color,label,sel){
  var el=document.createElement('div');
  el.className='pin';
  var dot=document.createElement('div');
  dot.className='pdot';
  dot.style.background=color;
  dot.style.boxShadow='0 2px 6px rgba(0,0,0,.55)'+(sel?',0 0 0 3px #FAFAFA':'');
  var lbl=document.createElement('div');
  lbl.className='plbl';
  lbl.textContent=esc(label);
  el.appendChild(dot);
  el.appendChild(lbl);
  return el;
}
function addClick(el,kind,id){
  el.addEventListener('click',function(e){e.stopPropagation();post({type:'mk',kind:kind,id:id});});
}
function apply(s){
  if(!s)return;
  var seen={};
  var pts=[];
  // Drivers
  var ds=s.drivers||[];
  for(var i=0;i<ds.length;i++){
    var d=ds[i];
    if(d.lat==null||d.lng==null)continue;
    seen[d.id]=true;
    pts.push([d.lng,d.lat]);
    var color=driverColor(d.status,d.freshness);
    var label=d.name||'Driver';
    var sel=!!d.selected;
    if(mks[d.id]){
      mks[d.id].marker.setLngLat([d.lng,d.lat]);
      var dot=mks[d.id].el.querySelector('.pdot');
      if(dot){dot.style.background=color;dot.style.boxShadow='0 2px 6px rgba(0,0,0,.55)'+(sel?',0 0 0 3px #FAFAFA':'');}
      var lbl=mks[d.id].el.querySelector('.plbl');
      if(lbl)lbl.textContent=esc(label);
    }else{
      var el=makeEl(color,label,sel);
      (function(id){addClick(el,'driver',id);})(d.id);
      var mk=new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([d.lng,d.lat]).addTo(map);
      mks[d.id]={marker:mk,el:el};
    }
  }
  // Jobs
  var js=s.jobs||[];
  for(var j=0;j<js.length;j++){
    var jb=js[j];
    if(jb.lat==null||jb.lng==null)continue;
    seen[jb.id]=true;
    pts.push([jb.lng,jb.lat]);
    var color=jobColor(jb.assignmentStatus);
    var label=jb.ref;
    var sel=!!jb.selected;
    if(mks[jb.id]){
      mks[jb.id].marker.setLngLat([jb.lng,jb.lat]);
      var dot=mks[jb.id].el.querySelector('.pdot');
      if(dot){dot.style.background=color;dot.style.boxShadow='0 2px 6px rgba(0,0,0,.55)'+(sel?',0 0 0 3px #FAFAFA':'');}
      var lbl=mks[jb.id].el.querySelector('.plbl');
      if(lbl)lbl.textContent=esc(label);
    }else{
      var el=makeEl(color,label,sel);
      (function(id){addClick(el,'job',id);})(jb.id);
      var mk=new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([jb.lng,jb.lat]).addTo(map);
      mks[jb.id]={marker:mk,el:el};
    }
  }
  // Remove stale markers
  Object.keys(mks).forEach(function(id){
    if(!seen[id]){mks[id].marker.remove();delete mks[id];}
  });
  // Auto-fit on first render with real points
  if(!didFit&&s.doFit&&pts.length>0){
    if(pts.length===1){
      map.easeTo({center:pts[0],zoom:13,duration:600});
    }else{
      var b=new mapboxgl.LngLatBounds();
      pts.forEach(function(p){b.extend(p);});
      map.fitBounds(b,{padding:90,maxZoom:13,duration:600});
    }
    didFit=true;
  }
}
window.__applyState=function(json){
  try{var s=JSON.parse(json);if(loaded)apply(s);else pending=s;}catch(e){}
};
window.__fitAll=function(){
  var pts=[];
  Object.keys(mks).forEach(function(id){
    var ll=mks[id].marker.getLngLat();
    pts.push([ll.lng,ll.lat]);
  });
  if(pts.length===0)return;
  if(pts.length===1){map.easeTo({center:pts[0],zoom:13,duration:500});return;}
  var b=new mapboxgl.LngLatBounds();
  pts.forEach(function(p){b.extend(p);});
  map.fitBounds(b,{padding:90,maxZoom:13,duration:500});
};
map.on('load',function(){loaded=true;if(pending){apply(pending);pending=null;}});
</script></body></html>`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DriverDetailProps {
  driver: TrackingDriver;
  distanceToJob: string | null;
}

function DriverDetail({ driver, distanceToJob }: DriverDetailProps) {
  const isStale = driver.locationFreshness === 'stale';
  const isOffline = driver.locationFreshness === 'offline';
  return (
    <View style={styles.detailBlock}>
      <Text style={styles.detailTitle} numberOfLines={1}>{driver.name}</Text>
      <View style={styles.detailPillRow}>
        <View style={[
          styles.freshPill,
          driver.locationFreshness === 'live' && styles.freshPillLive,
          isStale && styles.freshPillStale,
          isOffline && styles.freshPillOffline,
        ]}>
          <Text style={styles.freshPillText}>{freshnessLabel(driver.locationFreshness)}</Text>
        </View>
        <View style={[
          styles.statusPill,
          driver.status === 'available' && styles.statusPillAvailable,
          driver.status === 'busy' && styles.statusPillBusy,
        ]}>
          <Text style={styles.statusPillText}>{driver.status}</Text>
        </View>
      </View>
      {driver.lastSeenAt ? (
        <Text style={[styles.detailMeta, isStale && styles.detailMetaWarn]}>
          Last seen {formatRelative(driver.lastSeenAt)}
        </Text>
      ) : (
        <Text style={styles.detailMeta}>No location data</Text>
      )}
      {driver.activeJobRef ? (
        <Text style={styles.detailMeta}>Active job: #{driver.activeJobRef}</Text>
      ) : null}
      {distanceToJob ? (
        <Text style={styles.detailMeta}>Approx. distance to job: {distanceToJob}</Text>
      ) : null}
      {(isStale || isOffline) ? (
        <Text style={styles.detailWarn}>Driver location is not live.</Text>
      ) : null}
    </View>
  );
}

interface JobDetailProps {
  job: TrackingJob;
  distanceFromDriver: string | null;
}

function JobDetail({ job, distanceFromDriver }: JobDetailProps) {
  return (
    <View style={styles.detailBlock}>
      <View style={styles.detailHeaderRow}>
        <Text style={styles.detailTitle}>#{job.ref}</Text>
        <View style={[
          styles.assignPill,
          job.assignmentStatus === 'unassigned' && styles.assignPillUnassigned,
        ]}>
          <Text style={styles.assignPillText}>
            {job.assignmentStatus === 'unassigned' ? 'Unassigned' : 'Assigned'}
          </Text>
        </View>
      </View>
      {job.customerName ? (
        <Text style={styles.detailName} numberOfLines={1}>{job.customerName}</Text>
      ) : null}
      <Text style={styles.detailAddress} numberOfLines={2}>{job.address}</Text>
      {job.tyreSummary ? (
        <Text style={styles.detailMeta}>Tyres: {job.tyreSummary}</Text>
      ) : null}
      {job.vehicleSummary ? (
        <Text style={styles.detailMeta}>Vehicle: {job.vehicleSummary}</Text>
      ) : null}
      <Text style={[
        styles.detailPayment,
        needsPaymentWarning(job.paymentSummary) && styles.detailPaymentWarn,
      ]}>
        {paymentLine(job.paymentSummary)}
      </Text>
      {distanceFromDriver ? (
        <Text style={styles.detailMeta}>Approx. distance from driver: {distanceFromDriver}</Text>
      ) : null}
    </View>
  );
}

// ─── Driver list sheet ───────────────────────────────────────────────────────

interface DriverListSheetProps {
  visible: boolean;
  drivers: TrackingDriver[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function DriverListSheet({ visible, drivers, selectedId, onSelect, onClose }: DriverListSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Drivers ({drivers.length})</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close driver list"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={drivers}
            keyExtractor={(d) => d.id}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No driver locations available.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              const isStale = item.locationFreshness === 'stale' || item.locationFreshness === 'offline';
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select driver ${item.name}`}
                  style={({ pressed }) => [
                    styles.listItem,
                    isSelected && styles.listItemSelected,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <View style={styles.listItemRow}>
                    <Text style={styles.listItemName} numberOfLines={1}>{item.name}</Text>
                    <View style={[
                      styles.freshDot,
                      item.locationFreshness === 'live' && styles.freshDotLive,
                      item.locationFreshness === 'stale' && styles.freshDotStale,
                    ]} />
                  </View>
                  <Text style={[styles.listItemMeta, isStale && styles.listItemMetaWarn]}>
                    {item.status}
                    {item.activeJobRef ? ` · #${item.activeJobRef}` : ''}
                    {item.lastSeenAt ? ` · ${formatRelative(item.lastSeenAt)}` : ' · no GPS'}
                  </Text>
                  {item.lat == null ? (
                    <Text style={styles.listItemMeta}>Location unavailable</Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Job list sheet ──────────────────────────────────────────────────────────

interface JobListSheetProps {
  visible: boolean;
  jobs: TrackingJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function JobListSheet({ visible, jobs, selectedId, onSelect, onClose }: JobListSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Jobs ({jobs.length})</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close job list"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={jobs}
            keyExtractor={(j) => j.id}
            contentContainerStyle={styles.sheetList}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No unassigned or active jobs.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select job ${item.ref}`}
                  style={({ pressed }) => [
                    styles.listItem,
                    isSelected && styles.listItemSelected,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <View style={styles.listItemRow}>
                    <Text style={styles.listItemName}>#{item.ref}</Text>
                    <Text style={[
                      styles.listItemBadge,
                      item.assignmentStatus === 'unassigned' && styles.listItemBadgeUnassigned,
                    ]}>
                      {item.assignmentStatus === 'unassigned' ? 'Unassigned' : 'Assigned'}
                    </Text>
                  </View>
                  {item.customerName ? (
                    <Text style={styles.listItemMeta} numberOfLines={1}>{item.customerName}</Text>
                  ) : null}
                  <Text style={styles.listItemMeta} numberOfLines={1}>{item.address}</Text>
                  <Text style={[
                    styles.listItemMeta,
                    needsPaymentWarning(item.paymentSummary) && styles.listItemMetaWarn,
                  ]}>
                    {paymentLine(item.paymentSummary)}
                  </Text>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Assign confirm sheet ────────────────────────────────────────────────────

interface AssignConfirmSheetProps {
  visible: boolean;
  driver: TrackingDriver | null;
  job: TrackingJob | null;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

function AssignConfirmSheet({ visible, driver, job, loading, error, onConfirm, onClose }: AssignConfirmSheetProps) {
  if (!driver || !job) return null;
  const showPaymentWarning = needsPaymentWarning(job.paymentSummary);
  const isDriverOffline = driver.locationFreshness === 'offline' || driver.locationFreshness === 'stale';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={loading ? undefined : onClose}>
        <Pressable style={styles.confirmSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.confirmTitle}>Confirm assignment</Text>
          <Text style={styles.confirmBody}>
            Assign job <Text style={styles.confirmHighlight}>#{job.ref}</Text> to{' '}
            <Text style={styles.confirmHighlight}>{driver.name}</Text>?
          </Text>

          {isDriverOffline ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>Driver location is not live. Confirm they are available before dispatching.</Text>
            </View>
          ) : null}

          {showPaymentWarning ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>Check payment before dispatch.</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.confirmActions}>
            <Pressable
              onPress={loading ? undefined : onClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Cancel assignment"
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={loading ? undefined : onConfirm}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Confirm assignment"
              style={({ pressed }) => [styles.assignConfirmBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={styles.assignConfirmBtnText}>Assign job</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main TrackingModal ──────────────────────────────────────────────────────

export function TrackingModal({ visible, onClose }: Props) {
  const { data, loading, error, lastUpdated, refresh } = useTracking(visible);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [driversOpen, setDriversOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [didFit, setDidFit] = useState(false);

  const webRef = useRef<WebView>(null);
  const token = useMemo(() => getMapboxToken(), []);
  const html = useMemo(() => (token ? buildTrackingMapHtml(token) : ''), [token]);

  useEffect(() => {
    if (!visible) {
      setSelectedDriverId(null);
      setSelectedJobId(null);
      setDriversOpen(false);
      setJobsOpen(false);
      setAssignOpen(false);
      setAssignError(null);
      setDidFit(false);
    }
  }, [visible]);

  // Resume poll when app comes to foreground
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [visible, refresh]);

  const selectedDriver = useMemo(
    () => data?.drivers.find((d) => d.id === selectedDriverId) ?? null,
    [data, selectedDriverId],
  );
  const selectedJob = useMemo(
    () => data?.jobs.find((j) => j.id === selectedJobId) ?? null,
    [data, selectedJobId],
  );

  const canAssign =
    selectedDriver != null &&
    selectedJob != null &&
    selectedJob.assignmentStatus === 'unassigned';

  const distance = useMemo((): string | null => {
    if (!selectedDriver || !selectedJob) return null;
    if (
      !isValidCoordinate(selectedDriver.lat, selectedDriver.lng) ||
      !isValidCoordinate(selectedJob.lat, selectedJob.lng)
    ) {
      return 'Location unavailable';
    }
    const miles = haversineMiles(
      selectedDriver.lat!,
      selectedDriver.lng!,
      selectedJob.lat!,
      selectedJob.lng!,
    );
    return formatDistanceMiles(miles);
  }, [selectedDriver, selectedJob]);

  // Sync marker state to WebView
  useEffect(() => {
    if (!visible || !token) return;
    const driverMarkers = (data?.drivers ?? [])
      .filter((d) => isValidCoordinate(d.lat, d.lng))
      .map((d) => ({
        id: d.id,
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        status: d.status,
        freshness: d.locationFreshness,
        selected: d.id === selectedDriverId,
      }));
    const jobMarkers = (data?.jobs ?? [])
      .filter((j) => isValidCoordinate(j.lat, j.lng))
      .map((j) => ({
        id: j.id,
        ref: j.ref,
        lat: j.lat,
        lng: j.lng,
        assignmentStatus: j.assignmentStatus,
        selected: j.id === selectedJobId,
      }));
    const doFit = !didFit && (driverMarkers.length > 0 || jobMarkers.length > 0);
    if (doFit) setDidFit(true);
    const state = { drivers: driverMarkers, jobs: jobMarkers, doFit };
    const json = JSON.stringify(state).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    visible,
    token,
    data,
    selectedDriverId,
    selectedJobId,
    didFit,
  ]);

  const handleWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type?: string; kind?: string; id?: string };
      if (msg.type === 'mk' && msg.id) {
        if (msg.kind === 'driver') {
          setSelectedDriverId((prev) => (prev === msg.id ? null : (msg.id ?? null)));
        } else if (msg.kind === 'job') {
          setSelectedJobId((prev) => (prev === msg.id ? null : (msg.id ?? null)));
        }
      }
    } catch {
      /* ignore malformed messages */
    }
  }, []);

  const handleFitAll = useCallback(() => {
    webRef.current?.injectJavaScript('window.__fitAll && window.__fitAll(); true;');
  }, []);

  const handleAssign = useCallback(async () => {
    if (!selectedDriver || !selectedJob) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await api.patch(
        `/api/admin/bookings/${encodeURIComponent(selectedJob.ref)}/assign`,
        { driverId: selectedDriver.id },
      );
      setAssignOpen(false);
      setSelectedDriverId(null);
      setSelectedJobId(null);
      Alert.alert('Job assigned', `#${selectedJob.ref} assigned to ${selectedDriver.name}.`);
      await refresh();
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Could not assign job. Try again.',
      );
    } finally {
      setAssignLoading(false);
    }
  }, [selectedDriver, selectedJob, refresh]);

  const hasPanel = selectedDriver != null || selectedJob != null;
  const showLoadingOverlay = loading && data == null;
  const driverCount = data?.drivers.length ?? 0;
  const jobCount = data?.jobs.length ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Driver Tracking</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleFitAll}
              accessibilityRole="button"
              accessibilityLabel="Fit all markers"
              style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.headerBtnText}>Fit all</Text>
            </Pressable>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Refresh tracking data"
              style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.headerBtnText}>{loading ? 'Updating…' : 'Refresh'}</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close tracking"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>

        {error && data == null ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retryBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Map */}
        <View style={styles.mapWrap}>
          {!token ? (
            <View style={styles.fallback}>
              <Text style={styles.fallbackText}>
                Mapbox token not configured. Set EXPO_PUBLIC_MAPBOX_TOKEN.
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
                  title="Driver tracking map"
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

          {showLoadingOverlay ? (
            <View style={styles.mapOverlay} pointerEvents="none">
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mapOverlayText}>Loading tracking…</Text>
            </View>
          ) : null}

          {data != null && driverCount === 0 && jobCount === 0 ? (
            <View style={styles.mapOverlay} pointerEvents="none">
              <Text style={styles.mapOverlayText}>No driver or job locations</Text>
            </View>
          ) : null}
        </View>

        {/* Filter row */}
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setDriversOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${driverCount} drivers`}
            style={({ pressed }) => [styles.filterBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.filterBtnText}>Drivers ({driverCount})</Text>
          </Pressable>
          <Pressable
            onPress={() => setJobsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${jobCount} jobs`}
            style={({ pressed }) => [styles.filterBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.filterBtnText}>Jobs ({jobCount})</Text>
          </Pressable>
          <Text style={styles.updatedText} numberOfLines={1}>
            {loading
              ? 'Updating…'
              : lastUpdated != null
              ? `Updated ${formatRelative(new Date(lastUpdated).toISOString())}`
              : 'Not yet loaded'}
          </Text>
        </View>

        {/* Legend row */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendLabel}>Available</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
            <Text style={styles.legendLabel}>Busy</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#D97706' }]} />
            <Text style={styles.legendLabel}>Stale GPS</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendLabel}>Unassigned job</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.legendLabel}>Active job</Text>
          </View>
        </View>

        {/* Detail panel */}
        {hasPanel ? (
          <View style={styles.panel}>
            {selectedDriver ? (
              <DriverDetail driver={selectedDriver} distanceToJob={distance} />
            ) : null}
            {selectedJob ? (
              <JobDetail job={selectedJob} distanceFromDriver={distance} />
            ) : null}
            <View style={styles.panelActions}>
              {selectedDriver?.phone ? (
                <Pressable
                  onPress={() => Linking.openURL(`tel:${selectedDriver.phone}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call driver"
                  style={({ pressed }) => [styles.panelBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.panelBtnText}>Call driver</Text>
                </Pressable>
              ) : null}
              {canAssign ? (
                <Pressable
                  onPress={() => { setAssignError(null); setAssignOpen(true); }}
                  accessibilityRole="button"
                  accessibilityLabel="Assign job to driver"
                  style={({ pressed }) => [styles.assignBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.assignBtnText}>
                    Assign {selectedJob?.ref} to {selectedDriver?.name}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => { setSelectedDriverId(null); setSelectedJobId(null); }}
                accessibilityRole="button"
                accessibilityLabel="Clear selection"
                style={({ pressed }) => [styles.panelBtn, pressed && styles.btnPressed]}
              >
                <Text style={styles.panelBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      <DriverListSheet
        visible={driversOpen}
        drivers={data?.drivers ?? []}
        selectedId={selectedDriverId}
        onSelect={(id) => { setSelectedDriverId(id); setDriversOpen(false); }}
        onClose={() => setDriversOpen(false)}
      />

      <JobListSheet
        visible={jobsOpen}
        jobs={data?.jobs ?? []}
        selectedId={selectedJobId}
        onSelect={(id) => { setSelectedJobId(id); setJobsOpen(false); }}
        onClose={() => setJobsOpen(false)}
      />

      <AssignConfirmSheet
        visible={assignOpen}
        driver={selectedDriver}
        job={selectedJob}
        loading={assignLoading}
        error={assignError}
        onConfirm={() => { void handleAssign(); }}
        onClose={() => { setAssignOpen(false); setAssignError(null); }}
      />
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
    gap: space.sm,
  },
  title: { flex: 1, color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  headerBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  closeBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  btnPressed: { opacity: 0.65 },
  btnDisabled: { opacity: 0.45 },
  errorBanner: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  errorBannerText: { flex: 1, color: colors.danger, fontSize: fontSize.sm },
  retryBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBorder,
  },
  retryBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  mapWrap: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  fallbackText: { color: colors.muted, fontSize: fontSize.sm, textAlign: 'center' },
  mapOverlay: {
    position: 'absolute',
    bottom: space.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.sm,
  },
  mapOverlayText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(24,24,27,0.88)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  filterBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  updatedText: { flex: 1, color: colors.subtle, fontSize: fontSize.xs, textAlign: 'right' },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: colors.muted, fontSize: 10 },
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    maxHeight: 300,
  },
  panelActions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  panelBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  panelBtnText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
  assignBtn: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  assignBtnText: { color: colors.accentText, fontSize: fontSize.sm, fontWeight: '700' },
  detailBlock: { gap: 4 },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  detailTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  detailName: { color: colors.text, fontSize: fontSize.sm },
  detailAddress: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16 },
  detailMeta: { color: colors.muted, fontSize: fontSize.xs },
  detailMetaWarn: { color: colors.warning },
  detailPayment: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  detailPaymentWarn: { color: colors.warning },
  detailWarn: { color: colors.warning, fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  detailPillRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  freshPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  freshPillLive: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' },
  freshPillStale: { borderColor: colors.warning, backgroundColor: colors.warningBg },
  freshPillOffline: { borderColor: colors.subtle, backgroundColor: colors.surface },
  freshPillText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statusPillAvailable: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)' },
  statusPillBusy: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.12)' },
  statusPillText: { color: colors.text, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  assignPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  assignPillUnassigned: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.12)' },
  assignPillText: { color: colors.text, fontSize: 10, fontWeight: '700' },
  // Sheets
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '75%',
    paddingBottom: space.lg,
  },
  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  sheetList: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  listItem: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 4,
  },
  listItemSelected: { borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.08)' },
  listItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listItemName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', flex: 1 },
  listItemBadge: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59,130,246,0.1)',
  },
  listItemBadgeUnassigned: {
    color: '#EF4444',
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  listItemMeta: { color: colors.muted, fontSize: fontSize.xs },
  listItemMetaWarn: { color: colors.warning },
  freshDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.subtle },
  freshDotLive: { backgroundColor: '#22c55e' },
  freshDotStale: { backgroundColor: '#D97706' },
  emptyWrap: { paddingVertical: space.xl, alignItems: 'center' },
  emptyText: { color: colors.muted, fontSize: fontSize.sm },
  // Confirm sheet
  confirmTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  confirmBody: { color: colors.text, fontSize: fontSize.md, lineHeight: 22 },
  confirmHighlight: { color: colors.accent, fontWeight: '700' },
  warnBox: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  warnText: { color: colors.warning, fontSize: fontSize.sm },
  errorBox: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  confirmActions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  assignConfirmBtn: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  assignConfirmBtnText: { color: colors.accentText, fontSize: fontSize.md, fontWeight: '700' },
});
