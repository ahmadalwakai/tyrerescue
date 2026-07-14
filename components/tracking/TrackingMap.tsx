'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, HStack, Spinner, Text, VStack } from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { colorTokens as c } from '@/lib/design-tokens';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface TrackingMapProps {
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  routeCoordinates?: [number, number][] | null;
  showRoute: boolean;
  etaLabel?: string | null;
  arrivalTimeLabel?: string | null;
  distanceLabel?: string | null;
  lastUpdatedLabel?: string | null;
  isLocationStale?: boolean;
}

const ROUTE_SOURCE = 'customer-tracking-route';
const ROUTE_CASE_LAYER = 'customer-tracking-route-case';
const ROUTE_MAIN_LAYER = 'customer-tracking-route-main';
const ROUTE_SHIMMER_LAYER = 'customer-tracking-route-shimmer';
const DRIVER_FOCUS_ZOOM = 14.5;
const MARKER_STYLE_ID = 'tracking-marker-radar-styles';

function ensureMarkerStyles(): void {
  if (document.getElementById(MARKER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MARKER_STYLE_ID;
  style.textContent = `
    .tracking-radar-pulse {
      position: absolute;
      left: var(--radar-left, 50%);
      top: var(--radar-top, 50%);
      width: var(--radar-size, 32px);
      height: var(--radar-size, 32px);
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 0;
    }

    .tracking-radar-ring {
      position: absolute;
      inset: 0;
      border: 2px solid var(--radar-color, #F97316);
      border-radius: 999px;
      box-shadow: 0 0 18px var(--radar-glow, rgba(249,115,22,.28));
      opacity: 0;
      animation: tracking-radar-pulse 2.4s ease-out infinite;
    }

    .tracking-radar-ring:nth-child(2) {
      animation-delay: .8s;
    }

    @keyframes tracking-radar-pulse {
      0% {
        transform: scale(.35);
        opacity: .72;
      }
      68% {
        opacity: .18;
      }
      100% {
        transform: scale(2.65);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

function isValidCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function makeCustomerMarker(): HTMLElement {
  ensureMarkerStyles();

  const el = document.createElement('div');
  el.style.cssText = [
    'width:34px',
    'height:44px',
    'position:relative',
    'overflow:visible',
    'filter:drop-shadow(0 8px 14px rgba(32,33,36,.28))',
  ].join(';');
  el.innerHTML = `
    <span class="tracking-radar-pulse" style="--radar-left:17px;--radar-top:42px;--radar-size:24px;--radar-color:#EA4335;--radar-glow:rgba(234,67,53,.28);">
      <span class="tracking-radar-ring"></span>
      <span class="tracking-radar-ring"></span>
    </span>
    <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:relative;z-index:2;">
      <path d="M17 1.5C8.6 1.5 1.8 8.2 1.8 16.5C1.8 27.8 17 43 17 43S32.2 27.8 32.2 16.5C32.2 8.2 25.4 1.5 17 1.5Z" fill="#EA4335" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="17" cy="16.5" r="6.2" fill="#FFFFFF"/>
      <circle cx="17" cy="16.5" r="3.4" fill="#EA4335"/>
    </svg>
  `;
  return el;
}

function makeDriverMarker(isStale: boolean): HTMLElement {
  ensureMarkerStyles();

  const el = document.createElement('div');
  el.style.cssText = [
    'width:66px',
    'height:58px',
    'position:relative',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:visible',
    'filter:drop-shadow(0 7px 12px rgba(32,33,36,.28))',
  ].join(';');
  const opacity = isStale ? '0.62' : '1';
  el.innerHTML = `
    <span class="tracking-radar-pulse" style="--radar-left:33px;--radar-top:29px;--radar-size:34px;--radar-color:#F97316;--radar-glow:rgba(249,115,22,.32);">
      <span class="tracking-radar-ring"></span>
      <span class="tracking-radar-ring"></span>
    </span>
    <svg width="50" height="31" viewBox="0 0 50 31" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:relative;z-index:2;opacity:${opacity}">
      <rect x="4" y="9" width="27" height="14" rx="3" fill="#F97316" stroke="#FFFFFF" stroke-width="2"/>
      <path d="M31 12H39.5L46 17V23H31V12Z" fill="#F97316" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
      <path d="M34 14H39L42.6 17H34V14Z" fill="#FED7AA"/>
      <circle cx="14" cy="24" r="4" fill="#202124" stroke="#FFFFFF" stroke-width="1.5"/>
      <circle cx="38" cy="24" r="4" fill="#202124" stroke="#FFFFFF" stroke-width="1.5"/>
    </svg>
  `;
  return el;
}

function routeFeature(coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
  };
}

function shimmerGradient(progress: number): ExpressionSpecification {
  const transparent = 'rgba(255,255,255,0)';
  const warmGlow = 'rgba(255,255,255,0.95)';
  const amberGlow = 'rgba(255,209,148,0.9)';
  const bandWidth = 0.16;
  const start = progress - bandWidth;
  const mid = progress;
  const end = progress + bandWidth;
  const stops: [number, string][] = [[0, transparent]];

  if (start > 0 && start < 1) stops.push([start, transparent]);
  if (mid > 0 && mid < 1) {
    stops.push([Math.max(0, mid - 0.035), amberGlow]);
    stops.push([mid, warmGlow]);
    stops.push([Math.min(1, mid + 0.035), amberGlow]);
  }
  if (end > 0 && end < 1) stops.push([end, transparent]);
  stops.push([1, transparent]);

  const deduped = stops
    .sort((a, b) => a[0] - b[0])
    .reduce<[number, string][]>((acc, stop) => {
      const last = acc[acc.length - 1];
      if (!last || Math.abs(last[0] - stop[0]) > 0.001) acc.push(stop);
      return acc;
    }, []);

  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...deduped.flat(),
  ] as ExpressionSpecification;
}

export function TrackingMap({
  customerLat,
  customerLng,
  driverLat,
  driverLng,
  routeCoordinates,
  showRoute,
  etaLabel,
  arrivalTimeLabel,
  distanceLabel,
  lastUpdatedLabel,
  isLocationStale = false,
}: TrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const customerMarker = useRef<mapboxgl.Marker | null>(null);
  const driverMarker = useRef<mapboxgl.Marker | null>(null);
  const lastRouteKey = useRef<string | null>(null);
  const lastCameraKey = useRef<string | null>(null);
  const shimmerFrame = useRef<number | null>(null);
  const mapReadyInterval = useRef<number | null>(null);
  const mapReadyTimeout = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStyleReady, setIsStyleReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const customerValid = isValidCoord(customerLat, customerLng);
  const driverValid = isValidCoord(driverLat, driverLng);
  const cleanRoute = useMemo(
    () =>
      showRoute && routeCoordinates && routeCoordinates.length >= 2
        ? routeCoordinates.filter(
            (coord): coord is [number, number] =>
              Array.isArray(coord) &&
              coord.length >= 2 &&
              Number.isFinite(coord[0]) &&
              Number.isFinite(coord[1]),
          )
        : null,
    [routeCoordinates, showRoute],
  );

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    if (!mapboxgl.accessToken) {
      setMapError('Map is unavailable right now.');
      setIsLoading(false);
      return;
    }

    const startLng = driverValid ? driverLng! : customerLng;
    const startLat = driverValid ? driverLat! : customerLat;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [startLng, startLat],
        zoom: driverValid ? 12 : 14,
        attributionControl: false,
      });
      const markMapReady = () => {
        setIsStyleReady(true);
        setIsLoading(false);
      };
      map.current.addControl(
        new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
        'bottom-right',
      );
      map.current.on('load', markMapReady);
      map.current.on('style.load', markMapReady);
      map.current.on('idle', markMapReady);
      map.current.on('error', () => {
        setMapError('Map could not load. Tracking is still active.');
        setIsLoading(false);
      });
      mapReadyInterval.current = window.setInterval(() => {
        if (map.current?.isStyleLoaded()) {
          markMapReady();
          if (mapReadyInterval.current) {
            window.clearInterval(mapReadyInterval.current);
            mapReadyInterval.current = null;
          }
        }
      }, 250);
      mapReadyTimeout.current = window.setTimeout(() => {
        if (map.current) setIsLoading(false);
        if (mapReadyInterval.current) {
          window.clearInterval(mapReadyInterval.current);
          mapReadyInterval.current = null;
        }
      }, 5000);
    } catch {
      setMapError('Map could not load. Tracking is still active.');
      setIsLoading(false);
    }

    return () => {
      map.current?.remove();
      map.current = null;
      customerMarker.current = null;
      driverMarker.current = null;
      setIsStyleReady(false);
      lastRouteKey.current = null;
      lastCameraKey.current = null;
      if (shimmerFrame.current) cancelAnimationFrame(shimmerFrame.current);
      if (mapReadyInterval.current) window.clearInterval(mapReadyInterval.current);
      if (mapReadyTimeout.current) window.clearTimeout(mapReadyTimeout.current);
      shimmerFrame.current = null;
      mapReadyInterval.current = null;
      mapReadyTimeout.current = null;
    };
    // The map instance is created once; later coordinate updates mutate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !customerValid) return;

    if (!customerMarker.current) {
      customerMarker.current = new mapboxgl.Marker({
        element: makeCustomerMarker(),
        anchor: 'bottom',
      })
        .setLngLat([customerLng, customerLat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML('<strong>Your location</strong>'))
        .addTo(instance);
    } else {
      customerMarker.current.setLngLat([customerLng, customerLat]);
    }
  }, [customerLat, customerLng, customerValid]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    if (!driverValid) {
      driverMarker.current?.remove();
      driverMarker.current = null;
      return;
    }

    driverMarker.current?.remove();
    driverMarker.current = new mapboxgl.Marker({
      element: makeDriverMarker(isLocationStale),
      anchor: 'center',
    })
      .setLngLat([driverLng!, driverLat!])
      .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML('<strong>Your driver</strong>'))
      .addTo(instance);
  }, [driverLat, driverLng, driverValid, isLocationStale]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !isStyleReady) return;

    const key = cleanRoute?.map((coord) => coord.join(',')).join('|') ?? 'none';
    if (key === lastRouteKey.current) return;
    lastRouteKey.current = key;

    if (!cleanRoute || cleanRoute.length < 2) {
      if (instance.getLayer(ROUTE_SHIMMER_LAYER)) instance.removeLayer(ROUTE_SHIMMER_LAYER);
      if (instance.getLayer(ROUTE_MAIN_LAYER)) instance.removeLayer(ROUTE_MAIN_LAYER);
      if (instance.getLayer(ROUTE_CASE_LAYER)) instance.removeLayer(ROUTE_CASE_LAYER);
      if (instance.getSource(ROUTE_SOURCE)) instance.removeSource(ROUTE_SOURCE);
      return;
    }

    const data = routeFeature(cleanRoute);
    const source = instance.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    } else {
      instance.addSource(ROUTE_SOURCE, { type: 'geojson', data, lineMetrics: true });
    }

    if (!instance.getLayer(ROUTE_CASE_LAYER)) {
      instance.addLayer({
        id: ROUTE_CASE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 13, 17, 18],
          'line-opacity': 0.96,
        },
      });
    }

    if (!instance.getLayer(ROUTE_MAIN_LAYER)) {
      instance.addLayer({
        id: ROUTE_MAIN_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#F97316',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8, 17, 12],
          'line-opacity': 0.98,
        },
      });
    }

    if (!instance.getLayer(ROUTE_SHIMMER_LAYER)) {
      instance.addLayer({
        id: ROUTE_SHIMMER_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-gradient': shimmerGradient(-0.2),
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 8, 17, 12],
          'line-opacity': 1,
          'line-blur': 0.4,
        },
      });
    }
  }, [cleanRoute, isStyleReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !isStyleReady || !cleanRoute || cleanRoute.length < 2) return;

    let isActive = true;
    const startedAt = performance.now();

    const animate = (time: number) => {
      if (!isActive) return;
      if (instance.getLayer(ROUTE_SHIMMER_LAYER)) {
        const cycle = ((time - startedAt) % 2600) / 2600;
        const progress = cycle * 1.35 - 0.18;
        instance.setPaintProperty(ROUTE_SHIMMER_LAYER, 'line-gradient', shimmerGradient(progress));
      }
      shimmerFrame.current = requestAnimationFrame(animate);
    };

    shimmerFrame.current = requestAnimationFrame(animate);

    return () => {
      isActive = false;
      if (shimmerFrame.current) cancelAnimationFrame(shimmerFrame.current);
      shimmerFrame.current = null;
    };
  }, [cleanRoute, isStyleReady]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !isStyleReady) return;

    const key = [
      driverValid ? driverLat!.toFixed(5) : 'none',
      driverValid ? driverLng!.toFixed(5) : 'none',
      customerLat.toFixed(5),
      customerLng.toFixed(5),
    ].join('|');
    if (key === lastCameraKey.current) return;
    lastCameraKey.current = key;

    if (driverValid) {
      instance.easeTo({
        center: [driverLng!, driverLat!],
        zoom: Math.max(instance.getZoom(), DRIVER_FOCUS_ZOOM),
        duration: 700,
        offset: [0, 42],
      });
      return;
    }

    instance.easeTo({
      center: [customerLng, customerLat],
      zoom: 14,
      duration: 600,
    });
  }, [customerLat, customerLng, driverLat, driverLng, driverValid, isStyleReady]);

  if (mapError) {
    return (
      <Box
        h="full"
        w="full"
        bg="#F8FAFE"
        color="#3C4043"
        display="flex"
        alignItems="center"
        justifyContent="center"
        textAlign="center"
        px={4}
      >
        <Text fontWeight="700">{mapError}</Text>
      </Box>
    );
  }

  return (
    <Box position="relative" w="full" h="full" bg="#F8FAFE">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {(etaLabel || arrivalTimeLabel || distanceLabel) && (
        <Box
          position="absolute"
          top={{ base: '10px', md: '14px' }}
          left={{ base: '10px', md: '14px' }}
          right={{ base: '10px', md: 'auto' }}
          maxW={{ base: 'calc(100% - 20px)', md: '420px' }}
          bg="rgba(255,255,255,0.94)"
          color="#202124"
          border="1px solid rgba(218,220,224,0.9)"
          boxShadow="0 10px 30px rgba(60,64,67,0.16)"
          borderRadius="8px"
          px={4}
          py={3}
        >
          <HStack justify="space-between" align="start" gap={4}>
            <Box minW="0">
              <Text fontSize="xs" color="#5F6368" fontWeight="800" textTransform="uppercase">
                Estimated arrival
              </Text>
              <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="900" lineHeight="1">
                {arrivalTimeLabel ?? 'Updating'}
              </Text>
            </Box>
            {etaLabel && (
              <Box textAlign="right" flexShrink={0}>
                <Text fontSize="xs" color="#5F6368" fontWeight="800" textTransform="uppercase">
                  Time left
                </Text>
                <Text fontSize="lg" fontWeight="900" color="#F97316">
                  {etaLabel}
                </Text>
              </Box>
            )}
          </HStack>
          <HStack gap={2} mt={2} flexWrap="wrap">
            {distanceLabel && (
              <Text fontSize="xs" color="#3C4043" fontWeight="700">
                {distanceLabel}
              </Text>
            )}
            {lastUpdatedLabel && (
              <Text fontSize="xs" color={isLocationStale ? '#B06000' : '#188038'} fontWeight="800">
                {isLocationStale ? 'Signal delayed' : 'Live'} · {lastUpdatedLabel}
              </Text>
            )}
          </HStack>
        </Box>
      )}

      {!cleanRoute && driverValid && (
        <Box
          position="absolute"
          bottom="14px"
          left="14px"
          bg="rgba(255,255,255,0.94)"
          color="#5F6368"
          border="1px solid rgba(218,220,224,0.9)"
          borderRadius="8px"
          px={3}
          py={2}
          fontSize="xs"
          fontWeight="800"
          boxShadow="0 8px 20px rgba(60,64,67,0.12)"
        >
          Road route updating
        </Box>
      )}

      {isLoading && (
        <Box
          position="absolute"
          inset="0"
          bg="#F8FAFE"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <VStack gap={2}>
            <Spinner size="md" color={c.accent} />
            <Text color="#5F6368" fontSize="sm" fontWeight="700">
              Loading live map...
            </Text>
          </VStack>
        </Box>
      )}
    </Box>
  );
}
