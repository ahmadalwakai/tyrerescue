// lib/notifications/use-admin-notifications.ts
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AdminNotificationRecord, AdminNotificationEvent } from './types';
import { playNotificationSound, markUserInteraction } from './sound-manager';

interface UseAdminNotificationsReturn {
  notifications: AdminNotificationRecord[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  latestEvent: AdminNotificationEvent | null;
  clearLatestEvent: () => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const POLL_INTERVAL = 60_000;
const SSE_RECONNECT_DELAY = 5_000;

export function useAdminNotifications(): UseAdminNotificationsReturn {
  const [notifications, setNotifications] = useState<AdminNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [latestEvent, setLatestEvent] = useState<AdminNotificationEvent | null>(null);

  const nextCursorRef = useRef<string | null>(null);
  const sseConnectedRef = useRef(false);
  const knownIdsRef = useRef(new Set<string>());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track user interaction for sound autoplay policy
  useEffect(() => {
    const handler = () => markUserInteraction();
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('keydown', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
    };
  }, []);

  // Fetch notifications from REST API
  const fetchNotifications = useCallback(
    async (cursor?: string | null, append = false) => {
      try {
        if (!append) setIsLoading(true);
        setError(null);

        const params = new URLSearchParams({ limit: '20' });
        if (cursor) params.set('cursor', cursor);

        const res = await fetch(`/api/admin/admin-notifications?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        const newNotifications: AdminNotificationRecord[] = data.notifications;
        newNotifications.forEach((n) => knownIdsRef.current.add(n.id));

        setNotifications((prev) =>
          append ? [...prev, ...newNotifications] : newNotifications
        );
        setUnreadCount(data.unreadCount);
        setHasMore(data.hasMore);
        nextCursorRef.current = data.nextCursor;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Handle incoming SSE event
  const handleSSEEvent = useCallback((event: AdminNotificationEvent) => {
    if (knownIdsRef.current.has(event.id)) return;
    knownIdsRef.current.add(event.id);

    const record: AdminNotificationRecord = {
      id: event.id,
      type: event.type,
      title: event.title,
      body: event.body,
      entityType: event.entityType,
      entityId: event.entityId,
      severity: event.severity,
      link: event.link ?? null,
      metadata: event.metadata ?? null,
      isRead: false,
      readAt: null,
      createdBy: null,
      createdAt: new Date(event.createdAt),
    };

    setNotifications((prev) => [record, ...prev]);
    setUnreadCount((prev) => prev + 1);
    setLatestEvent(event);
    playNotificationSound();
  }, []);

  // SSE Connection
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const es = new EventSource('/api/admin/admin-notifications/stream');
      eventSourceRef.current = es;

      es.addEventListener('notification', (e) => {
        try {
          const data: AdminNotificationEvent = JSON.parse(e.data);
          handleSSEEvent(data);
        } catch (err) {
          console.error('[SSE] Failed to parse event:', err);
        }
      });

      es.onopen = () => {
        sseConnectedRef.current = true;
        setError(null);
      };

      es.onerror = () => {
        sseConnectedRef.current = false;
        es.close();
        eventSourceRef.current = null;

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          connectSSE();
        }, SSE_RECONNECT_DELAY);
      };
    } catch {
      sseConnectedRef.current = false;
    }
  }, [handleSSEEvent]);

  // Initialize: fetch + connect SSE
  useEffect(() => {
    fetchNotifications();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [fetchNotifications, connectSSE]);

  // Fallback polling when SSE is disconnected
  useEffect(() => {
    const interval = setInterval(() => {
      if (!sseConnectedRef.current) {
        fetchNotifications();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const refresh = useCallback(async () => {
    nextCursorRef.current = null;
    await fetchNotifications();
  }, [fetchNotifications]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursorRef.current) return;
    await fetchNotifications(nextCursorRef.current, true);
  }, [hasMore, fetchNotifications]);

  const markAsRead = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch('/api/admin/admin-notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        setNotifications((prev) =>
          prev.map((n) =>
            ids.includes(n.id) ? { ...n, isRead: true, readAt: new Date() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - ids.length));
      } catch (err) {
        console.error('[markAsRead] Error:', err);
        await fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/admin-notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('[markAllAsRead] Error:', err);
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const clearLatestEvent = useCallback(() => {
    setLatestEvent(null);
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    hasMore,
    latestEvent,
    clearLatestEvent,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
  };
}
