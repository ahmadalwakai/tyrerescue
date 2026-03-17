'use client';

import { useState, useEffect, useRef } from 'react';
import { Box, VStack, HStack, Text, Button, Spinner } from '@chakra-ui/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { WizardState } from './types';
import { colorTokens as c } from '@/lib/design-tokens';
import { API } from '@/lib/api-endpoints';

if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
}

interface EligibilityResult {
  eligible: boolean;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  etaLabel: string;
  distanceMiles: number;
  source: string;
  driverId: string | null;
  driverName: string | null;
  driverLat: number | null;
  driverLng: number | null;
  routeDurationMinutes: number | null;
  driversOnline: number;
  message: string;
}

interface StepEligibilityProps {
  state: WizardState;
  updateState: (updates: Partial<WizardState>) => void;
  goToNext: () => void;
  goToPrev: () => void;
}

export function StepEligibility({
  state,
  updateState,
  goToNext,
  goToPrev,
}: StepEligibilityProps) {
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);

  // Route map state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distanceMiles: number;
    durationMinutes: number;
  } | null>(null);

  useEffect(() => {
    if (fetched.current) return;
    if (!state.lat || !state.lng) return;
    fetched.current = true;

    async function check() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(API.AVAILABILITY_ELIGIBILITY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: state.lat, lng: state.lng }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Eligibility check failed');
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to check availability');
      } finally {
        setLoading(false);
      }
    }

    check();
  }, [state.lat, state.lng]);

  const handleContinue = () => {
    if (!result?.eligible) return;
    updateState({
      emergencyEta: result.etaMinMinutes,
      emergencyEtaMin: result.etaMinMinutes,
      emergencyEtaMax: result.etaMaxMinutes,
      emergencyEtaLabel: result.etaLabel,
      nearestDriverId: result.driverId,
      nearestDriverName: result.driverName,
      nearestDriverLat: result.driverLat,
      nearestDriverLng: result.driverLng,
    });
    goToNext();
  };

  const handleRetry = () => {
    fetched.current = false;
    setResult(null);
    setError(null);
    setLoading(true);
    // Re-trigger by flipping the ref; remount approach
    setTimeout(() => {
      fetched.current = false;
      // Manually re-run
      (async () => {
        try {
          const res = await fetch(API.AVAILABILITY_ELIGIBILITY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: state.lat, lng: state.lng }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Eligibility check failed');
          setResult(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to check availability');
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
  };

  // Route map initialization — runs when eligible result arrives
  useEffect(() => {
    if (!result?.eligible || !mapContainerRef.current) return;
    if (mapRef.current) return;
    if (!state.lat || !state.lng) return;

    const custLng = state.lng;
    const custLat = state.lat;
    const drvLat = result.driverLat;
    const drvLng = result.driverLng;

    const center: [number, number] =
      drvLng != null && drvLat != null
        ? [(custLng + drvLng) / 2, (custLat + drvLat) / 2]
        : [custLng, custLat];

    const m = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: 12,
    });
    mapRef.current = m;

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    m.on('load', async () => {
      m.resize();

      // Customer marker (green dot)
      const custEl = document.createElement('div');
      custEl.style.width = '18px';
      custEl.style.height = '18px';
      custEl.style.borderRadius = '50%';
      custEl.style.backgroundColor = '#22C55E';
      custEl.style.border = `3px solid ${c.bg}`;
      custEl.style.boxShadow = '0 0 8px rgba(34,197,94,0.35)';
      new mapboxgl.Marker({ element: custEl, anchor: 'center' })
        .setLngLat([custLng, custLat])
        .addTo(m);

      if (drvLng != null && drvLat != null) {
        // Driver marker — stable root wrapper, animation on child only
        const drvEl = document.createElement('div');
        drvEl.style.width = '28px';
        drvEl.style.height = '28px';
        drvEl.style.position = 'relative';

        const drvCore = document.createElement('div');
        drvCore.className = 'map-marker-pulse';
        drvCore.style.width = '28px';
        drvCore.style.height = '28px';
        drvCore.style.borderRadius = '50%';
        drvCore.style.backgroundColor = c.accent;
        drvCore.style.border = `3px solid ${c.bg}`;
        drvCore.style.boxShadow = `0 0 12px ${c.accentGlow}`;
        drvCore.style.animation = 'mapMarkerPulse 3s ease-in-out infinite';
        drvEl.appendChild(drvCore);

        const ring = document.createElement('div');
        ring.className = 'map-marker-ring';
        ring.style.position = 'absolute';
        ring.style.inset = '-8px';
        ring.style.borderRadius = '50%';
        ring.style.border = `2px solid ${c.accent}`;
        ring.style.animation = 'mapMarkerPing 3s ease-out infinite';
        ring.style.opacity = '0';
        drvEl.appendChild(ring);

        new mapboxgl.Marker({ element: drvEl, anchor: 'center' })
          .setLngLat([drvLng, drvLat])
          .addTo(m);

        // Fit bounds to show both markers
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([custLng, custLat]);
        bounds.extend([drvLng, drvLat]);

        // Fetch route geometry from Mapbox Directions
        try {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
          const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${drvLng},${drvLat};${custLng},${custLat}?geometries=geojson&overview=full&access_token=${token}`,
          );
          const data = await res.json();
          const route = data.routes?.[0];
          if (route) {
            m.addSource('route', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: route.geometry },
            });
            m.addLayer({
              id: 'route-line',
              type: 'line',
              source: 'route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': c.accent, 'line-width': 4, 'line-opacity': 0.75 },
            });
            const coords: [number, number][] = route.geometry.coordinates;
            for (const coord of coords) bounds.extend(coord);
            setRouteInfo({
              distanceMiles: Math.round(route.distance * 0.000621371 * 10) / 10,
              durationMinutes: Math.round(route.duration / 60),
            });
          }
        } catch {
          // Route fetch failed — non-fatal, map still shows markers
        }

        m.fitBounds(bounds, { padding: 60, maxZoom: 14 });
      }
    });
  }, [result, state.lat, state.lng]);

  // Map cleanup
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <VStack py={16} gap={4} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Box
          w="48px"
          h="48px"
          borderRadius="full"
          bg={c.accent}
          display="flex"
          alignItems="center"
          justifyContent="center"
          style={{ animation: 'pulseGlow 2s infinite' }}
        >
          <Spinner size="md" color={c.bg} />
        </Box>
        <Text
          fontSize="20px"
          fontWeight="700"
          color={c.text}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CHECKING AVAILABILITY
        </Text>
        <Text fontSize="14px" color={c.muted} style={{ fontFamily: 'var(--font-body)' }}>
          Finding the nearest driver to your location...
        </Text>
      </VStack>
    );
  }

  // Error state
  if (error) {
    return (
      <VStack py={12} gap={4} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Box
          p={4}
          bg="rgba(239,68,68,0.1)"
          borderRadius="md"
          borderWidth="1px"
          borderColor="rgba(239,68,68,0.3)"
          textAlign="center"
          w="full"
        >
          <Text fontWeight="600" color="red.400" mb={2}>
            Unable to check availability
          </Text>
          <Text color={c.muted} fontSize="sm" mb={3}>
            {error}
          </Text>
        </Box>
        <HStack gap={3}>
          <Button variant="outline" onClick={goToPrev} borderColor={c.border} color={c.text}>
            Back
          </Button>
          <Button bg={c.accent} color={c.bg} _hover={{ bg: c.accentHover }} onClick={handleRetry}>
            Try Again
          </Button>
        </HStack>
      </VStack>
    );
  }

  // Not eligible
  if (result && !result.eligible) {
    return (
      <VStack py={12} gap={5} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        <Text
          fontSize={{ base: '28px', md: '40px' }}
          fontWeight="700"
          color={c.text}
          textAlign="center"
          lineHeight="1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          OUTSIDE SERVICE AREA
        </Text>
        <Box
          p={4}
          bg={c.surface}
          borderRadius="md"
          borderWidth="1px"
          borderColor={c.border}
          textAlign="center"
          w="full"
        >
          <Text color={c.muted} fontSize="14px" mb={3} style={{ fontFamily: 'var(--font-body)' }}>
            {result.message}
          </Text>
          <Text color={c.muted} fontSize="13px" style={{ fontFamily: 'var(--font-body)' }}>
            Call us:{' '}
            <a href="tel:01412660690" style={{ color: c.accent, fontWeight: 600 }}>
              0141 266 0690
            </a>
          </Text>
        </Box>
        <Button variant="outline" onClick={goToPrev} borderColor={c.border} color={c.text}>
          Change Location
        </Button>
      </VStack>
    );
  }

  // Eligible — show route map, ETA, acceptance window
  return (
    <VStack py={8} gap={6} style={{ animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
      <Text
        fontSize={{ base: '28px', md: '40px' }}
        fontWeight="700"
        color={c.text}
        textAlign="center"
        lineHeight="1"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        DRIVER AVAILABLE
      </Text>

      {/* Route map */}
      {result!.driverLat != null && result!.driverLng != null && (
        <Box
          ref={mapContainerRef}
          w="full"
          h={{ base: '220px', md: '300px' }}
          borderRadius="8px"
          overflow="hidden"
          border={`1px solid ${c.border}`}
          position="relative"
        />
      )}

      {/* Route distance & drive time */}
      {routeInfo && (
        <HStack gap={3} w="full">
          <Box flex={1} textAlign="center" bg={c.surface} p={3} borderRadius="8px" borderWidth="1px" borderColor={c.border}>
            <Text fontSize="22px" fontWeight="700" color={c.text} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
              {routeInfo.distanceMiles} mi
            </Text>
            <Text fontSize="11px" color={c.muted} mt={1} letterSpacing="0.1em" style={{ fontFamily: 'var(--font-body)' }}>
              ROUTE DISTANCE
            </Text>
          </Box>
          <Box flex={1} textAlign="center" bg={c.surface} p={3} borderRadius="8px" borderWidth="1px" borderColor={c.border}>
            <Text fontSize="22px" fontWeight="700" color={c.text} lineHeight="1" style={{ fontFamily: 'var(--font-display)' }}>
              {routeInfo.durationMinutes} min
            </Text>
            <Text fontSize="11px" color={c.muted} mt={1} letterSpacing="0.1em" style={{ fontFamily: 'var(--font-body)' }}>
              DRIVE TIME
            </Text>
          </Box>
        </HStack>
      )}

      {/* ETA card */}
      <Box
        w="full"
        p={6}
        bg={c.surface}
        borderWidth="2px"
        borderColor={c.accent}
        borderRadius="8px"
        textAlign="center"
        style={{ animation: 'neonHeartbeat 2s ease-in-out infinite' }}
      >
        <Text
          fontSize={{ base: '36px', md: '52px' }}
          fontWeight="700"
          color={c.accent}
          lineHeight="1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          1–2 hours
        </Text>
        <Text
          fontSize="14px"
          color={c.muted}
          mt={2}
          letterSpacing="0.1em"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          ESTIMATED ARRIVAL
        </Text>
        {result!.driverName && (
          <Text
            fontSize="13px"
            color={c.muted}
            mt={3}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Nearest driver: {result!.driverName}
          </Text>
        )}
        <Text
          fontSize="12px"
          color={c.muted}
          mt={1}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {result!.driversOnline} driver{result!.driversOnline !== 1 ? 's' : ''} online
        </Text>
      </Box>

      {/* Driver acceptance window */}
      <Box w="full" p={4} bg={c.surface} borderRadius="8px" borderWidth="1px" borderColor={c.border}>
        <HStack gap={3} align="flex-start">
          <Box w="10px" h="10px" borderRadius="full" bg={c.accent} mt="5px" flexShrink={0} />
          <Box>
            <Text fontSize="14px" fontWeight="600" color={c.text} style={{ fontFamily: 'var(--font-body)' }}>
              Driver response window
            </Text>
            <Text fontSize="13px" color={c.muted} mt={1} style={{ fontFamily: 'var(--font-body)' }}>
              Your driver will confirm acceptance within 1 hour of dispatch
            </Text>
          </Box>
        </HStack>
      </Box>

      {/* Navigation */}
      <HStack gap={3} w="full">
        <Button
          variant="outline"
          onClick={goToPrev}
          flex={1}
          h="52px"
          borderColor={c.border}
          color={c.text}
          fontFamily="var(--font-body)"
          _hover={{ borderColor: c.accent }}
        >
          Back
        </Button>
        <Button
          onClick={handleContinue}
          flex={1}
          h="52px"
          bg={c.accent}
          color={c.bg}
          fontSize="20px"
          letterSpacing="0.05em"
          fontFamily="var(--font-display)"
          _hover={{ bg: c.accentHover }}
          style={{ animation: 'btnPulse 2s ease-in-out 0.5s infinite' }}
        >
          CONTINUE {'\u2192'}
        </Button>
      </HStack>
    </VStack>
  );
}
