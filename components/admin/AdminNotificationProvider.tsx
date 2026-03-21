// components/admin/AdminNotificationProvider.tsx
'use client';

import { createContext, useContext, useEffect } from 'react';
import { useAdminNotifications } from '@/lib/notifications/use-admin-notifications';
import { AdminNotificationToast } from './AdminNotificationToast';
import { registerServiceWorker } from '@/lib/notifications/push-subscription';

type NotificationContextType = ReturnType<typeof useAdminNotifications>;

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotificationContext(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotificationContext must be used within AdminNotificationProvider'
    );
  }
  return ctx;
}

export function AdminNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const notificationState = useAdminNotifications();

  // Register service worker for Web Push on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <NotificationContext.Provider value={notificationState}>
      {children}
      <AdminNotificationToast
        event={notificationState.latestEvent}
        onDismiss={notificationState.clearLatestEvent}
      />
    </NotificationContext.Provider>
  );
}
