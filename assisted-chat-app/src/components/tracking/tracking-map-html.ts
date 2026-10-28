import type { TrackingDriver, TrackingJob } from '@/hooks/useTracking';

export interface TrackingMapState {
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
  /** A date-range change may reframe once; ordinary location polls preserve the camera. */
  fitKey?: string;
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Shared by the native WebView and the web iframe; no customer data is fetched here. */
export function buildTrackingMapHtml(token: string, initialState: TrackingMapState | null = null): string {
  return String.raw`<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#eef1ed;font-family:system-ui,-apple-system,sans-serif}
button{font:inherit;-webkit-tap-highlight-color:transparent}
.pin{--pin-color:#64748b;position:absolute;width:44px;height:44px;border:0;padding:0;background:none;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}
.pin-core{display:flex;align-items:center;justify-content:center;width:32px;height:32px;color:white;background:var(--pin-color);border:3px solid white;box-sizing:border-box;box-shadow:0 2px 7px #0f172a55;border-radius:50%;pointer-events:none}
.pin.job .pin-core{border-radius:10px;transform:rotate(45deg)}
.pin.job svg{transform:rotate(-45deg)}
.pin svg{width:19px;height:19px;fill:currentColor}
.pin.sel{z-index:3}
.pin.sel .pin-core{outline:3px solid #111827;outline-offset:2px}
.pin-label{position:absolute;top:45px;left:50%;transform:translateX(-50%);max-width:180px;padding:5px 8px;border-radius:7px;background:#111827;color:white;border:1px solid white;box-shadow:0 2px 6px #0f172a33;font-size:12px;font-weight:750;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.pin.group .pin-core{width:40px;height:40px;background:#1e3a5f;border:3px solid white;font-size:16px;font-weight:800}
.pin:focus-visible{outline:3px solid #ea580c;outline-offset:3px;border-radius:50%}
.mapboxgl-ctrl-group{border-radius:12px!important;box-shadow:0 2px 10px #0f172a2b!important;overflow:hidden}
.mapboxgl-ctrl-group button{width:44px!important;height:44px!important}
.mapboxgl-ctrl-scale{background:#fffffff0!important;border-color:#334155!important;color:#1e293b!important;font-weight:650}
.mapboxgl-popup.hub-docked-popup{position:absolute!important;left:12px!important;right:12px!important;top:auto!important;bottom:32px!important;transform:none!important;width:auto!important;max-width:420px!important;margin:0 auto;max-height:calc(100% - 112px);z-index:4;pointer-events:auto}
.hub-docked-popup .mapboxgl-popup-tip{display:none}
.mapboxgl-popup-content{width:100%;box-sizing:border-box;padding:0!important;border-radius:15px!important;box-shadow:0 5px 25px #0f172a38!important;overflow:hidden}
.mapboxgl-popup-close-button{right:4px!important;top:4px!important;width:40px;height:40px;color:#334155;font-size:25px;z-index:2;border-radius:10px}
.hub-card{width:100%;max-height:calc(100vh - 112px);overflow:auto;box-sizing:border-box;background:white;padding:15px;color:#0f172a;font-size:13px;line-height:1.4;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.hub-card.group-card{display:flex;flex-direction:column;overflow:hidden}
.group-card>.hub-kicker,.group-card>.hub-title,.group-card>.hub-meta,.group-card>.hub-tools{flex-shrink:0}
.hub-kicker{font-size:10px;text-transform:uppercase;letter-spacing:0;color:#475569;font-weight:800;margin-right:28px}
.hub-title{font-size:17px;font-weight:800;line-height:1.25;overflow-wrap:anywhere;margin:3px 28px 8px 0}
.hub-meta{color:#475569;margin-top:9px;overflow-wrap:anywhere}
.hub-warn{color:#9a3412;font-weight:750}
.hub-pills{display:flex;flex-wrap:wrap;gap:5px}
.hub-pill{padding:3px 7px;border-radius:7px;font-size:11px;font-weight:750;color:#475569;background:#f1f5f9}
.hub-pill.ok{background:#dcfce7;color:#166534}.hub-pill.warn{background:#fef3c7;color:#92400e}.hub-pill.danger{background:#fee2e2;color:#991b1b}
.hub-tools{display:flex;gap:8px;margin-top:12px}
.hub-tool{min-height:44px;flex:1;padding:8px;border:1px solid #cbd5e1;border-radius:9px;background:white;color:#0f172a;font-weight:750;font-size:13px;cursor:pointer}
.hub-tool.primary{background:#ea580c;color:white;border-color:#ea580c}.hub-tool:disabled{opacity:.45;cursor:default}
.hub-list{flex:1 1 auto;min-height:0;overflow:auto;margin:10px -5px 0;padding:0 5px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.hub-choice{display:flex;align-items:center;gap:9px;width:100%;min-height:52px;padding:9px 4px;text-align:left;border:0;border-top:1px solid #e2e8f0;background:white;color:#0f172a;cursor:pointer}
.hub-choice[aria-current=true]{background:#fff7ed}.hub-choice-copy{min-width:0;flex:1}.hub-choice-name{display:block;font-size:13px;font-weight:750;overflow-wrap:anywhere}.hub-choice-meta{display:block;font-size:11px;color:#64748b;margin-top:2px}.hub-choice-symbol{width:26px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%;background:#1d4ed8;color:white;font-size:12px;font-weight:800}.hub-choice-symbol.job{border-radius:7px;background:#2563EB}
@media(max-height:380px){
  .mapboxgl-popup.hub-docked-popup{bottom:12px!important;max-height:calc(100% - 24px)}
  .hub-card{max-height:calc(100vh - 24px);padding:12px}
  .group-card>.hub-kicker,.group-card>.hub-meta{display:none}
  .group-card>.hub-title{font-size:16px;margin:0 36px 6px 0}
  .group-card>.hub-tools{margin-top:8px}
  .hub-list{margin-top:6px}
  .hub-choice{min-height:44px;padding:6px 4px}
}
#map-status{position:absolute;inset:0;display:flex;justify-content:center;align-items:center;padding:24px;background:#eef1ed;color:#334155;text-align:center;font-size:14px;line-height:1.5;pointer-events:none;z-index:10}#map-status[hidden]{display:none}
</style></head><body><div id="m" role="region" aria-label="Drivers and bookings map"></div><div id="map-status" role="status">Loading street map…</div>
<script>
(function(){
'use strict';
var MSG_SOURCE='tyrerescue-tracking-map';
var loaded=false,pending=null,didFit=false,fitKey=null,lastSelectedKey=null;
var records=[],byKey=Object.create(null),markers=[],openPopup=null,popupKeys=null,popupKind=null;
var initialState=${scriptJson(initialState)};
var statusEl=document.getElementById('map-status');
function post(o){try{if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o));else if(window.parent&&window.parent!==window)window.parent.postMessage({source:MSG_SOURCE,payload:o},'*');}catch(e){}}
function failed(){if(!loaded){statusEl.hidden=false;statusEl.textContent='Street map could not load. Check your connection and refresh.';post({type:'map-error'});}}
if(typeof mapboxgl==='undefined'){failed();return;}
var map;
try{
  mapboxgl.accessToken=${scriptJson(token)};
  map=new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/streets-v12',center:[-4.2518,55.8642],zoom:11,pitch:0,bearing:0,attributionControl:{compact:true}});
  map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
  map.addControl(new mapboxgl.ScaleControl({maxWidth:90,unit:'imperial'}),'bottom-left');
}catch(e){failed();return;}
function esc(s){return(s==null?'':String(s)).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function validPoint(d){return d&&typeof d.lat==='number'&&typeof d.lng==='number'&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&d.lat>=-90&&d.lat<=90&&d.lng>=-180&&d.lng<=180&&!(d.lat===0&&d.lng===0);}
function freshText(f){return f==='live'?'Live GPS':f==='stale'?'Stale GPS':f==='offline'?'Offline':'GPS freshness unknown';}
function driverColor(d){if(d.freshness!=='live'&&d.freshness!=='stale')return'#64748b';if(d.freshness==='stale')return'#b45309';if(d.status==='busy')return'#c2410c';if(d.status==='available')return'#15803d';return'#64748b';}
function label(r){return r.kind==='driver'?(r.data.name||'Driver'):('#'+(r.data.ref||'Job'));}
function meta(r){return r.kind==='driver'?freshText(r.data.freshness)+' · '+(r.data.status||'unknown'):(r.data.assignmentStatus==='unassigned'?'Unassigned booking':'Assigned booking');}
function details(r){
  var d=r.data,h='<div class="hub-card"><div class="hub-kicker">'+(r.kind==='driver'?'Driver':'Booking')+'</div><div class="hub-title">'+esc(label(r))+'</div><div class="hub-pills">';
  if(r.kind==='driver'){
    h+='<span class="hub-pill '+(d.freshness==='live'?'ok':d.freshness==='stale'?'warn':'')+'">'+esc(freshText(d.freshness))+'</span><span class="hub-pill">'+esc(d.status||'unknown')+'</span></div><div class="hub-meta">';
    if(d.phone)h+=esc(d.phone)+'<br>';
    h+=d.activeJobRef?'Active job: #'+esc(d.activeJobRef):'No active job';
    if(d.lastSeenAt)h+='<br>Last seen: '+esc(d.lastSeenAt);
  }else{
    h+='<span class="hub-pill '+(d.assignmentStatus==='unassigned'?'danger':'ok')+'">'+(d.assignmentStatus==='unassigned'?'Unassigned':'Assigned')+'</span><span class="hub-pill '+(d.paymentNeedsCheck?'warn':'ok')+'">'+(d.paymentNeedsCheck?'Check payment':'Paid')+'</span></div><div class="hub-meta">';
    if(d.customerName)h+=esc(d.customerName)+'<br>';
    h+=esc(d.address||'No address');
    if(d.tyreSummary)h+='<br>'+esc(d.tyreSummary);
    if(d.vehicleSummary)h+='<br>'+esc(d.vehicleSummary);
    h+='<br><span class="'+(d.paymentNeedsCheck?'hub-warn':'')+'">'+esc(d.paymentLine||'Payment needs checking')+'</span>';
  }
  var phone=r.kind==='driver'?d.phone:d.customerPhone;
  h+='</div><div class="hub-tools"><button type="button" class="hub-tool" data-action="call" data-key="'+esc(r.key)+'" '+(!phone?'disabled':'')+'>'+(r.kind==='driver'?'Call':'Call customer')+'</button><button type="button" class="hub-tool primary" data-action="select" data-key="'+esc(r.key)+'">'+(r.kind==='driver'?'Select':'Select job')+'</button></div></div>';
  return h;
}
function groupHtml(items){
  var ds=items.filter(function(r){return r.kind==='driver';}).length;
  var js=items.length-ds;
  var h='<div class="hub-card group-card"><div class="hub-kicker">Nearby locations</div><div class="hub-title">'+items.length+' on the map</div><div class="hub-meta">'+ds+' driver'+(ds===1?'':'s')+' · '+js+' booking'+(js===1?'':'s')+'<br>Choose a person or booking below.</div><div class="hub-list">';
  items.slice().sort(function(a,b){return Number(!!b.data.selected)-Number(!!a.data.selected)||label(a).localeCompare(label(b));}).forEach(function(r){
    h+='<button type="button" class="hub-choice" data-action="select" data-key="'+esc(r.key)+'" aria-current="'+(r.data.selected?'true':'false')+'"><span class="hub-choice-symbol '+r.kind+'">'+(r.kind==='driver'?'D':'J')+'</span><span class="hub-choice-copy"><span class="hub-choice-name">'+esc(label(r))+'</span><span class="hub-choice-meta">'+esc(meta(r))+'</span></span><span aria-hidden="true">›</span></button>';
  });
  h+='</div>';
  var first=items[0].data;
  if(items.some(function(r){return r.data.lng!==first.lng||r.data.lat!==first.lat;}))h+='<div class="hub-tools"><button type="button" class="hub-tool primary" data-action="expand">Zoom to these locations</button></div>';
  return h+'</div>';
}
function closePopup(){if(openPopup)openPopup.remove();openPopup=null;popupKeys=null;popupKind=null;}
function showPopup(items,kind){
  closePopup();if(!items.length)return;
  popupKeys=items.map(function(r){return r.key;});popupKind=kind;
  openPopup=new mapboxgl.Popup({offset:23,closeButton:true,className:'hub-docked-popup'}).setLngLat([items[0].data.lng,items[0].data.lat]).setHTML(kind==='group'?groupHtml(items):details(items[0])).addTo(map);
  var thisPopup=openPopup;
  openPopup.on('close',function(){if(openPopup===thisPopup){openPopup=null;popupKeys=null;popupKind=null;}});
}
var driverSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10a2 2 0 0 1 2 2v3h2l3 4v5h-2a3 3 0 0 1-6 0H9a3 3 0 0 1-6 0H1V6a2 2 0 0 1 2-2h2zm12 7v3h3l-2-3h-1zM6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>';
var jobSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>';
function markerElement(items){
  var selected=items.find(function(r){return r.data.selected;});
  var r=selected||items[0],isGroup=items.length>1;
  var el=document.createElement('button');
  el.type='button';el.className='pin '+(isGroup?'group':r.kind)+(selected?' sel':'');
  el.setAttribute('aria-label',isGroup?items.length+' nearby drivers and bookings. Choose a location.':label(r)+'. '+meta(r));
  el.style.setProperty('--pin-color',r.kind==='driver'?driverColor(r.data):(r.data.assignmentStatus==='unassigned'?'#DC2626':'#2563EB'));
  var core=document.createElement('span');core.className='pin-core';
  if(isGroup)core.textContent=String(items.length);else core.innerHTML=r.kind==='driver'?driverSvg:jobSvg;
  el.appendChild(core);
  if(selected){var tag=document.createElement('span');tag.className='pin-label';tag.textContent=label(selected);el.appendChild(tag);}
  el.addEventListener('click',function(e){e.stopPropagation();if(isGroup){showPopup(items,'group');}else{post({type:'mk',kind:r.kind,id:r.data.id});showPopup([r],'detail');}});
  return el;
}
function renderMarkers(){
  markers.forEach(function(m){m.remove();});markers=[];
  var groups=[];
  records.forEach(function(r){
    var p=map.project([r.data.lng,r.data.lat]);
    var joins=[];
    groups.forEach(function(g,index){if(g.some(function(v){var dx=v.p.x-p.x,dy=v.p.y-p.y;return dx*dx+dy*dy<54*54;}))joins.push(index);});
    var next=[{r:r,p:p}];
    for(var n=joins.length-1;n>=0;n--)next=next.concat(groups.splice(joins[n],1)[0]);
    groups.push(next);
  });
  groups.forEach(function(g){
    var items=g.map(function(v){return v.r;});
    var anchor=items.find(function(r){return r.data.selected;})||items[0];
    var el=markerElement(items);
    markers.push(new mapboxgl.Marker({element:el,anchor:'center'}).setLngLat([anchor.data.lng,anchor.data.lat]).addTo(map));
  });
}
function fitRecords(items,maxZoom){
  if(!items.length)return;
  if(items.length===1){map.easeTo({center:[items[0].data.lng,items[0].data.lat],zoom:maxZoom,duration:450});return;}
  var b=new mapboxgl.LngLatBounds();items.forEach(function(r){b.extend([r.data.lng,r.data.lat]);});
  map.fitBounds(b,{padding:{top:72,bottom:92,left:52,right:64},maxZoom:maxZoom,duration:450});
}
function apply(s){
  if(!s||typeof s!=='object')return;
  var nextKey=typeof s.fitKey==='string'?s.fitKey:'';
  if(fitKey!==nextKey){fitKey=nextKey;didFit=false;}
  records=[];byKey=Object.create(null);
  function add(kind,data){
    if(!validPoint(data)||typeof data.id!=='string'||!data.id.trim())return;
    var key=kind+':'+data.id;if(byKey[key])return;
    var r={kind:kind,key:key,data:data};records.push(r);byKey[key]=r;
  }
  (Array.isArray(s.drivers)?s.drivers:[]).forEach(function(d){add('driver',d);});
  (Array.isArray(s.jobs)?s.jobs:[]).forEach(function(j){add('job',j);});
  renderMarkers();
  if(openPopup&&popupKeys){
    var items=popupKeys.map(function(key){return byKey[key];}).filter(Boolean);
    if(!items.length)closePopup();
    else openPopup.setLngLat([items[0].data.lng,items[0].data.lat]).setHTML(popupKind==='group'?groupHtml(items):details(items[0]));
  }
  var selected=records.find(function(r){return r.data.selected;});
  if(!didFit&&s.doFit&&records.length){fitRecords(records,13);didFit=true;}
  else if(selected&&selected.key!==lastSelectedKey&&!map.getBounds().contains([selected.data.lng,selected.data.lat]))map.easeTo({center:[selected.data.lng,selected.data.lat],duration:450});
  lastSelectedKey=selected?selected.key:null;
}
function receiveState(s){if(!s)return;if(loaded)apply(s);else pending=s;}
window.__applyState=function(json){try{receiveState(JSON.parse(json));}catch(e){}};
window.__fitAll=function(){fitRecords(records,13);};
document.addEventListener('click',function(e){
  var btn=e.target&&e.target.closest?e.target.closest('[data-action]'):null;if(!btn)return;
  e.preventDefault();e.stopPropagation();
  var action=btn.getAttribute('data-action');
  if(action==='expand'){var items=(popupKeys||[]).map(function(key){return byKey[key];}).filter(Boolean);closePopup();fitRecords(items,Math.min(20,map.getZoom()+3));return;}
  var r=byKey[btn.getAttribute('data-key')||''];if(!r)return;
  if(action==='call'){var phone=r.kind==='driver'?r.data.phone:r.data.customerPhone;if(phone)post({type:'call',phone:phone});}
  else if(action==='select'){post({type:'mk',kind:r.kind,id:r.data.id});closePopup();}
});
window.addEventListener('message',function(event){
  try{var msg=event.data||{};if(msg.source!==MSG_SOURCE)return;if(window.parent!==window&&event.source!==window.parent)return;
    if(msg.type==='state')receiveState(msg.state);else if(msg.type==='cmd'&&msg.name==='fit')window.__fitAll();
  }catch(e){}
});
map.on('load',function(){loaded=true;statusEl.hidden=true;if(pending){apply(pending);pending=null;}else if(initialState)apply(initialState);post({type:'ready'});});
map.on('moveend',function(){if(loaded)renderMarkers();});
map.on('resize',function(){if(loaded)renderMarkers();});
map.on('error',failed);
})();
</script></body></html>`;
}

