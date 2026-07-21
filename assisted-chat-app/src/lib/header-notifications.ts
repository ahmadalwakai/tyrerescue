export type HeaderNotificationVisualState = 'ready' | 'loading' | 'offline';

export function formatHeaderNotificationBadge(
  unreadCount: number,
  state: HeaderNotificationVisualState,
): string | null {
  if (state !== 'ready' || unreadCount <= 0) return null;
  if (unreadCount > 99) return '99+';
  return String(unreadCount);
}

export function getHeaderNotificationAccessibilityLabel(
  unreadCount: number,
  state: HeaderNotificationVisualState,
): string {
  if (state === 'loading') return 'Notifications loading';
  if (state === 'offline') return 'Notifications offline';
  if (unreadCount <= 0) return 'Notifications, no unread notifications';
  if (unreadCount === 1) return 'Notifications, 1 unread notification';
  return `Notifications, ${formatHeaderNotificationBadge(unreadCount, state)} unread notifications`;
}
