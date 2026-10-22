export const SESSION_RESTORE_DISABLE_ENV =
  'EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_SESSION_RESTORE';

/**
 * Temporary TestFlight isolation switch. When enabled, startup skips the
 * persisted admin session so the app can launch to LoginScreen without
 * importing the protected Assisted Chat tree from a previous install.
 */
export function isSessionRestoreDisabled(): boolean {
  return process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_SESSION_RESTORE === 'true';
}
