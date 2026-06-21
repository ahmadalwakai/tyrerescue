import { createElement, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { MAPBOX_TOKEN } from './config';
import {
  MAPBOX_DARK_STYLE_URL,
  ROUTE_LINE_COLOR,
  type LiveMapMarker,
  type MapCoordinate,
} from './mapbox';
import { colors, typography } from './theme';

type MapboxGL = typeof import('mapbox-gl').default;
type MapboxMap = import('mapbox-gl').Map;
type MapboxMarker = import('mapbox-gl').Marker;
type MapboxGeoJSONSource = import('mapbox-gl').GeoJSONSource;

const DEFAULT_CENTER: MapCoordinate = [-4.2518, 55.8617];
const ROUTE_SOURCE_ID = 'booking-route-source';
const ROUTE_LAYER_ID = 'booking-route-line';

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRefs = useRef<MapboxMarker[]>([]);
  const readyRef = useRef(false);
  const initialCenterRef = useRef<MapCoordinate | null>(null);
  const initialZoomRef = useRef(zoomLevel);
  const latestMapDataRef = useRef({
    markers,
    routeCoordinates,
    visibleCoordinates: [] as MapCoordinate[],
    zoomLevel,
  });
  const visibleCoordinates = useMemo(
    () => [...(routeCoordinates ?? []), ...markers.map((marker) => marker.coordinate)],
    [markers, routeCoordinates],
  );
  const cameraCenter = centerCoordinate ?? getCenterCoordinate(visibleCoordinates);
  if (!initialCenterRef.current) initialCenterRef.current = cameraCenter;

  useEffect(() => {
    latestMapDataRef.current = {
      markers,
      routeCoordinates,
      visibleCoordinates,
      zoomLevel,
    };
  }, [markers, routeCoordinates, visibleCoordinates, zoomLevel]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    let cancelled = false;
    void import('mapbox-gl').then((module) => {
      if (cancelled || !containerRef.current) return;
      const mapboxgl = module.default as MapboxGL;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      injectMapboxCss();
      injectPulseCss();

      const map = new mapboxgl.Map({
        attributionControl: true,
        center: initialCenterRef.current ?? DEFAULT_CENTER,
        container: containerRef.current,
        interactive: true,
        style: MAPBOX_DARK_STYLE_URL,
        zoom: initialZoomRef.current,
      });

      mapRef.current = map;
      map.on('load', () => {
      readyRef.current = true;
        const latest = latestMapDataRef.current;
        syncMap(
          mapboxgl,
          map,
          markerRefs,
          latest.markers,
          latest.routeCoordinates,
          latest.visibleCoordinates,
          latest.zoomLevel,
        );
      });
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    void import('mapbox-gl').then((module) => {
      const mapboxgl = module.default as MapboxGL;
      syncMap(mapboxgl, mapRef.current, markerRefs, markers, routeCoordinates, visibleCoordinates, zoomLevel);
    });
  }, [markers, routeCoordinates, visibleCoordinates, zoomLevel]);

  if (!MAPBOX_TOKEN) {
    return (
      <View style={[styles.frame, styles.unavailable, style]}>
        <Text style={styles.unavailableText}>Map unavailable</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, style]}>
      {createElement('div', { ref: containerRef, style: webMapStyle })}
    </View>
  );
}

function syncMap(
  mapboxgl: MapboxGL,
  map: MapboxMap | null,
  markerRefs: MutableRefObject<MapboxMarker[]>,
  markers: LiveMapMarker[],
  routeCoordinates: MapCoordinate[] | null | undefined,
  visibleCoordinates: MapCoordinate[],
  zoomLevel: number,
) {
  if (!map) return;
  markerRefs.current.forEach((marker) => marker.remove());
  markerRefs.current = markers.map((marker) =>
    new mapboxgl.Marker({ element: createPulseElement(marker.color), pitchAlignment: 'map' })
      .setLngLat(marker.coordinate)
      .addTo(map),
  );

  syncRouteSource(map, routeCoordinates);
  const bounds = getBounds(mapboxgl, visibleCoordinates);
  if (bounds) {
    map.fitBounds(bounds, { duration: 500, maxZoom: 14, padding: 44 });
  } else {
    map.easeTo({ center: getCenterCoordinate(visibleCoordinates), duration: 500, zoom: zoomLevel });
  }
}

function syncRouteSource(map: MapboxMap, routeCoordinates?: MapCoordinate[] | null) {
  const data = getRouteFeatureCollection(routeCoordinates);
  const source = map.getSource(ROUTE_SOURCE_ID) as MapboxGeoJSONSource | undefined;

  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(ROUTE_SOURCE_ID, {
    data,
    type: 'geojson',
  });
  map.addLayer({
    id: ROUTE_LAYER_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': ROUTE_LINE_COLOR,
      'line-opacity': 0.95,
      'line-width': 5,
    },
    source: ROUTE_SOURCE_ID,
    type: 'line',
  });
}

function getRouteFeatureCollection(routeCoordinates?: MapCoordinate[] | null): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features =
    routeCoordinates && routeCoordinates.length > 1
      ? [
          {
            geometry: {
              coordinates: routeCoordinates,
              type: 'LineString',
            },
            properties: {},
            type: 'Feature',
          } as GeoJSON.Feature<GeoJSON.LineString>,
        ]
      : [];

  return {
    features,
    type: 'FeatureCollection',
  };
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

function getBounds(mapboxgl: MapboxGL, coordinates: MapCoordinate[]) {
  if (coordinates.length < 2) return null;
  const lngs = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  if (minLng === maxLng && minLat === maxLat) return null;

  return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

function createPulseElement(color: string) {
  const root = document.createElement('div');
  root.className = 'tyre-rescue-pulse';
  root.style.setProperty('--pulse-color', color);
  root.style.setProperty('--pulse-border-color', `${color}55`);
  root.innerHTML = '<span></span><span></span><i></i>';
  return root;
}

function injectMapboxCss() {
  if (document.getElementById('tyre-rescue-mapbox-css')) return;
  const link = document.createElement('link');
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
  link.id = 'tyre-rescue-mapbox-css';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

function injectPulseCss() {
  if (document.getElementById('tyre-rescue-pulse-css')) return;
  const style = document.createElement('style');
  style.id = 'tyre-rescue-pulse-css';
  style.textContent = `
    @keyframes tyre-rescue-radar-pulse {
      0% { opacity: 0; transform: scale(0.65); }
      8% { opacity: 0.72; }
      65% { opacity: 0.28; }
      100% { opacity: 0; transform: scale(3.2); }
    }
    .tyre-rescue-pulse {
      align-items: center;
      display: flex;
      height: 64px;
      justify-content: center;
      pointer-events: none;
      width: 64px;
    }
    .tyre-rescue-pulse span {
      animation: tyre-rescue-radar-pulse 2600ms infinite;
      border: 2px solid var(--pulse-color);
      border-radius: 14px;
      height: 28px;
      position: absolute;
      width: 28px;
    }
    .tyre-rescue-pulse span:nth-child(2) {
      animation-delay: 800ms;
    }
    .tyre-rescue-pulse i {
      background: var(--pulse-color);
      border: 4px solid var(--pulse-border-color);
      border-radius: 7px;
      height: 14px;
      position: absolute;
      width: 14px;
    }
  `;
  document.head.appendChild(style);
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
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

const webMapStyle = {
  height: '100%',
  width: '100%',
};
