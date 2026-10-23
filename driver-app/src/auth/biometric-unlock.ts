import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type DriverUnlockResult = { success: true } | { success: false; reason: 'setup' | 'cancelled' | 'failed' };
export async function unlockDriverSession(promptMessage: string, cancelLabel: string): Promise<DriverUnlockResult> {
  if (Platform.OS === 'web') return { success: true };
  const [hardware, enrolled, supported] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const faceSupported = supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  if (!hardware || !enrolled || (Platform.OS === 'ios' && !faceSupported)) return { success: false, reason: 'setup' };
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel,
    disableDeviceFallback: true, fallbackLabel: '', biometricsSecurityLevel: 'strong' });
  if (result.success) return { success: true };
  return { success: false, reason: ['user_cancel', 'app_cancel', 'system_cancel'].includes(result.error) ? 'cancelled' : 'failed' };
}
