'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Grid,
  GridItem,
  VStack,
  HStack,
  Text,
  Heading,
  Image,
  Textarea,
  Button,
  NativeSelect,
  Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, selectProps, textareaProps } from '@/lib/design-tokens';
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
  distanceMiles: string | null;
  quantity: number;
  tyreSizeDisplay: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  tyrePhotoUrl: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  scheduledAt: string | null;
  priceSnapshot: Record<string, unknown>;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  stripePiId: string | null;
  notes: string | null;
  createdAt: string | null;
}

interface Tyre {
  id: string;
  condition: string;
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
  note: string | null;
  createdAt: string | null;
}

interface Driver {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
}

interface Props {
  booking: Booking;
  tyres: Tyre[];
  statusHistory: StatusHistoryItem[];
  assignedDriver: Driver | null;
  availableDrivers: Driver[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

export function BookingDetailClient({
  booking,
  tyres,
  statusHistory,
  assignedDriver,
  availableDrivers,
}: Props) {
  const router = useRouter();
  const [selectedDriverId, setSelectedDriverId] = useState(assignedDriver?.id || '');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');

  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ef4444(${booking.lng},${booking.lat})/${booking.lng},${booking.lat},14,0/400x300@2x?access_token=${mapboxToken}`;

  async function handleAssignDriver() {
    if (!selectedDriverId) return;
    setAssignLoading(true);
    setAssignError('');

    try {
      const res = await fetch(`/api/admin/bookings/${booking.refNumber}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: selectedDriverId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to assign driver');
      }

      router.refresh();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign driver');
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleRefund() {
    if (!refundReason.trim()) {
      setRefundError('Please provide a reason for the refund');
      return;
    }
    setRefundLoading(true);
    setRefundError('');

    try {
      const res = await fetch(`/api/admin/bookings/${booking.refNumber}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: refundReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to process refund');
      }

      router.refresh();
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Failed to process refund');
    } finally {
      setRefundLoading(false);
    }
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

  const canAssign = ['confirmed', 'assigned'].includes(booking.status);
  const canRefund = ['confirmed', 'assigned', 'completed'].includes(booking.status) && booking.stripePiId;

  return (
    <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
      {/* Left column - Main info */}
      <GridItem>
        <VStack align="stretch" gap={6}>
          {/* Status and basic info */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s')}>
            <Grid templateColumns="repeat(2, 1fr)" gap={4}>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Status
                </Text>
                <Text
                  fontSize="lg"
                  fontWeight="semibold"
                  color={
                    booking.status === 'completed'
                      ? 'green.400'
                      : booking.status === 'cancelled' || booking.status === 'refunded'
                      ? 'red.400'
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
                <Text fontSize="lg" fontWeight="medium" textTransform="capitalize" color={c.text}>
                  {booking.bookingType}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Service
                </Text>
                <Text fontSize="lg" fontWeight="medium" color={c.text}>
                  {SERVICE_LABELS[booking.serviceType] || booking.serviceType}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Created
                </Text>
                <Text fontSize="lg" fontWeight="medium" color={c.text}>
                  {formatDate(booking.createdAt)}
                </Text>
              </Box>
              {booking.scheduledAt && (
                <Box>
                  <Text fontSize="sm" color={c.muted}>
                    Scheduled
                  </Text>
                  <Text fontSize="lg" fontWeight="medium" color={c.text}>
                    {formatDate(booking.scheduledAt)}
                  </Text>
                </Box>
              )}
            </Grid>
          </Box>

          {/* Customer details */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>
              Customer Details
            </Heading>
            <Grid templateColumns="repeat(2, 1fr)" gap={4}>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Name
                </Text>
                <Text fontWeight="medium" color={c.text}>{booking.customerName}</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Email
                </Text>
                <Text fontWeight="medium" color={c.text}>{booking.customerEmail}</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>
                  Phone
                </Text>
                <Text fontWeight="medium" color={c.text}>{booking.customerPhone}</Text>
              </Box>
              {booking.vehicleReg && (
                <Box>
                  <Text fontSize="sm" color={c.muted}>
                    Vehicle
                  </Text>
                  <Text fontWeight="medium" color={c.text}>
                    {booking.vehicleReg}
                    {booking.vehicleMake && ` - ${booking.vehicleMake}`}
                    {booking.vehicleModel && ` ${booking.vehicleModel}`}
                  </Text>
                </Box>
              )}
            </Grid>
          </Box>

          {/* Location */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.2s')}>
            <Heading size="md" mb={4} color={c.text}>
              Location
            </Heading>
            <Text mb={4} color={c.text}>{booking.addressLine}</Text>
            {booking.distanceMiles && (
              <Text fontSize="sm" color={c.muted} mb={4}>
                {booking.distanceMiles} miles from depot
              </Text>
            )}
            {mapboxToken && (
              <Image
                src={staticMapUrl}
                alt="Location map"
                borderRadius="md"
                width="100%"
                maxW="400px"
              />
            )}
          </Box>

          {/* Tyre details */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.3s')}>
            <Heading size="md" mb={4} color={c.text}>
              Tyre Details
            </Heading>
            {booking.tyreSizeDisplay && (
              <Text mb={4} color={c.text}>Size: {booking.tyreSizeDisplay}</Text>
            )}
            {tyres.length > 0 ? (
              <VStack align="stretch" gap={3}>
                {tyres.map((tyre) => (
                  <Box key={tyre.id} p={3} bg={c.surface} borderRadius="md">
                    <HStack justify="space-between">
                      <Box>
                        <Text fontWeight="medium" color={c.text}>
                          {tyre.brand} {tyre.pattern}
                        </Text>
                        <Text fontSize="sm" color={c.muted}>
                          {tyre.width}/{tyre.aspect}R{tyre.rim} - {tyre.condition} -{' '}
                          {tyre.service}
                        </Text>
                      </Box>
                      <Box textAlign="right">
                        <Text fontWeight="medium" color={c.text}>
                          {formatCurrency(tyre.unitPrice)} x {tyre.quantity}
                        </Text>
                      </Box>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color={c.muted}>No tyres selected</Text>
            )}
            {booking.tyrePhotoUrl && (
              <Box mt={4}>
                <Text fontSize="sm" color={c.muted} mb={2}>
                  Customer Photo
                </Text>
                <Image
                  src={booking.tyrePhotoUrl}
                  alt="Tyre photo"
                  borderRadius="md"
                  maxH="200px"
                />
              </Box>
            )}
          </Box>

          {/* Pricing */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.4s')}>
            <Heading size="md" mb={4} color={c.text}>
              Pricing
            </Heading>
            <VStack align="stretch" gap={2}>
              <HStack justify="space-between">
                <Text color={c.muted}>Subtotal</Text>
                <Text color={c.text}>{formatCurrency(booking.subtotal)}</Text>
              </HStack>
              <HStack justify="space-between">
                <Text color={c.muted}>VAT (20%)</Text>
                <Text color={c.text}>{formatCurrency(booking.vatAmount)}</Text>
              </HStack>
              <Box pt={2} borderTop="1px solid" borderColor={c.border}>
                <HStack justify="space-between">
                  <Text fontWeight="semibold" color={c.text}>Total</Text>
                  <Text fontWeight="semibold" fontSize="lg" color={c.text}>
                    {formatCurrency(booking.totalAmount)}
                  </Text>
                </HStack>
              </Box>
              {booking.stripePiId && (
                <Text fontSize="sm" color={c.muted} mt={2}>
                  Stripe PI: {booking.stripePiId}
                </Text>
              )}
            </VStack>
          </Box>

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
          {/* Assigned driver */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.slideInRight('0.6s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>
              Driver Assignment
            </Heading>
            {assignedDriver ? (
              <Box mb={4} p={3} bg="rgba(34,197,94,0.1)" borderRadius="md">
                <Text fontWeight="medium" color={c.text}>{assignedDriver.name}</Text>
                {assignedDriver.email && (
                  <Text fontSize="sm" color={c.muted}>
                    {assignedDriver.email}
                  </Text>
                )}
                {assignedDriver.phone && (
                  <Text fontSize="sm" color={c.muted}>
                    {assignedDriver.phone}
                  </Text>
                )}
              </Box>
            ) : (
              <Text color={c.muted} mb={4}>
                No driver assigned
              </Text>
            )}

            {canAssign && (
              <>
                <NativeSelect.Root mb={3}>
                  <NativeSelect.Field
                    {...selectProps}
                    value={selectedDriverId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedDriverId(e.target.value)}
                  >
                    <option value="">Select driver...</option>
                    {availableDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </NativeSelect.Field>
                </NativeSelect.Root>
                <Button
                  onClick={handleAssignDriver}
                  disabled={!selectedDriverId || assignLoading}
                  width="100%"
                >
                  {assignLoading ? (
                    <HStack gap={2}>
                      <Spinner size="sm" />
                      <Text>Assigning...</Text>
                    </HStack>
                  ) : (
                    assignedDriver ? 'Reassign Driver' : 'Assign Driver'
                  )}
                </Button>
                {assignError && (
                  <Text color="red.400" fontSize="sm" mt={2}>
                    {assignError}
                  </Text>
                )}
              </>
            )}
          </Box>

          {/* Refund section */}
          {canRefund && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>
                Process Refund
              </Heading>
              <Textarea
                {...textareaProps}
                placeholder="Reason for refund..."
                value={refundReason}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRefundReason(e.target.value)}
                mb={3}
                rows={3}
              />
              <Button
                colorPalette="red"
                onClick={handleRefund}
                disabled={refundLoading}
                width="100%"
              >
                {refundLoading ? (
                  <HStack gap={2}>
                    <Spinner size="sm" />
                    <Text>Processing...</Text>
                  </HStack>
                ) : (
                  'Process Full Refund'
                )}
              </Button>
              {refundError && (
                <Text color="red.400" fontSize="sm" mt={2}>
                  {refundError}
                </Text>
              )}
            </Box>
          )}

          {/* Status history */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
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
                    {item.note && (
                      <Text fontSize="sm" color={c.muted} mt={1}>
                        {item.note}
                      </Text>
                    )}
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
