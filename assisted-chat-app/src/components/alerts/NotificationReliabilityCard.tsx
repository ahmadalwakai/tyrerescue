import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  readAdminNotificationPermissionStatus,
  registerAdminPushNotifications,
  requestAdminNotificationPermission,
} from '@/lib/notifications';
import { isNotificationStartupDisabled } from '@/lib/notification-startup-config';
import { colors, fontSize, radius, space } from '../theme';

interface NotificationReliabilityCardProps {
  /** Optional accessible label for the surrounding region. */
  testID?: string;
  onSetupChanged?: () => void;
}

type PermissionStatus = 'granted' | 'denied' | 'undetermined';
type PushSyncStatus = 'idle' | 'synced' | 'failed' | 'unavailable';

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

function statusText(status: PermissionStatus): string {
  if (status === 'granted') return 'Allowed';
  if (status === 'denied') return 'Blocked';
  return 'Not allowed yet';
}

function statusTone(status: PermissionStatus): 'ok' | 'bad' | 'warn' {
  if (status === 'granted') return 'ok';
  if (status === 'denied') return 'bad';
  return 'warn';
}

function pushStatusText(status: PushSyncStatus, tokenSuffix: string | null): string {
  if (status === 'synced') {
    return tokenSuffix ? `Synced (${tokenSuffix})` : 'Synced';
  }
  if (status === 'failed') return 'Not synced';
  if (status === 'unavailable') return 'Unavailable in this build';
  return 'Waiting';
}

/**
 * Admin setup card for urgent booking notifications. This is not just a
 * settings shortcut: it reads permission state, requests notification access,
 * and syncs the push token to the backend when the native module is available.
 */
export function NotificationReliabilityCard({ testID, onSetupChanged }: NotificationReliabilityCardProps) {
  const startupDisabled = isNotificationStartupDisabled();
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [pushSync, setPushSync] = useState<PushSyncStatus>(
    Platform.OS === 'web' || startupDisabled ? 'unavailable' : 'idle',
  );
  const [tokenSuffix, setTokenSuffix] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const platformName = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'web';
  const bodyText = useMemo(() => {
    if (Platform.OS === 'ios') {
      return 'For urgent booking alerts on iPhone, allow Notifications, Sounds, Badges, and Lock Screen alerts for this app.';
    }
    if (Platform.OS === 'android') {
      return 'For urgent booking alerts, allow notifications, sound, lock screen notifications, and unrestricted battery usage for this app.';
    }
    return 'Push notifications are not available in the browser preview. Use the installed Assisted Chat app.';
  }, []);

  const refreshStatus = useCallback(async () => {
    if (Platform.OS === 'web' || startupDisabled) {
      setPushSync('unavailable');
      setPermission('undetermined');
      return;
    }
    const nextPermission = await readAdminNotificationPermissionStatus();
    setPermission(nextPermission);
  }, [startupDisabled]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleEnable = useCallback(async () => {
    if (Platform.OS === 'web' || startupDisabled) {
      setPushSync('unavailable');
      setNotice('Push notifications are not enabled in this build.');
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const nextPermission = await requestAdminNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setPushSync('failed');
        setNotice('Notifications are blocked. Open settings and allow notifications for this app.');
        return;
      }

      const token = await registerAdminPushNotifications();
      if (token) {
        setTokenSuffix(token.slice(-8));
        setPushSync('synced');
        setNotice('Urgent booking notifications are active on this device.');
        onSetupChanged?.();
        return;
      }

      setPushSync('failed');
      setNotice('Permission is allowed, but the push token did not sync. Try again on the installed app.');
    } catch {
      setPushSync('failed');
      setNotice('Could not enable notifications. Open settings and try again.');
    } finally {
      setBusy(false);
    }
  }, [onSetupChanged, startupDisabled]);

  const permissionTone = statusTone(permission);
  const pushTone =
    pushSync === 'synced' ? 'ok' : pushSync === 'failed' || pushSync === 'unavailable' ? 'bad' : 'warn';

  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title}>Urgent booking alert setup</Text>
      <Text style={styles.body}>{bodyText}</Text>

      <View style={styles.statusGrid}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Notifications</Text>
          <Text style={[styles.statusValue, styles[permissionTone]]}>{statusText(permission)}</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Push token</Text>
          <Text style={[styles.statusValue, styles[pushTone]]}>
            {pushStatusText(pushSync, tokenSuffix)}
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Device</Text>
          <Text style={styles.statusValue}>{platformName}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            void handleEnable();
          }}
          disabled={busy || Platform.OS === 'web' || startupDisabled}
          accessibilityRole="button"
          accessibilityLabel="Enable urgent booking notifications"
          style={({ pressed }) => [
            styles.primaryButton,
            (busy || Platform.OS === 'web' || startupDisabled) && styles.buttonDisabled,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.accentText} />
          ) : (
            <Text style={styles.primaryButtonLabel}>Enable urgent alerts</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            void openNotificationSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open notification settings for this app"
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonLabel}>
            {Platform.OS === 'ios' ? 'Open iPhone settings' : 'Open notification settings'}
          </Text>
        </Pressable>
        {Platform.OS === 'android' ? (
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
        ) : null}
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Text style={styles.disclaimer}>
        {Platform.OS === 'ios'
          ? 'iPhone lock-screen, sound, and badge controls are managed in iOS Settings.'
          : 'Android cannot guarantee a forceful popup on every device.'}
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
  statusGrid: {
    gap: space.sm,
    marginTop: space.xs,
  },
  statusItem: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.md,
    gap: space.xxs,
  },
  statusLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  ok: {
    color: colors.success,
  },
  warn: {
    color: colors.warning,
  },
  bad: {
    color: colors.danger,
  },
  actions: {
    flexDirection: 'column',
    gap: space.sm,
    marginTop: space.xs,
  },
  primaryButton: {
    minHeight: 48,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryButtonLabel: {
    color: colors.accentText,
    fontSize: fontSize.sm,
    fontWeight: '900',
  },
  button: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    backgroundColor: colors.card,
  },
  buttonLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  notice: {
    color: colors.muted,
    fontSize: fontSize.sm,
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.md,
  },
  disclaimer: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
});
