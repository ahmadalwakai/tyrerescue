import { NativeModules, Platform } from 'react-native';

interface DriverAlertWatcherNative {
  startWatcher(apiBase: string, token: string): Promise<boolean>;
  stopWatcher(): Promise<boolean>;
  isArmed(): Promise<boolean>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenAlertSettings(): Promise<boolean>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  openBatterySettings(): Promise<boolean>;
  areNotificationsEnabled(): Promise<boolean>;
  openAppNotificationSettings(): Promise<boolean>;
}

interface RNNativeModules {
  DriverAlertWatcher?: DriverAlertWatcherNative;
}

const native = (NativeModules as RNNativeModules).DriverAlertWatcher;

const isAndroid = Platform.OS === 'android';

function notAvailable<T>(_name: string, fallback: T): T {
  return fallback;
}

export const DriverAlertWatcher = {
  async startWatcher(apiBase: string, token: string): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('startWatcher', false);
    try {
      const ok = await native.startWatcher(apiBase, token);
      return ok;
    } catch {
      return false;
    }
  },

  async stopWatcher(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('stopWatcher', false);
    try {
      const ok = await native.stopWatcher();
      return ok;
    } catch {
      return false;
    }
  },

  async isArmed(): Promise<boolean> {
    if (!isAndroid || !native) return false;
    try {
      return await native.isArmed();
    } catch {
      return false;
    }
  },

  async canUseFullScreenIntent(): Promise<boolean> {
    if (!isAndroid || !native) return true;
    try {
      return await native.canUseFullScreenIntent();
    } catch {
      return false;
    }
  },

  async openFullScreenAlertSettings(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('openFullScreenAlertSettings', false);
    try {
      return await native.openFullScreenAlertSettings();
    } catch {
      return false;
    }
  },

  async isIgnoringBatteryOptimizations(): Promise<boolean> {
    if (!isAndroid || !native) return true;
    try {
      return await native.isIgnoringBatteryOptimizations();
    } catch {
      return false;
    }
  },

  async openBatterySettings(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('openBatterySettings', false);
    try {
      return await native.openBatterySettings();
    } catch {
      return false;
    }
  },

  async areNotificationsEnabled(): Promise<boolean> {
    if (!isAndroid || !native) return true;
    if (typeof native.areNotificationsEnabled !== 'function') return true;
    try {
      return await native.areNotificationsEnabled();
    } catch {
      return false;
    }
  },

  async openAppNotificationSettings(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('openAppNotificationSettings', false);
    if (typeof native.openAppNotificationSettings !== 'function') return false;
    try {
      return await native.openAppNotificationSettings();
    } catch {
      return false;
    }
  },

  isAvailable(): boolean {
    return isAndroid && Boolean(native);
  },
};

export type { DriverAlertWatcherNative };
