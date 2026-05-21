import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { DriverAlertWatcher } from '@/services/driver-watcher';

/**
 * Compact dashboard pill summarising whether new-job alerts will reach the
 * driver when the app is backgrounded or the phone is locked. Reads native
 * watcher state, full-screen-intent permission, and battery-optimisation
 * status. Tapping a problematic state navigates to profile where the
 * UrgentAlertSetupCard exposes the per-permission "Open settings" actions.
 */
type Status =
  | 'ok'
  | 'notifications-denied'
  | 'fullscreen-blocked'
  | 'battery-restricted'
  | 'watcher-inactive'
  | 'unsupported';

interface PillState {
  status: Status;
  label: string;
  hint: string;
  tone: 'ok' | 'warn' | 'muted';
}

function classify(
  armed: boolean,
  notif: boolean,
  fsi: boolean,
  batt: boolean,
): PillState {
  if (!notif) {
    return {
      status: 'notifications-denied',
      label: 'Notifications denied',
      hint: 'Tap to fix',
      tone: 'warn',
    };
  }
  if (!armed) {
    return {
      status: 'watcher-inactive',
      label: 'Alerts inactive',
      hint: 'Sign out and back in to re-arm',
      tone: 'warn',
    };
  }
  if (!fsi) {
    return {
      status: 'fullscreen-blocked',
      label: 'Full-screen blocked by Android',
      hint: 'Tap to fix',
      tone: 'warn',
    };
  }
  if (!batt) {
    return {
      status: 'battery-restricted',
      label: 'Battery restricted',
      hint: 'Tap to fix',
      tone: 'warn',
    };
  }
  return {
    status: 'ok',
    label: 'Alerts ready',
    hint: 'Lock-screen pop-up enabled',
    tone: 'ok',
  };
}

export function AlertReadinessPill() {
  const router = useRouter();
  const [state, setState] = useState<PillState | null>(null);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android' || !DriverAlertWatcher.isAvailable()) {
      setState(null);
      return;
    }
    try {
      const [armed, notif, fsi, batt] = await Promise.all([
        DriverAlertWatcher.isArmed(),
        DriverAlertWatcher.areNotificationsEnabled(),
        DriverAlertWatcher.canUseFullScreenIntent(),
        DriverAlertWatcher.isIgnoringBatteryOptimizations(),
      ]);
      setState(classify(armed, notif, fsi, batt));
    } catch {
      // Keep previous state.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!state) return null;

  const onPress = () => {
    lightHaptic();
    if (state.status === 'ok') {
      void refresh();
      return;
    }
    router.push('/(tabs)/profile');
  };

  const palette =
    state.tone === 'ok'
      ? {
          bg: 'rgba(34,197,94,0.12)',
          border: 'rgba(34,197,94,0.4)',
          text: '#34d399',
          icon: 'shield-checkmark' as const,
        }
      : {
          bg: 'rgba(245,158,11,0.12)',
          border: 'rgba(245,158,11,0.4)',
          text: '#f59e0b',
          icon: 'alert-circle' as const,
        };

  return (
    <AnimatedPressable
      onPress={onPress}
      pressScale={0.97}
      style={[
        styles.pill,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Ionicons name={palette.icon} size={16} color={palette.text} />
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
          {state.label}
        </Text>
        <Text style={styles.hint} numberOfLines={1}>
          {state.hint}
        </Text>
      </View>
      {state.tone !== 'ok' ? (
        <Ionicons name="chevron-forward" size={16} color={palette.text} />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
  },
  hint: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
  },
});
