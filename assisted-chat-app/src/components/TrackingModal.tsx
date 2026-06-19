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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius, space } from './theme';
import { api } from '@/lib/api';
import { isValidCoordinate, haversineMiles, formatDistanceMiles } from '@/lib/geo';
import {
  useTracking,
  type TrackingDriver,
  type TrackingJob,
  type TrackingJobsRange,
  type TrackingPaymentSummary,
} from '@/hooks/useTracking';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface WebFrameRef {
  contentWindow?: {
    postMessage: (message: unknown, targetOrigin: string) => void;
  } | null;
}

interface TrackingMapState {
  drivers: Array<{
    id: string;
    name: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    status: TrackingDriver['status'];
    freshness: TrackingDriver['locationFreshness'];
    activeJobRef: string | null;
    lastSeenAt: string | null;
    selected: boolean;
  }>;
  jobs: Array<{
    id: string;
    ref: string;
    status: string;
    customerName: string | null;
    customerPhone: string | null;
    address: string;
    tyreSummary: string | null;
    vehicleSummary: string | null;
    paymentLine: string;
    paymentNeedsCheck: boolean;
    lat: number | null;
    lng: number | null;
    assignmentStatus: TrackingJob['assignmentStatus'];
    selected: boolean;
  }>;
  doFit: boolean;
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
  const amountToCollectPence = payment.amountToCollectPence ?? 0;
  const due =
    amountToCollectPence > 0
      ? formatGbpPence(amountToCollectPence)
      : null;

  if (payment.state === 'paid' && amountToCollectPence === 0) {
    return 'Paid · nothing to collect';
  }
  if (payment.state === 'paid') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.state === 'needs_checking') return due ? `Payment needs checking · ${due}` : 'Payment needs checking';
  if (payment.state === 'failed') return due ? `Payment failed · ${due}` : 'Payment failed';
  if (payment.state === 'cash_to_collect' || payment.method === 'cash') return due ? `Cash to collect: ${due}` : 'Cash to collect';
  if (payment.state === 'balance_due' || payment.state === 'deposit_paid') return due ? `Deposit paid · balance due: ${due}` : 'Deposit paid';
  if (payment.state === 'pending') return due ? `Payment pending · ${due}` : 'Payment pending';
  if (due) return `Amount due: ${due}`;
  return payment.label || 'Confirm payment with driver';
}

function needsPaymentWarning(payment: TrackingPaymentSummary | null): boolean {
  if (!payment) return true;
  return !(payment.state === 'paid' && (payment.amountToCollectPence ?? 0) === 0);
}

function initials(name: string | null | undefined, fallback: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? fallback[0] ?? 'T';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}

function callNumber(phone: string | null | undefined) {
  const cleaned = phone?.trim();
  if (!cleaned) return;
  void Linking.openURL(`tel:${cleaned}`).catch(() => undefined);
}

// ─── Map HTML ────────────────────────────────────────────────────────────────

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

const JOB_RANGE_OPTIONS: Array<{ value: TrackingJobsRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: '7 days' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_year', label: 'Last year' },
];

const ASSIGNABLE_JOB_STATUSES = new Set(['awaiting_payment', 'deposit_paid', 'paid']);

function buildTrackingMapHtml(token: string, initialState: TrackingMapState | null = null): string {
  const initialStateJson = JSON.stringify(initialState).replace(/</g, '\\u003c');
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}
.pin{--pin-color:#9CA3AF;display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;-webkit-user-select:none}
.pcore{position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center}
.pring{position:absolute;top:50%;left:50%;width:16px;height:16px;border-radius:50%;border:2px solid var(--pin-color);transform:translate(-50%,-50%);opacity:0;z-index:1;animation:radar 1.8s ease-out infinite;pointer-events:none}
.pring.r2{animation-delay:.8s}
.pdot{position:relative;z-index:2;width:16px;height:16px;border-radius:50%;background:var(--pin-color);border:2px solid #09090B;transition:background 0.1s;box-shadow:0 2px 6px rgba(0,0,0,.55)}
.pin.sel .pdot{box-shadow:0 2px 6px rgba(0,0,0,.55),0 0 0 3px #FAFAFA}
.plbl{margin-top:3px;font-size:9px;font-weight:700;color:#FAFAFA;background:rgba(9,9,11,0.82);padding:1px 5px;border-radius:3px;white-space:nowrap;max-width:84px;overflow:hidden;text-overflow:ellipsis;font-family:system-ui,sans-serif;line-height:1.4}
@keyframes radar{0%{transform:translate(-50%,-50%) scale(1);opacity:.7}100%{transform:translate(-50%,-50%) scale(3.8);opacity:0}}
@media (prefers-reduced-motion: reduce){.pring{animation:none;transform:translate(-50%,-50%) scale(1.9);opacity:.16}.pring.r2{display:none}}
.mapboxgl-popup{max-width:270px!important}
.mapboxgl-popup-tip{display:none}
.mapboxgl-popup-content{background:transparent;border:0;padding:0;box-shadow:none}
.mapboxgl-popup-close-button{top:4px;right:6px;color:#FAFAFA;font-size:16px;text-shadow:0 1px 2px rgba(0,0,0,.72);z-index:5}
.hub-card{position:relative;min-width:230px;overflow:hidden;isolation:isolate;border-radius:14px;padding:12px 13px;background:linear-gradient(145deg,#2A2A2F 0%,#18181B 48%,#0F0F12 100%);border:1px solid rgba(249,115,22,.48);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -18px 30px rgba(0,0,0,.22),0 14px 28px rgba(0,0,0,.52);transform:perspective(560px) rotateX(4deg);transform-origin:center bottom;font-family:system-ui,sans-serif}
.hub-card:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.10),transparent 38%,rgba(249,115,22,.08));pointer-events:none;z-index:1}
.hub-shimmer{position:absolute;z-index:4;top:-38%;bottom:-38%;left:-120px;width:88px;transform:skewX(-18deg);background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 14%,rgba(255,255,255,.55) 50%,rgba(255,255,255,.08) 86%,transparent 100%);filter:blur(.2px);opacity:.82;mix-blend-mode:screen;pointer-events:none;animation:hubShimmer 1.65s cubic-bezier(.4,0,.2,1) infinite}
.hub-top{position:relative;z-index:2;display:flex;align-items:center;gap:10px;min-width:0}
.hub-avatar{width:38px;height:38px;border-radius:12px;background:linear-gradient(145deg,#F97316,#EA580C);display:flex;align-items:center;justify-content:center;color:#09090B;font-size:14px;font-weight:900;box-shadow:inset 0 1px 0 rgba(255,255,255,.38),0 8px 15px rgba(249,115,22,.22)}
.hub-card.job .hub-avatar{background:linear-gradient(145deg,#60A5FA,#2563EB);box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 8px 15px rgba(37,99,235,.24)}
.hub-copy{min-width:0;flex:1}
.hub-kicker{font-size:9px;font-weight:900;color:#FCD34D;text-transform:uppercase;letter-spacing:0}
.hub-title{font-size:15px;font-weight:900;color:#FAFAFA;line-height:1.16;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px rgba(0,0,0,.85)}
.hub-meta{position:relative;z-index:2;margin-top:8px;color:#D4D4D8;font-size:11px;line-height:1.35}
.hub-warn{color:#FBBF24;font-weight:800}
.hub-pills{position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.hub-pill{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0;padding:3px 7px;border-radius:999px;background:rgba(156,163,175,.14);color:#D4D4D8;border:1px solid rgba(156,163,175,.28)}
.hub-pill.ok{background:rgba(34,197,94,.16);color:#86EFAC;border-color:rgba(34,197,94,.38)}
.hub-pill.warn{background:rgba(245,158,11,.16);color:#FCD34D;border-color:rgba(245,158,11,.38)}
.hub-pill.danger{background:rgba(239,68,68,.16);color:#FCA5A5;border-color:rgba(239,68,68,.38)}
.hub-tools{position:relative;z-index:2;display:flex;gap:7px;margin-top:10px}
.hub-tool{flex:1;min-height:32px;border:1px solid rgba(249,115,22,.58);border-radius:10px;background:rgba(249,115,22,.14);color:#FAFAFA;font-size:11px;font-weight:900;cursor:pointer}
.hub-tool.primary{background:linear-gradient(180deg,#F97316,#EA580C);color:#09090B;border-color:rgba(249,115,22,.78)}
.hub-tool:disabled{opacity:.42;cursor:not-allowed}
@keyframes hubShimmer{0%{left:-120px}100%{left:calc(100% + 120px)}}
@media (prefers-reduced-motion: reduce){.hub-shimmer{animation:hubShimmer 2.4s ease-in-out infinite}.hub-card{transform:none}}
</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken=${JSON.stringify(token)};
var map=new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[-4.2518,55.8642],zoom:11,attributionControl:false});
var MSG_SOURCE='tyrerescue-tracking-map';
var mks={};
var loaded=false,pending=null,didFit=false;
var initialState=${initialStateJson};
function post(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));else if(window.parent&&window.parent!==window)window.parent.postMessage({source:MSG_SOURCE,payload:o},'*');}catch(e){}}
function esc(s){return(s==null?'':String(s)).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
function escAttr(s){return(s==null?'':String(s)).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
function initials(name,fallback){var parts=String(name||'').trim().split(/\\s+/).filter(Boolean);var a=(parts[0]||fallback||'T').charAt(0);var b=(parts[1]||'').charAt(0);return (a+b).toUpperCase();}
function freshnessText(f){if(f==='live')return'Live';if(f==='stale')return'Stale GPS';if(f==='offline')return'Offline';return'Unknown';}
function driverHtml(d){
  var fresh=d.freshness||'unknown';
  var status=d.status||'unknown';
  var freshTone=fresh==='live'?'ok':(fresh==='stale'?'warn':'');
  var statusTone=status==='available'?'ok':(status==='busy'?'warn':'');
  var h='<div class="hub-card driver"><span class="hub-shimmer"></span><div class="hub-top"><div class="hub-avatar">'+esc(initials(d.name,'D'))+'</div><div class="hub-copy"><div class="hub-kicker">Driver</div><div class="hub-title">'+esc(d.name||'Driver')+'</div></div></div>';
  h+='<div class="hub-pills"><span class="hub-pill '+freshTone+'">'+esc(freshnessText(fresh))+'</span><span class="hub-pill '+statusTone+'">'+esc(status)+'</span></div>';
  h+='<div class="hub-meta">';
  if(d.phone)h+=esc(d.phone)+'<br>';
  h+=d.activeJobRef?'Active job: #'+esc(d.activeJobRef):'No active job';
  if(d.lastSeenAt)h+='<br>Last seen: '+esc(d.lastSeenAt);
  h+='</div><div class="hub-tools">';
  h+='<button type="button" class="hub-tool" data-action="call" data-phone="'+escAttr(d.phone||'')+'" '+(!d.phone?'disabled':'')+'>Call</button>';
  h+='<button type="button" class="hub-tool primary" data-action="select" data-kind="driver" data-id="'+escAttr(d.id)+'">Select</button>';
  h+='</div></div>';
  return h;
}
function jobHtml(j){
  var assigned=j.assignmentStatus==='unassigned'?false:true;
  var h='<div class="hub-card job"><span class="hub-shimmer"></span><div class="hub-top"><div class="hub-avatar">J</div><div class="hub-copy"><div class="hub-kicker">Job</div><div class="hub-title">#'+esc(j.ref||'Job')+'</div></div></div>';
  h+='<div class="hub-pills"><span class="hub-pill '+(!assigned?'danger':'ok')+'">'+esc(!assigned?'Unassigned':'Assigned')+'</span><span class="hub-pill '+(j.paymentNeedsCheck?'warn':'ok')+'">'+esc(j.paymentNeedsCheck?'Check payment':'Paid')+'</span></div>';
  h+='<div class="hub-meta">';
  if(j.customerName)h+=esc(j.customerName)+'<br>';
  h+=esc(j.address||'No address');
  if(j.tyreSummary)h+='<br>'+esc(j.tyreSummary);
  if(j.vehicleSummary)h+='<br>'+esc(j.vehicleSummary);
  h+='<br><span class="'+(j.paymentNeedsCheck?'hub-warn':'')+'">'+esc(j.paymentLine||'Payment needs checking')+'</span>';
  h+='</div><div class="hub-tools">';
  h+='<button type="button" class="hub-tool" data-action="call" data-phone="'+escAttr(j.customerPhone||'')+'" '+(!j.customerPhone?'disabled':'')+'>Call customer</button>';
  h+='<button type="button" class="hub-tool primary" data-action="select" data-kind="job" data-id="'+escAttr(j.id)+'">Select job</button>';
  h+='</div></div>';
  return h;
}
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
  el.className='pin'+(sel?' sel':'');
  el.style.setProperty('--pin-color',color);
  var core=document.createElement('div');
  core.className='pcore';
  var ring1=document.createElement('span');
  ring1.className='pring';
  var ring2=document.createElement('span');
  ring2.className='pring r2';
  var dot=document.createElement('div');
  dot.className='pdot';
  var lbl=document.createElement('div');
  lbl.className='plbl';
  lbl.textContent=esc(label);
  core.appendChild(ring1);
  core.appendChild(ring2);
  core.appendChild(dot);
  el.appendChild(core);
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
      mks[d.id].el.style.setProperty('--pin-color',color);
      mks[d.id].el.classList.toggle('sel',sel);
      if(mks[d.id].popup)mks[d.id].popup.setHTML(driverHtml(d));
      var lbl=mks[d.id].el.querySelector('.plbl');
      if(lbl)lbl.textContent=esc(label);
    }else{
      var el=makeEl(color,label,sel);
      (function(id){addClick(el,'driver',id);})(d.id);
      var pop=new mapboxgl.Popup({offset:24,closeButton:true,className:'hub-pop'}).setHTML(driverHtml(d));
      var mk=new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([d.lng,d.lat]).setPopup(pop).addTo(map);
      mks[d.id]={marker:mk,el:el,popup:pop};
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
      mks[jb.id].el.style.setProperty('--pin-color',color);
      mks[jb.id].el.classList.toggle('sel',sel);
      if(mks[jb.id].popup)mks[jb.id].popup.setHTML(jobHtml(jb));
      var lbl=mks[jb.id].el.querySelector('.plbl');
      if(lbl)lbl.textContent=esc(label);
    }else{
      var el=makeEl(color,label,sel);
      (function(id){addClick(el,'job',id);})(jb.id);
      var pop=new mapboxgl.Popup({offset:24,closeButton:true,className:'hub-pop'}).setHTML(jobHtml(jb));
      var mk=new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([jb.lng,jb.lat]).setPopup(pop).addTo(map);
      mks[jb.id]={marker:mk,el:el,popup:pop};
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
function receiveState(s){if(!s)return;if(loaded)apply(s);else pending=s;}
window.__applyState=function(json){
  try{receiveState(JSON.parse(json));}catch(e){}
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
document.addEventListener('click',function(e){
  var btn=e.target&&e.target.closest?e.target.closest('.hub-tool'):null;
  if(!btn)return;
  e.preventDefault();
  e.stopPropagation();
  var action=btn.getAttribute('data-action')||'';
  if(action==='call'){
    var phone=btn.getAttribute('data-phone')||'';
    if(phone)post({type:'call',phone:phone});
  }else if(action==='select'){
    post({type:'mk',kind:btn.getAttribute('data-kind')||'',id:btn.getAttribute('data-id')||''});
  }
});
window.addEventListener('message',function(event){
  try{
    var msg=event.data||{};
    if(msg.source!==MSG_SOURCE)return;
    if(msg.type==='state')receiveState(msg.state);
    else if(msg.type==='cmd'&&msg.name==='fit')window.__fitAll&&window.__fitAll();
  }catch(e){}
});
map.on('load',function(){loaded=true;if(pending){apply(pending);pending=null;}else if(initialState){apply(initialState);}});
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
      <View style={styles.cardBadgeTop}>
        <View style={[styles.cardAvatar3d, styles.driverAvatar3d]}>
          <Text style={styles.cardAvatarText}>{initials(driver.name, 'D')}</Text>
        </View>
        <View style={styles.cardBadgeCopy}>
          <Text style={styles.cardKicker}>Driver</Text>
          <Text style={styles.detailTitle} numberOfLines={1}>{driver.name}</Text>
        </View>
      </View>
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
        <View style={styles.cardBadgeTop}>
          <View style={[styles.cardAvatar3d, styles.jobAvatar3d]}>
            <Text style={styles.cardAvatarText}>J</Text>
          </View>
          <View style={styles.cardBadgeCopy}>
            <Text style={styles.cardKicker}>Job</Text>
            <Text style={styles.detailTitle}>#{job.ref}</Text>
          </View>
        </View>
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
              const hasPhone = Boolean(item.phone?.trim());
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
                  <View style={styles.cardBadge3d}>
                    <View style={styles.cardBadgeTop}>
                      <View style={[styles.cardAvatar3d, styles.driverAvatar3d]}>
                        <Text style={styles.cardAvatarText}>{initials(item.name, 'D')}</Text>
                      </View>
                      <View style={styles.cardBadgeCopy}>
                        <Text style={styles.cardKicker}>Driver</Text>
                        <Text style={styles.listItemName} numberOfLines={1}>{item.name}</Text>
                      </View>
                      <View style={[
                        styles.freshDot,
                        item.locationFreshness === 'live' && styles.freshDotLive,
                        item.locationFreshness === 'stale' && styles.freshDotStale,
                      ]} />
                    </View>
                    <View style={styles.cardMiniRow}>
                      <Text style={[styles.cardMiniPill, item.status === 'available' && styles.cardMiniPillOk]}>
                        {item.status}
                      </Text>
                      <Text style={[styles.cardMiniPill, isStale && styles.cardMiniPillWarn]}>
                        {freshnessLabel(item.locationFreshness)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.listItemMeta, isStale && styles.listItemMetaWarn]}>
                    {item.activeJobRef ? `Active job: #${item.activeJobRef}` : 'No active job'}
                    {item.lastSeenAt ? ` · ${formatRelative(item.lastSeenAt)}` : ' · no GPS'}
                  </Text>
                  {item.lat == null ? (
                    <Text style={styles.listItemMeta}>Location unavailable</Text>
                  ) : null}
                  <View style={styles.cardToolsRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        callNumber(item.phone);
                      }}
                      disabled={!hasPhone}
                      accessibilityRole="button"
                      accessibilityLabel={`Call driver ${item.name}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        styles.cardToolBtnCall,
                        !hasPhone && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>Call</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onSelect(item.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use driver ${item.name}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        isSelected && styles.cardToolBtnSelected,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>{isSelected ? 'Selected' : 'Select'}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DriverRosterProps {
  drivers: TrackingDriver[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenAll: () => void;
}

function DriverRoster({ drivers, selectedId, onSelect, onOpenAll }: DriverRosterProps) {
  if (drivers.length === 0) {
    return (
      <View style={styles.driverRosterEmpty}>
        <Text style={styles.driverRosterTitle}>Drivers</Text>
        <Text style={styles.driverRosterEmptyText}>No drivers found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.driverRoster}>
      <View style={styles.driverRosterHeader}>
        <View>
          <Text style={styles.driverRosterTitle}>Drivers as individuals</Text>
          <Text style={styles.driverRosterSubtitle}>
            Select a driver to inspect, call, or assign a job.
          </Text>
        </View>
        <Pressable
          onPress={onOpenAll}
          accessibilityRole="button"
          accessibilityLabel="Open all drivers"
          style={({ pressed }) => [styles.driverRosterAllBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.driverRosterAllText}>All drivers</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.driverRosterScroll}
      >
        {drivers.map((driver) => {
          const selected = driver.id === selectedId;
          const stale = driver.locationFreshness === 'stale' || driver.locationFreshness === 'offline';
          const live = driver.locationFreshness === 'live';
          return (
            <Pressable
              key={driver.id}
              onPress={() => onSelect(driver.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open driver ${driver.name}`}
              style={({ pressed }) => [
                styles.driverRosterCard,
                selected && styles.driverRosterCardSelected,
                pressed && styles.btnPressed,
              ]}
            >
              <View style={styles.driverRosterCardTop}>
                <View style={[
                  styles.driverRosterAvatar,
                  live && styles.driverRosterAvatarLive,
                  stale && styles.driverRosterAvatarStale,
                ]}>
                  <Text style={styles.driverRosterAvatarText}>{initials(driver.name, 'D')}</Text>
                </View>
                <View style={styles.driverRosterCopy}>
                  <Text style={styles.driverRosterName} numberOfLines={1}>{driver.name}</Text>
                  <Text style={[styles.driverRosterMeta, stale && styles.driverRosterMetaWarn]} numberOfLines={1}>
                    {freshnessLabel(driver.locationFreshness)}
                    {driver.lastSeenAt ? ` · ${formatRelative(driver.lastSeenAt)}` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.driverRosterPillRow}>
                <Text style={[
                  styles.driverRosterPill,
                  driver.status === 'available' && styles.driverRosterPillAvailable,
                  driver.status === 'busy' && styles.driverRosterPillBusy,
                ]}>
                  {driver.status}
                </Text>
                <Text style={styles.driverRosterPill}>
                  {driver.activeJobRef ? `#${driver.activeJobRef}` : 'No job'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
              const hasPhone = Boolean(item.customerPhone?.trim());
              const paymentNeedsCheck = needsPaymentWarning(item.paymentSummary);
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
                  <View style={styles.cardBadge3d}>
                    <View style={styles.cardBadgeTop}>
                      <View style={[styles.cardAvatar3d, styles.jobAvatar3d]}>
                        <Text style={styles.cardAvatarText}>J</Text>
                      </View>
                      <View style={styles.cardBadgeCopy}>
                        <Text style={styles.cardKicker}>Job</Text>
                        <Text style={styles.listItemName}>#{item.ref}</Text>
                      </View>
                      <Text style={[
                        styles.listItemBadge,
                        item.assignmentStatus === 'unassigned' && styles.listItemBadgeUnassigned,
                      ]}>
                        {item.assignmentStatus === 'unassigned' ? 'Unassigned' : 'Assigned'}
                      </Text>
                    </View>
                    <View style={styles.cardMiniRow}>
                      <Text style={[styles.cardMiniPill, item.assignmentStatus === 'unassigned' && styles.cardMiniPillDanger]}>
                        {item.status.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.cardMiniPill, paymentNeedsCheck ? styles.cardMiniPillWarn : styles.cardMiniPillOk]}>
                        {paymentNeedsCheck ? 'Check payment' : 'Paid'}
                      </Text>
                    </View>
                  </View>
                  {item.customerName ? (
                    <Text style={styles.listItemMeta} numberOfLines={1}>{item.customerName}</Text>
                  ) : null}
                  <Text style={styles.listItemMeta} numberOfLines={1}>{item.address}</Text>
                  <Text style={[
                    styles.listItemMeta,
                    paymentNeedsCheck && styles.listItemMetaWarn,
                  ]}>
                    {paymentLine(item.paymentSummary)}
                  </Text>
                  <View style={styles.cardToolsRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        callNumber(item.customerPhone);
                      }}
                      disabled={!hasPhone}
                      accessibilityRole="button"
                      accessibilityLabel={`Call customer for job ${item.ref}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        styles.cardToolBtnCall,
                        !hasPhone && styles.btnDisabled,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>Call customer</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        onSelect(item.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use job ${item.ref}`}
                      style={({ pressed }) => [
                        styles.cardToolBtn,
                        isSelected && styles.cardToolBtnSelected,
                        pressed && styles.btnPressed,
                      ]}
                    >
                      <Text style={styles.cardToolText}>{isSelected ? 'Selected' : 'Select job'}</Text>
                    </Pressable>
                  </View>
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
  const [jobsRange, setJobsRange] = useState<TrackingJobsRange>('today');
  const { data, loading, error, lastUpdated, refresh } = useTracking(visible, jobsRange);
  const insets = useSafeAreaInsets();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [driversOpen, setDriversOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [didFit, setDidFit] = useState(false);

  const webRef = useRef<WebView>(null);
  const webFrameRef = useRef<WebFrameRef | null>(null);
  const token = useMemo(() => getMapboxToken(), []);

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

  useEffect(() => {
    setSelectedJobId(null);
    setAssignOpen(false);
    setAssignError(null);
    setDidFit(false);
  }, [jobsRange]);

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

  const mapState = useMemo<TrackingMapState>(() => {
    const driverMarkers = (data?.drivers ?? [])
      .filter((d) => isValidCoordinate(d.lat, d.lng))
      .map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        lat: d.lat,
        lng: d.lng,
        status: d.status,
        freshness: d.locationFreshness,
        activeJobRef: d.activeJobRef,
        lastSeenAt: d.lastSeenAt ? formatRelative(d.lastSeenAt) : null,
        selected: d.id === selectedDriverId,
      }));
    const jobMarkers = (data?.jobs ?? [])
      .filter((j) => isValidCoordinate(j.lat, j.lng))
      .map((j) => ({
        id: j.id,
        ref: j.ref,
        status: j.status,
        customerName: j.customerName,
        customerPhone: j.customerPhone,
        address: j.address,
        tyreSummary: j.tyreSummary,
        vehicleSummary: j.vehicleSummary,
        paymentLine: paymentLine(j.paymentSummary),
        paymentNeedsCheck: needsPaymentWarning(j.paymentSummary),
        lat: j.lat,
        lng: j.lng,
        assignmentStatus: j.assignmentStatus,
        selected: j.id === selectedJobId,
      }));
    return {
      drivers: driverMarkers,
      jobs: jobMarkers,
      doFit: !didFit && (driverMarkers.length > 0 || jobMarkers.length > 0),
    };
  }, [data, didFit, selectedDriverId, selectedJobId]);

  const html = useMemo(() => (token ? buildTrackingMapHtml(token) : ''), [token]);

  const postMapStateToWebFrame = useCallback(() => {
    webFrameRef.current?.contentWindow?.postMessage(
      { source: 'tyrerescue-tracking-map', type: 'state', state: mapState },
      '*',
    );
  }, [mapState]);

  const canAssign =
    selectedDriver != null &&
    selectedJob != null &&
    selectedJob.assignmentStatus === 'unassigned' &&
    ASSIGNABLE_JOB_STATUSES.has(selectedJob.status);

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
    if (mapState.doFit) setDidFit(true);
    if (Platform.OS === 'web') {
      postMapStateToWebFrame();
      return;
    }
    const json = JSON.stringify(mapState).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    visible,
    token,
    mapState,
    postMapStateToWebFrame,
  ]);

  const handleWebMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type?: string; kind?: string; id?: string; phone?: string };
      if (msg.type === 'call' && msg.phone?.trim()) {
        callNumber(msg.phone);
        return;
      }
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

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleIframeMessage = (event: MessageEvent) => {
      const message = event.data as { source?: string; payload?: unknown };
      if (!message || message.source !== 'tyrerescue-tracking-map') return;
      handleWebMessage(JSON.stringify(message.payload ?? {}));
    };
    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [handleWebMessage, visible]);

  const handleFitAll = useCallback(() => {
    if (Platform.OS === 'web') {
      webFrameRef.current?.contentWindow?.postMessage(
        { source: 'tyrerescue-tracking-map', type: 'cmd', name: 'fit' },
        '*',
      );
      return;
    }
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
  const panelBottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 0) + space.sm;

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
          <View style={styles.headerTitleBlock}>
            <Text style={styles.title} numberOfLines={1}>Tracking hub</Text>
            <Text style={styles.subtitle} numberOfLines={1}>All drivers and dispatch jobs</Text>
          </View>
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
                ref?: React.Ref<WebFrameRef>;
                onLoad?: () => void;
              }>;
              return (
                <Iframe
                  ref={webFrameRef}
                  onLoad={postMapStateToWebFrame}
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
            <View style={[styles.mapOverlay, styles.noPointerEvents]}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.mapOverlayText}>Loading tracking…</Text>
            </View>
          ) : null}

          {data != null && driverCount === 0 && jobCount === 0 ? (
            <View style={[styles.mapOverlay, styles.noPointerEvents]}>
              <Text style={styles.mapOverlayText}>No driver or job locations</Text>
            </View>
          ) : null}
        </View>

        {/* Filter row */}
        <View style={styles.jobRangeRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.jobRangeContent}
          >
            {JOB_RANGE_OPTIONS.map((option) => {
              const selected = jobsRange === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setJobsRange(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${option.label} jobs`}
                  style={({ pressed }) => [
                    styles.rangeChip,
                    selected && styles.rangeChipActive,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text style={[styles.rangeChipText, selected && styles.rangeChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

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
            <Text style={styles.legendLabel}>Assigned job</Text>
          </View>
        </View>

        {data ? (
          <DriverRoster
            drivers={data.drivers}
            selectedId={selectedDriverId}
            onSelect={setSelectedDriverId}
            onOpenAll={() => setDriversOpen(true)}
          />
        ) : null}

        {/* Detail panel */}
        {hasPanel ? (
          <View style={[styles.panel, { paddingBottom: panelBottomPadding }]}>
            <ScrollView
              style={styles.panelScroll}
              contentContainerStyle={styles.panelScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedDriver ? (
                <DriverDetail driver={selectedDriver} distanceToJob={distance} />
              ) : null}
              {selectedJob ? (
                <JobDetail job={selectedJob} distanceFromDriver={distance} />
              ) : null}
            </ScrollView>
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
  headerTitleBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { marginTop: 2, color: colors.muted, fontSize: fontSize.xs, fontWeight: '600' },
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
  noPointerEvents: {
    pointerEvents: 'none',
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
  jobRangeRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  jobRangeContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  rangeChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.14)',
  },
  rangeChipText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rangeChipTextActive: {
    color: colors.text,
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
  driverRoster: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  driverRosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  driverRosterTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  driverRosterSubtitle: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  driverRosterAllBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  driverRosterAllText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  driverRosterScroll: {
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  driverRosterCard: {
    width: 214,
    minHeight: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.sm,
    gap: space.sm,
  },
  driverRosterCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  driverRosterCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  driverRosterAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  driverRosterAvatarLive: {
    backgroundColor: '#16A34A',
    borderColor: '#86EFAC',
  },
  driverRosterAvatarStale: {
    backgroundColor: '#92400E',
    borderColor: '#FCD34D',
  },
  driverRosterAvatarText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  driverRosterCopy: { flex: 1, minWidth: 0 },
  driverRosterName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  driverRosterMeta: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  driverRosterMetaWarn: { color: colors.warning },
  driverRosterPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  driverRosterPill: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  driverRosterPillAvailable: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.14)',
  },
  driverRosterPillBusy: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.14)',
  },
  driverRosterEmpty: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  driverRosterEmptyText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    maxHeight: '48%',
  },
  panelScroll: {
    flexShrink: 1,
  },
  panelScrollContent: {
    gap: space.sm,
    paddingBottom: space.xs,
  },
  panelActions: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexShrink: 0,
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
  detailBlock: {
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: space.md,
    ...Platform.select({
      web: { boxShadow: '0 8px 14px rgba(0,0,0,0.24)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.24,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
      },
    }),
  },
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
  cardBadge3d: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.38)',
    backgroundColor: '#202024',
    padding: space.sm,
    gap: space.xs,
    ...Platform.select({
      web: { boxShadow: '0 9px 14px rgba(0,0,0,0.28)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 9 },
        elevation: 6,
      },
    }),
    transform: [{ perspective: 650 }, { rotateX: '1deg' }],
  },
  cardBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  cardAvatar3d: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0 6px 10px rgba(0,0,0,0.28)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
      },
    }),
  },
  driverAvatar3d: {
    backgroundColor: '#F97316',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  jobAvatar3d: {
    backgroundColor: '#2563EB',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  cardAvatarText: {
    color: '#09090B',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  cardBadgeCopy: {
    flex: 1,
    minWidth: 0,
  },
  cardKicker: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  cardMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardMiniPill: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.72)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  cardMiniPillOk: {
    color: '#86EFAC',
    borderColor: 'rgba(34,197,94,0.36)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  cardMiniPillWarn: {
    color: colors.warning,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningBg,
  },
  cardMiniPillDanger: {
    color: '#FCA5A5',
    borderColor: 'rgba(239,68,68,0.38)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cardToolsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  cardToolBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  cardToolBtnCall: {
    borderColor: 'rgba(249,115,22,0.42)',
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  cardToolBtnSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.2)',
  },
  cardToolText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
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
    backgroundColor: '#121216',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
    ...Platform.select({
      web: { boxShadow: '0 8px 12px rgba(0,0,0,0.18)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      },
    }),
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
