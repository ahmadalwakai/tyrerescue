import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Linking,
  Dimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, JobDetail, ApiError } from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { mediumHaptic, heavyHaptic, lightHaptic } from '@/services/haptics';
import { playSound } from '@/services/sound';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Haversine distance in km between two coordinates */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DRIVER_ACTIONS: Record<string, { label: string; next: string; icon: string }> = {
  driver_assigned: { label: 'Start En Route', next: 'en_route', icon: 'car-outline' },
  en_route: { label: 'Arrived', next: 'arrived', icon: 'flag-outline' },
  arrived: { label: 'Start Work', next: 'in_progress', icon: 'construct-outline' },
  in_progress: { label: 'Complete Job', next: 'completed', icon: 'checkmark-circle-outline' },
};

export default function JobMapScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const [etaSource, setEtaSource] = useState<'route' | 'estimate' | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJob = useCallback(async () => {
    if (!ref) return;
    try {
      const data = await driverApi.getJob(ref);
      setJob(data);
    } catch {
      // error
    } finally {
      setLoading(false);
    }
  }, [ref]);

  // Update driver position periodically
  const updateDriverPosition = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setDriverLat(loc.coords.latitude);
      setDriverLng(loc.coords.longitude);
    } catch {
      // ignore
    }
  }, []);

  // Fetch real route ETA from tracking API, fall back to Haversine estimate
  const updateEta = useCallback(async () => {
    if (!ref) return;
    try {
      const tracking = await driverApi.getTrackingData(ref);
      if (tracking.etaMinutes != null) {
        setEtaMin(tracking.etaMinutes);
        setEtaSource('route');
        // Also compute Haversine distance for display
        if (driverLat != null && driverLng != null && tracking.customerLat && tracking.customerLng) {
          setDistanceKm(haversineKm(driverLat, driverLng, tracking.customerLat, tracking.customerLng));
        }
        return;
      }
    } catch {
      // Tracking API unavailable — fall back to Haversine
    }
    // Haversine fallback
    if (driverLat == null || driverLng == null || !job?.lat || !job?.lng) {
      setDistanceKm(null);
      setEtaMin(null);
      setEtaSource(null);
      return;
    }
    const custLat = parseFloat(job.lat);
    const custLng = parseFloat(job.lng);
    const dist = haversineKm(driverLat, driverLng, custLat, custLng);
    setDistanceKm(dist);
    setEtaMin(Math.max(1, Math.round((dist / 30) * 60)));
    setEtaSource('estimate');
  }, [ref, driverLat, driverLng, job?.lat, job?.lng]);

  useEffect(() => {
    updateEta();
  }, [updateEta]);

  useEffect(() => {
    fetchJob();
    updateDriverPosition();
    locationInterval.current = setInterval(updateDriverPosition, 10_000);
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, [fetchJob, updateDriverPosition]);

  const handleStatusAction = async (nextStatus: string) => {
    if (!ref) return;
    const confirmMsg =
      nextStatus === 'completed'
        ? 'Mark this job as complete?'
        : `Update to ${nextStatus.replace(/_/g, ' ')}?`;

    Alert.alert('Confirm', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setActioning(true);
          try {
            await driverApi.updateJobStatus(ref, nextStatus);
            if (nextStatus === 'completed') {
              heavyHaptic();
              playSound('job_completed');
            } else {
              mediumHaptic();
            }
            await fetchJob();
            if (nextStatus === 'completed') {
              router.back();
            }
          } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Failed to update status.';
            Alert.alert('Error', msg);
          }
          setActioning(false);
        },
      },
    ]);
  };

  const openGoogleMapsNavigation = () => {
    if (!job?.lat || !job?.lng) return;
    const url = Platform.select({
      android: `google.navigation:q=${job.lat},${job.lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}&travelmode=driving`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`,
      );
    });
  };

  const callCustomer = () => {
    if (job?.customerPhone) {
      Linking.openURL(`tel:${job.customerPhone}`);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!job) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Job not found.</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const action = DRIVER_ACTIONS[job.status];
  const custLat = job.lat ? parseFloat(job.lat) : null;
  const custLng = job.lng ? parseFloat(job.lng) : null;

  return (
    <View style={styles.container}>
      {/* Map placeholder with real coordinates */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          {/* Static map image using OpenStreetMap */}
          {custLat && custLng && (
            <Pressable
              style={styles.mapTapArea}
              onPress={openGoogleMapsNavigation}
            >
              <Ionicons name="map-outline" size={48} color={colors.accent} />
              <Text style={styles.mapTapText}>Tap to open navigation</Text>
              {driverLat != null && driverLng != null && (
                <Text style={styles.coordsText}>
                  📍 You: {driverLat.toFixed(4)}, {driverLng.toFixed(4)}
                </Text>
              )}
              <Text style={styles.coordsText}>
                🏠 Customer: {custLat.toFixed(4)}, {custLng.toFixed(4)}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ETA / Distance overlay */}
        {(distanceKm != null || etaMin != null) && (
          <View style={styles.etaOverlay}>
            {etaMin != null && (
              <View style={styles.etaItem}>
                <Ionicons name="time-outline" size={16} color={colors.accent} />
                <Text style={styles.etaValue}>
                  ~{etaMin} min{etaSource === 'estimate' ? '*' : ''}
                </Text>
              </View>
            )}
            {distanceKm != null && (
              <View style={styles.etaItem}>
                <Ionicons name="speedometer-outline" size={16} color={colors.accent} />
                <Text style={styles.etaValue}>
                  {distanceKm < 1
                    ? `${Math.round(distanceKm * 1000)}m`
                    : `${Math.round(distanceKm * 10) / 10} km`}
                </Text>
              </View>
            )}
            {etaSource === 'estimate' && (
              <Text style={styles.etaDisclaimer}>*straight-line estimate</Text>
            )}
          </View>
        )}
      </View>

      {/* Job info panel */}
      <View style={styles.infoPanel}>
        {/* Status + ref */}
        <View style={styles.infoPanelHeader}>
          <Text style={styles.refNumber}>#{job.refNumber}</Text>
          <StatusBadge status={job.status} />
        </View>

        {/* Customer + address */}
        <Text style={styles.customerName}>{job.customerName}</Text>
        <Text style={styles.address} numberOfLines={2}>{job.addressLine}</Text>

        {/* Quick action buttons row */}
        <View style={styles.quickActions}>
          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { lightHaptic(); openGoogleMapsNavigation(); }}
            pressScale={0.95}
          >
            <Ionicons name="navigate" size={22} color={colors.white} />
            <Text style={styles.quickActionLabel}>Navigate</Text>
          </AnimatedPressable>

          {job.customerPhone && (
            <AnimatedPressable
              style={styles.quickActionBtn}
              onPress={() => { lightHaptic(); callCustomer(); }}
              pressScale={0.95}
            >
              <Ionicons name="call" size={22} color={colors.white} />
              <Text style={styles.quickActionLabel}>Call</Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            style={styles.quickActionBtn}
            onPress={() => { lightHaptic(); router.back(); }}
            pressScale={0.95}
          >
            <Ionicons name="document-text-outline" size={22} color={colors.white} />
            <Text style={styles.quickActionLabel}>Details</Text>
          </AnimatedPressable>
        </View>

        {/* Main status action */}
        {action && (
          <AnimatedPressable
            style={[styles.mainAction, actioning && styles.buttonDisabled]}
            onPress={() => handleStatusAction(action.next)}
            disabled={actioning}
            pressScale={0.95}
          >
            <Ionicons
              name={action.icon as keyof typeof Ionicons.glyphMap}
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.mainActionText}>
              {actioning ? 'Updating…' : action.label}
            </Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapTapArea: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  mapTapText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.accent,
    marginTop: spacing.sm,
  },
  coordsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  etaOverlay: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  etaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9,9,11,0.85)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 4,
  },
  etaValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  etaDisclaimer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: colors.muted,
    position: 'absolute',
    top: 34,
    left: 0,
  },
  infoPanel: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    ...cardShadow,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  refNumber: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 24,
    color: colors.accent,
  },
  customerName: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  address: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.text,
  },
  mainAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  mainActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: '#FFFFFF',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  linkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.accent,
  },
});
