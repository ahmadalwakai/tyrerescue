import Mapbox from '@rnmapbox/maps';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MAPBOX_TOKEN } from './config';
import {
  MAPBOX_DARK_STYLE_URL,
  ROUTE_LINE_COLOR,
  type LiveMapMarker,
  type MapCoordinate,
} from './mapbox';
import { colors, typography } from './theme';

if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}

const DEFAULT_CENTER: MapCoordinate = [-4.2518, 55.8617];

export function PulsingMap({
  markers,
  routeCoordinates,
  centerCoordinate,
  zoomLevel = 13,
  style,
}: {
  markers: LiveMapMarker[];
  routeCoordinates?: MapCoordinate[] | null;
  centerCoordinate?: MapCoordinate;
  zoomLevel?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const visibleCoordinates = useMemo(
    () => [...(routeCoordinates ?? []), ...markers.map((marker) => marker.coordinate)],
    [markers, routeCoordinates],
  );
  const cameraBounds = useMemo(() => getCameraBounds(visibleCoordinates), [visibleCoordinates]);
  const cameraCenter = centerCoordinate ?? getCenterCoordinate(visibleCoordinates);
  const routeShape = useMemo(() => getRouteShape(routeCoordinates), [routeCoordinates]);

  if (!MAPBOX_TOKEN) {
    return (
      <View style={[styles.frame, styles.unavailable, style]}>
        <Text style={styles.unavailableText}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, style]}>
      <Mapbox.MapView
        compassEnabled
        rotateEnabled
        scaleBarEnabled={false}
        style={styles.map}
        styleURL={MAPBOX_DARK_STYLE_URL}
      >
        <Mapbox.Camera
          animationDuration={550}
          animationMode="easeTo"
          bounds={cameraBounds ?? undefined}
          centerCoordinate={cameraBounds ? undefined : cameraCenter}
          zoomLevel={cameraBounds ? undefined : zoomLevel}
        />
        {routeShape ? (
          <Mapbox.ShapeSource id="booking-route-source" shape={routeShape}>
            <Mapbox.LineLayer
              id="booking-route-line"
              style={{
                lineCap: 'round',
                lineColor: ROUTE_LINE_COLOR,
                lineJoin: 'round',
                lineOpacity: 0.95,
                lineWidth: 5,
              }}
            />
          </Mapbox.ShapeSource>
        ) : null}
        {markers.map((marker) => (
          <Mapbox.MarkerView
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={marker.coordinate}
            key={marker.id}
          >
            <RadarPulse color={marker.color} />
          </Mapbox.MarkerView>
        ))}
      </Mapbox.MapView>
    </View>
  );
}

function getCenterCoordinate(coordinates: MapCoordinate[]) {
  if (coordinates.length === 0) return DEFAULT_CENTER;
  const total = coordinates.reduce(
    (sum, coordinate) => ({
      lng: sum.lng + coordinate[0],
      lat: sum.lat + coordinate[1],
    }),
    { lng: 0, lat: 0 },
  );

  return [total.lng / coordinates.length, total.lat / coordinates.length] as MapCoordinate;
}

function getCameraBounds(coordinates: MapCoordinate[]) {
  if (coordinates.length < 2) return null;
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  if (minLng === maxLng && minLat === maxLat) return null;

  return {
    ne: [maxLng, maxLat] as MapCoordinate,
    paddingBottom: 44,
    paddingLeft: 44,
    paddingRight: 44,
    paddingTop: 44,
    sw: [minLng, minLat] as MapCoordinate,
  };
}

function getRouteShape(routeCoordinates?: MapCoordinate[] | null) {
  if (!routeCoordinates || routeCoordinates.length < 2) return null;

  return {
    geometry: {
      coordinates: routeCoordinates,
      type: 'LineString',
    },
    properties: {},
    type: 'Feature',
  } as GeoJSON.Feature<GeoJSON.LineString>;
}

function RadarPulse({ color }: { color: string }) {
  const first = useRef(new Animated.Value(0)).current;
  const second = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const firstLoop = createRadarLoop(first, 0);
    const secondLoop = createRadarLoop(second, 800);
    firstLoop.start();
    secondLoop.start();

    return () => {
      firstLoop.stop();
      secondLoop.stop();
    };
  }, [first, second]);

  return (
    <View style={styles.radarPulse}>
      <PulseRing color={color} progress={first} />
      <PulseRing color={color} progress={second} />
      <View style={[styles.radarPulseDot, { backgroundColor: color, borderColor: `${color}55` }]} />
    </View>
  );
}

function PulseRing({ color, progress }: { color: string; progress: Animated.Value }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.65, 1],
    outputRange: [0, 0.72, 0.28, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 3.2],
  });

  return (
    <Animated.View
      style={[
        styles.radarPulseRing,
        {
          borderColor: color,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function createRadarLoop(value: Animated.Value, delay: number) {
  const duration = 1800;
  const cycle = 2600;
  const rest = Math.max(0, cycle - delay - duration);

  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
      Animated.delay(rest),
    ]),
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  radarPulse: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  radarPulseRing: {
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    position: 'absolute',
    width: 28,
  },
  radarPulseDot: {
    borderRadius: 7,
    borderWidth: 4,
    height: 14,
    width: 14,
  },
  unavailable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 13,
  },
});
