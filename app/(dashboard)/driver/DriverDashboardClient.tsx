'use client';

import { useState, useEffect } from 'react';
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
  acceptedAt: string | null;
  serviceType: string;
  bookingType: string;
  notes: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  lockingNutStatus: string | null;
  tyres: {
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
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // Auto-refresh every 30s to pick up admin edits/new assignments
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(interval);
  }, [router]);

  const needsAcceptance = activeJob?.status === 'driver_assigned' && !activeJob?.acceptedAt;

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
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  async function handleAcceptReject(action: 'accept' | 'reject') {
    if (!activeJob) return;
    action === 'accept' ? setAcceptLoading(true) : setRejectLoading(true);
    setAcceptError('');
    try {
      const res = await fetch(`/api/driver/jobs/${activeJob.refNumber}/accept`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} job`);
      }
      router.refresh();
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : `Failed to ${action} job`);
    } finally {
      setAcceptLoading(false);
      setRejectLoading(false);
    }
  }

  return (
    <VStack align="stretch" gap={6}>
      {/* Online/Offline Toggle */}
      <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.scaleIn('0.5s')}>
        <VStack align="stretch" gap={4}>
          <Box display="flex" flexDirection={{ base: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ base: 'stretch', sm: 'center' }} gap={3}>
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
              textAlign="center"
            >
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Box>
          </Box>

          <Button
            size="lg"
            colorPalette={isOnline ? 'gray' : 'green'}
            onClick={handleToggleOnline}
            disabled={isToggling}
            width="100%"
            minH="56px"
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
        <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} borderLeft="4px solid" borderLeftColor={c.accent} style={anim.fadeUp('0.6s', '0.2s')}>
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
              {activeJob.serviceType && (
                <> &bull; {activeJob.serviceType.replace(/_/g, ' ')}</>
              )}
            </Text>

            {/* Customer Address with Google Maps link */}
            <Box>
              <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                Customer Address
              </Text>
              <Box
                asChild
                display="block"
                p={{ base: 3, md: 0 }}
                bg={{ base: c.surface, md: 'transparent' }}
                borderRadius={{ base: '8px', md: '0' }}
                minH="48px"
              >
                <a
                  href={getGoogleMapsUrl(activeJob.addressLine, activeJob.lat, activeJob.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Text color={c.accent} fontWeight="medium">{activeJob.addressLine}</Text>
                  <Text fontSize="xs" color={c.muted} mt={1}>
                    Tap to open in Google Maps
                  </Text>
                </a>
              </Box>
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
                      {tyre.brand} {tyre.pattern} x{tyre.quantity}
                    </Text>
                  ))}
                </VStack>
              )}
            </Box>

            {/* Vehicle Info */}
            {(activeJob.vehicleReg || activeJob.vehicleMake || activeJob.vehicleModel) && (
              <Box>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                  Vehicle
                </Text>
                <Text fontWeight="medium" color={c.text}>
                  {[activeJob.vehicleReg, activeJob.vehicleMake, activeJob.vehicleModel].filter(Boolean).join(' · ')}
                </Text>
                {activeJob.lockingNutStatus && (
                  <Text fontSize="xs" color={c.muted} mt={1}>
                    Locking nut: {activeJob.lockingNutStatus.replace(/_/g, ' ')}
                  </Text>
                )}
              </Box>
            )}

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

            {/* Notes */}
            {activeJob.notes && (
              <Box>
                <Text fontSize="sm" fontWeight="medium" color={c.muted} mb={1}>
                  Notes
                </Text>
                <Text fontSize="sm" color={c.text} whiteSpace="pre-wrap">{activeJob.notes}</Text>
              </Box>
            )}

            {/* Accept/Reject buttons for new assignments */}
            {needsAcceptance && (
              <Box p={3} bg="rgba(234,179,8,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(234,179,8,0.3)">
                <Text fontWeight="600" color="#EAB308" mb={3} textAlign="center">
                  New Job Assigned — Accept or Reject
                </Text>
                <HStack gap={3}>
                  <Button
                    flex={1}
                    size="lg"
                    minH="56px"
                    bg="green.500"
                    color="white"
                    _hover={{ bg: 'green.600' }}
                    onClick={() => handleAcceptReject('accept')}
                    disabled={acceptLoading || rejectLoading}
                  >
                    {acceptLoading ? 'Accepting...' : 'Accept Job'}
                  </Button>
                  <Button
                    flex={1}
                    size="lg"
                    minH="56px"
                    variant="outline"
                    borderColor="red.500"
                    color="red.400"
                    _hover={{ bg: 'rgba(239,68,68,0.1)' }}
                    onClick={() => handleAcceptReject('reject')}
                    disabled={acceptLoading || rejectLoading}
                  >
                    {rejectLoading ? 'Rejecting...' : 'Reject'}
                  </Button>
                </HStack>
                {acceptError && <Text color="red.400" fontSize="sm" mt={2}>{acceptError}</Text>}
              </Box>
            )}

            {/* View Full Details Button */}
            <Button
              variant="outline"
              onClick={() => router.push(`/driver/jobs/${activeJob.refNumber}`)}
              width="100%"
              minH="56px"
              fontSize={{ base: 'md', md: 'sm' }}
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
      <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s', '0.3s')}>
        <Heading size="md" mb={4} color={c.text}>
          Jobs Completed
        </Heading>
        <Grid templateColumns="repeat(2, 1fr)" gap={{ base: 3, md: 4 }}>
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
