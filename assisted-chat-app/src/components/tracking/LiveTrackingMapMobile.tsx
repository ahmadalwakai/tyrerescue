import { createElement, useMemo } from 'react';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fontSize, radius } from '@/components/theme';

interface Point {
  lat: number;
  lng: number;
}

interface Props {
  driver: Point | null;
  customer: Point | null;
  /** Pixel height for the embedded map. */
  height?: number;
}

function getToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

function buildHtml(token: string, driver: Point | null, customer: Point | null): string {
  const center = driver ?? customer ?? { lat: 55.8642, lng: -4.2518 };
  // Coordinates are injected as JSON literals so quoting is safe.
  const driverJson = driver ? JSON.stringify([driver.lng, driver.lat]) : 'null';
  const customerJson = customer ? JSON.stringify([customer.lng, customer.lat]) : 'null';
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}
.mk{position:relative;width:18px;height:18px}
.mk-dot{position:absolute;top:0;left:0;width:18px;height:18px;border-radius:50%;background:var(--c);border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,0.5);box-sizing:border-box;z-index:2}
.mk-ring{position:absolute;top:50%;left:50%;width:18px;height:18px;border-radius:50%;border:2px solid var(--c);transform:translate(-50%,-50%);opacity:0;z-index:1;animation:radar 1.8s ease-out infinite}
.mk-ring.r2{animation-delay:.8s}
@keyframes radar{0%{transform:translate(-50%,-50%) scale(1);opacity:.7}100%{transform:translate(-50%,-50%) scale(3.6);opacity:0}}
@media (prefers-reduced-motion: reduce){.mk-ring{animation:none;transform:translate(-50%,-50%) scale(1.8);opacity:.16}.mk-ring.r2{display:none}}
</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken = ${JSON.stringify(token)};
var driver = ${driverJson};
var customer = ${customerJson};
var map = new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[${center.lng},${center.lat}],zoom:12,attributionControl:false});
function pin(color){var el=document.createElement('div');el.className='mk';el.style.setProperty('--c',color);el.innerHTML='<span class="mk-ring"></span><span class="mk-ring r2"></span><span class="mk-dot"></span>';return el;}
map.on('load', function(){
  if (customer) new mapboxgl.Marker({element:pin('#22c55e')}).setLngLat(customer).addTo(map);
  if (driver) new mapboxgl.Marker({element:pin('#F97316')}).setLngLat(driver).addTo(map);
  if (driver && customer){
    var b = new mapboxgl.LngLatBounds().extend(driver).extend(customer);
    map.fitBounds(b,{padding:60,maxZoom:14,duration:0});
    fetch('https://api.mapbox.com/directions/v5/mapbox/driving/'+driver[0]+','+driver[1]+';'+customer[0]+','+customer[1]+'?geometries=geojson&overview=full&access_token='+mapboxgl.accessToken)
      .then(function(r){return r.ok?r.json():Promise.reject();})
      .then(function(j){
        var c = j && j.routes && j.routes[0] && j.routes[0].geometry && j.routes[0].geometry.coordinates;
        if (!c || c.length<2) return drawDirect();
        addLine(c,false);
      })
      .catch(drawDirect);
    function drawDirect(){addLine([driver,customer],true);}
    function addLine(coords,dashed){
      map.addSource('r',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F97316','line-width':4,'line-opacity':0.85,'line-dasharray':dashed?[1.5,1.5]:[1,0]}});
    }
  }
});
</script></body></html>`;
}

/**
 * Embedded live map for the assisted-chat operator card. Renders a
 * Mapbox GL JS map inside a WebView so we don't have to add a native
 * Mapbox dependency. The HTML is rebuilt whenever the pins move, which
 * forces the WebView to reload — acceptable at the 5s poll cadence.
 */
export function LiveTrackingMapMobile({ driver, customer, height = 220 }: Props) {
  const token = getToken();
  const html = useMemo(() => buildHtml(token, driver, customer), [token, driver, customer]);

  if (!token) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Map unavailable — token not configured.</Text>
      </View>
    );
  }
  if (!driver && !customer) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Waiting for first location...</Text>
      </View>
    );
  }
  return (
    <View style={[styles.wrap, { height }]}>
      {Platform.OS === 'web' ? (
        // react-native-webview has no real web implementation (it renders an
        // error message). Use a native iframe with srcDoc so the operator
        // dashboard works in the Expo web build too.
        createElement('iframe', {
          srcDoc: html,
          style: { width: '100%', height: '100%', border: 0, background: colors.bg },
          sandbox: 'allow-scripts',
          referrerPolicy: 'strict-origin-when-cross-origin',
          title: 'Live tracking map',
        })
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          style={styles.web}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          androidLayerType="hardware"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  web: { flex: 1, backgroundColor: colors.bg },
  fallback: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: colors.muted, fontSize: fontSize.xs },
});
