// lib/notifications/index.ts

export { createAdminNotification } from "./create-admin-notification";
export { publishAdminEvent, addSSEListener } from "./publish-admin-event";
export { sendWebPushToAll } from "./send-web-push";
export { useAdminNotifications } from "./use-admin-notifications";
export * from "./types";

// Sound manager
export {
  isSoundEnabled,
  setSoundEnabled,
  playNotificationSound,
  markUserInteraction,
} from "./sound-manager";

// Push subscription (client-side)
export {
  isPushSupported,
  getPermissionState,
  registerServiceWorker,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribedToPush,
} from "./push-subscription";
