'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { colorTokens as c } from '@/lib/design-tokens';

interface Props {
  isOnline: boolean;
  hasActiveJob: boolean;
}

export function LocationBroadcast({ isOnline, hasActiveJob }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOnline) {
      // Clear any existing intervals/watches when offline
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setError(null);
      setLastUpdate(null);
      return;
    }

    // Check if geolocation is available
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    // Function to send location to server
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
          const data = await res.json();
          throw new Error(data.error || 'Failed to update location');
        }

        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        console.error('Error sending location:', err);
        setError(err instanceof Error ? err.message : 'Failed to send location');
      }
    }

    // Function to get current position and send it
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
              setError('Location request timed out.');
              break;
            default:
              setError('An unknown error occurred getting location.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }

    // Send initial location immediately
    updateLocation();

    // Set up interval based on whether there's an active job
    // Active job: every 30 seconds
    // Idle: every 60 seconds
    const intervalMs = hasActiveJob ? 30000 : 60000;

    intervalRef.current = setInterval(updateLocation, intervalMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isOnline, hasActiveJob]);

  // Don't render anything if offline
  if (!isOnline) {
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
