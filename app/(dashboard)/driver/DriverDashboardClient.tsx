'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Grid,
  GridItem,
  Image,
  Link as ChakraLink,
  Button,
} from '@chakra-ui/react';
import { LocationBroadcast } from '@/components/driver/LocationBroadcast';
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface ActiveJob {
  id: string;
  refNumber: string;
  status: string;
  addressLine: string;
  lat: string;
  lng: string;
  tyreSizeDisplay: string | null;
  quantity: number;
  customerName: string;
  customerPhone: string;
  tyrePhotoUrl: string | null;
  scheduledAt: string | null;
  tyres: {
    condition: string;
    quantity: number;
    brand: string | null;
    pattern: string | null;
  }[];
}

interface Props {
  initialIsOnline: boolean;
  activeJob: ActiveJob | null;
  jobsToday: number;
  jobsThisWeek: number;
}

const STATUS_LABELS: Record<string, string> = {
  driver_assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
};

export function DriverDashboardClient({
  initialIsOnline,
  activeJob,
  jobsToday,
  jobsThisWeek,
}: Props) {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(initialIsOnline);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState('');

  async function handleToggleOnline() {
    setIsToggling(true);
    setError('');

    try {
      const res = await fetch('/api/driver/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_online: !isOnline }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      setIsOnline(!isOnline);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsToggling(false);
    }
  }

  function getGoogleMapsUrl(address: string, lat: string, lng: string): string {
    // Use coordinates for more accurate navigation
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  return (
    <VStack align="stretch" gap={6}>
      {/* Online/Offline Toggle */}
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
        <VStack align="stretch" gap={4}>
          <HStack justify="space-between" align="center">
            <Box>
              <Text fontSize="lg" fontWeight="semibold" color={c.text}>
                Status
              </Text>
              <Text fontSize="sm" color={c.muted}>
                {isOnline
                  ? 'You are online and available for jobs'
                  : 'You are offline and will not receive jobs'}
              </Text>
            </Box>
            <Box
              px={6}
              py={3}
              borderRadius="md"
              bg={isOnline ? 'rgba(34,197,94,0.15)' : c.surface}
              color={isOnline ? 'green.400' : c.muted}
              fontWeight="bold"
              fontSize="lg"
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Box>
          </HStack>

          <Button
            size="lg"
            colorPalette={isOnline ? 'gray' : 'green'}
            onClick={handleToggleOnline}
            disabled={isToggling}
            width="100%"
          >
            {isToggling
              ? 'Updating...'
              : isOnline
              ? 'Go Offline'
              : 'Go Online'}
          </Button>

          {error && (
            <Text color="red.400" fontSize="sm">
              {error}
            </Text>
          )}

          <LocationBroadcast isOnline={isOnline} hasActiveJob={!!activeJob} />
        </VStack>
      </Box>

      {/* Active Job Card */}
      {activeJob && (
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} borderLeft="4px solid" borderLeftColor={c.accent} style={anim.fadeUp('0.6s', '0.2s')}>
          <VStack align="stretch" gap={4}>
            <HStack justify="space-between">
              <Heading size="md" color={c.text}>Active Job</Heading>
              <Text
                fontWeight="semibold"
                color={c.accent}
              >
                {STATUS_LABELS[activeJob.status] || activeJob.status}
              </Text>
            </HStack>

            <Text fontSize="sm" color={c.muted}>
              Ref: {activeJob.refNumber}
            </Text>

            {/* Customer Address with Google Maps link */}
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                Customer Address
              </Text>
              <ChakraLink
                href={getGoogleMapsUrl(activeJob.addressLine, activeJob.lat, activeJob.lng)}
                target="_blank"
                rel="noopener noreferrer"
                color={c.accent}
                fontWeight="medium"
                _hover={{ textDecoration: 'underline' }}
              >
                {activeJob.addressLine}
              </ChakraLink>
              <Text fontSize="xs" color={c.muted} mt={1}>
                (Click to open in Google Maps)
              </Text>
            </Box>

            {/* Tyre Details */}
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                Tyre Required
              </Text>
              <Text fontWeight="medium" color={c.text}>
                {activeJob.tyreSizeDisplay || 'Size not specified'}
                {' - '}
                {activeJob.quantity} tyre{activeJob.quantity !== 1 ? 's' : ''}
              </Text>
              {activeJob.tyres.length > 0 && (
                <VStack align="stretch" gap={1} mt={2}>
                  {activeJob.tyres.map((tyre, idx) => (
                    <Text key={idx} fontSize="sm" color={c.muted}>
                      {tyre.brand} {tyre.pattern} ({tyre.condition}) x{tyre.quantity}
                    </Text>
                  ))}
                </VStack>
              )}
            </Box>

            {/* Customer Phone */}
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                Customer Phone
              </Text>
              <ChakraLink
                href={`tel:${activeJob.customerPhone}`}
                color={c.accent}
                fontWeight="medium"
                fontSize="lg"
              >
                {activeJob.customerPhone}
              </ChakraLink>
            </Box>

            {/* Tyre Photo */}
            {activeJob.tyrePhotoUrl && (
              <Box>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={2}>
                  Customer Photo
                </Text>
                <Image
                  src={activeJob.tyrePhotoUrl}
                  alt="Tyre photo"
                  borderRadius="md"
                  maxH="150px"
                  objectFit="cover"
                />
              </Box>
            )}

            {/* View Full Details Button */}
            <Button
              variant="outline"
              onClick={() => router.push(`/driver/jobs/${activeJob.refNumber}`)}
              width="100%"
            >
              View Full Details and Update Status
            </Button>
          </VStack>
        </Box>
      )}

      {/* No Active Job Message */}
      {!activeJob && isOnline && (
        <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} textAlign="center">
          <Text color={c.muted}>
            No active job at the moment. You will be notified when a job is assigned.
          </Text>
        </Box>
      )}

      {/* Earnings Summary */}
      <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.3s')}>
        <Heading size="md" mb={4} color={c.text}>
          Jobs Completed
        </Heading>
        <Grid templateColumns="repeat(2, 1fr)" gap={4}>
          <GridItem>
            <Box p={4} bg={c.surface} borderRadius="md" textAlign="center">
              <Text fontSize="3xl" fontWeight="bold" color="green.400">
                {jobsToday}
              </Text>
              <Text fontSize="sm" color={c.muted}>
                Today
              </Text>
            </Box>
          </GridItem>
          <GridItem>
            <Box p={4} bg={c.surface} borderRadius="md" textAlign="center">
              <Text fontSize="3xl" fontWeight="bold" color={c.accent}>
                {jobsThisWeek}
              </Text>
              <Text fontSize="sm" color={c.muted}>
                This Week
              </Text>
            </Box>
          </GridItem>
        </Grid>
      </Box>
    </VStack>
  );
}
