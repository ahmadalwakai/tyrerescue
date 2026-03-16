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
import { colorTokens as c } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface Booking {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  lat: string;
  lng: string;
  tyreSizeDisplay: string | null;
  quantity: number;
  customerName: string;
  customerPhone: string;
  tyrePhotoUrl: string | null;
  scheduledAt: string | null;
  notes: string | null;
  createdAt: string | null;
  acceptedAt: string | null;
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  inProgressAt: string | null;
  completedAt: string | null;
}

interface Tyre {
  id: string;
  quantity: number;
  unitPrice: string;
  service: string;
  brand: string | null;
  pattern: string | null;
  width: number | null;
  aspect: number | null;
  rim: number | null;
}

interface StatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  createdAt: string | null;
}

interface Props {
  booking: Booking;
  tyres: Tyre[];
  statusHistory: StatusHistoryItem[];
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  driver_assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

// Status button configs
const STATUS_BUTTONS: Record<string, { label: string; nextStatus: string; colorPalette: string }> = {
  driver_assigned: {
    label: 'Start Journey',
    nextStatus: 'en_route',
    colorPalette: 'orange',
  },
  en_route: {
    label: 'I Have Arrived',
    nextStatus: 'arrived',
    colorPalette: 'orange',
  },
  arrived: {
    label: 'Start Job',
    nextStatus: 'in_progress',
    colorPalette: 'orange',
  },
  in_progress: {
    label: 'Mark Job Complete',
    nextStatus: 'completed',
    colorPalette: 'green',
  },
};

export function JobDetailClient({ booking, tyres, statusHistory }: Props) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  const needsAcceptance = booking.status === 'driver_assigned' && !booking.acceptedAt;
  const buttonConfig = needsAcceptance ? null : STATUS_BUTTONS[booking.status];

  function getGoogleMapsUrl(lat: string, lng: string): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  async function handleStatusUpdate() {
    if (!buttonConfig) return;

    // For completion, require confirmation
    if (booking.status === 'in_progress' && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsUpdating(true);
    setError('');

    try {
      const res = await fetch(`/api/driver/jobs/${booking.refNumber}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: buttonConfig.nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      router.refresh();
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  }

  function cancelConfirm() {
    setShowConfirm(false);
  }

  async function handleAcceptReject(action: 'accept' | 'reject') {
    action === 'accept' ? setAcceptLoading(true) : setRejectLoading(true);
    setAcceptError('');
    try {
      const res = await fetch(`/api/driver/jobs/${booking.refNumber}/accept`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} job`);
      }
      if (action === 'reject') {
        router.push('/driver/jobs');
      } else {
        router.refresh();
      }
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setAcceptLoading(false);
      setRejectLoading(false);
    }
  }

  function formatDuration(from: string, to: string): string {
    const diff = new Date(to).getTime() - new Date(from).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return '<1 min';
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatCurrency(amount: string): string {
    return `£${parseFloat(amount).toFixed(2)}`;
  }

  return (
    <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
      {/* Left column - Main info */}
      <GridItem>
        <VStack align="stretch" gap={6}>
          {/* Status */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.5s')}>
            <Box display="flex" flexDirection={{ base: 'column', sm: 'row' }} justifyContent="space-between" gap={3}>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Current Status
                </Text>
                <Text
                  fontSize="xl"
                  fontWeight="bold"
                  color={
                    booking.status === 'completed'
                      ? 'green.400'
                      : booking.status === 'in_progress'
                      ? c.accent
                      : c.accent
                  }
                >
                  {STATUS_LABELS[booking.status] || booking.status}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Type
                </Text>
                <Text fontWeight="medium" textTransform="capitalize" color={c.text}>
                  {booking.bookingType}
                </Text>
              </Box>
            </Box>
          </Box>

          {/* Customer Address */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>
              Customer Location
            </Heading>
            <Box
              asChild
              display="block"
              p={{ base: 3, md: 0 }}
              bg={{ base: c.surface, md: 'transparent' }}
              borderRadius={{ base: '8px', md: '0' }}
              minH="48px"
            >
              <a
                href={getGoogleMapsUrl(booking.lat, booking.lng)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Text color={c.accent} fontWeight="medium" fontSize="lg">{booking.addressLine}</Text>
                <Text fontSize="sm" color={c.muted} mt={2}>
                  Tap to open in Google Maps
                </Text>
              </a>
            </Box>
          </Box>

          {/* Customer Contact */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.2s')}>
            <Heading size="md" mb={4} color={c.text}>
              Customer Contact
            </Heading>
            <VStack align="stretch" gap={3}>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Name
                </Text>
                <Text fontWeight="medium" color={c.text}>{booking.customerName}</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Phone
                </Text>
                <ChakraLink
                  href={`tel:${booking.customerPhone}`}
                  color={c.accent}
                  fontWeight="medium"
                  fontSize="lg"
                >
                  {booking.customerPhone}
                </ChakraLink>
              </Box>
            </VStack>
          </Box>

          {/* Tyre Details */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.3s')}>
            <Heading size="md" mb={4} color={c.text}>
              Tyre Details
            </Heading>
            <VStack align="stretch" gap={3}>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Service
                </Text>
                <Text fontWeight="medium" color={c.text}>
                  {SERVICE_LABELS[booking.serviceType] || booking.serviceType}
                </Text>
              </Box>
              {booking.tyreSizeDisplay && (
                <Box>
                  <Text fontSize="sm" color={c.muted}>
                    Size
                  </Text>
                  <Text fontWeight="medium" color={c.text}>{booking.tyreSizeDisplay}</Text>
                </Box>
              )}
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Quantity
                </Text>
                <Text fontWeight="medium" color={c.text}>
                  {booking.quantity} tyre{booking.quantity !== 1 ? 's' : ''}
                </Text>
              </Box>
              {tyres.length > 0 && (
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={2}>
                    Selected Tyres
                  </Text>
                  <VStack align="stretch" gap={2}>
                    {tyres.map((tyre) => (
                      <Box key={tyre.id} p={3} bg={c.surface} borderRadius="md">
                        <Text fontWeight="medium" color={c.text}>
                          {tyre.brand} {tyre.pattern}
                        </Text>
                        <Text fontSize="sm" color={c.muted}>
                          {tyre.width}/{tyre.aspect}R{tyre.rim} - {tyre.service}
                        </Text>
                        <Text fontSize="sm">
                          {formatCurrency(tyre.unitPrice)} x {tyre.quantity}
                        </Text>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}
            </VStack>
          </Box>

          {/* Customer Photo */}
          {booking.tyrePhotoUrl && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>
                Customer Photo
              </Heading>
              <Image
                src={booking.tyrePhotoUrl}
                alt="Tyre photo from customer"
                borderRadius="md"
                maxH="300px"
                objectFit="contain"
              />
            </Box>
          )}

          {/* Notes */}
          {booking.notes && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>
                Notes
              </Heading>
              <Text whiteSpace="pre-wrap" color={c.text}>{booking.notes}</Text>
            </Box>
          )}
        </VStack>
      </GridItem>

      {/* Right column - Actions and history */}
      <GridItem>
        <VStack align="stretch" gap={6}>
          {/* Accept / Reject */}
          {needsAcceptance && (
            <Box bg="rgba(234,179,8,0.1)" p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor="rgba(234,179,8,0.4)">
              <Heading size="md" mb={2} color="yellow.300">
                New Job Assigned
              </Heading>
              <Text color={c.muted} mb={4}>You must accept or reject this job before you can proceed.</Text>
              {acceptError && <Text color="red.400" fontSize="sm" mb={3}>{acceptError}</Text>}
              <HStack gap={3}>
                <Button flex={1} size="lg" colorPalette="green" minH="56px" py={8} fontSize="lg" disabled={acceptLoading || rejectLoading} onClick={() => handleAcceptReject('accept')}>
                  {acceptLoading ? 'Accepting…' : 'Accept Job'}
                </Button>
                <Button flex={1} size="lg" variant="outline" colorPalette="red" minH="56px" disabled={acceptLoading || rejectLoading} onClick={() => handleAcceptReject('reject')}>
                  {rejectLoading ? 'Rejecting…' : 'Reject'}
                </Button>
              </HStack>
            </Box>
          )}

          {/* Status Update Button */}
          {buttonConfig && (
            <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>
                Update Status
              </Heading>

              {!showConfirm ? (
                <Button
                  size="lg"
                  colorPalette={buttonConfig.colorPalette}
                  onClick={handleStatusUpdate}
                  disabled={isUpdating}
                  width="100%"
                  minH="56px"
                  py={8}
                  fontSize="lg"
                >
                  {isUpdating ? 'Updating...' : buttonConfig.label}
                </Button>
              ) : (
                <VStack align="stretch" gap={4}>
                  <Text fontWeight="medium" textAlign="center" color={c.text}>
                    Are you sure you want to mark this job as complete?
                  </Text>
                  <Button
                    size="lg"
                    colorPalette="green"
                    onClick={handleStatusUpdate}
                    disabled={isUpdating}
                    width="100%"
                    minH="56px"
                    py={8}
                    fontSize="lg"
                  >
                    {isUpdating ? 'Updating...' : 'Yes, Mark Complete'}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={cancelConfirm}
                    disabled={isUpdating}
                    width="100%"
                  >
                    Cancel
                  </Button>
                </VStack>
              )}

              {error && (
                <Text color="red.400" fontSize="sm" mt={4}>
                  {error}
                </Text>
              )}
            </Box>
          )}

          {/* Completed Message */}
          {booking.status === 'completed' && (
            <Box
              bg="rgba(34,197,94,0.1)"
              p={6}
              borderRadius="md"
              borderWidth="1px"
              borderColor="rgba(34,197,94,0.3)"
            >
              <Text
                fontWeight="semibold"
                color="green.400"
                fontSize="lg"
                textAlign="center"
              >
                Job Completed
              </Text>
              <Text color="green.300" textAlign="center" mt={2}>
                This job has been successfully completed.
              </Text>
            </Box>
          )}

          {/* Journey Timeline */}
          {booking.assignedAt && (
            <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>Journey Timeline</Heading>
              <VStack align="stretch" gap={0}>
                {[
                  { label: 'Assigned', time: booking.assignedAt, prev: null as string | null },
                  { label: 'Accepted', time: booking.acceptedAt, prev: booking.assignedAt },
                  { label: 'En Route', time: booking.enRouteAt, prev: booking.acceptedAt },
                  { label: 'Arrived', time: booking.arrivedAt, prev: booking.enRouteAt },
                  { label: 'In Progress', time: booking.inProgressAt, prev: booking.arrivedAt },
                  { label: 'Completed', time: booking.completedAt, prev: booking.inProgressAt },
                ].map((step) => {
                  const done = !!step.time;
                  return (
                    <HStack key={step.label} gap={3} py={2}>
                      <Box w="10px" h="10px" borderRadius="full" bg={done ? 'green.400' : c.border} flexShrink={0} />
                      <Box flex={1}>
                        <Text fontSize="sm" fontWeight="medium" color={done ? c.text : c.muted}>{step.label}</Text>
                        {step.time && (
                          <Text fontSize="xs" color={c.muted}>
                            {formatDate(step.time)}
                            {step.prev && ` (${formatDuration(step.prev, step.time)})`}
                          </Text>
                        )}
                      </Box>
                    </HStack>
                  );
                })}
              </VStack>
              {booking.completedAt && booking.assignedAt && (
                <Box mt={4} pt={3} borderTopWidth="1px" borderColor={c.border}>
                  <HStack justifyContent="space-between">
                    <Text fontSize="sm" color={c.muted}>Total Duration</Text>
                    <Text fontSize="sm" fontWeight="bold" color="green.400">{formatDuration(booking.assignedAt, booking.completedAt)}</Text>
                  </HStack>
                  {booking.enRouteAt && booking.arrivedAt && (
                    <HStack justifyContent="space-between" mt={1}>
                      <Text fontSize="sm" color={c.muted}>Travel Time</Text>
                      <Text fontSize="sm" color={c.text}>{formatDuration(booking.enRouteAt, booking.arrivedAt)}</Text>
                    </HStack>
                  )}
                  {booking.inProgressAt && booking.completedAt && (
                    <HStack justifyContent="space-between" mt={1}>
                      <Text fontSize="sm" color={c.muted}>Work Time</Text>
                      <Text fontSize="sm" color={c.text}>{formatDuration(booking.inProgressAt, booking.completedAt)}</Text>
                    </HStack>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* Scheduled Time */}
          {booking.scheduledAt && (
            <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>
                Scheduled Time
              </Heading>
              <Text fontWeight="medium" fontSize="lg" color={c.text}>
                {formatDate(booking.scheduledAt)}
              </Text>
            </Box>
          )}

          {/* Status History */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border}>
            <Heading size="md" mb={4} color={c.text}>
              Status History
            </Heading>
            {statusHistory.length > 0 ? (
              <VStack align="stretch" gap={3}>
                {statusHistory.map((item) => (
                  <Box
                    key={item.id}
                    pl={4}
                    borderLeft="2px solid"
                    borderColor={c.border}
                  >
                    <Text fontWeight="medium" color={c.text}>
                      {STATUS_LABELS[item.toStatus] || item.toStatus}
                    </Text>
                    <Text fontSize="sm" color={c.muted}>
                      {formatDate(item.createdAt)}
                      {item.actorRole && ` by ${item.actorRole}`}
                    </Text>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color={c.muted}>No status history</Text>
            )}
          </Box>
        </VStack>
      </GridItem>
    </Grid>
  );
}
