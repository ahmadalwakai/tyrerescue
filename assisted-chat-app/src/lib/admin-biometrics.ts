import { Platform } from 'react-native';
import type { AdminBiometricCapability } from './admin-app-lock';

type LocalAuthentication = typeof import('expo-local-authentication');
const NEW_BUILD = 'Biometric app lock requires an updated installed app build. Your saved sign-in is unchanged.';

async function nativeBiometrics(): Promise<LocalAuthentication | null> {
  if (Platform.OS === 'web') return null;
  // Older installed binaries do not contain this native module. Loading it
  // eagerly can break startup, so keep the import guarded and on demand.
  try { return await import('expo-local-authentication'); } catch { return null; }
}

export async function readAdminBiometricCapability(): Promise<AdminBiometricCapability> {
  if (Platform.OS === 'web') return { available: false, label: 'Biometrics', reason: 'Biometric app lock is available in the installed iPhone app.' };
  const native = await nativeBiometrics();
  if (!native) return { available: false, label: 'Biometrics', reason: NEW_BUILD };
  try {
    const [hardware, enrolled, types] = await Promise.all([
      native.hasHardwareAsync(), native.isEnrolledAsync(), native.supportedAuthenticationTypesAsync(),
    ]);
    const label = types.includes(native.AuthenticationType.FACIAL_RECOGNITION) ? 'Face ID'
      : Platform.OS === 'ios' && types.includes(native.AuthenticationType.FINGERPRINT) ? 'Touch ID' : 'Biometrics';
    if (!hardware) return { available: false, label, reason: 'This device does not have supported biometric hardware.' };
    if (!enrolled) return { available: false, label, reason: `Set up ${label} in your device settings before using app lock.` };
    return { available: true, label, reason: null };
  } catch {
    return { available: false, label: 'Biometrics', reason: 'Biometrics could not be checked. Retry or open device settings.' };
  }
}

export async function authenticateAdminBiometrics(promptMessage: string): Promise<{ success: boolean; message?: string }> {
  const native = await nativeBiometrics();
  if (!native) return { success: false, message: NEW_BUILD };
  try {
    const result = await native.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
      fallbackLabel: '',
      biometricsSecurityLevel: 'strong',
    });
    if (result.success) return { success: true };
    const cancelled = ['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback'].includes(result.error);
    return { success: false, message: cancelled
      ? 'Authentication cancelled. Tap Unlock to try again; your saved sign-in is unchanged.'
      : result.error === 'lockout'
        ? 'Biometrics are temporarily locked. Unlock your iPhone with its passcode, then return and try again.'
        : 'Biometric authentication was not completed. Retry or check your device settings.' };
  } catch {
    return { success: false, message: 'Biometric authentication is unavailable. Retry or open device settings.' };
  }
}
