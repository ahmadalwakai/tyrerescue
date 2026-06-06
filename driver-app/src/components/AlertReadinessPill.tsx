import { useCallback, useEffect, useState } from 'react';
import { AppState, View, Text, StyleSheet, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic } from '@/services/haptics';
import { DriverAlertWatcher } from '@/services/driver-watcher';
import { useI18n } from '@/i18n';

/**
 * Compact dashboard pill summarising whether new-job alerts will reach the
 * driver when the app is backgrounded or the phone is locked. Reads native
 * watcher state, notification permission, full-screen-intent permission,
 * battery-optimisation status, and location readiness. Tapping a problematic
 * state navigates to the profile screen.
 */
type Status =
  | 'ok'
  | 'notifications-denied'
  | 'fullscreen-blocked'
  | 'battery-restricted'
  | 'location-blocked'
  | 'watcher-inactive'
  | 'unsupported';

interface PillState {
  status: Status;
  labelKey: string;
  hintKey: string;
  tone: 'ok' | 'warn' | 'muted';
}

function classify(
  armed: boolean,
  notif: boolean,
  fsi: boolean,
  batt: boolean,
  location: boolean,
): PillState {
  if (!notif) {
    return {
      status: 'notifications-denied',
      labelKey: 'alertReadiness.notificationsDenied',
      hintKey: 'alertReadiness.tapToFix',
      tone: 'warn',
    };
  }
  if (!armed) {
    return {
      status: 'watcher-inactive',
      labelKey: 'alertReadiness.alertsInactive',
      hintKey: 'alertReadiness.rearmHint',
      tone: 'warn',
    };
  }
  if (!fsi) {
    return {
      status: 'fullscreen-blocked',
      labelKey: 'alertReadiness.fullScreenBlocked',
      hintKey: 'alertReadiness.tapToFix',
      tone: 'warn',
    };
  }
  if (!batt) {
    return {
      status: 'battery-restricted',
      labelKey: 'alertReadiness.batteryRestricted',
      hintKey: 'alertReadiness.tapToFix',
      tone: 'warn',
    };
  }
  if (!location) {
    return {
      status: 'location-blocked',
      labelKey: 'alertReadiness.locationBlocked',
      hintKey: 'alertReadiness.tapToFix',
      tone: 'warn',
    };
  }
  return {
    status: 'ok',
    labelKey: 'alertReadiness.alertsReady',
    hintKey: 'alertReadiness.lockScreenEnabled',
    tone: 'ok',
  };
}

export function AlertReadinessPill() {
  const router = useRouter();
  const { t } = useI18n();
  const [state, setState] = useState<PillState | null>(null);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android' || !DriverAlertWatcher.isAvailable()) {
      setState(null);
      return;
    }
    try {
      const [armed, notif, fsi, batt, fgLocation, bgLocation] = await Promise.all([
        DriverAlertWatcher.isArmed(),
        DriverAlertWatcher.areNotificationsEnabled(),
        DriverAlertWatcher.canUseFullScreenIntent(),
        DriverAlertWatcher.isIgnoringBatteryOptimizations(),
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      setState(classify(
        armed,
        notif,
        fsi,
        batt,
        fgLocation.status === 'granted' && bgLocation.status === 'granted',
      ));
    } catch {
      // Keep previous state.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 8000);
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
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
          {t(state.labelKey)}
        </Text>
        <Text style={styles.hint} numberOfLines={1}>
          {t(state.hintKey)}
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
