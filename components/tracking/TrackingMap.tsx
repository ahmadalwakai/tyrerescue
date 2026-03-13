'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, VStack, Text, Spinner } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set Mapbox access token
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

interface TrackingMapProps {
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  showRoute: boolean;
}

export function TrackingMap({
  customerLat,
  customerLng,
  driverLat,
  driverLng,
  showRoute,
}: TrackingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const customerMarker = useRef<mapboxgl.Marker | null>(null);
  const driverMarker = useRef<mapboxgl.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Calculate center point
    let centerLat = customerLat;
    let centerLng = customerLng;

    if (driverLat && driverLng) {
      centerLat = (customerLat + driverLat) / 2;
      centerLng = (customerLng + driverLng) / 2;
    }

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [centerLng, centerLat],
      zoom: 13,
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
          'line-opacity': 0.75,
        },
      });
    });

    // Add customer marker (destination)
    const customerEl = document.createElement('div');
    customerEl.className = 'customer-marker';
    customerEl.style.width = '24px';
    customerEl.style.height = '24px';
    customerEl.style.borderRadius = '50%';
    customerEl.style.backgroundColor = '#22c55e';
    customerEl.style.border = '3px solid #09090B';
    customerEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';

    customerMarker.current = new mapboxgl.Marker(customerEl)
      .setLngLat([customerLng, customerLat])
      .setPopup(new mapboxgl.Popup().setHTML('<strong>Your Location</strong>'))
      .addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update driver marker position
  useEffect(() => {
    if (!map.current || isLoading) return;

    if (driverLat && driverLng) {
      if (!driverMarker.current) {
        // Create driver marker
        const driverEl = document.createElement('div');
        driverEl.className = 'driver-marker';
        driverEl.style.width = '32px';
        driverEl.style.height = '32px';
        driverEl.style.borderRadius = '50%';
        driverEl.style.backgroundColor = '#F97316';
        driverEl.style.border = '3px solid #09090B';
        driverEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
        driverEl.style.display = 'flex';
        driverEl.style.alignItems = 'center';
        driverEl.style.justifyContent = 'center';

        // Add inner dot for driver
        const innerDot = document.createElement('div');
        innerDot.style.width = '12px';
        innerDot.style.height = '12px';
        innerDot.style.borderRadius = '50%';
        innerDot.style.backgroundColor = 'white';
        driverEl.appendChild(innerDot);

        driverMarker.current = new mapboxgl.Marker(driverEl)
          .setLngLat([driverLng, driverLat])
          .setPopup(new mapboxgl.Popup().setHTML('<strong>Driver</strong>'))
          .addTo(map.current);
      } else {
        // Update existing marker position
        driverMarker.current.setLngLat([driverLng, driverLat]);
      }

      // Fit bounds to show both markers
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([customerLng, customerLat]);
      bounds.extend([driverLng, driverLat]);

      map.current.fitBounds(bounds, {
        padding: 60,
        maxZoom: 15,
      });

      // Fetch and display route
      if (showRoute) {
        fetchRoute(driverLng, driverLat, customerLng, customerLat);
      }
    }
  }, [driverLat, driverLng, showRoute, isLoading]);

  // Fetch route from Mapbox Directions API
  const fetchRoute = async (
    fromLng: number,
    fromLat: number,
    toLng: number,
    toLat: number
  ) => {
    if (!map.current) return;

    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLng},${fromLat};${toLng},${toLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      if (!response.ok) return;

      const data = await response.json();
      const route = data.routes?.[0]?.geometry?.coordinates;

      if (route && map.current.getSource('route')) {
        (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: route,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  };

  return (
    <Box position="relative" w="full" h="full">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
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
        >
          <VStack gap={2}>
            <Spinner size="md" />
            <Text color={c.muted} fontSize="sm">Loading map...</Text>
          </VStack>
        </Box>
      )}

      {/* Map Legend */}
      <Box
        position="absolute"
        bottom="16px"
        left="16px"
        bg={c.card}
        borderRadius="md"
        p={3}
        border="1px solid"
        borderColor={c.border}
        fontSize="sm"
      >
        <VStack align="start" gap={2}>
          <HStack gap={2}>
            <Box
              w="16px"
              h="16px"
              borderRadius="full"
              bg="green.500"
              border="2px solid"
              borderColor={c.card}
              boxShadow="sm"
            />
            <Text>Your Location</Text>
          </HStack>
          {(driverLat && driverLng) && (
            <HStack gap={2}>
              <Box
                w="16px"
                h="16px"
                borderRadius="full"
                bg={c.accent}
                border="2px solid"
                borderColor={c.card}
                boxShadow="sm"
              />
              <Text>Driver</Text>
            </HStack>
          )}
        </VStack>
      </Box>
    </Box>
  );
}

// HStack component for legend
function HStack({ children, gap }: { children: React.ReactNode; gap: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${gap * 4}px` }}>
      {children}
    </div>
  );
}
