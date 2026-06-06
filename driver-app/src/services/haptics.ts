import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/** Light tap — button presses, tab switches */
export function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium impact — accept job, confirm actions */
export function mediumHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Heavy impact — complete job, critical confirmations */
export function heavyHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Success notification pattern */
export function successHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Error notification pattern */
export function errorHaptic() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/**
 * Distinct 4-pulse pattern fired just BEFORE a driving maneuver (bend,
 * junction, roundabout, merge, exit). Uses the native vibrator directly so the
 * four pulses are clearly felt through a phone mount; expo-haptics only exposes
 * single impacts. The engine guarantees this fires once per maneuver, never on
 * every GPS tick. Safe no-op on platforms without a vibrator.
 */
export function maneuverHaptic() {
  try {
    if (Platform.OS === 'android') {
      // [wait, on, off, on, off, on, off, on] → four short ~120ms pulses.
      Vibration.vibrate([0, 120, 80, 120, 80, 120, 80, 120]);
    } else {
      // iOS ignores custom patterns; approximate with sequential impacts.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      [200, 400, 600].forEach((delay) => {
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, delay);
      });
    }
  } catch {
    // Vibrator unavailable — silent.
  }
}
