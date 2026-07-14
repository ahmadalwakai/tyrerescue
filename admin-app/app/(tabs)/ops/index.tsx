import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Mapbox, { Camera, LineLayer, MapView, MarkerView, ShapeSource } from '@rnmapbox/maps';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/api/client';
import { normalizeDriverSituation } from '@/lib/driverSituation';
import type { DriverSituation } from '@/types/driverSituation';
import { DriverPulseMarker } from '@/ui/DriverPulseMarker';
import {
  AdminShell,
  DriverCard,
  FilterChip,
  GlassCard,
  JobCard,
  StatePanel,
  StatusBadge,
  colors,
  spacing,
  typography,
} from '@/ui';

type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
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

type BookingItem = {
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  customerName: string;
  totalAmount: string;
  scheduledAt: string | null;
  createdAt: string | null;
  driverName: string | null;
  driverSituation?: DriverSituation | null;
};

type ActiveJobRouteResponse = {
  bookingRef: string;
  status: string;
  driver: { id: string; name: string | null; phone: string | null } | null;
  driverLocation: { lat: number; lng: number; locationAt: string | null; isStale: boolean } | null;
  customerLocation: { lat: number; lng: number; address: string | null } | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
  source: 'mapbox' | 'haversine' | 'none';
};

type RouteFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { bookingRef: string };
};

type BookingsResponse = {
  items: BookingItem[];
  totalCount: number;
};

type LocatedDriver = DriverRow & { lat: number; lng: number };

const fallbackCenter: [number, number] = [-4.2518, 55.8642];
const activeStatuses = new Set(['pending', 'confirmed', 'assigned', 'driver_assigned', 'en_route', 'arrived', 'in_progress', 'paid']);
const liveRouteStatuses = new Set(['driver_assigned', 'en_route', 'arrived', 'in_progress']);

function markerColor(driver: DriverRow) {
  const situation = driver.driverSituation?.status;
  if (situation === 'late' || situation === 'offline') return colors.error;
  if (situation === 'at_risk') return colors.primary;
  if (driver.isOnline) return colors.success;
  return colors.textMuted;
}

function fitCamera(points: [number, number][]) {
  if (!points.length) return { centerCoordinate: fallbackCenter, zoomLevel: 10 };
  if (points.length === 1) return { centerCoordinate: points[0], zoomLevel: 12 };

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = Math.max(maxLng - minLng, maxLat - minLat);

  let zoomLevel = 12;
  if (span > 1) zoomLevel = 6;
  else if (span > 0.55) zoomLevel = 7;
  else if (span > 0.28) zoomLevel = 8;
  else if (span > 0.14) zoomLevel = 9;
  else if (span > 0.07) zoomLevel = 10;
  else if (span > 0.035) zoomLevel = 11;

  return {
    centerCoordinate: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
    zoomLevel,
  };
}

function coordinateFromLocation(location: { lat: number; lng: number } | null | undefined): [number, number] | null {
  if (!location) return null;
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  return [location.lng, location.lat];
}

export default function OpsHomeScreen() {
  const router = useRouter();
  const driversQuery = useQuery<DriversResponse>({
    queryKey: ['drivers-tracking'],
    queryFn: () => apiClient.get('/api/mobile/admin/drivers?perPage=100'),
    refetchInterval: 12_000,
  });
  const bookingsQuery = useQuery<BookingsResponse>({
    queryKey: ['jobs-active-overview'],
    queryFn: () => apiClient.get('/api/mobile/admin/bookings?status=all&perPage=25'),
    refetchInterval: 18_000,
  });

  const locatedDrivers = useMemo<LocatedDriver[]>(() => {
    return (driversQuery.data?.items ?? []).flatMap((driver) => {
      const lat = Number(driver.currentLat);
      const lng = Number(driver.currentLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ ...driver, lat, lng }];
    });
  }, [driversQuery.data?.items]);

  const activeBookings = useMemo(
    () => (bookingsQuery.data?.items ?? []).filter((booking) => activeStatuses.has(booking.status)),
    [bookingsQuery.data?.items],
  );
  const currentJob = activeBookings.find((job) => liveRouteStatuses.has(job.status)) ?? activeBookings[0] ?? null;
  const currentSituation = normalizeDriverSituation(currentJob?.driverSituation);
  const activeDriver = (driversQuery.data?.items ?? []).find((driver) => driver.activeJobRef === currentJob?.refNumber)
    ?? (driversQuery.data?.items ?? []).find((driver) => driver.activeJobRef)
    ?? null;
  const activeDriverSituation = normalizeDriverSituation(activeDriver?.driverSituation);
  const routeQuery = useQuery<ActiveJobRouteResponse>({
    queryKey: ['active-job-route', currentJob?.refNumber],
    queryFn: () => apiClient.get(`/api/admin/active-jobs/${encodeURIComponent(currentJob?.refNumber ?? '')}/route`),
    enabled: Boolean(currentJob?.refNumber && liveRouteStatuses.has(currentJob.status)),
    refetchInterval: 5_000,
    retry: 1,
  });

  const actualRouteFeature = useMemo<RouteFeature | null>(() => {
    const route = routeQuery.data;
    if (!route) return null;
    const coordinates = route?.source === 'mapbox' ? route.geometry?.coordinates : null;
    if (!coordinates || coordinates.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { bookingRef: route.bookingRef },
    };
  }, [routeQuery.data]);

  const customerCoordinate = coordinateFromLocation(routeQuery.data?.customerLocation);
  const routeDriverCoordinate = coordinateFromLocation(routeQuery.data?.driverLocation);
  const routeDriverAlreadyShown = routeQuery.data?.driver?.id
    ? locatedDrivers.some((driver) => driver.id === routeQuery.data?.driver?.id)
    : false;
  const mapPoints = useMemo(() => {
    if (actualRouteFeature) return actualRouteFeature.geometry.coordinates;
    return [
      ...locatedDrivers.map((driver) => [driver.lng, driver.lat] as [number, number]),
      routeDriverCoordinate,
      customerCoordinate,
    ].filter((point): point is [number, number] => Boolean(point));
  }, [actualRouteFeature, customerCoordinate, locatedDrivers, routeDriverCoordinate]);
  const fittedMapCamera = useMemo(() => fitCamera(mapPoints), [mapPoints]);

  const inProgressCount = activeBookings.filter((job) => job.status === 'in_progress').length;
  const movingCount = (driversQuery.data?.items ?? []).filter((driver) => driver.isOnline && driver.activeJobRef).length;
  const readyCount = (driversQuery.data?.items ?? []).filter((driver) => driver.isOnline && !driver.activeJobRef).length;

  const errorMessage =
    driversQuery.error instanceof Error
      ? driversQuery.error.message
      : bookingsQuery.error instanceof Error
        ? bookingsQuery.error.message
        : null;

  return (
    <AdminShell
      title="Live Operations"
      subtitle="Real-time job tracking"
      notificationCount={0}
    >
      <View style={styles.chipWrap}>
        <FilterChip label={`All ${activeBookings.length}`} active accent="orange" />
        <FilterChip label={`In Progress ${inProgressCount}`} active={false} accent="blue" />
        <FilterChip label={`Moving ${movingCount}`} active={false} accent="green" />
        <FilterChip label={`Ready ${readyCount}`} active={false} accent="purple" />
      </View>

      <GlassCard style={styles.mapCard} accent="blue" animatedIndex={0}>
        <MapView
          style={styles.map}
          styleURL={Mapbox.StyleURL.Dark}
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scrollEnabled={false}
          pitchEnabled={false}
        >
          <Camera
            centerCoordinate={fittedMapCamera.centerCoordinate}
            zoomLevel={fittedMapCamera.zoomLevel}
            animationMode="flyTo"
            animationDuration={650}
          />
          {actualRouteFeature ? (
            <ShapeSource id="active-job-route-source" shape={actualRouteFeature}>
              <LineLayer
                id="active-job-route-shadow"
                style={{
                  lineColor: '#000000',
                  lineWidth: 9,
                  lineOpacity: 0.36,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <LineLayer
                id="active-job-route-line"
                style={{
                  lineColor: colors.active,
                  lineWidth: 4.8,
                  lineOpacity: 1,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </ShapeSource>
          ) : null}
          {locatedDrivers.map((driver) => (
            <MarkerView
              key={driver.id}
              id={driver.id}
              coordinate={[driver.lng, driver.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
            >
              <DriverPulseMarker color={markerColor(driver)} pulsing={driver.isOnline} />
            </MarkerView>
          ))}
          {routeDriverCoordinate && !routeDriverAlreadyShown ? (
            <MarkerView id="active-route-driver" coordinate={routeDriverCoordinate} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <DriverPulseMarker color={routeQuery.data?.driverLocation?.isStale ? colors.warning : colors.primary} pulsing={!routeQuery.data?.driverLocation?.isStale} />
            </MarkerView>
          ) : null}
          {customerCoordinate ? (
            <MarkerView id="active-route-customer" coordinate={customerCoordinate} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
              <View style={styles.customerMarker}>
                <Ionicons name="flag" size={15} color={colors.text} />
              </View>
            </MarkerView>
          ) : null}
        </MapView>
        <View style={styles.mapOverlay}>
          <View style={styles.mapStatusStack}>
            <StatusBadge
              status={actualRouteFeature ? 'active' : locatedDrivers.length > 0 ? 'online' : 'offline'}
              label={actualRouteFeature ? 'Mapbox route live' : `${locatedDrivers.length} on map`}
            />
            {routeQuery.data?.source === 'haversine' ? (
              <View style={styles.routeWarning}>
                <Ionicons name="warning-outline" size={12} color={colors.warning} />
                <Text style={styles.routeWarningText}>Mapbox route unavailable</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.mapTools}>
            <Ionicons name="layers-outline" size={17} color={colors.textSecondary} />
            <Ionicons name="locate-outline" size={17} color={colors.textSecondary} />
            <Ionicons name="navigate-outline" size={17} color={colors.textSecondary} />
          </View>
        </View>
      </GlassCard>

      <StatePanel
        loading={driversQuery.isLoading || bookingsQuery.isLoading}
        error={errorMessage}
        empty={!driversQuery.isLoading && !bookingsQuery.isLoading && !errorMessage && !currentJob && !activeDriver}
        emptyLabel="No active jobs or driver locations right now."
        onRetry={() => {
          driversQuery.refetch();
          bookingsQuery.refetch();
        }}
      />

      {currentJob ? (
        <JobCard
          title={currentJob.refNumber}
          subtitle={`${currentJob.customerName} · ${currentJob.serviceType || currentJob.bookingType}`}
          status={currentJob.status}
          driverName={currentJob.driverName}
          metric={
            routeQuery.data?.source === 'mapbox' && routeQuery.data.durationMinutes != null
              ? `${routeQuery.data.durationMinutes} min Mapbox`
              : currentSituation.totalMinutes != null
                ? `${currentSituation.totalMinutes} min`
                : null
          }
          onPress={() => router.push(`/(tabs)/bookings/${currentJob.refNumber}`)}
          animatedIndex={1}
        />
      ) : null}

      <GlassCard accent="orange" animatedIndex={2}>
        <Text style={styles.sectionTitle}>Route Metrics</Text>
        <View style={styles.metricsRow}>
          <RouteMetric icon="time-outline" label="Total" value={currentSituation.totalMinutes != null ? `${currentSituation.totalMinutes} min` : 'N/A'} />
          <RouteMetric icon="alert-circle-outline" label="Delay" value={`${currentSituation.delayMinutes ?? 0} min`} />
          <RouteMetric icon="radio-outline" label="GPS" value={currentSituation.gpsState ? String(currentSituation.gpsState) : 'N/A'} />
        </View>
      </GlassCard>

      {activeDriver ? (
        <DriverCard
          name={activeDriver.name}
          phone={activeDriver.phone}
          status={activeDriver.status}
          activeJobRef={activeDriver.activeJobRef}
          situationLabel={activeDriverSituation.label}
          onPress={() => router.push(`/(tabs)/drivers/${activeDriver.id}`)}
          animatedIndex={3}
        />
      ) : null}

      {activeBookings.slice(1, 4).map((job, index) => {
        const situation = normalizeDriverSituation(job.driverSituation);
        return (
          <JobCard
            key={job.refNumber}
            title={job.refNumber}
            subtitle={`${job.customerName} · ${job.serviceType || job.bookingType}`}
            status={job.status}
            driverName={job.driverName}
            metric={situation.totalMinutes != null ? `${situation.totalMinutes} min` : null}
            onPress={() => router.push(`/(tabs)/bookings/${job.refNumber}`)}
            animatedIndex={index + 4}
          />
        );
      })}
    </AdminShell>
  );
}

function RouteMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeMetric}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  mapCard: {
    padding: 0,
    overflow: 'hidden',
  },
  map: {
    height: 248,
    borderRadius: 18,
  },
  mapOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  mapStatusStack: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    maxWidth: 214,
  },
  routeWarning: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 61, 0.34)',
  },
  routeWarningText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  mapTools: {
    width: 38,
    borderRadius: 17,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customerMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.bg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  routeMetric: {
    flex: 1,
    minHeight: 70,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  metricValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    marginTop: 2,
  },
});
