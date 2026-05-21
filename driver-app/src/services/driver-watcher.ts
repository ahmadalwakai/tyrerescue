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
  simulateAlert(): Promise<boolean>;
}

interface RNNativeModules {
  DriverAlertWatcher?: DriverAlertWatcherNative;
}

const native = (NativeModules as RNNativeModules).DriverAlertWatcher;

const isAndroid = Platform.OS === 'android';

function notAvailable<T>(name: string, fallback: T): T {
  if (__DEV__) {
    console.warn(`[driver-watcher] native module method '${name}' unavailable`);
  }
  return fallback;
}

export const DriverAlertWatcher = {
  async startWatcher(apiBase: string, token: string): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('startWatcher', false);
    try {
      const ok = await native.startWatcher(apiBase, token);
      console.log('[driver-watcher] armed');
      return ok;
    } catch (err) {
      console.warn('[driver-watcher] startWatcher failed', err);
      return false;
    }
  },

  async stopWatcher(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('stopWatcher', false);
    try {
      const ok = await native.stopWatcher();
      console.log('[driver-watcher] disarmed');
      return ok;
    } catch (err) {
      console.warn('[driver-watcher] stopWatcher failed', err);
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
    } catch (err) {
      console.warn('[driver-watcher] openFullScreenAlertSettings failed', err);
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
    } catch (err) {
      console.warn('[driver-watcher] openBatterySettings failed', err);
      return false;
    }
  },

  async simulateAlert(): Promise<boolean> {
    if (!isAndroid || !native) return notAvailable('simulateAlert', false);
    try {
      return await native.simulateAlert();
    } catch (err) {
      console.warn('[driver-watcher] simulateAlert failed', err);
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
    } catch (err) {
      console.warn('[driver-watcher] openAppNotificationSettings failed', err);
      return false;
    }
  },

  isAvailable(): boolean {
    return isAndroid && Boolean(native);
  },
};

export type { DriverAlertWatcherNative };
