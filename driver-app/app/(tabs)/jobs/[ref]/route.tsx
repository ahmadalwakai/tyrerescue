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
import { useLocalSearchParams, useRouter } from 'expo-router';
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

function buildHtml(
  token: string,
  driver: Coordinate | null,
  customer: Coordinate | null,
  geometry: RouteData['geometry'],
): string {
  const center = driver ?? customer ?? { lat: 55.8642, lng: -4.2518 };
  const driverJson = driver ? JSON.stringify([driver.lng, driver.lat]) : 'null';
  const customerJson = customer ? JSON.stringify([customer.lng, customer.lat]) : 'null';
  const geometryJson = geometry ? JSON.stringify(geometry.coordinates) : 'null';
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#09090B}</style>
</head><body>
<div id="m"></div>
<script>
mapboxgl.accessToken = ${JSON.stringify(token)};
var driver = ${driverJson};
var customer = ${customerJson};
var coords = ${geometryJson};
var map = new mapboxgl.Map({container:'m',style:'mapbox://styles/mapbox/dark-v11',center:[${center.lng},${center.lat}],zoom:13,attributionControl:false});
function pin(color){var el=document.createElement('div');el.style.cssText='width:18px;height:18px;border-radius:50%;background:'+color+';border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,0.5)';return el;}
map.on('load', function(){
  if (customer) new mapboxgl.Marker({element:pin('#22c55e')}).setLngLat(customer).addTo(map);
  if (driver) new mapboxgl.Marker({element:pin('#F97316')}).setLngLat(driver).addTo(map);
  if (driver && customer){
    var b = new mapboxgl.LngLatBounds().extend(driver).extend(customer);
    map.fitBounds(b,{padding:80,maxZoom:15,duration:0});
  }
  if (coords && coords.length >= 2){
    map.addSource('r',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
    map.addLayer({id:'rl',type:'line',source:'r',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F97316','line-width':4,'line-opacity':0.9}});
  }
});
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
        // Push the same coordinate to the dispatch tracking session so admin
        // and customer maps stay in sync via /api/driver/location.
        if (lat != null && lng != null) {
          driverApi
            .updateLocation(lat, lng, ref)
            .catch(() => {
              // Best-effort — background-location task is the primary path.
            });
        }
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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setDriverLat(loc.coords.latitude);
      setDriverLng(loc.coords.longitude);
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const gps = await refreshGps();
      if (cancelled) return;
      await refreshRoute(gps?.lat ?? null, gps?.lng ?? null);
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
    const customerLat = parseLatLng(job?.lat);
    const customerLng = parseLatLng(job?.lng);
    if (customerLat == null || customerLng == null) return;
    const url = Platform.select({
      android: `google.navigation:q=${customerLat},${customerLng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}&travelmode=driving`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`,
      );
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

  const html = buildHtml(token, driverCoord, customerCoord, routeData?.geometry ?? null);

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
      <View style={styles.mapWrap}>
        {!token ? (
          <View style={styles.fallback}>
            <Text style={styles.fallbackText}>
              {t('common.error')}: Mapbox token not configured.
            </Text>
          </View>
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
              ? `${routeData.durationMinutes} min${
                  routeData.source === 'haversine' ? '*' : ''
                }`
              : '— min'}
          </Text>
        </View>
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
