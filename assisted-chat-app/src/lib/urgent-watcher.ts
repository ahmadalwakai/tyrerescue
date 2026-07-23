import { NativeModules, Platform } from 'react-native';
import {
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from './startup-logging';

interface UrgentWatcherModuleSpec {
  startWatcher(): Promise<boolean>;
  stopWatcher(): Promise<boolean>;
  canUseFullScreenIntent(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<boolean>;
  setAuth(token: string, apiBase: string): Promise<boolean>;
  clearAuth(): Promise<boolean>;
}

logStartupModuleStarted('Urgent watcher native module');
let moduleRef: UrgentWatcherModuleSpec | undefined;
try {
  moduleRef = (NativeModules as Record<string, UrgentWatcherModuleSpec | undefined>).UrgentWatcherModule;
  logStartupModuleCompleted('Urgent watcher native module', {
    platform: Platform.OS,
    available: Boolean(moduleRef),
  });
} catch (error) {
  logStartupModuleFailed('Urgent watcher native module', error, { platform: Platform.OS });
  moduleRef = undefined;
}

export async function startUrgentWatcher(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!moduleRef) {
    console.warn('[UrgentWatcher] native module unavailable');
    return false;
  }
  try {
    return await moduleRef.startWatcher();
  } catch (err) {
    console.warn('[UrgentWatcher] startWatcher failed:', err);
    return false;
  }
}

export async function stopUrgentWatcher(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!moduleRef) return;
  try {
    await moduleRef.stopWatcher();
  } catch (err) {
    console.warn('[UrgentWatcher] stopWatcher failed:', err);
  }
}

export async function canUseFullScreenIntent(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!moduleRef) return false;
  try {
    return await moduleRef.canUseFullScreenIntent();
  } catch {
    return false;
  }
}

export async function openFullScreenIntentSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!moduleRef) return false;
  try {
    return await moduleRef.openFullScreenIntentSettings();
  } catch (err) {
    console.warn('[UrgentWatcher] openFullScreenIntentSettings failed:', err);
    return false;
  }
}

export async function setUrgentWatcherAuth(token: string, apiBase: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (!moduleRef) return false;
  try {
    return await moduleRef.setAuth(token, apiBase);
  } catch (err) {
    console.warn('[UrgentWatcher] setAuth failed:', err);
    return false;
  }
}

export async function clearUrgentWatcherAuth(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!moduleRef) return;
  try {
    await moduleRef.clearAuth();
  } catch (err) {
    console.warn('[UrgentWatcher] clearAuth failed:', err);
  }
}
