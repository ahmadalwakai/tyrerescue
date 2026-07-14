import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Mapbox, { Camera, MapView, MarkerView } from '@rnmapbox/maps';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { StateView } from '@/ui/StateView';
import { DriverPulseMarker } from '@/ui/DriverPulseMarker';
import { colors, radius, spacing, typography } from '@/ui/theme';
import type { DriverSituation } from '@/types/driverSituation';

type DriverRow = {
  id: string;
  name: string;
  status: string;
  isOnline: boolean;
  currentLat: string | null;
  currentLng: string | null;
  locationAt: string | null;
  activeJobRef: string | null;
  driverSituation: DriverSituation | null;
};

type DriversResponse = {
  items: DriverRow[];
  totalCount: number;
};

type LocatedDriver = DriverRow & { lat: number; lng: number };

// Glasgow city centre — fallback when no drivers report a location yet.
// Mapbox uses [longitude, latitude] coordinate order.
const FALLBACK_CENTER: [number, number] = [-4.2518, 55.8642];
const FALLBACK_ZOOM = 10;

function markerColor(driver: DriverRow): string {
  const status = driver.driverSituation?.status;
  if (status === 'late' || status === 'offline') return colors.error;
  if (status === 'at_risk') return colors.warning;
  if (status === 'on_time') return colors.success;
  return driver.isOnline ? colors.success : colors.textMuted;
}

export default function DriverTrackingScreen() {
  const cameraRef = useRef<Camera | null>(null);

  const { data, isLoading, error } = useQuery<DriversResponse>({
    queryKey: ['drivers-tracking'],
    // Pull a wide page so all drivers' latest positions are available.
    queryFn: () => apiClient.get('/api/mobile/admin/drivers?perPage=100'),
    // Live refresh — poll while the screen is mounted.
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });

  const locatedDrivers = useMemo<LocatedDriver[]>(() => {
    const items = data?.items ?? [];
    return items.flatMap((d) => {
      const lat = d.currentLat != null ? Number(d.currentLat) : NaN;
      const lng = d.currentLng != null ? Number(d.currentLng) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ ...d, lat, lng }];
    });
  }, [data]);

  // Initial camera framing — centred on the drivers' bounding box, or the
  // Glasgow fallback. Recomputed only when the located-driver count changes
  // so live polling doesn't yank the camera around the operator.
  const initialCamera = useMemo(() => {
    if (locatedDrivers.length === 0) {
      return { centerCoordinate: FALLBACK_CENTER, zoomLevel: FALLBACK_ZOOM };
    }
    const lats = locatedDrivers.map((d) => d.lat);
    const lngs = locatedDrivers.map((d) => d.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centerCoordinate: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    const span = Math.max(maxLat - minLat, maxLng - minLng);
    // Rough span→zoom mapping; clamps so a single driver isn't over-zoomed.
    let zoomLevel = 12;
    if (span > 0.5) zoomLevel = 8;
    else if (span > 0.2) zoomLevel = 9;
    else if (span > 0.1) zoomLevel = 10;
    else if (span > 0.05) zoomLevel = 11;
    return { centerCoordinate, zoomLevel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locatedDrivers.length]);

  const errorMessage = error instanceof Error ? error.message : null;
  const situationCounts = useMemo(() => {
    let atRisk = 0;
    let late = 0;
    let onTime = 0;
    for (const driver of locatedDrivers) {
      if (driver.driverSituation?.status === 'at_risk') atRisk += 1;
      if (driver.driverSituation?.status === 'late' || driver.driverSituation?.status === 'offline') late += 1;
      if (driver.driverSituation?.status === 'on_time') onTime += 1;
    }
    return { onTime, atRisk, late };
  }, [locatedDrivers]);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={Mapbox.StyleURL.Dark}
        scaleBarEnabled={false}
        logoEnabled
        attributionEnabled
        compassEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCamera.centerCoordinate,
            zoomLevel: initialCamera.zoomLevel,
          }}
        />
        {locatedDrivers.map((driver) => (
          <MarkerView
            key={driver.id}
            id={driver.id}
            coordinate={[driver.lng, driver.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
          >
            <DriverPulseMarker
              color={markerColor(driver)}
              pulsing={Boolean(driver.isOnline)}
            />
          </MarkerView>
        ))}
      </MapView>

      {/* Status overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.badge}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text style={styles.badgeText}>
            {locatedDrivers.length} driver{locatedDrivers.length === 1 ? '' : 's'} on map
          </Text>
        </View>
        <View style={styles.situationBadge}>
          <Text style={styles.situationText}>On time {situationCounts.onTime}</Text>
          <Text style={styles.situationText}>At risk {situationCounts.atRisk}</Text>
          <Text style={styles.situationText}>Late/offline {situationCounts.late}</Text>
        </View>
      </View>

      {(isLoading || errorMessage) && (
        <View style={styles.stateWrap} pointerEvents="box-none">
          <View style={styles.stateCard}>
            <StateView loading={isLoading} error={errorMessage} />
          </View>
        </View>
      )}

      {!isLoading && !errorMessage && locatedDrivers.length === 0 && (
        <View style={styles.stateWrap} pointerEvents="box-none">
          <View style={styles.stateCard}>
            <Text style={styles.emptyText}>No drivers are sharing their location yet.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  overlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  situationBadge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  situationText: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  stateWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minWidth: 200,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});
