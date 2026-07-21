import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  formatHeaderNotificationBadge,
  getHeaderNotificationAccessibilityLabel,
} from '../../assisted-chat-app/src/lib/header-notifications';

const repoRoot = path.resolve(__dirname, '..', '..');
const headerPath = path.join(repoRoot, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');

describe('Assisted Chat header notifications', () => {
  it('formats notification visual states without leaking badges into identity UI', () => {
    expect(formatHeaderNotificationBadge(0, 'ready')).toBeNull();
    expect(formatHeaderNotificationBadge(1, 'ready')).toBe('1');
    expect(formatHeaderNotificationBadge(9, 'ready')).toBe('9');
    expect(formatHeaderNotificationBadge(100, 'ready')).toBe('99+');
    expect(formatHeaderNotificationBadge(9, 'loading')).toBeNull();
    expect(formatHeaderNotificationBadge(9, 'offline')).toBeNull();

    expect(getHeaderNotificationAccessibilityLabel(0, 'ready')).toBe('Notifications, no unread notifications');
    expect(getHeaderNotificationAccessibilityLabel(1, 'ready')).toBe('Notifications, 1 unread notification');
    expect(getHeaderNotificationAccessibilityLabel(120, 'ready')).toBe('Notifications, 99+ unread notifications');
    expect(getHeaderNotificationAccessibilityLabel(3, 'loading')).toBe('Notifications loading');
    expect(getHeaderNotificationAccessibilityLabel(3, 'offline')).toBe('Notifications offline');
  });

  it('keeps the badge scoped to the dedicated notifications button', () => {
    const source = readFileSync(headerPath, 'utf8');
    const chatMarkStart = source.indexOf('<View style={styles.assistedChatMark}>');
    const chatMarkEnd = source.indexOf('<Text style={styles.headerTitle}', chatMarkStart);
    const chatMarkSource = source.slice(chatMarkStart, chatMarkEnd);
    const notificationButtonSource = source.slice(source.indexOf('function HeaderNotificationButton'));

    expect(chatMarkSource).not.toMatch(/notification|badge|unread/i);
    expect(source).toContain('testID="assisted-chat-header-chat-hub-button"');
    expect(source).toContain('onOpenChatHub={handleOpenHeaderChatHub}');
    expect(source).toContain('onOpenNotifications={handleOpenHeaderNotifications}');
    expect(notificationButtonSource).toContain('testID="assisted-chat-header-notifications-button"');
    expect(notificationButtonSource).toContain('onPress={onPress}');
    expect(notificationButtonSource).toContain('testID="assisted-chat-header-notification-badge"');
    expect(notificationButtonSource).toContain('styles.notificationBadge');
  });
});
