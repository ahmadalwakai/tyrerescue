export const NOTIFICATION_STARTUP_DISABLE_ENV =
  'EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP';

/**
 * Temporary source-level isolation switch for TestFlight startup crash triage.
 * Set EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP=true to skip all
 * notification startup work while keeping root render, session hydration, and
 * authenticated routing intact. Leave unset for normal behavior.
 */
export function isNotificationStartupDisabled(): boolean {
  return process.env.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP === 'true';
}
