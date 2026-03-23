'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Props {
  isOnline: boolean;
  hasActiveJob: boolean;
}

/**
 * LocationBroadcast — sends periodic GPS heartbeats to the server.
 *
 * Broadcasting is active when the driver is EITHER:
 *   - explicitly online (isOnline = true), OR
 *   - has an active job (the backend relies on fresh locationAt even if
 *     the isOnline toggle was lost due to a browser restart)
 *
 * The component does NOT set the driver offline when the tab is hidden
 * or backgrounded.  That decision belongs to the backend presence evaluator
 * (lib/driver-presence.ts) which applies a grace window.
 */
export function LocationBroadcast({ isOnline, hasActiveJob }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Should we broadcast? Yes if online OR working an active job.
  const shouldBroadcast = isOnline || hasActiveJob;

  useEffect(() => {
    if (!shouldBroadcast) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setError(null);
      setLastUpdate(null);
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    async function sendLocation(position: GeolocationPosition) {
      try {
        const res = await fetch('/api/driver/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update location');
        }

        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        // Network errors are expected when the browser is backgrounded.
        // Don't show alarming errors for transient failures.
        console.warn('[LocationBroadcast] send failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to send location');
      }
    }

    function updateLocation() {
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
              // Timeouts are common on mobile when backgrounded — don't alarm
              console.warn('[LocationBroadcast] geolocation timeout');
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

    // Active job: every 30s, idle: every 60s
    const intervalMs = hasActiveJob ? 30_000 : 60_000;
    intervalRef.current = setInterval(updateLocation, intervalMs);

    // Re-send immediately when tab becomes visible again.
    // This closes the gap after browser backgrounding.
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
