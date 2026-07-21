import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, SectionCard } from '@/components/ui';
import { colors, fontSize, radius, space } from '@/components/theme';
import { useDriverList, type DriverListItem } from '@/hooks/useDriverList';
import type { BookingTrackingData } from '@/hooks/useBookingTracking';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  bookingRef: string | null;
  trackingData: BookingTrackingData | null;
  customerLat: number | null;
  customerLng: number | null;
  /** Called when the operator selects or deselects a driver. */
  onSelectDriver?: (phone: string | null) => void;
  onAssigned?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineKm(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
): number | null {
  if (!a || !b) return null;
  const R = 6_371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatKm(km: number | null): string {
  if (km == null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.round(km * 1_000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Last seen: unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Last seen: just now';
  if (diff < 3_600_000) return `Last seen: ${Math.round(diff / 60_000)} min ago`;
  return `Last seen: ${Math.round(diff / 3_600_000)}h ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DriverAssignSection({
  bookingRef,
  trackingData,
  customerLat,
  customerLng,
  onSelectDriver,
  onAssigned,
}: Props) {
  const { drivers, loading, error, reload } = useDriverList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const trackingReady = trackingData?.customerUrl != null;
  const refNumber = bookingRef ?? trackingData?.refNumber ?? null;

  const customerPoint =
    customerLat != null && customerLng != null
      ? { lat: customerLat, lng: customerLng }
      : null;

  const driverOptions = useMemo(
    () =>
      drivers
        .map((driver) => ({
          driver,
          distKm: getDriverDistanceKm(driver, customerPoint),
        }))
        .sort((a, b) => {
          const aBusy = a.driver.activeJobRef ? 1 : 0;
          const bBusy = b.driver.activeJobRef ? 1 : 0;
          if (aBusy !== bBusy) return aBusy - bBusy;
          if (a.driver.isOnline !== b.driver.isOnline) return a.driver.isOnline ? -1 : 1;
          if (a.distKm != null && b.distKm != null) return a.distKm - b.distKm;
          if (a.distKm != null) return -1;
          if (b.distKm != null) return 1;
          return a.driver.name.localeCompare(b.driver.name);
        }),
    [customerPoint, drivers],
  );
  const selectedDriver = driverOptions.find((option) => option.driver.id === selectedId) ?? null;

  const selectDriver = (driver: DriverListItem | null) => {
    setSelectedId(driver?.id ?? null);
    setAssignMessage(null);
    onSelectDriver?.(driver?.phone ?? null);
  };

  return (
    <SectionCard title="Assign driver">
      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <AppButton label="Retry" variant="secondary" onPress={() => void reload()} />
        </View>
      ) : null}

      {loading && drivers.length === 0 ? (
        <Text style={styles.muted}>Loading drivers…</Text>
      ) : drivers.length === 0 ? (
        <Text style={styles.muted}>No drivers found.</Text>
      ) : (
        <View style={styles.menuStack}>
          <Pressable
            onPress={() => setMenuOpen(true)}
            android_ripple={{ color: colors.ripple, borderless: false }}
            accessibilityRole="button"
            accessibilityLabel="Open driver selection menu"
            style={({ pressed }) => [styles.selectButton, pressed && styles.selectButtonPressed]}
          >
            <View style={styles.selectCopy}>
              <Text style={styles.selectLabel}>Driver</Text>
              <Text style={styles.selectValue} numberOfLines={1}>
                {selectedDriver ? selectedDriver.driver.name : 'Select driver'}
              </Text>
            </View>
            <Text style={styles.selectAction}>{selectedDriver ? 'Change' : 'Choose'}</Text>
          </Pressable>

          {selectedDriver ? (
            <SelectedDriverSummary driver={selectedDriver.driver} distKm={selectedDriver.distKm} />
          ) : null}
        </View>
      )}

      {assignMessage ? (
        <Text style={[styles.assignMessage, assignMessage.kind === 'ok' ? styles.assignMessageOk : styles.assignMessageErr]}>
          {assignMessage.text}
        </Text>
      ) : null}

      <AppButton
        label={assigning ? 'Sending job…' : 'Send job to selected driver'}
        variant="primary"
        loading={assigning}
        disabled={!selectedDriver || !refNumber || assigning}
        onPress={async () => {
          if (!selectedDriver || !refNumber) return;
          setAssigning(true);
          setAssignMessage(null);
          try {
            await api.patch(`/api/admin/bookings/${encodeURIComponent(refNumber)}/assign`, {
              driverId: selectedDriver.driver.id,
            });
            setAssignMessage({ kind: 'ok', text: `Job ${refNumber} sent to ${selectedDriver.driver.name}.` });
            onAssigned?.();
            void reload();
          } catch (err) {
            setAssignMessage({
              kind: 'err',
              text: err instanceof Error ? err.message : 'Could not send job to driver.',
            });
          } finally {
            setAssigning(false);
          }
        }}
        fullWidth
      />

      <Text style={styles.hint}>
        {refNumber
          ? trackingReady
            ? 'The selected driver receives a push alert. Payment status stays accurate in the driver app.'
            : 'Tracking will activate once the booking is confirmed; the driver still receives the job.'
          : 'Create the booking first, then choose a driver.'}
      </Text>

      <DriverSelectionMenu
        visible={menuOpen}
        options={driverOptions}
        selectedId={selectedId}
        onSelect={(driver) => {
          selectDriver(driver);
          setMenuOpen(false);
        }}
        onClear={() => selectDriver(null)}
        onClose={() => setMenuOpen(false)}
      />
    </SectionCard>
  );
}

// ── Driver selection menu ─────────────────────────────────────────────────────

function getDriverDistanceKm(
  driver: DriverListItem,
  customerPoint: { lat: number; lng: number } | null,
): number | null {
  const driverPoint =
    driver.currentLat != null && driver.currentLng != null
      ? { lat: parseFloat(driver.currentLat), lng: parseFloat(driver.currentLng) }
      : null;
  return haversineKm(driverPoint, customerPoint);
}

function DriverSelectionMenu({
  visible,
  options,
  selectedId,
  onSelect,
  onClear,
  onClose,
}: {
  visible: boolean;
  options: Array<{ driver: DriverListItem; distKm: number | null }>;
  selectedId: string | null;
  onSelect: (driver: DriverListItem) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleBlock}>
              <Text style={styles.sheetTitle}>Assign driver</Text>
              <Text style={styles.sheetSubtitle}>{options.length} driver{options.length === 1 ? '' : 's'} available</Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close driver selection menu"
              style={({ pressed }) => [styles.sheetClose, pressed && styles.sheetClosePressed]}
            >
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </View>

          {selectedId ? (
            <Pressable
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear selected driver"
              style={({ pressed }) => [styles.clearSelection, pressed && styles.clearSelectionPressed]}
            >
              <Text style={styles.clearSelectionText}>Clear selection</Text>
            </Pressable>
          ) : null}

          <ScrollView contentContainerStyle={styles.sheetList} keyboardShouldPersistTaps="handled">
            {options.map(({ driver, distKm }) => (
              <DriverOption
                key={driver.id}
                driver={driver}
                distKm={distKm}
                selected={driver.id === selectedId}
                onSelect={() => onSelect(driver)}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SelectedDriverSummary({
  driver,
  distKm,
}: {
  driver: DriverListItem;
  distKm: number | null;
}) {
  const distLabel = formatKm(distKm);
  const lastSeen = formatLastSeen(driver.locationAt);

  return (
    <View style={styles.selectedSummary}>
      <View style={styles.driverCardRow}>
        <Text style={styles.driverName} numberOfLines={1}>{driver.name}</Text>
        <DriverStatusBadge driver={driver} />
      </View>
      <View style={styles.driverMeta}>
        {distLabel ? <Text style={styles.metaText}>{distLabel}</Text> : null}
        <Text style={styles.metaText}>{lastSeen}</Text>
        {driver.activeJobRef ? (
          <Text style={[styles.metaText, styles.busyText]}>Active job #{driver.activeJobRef}</Text>
        ) : null}
        {driver.phone ? (
          <Text style={styles.metaText}>WhatsApp ready</Text>
        ) : (
          <Text style={[styles.metaText, { color: colors.danger }]}>No phone</Text>
        )}
      </View>
    </View>
  );
}

function DriverOption({
  driver,
  distKm,
  selected,
  onSelect,
}: {
  driver: DriverListItem;
  distKm: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const distLabel = formatKm(distKm);
  const lastSeen = formatLastSeen(driver.locationAt);

  return (
    <Pressable
      onPress={onSelect}
      android_ripple={{ color: colors.ripple, borderless: false }}
      style={({ pressed }) => [
        styles.driverOption,
        selected && styles.driverOptionSelected,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Select driver ${driver.name}`}
    >
      <View style={styles.driverCardRow}>
        <Text style={styles.driverName} numberOfLines={1}>{driver.name}</Text>
        <DriverStatusBadge driver={driver} />
      </View>
      <View style={styles.driverMeta}>
        {distLabel ? <Text style={styles.metaText}>{distLabel}</Text> : null}
        <Text style={styles.metaText}>{lastSeen}</Text>
        {driver.activeJobRef ? (
          <Text style={[styles.metaText, styles.busyText]}>Active job #{driver.activeJobRef}</Text>
        ) : null}
        {driver.phone ? (
          <Text style={styles.metaText}>WhatsApp ready</Text>
        ) : (
          <Text style={[styles.metaText, { color: colors.danger }]}>No phone</Text>
        )}
      </View>
    </Pressable>
  );
}

function DriverStatusBadge({ driver }: { driver: DriverListItem }) {
  return (
    <View style={[styles.badge, driver.isOnline ? styles.badgeOnline : styles.badgeOffline]}>
      <Text style={[styles.badgeText, driver.isOnline ? styles.badgeTextOnline : styles.badgeTextOffline]}>
        {driver.isOnline ? 'Online' : 'Offline'}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  menuStack: { gap: space.xs },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    flex: 1,
  },
  muted: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  assignMessage: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: space.xs,
  },
  assignMessageOk: {
    color: colors.success,
  },
  assignMessageErr: {
    color: colors.danger,
  },
  hint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
  selectButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  selectButtonPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.panel,
  },
  selectCopy: {
    flex: 1,
    minWidth: 0,
  },
  selectLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginBottom: 2,
  },
  selectValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  selectAction: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  selectedSummary: {
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs / 2,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '84%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glowBorder,
    backgroundColor: colors.surfaceOverlay,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginBottom: space.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '900',
  },
  sheetSubtitle: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  sheetClose: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
  },
  sheetClosePressed: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(255,77,99,0.22)',
  },
  sheetCloseText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  clearSelection: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    backgroundColor: colors.cardMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.md,
  },
  clearSelectionPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.panel,
  },
  clearSelectionText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  sheetList: {
    gap: space.xs,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  driverOption: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs / 2,
  },
  driverOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  driverCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  driverName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flex: 1,
  },
  badge: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeOnline: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  badgeOffline: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  badgeTextOnline: {
    color: colors.success,
  },
  badgeTextOffline: {
    color: colors.muted,
  },
  driverMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  metaText: {
    color: colors.subtle,
    fontSize: fontSize.xs,
  },
  busyText: {
    color: colors.warning,
    fontWeight: '700',
  },
});
