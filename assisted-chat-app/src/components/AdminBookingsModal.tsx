import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '@/lib/api';
import { AppButton, StatusBanner } from './ui';
import { colors, fontSize, radius, space } from './theme';

// ── Types ──────────────────────────────────────────────────────────────────

interface MobileListItem {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  scheduledAt: string | null;
  totalAmount: string;
  createdAt: string | null;
  driverId: string | null;
  driverName: string | null;
}

interface MobileListResponse {
  items: MobileListItem[];
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
}

interface MobileTyre {
  id: string;
  quantity: number;
  unitPrice: string;
  service: string;
  brand: string | null;
  pattern: string | null;
  sizeDisplay: string | null;
}

interface MobileStatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: string | null;
  note: string | null;
  createdAt: string | null;
}

interface MobileAssignedDriver {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string | null;
  isOnline: boolean | null;
}

interface MobileAvailableDriver {
  id: string;
  name: string;
  isOnline: boolean | null;
  status: string | null;
}

interface MobileBooking {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  lat: string;
  lng: string;
  distanceMiles: string | null;
  distanceSource: string | null;
  quantity: number;
  tyreSizeDisplay: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  lockingNutStatus: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  scheduledAt: string | null;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  stripePiId: string | null;
  paymentType: string | null;
  notes: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  landingPage: string | null;
  referrer: string | null;
  createdAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  inProgressAt: string | null;
  completedAt: string | null;
}

interface MobileDetailResponse {
  booking: MobileBooking;
  tyres: MobileTyre[];
  statusHistory: MobileStatusHistoryEntry[];
  assignedDriver: MobileAssignedDriver | null;
  availableDrivers: MobileAvailableDriver[];
  validNextStatuses: string[];
}

interface RankedDriver {
  driverId: string;
  name: string;
  score: number;
  reason: string;
  distanceToCustomer: number;
  activeJobsToday: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  initialRefNumber?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  'completed', 'cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending',
]);

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_payment', label: 'Pending Payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'driver_assigned', label: 'Driver Assigned' },
  { value: 'en_route', label: 'En Route' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_payment: 'Pending Payment',
  awaiting_payment: 'Awaiting Payment',
  pricing_ready: 'Pricing Ready',
  paid: 'Paid',
  payment_failed: 'Payment Failed',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
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
  draft: colors.muted,
  pending_payment: colors.warning,
  awaiting_payment: colors.warning,
  pricing_ready: colors.muted,
  paid: colors.success,
  payment_failed: colors.danger,
  confirmed: '#93C5FD',
  assigned: '#C4B5FD',
  driver_assigned: '#93C5FD',
  en_route: '#FDBA74',
  arrived: '#FDBA74',
  in_progress: colors.accent,
  completed: colors.success,
  cancelled: colors.danger,
  cancelled_refund_pending: colors.danger,
  refunded: colors.danger,
  refunded_partial: colors.danger,
};

const SERVICE_LABELS: Record<string, string> = {
  tyre_replacement: 'Tyre Replacement',
  puncture_repair: 'Puncture Repair',
  locking_nut_removal: 'Locking Nut Removal',
};

const SERVICE_OPTIONS = [
  { value: 'tyre_replacement', label: 'Tyre Replacement' },
  { value: 'puncture_repair', label: 'Puncture Repair' },
  { value: 'locking_nut_removal', label: 'Locking Nut Removal' },
];

const BOOKING_TYPE_OPTIONS = [
  { value: 'emergency', label: 'Emergency' },
  { value: 'scheduled', label: 'Scheduled' },
];

const LOCKING_NUT_OPTIONS = [
  { value: 'standard', label: 'Standard (N/A)' },
  { value: 'has_key', label: 'Has Key' },
  { value: 'no_key', label: 'No Key' },
];

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/London',
});

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

function formatCurrency(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return amount;
  return `£${n.toFixed(2)}`;
}

function buildListPath(page: number, status: string, search: string, dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (status && status !== 'all') params.set('status', status);
  if (search.trim()) params.set('search', search.trim());
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  return `/api/mobile/admin/bookings?${params.toString()}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? colors.muted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function OptionPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pickerButton, pressed && styles.pickerButtonPressed]}
      >
        <Text style={styles.pickerText} numberOfLines={1}>{current?.label ?? value}</Text>
        <Text style={styles.pickerChevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.pickerSheet}>
            <ScrollView>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => { onChange(opt.value); setOpen(false); }}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    opt.value === value && styles.pickerOptionSelected,
                    pressed && styles.pickerOptionPressed,
                  ]}
                >
                  <Text style={[styles.pickerOptionText, opt.value === value && styles.pickerOptionTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Detail View ────────────────────────────────────────────────────────────

type ActionMode = null | 'status' | 'edit' | 'assign' | 'refund';

function BookingDetailView({
  refNumber,
  onBack,
}: {
  refNumber: string;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MobileDetailResponse | null>(null);
  const [action, setAction] = useState<ActionMode>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Status change
  const [statusNote, setStatusNote] = useState('');

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editVehicleReg, setEditVehicleReg] = useState('');
  const [editVehicleMake, setEditVehicleMake] = useState('');
  const [editVehicleModel, setEditVehicleModel] = useState('');
  const [editServiceType, setEditServiceType] = useState('tyre_replacement');
  const [editBookingType, setEditBookingType] = useState('emergency');
  const [editTyreSize, setEditTyreSize] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editLockingNut, setEditLockingNut] = useState('standard');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editSubtotal, setEditSubtotal] = useState('');
  const [editVat, setEditVat] = useState('');
  const [editTotal, setEditTotal] = useState('');

  // Assign fields
  const [rankedDrivers, setRankedDrivers] = useState<RankedDriver[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  // Refund fields
  const [refundReason, setRefundReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAction(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.get<MobileDetailResponse>(
        `/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking.');
    } finally {
      setLoading(false);
    }
  }, [refNumber]);

  useEffect(() => { void load(); }, [load]);

  function openEdit() {
    if (!data) return;
    const b = data.booking;
    setEditName(b.customerName);
    setEditEmail(b.customerEmail);
    setEditPhone(b.customerPhone);
    setEditAddress(b.addressLine);
    setEditNotes(b.notes ?? '');
    setEditVehicleReg(b.vehicleReg ?? '');
    setEditVehicleMake(b.vehicleMake ?? '');
    setEditVehicleModel(b.vehicleModel ?? '');
    setEditServiceType(b.serviceType);
    setEditBookingType(b.bookingType);
    setEditTyreSize(b.tyreSizeDisplay ?? '');
    setEditQty(String(b.quantity));
    setEditLockingNut(b.lockingNutStatus ?? 'standard');
    setEditScheduledAt(b.scheduledAt ? new Date(b.scheduledAt).toISOString().slice(0, 16) : '');
    setEditSubtotal(b.subtotal);
    setEditVat(b.vatAmount);
    setEditTotal(b.totalAmount);
    setAction('edit');
    setActionError(null);
    setActionSuccess(null);
  }

  async function openAssign() {
    setAction('assign');
    setActionError(null);
    setSelectedDriverId(data?.assignedDriver?.id ?? '');
    if (!data) return;
    setSuggestLoading(true);
    try {
      const res = await api.get<{ rankedDrivers: RankedDriver[] }>(
        `/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}/suggest-driver`,
      );
      setRankedDrivers(res.rankedDrivers ?? []);
      if ((res.rankedDrivers?.length ?? 0) > 0 && !data.assignedDriver) {
        setSelectedDriverId(res.rankedDrivers[0].driverId);
      }
    } catch {
      setRankedDrivers([]);
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.patch(`/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}`, {
        status: newStatus,
        note: statusNote.trim() || undefined,
      });
      setStatusNote('');
      setActionSuccess(`Status changed to "${STATUS_LABELS[newStatus] ?? newStatus}"`);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to change status.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEdit() {
    if (!data) return;
    const b = data.booking;
    const payload: Record<string, unknown> = {};
    if (editName !== b.customerName) payload.customerName = editName;
    if (editEmail !== b.customerEmail) payload.customerEmail = editEmail;
    if (editPhone !== b.customerPhone) payload.customerPhone = editPhone;
    if (editAddress !== b.addressLine) payload.addressLine = editAddress;
    if (editNotes !== (b.notes ?? '')) payload.notes = editNotes || null;
    if (editVehicleReg !== (b.vehicleReg ?? '')) payload.vehicleReg = editVehicleReg || null;
    if (editVehicleMake !== (b.vehicleMake ?? '')) payload.vehicleMake = editVehicleMake || null;
    if (editVehicleModel !== (b.vehicleModel ?? '')) payload.vehicleModel = editVehicleModel || null;
    if (editServiceType !== b.serviceType) payload.serviceType = editServiceType;
    if (editBookingType !== b.bookingType) payload.bookingType = editBookingType;
    if (editTyreSize !== (b.tyreSizeDisplay ?? '')) payload.tyreSizeDisplay = editTyreSize || null;
    if (editQty !== String(b.quantity)) payload.quantity = parseInt(editQty, 10);
    if (editLockingNut !== (b.lockingNutStatus ?? 'standard')) payload.lockingNutStatus = editLockingNut;
    const origScheduled = b.scheduledAt ? new Date(b.scheduledAt).toISOString().slice(0, 16) : '';
    if (editScheduledAt !== origScheduled) {
      payload.scheduledAt = editScheduledAt ? new Date(editScheduledAt).toISOString() : null;
    }
    if (editSubtotal !== b.subtotal) payload.subtotal = editSubtotal;
    if (editVat !== b.vatAmount) payload.vatAmount = editVat;
    if (editTotal !== b.totalAmount) payload.totalAmount = editTotal;

    if (Object.keys(payload).length === 0) {
      setActionError('No changes to save.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await api.put(`/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}`, payload);
      setActionSuccess('Booking updated.');
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssign() {
    if (!selectedDriverId) { setActionError('Select a driver first.'); return; }
    setActionLoading(true);
    setActionError(null);
    try {
      await api.patch(`/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}/assign`, {
        driverId: selectedDriverId,
      });
      setActionSuccess('Driver assigned.');
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign driver.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveDriver() {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.del(`/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}/assign`);
      setActionSuccess('Driver removed.');
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove driver.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRefund() {
    if (!refundReason.trim()) { setActionError('Refund reason is required.'); return; }
    setActionLoading(true);
    setActionError(null);
    try {
      await api.post(`/api/mobile/admin/bookings/${encodeURIComponent(refNumber)}/refund`, {
        reason: refundReason.trim(),
      });
      setRefundReason('');
      setActionSuccess('Refund processed.');
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to process refund.');
    } finally {
      setActionLoading(false);
    }
  }

  const isTerminal = data ? TERMINAL_STATUSES.has(data.booking.status) : false;
  const canRefund = data
    ? !!data.booking.stripePiId && ['paid', 'driver_assigned', 'completed'].includes(data.booking.status)
    : false;

  // ── Action sub-views ──────────────────────────────────────────────────────

  function renderStatusAction() {
    if (!data) return null;
    const nextStatuses = (data.validNextStatuses ?? []).filter((s) => s !== 'cancelled');
    return (
      <ScrollView contentContainerStyle={styles.actionScroll}>
        <Text style={styles.actionPanelTitle}>Change Status</Text>
        <Text style={styles.fieldLabel}>Optional note</Text>
        <TextInput
          value={statusNote}
          onChangeText={setStatusNote}
          placeholder="Note (optional)…"
          placeholderTextColor={colors.subtle}
          style={[styles.actionInput, styles.actionInputMulti]}
          multiline
        />
        {nextStatuses.map((s) => {
          const col = STATUS_COLORS[s] ?? colors.accent;
          return (
            <Pressable
              key={s}
              onPress={() => !actionLoading && handleStatusChange(s)}
              disabled={actionLoading}
              style={({ pressed }) => [styles.statusTransBtn, { borderColor: col }, pressed && styles.statusTransBtnPressed]}
            >
              <View style={[styles.statusTransDot, { backgroundColor: col }]} />
              <Text style={[styles.statusTransText, { color: col }]}>
                {actionLoading ? '…' : `Move to: ${STATUS_LABELS[s] ?? s}`}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            if (!actionLoading) {
              Alert.alert(
                'Cancel Booking',
                'Are you sure you want to cancel this booking?',
                [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes, Cancel', style: 'destructive', onPress: () => handleStatusChange('cancelled') },
                ],
              );
            }
          }}
          disabled={actionLoading}
          style={({ pressed }) => [styles.statusTransBtn, { borderColor: colors.danger, marginTop: 8 }, pressed && styles.statusTransBtnPressed]}
        >
          <View style={[styles.statusTransDot, { backgroundColor: colors.danger }]} />
          <Text style={[styles.statusTransText, { color: colors.danger }]}>Cancel Booking</Text>
        </Pressable>
        {actionError ? <StatusBanner kind="err" message={actionError} /> : null}
        {actionSuccess ? <Text style={styles.actionSuccessText}>{actionSuccess}</Text> : null}
        <AppButton label="Close" variant="ghost" onPress={() => setAction(null)} style={styles.actionCloseBtn} />
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  function renderEditAction() {
    return (
      <ScrollView contentContainerStyle={styles.actionScroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.actionPanelTitle}>Edit Booking</Text>

        <Text style={styles.fieldGroup}>Contact</Text>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput value={editName} onChangeText={setEditName} style={styles.actionInput} autoCapitalize="words" />
        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput value={editEmail} onChangeText={setEditEmail} style={styles.actionInput} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Text style={styles.fieldLabel}>Phone</Text>
        <TextInput value={editPhone} onChangeText={setEditPhone} style={styles.actionInput} keyboardType="phone-pad" />

        <Text style={styles.fieldGroup}>Vehicle</Text>
        <Text style={styles.fieldLabel}>Registration</Text>
        <TextInput value={editVehicleReg} onChangeText={setEditVehicleReg} style={styles.actionInput} autoCapitalize="characters" />
        <Text style={styles.fieldLabel}>Make</Text>
        <TextInput value={editVehicleMake} onChangeText={setEditVehicleMake} style={styles.actionInput} autoCapitalize="words" />
        <Text style={styles.fieldLabel}>Model</Text>
        <TextInput value={editVehicleModel} onChangeText={setEditVehicleModel} style={styles.actionInput} autoCapitalize="words" />

        <Text style={styles.fieldGroup}>Booking</Text>
        <Text style={styles.fieldLabel}>Service Type</Text>
        <OptionPicker value={editServiceType} options={SERVICE_OPTIONS} onChange={setEditServiceType} />
        <Text style={styles.fieldLabel}>Booking Type</Text>
        <OptionPicker value={editBookingType} options={BOOKING_TYPE_OPTIONS} onChange={setEditBookingType} />
        <Text style={styles.fieldLabel}>Tyre Size</Text>
        <TextInput value={editTyreSize} onChangeText={setEditTyreSize} style={styles.actionInput} placeholder="e.g. 225/45R17" placeholderTextColor={colors.subtle} autoCapitalize="none" />
        <Text style={styles.fieldLabel}>Quantity</Text>
        <TextInput value={editQty} onChangeText={setEditQty} style={styles.actionInput} keyboardType="number-pad" />
        <Text style={styles.fieldLabel}>Locking Nut</Text>
        <OptionPicker value={editLockingNut} options={LOCKING_NUT_OPTIONS} onChange={setEditLockingNut} />
        <Text style={styles.fieldLabel}>Scheduled At (YYYY-MM-DDTHH:MM)</Text>
        <TextInput value={editScheduledAt} onChangeText={setEditScheduledAt} style={styles.actionInput} placeholder="2026-05-20T10:00" placeholderTextColor={colors.subtle} autoCapitalize="none" autoCorrect={false} />

        <Text style={styles.fieldGroup}>Location</Text>
        <Text style={styles.fieldLabel}>Address</Text>
        <TextInput value={editAddress} onChangeText={setEditAddress} style={[styles.actionInput, styles.actionInputMulti]} multiline />

        <Text style={styles.fieldGroup}>Pricing</Text>
        <Text style={styles.fieldLabel}>Subtotal (£)</Text>
        <TextInput value={editSubtotal} onChangeText={setEditSubtotal} style={styles.actionInput} keyboardType="decimal-pad" />
        <Text style={styles.fieldLabel}>VAT (£)</Text>
        <TextInput value={editVat} onChangeText={setEditVat} style={styles.actionInput} keyboardType="decimal-pad" />
        <Text style={styles.fieldLabel}>Total (£)</Text>
        <TextInput value={editTotal} onChangeText={setEditTotal} style={styles.actionInput} keyboardType="decimal-pad" />

        <Text style={styles.fieldGroup}>Notes</Text>
        <TextInput value={editNotes} onChangeText={setEditNotes} style={[styles.actionInput, styles.actionInputMulti]} multiline placeholder="Internal notes…" placeholderTextColor={colors.subtle} />

        {actionError ? <StatusBanner kind="err" message={actionError} /> : null}
        {actionSuccess ? <Text style={styles.actionSuccessText}>{actionSuccess}</Text> : null}
        <AppButton label={actionLoading ? 'Saving…' : 'Save Changes'} variant="primary" onPress={handleEdit} style={styles.actionSaveBtn} />
        <AppButton label="Discard" variant="ghost" onPress={() => setAction(null)} style={styles.actionCloseBtn} />
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderAssignAction() {
    if (!data) return null;
    const driverOpts = data.availableDrivers.map((d) => ({
      value: d.id,
      label: `${d.name}${d.isOnline ? ' (online)' : ''}`,
    }));
    return (
      <ScrollView contentContainerStyle={styles.actionScroll}>
        <Text style={styles.actionPanelTitle}>Assign Driver</Text>

        {data.assignedDriver ? (
          <View style={styles.assignedCard}>
            <Text style={styles.assignedCardLabel}>Currently assigned</Text>
            <Text style={styles.assignedCardName}>{data.assignedDriver.name}</Text>
            <Text style={styles.assignedCardMeta}>{data.assignedDriver.isOnline ? '● Online' : '○ Offline'}</Text>
            <Pressable
              onPress={() => {
                Alert.alert('Remove Driver', 'Remove the assigned driver and revert to Paid status?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: handleRemoveDriver },
                ]);
              }}
              disabled={actionLoading}
              style={({ pressed }) => [styles.removeDriverBtn, pressed && styles.removeDriverBtnPressed]}
            >
              <Text style={styles.removeDriverBtnText}>Remove Driver</Text>
            </Pressable>
          </View>
        ) : null}

        {suggestLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
        ) : rankedDrivers.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>AI Suggestions (proximity + workload)</Text>
            {rankedDrivers.map((d) => (
              <Pressable
                key={d.driverId}
                onPress={() => setSelectedDriverId(d.driverId)}
                style={({ pressed }) => [
                  styles.driverSuggestCard,
                  selectedDriverId === d.driverId && styles.driverSuggestCardSel,
                  pressed && styles.driverSuggestCardPressed,
                ]}
              >
                <Text style={[styles.driverSuggestName, selectedDriverId === d.driverId && styles.driverSuggestNameSel]}>
                  {d.name}
                </Text>
                <Text style={styles.driverSuggestMeta}>{d.reason}  ·  score {d.score}</Text>
              </Pressable>
            ))}
          </>
        ) : null}

        {driverOpts.length > 0 ? (
          <>
            <Text style={styles.fieldLabel}>All available drivers</Text>
            <OptionPicker value={selectedDriverId} options={driverOpts} onChange={setSelectedDriverId} />
          </>
        ) : (
          <Text style={styles.emptyText}>No drivers available</Text>
        )}

        {actionError ? <StatusBanner kind="err" message={actionError} /> : null}
        {actionSuccess ? <Text style={styles.actionSuccessText}>{actionSuccess}</Text> : null}
        <AppButton label={actionLoading ? 'Assigning…' : 'Assign Driver'} variant="primary" onPress={handleAssign} style={styles.actionSaveBtn} />
        <AppButton label="Cancel" variant="ghost" onPress={() => setAction(null)} style={styles.actionCloseBtn} />
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  function renderRefundAction() {
    return (
      <ScrollView contentContainerStyle={styles.actionScroll}>
        <Text style={styles.actionPanelTitle}>Process Refund</Text>
        <Text style={styles.fieldLabel}>Reason (required)</Text>
        <TextInput
          value={refundReason}
          onChangeText={setRefundReason}
          style={[styles.actionInput, styles.actionInputMulti]}
          multiline
          placeholder="Reason for refund…"
          placeholderTextColor={colors.subtle}
        />
        {actionError ? <StatusBanner kind="err" message={actionError} /> : null}
        {actionSuccess ? <Text style={styles.actionSuccessText}>{actionSuccess}</Text> : null}
        <AppButton
          label={actionLoading ? 'Processing…' : 'Confirm Refund'}
          variant="primary"
          onPress={handleRefund}
          style={styles.actionSaveBtn}
        />
        <AppButton label="Cancel" variant="ghost" onPress={() => setAction(null)} style={styles.actionCloseBtn} />
        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  function renderActionBar() {
    if (isTerminal || !data) return null;
    return (
      <View style={styles.actionBar}>
        <Pressable
          onPress={() => { setStatusNote(''); setActionError(null); setActionSuccess(null); setAction('status'); }}
          style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
        >
          <Text style={styles.actionChipText}>Change Status</Text>
        </Pressable>
        <Pressable
          onPress={openEdit}
          style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
        >
          <Text style={styles.actionChipText}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={openAssign}
          style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
        >
          <Text style={styles.actionChipText}>{data.assignedDriver ? 'Reassign Driver' : 'Assign Driver'}</Text>
        </Pressable>
        {canRefund ? (
          <Pressable
            onPress={() => { setRefundReason(''); setActionError(null); setActionSuccess(null); setAction('refund'); }}
            style={({ pressed }) => [styles.actionChip, pressed && styles.actionChipPressed]}
          >
            <Text style={styles.actionChipText}>Refund</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fullScreen}>
      {/* Header */}
      <View style={styles.sheetHeader}>
        <Pressable
          onPress={() => { if (action) { setAction(null); } else { onBack(); } }}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>{action ? '← Back' : '← Back'}</Text>
        </Pressable>
        <Text style={styles.sheetTitle} numberOfLines={1}>{refNumber}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centeredMessage}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centeredMessage}>
          <StatusBanner kind="err" message={error} />
          <AppButton label="Retry" variant="secondary" onPress={load} style={styles.retryBtn} />
        </View>
      ) : data ? (
        <>
          {action === 'status' && renderStatusAction()}
          {action === 'edit' && renderEditAction()}
          {action === 'assign' && renderAssignAction()}
          {action === 'refund' && renderRefundAction()}
          {action === null && (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              {/* Status + type */}
              <View style={styles.detailStatusRow}>
                <StatusBadge status={data.booking.status} />
                <Text style={styles.detailType}>
                  {data.booking.bookingType === 'scheduled' ? 'Scheduled' : 'Emergency'}
                </Text>
              </View>

              {/* Action bar */}
              {renderActionBar()}

              {/* Customer */}
              <SectionTitle title="Customer" />
              <View style={styles.card}>
                <DetailRow label="Name" value={data.booking.customerName} />
                <DetailRow label="Email" value={data.booking.customerEmail} />
                <DetailRow label="Phone" value={data.booking.customerPhone} />
              </View>

              {/* Booking */}
              <SectionTitle title="Booking" />
              <View style={styles.card}>
                <DetailRow label="Reference" value={data.booking.refNumber} />
                <DetailRow label="Service" value={SERVICE_LABELS[data.booking.serviceType] ?? data.booking.serviceType} />
                <DetailRow label="Type" value={data.booking.bookingType} />
                <DetailRow
                  label="Scheduled Service Time"
                  value={data.booking.bookingType === 'scheduled' ? formatDate(data.booking.scheduledAt) : null}
                />
                <DetailRow label="Created" value={formatDate(data.booking.createdAt)} />
                <DetailRow label="Assigned at" value={formatDate(data.booking.assignedAt)} />
                <DetailRow label="Accepted at" value={formatDate(data.booking.acceptedAt)} />
                <DetailRow label="En route at" value={formatDate(data.booking.enRouteAt)} />
                <DetailRow label="Arrived at" value={formatDate(data.booking.arrivedAt)} />
                <DetailRow label="In progress at" value={formatDate(data.booking.inProgressAt)} />
                <DetailRow label="Completed at" value={formatDate(data.booking.completedAt)} />
              </View>

              {/* Location */}
              <SectionTitle title="Location" />
              <View style={styles.card}>
                <DetailRow label="Address" value={data.booking.addressLine} />
                <DetailRow
                  label="Coordinates"
                  value={data.booking.lat && data.booking.lng ? `${data.booking.lat}, ${data.booking.lng}` : null}
                />
                <DetailRow
                  label="Distance"
                  value={data.booking.distanceMiles ? `${parseFloat(data.booking.distanceMiles).toFixed(1)} miles` : null}
                />
                <DetailRow label="Distance source" value={data.booking.distanceSource} />
              </View>

              {/* Vehicle */}
              {(data.booking.vehicleReg || data.booking.vehicleMake || data.booking.vehicleModel) ? (
                <>
                  <SectionTitle title="Vehicle" />
                  <View style={styles.card}>
                    <DetailRow label="Registration" value={data.booking.vehicleReg} />
                    <DetailRow label="Make" value={data.booking.vehicleMake} />
                    <DetailRow label="Model" value={data.booking.vehicleModel} />
                  </View>
                </>
              ) : null}

              {/* Tyres */}
              <SectionTitle title="Tyres" />
              <View style={styles.card}>
                <DetailRow label="Size" value={data.booking.tyreSizeDisplay} />
                <DetailRow label="Quantity" value={String(data.booking.quantity)} />
                <DetailRow label="Locking nut" value={data.booking.lockingNutStatus} />
              </View>
              {data.tyres.length > 0 && (
                <View style={[styles.card, styles.cardTop0]}>
                  {data.tyres.map((tyre) => (
                    <View key={tyre.id} style={styles.tyreRow}>
                      <Text style={styles.tyreLabel}>
                        {tyre.brand ?? 'Unknown'} {tyre.pattern ?? ''}  {tyre.sizeDisplay ?? ''}
                      </Text>
                      <Text style={styles.tyreDetail}>
                        {tyre.quantity} × {formatCurrency(tyre.unitPrice)} — {tyre.service}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Pricing */}
              <SectionTitle title="Pricing" />
              <View style={styles.card}>
                <DetailRow label="Subtotal" value={formatCurrency(data.booking.subtotal)} />
                <DetailRow label="VAT" value={formatCurrency(data.booking.vatAmount)} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatCurrency(data.booking.totalAmount)}</Text>
                </View>
                <DetailRow label="Payment type" value={data.booking.paymentType} />
                <DetailRow label="Stripe PI" value={data.booking.stripePiId} />
              </View>

              {/* Assigned Driver */}
              {data.assignedDriver ? (
                <>
                  <SectionTitle title="Assigned Driver" />
                  <View style={styles.card}>
                    <DetailRow label="Name" value={data.assignedDriver.name} />
                    <DetailRow label="Email" value={data.assignedDriver.email} />
                    <DetailRow label="Phone" value={data.assignedDriver.phone} />
                    <DetailRow
                      label="Status"
                      value={`${data.assignedDriver.isOnline ? 'Online' : 'Offline'}${data.assignedDriver.status ? ` — ${data.assignedDriver.status}` : ''}`}
                    />
                  </View>
                </>
              ) : null}

              {/* Notes */}
              {data.booking.notes ? (
                <>
                  <SectionTitle title="Notes" />
                  <View style={styles.card}>
                    <Text style={styles.notesText}>{data.booking.notes}</Text>
                  </View>
                </>
              ) : null}

              {/* Status History */}
              {data.statusHistory.length > 0 ? (
                <>
                  <SectionTitle title="Status History" />
                  <View style={styles.card}>
                    {data.statusHistory.map((h) => (
                      <View key={h.id} style={styles.historyRow}>
                        <View style={styles.historyLeft}>
                          <Text style={styles.historyTransition}>
                            {h.fromStatus
                              ? `${STATUS_LABELS[h.fromStatus] ?? h.fromStatus} → ${STATUS_LABELS[h.toStatus] ?? h.toStatus}`
                              : STATUS_LABELS[h.toStatus] ?? h.toStatus}
                          </Text>
                          {h.note ? <Text style={styles.historyNote}>{h.note}</Text> : null}
                          {h.actorRole ? <Text style={styles.historyActor}>{h.actorRole}</Text> : null}
                        </View>
                        <Text style={styles.historyDate}>{formatDate(h.createdAt)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}

              {/* Attribution */}
              {(data.booking.utmSource || data.booking.gclid || data.booking.landingPage || data.booking.referrer) ? (
                <>
                  <SectionTitle title="Attribution" />
                  <View style={styles.card}>
                    <DetailRow label="UTM Source" value={data.booking.utmSource} />
                    <DetailRow label="UTM Medium" value={data.booking.utmMedium} />
                    <DetailRow label="UTM Campaign" value={data.booking.utmCampaign} />
                    <DetailRow label="UTM Term" value={data.booking.utmTerm} />
                    <DetailRow label="UTM Content" value={data.booking.utmContent} />
                    <DetailRow label="GCLID" value={data.booking.gclid} />
                    <DetailRow label="Landing page" value={data.booking.landingPage} />
                    <DetailRow label="Referrer" value={data.booking.referrer} />
                  </View>
                </>
              ) : null}

              <View style={styles.detailBottom} />
            </ScrollView>
          )}
        </>
      ) : null}
    </View>
  );
}

// ── Status filter picker ────────────────────────────────────────────────────

function StatusPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return <OptionPicker value={value} options={STATUS_OPTIONS} onChange={onChange} />;
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function AdminBookingsModal({ visible, onClose, initialRefNumber = null }: Props) {
  const [items, setItems] = useState<MobileListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('all');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');

  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const loadItems = useCallback(async (p: number, s: string, st: string, df: string, dt: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<MobileListResponse>(buildListPath(p, st, s, df, dt));
      setItems(res.items);
      setPage(res.page);
      setTotalPages(res.totalPages);
      setTotalCount(res.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSelectedRef(initialRefNumber);
      void loadItems(1, appliedSearch, appliedStatus, appliedDateFrom, appliedDateTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialRefNumber]);

  const applyFilters = useCallback(() => {
    setAppliedSearch(search);
    setAppliedStatus(statusFilter);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    void loadItems(1, search, statusFilter, dateFrom, dateTo);
  }, [search, statusFilter, dateFrom, dateTo, loadItems]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setAppliedSearch('');
    setAppliedStatus('all');
    setAppliedDateFrom('');
    setAppliedDateTo('');
    void loadItems(1, '', 'all', '', '');
  }, [loadItems]);

  const goToPage = useCallback(
    (p: number) => {
      void loadItems(p, appliedSearch, appliedStatus, appliedDateFrom, appliedDateTo);
    },
    [loadItems, appliedSearch, appliedStatus, appliedDateFrom, appliedDateTo],
  );

  const handleClose = useCallback(() => {
    setSelectedRef(null);
    onClose();
  }, [onClose]);

  // Detail view
  if (selectedRef) {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={() => setSelectedRef(null)}>
        <BookingDetailView
          refNumber={selectedRef}
          onBack={() => setSelectedRef(null)}
        />
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <View style={styles.fullScreen}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Bookings</Text>
          <Pressable onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        {/* Filters */}
        <View style={styles.filterBox}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={applyFilters}
            returnKeyType="search"
            placeholder="Ref, name, or email..."
            placeholderTextColor={colors.subtle}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.filterRow}>
            <View style={styles.filterStatusWrap}>
              <StatusPicker value={statusFilter} onChange={setStatusFilter} />
            </View>
            <TextInput
              value={dateFrom}
              onChangeText={setDateFrom}
              placeholder="From YYYY-MM-DD"
              placeholderTextColor={colors.subtle}
              style={styles.dateInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              value={dateTo}
              onChangeText={setDateTo}
              placeholder="To YYYY-MM-DD"
              placeholderTextColor={colors.subtle}
              style={styles.dateInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.filterActions}>
            <AppButton label="Filter" variant="primary" onPress={applyFilters} style={styles.filterBtn} />
            <AppButton label="Clear" variant="ghost" onPress={clearFilters} style={styles.filterBtn} />
          </View>
        </View>

        {/* Count */}
        <Text style={styles.countText}>
          {totalCount} booking{totalCount !== 1 ? 's' : ''}
        </Text>

        {loading ? (
          <View style={styles.centeredMessage}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.centeredMessage}>
            <StatusBanner kind="err" message={error} />
            <AppButton
              label="Retry"
              variant="secondary"
              onPress={() => loadItems(page, appliedSearch, appliedStatus, appliedDateFrom, appliedDateTo)}
              style={styles.retryBtn}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No bookings found</Text>
            ) : (
              items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedRef(item.refNumber)}
                  style={({ pressed }) => [styles.bookingCard, pressed && styles.bookingCardPressed]}
                >
                  <View style={styles.bookingCardTop}>
                    <Text style={styles.bookingRef}>{item.refNumber}</Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Text style={styles.bookingCustomer} numberOfLines={1}>
                    {item.customerName}
                  </Text>
                  <View style={styles.bookingMeta}>
                    <Text style={styles.bookingMetaText} numberOfLines={1}>
                      {SERVICE_LABELS[item.serviceType] ?? item.serviceType}
                      {' · '}
                      {item.bookingType === 'scheduled' ? 'Scheduled' : 'Emergency'}
                    </Text>
                    <Text style={styles.bookingTotal}>{formatCurrency(item.totalAmount)}</Text>
                  </View>
                  {item.bookingType === 'scheduled' && item.scheduledAt ? (
                    <Text style={styles.bookingScheduled} numberOfLines={1}>
                      Service time: {formatDate(item.scheduledAt)}
                    </Text>
                  ) : null}
                  {item.driverName ? (
                    <Text style={styles.bookingDriverName} numberOfLines={1}>
                      Driver: {item.driverName}
                    </Text>
                  ) : null}
                  <Text style={styles.bookingCreated} numberOfLines={1}>
                    Created: {formatDate(item.createdAt)}
                  </Text>
                </Pressable>
              ))
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <Pressable
                  onPress={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  style={({ pressed }) => [
                    styles.pageBtn,
                    page <= 1 && styles.pageBtnDisabled,
                    pressed && page > 1 && styles.pageBtnPressed,
                  ]}
                >
                  <Text style={[styles.pageBtnText, page <= 1 && styles.pageBtnTextDisabled]}>
                    Previous
                  </Text>
                </Pressable>
                <Text style={styles.pageInfo}>
                  Page {page} of {totalPages}
                </Text>
                <Pressable
                  onPress={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  style={({ pressed }) => [
                    styles.pageBtn,
                    page >= totalPages && styles.pageBtnDisabled,
                    pressed && page < totalPages && styles.pageBtnPressed,
                  ]}
                >
                  <Text style={[styles.pageBtnText, page >= totalPages && styles.pageBtnTextDisabled]}>
                    Next
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.listBottom} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    paddingTop: 52,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  sheetTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  closeBtn: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  closeBtnText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  backBtn: {
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  backBtnText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  headerSpacer: {
    minWidth: 64,
  },
  filterBox: {
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: space.sm,
  },
  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  filterStatusWrap: {
    flex: 1,
    minWidth: 130,
  },
  dateInput: {
    flex: 1,
    height: 44,
    minWidth: 130,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    fontSize: fontSize.xs,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  filterActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  filterBtn: {
    flex: 1,
    minHeight: 44,
  },
  countText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  },
  retryBtn: {
    minWidth: 120,
  },
  listContent: {
    padding: space.md,
    gap: space.sm,
  },
  listBottom: {
    height: space.xl,
  },
  emptyText: {
    color: colors.muted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: space.xxl,
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 5,
  },
  bookingCardPressed: {
    backgroundColor: colors.card,
  },
  bookingCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  bookingRef: {
    color: colors.accent,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  bookingCustomer: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  bookingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  bookingMetaText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    flex: 1,
  },
  bookingTotal: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  bookingScheduled: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  bookingDriverName: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  bookingCreated: {
    color: colors.subtle,
    fontSize: fontSize.xs,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingVertical: space.lg,
  },
  pageBtn: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.38,
  },
  pageBtnPressed: {
    backgroundColor: colors.card,
  },
  pageBtnText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  pageBtnTextDisabled: {
    color: colors.muted,
  },
  pageInfo: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  // Detail view
  detailContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  detailScroll: {
    padding: space.md,
    gap: space.sm,
  },
  detailBottom: {
    height: space.xxl,
  },
  detailStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.xs,
  },
  detailType: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 6,
  },
  cardTop0: {
    marginTop: -4,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: space.sm,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    flex: 1,
  },
  detailValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 6,
  },
  totalLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
    flex: 1,
  },
  totalValue: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '900',
    flex: 1.5,
    textAlign: 'right',
  },
  tyreRow: {
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  tyreLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  tyreDetail: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  notesText: {
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyLeft: {
    flex: 1,
    gap: 2,
  },
  historyTransition: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  historyNote: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
  historyActor: {
    color: colors.subtle,
    fontSize: fontSize.xs,
  },
  historyDate: {
    color: colors.muted,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  // Status picker
  pickerButton: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: 6,
  },
  pickerButtonPressed: {
    backgroundColor: colors.card,
  },
  pickerText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  pickerChevron: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    maxHeight: '60%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
  },
  pickerSheetTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginBottom: space.md,
  },
  pickerOption: {
    minHeight: 48,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: space.sm,
  },
  pickerOptionSelected: {
    backgroundColor: 'rgba(249,115,22,0.10)',
  },
  pickerOptionPressed: {
    backgroundColor: colors.card,
  },
  pickerOptionText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  pickerOptionTextSelected: {
    color: colors.accent,
    fontWeight: '800',
  },
  // ── Action bar ──────────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 100,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  actionChipPressed: {
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  actionChipText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  // ── Action sub-view scaffold ──────────────────────────────────────────────
  actionScroll: {
    padding: space.md,
    gap: space.sm,
  },
  actionPanelTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginBottom: space.sm,
  },
  // ── Edit form ─────────────────────────────────────────────────────────────
  fieldGroup: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: space.md,
    marginBottom: 2,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: space.sm,
    marginBottom: 2,
  },
  actionInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  actionInputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionSaveBtn: {
    marginTop: space.lg,
  },
  actionCloseBtn: {
    marginTop: space.sm,
  },
  actionSuccessText: {
    color: colors.success,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: space.sm,
  },
  // ── Status transition buttons ─────────────────────────────────────────────
  statusTransBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    marginTop: space.sm,
  },
  statusTransBtnPressed: {
    opacity: 0.7,
  },
  statusTransDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusTransText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
  // ── Assign driver ─────────────────────────────────────────────────────────
  assignedCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 4,
    marginBottom: space.sm,
  },
  assignedCardLabel: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  assignedCardName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  assignedCardMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
    marginBottom: space.sm,
  },
  removeDriverBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  removeDriverBtnPressed: {
    opacity: 0.7,
  },
  removeDriverBtnText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  driverSuggestCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 3,
    marginTop: space.sm,
  },
  driverSuggestCardSel: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.08)',
  },
  driverSuggestCardPressed: {
    opacity: 0.8,
  },
  driverSuggestName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  driverSuggestNameSel: {
    color: colors.accent,
  },
  driverSuggestMeta: {
    color: colors.muted,
    fontSize: fontSize.xs,
  },
});
