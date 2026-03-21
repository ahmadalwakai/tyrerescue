// lib/notifications/publish-admin-event.ts

import type { AdminNotificationEvent } from "./types";

/**
 * In-memory event emitter for SSE connections.
 * Phase 3 will replace this with a proper SSE broadcast.
 *
 * For now, this stores listeners that SSE stream connections
 * will register themselves into.
 */

type Listener = (event: AdminNotificationEvent) => void;

const listeners = new Set<Listener>();

export function addSSEListener(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function publishAdminEvent(
  event: AdminNotificationEvent
): Promise<void> {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[SSE] Listener error:", err);
    }
  }
}
