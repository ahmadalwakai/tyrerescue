import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import {
  nativeMapCameraPlan, nativeMapHeading, nativeMapMarkerRotation, nativeRouteSegments, toNativeMapCoordinate,
} from '@/lib/navigation/nativeMapModel';
import type { DriverNavigationMapProps } from './DriverNavigationMap.types';

const ROUTE_BLUE = '#1A73E8';

/** Native MapKit on iOS. No WebView, injected JavaScript, or map API key. */
export default function DriverNavigationMap(props: DriverNavigationMapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [cameraHeading, setCameraHeading] = useState(0);
  const { height } = useWindowDimensions();
  const lastEpoch = useRef<number | null>(null);
  const lastOverview = useRef('');
  const lastMode = useRef('idle');
  const lastHeading = useRef<number | null>(null);
  const cameraReadPending = useRef(false);
  const cameraMotionUntil = useRef(0);
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const driver = useMemo(() => toNativeMapCoordinate(props.driver), [props.driver]);
  const customer = useMemo(() => toNativeMapCoordinate(props.customer), [props.customer]);
  const selectedGeometry = props.routes[props.selectedIndex]?.geometry ?? null;
  const remaining = useMemo(
    () => nativeRouteSegments(props.remainingGeometry ?? selectedGeometry),
    [props.remainingGeometry, selectedGeometry],
  );
  const travelled = useMemo(() => nativeRouteSegments(props.travelledGeometry), [props.travelledGeometry]);
  const alternatives = useMemo(() => props.routes.flatMap((route, index) =>
    index === props.selectedIndex ? [] : nativeRouteSegments(route.geometry).map((coordinates, segment) =>
      ({ index, segment, coordinates }))), [props.routes, props.selectedIndex]);
  const heading = nativeMapHeading(props.displayHeading);
  if (heading != null && props.locationFresh) lastHeading.current = heading;
  const markerRotation = nativeMapMarkerRotation(lastHeading.current, cameraHeading);

  const readCameraHeading = useCallback(() => {
    if (Platform.OS !== 'ios' || !map.current || cameraReadPending.current) return;
    cameraReadPending.current = true;
    void map.current.getCamera().then((camera) => {
      const bearing = nativeMapHeading(camera.heading);
      if (mounted.current && bearing != null) setCameraHeading(bearing);
    }).catch(() => {
      // Retain the last observed camera bearing if the native view is recycling.
    }).finally(() => { cameraReadPending.current = false; });
  }, []);

  const observeCameraMotion = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    cameraMotionUntil.current = Date.now() + 800;
    if (cameraTimer.current != null) return;
    // MapKit suppresses region events during animateCamera. Sample its actual
    // bearing only around movement, including manual rotation and overview.
    const observe = () => {
      readCameraHeading();
      cameraTimer.current = Date.now() < cameraMotionUntil.current
        ? setTimeout(observe, 80)
        : null;
    };
    observe();
  }, [readCameraHeading]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (cameraTimer.current != null) clearTimeout(cameraTimer.current);
      cameraTimer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const resetCamera = lastEpoch.current !== props.cameraEpoch || lastMode.current !== 'follow';
    const plan = nativeMapCameraPlan({
      driver: props.driver, customer: props.customer, route: selectedGeometry,
      followMode: props.followMode, following: props.following,
      heading: lastHeading.current, depth: props.mapDepthMode,
      zoom: props.followZoom, viewportHeight: height, resetCamera,
      locationFresh: props.locationFresh,
    });
    // Do not consume the initial reset before a real driver/customer fix exists.
    if (plan.mode === 'idle') return;
    lastEpoch.current = props.cameraEpoch;
    lastMode.current = plan.mode;
    if (plan.mode === 'overview') {
      const revision = `${props.routeRevision}:${props.cameraEpoch}:${props.bottomPadding}:${height}:${customer?.latitude}:${customer?.longitude}`;
      if (lastOverview.current === revision) return;
      lastOverview.current = revision;
      map.current.fitToCoordinates(plan.coordinates, {
        edgePadding: { top: props.topPadding + 28, bottom: props.bottomPadding + 28, left: 48, right: 72 },
        animated: !props.reduceMotion,
      });
    } else if (plan.mode === 'destination') {
      map.current.animateToRegion({ ...plan.center, latitudeDelta: 0.035, longitudeDelta: 0.035 }, props.reduceMotion ? 0 : 350);
    } else {
      const { mode: _mode, altitude, zoom, ...camera } = plan;
      map.current.animateCamera({ ...camera, ...(Platform.OS === 'ios'
        ? (altitude == null ? {} : { altitude })
        : (zoom == null ? {} : { zoom })) }, { duration: props.reduceMotion ? 0 : 450 });
    }
    observeCameraMotion();
  }, [ready, props.driver, props.customer, selectedGeometry, props.followMode,
    props.following, props.mapDepthMode, props.followZoom, props.cameraEpoch,
    props.routeRevision, props.bottomPadding, props.topPadding, props.reduceMotion,
    props.locationFresh, props.displayHeading, height, customer?.latitude, customer?.longitude, observeCameraMotion]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{ ...(driver ?? customer ?? { latitude: 55.86, longitude: -4.25 }), latitudeDelta: 0.055, longitudeDelta: 0.055 }}
      mapType={props.mapStyleMode === 'satellite' ? 'hybrid' : 'standard'}
      userInterfaceStyle="light"
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass
      compassOffset={{ x: 0, y: props.topPadding }}
      showsScale={false}
      showsTraffic={false}
      showsBuildings={props.mapDepthMode === '3d'}
      showsPointsOfInterests={false}
      pitchEnabled
      rotateEnabled
      moveOnMarkerPress={false}
      mapPadding={{ top: props.topPadding, bottom: props.bottomPadding, left: 16, right: 16 }}
      onPanDrag={props.onPan}
      onRegionChange={observeCameraMotion}
      onRegionChangeComplete={observeCameraMotion}
      onMapReady={() => { setReady(true); props.onReady(); }}
      accessibilityLabel="Driver navigation map"
    >
      {props.showAlternatives && alternatives.map(({ index, segment, coordinates }) => (
        <Polyline key={`alternative-${index}-${segment}`} coordinates={coordinates}
          strokeColor="#A9BCE5" strokeWidth={7} tappable onPress={() => props.onSelectAlternative(index)} zIndex={1} />
      ))}
      {travelled.map((coordinates, index) => <Polyline key={`travelled-${index}`} coordinates={coordinates}
        strokeColor="#9AA0A6" strokeWidth={6} zIndex={2} />)}
      {remaining.map((coordinates, index) => <Polyline key={`route-case-${index}`} coordinates={coordinates}
        strokeColor="#FFFFFF" strokeWidth={12} lineCap="round" lineJoin="round" zIndex={3} />)}
      {remaining.map((coordinates, index) => <Polyline key={`route-${index}`} coordinates={coordinates}
        strokeColor={ROUTE_BLUE} strokeWidth={7} lineCap="round" lineJoin="round" zIndex={4} />)}
      {customer && <Marker coordinate={customer} title={props.customerLabel} pinColor="#EA4335" identifier="customer" zIndex={8} />}
      {driver && <Marker coordinate={driver} title={props.driverLabel} identifier="driver"
        anchor={{ x: 0.5, y: 0.5 }} centerOffset={{ x: 0, y: 0 }}
        flat={Platform.OS !== 'ios'} rotation={Platform.OS === 'ios' ? 0 : lastHeading.current ?? 0}
        tracksViewChanges={Platform.OS === 'ios'} zIndex={10}>
        <View style={[styles.driverHalo, !props.locationFresh && styles.staleHalo]}>
          <View style={[styles.driverPuck, !props.locationFresh && styles.stalePuck]}>
            {markerRotation != null && <Ionicons name="navigate" size={24} color="#FFFFFF"
              style={{ transform: [{ rotate: `${(Platform.OS === 'ios' ? markerRotation : 0) - 45}deg` }] }} />}
          </View>
        </View>
      </Marker>}
    </MapView>
  );
}

const styles = StyleSheet.create({
  driverHalo: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(26,115,232,0.14)', alignItems: 'center', justifyContent: 'center' },
  driverPuck: { width: 38, height: 38, borderRadius: 19, backgroundColor: ROUTE_BLUE, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0D3D75', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  staleHalo: { backgroundColor: 'rgba(95,99,104,0.15)' },
  stalePuck: { backgroundColor: '#6B7280' },
});
