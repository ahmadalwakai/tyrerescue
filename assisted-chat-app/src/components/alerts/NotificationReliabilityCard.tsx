import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, space } from '../theme';

interface NotificationReliabilityCardProps {
  /** Optional accessible label for the surrounding region. */
  testID?: string;
}

async function openAppSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Best-effort — some OEM builds disallow programmatic settings open.
  }
}

async function openNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    await openAppSettings();
    return;
  }
  // Standard Android intent to land on this app's notification settings.
  // If the device blocks the intent (rare), fall back to app settings.
  try {
    await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'uk.tyrerescue.assistedchat' },
    ]);
  } catch {
    await openAppSettings();
  }
}

/**
 * Small admin setup card explaining the device-level switches that must
 * be enabled for urgent booking alerts to actually fire on Android.
 * Mounted behind an explicit "Notification setup" entry — never auto-shown
 * in the main operator flow.
 *
 * Does NOT claim 100% delivery: Android OEMs (Samsung, Xiaomi, Huawei,
 * OnePlus, Oppo, Vivo) all add aggressive battery savers that can silence
 * background pushes regardless of our channel importance.
 */
export function NotificationReliabilityCard({ testID }: NotificationReliabilityCardProps) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title}>Urgent booking alert setup</Text>
      <Text style={styles.body}>
        For urgent booking alerts, allow notifications, sound, lock screen
        notifications, and unrestricted battery usage for this app.
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void openNotificationSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Android notification settings for this app"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Open notification settings</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void openAppSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open app system settings"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>Open app settings</Text>
        </Pressable>
      </View>
      <Text style={styles.disclaimer}>
        Android cannot guarantee a forceful popup on every device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  button: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 40,
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.card,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  disclaimer: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
});
