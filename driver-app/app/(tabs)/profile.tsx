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

export default function ProfileScreen() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Permission / device state
  const [locationPerm, setLocationPerm] = useState<string>('checking…');
  const [notifPerm, setNotifPerm] = useState<string>('checking…');

  const appVersion = Application.nativeApplicationVersion ?? '1.0.0';
  const buildNumber = Application.nativeBuildVersion ?? '1';

  const checkPermissions = useCallback(async () => {
    const [loc, notif] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Notifications.getPermissionsAsync(),
    ]);
    setLocationPerm(loc.status === 'granted' ? 'Granted' : 'Denied');
    setNotifPerm(notif.status === 'granted' ? 'Granted' : 'Denied');
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
      Alert.alert('Error', 'Please fill in all password fields.');
      return;
    }
    if (newPw.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setChangingPw(true);
    try {
      await driverApi.changePassword(currentPw, newPw);
      mediumHaptic();
      Alert.alert('Success', 'Password changed successfully.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to change password.';
      Alert.alert('Error', msg);
    }
    setChangingPw(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
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
          <InfoRow label="Email" value={profile.email} />
          <InfoRow label="Phone" value={profile.phone ?? '—'} />
          <InfoRow label="Status" value={profile.status} />
          <InfoRow label="Online" value={profile.isOnline ? 'Yes' : 'No'} />
        </View>
      )}

      {/* Change Password */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Change Password</Text>

        <TextInput
          style={styles.input}
          value={currentPw}
          onChangeText={setCurrentPw}
          placeholder="Current password"
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={newPw}
          onChangeText={setNewPw}
          placeholder="New password"
          placeholderTextColor={colors.muted}
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={confirmPw}
          onChangeText={setConfirmPw}
          placeholder="Confirm new password"
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
            {changingPw ? 'Changing…' : 'Update Password'}
          </Text>
        </AnimatedPressable>
      </View>

      {/* Device Info & Settings */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>App & Device</Text>
        <InfoRow label="App Version" value={`${appVersion} (${buildNumber})`} />
        <InfoRow label="Platform" value={Platform.OS === 'android' ? 'Android' : 'iOS'} />
        <InfoRow label="Location Permission" value={locationPerm} />
        <InfoRow label="Notification Permission" value={notifPerm} />
      </View>

      {/* Troubleshooting */}
      {(locationPerm === 'Denied' || notifPerm === 'Denied') && (
        <AnimatedPressable
          style={styles.settingsButton}
          onPress={() => { lightHaptic(); Linking.openSettings(); }}
          pressScale={0.95}
        >
          <Ionicons name="settings-outline" size={18} color={colors.accent} />
          <Text style={styles.settingsButtonText}>Open device settings</Text>
        </AnimatedPressable>
      )}

      {/* Logout */}
      <AnimatedPressable style={styles.logoutButton} onPress={() => { errorHaptic(); handleLogout(); }} pressScale={0.95}>
        <Text style={styles.logoutText}>Sign Out</Text>
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
});
