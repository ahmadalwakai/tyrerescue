import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { DriverAlertWatcher } from '@/services/driver-watcher';

interface SetupState {
  armed: boolean;
  fullScreenAllowed: boolean;
  batteryUnrestricted: boolean;
}

const initialState: SetupState = {
  armed: false,
  fullScreenAllowed: true,
  batteryUnrestricted: true,
};

export function UrgentAlertSetupCard() {
  const [state, setState] = useState<SetupState>(initialState);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!DriverAlertWatcher.isAvailable()) {
      setLoading(false);
      return;
    }
    try {
      const [armed, fsi, batt] = await Promise.all([
        DriverAlertWatcher.isArmed(),
        DriverAlertWatcher.canUseFullScreenIntent(),
        DriverAlertWatcher.isIgnoringBatteryOptimizations(),
      ]);
      setState({
        armed,
        fullScreenAllowed: fsi,
        batteryUnrestricted: batt,
      });
    } catch {
      // Ignore — keep last state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (Platform.OS !== 'android' || !DriverAlertWatcher.isAvailable()) {
    return null;
  }

  const handleOpenFullScreen = async () => {
    lightHaptic();
    await DriverAlertWatcher.openFullScreenAlertSettings();
    setTimeout(() => {
      void refresh();
    }, 800);
  };

  const handleOpenBattery = async () => {
    lightHaptic();
    await DriverAlertWatcher.openBatterySettings();
    setTimeout(() => {
      void refresh();
    }, 800);
  };

  const handleTestAlert = async () => {
    lightHaptic();
    const ok = await DriverAlertWatcher.simulateAlert();
    if (!ok) {
      Alert.alert('Test alert', 'Could not raise a test alert. Check notification permission.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Urgent alert setup</Text>
      <Text style={styles.help}>
        Keep these enabled so newly assigned jobs can pop a full-screen alert
        even when the phone is locked or the app is backgrounded.
      </Text>

      <Row
        label="Listening service"
        ok={state.armed}
        okText="Active"
        warnText={loading ? 'Checking…' : 'Inactive — sign in again'}
      />
      <Row
        label="Full-screen alerts"
        ok={state.fullScreenAllowed}
        okText="Allowed"
        warnText="Blocked by Android — tap to allow"
        actionLabel={state.fullScreenAllowed ? undefined : 'Open settings'}
        onPress={handleOpenFullScreen}
      />
      <Row
        label="Battery unrestricted"
        ok={state.batteryUnrestricted}
        okText="Unrestricted"
        warnText="Restricted — tap to allow"
        actionLabel={state.batteryUnrestricted ? undefined : 'Open settings'}
        onPress={handleOpenBattery}
      />

      <View style={styles.buttonRow}>
        <AnimatedPressable style={styles.secondaryButton} onPress={() => void refresh()} pressScale={0.95}>
          <Ionicons name="refresh" size={16} color={colors.accent} />
          <Text style={styles.secondaryButtonText}>Re-check</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.secondaryButton} onPress={handleTestAlert} pressScale={0.95}>
          <Ionicons name="notifications" size={16} color={colors.accent} />
          <Text style={styles.secondaryButtonText}>Send test alert</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

interface RowProps {
  label: string;
  ok: boolean;
  okText: string;
  warnText: string;
  actionLabel?: string;
  onPress?: () => void;
}

function Row({ label, ok, okText, warnText, actionLabel, onPress }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLabelGroup}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'alert-circle'}
          size={18}
          color={ok ? '#34d399' : '#f59e0b'}
        />
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{ok ? okText : warnText}</Text>
        </View>
      </View>
      {!ok && actionLabel && onPress ? (
        <AnimatedPressable style={styles.rowAction} onPress={onPress} pressScale={0.95}>
          <Text style={styles.rowActionText}>{actionLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.md,
    ...cardShadow,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  help: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  rowValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
  rowAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
  },
  rowActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: '#f59e0b',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
});
