// lib/notifications/create-admin-notification.ts

import { db } from "@/lib/db";
import { adminNotifications } from "@/lib/db/schema";
import type {
  CreateNotificationInput,
  AdminNotificationEvent,
} from "./types";
import { publishAdminEvent } from "./publish-admin-event";
import { sendWebPushToAll } from "./send-web-push";
import { sendAdminEmailAlert } from './send-admin-email-alert';

/**
 * Central function for creating admin notifications.
 * Call this AFTER a successful DB transaction in any API route.
 *
 * It will:
 * 1. Insert a record into admin_notifications table
 * 2. Publish a realtime event (SSE) to connected admin clients
 * 3. Send Web Push to all active subscriptions
 */
export async function createAdminNotification(
  input: CreateNotificationInput
): Promise<{ id: string } | null> {
  try {
    const [record] = await db
      .insert(adminNotifications)
      .values({
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity ?? "info",
        link: input.link ?? null,
        metadata: input.metadata ?? null,
        createdBy: input.createdBy ?? "system",
      })
      .returning({
        id: adminNotifications.id,
        createdAt: adminNotifications.createdAt,
      });

    if (!record) {
      console.error("[Notifications] Failed to insert notification");
      return null;
    }

    const createdAtIso = (record.createdAt ?? new Date()).toISOString();

    // Build the event payload
    const event: AdminNotificationEvent = {
      id: record.id,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "info",
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
      createdAt: createdAtIso,
      metadata: input.metadata,
    };

    // Fire-and-forget: don't block the main response
    // SSE broadcast
    publishAdminEvent(event).catch((err) =>
      console.error("[Notifications] SSE publish error:", err)
    );

    // Smart push: only push for high-priority events
    const severity = input.severity ?? 'info';
    const shouldPush =
      severity === 'critical' ||
      severity === 'warning' ||
      input.type === 'callback.created' ||
      input.type === 'chat.message.received';

    if (shouldPush) {
      sendWebPushToAll({
        title: input.title,
        body: input.body,
        url: input.link,
        tag: `${input.entityType}-${input.entityId}`,
        icon: '/icon.png',
        badge: '/icon.png',
        urgency: severity === 'critical' ? 'high' : 'normal',
        requireInteraction: severity === 'critical',
        actions: input.link
          ? [{ action: 'open', title: 'View' }]
          : [],
      }).catch((err) =>
        console.error('[Notifications] Web Push error:', err)
      );
    }

    // Email alerts for selected important admin events.
    // Fire-and-forget: never block request completion.
    sendAdminEmailAlert({
      notificationId: record.id,
      createdAtIso,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
      metadata: input.metadata,
    }).catch((err) =>
      console.error('[AdminEmailAlert] Unhandled send error:', err)
    );

    return { id: record.id };
  } catch (error) {
    console.error("[Notifications] createAdminNotification error:", error);
    return null;
  }
}
