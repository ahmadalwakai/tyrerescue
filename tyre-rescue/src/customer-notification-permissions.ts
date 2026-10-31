import type { NotificationPermissionsStatus } from 'expo-notifications';

export type CustomerNotificationPermission = {
  state: 'allowed' | 'quiet' | 'provisional' | 'denied' | 'not_requested' | 'unsupported';
  label: string; detail: string; canRequest: boolean; canReceive: boolean;
  sound: 'On' | 'Off' | 'Not reported'; banners: 'On' | 'Off' | 'Not reported';
};

/** Expo SDK 54 iOS authorization values: undetermined=0, denied=1, authorized=2, provisional=3, ephemeral=4. */
export function customerNotificationPermission(permission: NotificationPermissionsStatus | null, platform: string): CustomerNotificationPermission {
  const unknown = { canRequest: false, canReceive: false, sound: 'Not reported' as const, banners: 'Not reported' as const };
  if (platform === 'web') return { ...unknown, state: 'unsupported', label: 'Available in the app', detail: 'Open Tyre Rescue on your iPhone or Android phone to manage push notifications.' };
  if (!permission) return { ...unknown, state: 'not_requested', label: 'Status unavailable', detail: 'Refresh to check notification settings.' };
  const ios = platform === 'ios' ? permission.ios : undefined;
  const canReceive = ios ? [2, 3, 4].includes(ios.status) : permission.granted;
  const notRequested = ios ? ios.status === 0 : permission.status === 'undetermined';
  const sound = ios ? ios.allowsSound === true ? 'On' : ios.allowsSound === false ? 'Off' : 'Not reported' : 'Not reported';
  const banners = ios ? ios.allowsAlert === false || ios.alertStyle === 0 ? 'Off' : ios.allowsAlert === true ? 'On' : 'Not reported' : 'Not reported';
  const base = { canRequest: notRequested && permission.canAskAgain, canReceive, sound, banners } as const;
  if (notRequested) return { ...base, state: 'not_requested', label: 'Not enabled yet', detail: 'Enable booking updates and messages when you are ready.' };
  if (!canReceive) return { ...base, state: 'denied', label: 'Notifications blocked', detail: 'Allow notifications in your phone settings to receive booking updates.' };
  if (ios?.status === 3) return { ...base, state: 'provisional', label: 'Quiet notifications (provisional)', detail: 'Updates can appear in Notification Centre quietly. Enable alerts and sounds in Settings if you want them.' };
  if (sound === 'Off' || banners === 'Off') return { ...base, state: 'quiet', label: 'Allowed with quiet settings', detail: 'Notifications are allowed, but sounds or banners are switched off.' };
  return { ...base, state: 'allowed', label: 'Notifications allowed', detail: 'Your phone allows notifications. Focus, Silent Mode, connectivity and system settings can still affect alerts.' };
}
