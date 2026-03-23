'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Spinner,
} from '@chakra-ui/react';
import Link from 'next/link';
import { TrackingMap } from '@/components/tracking/TrackingMap';
import { StatusTimeline } from '@/components/tracking/StatusTimeline';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface StatusHistoryItem {
  status: string;
  timestamp: string;
  note: string | null;
}

interface TrackingData {
  status: string;
  bookingType: string;
  customerLat: number;
  customerLng: number;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  driverName: string | null;
  driverPhone: string | null;
  etaMinutes: number | null;
  statusHistory: StatusHistoryItem[];
  addressLine: string;
  scheduledAt: string | null;
  completedAt: string | null;
}

interface TrackingContentProps {
  refNumber: string;
  initialStatus: string;
}

export function TrackingContent({ refNumber, initialStatus }: TrackingContentProps) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrackingData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tracking/${refNumber}`);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch tracking data');
      }

      const trackingData: TrackingData = await res.json();
      setData(trackingData);
      setError(null);

      // Return whether we should continue polling
      return trackingData.status !== 'completed' && trackingData.status !== 'cancelled';
    } catch (err) {
      console.error('Error fetching tracking data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tracking data');
      return true; // Continue polling on error
    } finally {
      setIsLoading(false);
    }
  }, [refNumber]);

  // Initial fetch and polling
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = async () => {
      const shouldContinue = await fetchTrackingData();

      if (shouldContinue) {
        // Poll every 30 seconds
        intervalId = setInterval(async () => {
          const continuePolling = await fetchTrackingData();
          if (!continuePolling && intervalId) {
            clearInterval(intervalId);
          }
        }, 30000);
      }
    };

    startPolling();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchTrackingData]);

  // Check if driver location is stale (more than 5 minutes old)
  const isLocationStale = data?.driverLocationAt
    ? Date.now() - new Date(data.driverLocationAt).getTime() > 5 * 60 * 1000
    : false;

  // Check if tracking is active
  const hasDriverAssigned = data && ['driver_assigned', 'en_route', 'arrived', 'in_progress', 'completed'].includes(data.status);

  if (isLoading) {
    return (
      <Container maxW="container.lg" py={12}>
        <VStack gap={4} py={12}>
          <Spinner size="lg" />
          <Text color={c.muted}>Loading tracking information...</Text>
        </VStack>
      </Container>
    );
  }

  if (error && !data) {
    return (
      <Container maxW="container.lg" py={12}>
        <VStack gap={4} py={12}>
          <Text color="red.400">{error}</Text>
          <Link href="/" style={{ textDecoration: 'underline', color: 'gray' }}>
            Return to Homepage
          </Link>
        </VStack>
      </Container>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Container maxW="container.lg" py={8}>
      <VStack gap={6} align="stretch">
        {/* Header */}
        <Box>
          <Text fontSize="sm" color={c.muted}>
            Tracking
          </Text>
          <Text fontSize="2xl" fontWeight="700" color={c.text}>
            {refNumber}
          </Text>
        </Box>

        {/* Job Complete Message */}
        {data.status === 'completed' && (
          <Box p={6} bg="rgba(34,197,94,0.1)" borderRadius="lg" textAlign="center">
            <Text fontSize="xl" fontWeight="600" color="green.400" mb={2}>
              Job Complete
            </Text>
            <Text color="green.300">
              Thank you for choosing Tyre Rescue. We hope everything went smoothly.
            </Text>
            {data.completedAt && (
              <Text fontSize="sm" color="green.300" mt={2}>
                Completed at {new Date(data.completedAt).toLocaleString('en-GB')}
              </Text>
            )}
          </Box>
        )}

        {/* Map Section */}
        <Box
          h={{ base: '300px', md: '400px' }}
          borderRadius="lg"
          overflow="hidden"
          borderWidth="1px"
          borderColor={c.border}
          style={anim.fadeIn('0.8s', '0.2s')}
        >
          <TrackingMap
            customerLat={data.customerLat}
            customerLng={data.customerLng}
            driverLat={data.driverLat}
            driverLng={data.driverLng}
            showRoute={!!hasDriverAssigned && data.driverLat !== null}
          />
        </Box>

        {/* Driver Location Stale Warning */}
        {isLocationStale && data.status !== 'completed' && (
          <Box p={4} bg="rgba(234,179,8,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(234,179,8,0.3)">
            <Text color="yellow.400">
              Location update pending. The driver may be in a low-signal area.
            </Text>
          </Box>
        )}

        {/* Driver Info + ETA */}
        {hasDriverAssigned && data.status !== 'completed' && (
          <Box
            p={4}
            bg={c.card}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={c.border}
            style={anim.slideInRight('0.6s', '0.3s')}
          >
            <HStack justify="space-between" align="start">
              <Box>
                <Text fontWeight="600" mb={1}>
                  Your Driver
                </Text>
                {data.driverName && (
                  <Text color={c.muted}>
                    {data.driverName}
                  </Text>
                )}
                {data.driverPhone && (
                  <Text color={c.muted}>
                    {data.driverPhone}
                  </Text>
                )}
              </Box>

              {data.etaMinutes !== null && data.status !== 'arrived' && data.status !== 'in_progress' && (
                <Box textAlign="right">
                  <Text fontWeight="600" mb={1}>
                    ETA
                  </Text>
                  <Text fontSize="2xl" fontWeight="700" color={c.accent}>
                    {data.etaMinutes < 1 ? 'Arriving' : `${data.etaMinutes} min`}
                  </Text>
                </Box>
              )}

              {(data.status === 'arrived' || data.status === 'in_progress') && (
                <Box textAlign="right">
                  <Text fontWeight="600" color="green.400">
                    {data.status === 'arrived' ? 'Driver has arrived' : 'Job in progress'}
                  </Text>
                </Box>
              )}
            </HStack>
          </Box>
        )}

        {/* Waiting for Driver Assignment */}
        {!hasDriverAssigned && data.status !== 'cancelled' && (
          <Box p={4} bg="rgba(249,115,22,0.08)" borderRadius="lg" textAlign="center">
            <Text fontWeight="500" color={c.accent} mb={1}>
              Assigning Your Driver
            </Text>
            <Text color={c.muted} fontSize="sm">
              We&apos;re finding the best available driver for you. This page will update automatically.
            </Text>
          </Box>
        )}

        {/* Location */}
        <Box>
          <Text fontWeight="600" mb={1}>
            Location
          </Text>
          <Text color={c.muted}>{data.addressLine}</Text>
          {data.bookingType === 'scheduled' && data.scheduledAt && (
            <Text color={c.muted} mt={1}>
              Scheduled for: {new Date(data.scheduledAt).toLocaleString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </Box>

        {/* Status Timeline */}
        <Box style={anim.slideInLeft('0.6s')}>
          <Text fontWeight="600" mb={4} color={c.text}>
            Status Updates
          </Text>
          <StatusTimeline history={data.statusHistory} currentStatus={data.status} />
        </Box>

        {/* Help */}
        <Box fontSize="sm" color={c.muted} textAlign="center" pt={4}>
          Need help? Call us on 0141 266 0690
        </Box>
      </VStack>
    </Container>
  );
}
