import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
import { useNewJobDetector } from '@/hooks/useNewJobDetector';
import { driverApi } from '@/api/client';

// Import background-location to register the task at module level
import '@/services/background-location';

SplashScreen.preventAutoHideAsync();

/** Accepted type values for new-job notifications from the backend. */
const JOB_TYPES = new Set(['new_job', 'job_assigned', 'new_assignment']);

/** Normalize push notification payload to handle backend key variations. */
function normalizeNotificationPayload(data: Record<string, unknown> | undefined): {
  type: string | null;
  ref: string | null;
  conversationId: string | null;
  isNewJob: boolean;
} {
  if (!data) return { type: null, ref: null, conversationId: null, isNewJob: false };
  const type = (typeof data.type === 'string' ? data.type : null);
  const ref =
    (typeof data.ref === 'string' && data.ref) ||
    (typeof data.refNumber === 'string' && data.refNumber) ||
    (typeof data.bookingRef === 'string' && data.bookingRef) ||
    null;
  const conversationId =
    (typeof data.conversationId === 'string' && data.conversationId) || null;
  return { type, ref, conversationId, isNewJob: !!type && JOB_TYPES.has(type) };
}

function RootNavigator({ onReady }: { onReady: () => void }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { showAlert: showJobAlert } = useJobAlert();
  const { checkForNewJobs, reset: resetDetector } = useNewJobDetector();
  const notifListenerRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null);
  const notifReceivedRef = useRef<ReturnType<typeof addNotificationReceivedListener> | null>(null);
  const splashHidden = useRef(false);
  const handledNotifIds = useRef(new Set<string>());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const { type, ref, isNewJob } = normalizeNotificationPayload(
        notification.request.content.data as Record<string, unknown>,
      );

      if (isNewJob) {
        if (ref) markAlerted(ref);
        fireNewJobAlert();
        showJobAlert({
          ref,
          title: notification.request.content.title ?? '',
          body: notification.request.content.body ?? '',
        });
      } else if (type === 'chat_message') {
        playSound('new_message');
      }
    });

    // Handle notification taps — navigate to the relevant job
    notifListenerRef.current = addNotificationResponseListener((response) => {
      const nid = response.notification.request.identifier;
      if (handledNotifIds.current.has(nid)) return;
      handledNotifIds.current.add(nid);
      const { ref, isNewJob, type, conversationId } = normalizeNotificationPayload(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (isNewJob && ref) {
        router.push(`/(tabs)/jobs/${ref}`);
      } else if (type === 'chat_message' && conversationId) {
        router.push(`/(tabs)/chat/${conversationId}`);
      }
    });

    // Handle cold-start: check if app was opened from a notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const nid = response.notification.request.identifier;
      if (handledNotifIds.current.has(nid)) return;
      handledNotifIds.current.add(nid);
      const { ref, isNewJob, type, conversationId } = normalizeNotificationPayload(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (isNewJob && ref) {
        router.push(`/(tabs)/jobs/${ref}`);
      } else if (type === 'chat_message' && conversationId) {
        router.push(`/(tabs)/chat/${conversationId}`);
      }
    });

    return () => {
      notifListenerRef.current?.remove();
      notifReceivedRef.current?.remove();
    };
  }, [user, router, showJobAlert]);

  // ── Global job polling ─────────────────────────────────────────────
  // Polls driverApi.getJobs() every 12s while logged-in and app is in foreground.
  // Detects new jobs on ANY screen and fires popup + sound globally.
  useEffect(() => {
    if (!user) return;

    // Reset detector so the first poll re-seeds knownRefs for this session
    resetDetector();

    const POLL_INTERVAL = 12_000;

    const poll = async () => {
      try {
        const res = await driverApi.getJobs();
        const allJobs = [...res.active, ...(res.upcoming ?? [])];
        checkForNewJobs(allJobs);
      } catch {
        // Non-blocking — retry on next interval
      }
    };

    poll();

    const startPolling = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(poll, POLL_INTERVAL);
    };

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    startPolling();

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        poll();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      appStateSub.remove();
    };
  }, [user, checkForNewJobs, resetDetector]);

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
