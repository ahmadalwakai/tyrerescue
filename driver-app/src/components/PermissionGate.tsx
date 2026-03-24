import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius } from '@/constants/theme';
import { useI18n } from '@/i18n';

interface PermissionStatus {
  location: boolean;
  notifications: boolean;
}

interface Props {
  children: React.ReactNode;
}

export function PermissionGate({ children }: Props) {
  const { t } = useI18n();
  const [perms, setPerms] = useState<PermissionStatus | null>(null);
  const [notifDismissed, setNotifDismissed] = useState(false);

  const check = useCallback(async () => {
    const [loc, notif] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    setPerms({
      location: loc.status === 'granted',
      notifications: notif.status === 'granted',
    });
  }, []);

  useEffect(() => {
    check();
    // Re-check when app comes back from settings
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!perms || (perms.location && (perms.notifications || notifDismissed))) {
    return <>{children}</>;
  }

  // Location is mandatory — always show gate if not granted
  const needsLocation = !perms.location;
  // Notifications can be skipped but with a warning
  const needsNotifications = !perms.notifications && !notifDismissed;

  const requestLocation = async () => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      // Also request background
      await Location.requestBackgroundPermissionsAsync();
      check();
    } else if (!canAskAgain) {
      openSettings();
    } else {
      check();
    }
  };

  const requestNotifications = async () => {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') {
      check();
    } else if (!canAskAgain) {
      openSettings();
    } else {
      check();
    }
  };

  const openSettings = () => {
    if (Platform.OS === 'android') {
      Linking.openSettings();
    } else {
      Linking.openURL('app-settings:');
    }
  };

  return (
    <View style={styles.container}>
      <Ionicons name="shield-checkmark-outline" size={56} color={colors.accent} />
      <Text style={styles.heading}>{t('permissions.permissionsRequired')}</Text>
      <Text style={styles.subheading}>
        {needsLocation
          ? t('permissions.locationRequired')
          : t('permissions.notificationsEncouraged')}
      </Text>

      {needsLocation && (
        <View style={styles.permRow}>
          <View style={styles.permInfo}>
            <Ionicons name="location-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{t('permissions.locationTitle')}</Text>
              <Text style={styles.permDesc}>
                {t('permissions.locationDesc')}
              </Text>
            </View>
          </View>
          <Pressable style={styles.grantBtn} onPress={requestLocation}>
            <Text style={styles.grantBtnText}>{t('common.grant')}</Text>
          </Pressable>
        </View>
      )}

      {needsNotifications && (
        <View style={styles.permRow}>
          <View style={styles.permInfo}>
            <Ionicons name="notifications-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{t('permissions.notificationsTitle')}</Text>
              <Text style={styles.permDesc}>
                {t('permissions.notificationsDesc')}
              </Text>
            </View>
          </View>
          <Pressable style={styles.grantBtn} onPress={requestNotifications}>
            <Text style={styles.grantBtnText}>{t('common.grant')}</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={styles.settingsBtn} onPress={openSettings}>
        <Ionicons name="settings-outline" size={18} color={colors.accent} />
        <Text style={styles.settingsBtnText}>{t('permissions.openDeviceSettings')}</Text>
      </Pressable>

      {/* Only allow skip when location IS granted but notifications are not */}
      {!needsLocation && needsNotifications && (
        <Pressable onPress={() => setNotifDismissed(true)}>
          <Text style={styles.skipText}>{t('permissions.continueWithout')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  heading: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  permRow: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  permInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  permTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.text,
  },
  permDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: 2,
  },
  grantBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  grantBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },
  settingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  settingsBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  skipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.muted,
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
});
