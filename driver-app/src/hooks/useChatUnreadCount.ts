import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { chatApi } from '@/api/client';

export function useChatUnreadCount(intervalMs = 10_000) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await chatApi.getUnreadCount();
      setUnreadCount(Math.max(0, Number(res.unread) || 0));
    } catch {
      // Keep the last known count; chat badge should not interrupt driving.
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(refreshUnreadCount, 0);
    const timer = setInterval(refreshUnreadCount, intervalMs);
    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refreshUnreadCount();
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [intervalMs, refreshUnreadCount]);

  return { unreadCount, refreshUnreadCount };
}
