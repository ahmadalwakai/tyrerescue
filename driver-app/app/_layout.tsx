import { useEffect, useRef, useState, useCallback } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { AuthProvider, useAuth } from '@/auth/context';
import { I18nProvider } from '@/i18n';
import { PermissionGate } from '@/components/PermissionGate';
import { JobAlertProvider, useJobAlert } from '@/context/job-alert-context';
import { JobAlertPopup } from '@/components/JobAlertPopup';
import {
  registerForPushNotifications,
  unregisterPushToken,
  addNotificationResponseListener,
  addNotificationReceivedListener,
} from '@/services/notifications';
import { checkForUpdate } from '@/services/version-check';
import { initOfflineQueue } from '@/services/offline-queue';
import { preloadSounds, playSound, loadSoundConfig } from '@/services/sound';
import { markAlerted, fireNewJobAlert } from '@/services/job-alert';
import { driverApi } from '@/api/client';

// Import background-location to register the task at module level
import '@/services/background-location';

SplashScreen.preventAutoHideAsync();

function RootNavigator({ onReady }: { onReady: () => void }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { showAlert: showJobAlert } = useJobAlert();
  const notifListenerRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null);
  const notifReceivedRef = useRef<ReturnType<typeof addNotificationReceivedListener> | null>(null);
  const splashHidden = useRef(false);
  const handledNotifIds = useRef(new Set<string>());

  // Hide splash once auth state is resolved — this is the only real wait
  useEffect(() => {
    if (!isLoading && !splashHidden.current) {
      splashHidden.current = true;
      onReady();
    }
  }, [isLoading, onReady]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  // Register push notifications and version check when user is logged in
  useEffect(() => {
    if (!user) return;

    registerForPushNotifications();
    checkForUpdate();
    initOfflineQueue();
    preloadSounds();
    loadSoundConfig(() => driverApi.getSoundConfig());

    // Play sound + show popup when a push notification arrives while app is foregrounded
    notifReceivedRef.current = addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'new_job') {
        const ref = (data.ref as string) ?? null;
        // Mark as alerted so polling detection doesn't double-fire
        if (ref) markAlerted(ref);
        // Fire sound + vibration via central function
        fireNewJobAlert();
        // Show full-screen alert popup
        showJobAlert({
          ref,
          title: notification.request.content.title ?? '',
          body: notification.request.content.body ?? '',
        });
      } else if (data?.type === 'chat_message') {
        playSound('new_message');
      }
    });

    // Handle notification taps — navigate to the relevant job
    notifListenerRef.current = addNotificationResponseListener((response) => {
      const nid = response.notification.request.identifier;
      if (handledNotifIds.current.has(nid)) return;
      handledNotifIds.current.add(nid);
      const data = response.notification.request.content.data;
      if (data?.type === 'new_job' && data?.ref) {
        router.push(`/(tabs)/jobs/${data.ref as string}`);
      } else if (data?.type === 'chat_message' && data?.conversationId) {
        router.push(`/(tabs)/chat/${data.conversationId as string}`);
      }
    });

    // Handle cold-start: check if app was opened from a notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const nid = response.notification.request.identifier;
      if (handledNotifIds.current.has(nid)) return;
      handledNotifIds.current.add(nid);
      const data = response.notification.request.content.data;
      if (data?.type === 'new_job' && data?.ref) {
        router.push(`/(tabs)/jobs/${data.ref as string}`);
      } else if (data?.type === 'chat_message' && data?.conversationId) {
        router.push(`/(tabs)/chat/${data.conversationId as string}`);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
      notifReceivedRef.current?.remove();
    };
  }, [user, router, showJobAlert]);

  // Show permission gate when logged in (wraps the tab content)
  if (user) {
    return (
      <PermissionGate>
        <Slot />
      </PermissionGate>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    BebasNeue_400Regular,
  });

  const [appReady, setAppReady] = useState(false);

  const handleReady = useCallback(() => {
    setAppReady(true);
  }, []);

  useEffect(() => {
    // Hide native splash only when fonts are loaded AND auth has resolved
    if ((fontsLoaded || fontError) && appReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, appReady]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <I18nProvider>
      <AuthProvider>
        <JobAlertProvider>
          <StatusBar style="light" />
          <RootNavigator onReady={handleReady} />
          <JobAlertPopup />
        </JobAlertProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
