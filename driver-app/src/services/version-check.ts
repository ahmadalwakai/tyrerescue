import * as Application from 'expo-application';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api/client';

interface VersionCheckResponse {
  currentVersion: string;
  minVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes?: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Check if the app needs updating.
 * Force updates navigate to a blocking screen; optional updates show an alert.
 */
export async function checkForUpdate(): Promise<void> {
  const appVersion = Application.nativeApplicationVersion ?? '1.0.0';

  let data: VersionCheckResponse;
  try {
    data = await api<VersionCheckResponse>(
      `/api/driver/version-check?version=${encodeURIComponent(appVersion)}&platform=android`,
    );
  } catch {
    // Version check is non-critical — fail silently
    return;
  }

  const needsUpdate = compareVersions(appVersion, data.latestVersion) < 0;
  const belowMinimum = compareVersions(appVersion, data.minVersion) < 0;

  if (!needsUpdate) return;

  if (belowMinimum || data.forceUpdate) {
    // Force update — navigate to blocking screen
    router.replace({
      pathname: '/update-required',
      params: {
        url: data.downloadUrl,
        latest: data.latestVersion,
        notes: data.releaseNotes ?? '',
      },
    });
  } else {
    // Optional update
    Alert.alert(
      'Update Available',
      `Version ${data.latestVersion} is available.${data.releaseNotes ? `\n\n${data.releaseNotes}` : ''}`,
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => Linking.openURL(data.downloadUrl),
        },
      ],
    );
  }
}
