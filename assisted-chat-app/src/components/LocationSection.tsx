import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { copyToClipboard } from '@/lib/clipboard';
import { extractPostcode, getMapboxToken, searchMapboxAddress, type MapboxFeature } from '@/lib/mapbox';
import { isValidUkPhone } from '@/lib/money';
import type { AssistedChatDraft, AssistedChatLocationMethod } from '@/types/assisted-chat';
import type { LocationShareMessage, LocationShareMethod, LocationShareProgress } from '@/hooks/useAssistedChatLocationShare';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';
import { AppIcon } from './icons/AppIcon';

const GARAGE_LOCATION = { lat: 55.8547, lng: -4.2206 } as const;
const ROUTE_MAP_MESSAGE_SOURCE = 'tyrerescue-location-route-map';

interface MapPoint {
  lat: number;
  lng: number;
}

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

function formatRouteDuration(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;

  const totalMinutes = Math.max(0, Math.round(minutes));
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const hourText = hours === 1 ? '1 hour' : `${hours} hours`;

  return remainingMinutes > 0 ? `${hourText} ${remainingMinutes} min` : hourText;
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

interface RouteMapState {
  garage: [number, number];
  customer: [number, number];
  route: [number, number][];
  routeApproximate: boolean;
  summaryText: string;
  distanceText: string | null;
  etaText: string | null;
  customerAddress: string | null;
}

type RouteMapCommand = 'fit' | 'zoomIn' | 'zoomOut';

function decodePolyline(encoded: string): MapPoint[] {
  const points: MapPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 100000, lng: lng / 100000 });
  }

  return points;
}

function buildRouteMapHtml(token: string, state: RouteMapState): string {
  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.mapboxgl-canvas{outline:none}
.mapboxgl-popup{max-width:270px!important}
.mapboxgl-popup-tip{display:none}
.mapboxgl-popup-content{background:transparent;border:0;padding:0;box-shadow:none}
.mapboxgl-popup-close-button{top:5px;right:7px;color:#FAFAFA;font-size:18px;text-shadow:0 1px 2px rgba(0,0,0,.8);z-index:5}
.pin{--pin-color:#F97316;display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;-webkit-user-select:none;filter:drop-shadow(0 8px 14px rgba(0,0,0,.42))}
.pin-core{position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center}
.pin-ring{position:absolute;top:50%;left:50%;width:18px;height:18px;border-radius:50%;border:2px solid var(--pin-color);transform:translate(-50%,-50%);opacity:0;z-index:1;animation:radar 1.8s ease-out infinite;pointer-events:none}
.pin-ring.r2{animation-delay:.8s}
.pin-dot{position:relative;z-index:2;width:18px;height:18px;border-radius:50%;background:var(--pin-color);border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,.55)}
.pin-label{margin-top:3px;font-size:10px;font-weight:900;color:#FAFAFA;background:rgba(9,9,11,.84);padding:2px 6px;border-radius:6px;line-height:1.25;white-space:nowrap}
@keyframes radar{0%{transform:translate(-50%,-50%) scale(1);opacity:.74}100%{transform:translate(-50%,-50%) scale(3.7);opacity:0}}
@media (prefers-reduced-motion:reduce){.pin-ring{animation:none;transform:translate(-50%,-50%) scale(1.9);opacity:.18}.pin-ring.r2{display:none}}
.route-card{position:relative;min-width:230px;overflow:hidden;isolation:isolate;border-radius:15px;padding:13px 14px;background:linear-gradient(145deg,#2A2A2F 0%,#18181B 48%,#0F0F12 100%);border:1px solid rgba(249,115,22,.52);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -18px 30px rgba(0,0,0,.22),0 14px 28px rgba(0,0,0,.52);transform:perspective(560px) rotateX(4deg);transform-origin:center bottom;color:#FAFAFA}
.route-card:before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.10),transparent 38%,rgba(249,115,22,.08));pointer-events:none;z-index:1}
.route-shimmer{position:absolute;z-index:4;top:-38%;bottom:-38%;left:-120px;width:88px;transform:skewX(-18deg);background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 14%,rgba(255,255,255,.55) 50%,rgba(255,255,255,.08) 86%,transparent 100%);filter:blur(.2px);opacity:.82;mix-blend-mode:screen;pointer-events:none;animation:routeShimmer 1.65s cubic-bezier(.4,0,.2,1) infinite}
.route-top{position:relative;z-index:2;display:flex;align-items:center;gap:10px}
.route-avatar{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,var(--badge-color),#111827);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 15px rgba(0,0,0,.25);font-weight:900;color:#09090B}
.route-copy{min-width:0;flex:1}
.route-kicker{font-size:9px;font-weight:900;text-transform:uppercase;color:#FCD34D}
.route-title{font-size:16px;font-weight:900;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px rgba(0,0,0,.85)}
.route-meta{position:relative;z-index:2;margin-top:8px;color:#D4D4D8;font-size:12px;line-height:1.4}
.route-pill{position:relative;z-index:2;display:inline-flex;align-items:center;gap:6px;margin-top:9px;border-radius:999px;background:rgba(34,197,94,.16);color:#BBF7D0;border:1px solid rgba(34,197,94,.38);padding:4px 8px;font-size:10px;font-weight:900;text-transform:uppercase}
.route-pill:before{content:"";width:7px;height:7px;border-radius:50%;background:#22C55E}
@keyframes routeShimmer{0%{left:-120px}100%{left:calc(100% + 120px)}}
@media (prefers-reduced-motion:reduce){.route-shimmer{animation:routeShimmer 2.4s ease-in-out infinite}.route-card{transform:none}}
</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken=${JSON.stringify(token)};
var MSG_SOURCE=${JSON.stringify(ROUTE_MAP_MESSAGE_SOURCE)};
var state=${stateJson};
var center=state.customer||state.garage||[-4.2518,55.8642];
var loaded=false;
var map=new mapboxgl.Map({
  container:'m',
  style:'mapbox://styles/mapbox/dark-v11',
  center:center,
  zoom:13,
  minZoom:4,
  maxZoom:19,
  attributionControl:false,
  dragRotate:false,
  pitchWithRotate:false,
  scrollZoom:true,
  boxZoom:true,
  dragPan:true,
  keyboard:true,
  doubleClickZoom:true,
  touchZoomRotate:true
});
map.on('error',function(event){
  var err=event&&event.error;
  var msg=err&&err.message?String(err.message):String(err||'');
  if(/Failed to fetch|vector\\.pbf|api\\.mapbox\\.com/i.test(msg))return;
  try{console.warn('[route-map]',msg);}catch(e){}
});
function esc(s){return(s==null?'':String(s)).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c;});}
function pin(color,label){var el=document.createElement('div');el.className='pin';el.style.setProperty('--pin-color',color);el.innerHTML='<div class="pin-core"><span class="pin-ring"></span><span class="pin-ring r2"></span><span class="pin-dot"></span></div><div class="pin-label">'+esc(label)+'</div>';return el;}
function popup(kind,title,meta,color){return '<div class="route-card" style="--badge-color:'+color+'"><span class="route-shimmer"></span><div class="route-top"><div class="route-avatar">'+esc(kind.charAt(0))+'</div><div class="route-copy"><div class="route-kicker">'+esc(kind)+'</div><div class="route-title">'+esc(title)+'</div></div></div><div class="route-meta">'+esc(meta)+'</div><div class="route-pill">Live point</div></div>';}
function routeFeature(coords){return{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}};}
var routeFlowFrame=null;
function segmentLength(a,b){
  var lat=(a[1]+b[1])/2*Math.PI/180;
  var dx=(b[0]-a[0])*Math.cos(lat);
  var dy=b[1]-a[1];
  return Math.sqrt(dx*dx+dy*dy);
}
function buildMeasures(coords){
  var measures=[0],total=0;
  for(var i=1;i<coords.length;i++){total+=segmentLength(coords[i-1],coords[i]);measures.push(total);}
  return{measures:measures,total:total};
}
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
function startRouteFlow(coords){
  if(routeFlowFrame)cancelAnimationFrame(routeFlowFrame);
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
function addRoute(coords,approx){
  if(!coords||coords.length<2)return;
  map.addSource('route',{type:'geojson',data:routeFeature(coords)});
  map.addLayer({id:'route-shadow',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#000000','line-width':13,'line-opacity':.34}});
  map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':8,'line-opacity':approx ? .34 : .95}});
  map.addLayer({id:'route-line',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':approx?'#FDBA74':'#F97316','line-width':4.6,'line-opacity':1,'line-dasharray':approx?[2,1.5]:[1,0]}});
  map.addSource('route-flow',{type:'geojson',data:routeFeature([coords[0],coords[0]])});
  map.addLayer({id:'route-flow-glow',type:'line',source:'route-flow',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FDE68A','line-width':11,'line-opacity':.34,'line-blur':2.2}});
  map.addLayer({id:'route-flow-line',type:'line',source:'route-flow',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':4.8,'line-opacity':.96}});
  startRouteFlow(coords);
}
function fitRoute(duration){
  var pts=[];
  if(state.route&&state.route.length){for(var i=0;i<state.route.length;i++)pts.push(state.route[i]);}
  if(state.garage)pts.push(state.garage);
  if(state.customer)pts.push(state.customer);
  if(!pts.length)return;
  if(pts.length===1){map.easeTo({center:pts[0],zoom:14,duration:duration||0});return;}
  var b=new mapboxgl.LngLatBounds();
  for(var j=0;j<pts.length;j++)b.extend(pts[j]);
  map.fitBounds(b,{padding:{top:82,bottom:88,left:72,right:72},maxZoom:15.5,duration:duration||0});
}
window.__cmd=function(name){
  if(!loaded)return;
  if(name==='fit')fitRoute(500);
  else if(name==='zoomIn')map.zoomIn({duration:220});
  else if(name==='zoomOut')map.zoomOut({duration:220});
};
window.addEventListener('message',function(event){
  try{var msg=event.data||{};if(msg.source!==MSG_SOURCE||msg.type!=='cmd')return;window.__cmd(msg.name);}catch(e){}
});
map.on('load',function(){
  loaded=true;
  addRoute(state.route,state.routeApproximate);
  new mapboxgl.Marker({element:pin('#F97316','Garage'),anchor:'center'}).setLngLat(state.garage).setPopup(new mapboxgl.Popup({offset:22,closeButton:true}).setHTML(popup('Garage','Tyre Rescue Garage',state.summaryText,'#F97316'))).addTo(map);
  new mapboxgl.Marker({element:pin('#22C55E','Customer'),anchor:'center'}).setLngLat(state.customer).setPopup(new mapboxgl.Popup({offset:22,closeButton:true}).setHTML(popup('Customer','Customer location',state.customerAddress||'Confirmed coordinates','#22C55E'))).addTo(map);
  requestAnimationFrame(function(){map.resize();fitRoute(0);});
});
</script></body></html>`;
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
  const [mapExpanded, setMapExpanded] = useState(false);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const routeMapWebRef = useRef<WebView>(null);
  const routeMapFrameRef = useRef<{
    contentWindow?: { postMessage: (message: unknown, targetOrigin: string) => void } | null;
  } | null>(null);
  const routeFetchInFlightRef = useRef(false);
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
      ...(draft.quote ? { quote: null, priceNeedsRefresh: true, paymentChoice: null, paymentLink: null, dispatchedRefNumber: null, dispatchedBookingId: null } : {}),
    });
    setMessage(null);
  };

  const handleAskCustomerPress = () => {
    setMethod('link');
    setSendOptionsOpen(true);
  };

  const handleSendLocationRequest = useCallback(
    async (method: LocationShareMethod) => {
      await requestLink(method);
      setSendOptionsOpen(false);
    },
    [requestLink],
  );

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
      dispatchedBookingId: null,
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
      dispatchedBookingId: null,
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
  const fetchGarageRoute = useCallback(async (options: { showLoading?: boolean } = {}) => {
    if (!mapToken || draft.location.lat == null || draft.location.lng == null) {
      setRouteInfo({ encodedPolyline: null, drivingKm: null, drivingMinutes: null });
      return;
    }
    if (routeFetchInFlightRef.current) return;

    routeFetchInFlightRef.current = true;
    const showLoading = options.showLoading !== false;
    if (showLoading) setRouteLoading(true);
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
      const nextRouteInfo = {
        encodedPolyline: route?.geometry ?? null,
        drivingKm: typeof route?.distance === 'number' ? route.distance / 1000 : null,
        drivingMinutes: typeof route?.duration === 'number' ? Math.round(route.duration / 60) : null,
      };
      setRouteInfo((current) => {
        if (
          current.encodedPolyline === nextRouteInfo.encodedPolyline &&
          current.drivingMinutes === nextRouteInfo.drivingMinutes &&
          current.drivingKm === nextRouteInfo.drivingKm
        ) {
          return current;
        }
        return nextRouteInfo;
      });
    } catch {
      setRouteInfo({ encodedPolyline: null, drivingKm: null, drivingMinutes: null });
    } finally {
      routeFetchInFlightRef.current = false;
      if (showLoading) setRouteLoading(false);
    }
  }, [draft.location.lat, draft.location.lng, mapToken]);

  useEffect(() => {
    void fetchGarageRoute();
    if (!hasCoords || !mapToken) return;

    const interval = setInterval(() => {
      void fetchGarageRoute({ showLoading: false });
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchGarageRoute, hasCoords, mapToken]);

  const distanceKm = routeInfo.drivingKm ?? draft.quote?.distanceKm ?? null;
  const distanceMiles = distanceKm != null ? distanceKm * 0.621371 : null;
  const eta = routeInfo.drivingMinutes ?? draft.quote?.serviceOrigin?.etaMinutes ?? null;
  const routeDistanceText = distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : null;
  const routeEtaText = formatRouteDuration(eta);
  const routeSummaryText = routeLoading
    ? 'Updating route...'
    : [routeEtaText, routeDistanceText].filter(Boolean).join(' / ') || 'Route preview';
  const routeCoordinates = useMemo<[number, number][]>(() => {
    if (!hasCoords) return [];
    const customerPoint = { lat: draft.location.lat!, lng: draft.location.lng! };
    const decodedRoute = routeInfo.encodedPolyline ? decodePolyline(routeInfo.encodedPolyline) : [];
    const points = decodedRoute.length >= 2 ? [...decodedRoute] : [GARAGE_LOCATION, customerPoint];
    if (points.length >= 2) {
      const first = points[0];
      const last = points[points.length - 1];
      const firstToGarage = Math.hypot(first.lat - GARAGE_LOCATION.lat, first.lng - GARAGE_LOCATION.lng);
      const lastToGarage = Math.hypot(last.lat - GARAGE_LOCATION.lat, last.lng - GARAGE_LOCATION.lng);
      if (lastToGarage < firstToGarage) points.reverse();
    }
    return points.map((point) => [point.lng, point.lat]);
  }, [draft.location.lat, draft.location.lng, hasCoords, routeInfo.encodedPolyline]);
  const routeMapState = useMemo<RouteMapState | null>(() => {
    if (!hasCoords) return null;
    return {
      garage: [GARAGE_LOCATION.lng, GARAGE_LOCATION.lat],
      customer: [draft.location.lng!, draft.location.lat!],
      route: routeCoordinates,
      routeApproximate: !routeInfo.encodedPolyline,
      summaryText: routeSummaryText,
      distanceText: routeDistanceText,
      etaText: routeEtaText,
      customerAddress: draft.location.address.trim() || null,
    };
  }, [
    draft.location.address,
    draft.location.lat,
    draft.location.lng,
    hasCoords,
    routeCoordinates,
    routeDistanceText,
    routeEtaText,
    routeInfo.encodedPolyline,
    routeSummaryText,
  ]);
  const routeMapHtml = useMemo(
    () => (mapToken && routeMapState ? buildRouteMapHtml(mapToken, routeMapState) : null),
    [mapToken, routeMapState],
  );

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

  const sendRouteMapCommand = useCallback((name: RouteMapCommand) => {
    if (Platform.OS === 'web') {
      routeMapFrameRef.current?.contentWindow?.postMessage(
        { source: ROUTE_MAP_MESSAGE_SOURCE, type: 'cmd', name },
        '*',
      );
      return;
    }

    routeMapWebRef.current?.injectJavaScript(`window.__cmd && window.__cmd(${JSON.stringify(name)}); true;`);
  }, []);

  const zoomInMap = () => sendRouteMapCommand('zoomIn');
  const zoomOutMap = () => sendRouteMapCommand('zoomOut');
  const resetMapView = () => sendRouteMapCommand('fit');

  return (
    <View style={[styles.locationPanel, displayMode === 'mapOnly' && styles.locationPanelMapOnly]}>
      {displayMode === 'full' ? (
        <>
      <View style={styles.locationHeader}>
        <View style={styles.locationIcon}>
          <AppIcon name="map-marker" size={27} color={colors.accent} />
        </View>
        <View style={styles.locationHeaderCopy}>
          <Text style={styles.locationEyebrow}>Location</Text>
          <Text style={styles.locationTitle}>Where is the customer located?</Text>
          <Text style={styles.locationHelper}>Confirm an address, ask the customer, or work from a live shared location.</Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        {(['address', 'link'] as const).map((method) => (
          <Pressable
            key={method}
            onPress={() => {
              if (method === 'link') {
                handleAskCustomerPress();
                return;
              }
              setMethod(method);
            }}
            style={({ pressed }) => [
              styles.modeButton,
              draft.location.method === method && styles.modeButtonActive,
              pressed && styles.modeButtonPressed,
            ]}
          >
            <View style={[styles.modeIcon, draft.location.method === method && styles.modeIconActive]}>
              <AppIcon
                name={method === 'address' ? 'keyboard-o' : 'headphones'}
                size={17}
                color={draft.location.method === method ? colors.accent : colors.muted}
              />
            </View>
            <Text style={[styles.modeLabel, draft.location.method === method && styles.modeLabelActive]}>
              {method === 'address' ? 'Type address' : 'Ask customer'}
            </Text>
          </Pressable>
        ))}
      </View>

      {draft.location.method === 'address' ? (
        <View style={styles.addressSurface}>
          <Text style={styles.addressLabel}>Start typing address or postcode</Text>
          <View style={styles.searchShell}>
            <View style={styles.searchIconBox}>
              <AppIcon name="search" size={20} color={colors.info} />
            </View>
            <TextInput
              value={addressInput}
              onChangeText={handleAddressChange}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Eg. 123 High Street, Glasgow or G1 2AB"
              placeholderTextColor={colors.subtle}
              autoCorrect={false}
              style={styles.input}
            />
            {addressInput ? (
              <Pressable
                onPress={() => {
                  setAddressInput('');
                  update({
                    location: {
                      ...draft.location,
                      address: '',
                      lat: null,
                      lng: null,
                      postcode: null,
                      status: 'idle',
                    },
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel="Clear address"
                style={({ pressed }) => [styles.searchClearButton, pressed && styles.quickOptionPressed]}
              >
                <AppIcon name="times" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setShowSuggestions(true)}
              accessibilityRole="button"
              accessibilityLabel="Search location"
              style={({ pressed }) => [styles.searchSubmitButton, pressed && styles.quickOptionPressed]}
            >
              {searching ? <ActivityIndicator color={colors.text} /> : <AppIcon name="location-arrow" size={23} color={colors.accentText} />}
            </Pressable>
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
          {!addressInput && suggestions.length === 0 && !hasCoords ? (
            <View style={styles.locationEmptyState}>
              <Text style={styles.locationEmptyTitle}>No address selected yet</Text>
              <Text style={styles.locationEmptyText}>Start typing a postcode or send a customer location link.</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.linkBox}>
          <Text style={styles.linkHelp}>Send a secure link when the customer cannot give an address. The link expires in 2 hours.</Text>
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
            {routeMapHtml ? (
              Platform.OS === 'web' ? (
                createElement('iframe', {
                  ref: routeMapFrameRef,
                  srcDoc: routeMapHtml,
                  style: { width: '100%', height: '100%', border: 0, background: '#09090B' },
                  sandbox: 'allow-scripts',
                  referrerPolicy: 'strict-origin-when-cross-origin',
                  title: 'Garage to customer route map',
                })
              ) : (
                <WebView
                  ref={routeMapWebRef}
                  originWhitelist={['*']}
                  source={{ html: routeMapHtml }}
                  style={styles.mapFrame}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                  androidLayerType="hardware"
                />
              )
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackTitle}>Interactive route map unavailable</Text>
                <Text style={styles.mapFallbackText}>
                  {mapToken ? 'Waiting for confirmed route details.' : 'Mapbox token is not configured.'}
                </Text>
              </View>
            )}
            {routeMapHtml ? (
              <>
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
                    <Text style={styles.mapControlText}>{mapExpanded ? 'Small map' : 'Large map'}</Text>
                  </Pressable>
                  <View style={styles.mapZoomRow}>
                    <Pressable
                      onPress={zoomOutMap}
                      accessibilityLabel="Zoom route map out"
                      style={({ pressed }) => [
                        styles.mapControlButton,
                        styles.mapZoomButton,
                        pressed && styles.mapControlButtonPressed,
                      ]}
                    >
                      <Text style={styles.mapControlText}>-</Text>
                    </Pressable>
                    <Pressable
                      onPress={zoomInMap}
                      accessibilityLabel="Zoom route map in"
                      style={({ pressed }) => [
                        styles.mapControlButton,
                        styles.mapZoomButton,
                        pressed && styles.mapControlButtonPressed,
                      ]}
                    >
                      <Text style={styles.mapControlText}>+</Text>
                    </Pressable>
                  </View>
                <Pressable
                  onPress={resetMapView}
                  accessibilityLabel="Fit the full route on the map"
                  style={({ pressed }) => [styles.mapControlButton, styles.mapFitButton, pressed && styles.mapControlButtonPressed]}
                >
                  <Text style={styles.mapControlText}>Fit</Text>
                </Pressable>
                </View>
                <View style={styles.mapBottomOverlay}>
                  <View style={styles.mapRouteHeader}>
                    <Text style={styles.mapRouteTitle} numberOfLines={1}>Garage to customer</Text>
                    <View style={styles.routeStatusPill}>
                      <View style={styles.routeStatusDot} />
                      <Text style={styles.routeStatusText}>{routeInfo.encodedPolyline ? 'Route' : 'Approx'}</Text>
                    </View>
                  </View>
                  <Text style={styles.mapRouteMeta}>
                    {routeInfo.encodedPolyline || routeLoading ? routeSummaryText : `${routeSummaryText} (approx)`}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Garage Route</Text>
              <Text style={styles.metricValue}>{distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : '-'}</Text>
              {distanceKm != null ? <Text style={styles.metricSub}>{distanceKm.toFixed(1)} km</Text> : null}
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Drive Time</Text>
              <Text style={styles.metricValue}>{routeLoading ? '...' : routeEtaText ?? '-'}</Text>
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
      <LocationSendOptionsSheet
        visible={sendOptionsOpen}
        busy={busy}
        hasExistingLink={Boolean(draft.location.link)}
        canSendWhatsApp={Boolean(draft.customer.phone.trim())}
        canSendSms={isValidUkPhone(draft.customer.phone)}
        canSendEmail={Boolean(draft.customer.email.trim())}
        onClose={() => setSendOptionsOpen(false)}
        onSend={(method) => { void handleSendLocationRequest(method); }}
      />
    </View>
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
          <Text style={[styles.requestChipText, getRequestChipTextToneStyle(viewState.tone)]}>{toneLabel(viewState.tone)}</Text>
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
      {showActions && (!canSendWhatsApp || !canSendSms || !canSendEmail) ? (
        <View style={styles.requestHints}>
          {!canSendWhatsApp || !canSendSms ? (
            <Text style={styles.requestHint}>WhatsApp and SMS need a valid customer phone number.</Text>
          ) : null}
          {!canSendEmail ? (
            <Text style={styles.requestHint}>Email send needs a customer email address.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function LocationSendOptionsSheet({
  visible,
  busy,
  hasExistingLink,
  canSendWhatsApp,
  canSendSms,
  canSendEmail,
  onClose,
  onSend,
}: {
  visible: boolean;
  busy: LocationShareMethod | null;
  hasExistingLink: boolean;
  canSendWhatsApp: boolean;
  canSendSms: boolean;
  canSendEmail: boolean;
  onClose: () => void;
  onSend: (method: LocationShareMethod) => void;
}) {
  const anyBusy = busy !== null;
  const options: Array<{
    method: LocationShareMethod;
    label: string;
    detail: string;
    disabled: boolean;
    disabledReason: string | null;
  }> = [
    {
      method: 'whatsapp',
      label: 'WhatsApp',
      detail: 'Open WhatsApp with the secure location request.',
      disabled: !canSendWhatsApp,
      disabledReason: 'Add customer phone first.',
    },
    {
      method: 'sms',
      label: 'SMS',
      detail: 'Send the request by text message.',
      disabled: !canSendSms,
      disabledReason: 'Enter a valid UK mobile number first.',
    },
    {
      method: 'email',
      label: 'Email',
      detail: 'Send the request to the customer email.',
      disabled: !canSendEmail,
      disabledReason: 'Add customer email first.',
    },
    {
      method: 'copy',
      label: hasExistingLink ? 'Copy again' : 'Copy message',
      detail: 'Copy the request message so the admin can paste it anywhere.',
      disabled: false,
      disabledReason: null,
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sendSheetKeyboard}
        behavior={Platform.OS === 'web' ? undefined : Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.sendSheetBackdrop} onPress={anyBusy ? undefined : onClose}>
          <Pressable style={styles.sendSheet} onPress={() => {}}>
            <View style={styles.sendSheetHandle} />
            <View style={styles.sendSheetHeader}>
              <View style={styles.sendSheetTitleBlock}>
                <Text style={styles.sendSheetKicker}>Ask customer</Text>
                <Text style={styles.sendSheetTitle}>Send location request</Text>
                <Text style={styles.sendSheetSubtitle}>
                  Choose how to send the secure link. The app creates the link first if needed.
                </Text>
              </View>
              <AppButton label="Close" variant="danger" onPress={onClose} disabled={anyBusy} style={styles.sendSheetCloseButton} />
            </View>
            <View style={styles.sendOptionList}>
              {options.map((option) => {
                const loading = busy === option.method;
                const disabled = option.disabled || (anyBusy && !loading);
                return (
                  <Pressable
                    key={option.method}
                    onPress={disabled ? undefined : () => onSend(option.method)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled, busy: loading }}
                    style={({ pressed }) => [
                      styles.sendOption,
                      option.method === 'whatsapp' && styles.sendOptionPrimary,
                      disabled && styles.sendOptionDisabled,
                      pressed && !disabled && styles.sendOptionPressed,
                    ]}
                  >
                    <View style={styles.sendOptionCopy}>
                      <Text style={styles.sendOptionLabel}>{option.label}</Text>
                      <Text style={styles.sendOptionDetail}>{option.disabledReason ?? option.detail}</Text>
                    </View>
                    {loading ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Text style={styles.sendOptionArrow}>{option.method === 'copy' ? 'Copy' : 'Send'}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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

function toneLabel(tone: LocationRequestViewState['tone']): string {
  switch (tone) {
    case 'busy':
      return 'Working';
    case 'ok':
      return 'Ready';
    case 'warn':
      return 'Waiting';
    case 'err':
      return 'Needs attention';
    default:
      return 'Idle';
  }
}

const sendSheetShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 -18px 42px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.08)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.38,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -12 },
        elevation: 8,
      }
) as ViewStyle;

const locationCardShadow = (
  Platform.OS === 'web'
    ? { boxShadow: '0 14px 34px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.07)' }
    : {
        shadowColor: colors.shadow,
        shadowOpacity: 0.28,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }
) as ViewStyle;

const styles = StyleSheet.create({
  locationPanel: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    backgroundColor: 'rgba(13,20,39,0.92)',
    padding: 14,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    ...(locationCardShadow ?? {}),
  },
  locationPanelMapOnly: {
    borderColor: colors.borderStrong,
    padding: space.sm,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flexWrap: 'nowrap',
    zIndex: 2,
  },
  locationIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationHeaderCopy: { flex: 1, minWidth: 0 },
  locationEyebrow: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: 0 },
  locationTitle: { color: colors.muted, fontSize: 17, fontWeight: '700', letterSpacing: 0, marginTop: 1 },
  locationHelper: { display: 'none' },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 19,
    padding: 4,
    backgroundColor: 'rgba(8,12,28,0.56)',
    marginTop: 8,
    zIndex: 2,
  },
  modeButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 8,
  },
  modeButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  modeButtonPressed: { borderColor: colors.borderStrong },
  modeIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
  },
  modeIconActive: { borderColor: 'rgba(255,255,255,0.46)', backgroundColor: 'rgba(255,255,255,0.12)' },
  modeLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800' },
  modeLabelActive: { color: colors.text },
  copyLinkButton: {
    flex: 0,
    minWidth: 110,
    paddingHorizontal: 14,
    borderColor: colors.accent,
    backgroundColor: colors.ripple,
  },
  copyLinkButtonBusy: { opacity: 0.7 },
  copyLinkLabel: { color: colors.accent },
  addressSurface: { gap: 10, zIndex: 2 },
  addressLabel: { color: colors.muted, fontSize: fontSize.sm, fontWeight: '800' },
  searchShell: {
    minHeight: 58,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(7,13,27,0.66)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: 10,
    ...(locationCardShadow ?? {}),
  },
  searchIconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 52,
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: 'transparent',
  },
  searching: { position: 'absolute', right: 12, top: 12 },
  searchClearButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitButton: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsBox: {
    marginTop: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceOverlay,
    overflow: 'hidden',
    ...locationCardShadow,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  suggestionText: { color: colors.text, fontSize: fontSize.sm },
  confirmedText: { marginTop: 6, color: colors.success, fontSize: fontSize.xs, fontWeight: '700' },
  locationEmptyState: { display: 'none' },
  locationEmptyTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '900' },
  locationEmptyText: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 17, marginTop: 3 },
  quickOptionPressed: { opacity: 0.8, borderColor: colors.glowBorder },
  linkBox: { marginTop: 12, gap: 10 },
  linkHelp: { color: colors.muted, fontSize: fontSize.sm, lineHeight: 19 },
  linkText: { color: colors.accent, fontSize: fontSize.sm, lineHeight: 18 },
  requestCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 10,
    gap: 8,
    ...locationCardShadow,
  },
  requestCard_idle: { backgroundColor: colors.glassStrong, borderColor: colors.border },
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
  requestChip_idle: { backgroundColor: colors.glass, borderColor: colors.border },
  requestChip_busy: { backgroundColor: colors.glassStrong, borderColor: colors.infoBorder },
  requestChip_ok: { backgroundColor: colors.glassStrong, borderColor: colors.successBorder },
  requestChip_warn: { backgroundColor: colors.glassStrong, borderColor: colors.warningBorder },
  requestChip_err: { backgroundColor: colors.glassStrong, borderColor: colors.dangerBorder },
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
  requestHints: { marginTop: 6, gap: 2 },
  requestHint: { color: colors.subtle, fontSize: fontSize.xs, lineHeight: 16 },
  sendSheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sendSheetKeyboard: {
    flex: 1,
  },
  sendSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
    padding: 14,
    ...(sendSheetShadow ?? {}),
  },
  sendSheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginBottom: 12,
  },
  sendSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  sendSheetTitleBlock: { flex: 1, minWidth: 0 },
  sendSheetKicker: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '900' },
  sendSheetTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900', marginTop: 2 },
  sendSheetSubtitle: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16, marginTop: 4 },
  sendSheetCloseButton: { minWidth: 92 },
  sendOptionList: { gap: 8 },
  sendOption: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.glassStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...locationCardShadow,
  },
  sendOptionPrimary: {
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
  },
  sendOptionPressed: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
  },
  sendOptionDisabled: {
    opacity: 0.58,
  },
  sendOptionCopy: { flex: 1, minWidth: 0 },
  sendOptionLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  sendOptionDetail: { color: colors.muted, fontSize: fontSize.xs, lineHeight: 16, marginTop: 3 },
  sendOptionArrow: { color: colors.accent, fontSize: fontSize.xs, fontWeight: '900' },
  actionGrid: { marginTop: 10, gap: 8 },
  confirmedBox: { marginTop: 12, gap: 10 },
  mapWrap: {
    position: 'relative',
    width: '100%',
    height: 430,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: '#09090B',
    overflow: 'hidden',
    ...locationCardShadow,
  },
  mapWrapExpanded: {
    height: 660,
  },
  mapFrame: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: colors.panel,
  },
  mapFallbackTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapFallbackText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  mapTopOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 142,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceOverlay,
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
    top: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 6,
  },
  mapZoomRow: {
    flexDirection: 'row',
    gap: 5,
  },
  mapControlButton: {
    minHeight: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapExpandButton: {
    minWidth: 112,
    paddingHorizontal: 12,
  },
  mapZoomButton: {
    width: 42,
  },
  mapFitButton: {
    minWidth: 74,
    paddingHorizontal: 10,
  },
  mapControlButtonPressed: {
    backgroundColor: colors.panel,
    borderColor: colors.accent,
  },
  mapControlText: {
    color: '#FAFAFA',
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  mapBottomOverlay: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    minWidth: 190,
    maxWidth: 290,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mapRouteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mapRouteTitle: { color: '#FAFAFA', fontSize: fontSize.sm, fontWeight: '900', flexShrink: 1 },
  mapRouteMeta: { color: '#D4D4D8', fontSize: fontSize.xs, marginTop: 3, fontWeight: '700' },
  routeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.18)',
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
    color: '#BBF7D0',
    fontSize: 10,
    fontWeight: '900',
  },
  metricRow: { flexDirection: 'row', gap: 8 },
  metricCard: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glassStrong,
    padding: 10,
    ...locationCardShadow,
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
