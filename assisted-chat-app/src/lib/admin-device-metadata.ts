import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AdminDeviceMetadata {
  deviceName: string;
  modelName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

function displayText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const cleaned = String(value).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function readDisplay(read: () => unknown, maxLength: number): string | null {
  try { return displayText(read(), maxLength); } catch { return null; }
}

function fallbackOsVersion(platform: string): string | null {
  if (platform !== 'android') return readDisplay(() => Platform.Version, 64);
  const release = readDisplay(() => Platform.OS === 'android' ? Platform.constants.Release : null, 64);
  if (release) return release;
  // Android Platform.Version is SDK_INT, not a human-readable OS release.
  const apiLevel = readDisplay(() => Platform.Version, 32);
  return apiLevel && /^\d+$/.test(apiLevel) ? `Android API ${apiLevel}` : null;
}

/** Display-only metadata; no identifiers, permissions or native prompts. */
export function readAdminDeviceMetadata(): AdminDeviceMetadata {
  let device: typeof import('expo-device') | null = null;
  try {
    // Older installed binaries may not expose this native module. Metadata
    // must never prevent restoring or using an otherwise valid sign-in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    device = require('expo-device') as typeof import('expo-device');
  } catch { /* Unavailable metadata is displayed as unknown. */ }
  const modelName = readDisplay(() => device?.modelName, 120) ?? 'Unknown';
  const reportedPlatform = readDisplay(() => Platform.OS, 24)?.toLowerCase();
  const platform = reportedPlatform && ['ios', 'android', 'web', 'windows', 'macos', 'linux'].includes(reportedPlatform)
    ? reportedPlatform : 'unknown';
  return {
    deviceName: readDisplay(() => device?.deviceName, 120) ?? modelName,
    modelName,
    platform,
    osVersion: readDisplay(() => device?.osVersion, 64) ?? fallbackOsVersion(platform) ?? 'Unknown',
    appVersion: readDisplay(() => Constants.expoConfig?.version, 40) ?? 'Unknown',
  };
}
