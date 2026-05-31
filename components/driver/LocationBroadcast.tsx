'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Props {
  isOnline: boolean;
  hasActiveJob: boolean;
}

// ── Throttling constants ──────────────────────────────────────────────────
// Server enforces a hard 8s min between writes per driver. Stay well above.
const ACTIVE_INTERVAL_MS = 30_000; // online + active job
const IDLE_INTERVAL_MS = 60_000;   // online, no active job
const MIN_INTERVAL_MS = 10_000;    // never POST faster than this
const MIN_MOVEMENT_METERS = 25;    // distance threshold
const MAX_QUIET_MS = 60_000;       // POST at least this often even if still
const DEFAULT_BACKOFF_MS = 30_000; // fallback when 429 lacks Retry-After

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * LocationBroadcast — sends periodic GPS heartbeats to the server.
 *
 * Broadcasting is active when the driver is EITHER:
 *   - explicitly online (isOnline = true), OR
 *   - has an active job (the backend relies on fresh locationAt even if
 *     the isOnline toggle was lost due to a browser restart)
 *
 * Safeguards:
 *   - one interval per mount, cleaned up on unmount / status change
 *   - one in-flight POST at a time (AbortController on cleanup)
 *   - distance threshold: skip POSTs while stationary unless 60s elapsed
 *   - 429 Retry-After backoff (parsed from header, 30s fallback)
 *
 * The component does NOT set the driver offline when the tab is hidden
 * or backgrounded. That decision belongs to the backend presence evaluator
 * (lib/driver-presence.ts) which applies a grace window.
 */
export function LocationBroadcast({ isOnline, hasActiveJob }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const backoffUntilRef = useRef<number>(0);

  // Should we broadcast? Yes if online OR working an active job.
  const shouldBroadcast = isOnline || hasActiveJob;

  useEffect(() => {
    if (!shouldBroadcast) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (inFlightRef.current) {
        inFlightRef.current.abort();
        inFlightRef.current = null;
      }
      lastSentAtRef.current = 0;
      lastSentCoordsRef.current = null;
      backoffUntilRef.current = 0;
      setError(null);
      setLastUpdate(null);
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    async function sendLocation(position: GeolocationPosition) {
      const now = Date.now();
      if (now < backoffUntilRef.current) return;
      if (inFlightRef.current) return; // existing POST still pending

      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const last = lastSentCoordsRef.current;
      const sinceLast = now - lastSentAtRef.current;

      if (lastSentAtRef.current && sinceLast < MIN_INTERVAL_MS) return;

      if (
        last &&
        sinceLast < MAX_QUIET_MS &&
        distanceMeters(last, coords) < MIN_MOVEMENT_METERS
      ) {
        return; // stationary and recent — skip
      }

      const controller = new AbortController();
      inFlightRef.current = controller;
      try {
        const res = await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coords),
          signal: controller.signal,
        });

        if (res.status === 429) {
          const headerVal = res.headers.get('Retry-After');
          const parsed = headerVal ? parseInt(headerVal, 10) : NaN;
          const backoffMs = Number.isFinite(parsed) && parsed > 0
            ? parsed * 1000
            : DEFAULT_BACKOFF_MS;
          backoffUntilRef.current = Date.now() + backoffMs;
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[LocationBroadcast] 429 — backing off for ${Math.round(backoffMs / 1000)}s`,
            );
          }
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update location');
        }

        lastSentAtRef.current = Date.now();
        lastSentCoordsRef.current = coords;
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Network errors are expected when the browser is backgrounded.
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[LocationBroadcast] send failed:', err);
        }
        setError(err instanceof Error ? err.message : 'Failed to send location');
      } finally {
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
        }
      }
    }

    function updateLocation() {
      if (Date.now() < backoffUntilRef.current) return;
      navigator.geolocation.getCurrentPosition(
        sendLocation,
        (err) => {
          switch (err.code) {
            case err.PERMISSION_DENIED:
              setError('Location permission denied. Please enable location access.');
              break;
            case err.POSITION_UNAVAILABLE:
              setError('Location information is unavailable.');
              break;
            case err.TIMEOUT:
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[LocationBroadcast] geolocation timeout');
              }
              break;
            default:
              setError('An unknown error occurred getting location.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        },
      );
    }

    // Send initial location immediately
    updateLocation();

    const intervalMs = hasActiveJob ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    intervalRef.current = setInterval(updateLocation, intervalMs);

    // Re-send when tab becomes visible again (closes background gap).
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        updateLocation();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (inFlightRef.current) {
        inFlightRef.current.abort();
        inFlightRef.current = null;
      }
    };
  }, [shouldBroadcast, hasActiveJob]);

  if (!shouldBroadcast) {
    return null;
  }

  return (
    <Box>
      {error && (
        <Box bg="rgba(239,68,68,0.1)" p={3} borderRadius="md" mb={4}>
          <Text color="red.400" fontSize="sm">
            Location Error: {error}
          </Text>
        </Box>
      )}
      {lastUpdate && !error && (
        <Text fontSize="xs" color={c.muted}>
          Location updated: {lastUpdate.toLocaleTimeString()}
        </Text>
      )}
    </Box>
  );
}
