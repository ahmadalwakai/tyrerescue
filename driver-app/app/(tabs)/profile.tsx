import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, radius, cardShadow } from '@/constants/theme';
import { driverApi, DriverProfile, ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { LoadingScreen } from '@/components/LoadingScreen';
import { AnimatedPressable } from '@/components/AnimatedPressable';
import { lightHaptic, mediumHaptic, errorHaptic } from '@/services/haptics';
import { useI18n, Locale } from '@/i18n';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Permission / device state
  const [locationPerm, setLocationPerm] = useState<string>(t('profile.checking'));
  const [notifPerm, setNotifPerm] = useState<string>(t('profile.checking'));

  const appVersion = Application.nativeApplicationVersion ?? '1.0.0';
  const buildNumber = Application.nativeBuildVersion ?? '1';

  const checkPermissions = useCallback(async () => {
    const [loc, notif] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    setLocationPerm(loc.status === 'granted' ? t('profile.granted') : t('profile.denied'));
    setNotifPerm(notif.status === 'granted' ? t('profile.granted') : t('profile.denied'));
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await driverApi.getProfile();
      setProfile(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useRefreshOnFocus(fetchProfile);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) {
      Alert.alert(t('common.error'), t('profile.fillPasswordFields'));
      return;
    }
    if (newPw.length < 8) {
      Alert.alert(t('common.error'), t('profile.passwordTooShort'));
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert(t('common.error'), t('profile.passwordsNoMatch'));
      return;
    }

    setChangingPw(true);
    try {
      await driverApi.changePassword(currentPw, newPw);
      mediumHaptic();
      Alert.alert(t('profile.success'), t('profile.passwordChanged'));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('profile.failedChangePassword');
      Alert.alert(t('common.error'), msg);
    }
    setChangingPw(false);
  };

  const handleLogout = () => {
    Alert.alert(t('profile.signOut'), t('profile.confirmSignOut'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: logout },
    ]);
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      {/* Profile Info */}
      {profile && (
        <View style={styles.card}>
          <Text style={styles.name}>{profile.name}</Text>
          <InfoRow label={t('profile.email')} value={profile.email} />
          <InfoRow label={t('profile.phone')} value={profile.phone ?? '—'} />
          <InfoRow label={t('profile.status')} value={profile.status} />
          <InfoRow label={t('profile.online')} value={profile.isOnline ? t('common.yes') : t('common.no')} />
        </View>
      )}

      {/* Change Password */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.changePassword')}</Text>

        <TextInput
          style={styles.input}
          value={currentPw}
          onChangeText={setCurrentPw}
          placeholder={t('profile.currentPassword')}
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={newPw}
          onChangeText={setNewPw}
          placeholder={t('profile.newPassword')}
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={confirmPw}
          onChangeText={setConfirmPw}
          placeholder={t('profile.confirmPassword')}
          placeholderTextColor={colors.muted}
          secureTextEntry
        />

        <AnimatedPressable
          style={[styles.pwButton, changingPw && styles.buttonDisabled]}
          onPress={handleChangePassword}
          disabled={changingPw}
          pressScale={0.95}
        >
          <Text style={styles.pwButtonText}>
            {changingPw ? t('profile.changingPassword') : t('profile.updatePassword')}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Device Info & Settings */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.appAndDevice')}</Text>
        <InfoRow label={t('profile.appVersion')} value={`${appVersion} (${buildNumber})`} />
        <InfoRow label={t('profile.platform')} value={Platform.OS === 'android' ? 'Android' : 'iOS'} />
        <InfoRow label={t('profile.locationPermission')} value={locationPerm} />
        <InfoRow label={t('profile.notificationPermission')} value={notifPerm} />
      </View>

      {/* Troubleshooting */}
      {(locationPerm === t('profile.denied') || notifPerm === t('profile.denied')) && (
        <AnimatedPressable
          style={styles.settingsButton}
          onPress={() => { lightHaptic(); Linking.openSettings(); }}
          pressScale={0.95}
        >
          <Ionicons name="settings-outline" size={18} color={colors.accent} />
          <Text style={styles.settingsButtonText}>{t('profile.openDeviceSettings')}</Text>
        </AnimatedPressable>
      )}

      {/* Language */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
        <View style={styles.langRow}>
          <AnimatedPressable
            style={[styles.langButton, locale === 'en' && styles.langButtonActive]}
            onPress={() => { lightHaptic(); setLocale('en'); }}
            pressScale={0.95}
          >
            <Text style={[styles.langButtonText, locale === 'en' && styles.langButtonTextActive]}>
              {t('profile.english')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.langButton, locale === 'ar' && styles.langButtonActive]}
            onPress={() => { lightHaptic(); setLocale('ar'); }}
            pressScale={0.95}
          >
            <Text style={[styles.langButtonText, locale === 'ar' && styles.langButtonTextActive]}>
              {t('profile.arabic')}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Logout */}
      <AnimatedPressable style={styles.logoutButton} onPress={() => { errorHaptic(); handleLogout(); }} pressScale={0.95}>
        <Text style={styles.logoutText}>{t('profile.signOut')}</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing.md,
    ...cardShadow,
  },
  name: {
    fontFamily: 'BebasNeue_400Regular',
    fontSize: 28,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  infoValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.base,
    marginBottom: spacing.sm,
  },
  pwButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  pwButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: '#FFFFFF',
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.base,
    color: '#EF4444',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  settingsButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  langRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  langButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  langButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(249,115,22,0.1)',
  },
  langButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.base,
    color: colors.muted,
  },
  langButtonTextActive: {
    color: colors.accent,
  },
});
