'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Image,
  Flex,
  Heading,
} from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';
import {
  getDriverPresenceState,
  PRESENCE_LABELS,
  PRESENCE_COLORS,
  minutesSinceLastLocation,
  type DriverPresenceState,
} from '@/lib/driver-presence';
import {
  formatDueBackTime,
  formatMinutesCompact,
} from '@/driver-app/src/lib/navigation/jobTimeEstimate';
import { DriverSituationBadge } from '@/components/admin/DriverSituationBadge';
import { DRIVER_SITUATION_CHAKRA_COLORS, type DriverSituation } from '@/lib/admin/driverSituation';

/* ─── Types ─────────────────────────────────────────────── */

interface Driver {
  id: string;
  name: string;
  phone?: string | null;
  isOnline?: boolean | null;
  status?: string | null;
  currentLat?: string | null;
  currentLng?: string | null;
  locationAt?: string | null;
}

interface TrackingData {
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  etaMinutes: number | null;
  distanceMiles: number | null;
  routeCoordinates: [number, number][] | null;
  returnEtaMinutes: number | null;
  returnEstimateAvailable: boolean;
  returnEstimateError: string | null;
  serviceType: string | null;
  tyreCount: number | null;
  paymentStatus: string | null;
  driverSituation: DriverSituation | null;
}

interface Props {
  bookingRef: string;
  bookingStatus: string;
  customerLat: string;
  customerLng: string;
  customerAddress: string;
  assignedDriver: Driver | null;
}

/* ─── Helpers ───────────────────────────────────────────── */

function freshnessLabel(locationAt: string | null): { text: string; color: string } {
  if (!locationAt) return { text: 'No signal', color: 'gray' };
  const mins = minutesSinceLastLocation(locationAt);
  if (mins === null) return { text: 'No signal', color: 'gray' };
  if (mins < 0.5) return { text: 'Live now', color: 'green' };
  if (mins < 1) return { text: 'Updated <1m ago', color: 'green' };
  if (mins < 3) return { text: `Updated ${Math.round(mins)}m ago`, color: 'green' };
  if (mins < 5) return { text: `Updated ${Math.round(mins)}m ago`, color: 'yellow' };
  if (mins < 10) return { text: `Updated ${Math.round(mins)}m ago`, color: 'orange' };
  return { text: `Updated ${Math.round(mins)}m ago`, color: 'red' };
}

function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3958.8; // earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ─── Component ─────────────────────────────────────────── */

export function AdminTrackingMap({
  bookingRef,
  bookingStatus,
  customerLat,
  customerLng,
  customerAddress,
  assignedDriver,
}: Props) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [liveDriver, setLiveDriver] = useState<Driver | null>(assignedDriver);
  const [tracking, setTracking] = useState<TrackingData>({
    driverLat: null,
    driverLng: null,
    driverLocationAt: null,
    etaMinutes: null,
    distanceMiles: null,
    routeCoordinates: null,
    returnEtaMinutes: null,
    returnEstimateAvailable: false,
    returnEstimateError: null,
    serviceType: null,
    tyreCount: null,
    paymentStatus: null,
    driverSituation: null,
  });
  const [expanded, setExpanded] = useState(false);
  const [freshLabel, setFreshLabel] = useState(freshnessLabel(assignedDriver?.locationAt ?? null));
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'done'>('idle');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActiveJob = ['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(bookingStatus);

  // ── Polling: prefer admin-only route data so internal situation details
  // never need to be added to the public customer tracking endpoint.
  const fetchTracking = useCallback(async () => {
    try {
      const adminRes = await fetch(`/api/admin/active-jobs/${encodeURIComponent(bookingRef)}/route`);
      if (adminRes.ok) {
        const data = await adminRes.json();
        const driverLocation = data.driverLocation ?? null;
        setTracking({
          driverLat: driverLocation?.lat ?? null,
          driverLng: driverLocation?.lng ?? null,
          driverLocationAt: driverLocation?.locationAt ?? null,
          etaMinutes: data.durationMinutes ?? null,
          distanceMiles: data.distanceMiles ?? null,
          routeCoordinates: data.geometry?.coordinates ?? null,
          returnEtaMinutes: null,
          returnEstimateAvailable: data.driverSituation?.availableAfter != null,
          returnEstimateError: data.driverSituation?.reasonLabels?.[0] ?? null,
          serviceType: null,
          tyreCount: null,
          paymentStatus: null,
          driverSituation: data.driverSituation ?? null,
        });
        if (liveDriver && driverLocation?.lat != null && driverLocation?.lng != null) {
          setLiveDriver((prev) =>
            prev
              ? {
                  ...prev,
                  currentLat: String(driverLocation.lat),
                  currentLng: String(driverLocation.lng),
                  locationAt: driverLocation.locationAt,
                }
              : prev,
          );
        }
        setFreshLabel(freshnessLabel(driverLocation?.locationAt ?? null));
        return;
      }

      const publicRes = await fetch(`/api/tracking/${encodeURIComponent(bookingRef)}`);
      if (!publicRes.ok) return;
      const data = await publicRes.json();
      setTracking({
        driverLat: data.driverLat,
        driverLng: data.driverLng,
        driverLocationAt: data.driverLocationAt,
        etaMinutes: data.etaMinutes,
        distanceMiles: data.distanceMiles ?? null,
        routeCoordinates: data.routeCoordinates ?? null,
        returnEtaMinutes: null,
        returnEstimateAvailable: false,
        returnEstimateError: null,
        serviceType: null,
        tyreCount: null,
        paymentStatus: null,
        driverSituation: null,
      });
      // Also update the driver's live position
      if (liveDriver && data.driverLat != null) {
        setLiveDriver((prev) =>
          prev
            ? {
                ...prev,
                currentLat: String(data.driverLat),
                currentLng: String(data.driverLng),
                locationAt: data.driverLocationAt,
              }
            : prev,
        );
      }
      setFreshLabel(freshnessLabel(data.driverLocationAt));
    } catch {
      /* ignore */
    }
  }, [bookingRef, liveDriver]);

  /** Manual refresh handler with "Checking... → Updated ✓" feedback. */
  const handleManualRefresh = useCallback(async () => {
    setRefreshState('loading');
    await fetchTracking();
    setRefreshState('done');
    window.setTimeout(() => setRefreshState('idle'), 1_500);
  }, [fetchTracking]);

  // Start/stop poll based on driver+visibility
  useEffect(() => {
    if (!assignedDriver?.id) {
      setLiveDriver(null);
      return;
    }
    // Initial state
    setLiveDriver(assignedDriver);
    setFreshLabel(freshnessLabel(assignedDriver.locationAt ?? null));

    // Immediate first fetch
    fetchTracking();

    const interval = setInterval(fetchTracking, 10_000);
    pollRef.current = interval;

    // Pause when tab hidden
    const handleVisibility = () => {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      } else {
        fetchTracking();
        pollRef.current = setInterval(fetchTracking, 10_000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedDriver?.id]);

  // Refresh freshness label every 10s even without new data
  useEffect(() => {
    const t = setInterval(() => {
      setFreshLabel(freshnessLabel(tracking.driverLocationAt));
    }, 10_000);
    return () => clearInterval(t);
  }, [tracking.driverLocationAt]);

  // ── Derived state ──
  const driverHasLocation = !!(liveDriver?.currentLat && liveDriver?.currentLng);
  const presenceState: DriverPresenceState | null = liveDriver
    ? getDriverPresenceState(
        { isOnline: liveDriver.isOnline ?? false, locationAt: liveDriver.locationAt ?? null, status: liveDriver.status ?? null },
        isActiveJob ? { status: bookingStatus } : null,
      )
    : null;

  // Distance: prefer driving distance from API, fallback to haversine
  const haversineDist = driverHasLocation
    ? haversineDistanceMiles(
        Number(liveDriver!.currentLat),
        Number(liveDriver!.currentLng),
        Number(customerLat),
        Number(customerLng),
      )
    : null;
  const distanceMiles = tracking.distanceMiles ?? haversineDist;
  const distanceIsEstimate = tracking.distanceMiles == null && haversineDist != null;

  // Proximity state
  const isApproaching = distanceMiles !== null && distanceMiles < 0.5;

  // ── Encode route as Mapbox Static Images path ──
  function encodeRoutePath(coords: [number, number][]): string {
    // Simplify: take every Nth point to keep URL under ~8000 chars
    const maxPoints = 80;
    const step = Math.max(1, Math.floor(coords.length / maxPoints));
    const simplified = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
    const encoded = simplified.map(([lng, lat]) => `[${lng.toFixed(5)},${lat.toFixed(5)}]`).join(',');
    return `path-4+3B82F6-0.6(${encodeURIComponent(encoded)})`;
  }

  // ── Map URLs ──
  function buildMapUrl(width: number, height: number): string {
    if (!mapboxToken) return '';
    const cPin = `pin-l-c+ef4444(${customerLng},${customerLat})`;
    if (driverHasLocation) {
      const dPin = `pin-l-d+3B82F6(${liveDriver!.currentLng},${liveDriver!.currentLat})`;
      // Add route line if available
      const routePath = tracking.routeCoordinates?.length
        ? `,${encodeRoutePath(tracking.routeCoordinates)}`
        : '';
      return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${cPin},${dPin}${routePath}/auto/${width}x${height}@2x?padding=80&access_token=${mapboxToken}`;
    }
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${cPin}/${customerLng},${customerLat},13,0/${width}x${height}@2x?access_token=${mapboxToken}`;
  }

  const embeddedMapUrl = buildMapUrl(800, 450);
  const expandedMapUrl = buildMapUrl(1200, 700);

  const googleMapsUrl = driverHasLocation
    ? `https://www.google.com/maps/dir/${liveDriver!.currentLat},${liveDriver!.currentLng}/${customerLat},${customerLng}`
    : `https://www.google.com/maps/search/?api=1&query=${customerLat},${customerLng}`;

  /* ─── Status Strip ─────────────────────────────────────── */
  function StatusStrip() {
    return (
      <Flex
        gap={3}
        flexWrap="wrap"
        px={4}
        py={3}
        bg="rgba(0,0,0,0.4)"
        borderRadius="md"
        alignItems="center"
      >
        {/* Live pulsing dot — shows whenever GPS is "fresh" enough that we
            consider the session actively reporting. */}
        {driverHasLocation && (freshLabel.color === 'green' || freshLabel.color === 'yellow') && (
          <Box
            w="8px"
            h="8px"
            borderRadius="full"
            bg={freshLabel.color === 'green' ? '#22C55E' : '#F59E0B'}
            className="tr-live-dot"
            aria-label="Live tracking active"
          />
        )}
        {/* Driver presence */}
        {presenceState ? (
          <Badge colorPalette={PRESENCE_COLORS[presenceState]} size="sm" variant="solid">
            {PRESENCE_LABELS[presenceState]}
          </Badge>
        ) : (
          <Badge colorPalette="gray" size="sm" variant="solid">
            No Driver
          </Badge>
        )}

        {/* Freshness */}
        <Badge colorPalette={freshLabel.color} size="sm" variant="outline">
          {freshLabel.text}
        </Badge>

        {/* ETA */}
        {tracking.etaMinutes != null && (
          <Badge colorPalette="purple" size="sm" variant="solid">
            ETA {tracking.etaMinutes} min
          </Badge>
        )}

        {/* Distance */}
        {distanceMiles != null && (
          <Badge colorPalette="cyan" size="sm" variant="outline">
            {distanceIsEstimate ? '~' : ''}{distanceMiles < 0.1 ? '< 0.1' : distanceMiles.toFixed(1)} miles
          </Badge>
        )}

        {/* Approaching */}
        {isApproaching && bookingStatus === 'en_route' && (
          <Badge colorPalette="green" size="sm" variant="solid">
            🚗 Approaching
          </Badge>
        )}
      </Flex>
    );
  }

  /* ─── Quick Actions ───────────────────────────────────── */
  function QuickActions({ compact = false }: { compact?: boolean }) {
    return (
      <HStack gap={2} flexWrap="wrap">
        {liveDriver?.phone && (
          <a href={`tel:${liveDriver.phone}`} style={{ textDecoration: 'none' }}>
            <Button size={compact ? 'xs' : 'sm'} bg="#22C55E" color="#fff" _hover={{ bg: '#16A34A' }}>
              📞 Call Driver
            </Button>
          </a>
        )}
        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <Button size={compact ? 'xs' : 'sm'} variant="outline" borderColor={c.border} color={c.text} _hover={{ borderColor: c.accent }}>
            🗺 Open in Maps
          </Button>
        </a>
        <Button size={compact ? 'xs' : 'sm'} variant="outline" borderColor={c.border} color={c.text} _hover={{ borderColor: c.accent }} onClick={handleManualRefresh} disabled={refreshState === 'loading'}>
          {refreshState === 'loading' ? '⏳ Checking...' : refreshState === 'done' ? '✓ Updated' : '🔄 Refresh'}
        </Button>
      </HStack>
    );
  }

  /* ─── Map Legends ─────────────────────────────────────── */
  function MapLegend() {
    return (
      <HStack gap={3} mt={2}>
        <HStack gap={1}>
          <Box w="10px" h="10px" borderRadius="full" bg="#ef4444" />
          <Text fontSize="xs" color={c.muted}>Customer</Text>
        </HStack>
        {driverHasLocation && (
          <HStack gap={1}>
            <Box w="10px" h="10px" borderRadius="full" bg="#3B82F6" />
            <Text fontSize="xs" color={c.muted}>Driver</Text>
          </HStack>
        )}
        {tracking.routeCoordinates && (
          <HStack gap={1}>
            <Box w="14px" h="3px" bg="#3B82F6" borderRadius="sm" />
            <Text fontSize="xs" color={c.muted}>Route</Text>
          </HStack>
        )}
      </HStack>
    );
  }

  function AdminJobTimeSummary() {
    const situation = tracking.driverSituation;
    const dueBack = situation?.dueBackAt ? formatDueBackTime(new Date(situation.dueBackAt)) : '--:--';
    const color = situation ? DRIVER_SITUATION_CHAKRA_COLORS[situation.status] : 'gray';

    return (
      <Box
        mt={3}
        px={3}
        py={2}
        borderRadius="md"
        borderWidth="1px"
        borderColor={color === 'gray' ? c.border : `${color}.500`}
        bg="rgba(255,255,255,0.04)"
      >
        <Flex gap={3} align="center" justify="space-between" flexWrap="wrap">
          <Text fontSize="xs" fontWeight="700" color={c.text}>
            Driver booked until {dueBack}
          </Text>
          <DriverSituationBadge situation={situation} />
        </Flex>
        {situation ? (
          <Text mt={1} fontSize="xs" color={c.muted}>
            Total job time: {situation.totalMinutes != null ? formatMinutesCompact(situation.totalMinutes) : '--'} · Available after {dueBack}
            {situation.reasonLabels.length > 0 ? ` · ${situation.reasonLabels.slice(0, 2).join(' · ')}` : ''}
            {situation.delayMinutes > 0 ? ` · At risk +${formatMinutesCompact(situation.delayMinutes)}` : ''}
          </Text>
        ) : (
          <Text mt={1} fontSize="xs" color={c.muted}>
            Driver situation unavailable on the basic tracking feed
          </Text>
        )}
      </Box>
    );
  }

  /* ─── Expanded Modal ──────────────────────────────────── */
  function ExpandedOverlay() {
    if (!expanded) return null;
    return (
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="rgba(0,0,0,0.85)"
        zIndex={1500}
        display="flex"
        flexDirection="column"
        alignItems="center"
        p={{ base: 2, md: 6 }}
        onClick={() => setExpanded(false)}
        overflow="auto"
      >
        <Box
          bg={c.card}
          borderRadius="lg"
          borderWidth="1px"
          borderColor={c.border}
          maxW="1200px"
          w="100%"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Flex justify="space-between" align="center" px={6} py={4} borderBottom="1px solid" borderColor={c.border}>
            <Heading size="md" color={c.text}>Live Tracking — #{bookingRef}</Heading>
            <Button size="sm" variant="outline" borderColor={c.border} color={c.muted} onClick={() => setExpanded(false)}>
              ✕ Close
            </Button>
          </Flex>

          {/* Status strip */}
          <Box px={6} pt={4}>
            <StatusStrip />
          </Box>

          {/* Expanded map */}
          <Box px={6} pt={4}>
            {mapboxToken ? (
              <Image
                src={expandedMapUrl}
                alt="Full tracking map"
                borderRadius="md"
                width="100%"
                loading="eager"
              />
            ) : (
              <Box
                h="400px"
                bg={c.surface}
                borderRadius="md"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text color={c.muted}>Map unavailable — MAPBOX token missing</Text>
              </Box>
            )}
            <MapLegend />
          </Box>

          {/* Info + actions */}
          <Flex gap={4} px={6} py={4} flexWrap="wrap" align="center" justify="space-between">
            <VStack align="start" gap={1}>
              {liveDriver && (
                <Text fontSize="sm" color={c.text}>
                  <Text as="span" fontWeight="600">Driver:</Text> {liveDriver.name}
                  {liveDriver.phone && ` · ${liveDriver.phone}`}
                </Text>
              )}
              <Text fontSize="sm" color={c.muted}>
                <Text as="span" fontWeight="600">Customer:</Text> {customerAddress}
              </Text>
              {tracking.etaMinutes != null && (
                <Text fontSize="sm" color={c.accent}>
                  Estimated arrival: {tracking.etaMinutes} min
                  {distanceMiles != null && ` · ${distanceMiles.toFixed(1)} miles`}
                  {distanceIsEstimate && ' (straight-line est.)'}
                </Text>
              )}
              {driverHasLocation && liveDriver?.locationAt && (
                <Text fontSize="xs" color={c.muted}>
                  {/* Raw GPS coordinates intentionally hidden from the user UI. */}
                  Last update: {freshLabel.text}
                </Text>
              )}
            </VStack>
            <QuickActions />
          </Flex>
        </Box>
      </Box>
    );
  }

  /* ─── No driver state ─────────────────────────────────── */
  if (!assignedDriver) {
    return (
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        <Box px={4} py={3} borderBottom="1px solid" borderColor={c.border}>
          <Flex justify="space-between" align="center">
            <Text fontSize="sm" fontWeight="600" color={c.text}>📍 Tracking Map</Text>
            <Badge colorPalette="gray" size="sm">Awaiting driver assignment</Badge>
          </Flex>
        </Box>
        {mapboxToken && (
          <Image
            src={buildMapUrl(800, 350)}
            alt="Customer location"
            width="100%"
          />
        )}
        <Box px={4} py={3}>
          <Text fontSize="sm" color={c.muted}>{customerAddress}</Text>
          <MapLegend />
        </Box>
      </Box>
    );
  }

  /* ─── Main render: driver assigned ────────────────────── */
  return (
    <>
      <Box bg={c.card} borderRadius="md" borderWidth="1px" borderColor={c.border} overflow="hidden">
        {/* Status strip header */}
        <Box px={4} py={3} borderBottom="1px solid" borderColor={c.border}>
          <Flex justify="space-between" align="center" mb={2}>
            <Text fontSize="sm" fontWeight="600" color={c.text}>📍 Live Tracking</Text>
            <HStack gap={2}>
              <Button
                size="xs"
                bg={c.accent}
                color="#09090B"
                _hover={{ bg: c.accentHover }}
                onClick={() => setExpanded(true)}
              >
                ⛶ Expand Map
              </Button>
            </HStack>
          </Flex>
          <StatusStrip />
          <AdminJobTimeSummary />
        </Box>

        {/* Embedded map — 1.7x taller than before */}
        {mapboxToken ? (
          <Box cursor="pointer" onClick={() => setExpanded(true)} position="relative">
            <Image
              src={embeddedMapUrl}
              alt="Live driver tracking"
              width="100%"
              minH="350px"
              objectFit="cover"
              loading="eager"
            />
            {/* Stale warning overlay */}
            {driverHasLocation && (freshLabel.color === 'red' || freshLabel.color === 'orange') && (
              <Box
                position="absolute"
                top={3}
                right={3}
                bg="rgba(0,0,0,0.7)"
                px={3}
                py={1}
                borderRadius="md"
              >
                <Text fontSize="xs" color={freshLabel.color === 'red' ? 'red.400' : 'orange.300'} fontWeight="600">
                  ⚠ Stale signal — {freshLabel.text}
                </Text>
              </Box>
            )}
            {!driverHasLocation && (
              <Box
                position="absolute"
                top={3}
                right={3}
                bg="rgba(0,0,0,0.7)"
                px={3}
                py={1}
                borderRadius="md"
              >
                <Text fontSize="xs" color="orange.300" fontWeight="600">
                  ⚠ No live driver signal
                </Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box
            h="350px"
            bg={c.surface}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text color={c.muted}>Map unavailable</Text>
          </Box>
        )}

        {/* Bottom bar: legend + info + actions */}
        <Box px={4} py={3}>
          <Flex justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <VStack align="start" gap={1}>
              <MapLegend />
              <Text fontSize="sm" color={c.text}>
                <Text as="span" fontWeight="600">{liveDriver?.name}</Text>
                {liveDriver?.phone && <Text as="span" color={c.muted}> · {liveDriver.phone}</Text>}
              </Text>
              {tracking.etaMinutes != null && (
                <Text fontSize="sm" color={c.accent} fontWeight="600">
                  ETA: {tracking.etaMinutes} min
                  {distanceMiles != null && ` · ${distanceMiles.toFixed(1)} miles`}
                </Text>
              )}
              {tracking.etaMinutes == null && distanceMiles != null && (
                <Text fontSize="sm" color={c.muted}>
                  {distanceIsEstimate ? '~' : ''}{distanceMiles.toFixed(1)} miles{distanceIsEstimate ? ' (est.)' : ''}
                </Text>
              )}
              {!driverHasLocation && (
                <Text fontSize="xs" color="orange.400">
                  Waiting for GPS update from driver&apos;s app…
                </Text>
              )}
            </VStack>
            <QuickActions compact />
          </Flex>
        </Box>
      </Box>

      {/* Expanded overlay */}
      <ExpandedOverlay />
    </>
  );
}
