import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { driverApi, JobDetail, ApiError } from '@/api/client';
import { LoadingScreen } from '@/components/LoadingScreen';
import { mediumHaptic, heavyHaptic } from '@/services/haptics';
import { playSound } from '@/services/sound';
import { useI18n } from '@/i18n';

const POLL_INTERVAL_MS = 10_000;
const STALE_AFTER_SECONDS = 90;

type RouteData = Awaited<ReturnType<typeof driverApi.getJobRoute>>;

interface Coordinate {
  lat: number;
  lng: number;
}

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

function buildHtml(token: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}</style>
</head><body>
<div id="m"></div>
<script>
function post(payload){ try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch(_){} }
window.addEventListener('error', function(e){ post({type:'error', message:String(e && (e.message||e)), source:(e&&e.filename)||'', line:(e&&e.lineno)||0}); });
window.addEventListener('unhandledrejection', function(e){ post({type:'error', message:'unhandledrejection: '+String(e && e.reason)}); });
mapboxgl.accessToken = ${JSON.stringify(token)};
var map = new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[-4.2518,55.8642],zoom:11,attributionControl:false});
map.on('error', function(e){ post({type:'mapbox-error', message:String(e && e.error && e.error.message || e)}); });
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
  try { var s = JSON.parse(json); if(loaded) applyState(s); else pendingState = s; } catch(e){ post({type:'error', message:'applyState parse: '+String(e)}); }
};
// Force a resize once we're sure the canvas is on-screen. expo-router screen
// transitions mean the WebView is laid out with 0x0 dimensions for the first
// frame; without resize() Mapbox keeps its WebGL canvas at 0x0 and the map
// renders as a solid black surface even after the screen has finished
// animating in.
window.__resizeMap = function(){ try { map.resize(); } catch(_){} };
function scheduleEarlyResize(){
  var attempts = 0;
  var iv = setInterval(function(){
    try { map.resize(); } catch(_){}
    attempts++;
    if(attempts >= 8) clearInterval(iv);
  }, 150);
}
scheduleEarlyResize();
window.addEventListener('resize', function(){ try { map.resize(); } catch(_){} });
try {
  if(typeof ResizeObserver !== 'undefined'){
    var ro = new ResizeObserver(function(){ try { map.resize(); } catch(_){} });
    ro.observe(document.getElementById('m'));
  }
} catch(_){}
map.on('load', function(){ loaded = true; try { map.resize(); } catch(_){} if(pendingState){ applyState(pendingState); pendingState = null; } post({type:'map-loaded'}); });
post({type:'html-ready'});
</script></body></html>`;
}

function parseLatLng(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const STATUS_ACTIONS: Record<string, { next: string; key: string }> = {
  driver_assigned: { next: 'en_route', key: 'startEnRoute' },
  en_route: { next: 'arrived', key: 'markArrived' },
  arrived: { next: 'in_progress', key: 'startWork' },
  in_progress: { next: 'completed', key: 'completeJob' },
};

export default function JobRouteScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const token = useMemo(() => getMapboxToken(), []);
  // Guard so a double-tap cannot launch the external maps app twice.
  const extNavLockRef = useRef(false);

  const [job, setJob] = useState<JobDetail | null>(null);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [actioning, setActioning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const actionLockRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async () => {
    if (!ref) return;
    try {
      const data = await driverApi.getJob(ref);
      setJob(data);
    } catch {
      // ignore — handled in main screen
    }
  }, [ref]);

  const refreshRoute = useCallback(
    async (lat: number | null, lng: number | null) => {
      if (!ref) return;
      try {
        const data = await driverApi.getJobRoute(ref, lat, lng);
        setRouteData(data);
        // Location is published by useLocationBroadcast (dashboard tab) and
        // by the background-location task — no extra POST from here.
      } catch (err) {
        if (err instanceof ApiError && err.status !== 401) {
          // Keep previous map state visible; surface only on first failure.
        }
      }
    },
    [ref],
  );

  const refreshGps = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: requested } = await Location.requestForegroundPermissionsAsync();
        if (requested !== 'granted') {
          setPermissionDenied(true);
          return null;
        }
      }
      setPermissionDenied(false);

      // Take whatever the OS already has cached so the map can render
      // immediately. On Android 10 a cold GPS can take 30+ s to acquire a
      // high-accuracy fix indoors; without this fallback the screen stayed
      // stuck on "Waiting for first GPS fix..." and the WebView never
      // received a fitBounds call, leaving the canvas black.
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 60_000,
        requiredAccuracy: 500,
      }).catch(() => null);
      if (lastKnown) {
        setDriverLat(lastKnown.coords.latitude);
        setDriverLng(lastKnown.coords.longitude);
      }

      // Time-box the high-accuracy fix so a hanging satellite acquisition
      // never blocks the whole map render path.
      const freshFix = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]).catch(() => null);

      if (freshFix) {
        setDriverLat(freshFix.coords.latitude);
        setDriverLng(freshFix.coords.longitude);
        return { lat: freshFix.coords.latitude, lng: freshFix.coords.longitude };
      }
      if (lastKnown) {
        return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    let cancelled = false;
    // Fire the initial route fetch immediately (without waiting for GPS) so
    // the customer marker + bounds always appear within one HTTP round-trip.
    // The GPS lookup runs in parallel; whichever finishes first updates the
    // map, and the second one supersedes when it lands.
    refreshRoute(null, null);
    (async () => {
      const gps = await refreshGps();
      if (cancelled || !gps) return;
      await refreshRoute(gps.lat, gps.lng);
    })();
    pollTimerRef.current = setInterval(async () => {
      const gps = await refreshGps();
      await refreshRoute(gps?.lat ?? null, gps?.lng ?? null);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [refreshGps, refreshRoute]);

  const handleStatusAction = useCallback(
    async (nextStatus: string) => {
      if (!ref || actionLockRef.current) return;
      actionLockRef.current = true;
      const confirmMsg =
        nextStatus === 'completed'
          ? t('jobDetail.confirmComplete')
          : t('jobDetail.confirmStatusUpdate', { status: nextStatus.replace(/_/g, ' ') });
      Alert.alert(t('common.confirm'), confirmMsg, [
        {
          text: t('common.cancel'),
          style: 'cancel',
          onPress: () => {
            actionLockRef.current = false;
          },
        },
        {
          text: t('common.confirm'),
          onPress: async () => {
            setActioning(true);
            try {
              await driverApi.updateJobStatus(ref, nextStatus);
              if (nextStatus === 'completed') {
                heavyHaptic();
                playSound('job_completed');
              } else {
                mediumHaptic();
              }
              await fetchJob();
              if (nextStatus === 'completed') {
                router.back();
              }
            } catch (err) {
              const msg = err instanceof ApiError ? err.message : t('jobDetail.failedUpdate');
              Alert.alert(t('common.error'), msg);
            }
            setActioning(false);
            actionLockRef.current = false;
          },
        },
      ], {
        onDismiss: () => {
          actionLockRef.current = false;
        },
      });
    },
    [fetchJob, ref, router, t],
  );

  const handleOpenExternal = useCallback(() => {
    if (extNavLockRef.current) return;
    const customerLat = parseLatLng(job?.lat);
    const customerLng = parseLatLng(job?.lng);
    if (customerLat == null || customerLng == null) return;
    extNavLockRef.current = true;
    const url = Platform.select({
      android: `google.navigation:q=${customerLat},${customerLng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}&travelmode=driving`,
    });
    Linking.openURL(url)
      .catch(() => {
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`,
        );
      })
      .finally(() => {
        setTimeout(() => {
          extNavLockRef.current = false;
        }, 800);
      });
  }, [job?.lat, job?.lng]);

  const customerCoord: Coordinate | null = (() => {
    const cl = routeData?.customerLocation;
    if (cl) return { lat: cl.lat, lng: cl.lng };
    const lat = parseLatLng(job?.lat);
    const lng = parseLatLng(job?.lng);
    if (lat == null || lng == null) return null;
    return { lat, lng };
  })();

  const driverCoord: Coordinate | null =
    driverLat != null && driverLng != null ? { lat: driverLat, lng: driverLng } : null;

  // Build the HTML once per token so the WebView never reloads while data updates.
  const html = useMemo(() => (token ? buildHtml(token) : ''), [token]);
  const webRef = useRef<WebView>(null);

  // Push live state into the WebView whenever coords or geometry change.
  useEffect(() => {
    if (!token) return;
    const state = {
      driver: driverCoord ? [driverCoord.lng, driverCoord.lat] : null,
      customer: customerCoord ? [customerCoord.lng, customerCoord.lat] : null,
      coords: routeData?.geometry?.coordinates ?? null,
    };
    const json = JSON.stringify(state).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    webRef.current?.injectJavaScript(
      `window.__applyState && window.__applyState('${json}'); true;`,
    );
  }, [
    token,
    driverCoord?.lat,
    driverCoord?.lng,
    customerCoord?.lat,
    customerCoord?.lng,
    routeData?.geometry,
  ]);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const statusAction = job ? STATUS_ACTIONS[job.status] : null;
  const lastUpdatedSeconds = routeData?.lastUpdatedAt
    ? Math.max(
        0,
        Math.round((nowTick - new Date(routeData.lastUpdatedAt).getTime()) / 1000),
      )
    : null;
  const isStale =
    lastUpdatedSeconds == null ? true : lastUpdatedSeconds > STALE_AFTER_SECONDS;

  if (!ref) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          // expo-router's auto title inferred from the path renders "[ref]/route"
          // literally; override with the booking ref for a clean header.
          title: ref ? `#${ref}` : t('jobDetail.liveMap'),
          headerBackTitle: '',
        }}
      />
      <View
        style={styles.mapWrap}
        onLayout={() => {
          // expo-router screen transitions animate this view from 0 → real
          // height; re-trigger Mapbox's internal resize each time the
          // container's layout settles so the WebGL canvas matches the
          // visible area (otherwise the map stays black on first open).
          webRef.current?.injectJavaScript(
            'window.__resizeMap && window.__resizeMap(); true;',
          );
        }}
      >
        {!token ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>
              {t('common.error')}: Mapbox token not configured.
            </Text>
          </View>
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://localhost/' }}
            style={styles.web}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            androidLayerType="hardware"
            mixedContentMode="always"
            setSupportMultipleWindows={false}
            onLoadEnd={() => {
              // Belt-and-braces resize once the page has actually loaded —
              // expo-router screen transitions can mount the WebView at 0×0
              // and Mapbox then stays stuck with a 0×0 WebGL canvas (black).
              webRef.current?.injectJavaScript(
                'window.__resizeMap && window.__resizeMap(); true;',
              );
            }}
            onMessage={(event) => {
              try {
                const msg = JSON.parse(event.nativeEvent.data) as {
                  type?: string;
                  message?: string;
                };
                if (msg?.type === 'error' || msg?.type === 'mapbox-error') {
                  console.warn('[route-map]', msg.type, msg.message);
                }
              } catch {
                // ignore non-JSON messages
              }
            }}
          />
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          onPress={() => router.back()}
          style={styles.backFab}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Ionicons name="speedometer-outline" size={18} color={colors.accent} />
          <Text style={styles.summaryValue}>
            {routeData?.distanceMiles != null
              ? `${routeData.distanceMiles.toFixed(1)} mi`
              : '— mi'}
          </Text>
          <Ionicons
            name="time-outline"
            size={18}
            color={colors.accent}
            style={{ marginLeft: spacing.md }}
          />
          <Text style={styles.summaryValue}>
            {routeData?.durationMinutes != null
              ? `${routeData.durationMinutes} min`
              : '— min'}
          </Text>
        </View>
        {routeData?.source === 'haversine' && (
          <Text style={styles.summaryApprox}>
            Approximate line — live ETA unavailable
          </Text>
        )}
        <Text style={[styles.summaryMeta, isStale && styles.summaryMetaStale]}>
          {permissionDenied
            ? 'Location permission denied — re-enable to refresh'
            : lastUpdatedSeconds == null
              ? 'Waiting for first GPS fix...'
              : `Updated ${lastUpdatedSeconds}s ago`}
        </Text>
      </View>

      <View style={styles.actions}>
        {statusAction && (
          <Pressable
            accessibilityRole="button"
            disabled={actioning}
            onPress={() => handleStatusAction(statusAction.next)}
            style={[styles.primaryBtn, actioning && styles.btnDisabled]}
          >
            <Ionicons name="navigate" size={18} color="#0B0F1A" />
            <Text style={styles.primaryBtnText}>{t(`jobDetail.${statusAction.key}`)}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={handleOpenExternal}
          style={styles.secondaryBtn}
        >
          <Ionicons name="open-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryBtnText}>Open in Google Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapWrap: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  web: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  backFab: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  summary: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
  summaryMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  summaryMetaStale: {
    color: '#FDBA74',
  },
  summaryApprox: {
    color: '#FDBA74',
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  actions: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryBtnText: {
    color: '#0B0F1A',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  secondaryBtn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
