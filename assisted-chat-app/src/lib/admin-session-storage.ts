import AsyncStorage from '@react-native-async-storage/async-storage';
import { logStartupModuleFailed } from './startup-logging';

export const ADMIN_SESSION_STORAGE_KEY = 'assistedChat.adminToken.v1';

export async function clearInvalidAdminSessionStorage(reason: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return true;
  } catch (error) {
    logStartupModuleFailed('session.storage.clear.failed', error, { reason });
    return false;
  }
}
