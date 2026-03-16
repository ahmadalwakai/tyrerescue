'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Input,
  Textarea,
  Button,
  Badge,
  Spinner,
  NativeSelect,
  Flex,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps, textareaProps } from '@/lib/design-tokens';
import { anim } from '@/lib/animations';

interface RankedDriver {
  driverId: string;
  name: string;
  score: number;
  reason: string;
  distanceToCustomer: number;
  activeJobsToday: number;
}

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
  lockingNutStatus: string | null;
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
  assignedAt: string | null;
  acceptedAt: string | null;
  acceptanceDeadline: string | null;
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
  note: string | null;
  createdAt: string | null;
}

interface Driver {
  id: string;
  name: string;
  email?: string;
  phone?: string | null;
  isOnline?: boolean | null;
  status?: string | null;
  currentLat?: string | null;
  currentLng?: string | null;
  locationAt?: string | null;
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
  pricing_ready: 'Pricing Ready',
  awaiting_payment: 'Awaiting Payment',
  paid: 'Paid',
  payment_failed: 'Payment Failed',
  driver_assigned: 'Driver Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelled_refund_pending: 'Refund Pending',
  refunded: 'Refunded',
  refunded_partial: 'Partially Refunded',
};

const STATUS_COLORS: Record<string, string> = {
  draft: c.muted,
  pricing_ready: c.muted,
  awaiting_payment: '#EAB308',
  paid: 'green',
  payment_failed: 'red',
  driver_assigned: '#3B82F6',
  en_route: '#8B5CF6',
  arrived: '#06B6D4',
  in_progress: c.accent,
  completed: 'green',
  cancelled: 'red',
  cancelled_refund_pending: 'red',
  refunded: 'red',
  refunded_partial: 'red',
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

// Valid forward transitions per status (mirrors state-machine.ts + admin cancel)
const ADMIN_TRANSITIONS: Record<string, string[]> = {
  draft: ['pricing_ready', 'cancelled'],
  pricing_ready: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  payment_failed: ['awaiting_payment', 'cancelled'],
  paid: ['driver_assigned', 'cancelled'],
  driver_assigned: ['en_route', 'cancelled'],
  en_route: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['refunded_partial'],
  cancelled: [],
  cancelled_refund_pending: ['refunded'],
  refunded: [],
  refunded_partial: [],
};

export function BookingDetailClient({
  booking,
  tyres,
  statusHistory,
  assignedDriver,
  availableDrivers,
}: Props) {
  const router = useRouter();

  // ── Driver assignment ──
  const [selectedDriverId, setSelectedDriverId] = useState(assignedDriver?.id || '');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [rankedDrivers, setRankedDrivers] = useState<RankedDriver[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPowered, setAiPowered] = useState(false);
  const [recommendation, setRecommendation] = useState('');

  const canAssign = ['paid', 'driver_assigned'].includes(booking.status);

  const fetchSuggestions = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.refNumber}/suggest-driver`);
      if (res.ok) {
        const data = await res.json();
        setRankedDrivers(data.rankedDrivers || []);
        setAiPowered(data.aiPowered || false);
        setRecommendation(data.recommendation || '');
        if (data.rankedDrivers?.length > 0 && !selectedDriverId) {
          setSelectedDriverId(data.rankedDrivers[0].driverId);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setAiLoading(false);
    }
  }, [booking.refNumber, selectedDriverId]);

  useEffect(() => {
    if (canAssign && availableDrivers.length > 0) {
      fetchSuggestions();
    }
  }, [canAssign, availableDrivers.length, fetchSuggestions]);

  // ── Refund ──
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');

  // ── Edit mode ──
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    vehicleReg: booking.vehicleReg || '',
    vehicleMake: booking.vehicleMake || '',
    vehicleModel: booking.vehicleModel || '',
    addressLine: booking.addressLine,
    scheduledAt: booking.scheduledAt ? booking.scheduledAt.slice(0, 16) : '',
    notes: booking.notes || '',
    serviceType: booking.serviceType,
    bookingType: booking.bookingType,
    tyreSizeDisplay: booking.tyreSizeDisplay || '',
    quantity: String(booking.quantity),
    lockingNutStatus: booking.lockingNutStatus || 'standard',
    subtotal: booking.subtotal,
    vatAmount: booking.vatAmount,
    totalAmount: booking.totalAmount,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  // ── Status change ──
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // ── Cancel ──
  const [showCancel, setShowCancel] = useState(false);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+ef4444(${booking.lng},${booking.lat})/${booking.lng},${booking.lat},14,0/400x300@2x?access_token=${mapboxToken}`;

  const isTerminal = ['completed', 'cancelled', 'refunded', 'refunded_partial'].includes(booking.status);
  const nextStatuses = ADMIN_TRANSITIONS[booking.status] || [];
  const canRefund = ['paid', 'driver_assigned', 'completed'].includes(booking.status) && booking.stripePiId;

  // ── Handlers ──
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
    if (!refundReason.trim()) { setRefundError('Provide a reason'); return; }
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

  async function handleEdit() {
    setEditLoading(true);
    setEditError('');
    setEditSuccess('');
    try {
      const payload: Record<string, unknown> = {};
      if (editData.customerName !== booking.customerName) payload.customerName = editData.customerName;
      if (editData.customerEmail !== booking.customerEmail) payload.customerEmail = editData.customerEmail;
      if (editData.customerPhone !== booking.customerPhone) payload.customerPhone = editData.customerPhone;
      if (editData.vehicleReg !== (booking.vehicleReg || '')) payload.vehicleReg = editData.vehicleReg || null;
      if (editData.vehicleMake !== (booking.vehicleMake || '')) payload.vehicleMake = editData.vehicleMake || null;
      if (editData.vehicleModel !== (booking.vehicleModel || '')) payload.vehicleModel = editData.vehicleModel || null;
      if (editData.addressLine !== booking.addressLine) payload.addressLine = editData.addressLine;
      if (editData.notes !== (booking.notes || '')) payload.notes = editData.notes || null;
      if (editData.serviceType !== booking.serviceType) payload.serviceType = editData.serviceType;
      if (editData.bookingType !== booking.bookingType) payload.bookingType = editData.bookingType;
      if (editData.tyreSizeDisplay !== (booking.tyreSizeDisplay || '')) payload.tyreSizeDisplay = editData.tyreSizeDisplay || null;
      if (editData.quantity !== String(booking.quantity)) payload.quantity = editData.quantity;
      if (editData.lockingNutStatus !== (booking.lockingNutStatus || 'standard')) payload.lockingNutStatus = editData.lockingNutStatus;
      if (editData.subtotal !== booking.subtotal) payload.subtotal = editData.subtotal;
      if (editData.vatAmount !== booking.vatAmount) payload.vatAmount = editData.vatAmount;
      if (editData.totalAmount !== booking.totalAmount) payload.totalAmount = editData.totalAmount;

      const origScheduled = booking.scheduledAt ? booking.scheduledAt.slice(0, 16) : '';
      if (editData.scheduledAt !== origScheduled) {
        payload.scheduledAt = editData.scheduledAt ? new Date(editData.scheduledAt).toISOString() : null;
      }

      if (Object.keys(payload).length === 0) {
        setEditError('No changes to save');
        setEditLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/bookings/${booking.refNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      setEditSuccess('Booking updated');
      setEditing(false);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    setStatusLoading(true);
    setStatusError('');
    try {
      const res = await fetch(`/api/admin/bookings/${booking.refNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note: statusNote || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change status');
      }
      setStatusNote('');
      setShowCancel(false);
      router.refresh();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to change status');
    } finally {
      setStatusLoading(false);
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function formatCurrency(amount: string): string {
    return `£${parseFloat(amount).toFixed(2)}`;
  }

  function ed(field: keyof typeof editData, value: string) {
    setEditData((p) => ({ ...p, [field]: value }));
  }

  function formatRelative(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function formatDuration(from: string, to: string): string {
    const diff = new Date(to).getTime() - new Date(from).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return '<1 min';
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  }

  function TimelineRow({ label, time, prev, active }: { label: string; time: string | null; prev?: string | null; active?: boolean }) {
    const done = !!time;
    return (
      <HStack gap={3} py={2}>
        <Box w="10px" h="10px" borderRadius="full" bg={done ? 'green.400' : c.border} flexShrink={0} />
        <Box flex={1}>
          <Text fontSize="sm" fontWeight={done ? '600' : '400'} color={done ? c.text : c.muted}>{label}</Text>
          {done && <Text fontSize="xs" color={c.muted}>{formatDate(time)}</Text>}
          {done && prev && (
            <Text fontSize="xs" color={c.accent}>{formatDuration(prev, time!)} from previous</Text>
          )}
        </Box>
      </HStack>
    );
  }

  return (
    <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
      {/* ═══ LEFT: Info & Edit ═══ */}
      <GridItem>
        <VStack align="stretch" gap={6}>
          {/* Status bar + edit toggle */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s')}>
            <Flex justify="space-between" align="center" mb={4}>
              <HStack gap={3}>
                <Box w="12px" h="12px" borderRadius="full" bg={STATUS_COLORS[booking.status] || c.muted} />
                <Text fontSize="xl" fontWeight="bold" color={STATUS_COLORS[booking.status] || c.text}>
                  {STATUS_LABELS[booking.status] || booking.status}
                </Text>
              </HStack>
              {!isTerminal && (
                <Button
                  size="sm"
                  variant={editing ? 'solid' : 'outline'}
                  bg={editing ? c.accent : undefined}
                  color={editing ? '#09090B' : c.muted}
                  borderColor={c.border}
                  _hover={{ borderColor: c.accent, color: editing ? '#09090B' : c.accent }}
                  onClick={() => { setEditing(!editing); setEditError(''); setEditSuccess(''); }}
                >
                  {editing ? 'Cancel Edit' : 'Edit Booking'}
                </Button>
              )}
            </Flex>
            {editSuccess && <Text fontSize="sm" color="green.400" mb={3}>{editSuccess}</Text>}

            <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)' }} gap={4}>
              <Box>
                <Text fontSize="sm" color={c.muted}>Type</Text>
                {editing ? (
                  <NativeSelect.Root size="sm" mt={1}>
                    <NativeSelect.Field bg={c.surface} color={c.text} borderColor={c.border} value={editData.bookingType} onChange={(e) => ed('bookingType', e.target.value)}>
                      <option value="emergency">Emergency</option>
                      <option value="scheduled">Scheduled</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                ) : (
                  <Text fontSize="lg" fontWeight="medium" textTransform="capitalize" color={c.text}>{booking.bookingType}</Text>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Service</Text>
                {editing ? (
                  <NativeSelect.Root size="sm" mt={1}>
                    <NativeSelect.Field bg={c.surface} color={c.text} borderColor={c.border} value={editData.serviceType} onChange={(e) => ed('serviceType', e.target.value)}>
                      <option value="tyre_replacement">Tyre Replacement</option>
                      <option value="puncture_repair">Puncture Repair</option>
                      <option value="locking_nut_removal">Locking Nut Removal</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                ) : (
                  <Text fontSize="lg" fontWeight="medium" color={c.text}>{SERVICE_LABELS[booking.serviceType] || booking.serviceType}</Text>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Created</Text>
                <Text fontSize="lg" fontWeight="medium" color={c.text}>{formatDate(booking.createdAt)}</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Scheduled</Text>
                {editing ? (
                  <Input {...inputProps} type="datetime-local" size="sm" mt={1} height="36px" value={editData.scheduledAt} onChange={(e) => ed('scheduledAt', e.target.value)} />
                ) : (
                  <Text fontSize="lg" fontWeight="medium" color={c.text}>{booking.scheduledAt ? formatDate(booking.scheduledAt) : '-'}</Text>
                )}
              </Box>
            </Grid>
          </Box>

          {/* Customer details */}
          <Box bg={c.card} p={{ base: 4, md: 6 }} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>Customer Details</Heading>
            <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)' }} gap={4}>
              <Box>
                <Text fontSize="sm" color={c.muted}>Name</Text>
                {editing ? (
                  <Input {...inputProps} size="sm" mt={1} height="36px" value={editData.customerName} onChange={(e) => ed('customerName', e.target.value)} />
                ) : (
                  <Text fontWeight="medium" color={c.text}>{booking.customerName}</Text>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Email</Text>
                {editing ? (
                  <Input {...inputProps} size="sm" mt={1} height="36px" type="email" value={editData.customerEmail} onChange={(e) => ed('customerEmail', e.target.value)} />
                ) : (
                  <Text fontWeight="medium" color={c.text}>{booking.customerEmail}</Text>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Phone</Text>
                {editing ? (
                  <Input {...inputProps} size="sm" mt={1} height="36px" value={editData.customerPhone} onChange={(e) => ed('customerPhone', e.target.value)} />
                ) : (
                  <Text fontWeight="medium" color={c.text}>{booking.customerPhone}</Text>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" color={c.muted}>Vehicle Reg</Text>
                {editing ? (
                  <Input {...inputProps} size="sm" mt={1} height="36px" value={editData.vehicleReg} onChange={(e) => ed('vehicleReg', e.target.value)} />
                ) : (
                  <Text fontWeight="medium" color={c.text}>
                    {booking.vehicleReg || '-'}
                    {booking.vehicleMake && ` - ${booking.vehicleMake}`}
                    {booking.vehicleModel && ` ${booking.vehicleModel}`}
                  </Text>
                )}
              </Box>
              {editing && (
                <>
                  <Box>
                    <Text fontSize="sm" color={c.muted}>Vehicle Make</Text>
                    <Input {...inputProps} size="sm" mt={1} height="36px" value={editData.vehicleMake} onChange={(e) => ed('vehicleMake', e.target.value)} />
                  </Box>
                  <Box>
                    <Text fontSize="sm" color={c.muted}>Vehicle Model</Text>
                    <Input {...inputProps} size="sm" mt={1} height="36px" value={editData.vehicleModel} onChange={(e) => ed('vehicleModel', e.target.value)} />
                  </Box>
                </>
              )}
            </Grid>
          </Box>

          {/* Location */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.2s')}>
            <Heading size="md" mb={4} color={c.text}>Location</Heading>
            {editing ? (
              <Input {...inputProps} size="sm" height="36px" mb={4} value={editData.addressLine} onChange={(e) => ed('addressLine', e.target.value)} />
            ) : (
              <Text mb={4} color={c.text}>{booking.addressLine}</Text>
            )}
            {booking.distanceMiles && (
              <Text fontSize="sm" color={c.muted} mb={4}>{booking.distanceMiles} miles from depot</Text>
            )}
            {mapboxToken && (
              <Image src={staticMapUrl} alt="Location map" borderRadius="md" width="100%" maxW="400px" />
            )}
          </Box>

          {/* Edit save/cancel bar */}
          {editing && (
            <Box bg={c.card} p={4} borderRadius="md" borderWidth="1px" borderColor={c.accent} style={anim.scaleIn('0.2s')}>
              {editError && <Text color="red.400" fontSize="sm" mb={2}>{editError}</Text>}
              <HStack>
                <Button bg={c.accent} color="#09090B" _hover={{ bg: c.accentHover }} onClick={handleEdit} disabled={editLoading} flex={1} minH="44px">
                  {editLoading ? <Spinner size="sm" /> : 'Save Changes'}
                </Button>
                <Button variant="outline" borderColor={c.border} color={c.muted} onClick={() => { setEditing(false); setEditError(''); }} flex={1} minH="44px">
                  Discard
                </Button>
              </HStack>
            </Box>
          )}

          {/* Tyre details */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.3s')}>
            <Heading size="md" mb={4} color={c.text}>Tyre Details</Heading>
            {editing ? (
              <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)' }} gap={4} mb={4}>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>Tyre Size</Text>
                  <Input {...inputProps} size="sm" height="36px" value={editData.tyreSizeDisplay} onChange={(e) => ed('tyreSizeDisplay', e.target.value)} placeholder="e.g. 225/40R18" />
                </Box>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>Quantity</Text>
                  <Input {...inputProps} size="sm" height="36px" type="number" min={1} max={20} value={editData.quantity} onChange={(e) => ed('quantity', e.target.value)} />
                </Box>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>Locking Nut</Text>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field bg={c.surface} color={c.text} borderColor={c.border} value={editData.lockingNutStatus} onChange={(e) => ed('lockingNutStatus', e.target.value)}>
                      <option value="standard">Standard (N/A)</option>
                      <option value="has_key">Has Key</option>
                      <option value="no_key">No Key</option>
                    </NativeSelect.Field>
                  </NativeSelect.Root>
                </Box>
              </Grid>
            ) : (
              <>
                {booking.tyreSizeDisplay && <Text mb={4} color={c.text}>Size: {booking.tyreSizeDisplay}</Text>}
                <Text mb={2} color={c.text}>Quantity: {booking.quantity}</Text>
                {booking.lockingNutStatus && booking.lockingNutStatus !== 'standard' && (
                  <Box mb={4} p={3} bg={booking.lockingNutStatus === 'no_key' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)'} borderRadius="md">
                    <Text fontWeight="600" color={booking.lockingNutStatus === 'no_key' ? 'red.400' : 'green.400'}>
                      {booking.lockingNutStatus === 'no_key' ? '⚠ Customer does NOT have locking nut key' : '✓ Customer has locking nut key'}
                    </Text>
                  </Box>
                )}
              </>
            )}
            {tyres.length > 0 ? (
              <VStack align="stretch" gap={3}>
                {tyres.map((tyre) => (
                  <Box key={tyre.id} p={3} bg={c.surface} borderRadius="md">
                    <HStack justify="space-between">
                      <Box>
                        <Text fontWeight="medium" color={c.text}>{tyre.brand} {tyre.pattern}</Text>
                        <Text fontSize="sm" color={c.muted}>{tyre.width}/{tyre.aspect}R{tyre.rim} - {tyre.service}</Text>
                      </Box>
                      <Text fontWeight="medium" color={c.text}>{formatCurrency(tyre.unitPrice)} x {tyre.quantity}</Text>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color={c.muted}>No tyres selected</Text>
            )}
            {booking.tyrePhotoUrl && (
              <Box mt={4}>
                <Text fontSize="sm" color={c.muted} mb={2}>Customer Photo</Text>
                <Image src={booking.tyrePhotoUrl} alt="Tyre photo" borderRadius="md" maxH="200px" />
              </Box>
            )}
          </Box>

          {/* Pricing */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.fadeUp('0.4s', '0.4s')}>
            <Heading size="md" mb={4} color={c.text}>Pricing</Heading>
            {editing ? (
              <VStack align="stretch" gap={3}>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>Subtotal (£)</Text>
                  <Input {...inputProps} size="sm" height="36px" type="number" step="0.01" min={0} value={editData.subtotal} onChange={(e) => ed('subtotal', e.target.value)} />
                </Box>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>VAT (£)</Text>
                  <Input {...inputProps} size="sm" height="36px" type="number" step="0.01" min={0} value={editData.vatAmount} onChange={(e) => ed('vatAmount', e.target.value)} />
                </Box>
                <Box>
                  <Text fontSize="sm" color={c.muted} mb={1}>Total (£)</Text>
                  <Input {...inputProps} size="sm" height="36px" type="number" step="0.01" min={0} value={editData.totalAmount} onChange={(e) => ed('totalAmount', e.target.value)} />
                </Box>
                <Text fontSize="xs" color={c.muted}>Pricing override — changes are logged in status history</Text>
              </VStack>
            ) : (
              <VStack align="stretch" gap={2}>
                <HStack justify="space-between">
                  <Text color={c.muted}>Subtotal</Text>
                  <Text color={c.text}>{formatCurrency(booking.subtotal)}</Text>
                </HStack>
                {Number(booking.vatAmount) > 0 && (
                  <HStack justify="space-between">
                    <Text color={c.muted}>VAT (20%)</Text>
                    <Text color={c.text}>{formatCurrency(booking.vatAmount)}</Text>
                  </HStack>
                )}
                <Box pt={2} borderTop="1px solid" borderColor={c.border}>
                  <HStack justify="space-between">
                    <Text fontWeight="semibold" color={c.text}>Total</Text>
                    <Text fontWeight="semibold" fontSize="lg" color={c.text}>{formatCurrency(booking.totalAmount)}</Text>
                  </HStack>
                </Box>
                {booking.stripePiId && <Text fontSize="sm" color={c.muted} mt={2}>Stripe PI: {booking.stripePiId}</Text>}
              </VStack>
            )}
          </Box>

          {/* Notes */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
            <Heading size="md" mb={4} color={c.text}>Notes</Heading>
            {editing ? (
              <Textarea {...textareaProps} rows={4} value={editData.notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => ed('notes', e.target.value)} placeholder="Add internal notes…" />
            ) : (
              <Text whiteSpace="pre-wrap" color={booking.notes ? c.text : c.muted}>{booking.notes || 'No notes'}</Text>
            )}
          </Box>
        </VStack>
      </GridItem>

      {/* ═══ RIGHT: Actions ═══ */}
      <GridItem>
        <VStack align="stretch" gap={6}>
          {/* Status control */}
          {!isTerminal && nextStatuses.length > 0 && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.slideInRight('0.5s')}>
              <Heading size="md" mb={4} color={c.text}>Change Status</Heading>
              <VStack align="stretch" gap={2}>
                <Input
                  {...inputProps}
                  size="sm"
                  height="36px"
                  placeholder="Optional note…"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  mb={1}
                />
                {nextStatuses.filter((s) => s !== 'cancelled').map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    borderColor={c.border}
                    color={c.text}
                    _hover={{ borderColor: STATUS_COLORS[status] || c.accent, color: STATUS_COLORS[status] || c.accent }}
                    onClick={() => handleStatusChange(status)}
                    disabled={statusLoading}
                    width="100%"
                    minH="40px"
                    justifyContent="flex-start"
                    gap={2}
                  >
                    <Box w="8px" h="8px" borderRadius="full" bg={STATUS_COLORS[status] || c.muted} />
                    {statusLoading ? <Spinner size="xs" /> : `Move to ${STATUS_LABELS[status] || status}`}
                  </Button>
                ))}
                {statusError && <Text color="red.400" fontSize="sm">{statusError}</Text>}
              </VStack>

              {/* Cancel button — separate with confirmation */}
              {nextStatuses.includes('cancelled') && (
                <Box mt={4} pt={4} borderTop="1px solid" borderColor={c.border}>
                  {!showCancel ? (
                    <Button
                      size="sm"
                      variant="outline"
                      borderColor="red.500"
                      color="red.400"
                      _hover={{ bg: 'rgba(239,68,68,0.1)' }}
                      onClick={() => setShowCancel(true)}
                      width="100%"
                      minH="40px"
                    >
                      Cancel Booking
                    </Button>
                  ) : (
                    <VStack align="stretch" gap={2}>
                      <Text color="red.400" fontSize="sm" fontWeight="600">Are you sure? This cannot be undone.</Text>
                      <Input
                        {...inputProps}
                        size="sm"
                        height="36px"
                        placeholder="Cancellation reason…"
                        value={statusNote}
                        onChange={(e) => setStatusNote(e.target.value)}
                      />
                      <HStack>
                        <Button size="sm" bg="red.500" color="white" _hover={{ bg: 'red.600' }} onClick={() => handleStatusChange('cancelled')} disabled={statusLoading} flex={1}>
                          {statusLoading ? <Spinner size="xs" /> : 'Yes, Cancel'}
                        </Button>
                        <Button size="sm" variant="outline" borderColor={c.border} color={c.muted} onClick={() => setShowCancel(false)} flex={1}>
                          No, Go Back
                        </Button>
                      </HStack>
                    </VStack>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* Driver assignment */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border} style={anim.slideInRight('0.6s', '0.1s')}>
            <Heading size="md" mb={4} color={c.text}>Driver Assignment</Heading>
            {assignedDriver ? (
              <Box mb={4} p={3} bg="rgba(34,197,94,0.1)" borderRadius="md">
                <Text fontWeight="medium" color={c.text}>{assignedDriver.name}</Text>
                {assignedDriver.email && <Text fontSize="sm" color={c.muted}>{assignedDriver.email}</Text>}
                {assignedDriver.phone && <Text fontSize="sm" color={c.muted}>{assignedDriver.phone}</Text>}
              </Box>
            ) : (
              <Text color={c.muted} mb={4}>No driver assigned</Text>
            )}

            {canAssign && (
              <>
                {aiLoading ? (
                  <HStack justify="center" py={4}>
                    <Spinner size="sm" color={c.accent} />
                    <Text fontSize="sm" color={c.muted}>AI analysing drivers...</Text>
                  </HStack>
                ) : rankedDrivers.length > 0 ? (
                  <VStack align="stretch" gap={3} mb={3}>
                    {recommendation && <Text fontSize="sm" color={c.accent} fontWeight="600">{recommendation}</Text>}
                    {rankedDrivers.map((driver, idx) => {
                      const isSelected = selectedDriverId === driver.driverId;
                      const scoreColor = driver.score > 70 ? 'green' : driver.score >= 40 ? 'orange' : 'gray';
                      return (
                        <Box
                          key={driver.driverId}
                          p={3}
                          bg={isSelected ? 'rgba(249,115,22,0.1)' : c.surface}
                          borderRadius="md"
                          borderWidth="2px"
                          borderColor={isSelected ? c.accent : c.border}
                          cursor="pointer"
                          onClick={() => setSelectedDriverId(driver.driverId)}
                          _hover={{ borderColor: c.accent }}
                        >
                          <HStack justify="space-between" mb={1}>
                            <HStack gap={2}>
                              <Text fontWeight="600" color={c.text}>{driver.name}</Text>
                              {idx === 0 && <Badge colorPalette="orange" size="sm">RECOMMENDED</Badge>}
                            </HStack>
                            <Badge colorPalette={scoreColor} size="sm" variant="solid">{driver.score}/100</Badge>
                          </HStack>
                          <Text fontSize="xs" color={c.muted}>{driver.reason}</Text>
                          <HStack gap={4} mt={1}>
                            <Text fontSize="xs" color={c.muted}>📍 {driver.distanceToCustomer} mi</Text>
                            <Text fontSize="xs" color={c.muted}>🔧 {driver.activeJobsToday} jobs today</Text>
                          </HStack>
                        </Box>
                      );
                    })}
                    {aiPowered && <Text fontSize="xs" color={c.muted} textAlign="center">⚡ Ranked by Groq AI</Text>}
                  </VStack>
                ) : (
                  <Text fontSize="sm" color={c.muted} mb={3}>No drivers available</Text>
                )}
                <Button onClick={handleAssignDriver} disabled={!selectedDriverId || assignLoading} width="100%" minH="48px" bg={c.accent} color="#09090B" _hover={{ bg: c.accentHover }}>
                  {assignLoading ? <HStack gap={2}><Spinner size="sm" /><Text>Assigning…</Text></HStack> : (assignedDriver ? 'Reassign Driver' : 'Assign Driver')}
                </Button>
                {assignError && <Text color="red.400" fontSize="sm" mt={2}>{assignError}</Text>}
              </>
            )}
          </Box>

          {/* Job Management — lifecycle timeline + driver tracking */}
          {booking.assignedAt && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>Job Management</Heading>

              {/* Driver tracking info */}
              {assignedDriver && (
                <Box mb={4} p={3} bg={c.surface} borderRadius="md">
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" fontWeight="600" color={c.text}>Driver Status</Text>
                    <Badge colorPalette={assignedDriver.isOnline ? 'green' : 'red'} size="sm">
                      {assignedDriver.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </HStack>
                  {assignedDriver.currentLat && assignedDriver.currentLng && (
                    <Text fontSize="xs" color={c.muted}>
                      Last GPS: {Number(assignedDriver.currentLat).toFixed(4)}, {Number(assignedDriver.currentLng).toFixed(4)}
                      {assignedDriver.locationAt && ` (${formatRelative(assignedDriver.locationAt)})`}
                    </Text>
                  )}
                </Box>
              )}

              {/* Acceptance status */}
              {booking.status === 'driver_assigned' && !booking.acceptedAt && (
                <Box mb={4} p={3} bg="rgba(234,179,8,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(234,179,8,0.3)">
                  <Text fontSize="sm" fontWeight="600" color="#EAB308">Awaiting Driver Acceptance</Text>
                  {booking.acceptanceDeadline && (
                    <Text fontSize="xs" color={c.muted}>
                      Deadline: {formatDate(booking.acceptanceDeadline)}
                      {new Date(booking.acceptanceDeadline) < new Date() && (
                        <Text as="span" color="red.400" fontWeight="bold"> — OVERDUE</Text>
                      )}
                    </Text>
                  )}
                </Box>
              )}
              {booking.acceptedAt && (
                <Box mb={4} p={3} bg="rgba(34,197,94,0.1)" borderRadius="md" borderWidth="1px" borderColor="rgba(34,197,94,0.3)">
                  <Text fontSize="sm" fontWeight="600" color="green.400">Driver Accepted</Text>
                  <Text fontSize="xs" color={c.muted}>
                    Accepted {formatDate(booking.acceptedAt)}
                    {booking.assignedAt && ` (${formatDuration(booking.assignedAt, booking.acceptedAt)} after assignment)`}
                  </Text>
                </Box>
              )}

              {/* Lifecycle timeline */}
              <VStack align="stretch" gap={0} mt={2}>
                <TimelineRow label="Assigned" time={booking.assignedAt} active />
                <TimelineRow label="Accepted" time={booking.acceptedAt} prev={booking.assignedAt} />
                <TimelineRow label="En Route" time={booking.enRouteAt} prev={booking.acceptedAt || booking.assignedAt} />
                <TimelineRow label="Arrived" time={booking.arrivedAt} prev={booking.enRouteAt} />
                <TimelineRow label="In Progress" time={booking.inProgressAt} prev={booking.arrivedAt} />
                <TimelineRow label="Completed" time={booking.completedAt} prev={booking.inProgressAt} />
              </VStack>

              {/* Total journey duration */}
              {booking.completedAt && booking.assignedAt && (
                <Box mt={4} pt={3} borderTop="1px solid" borderColor={c.border}>
                  <HStack justify="space-between">
                    <Text fontSize="sm" fontWeight="600" color={c.text}>Total Duration</Text>
                    <Text fontSize="sm" fontWeight="bold" color={c.accent}>
                      {formatDuration(booking.assignedAt, booking.completedAt)}
                    </Text>
                  </HStack>
                  {booking.enRouteAt && booking.arrivedAt && (
                    <HStack justify="space-between" mt={1}>
                      <Text fontSize="xs" color={c.muted}>Travel Time</Text>
                      <Text fontSize="xs" color={c.muted}>{formatDuration(booking.enRouteAt, booking.arrivedAt)}</Text>
                    </HStack>
                  )}
                  {booking.inProgressAt && booking.completedAt && (
                    <HStack justify="space-between" mt={1}>
                      <Text fontSize="xs" color={c.muted}>Work Time</Text>
                      <Text fontSize="xs" color={c.muted}>{formatDuration(booking.inProgressAt, booking.completedAt)}</Text>
                    </HStack>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* Refund */}
          {canRefund && (
            <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
              <Heading size="md" mb={4} color={c.text}>Process Refund</Heading>
              <Textarea {...textareaProps} placeholder="Reason for refund…" value={refundReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRefundReason(e.target.value)} mb={3} rows={3} />
              <Button colorPalette="red" onClick={handleRefund} disabled={refundLoading} width="100%" minH="48px">
                {refundLoading ? <HStack gap={2}><Spinner size="sm" /><Text>Processing…</Text></HStack> : 'Process Full Refund'}
              </Button>
              {refundError && <Text color="red.400" fontSize="sm" mt={2}>{refundError}</Text>}
            </Box>
          )}

          {/* Status history */}
          <Box bg={c.card} p={6} borderRadius="md" borderWidth="1px" borderColor={c.border}>
            <Heading size="md" mb={4} color={c.text}>Status History</Heading>
            {statusHistory.length > 0 ? (
              <VStack align="stretch" gap={3}>
                {statusHistory.map((item) => (
                  <Box key={item.id} pl={4} borderLeft="2px solid" borderColor={STATUS_COLORS[item.toStatus] || c.border}>
                    <Text fontWeight="medium" color={c.text}>{STATUS_LABELS[item.toStatus] || item.toStatus}</Text>
                    <Text fontSize="sm" color={c.muted}>
                      {formatDate(item.createdAt)}
                      {item.actorRole && ` by ${item.actorRole}`}
                    </Text>
                    {item.note && <Text fontSize="sm" color={c.muted} mt={1}>{item.note}</Text>}
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
