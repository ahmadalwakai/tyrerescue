'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, VStack, HStack, Text, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import { GARAGE_LOCATION } from '@/lib/garage';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set Mapbox access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface QuickBookMapProps {
  customerLat: number;
  customerLng: number;
  /** Service origin latitude (driver or garage). Falls back to GARAGE_LOCATION if not provided. */
  serviceOriginLat?: number | null;
  /** Service origin longitude (driver or garage). Falls back to GARAGE_LOCATION if not provided. */
  serviceOriginLng?: number | null;
  /** Source of service origin: 'driver' or 'garage'. */
  serviceOriginSource?: 'driver' | 'garage' | null;
  showRoute?: boolean;
  onRouteCalculated?: (drivingKm: number | null, drivingMinutes: number | null) => void;
}

export function QuickBookMap({
  customerLat,
  customerLng,
  serviceOriginLat,
  serviceOriginLng,
  serviceOriginSource,
  showRoute = true,
  onRouteCalculated,
}: QuickBookMapProps) {
  // Use provided service origin or fall back to garage
  const serviceLocation = (serviceOriginLat != null && serviceOriginLng != null)
    ? { lat: serviceOriginLat, lng: serviceOriginLng }
    : GARAGE_LOCATION;
  const isDriverOrigin = serviceOriginSource === 'driver';
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const shopMarker = useRef<mapboxgl.Marker | null>(null);
  const customerMarker = useRef<mapboxgl.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [routeInfo, setRouteInfo] = useState<{ km: number; minutes: number } | null>(null);
  const lastRouteCoords = useRef<string | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Calculate center point between service origin and customer
    const centerLat = (serviceLocation.lat + customerLat) / 2;
    const centerLng = (serviceLocation.lng + customerLng) / 2;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [centerLng, centerLat],
      zoom: 11,
    });

    map.current.on('load', () => {
      setIsLoading(false);

      // Add source for route line
      map.current!.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        },
      });

      // Add route line layer
      map.current!.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#F97316',
          'line-width': 4,
          'line-opacity': 0.8,
        },
      });

      // Fit bounds to show both markers
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([serviceLocation.lng, serviceLocation.lat]);
      bounds.extend([customerLng, customerLat]);

      map.current!.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
      });

      // Fetch route if enabled
      if (showRoute) {
        fetchRoute();
      }
    });

    // Add service origin marker (orange)
    const shopEl = document.createElement('div');
    shopEl.className = 'shop-marker';
    shopEl.style.width = '28px';
    shopEl.style.height = '28px';
    shopEl.style.borderRadius = '50%';
    shopEl.style.backgroundColor = '#F97316';
    shopEl.style.border = '3px solid #09090B';
    shopEl.style.boxShadow = '0 2px 8px rgba(249, 115, 22, 0.4)';
    shopEl.style.display = 'flex';
    shopEl.style.alignItems = 'center';
    shopEl.style.justifyContent = 'center';

    const shopInner = document.createElement('div');
    shopInner.style.width = '10px';
    shopInner.style.height = '10px';
    shopInner.style.borderRadius = '50%';
    shopInner.style.backgroundColor = 'white';
    shopEl.appendChild(shopInner);

    const markerLabel = isDriverOrigin ? '<strong>Driver Location</strong><br/>Nearest Available' : '<strong>Tyre Rescue Garage</strong><br/>Service Location';
    shopMarker.current = new mapboxgl.Marker(shopEl)
      .setLngLat([serviceLocation.lng, serviceLocation.lat])
      .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML(markerLabel))
      .addTo(map.current);

    // Add customer marker (destination - green)
    const customerEl = document.createElement('div');
    customerEl.className = 'customer-marker';
    customerEl.style.width = '28px';
    customerEl.style.height = '28px';
    customerEl.style.borderRadius = '50%';
    customerEl.style.backgroundColor = '#22c55e';
    customerEl.style.border = '3px solid #09090B';
    customerEl.style.boxShadow = '0 2px 8px rgba(34, 197, 94, 0.4)';
    customerEl.style.display = 'flex';
    customerEl.style.alignItems = 'center';
    customerEl.style.justifyContent = 'center';

    const customerInner = document.createElement('div');
    customerInner.style.width = '10px';
    customerInner.style.height = '10px';
    customerInner.style.borderRadius = '50%';
    customerInner.style.backgroundColor = 'white';
    customerEl.appendChild(customerInner);

    customerMarker.current = new mapboxgl.Marker(customerEl)
      .setLngLat([customerLng, customerLat])
      .setPopup(new mapboxgl.Popup({ offset: 15 }).setHTML('<strong>Customer Location</strong>'))
      .addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update customer marker position if props change
  useEffect(() => {
    if (!map.current || isLoading) return;

    if (customerMarker.current) {
      customerMarker.current.setLngLat([customerLng, customerLat]);
    }

    // Fit bounds to show both markers
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([serviceLocation.lng, serviceLocation.lat]);
    bounds.extend([customerLng, customerLat]);

    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 14,
    });

    // Fetch route
    if (showRoute) {
      fetchRoute();
    }
  }, [customerLat, customerLng, showRoute, isLoading]);

  // Fetch route from Mapbox Directions API
  const fetchRoute = async () => {
    if (!map.current) return;

    const coordKey = `${serviceLocation.lng},${serviceLocation.lat};${customerLng},${customerLat}`;
    if (lastRouteCoords.current === coordKey) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${serviceLocation.lng},${serviceLocation.lat};${customerLng},${customerLat}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`
      );

      if (!response.ok) return;

      const data = await response.json();
      const route = data.routes?.[0];

      if (route && map.current?.getSource('route')) {
        (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: route.geometry,
        });
        lastRouteCoords.current = coordKey;

        // Calculate driving distance and time
        const drivingKm = route.distance / 1000;
        const drivingMinutes = Math.round(route.duration / 60);

        setRouteInfo({ km: drivingKm, minutes: drivingMinutes });

        if (onRouteCalculated) {
          onRouteCalculated(drivingKm, drivingMinutes);
        }
      }
    } catch {
      // Route fetch failed silently — map still usable without route
    }
  };

  return (
    <Box position="relative" w="full" h="full" minH="250px">
      <div ref={mapContainer} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />

      {isLoading && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          bg={c.surface}
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="8px"
        >
          <VStack gap={2}>
            <Spinner size="md" color={c.accent} />
            <Text color={c.muted} fontSize="sm">Loading map...</Text>
          </VStack>
        </Box>
      )}

      {/* Map Legend */}
      <Box
        position="absolute"
        bottom="12px"
        left="12px"
        bg="rgba(9, 9, 11, 0.85)"
        borderRadius="md"
        p={2}
        border="1px solid"
        borderColor={c.border}
        fontSize="xs"
        backdropFilter="blur(4px)"
      >
        <VStack align="start" gap={1}>
          <HStack gap={2}>
            <Box
              w="12px"
              h="12px"
              borderRadius="full"
              bg="#F97316"
              border="2px solid"
              borderColor="#09090B"
            />
            <Text color={c.text}>{isDriverOrigin ? 'Driver' : 'Service'}</Text>
          </HStack>
          <HStack gap={2}>
            <Box
              w="12px"
              h="12px"
              borderRadius="full"
              bg="#22c55e"
              border="2px solid"
              borderColor="#09090B"
            />
            <Text color={c.text}>Customer</Text>
          </HStack>
        </VStack>
      </Box>

      {/* Route Info Overlay */}
      {routeInfo && (
        <Box
          position="absolute"
          top="12px"
          right="12px"
          bg="rgba(9, 9, 11, 0.85)"
          borderRadius="md"
          p={2}
          border="1px solid"
          borderColor={c.border}
          fontSize="xs"
          backdropFilter="blur(4px)"
        >
          <VStack align="end" gap={0}>
            <HStack gap={1}>
              <Text color={c.muted}>🚗</Text>
              <Text color={c.accent} fontWeight="600">{routeInfo.km.toFixed(1)} km</Text>
            </HStack>
            <HStack gap={1}>
              <Text color={c.muted}>⏱</Text>
              <Text color={c.text} fontWeight="600">{routeInfo.minutes} min</Text>
            </HStack>
          </VStack>
        </Box>
      )}
    </Box>
  );
}
