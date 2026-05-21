import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton, SectionCard } from '@/components/ui';
import { colors, fontSize, radius, space } from '@/components/theme';
import { useDriverList, type DriverListItem } from '@/hooks/useDriverList';
import type { BookingTrackingData } from '@/hooks/useBookingTracking';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  bookingId: string;
  trackingData: BookingTrackingData | null;
  customerLat: number | null;
  customerLng: number | null;
  /** Called when the operator selects or deselects a driver. */
  onSelectDriver?: (phone: string | null) => void;
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
  bookingId: _bookingId,
  trackingData,
  customerLat,
  customerLng,
  onSelectDriver,
}: Props) {
  const { drivers, loading, error, reload } = useDriverList();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedDriver = drivers.find((d) => d.id === selectedId) ?? null;
  const trackingReady = trackingData?.customerUrl != null;

  const customerPoint =
    customerLat != null && customerLng != null
      ? { lat: customerLat, lng: customerLng }
      : null;

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
        <View style={styles.list}>
          {drivers.map((driver) => {
            const driverPoint =
              driver.currentLat != null && driver.currentLng != null
                ? { lat: parseFloat(driver.currentLat), lng: parseFloat(driver.currentLng) }
                : null;
            const distKm = haversineKm(driverPoint, customerPoint);
            const isSelected = driver.id === selectedId;

            return (
              <DriverCard
                key={driver.id}
                driver={driver}
                distKm={distKm}
                selected={isSelected}
                onSelect={() => {
                  const next = isSelected ? null : driver.id;
                  setSelectedId(next);
                  onSelectDriver?.(next ? driver.phone : null);
                }}
              />
            );
          })}
        </View>
      )}

      {selectedDriver ? (
        <Text style={styles.selectedLabel}>Selected driver: {selectedDriver.name}</Text>
      ) : null}

      <Text style={styles.hint}>
        {trackingReady
          ? 'Assign the driver in the admin panel — they will receive a push when assigned. The driver app reports tracking automatically.'
          : 'Tracking will activate once the booking is confirmed.'}
      </Text>
    </SectionCard>
  );
}

// ── DriverCard ────────────────────────────────────────────────────────────────

function DriverCard({
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
        styles.driverCard,
        selected && styles.driverCardSelected,
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.driverCardRow}>
        <Text style={styles.driverName}>{driver.name}</Text>
        <View style={[styles.badge, driver.isOnline ? styles.badgeOnline : styles.badgeOffline]}>
          <Text style={[styles.badgeText, driver.isOnline ? styles.badgeTextOnline : styles.badgeTextOffline]}>
            {driver.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
      <View style={styles.driverMeta}>
        {distLabel ? <Text style={styles.metaText}>{distLabel}</Text> : null}
        <Text style={styles.metaText}>{lastSeen}</Text>
        {driver.phone ? (
          <Text style={styles.metaText}>WhatsApp ready</Text>
        ) : (
          <Text style={[styles.metaText, { color: colors.danger }]}>No phone</Text>
        )}
      </View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list: {
    gap: space.xs,
  },
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
  selectedLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: space.xs,
  },
  hint: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
  driverCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs / 2,
    marginBottom: space.xs,
  },
  driverCardSelected: {
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
});
