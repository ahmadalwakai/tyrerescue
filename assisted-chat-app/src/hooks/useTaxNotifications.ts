import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { TaxNotificationDto } from '../types/tax-payroll';

export function useTaxNotifications(companyId: string) {
  const [notifications, setNotifications] = useState<TaxNotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(
    async (unreadOnly = false) => {
      setLoading(true);
      try {
        const res = await api.get<{ notifications: TaxNotificationDto[] }>(
          `/api/admin/tax/companies/${companyId}/notifications${unreadOnly ? '?unreadOnly=true' : ''}`,
        );
        setNotifications(res.notifications);
        setUnreadCount(res.notifications.filter((n) => !n.readAt).length);
      } catch {
        // non-fatal
      } finally {
        setLoading(false);
      }
    },
    [companyId],
  );

  const markRead = useCallback(
    async (notificationId: string) => {
      try {
        await api.patch(`/api/admin/tax/companies/${companyId}/notifications`, { notificationId });
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // non-fatal
      }
    },
    [companyId],
  );

  return { notifications, loading, unreadCount, load, markRead };
}
