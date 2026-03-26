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
import { JobAlertProvider, useJobAlert, type JobAlertType } from '@/context/job-alert-context';
import { JobAlertPopup } from '@/components/JobAlertPopup';
import {
  registerForPushNotifications,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  fireLocalCriticalNotification,
} from '@/services/notifications';
import { checkForUpdate } from '@/services/version-check';
import { initOfflineQueue } from '@/services/offline-queue';
import { preloadSounds, playSound, loadSoundConfig } from '@/services/sound';
import { markAlerted, fireJobAlert, isAlerted } from '@/services/job-alert';
import { useNewJobDetector } from '@/hooks/useNewJobDetector';
import { driverApi } from '@/api/client';

// Import background-location to register the task at module level
import '@/services/background-location';

SplashScreen.preventAutoHideAsync();

/** Accepted type values for critical job notifications from the backend. */
const JOB_TYPES = new Set(['new_job', 'job_assigned', 'new_assignment', 'reassignment', 'upcoming_v2']);

/** Map notification types to alert types for the popup. */
function toAlertType(type: string | null): JobAlertType {
  if (type === 'reassignment') return 'reassignment';
  if (type === 'upcoming_v2') return 'upcoming_v2';
  return 'new_job';
}

/** Map notification types to sound events. */
function toSoundEvent(type: string | null): 'new_job' | 'reassignment' | 'upcoming_v2' {
  if (type === 'reassignment') return 'reassignment';
  if (type === 'upcoming_v2') return 'upcoming_v2';
  return 'new_job';
}

/** Normalize push notification payload to handle backend key variations. */
function normalizeNotificationPayload(data: Record<string, unknown> | undefined): {
  type: string | null;
  ref: string | null;
  conversationId: string | null;
  isJobAlert: boolean;
} {
  if (!data) return { type: null, ref: null, conversationId: null, isJobAlert: false };
  const type = (typeof data.type === 'string' ? data.type : null);
  const ref =
    (typeof data.ref === 'string' && data.ref) ||
    (typeof data.refNumber === 'string' && data.refNumber) ||
    (typeof data.bookingRef === 'string' && data.bookingRef) ||
    null;
  const conversationId =
    (typeof data.conversationId === 'string' && data.conversationId) || null;
  return { type, ref, conversationId, isJobAlert: !!type && JOB_TYPES.has(type) };
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

    // Play sound + show popup when a push notification arrives while app is foregrounded.
    // The native notification (with channel sound) is also shown by the system —
    // we play in-app sound as a supplement but the channel sound is the primary mechanism.
    notifReceivedRef.current = addNotificationReceivedListener((notification) => {
      const { type, ref, isJobAlert } = normalizeNotificationPayload(
        notification.request.content.data as Record<string, unknown>,
      );

      if (isJobAlert) {
        const eventType = toSoundEvent(type);
        const alreadyAlerted = ref ? isAlerted(ref, eventType) : false;
        if (ref) markAlerted(ref, eventType);
        if (!alreadyAlerted) {
          // Fire local notification on the correct channel for native sound + tray entry.
          // The remote push was suppressed by the handler; this local notification
          // is presented on the correct channel with native sound + vibration.
          const channelId = eventType === 'upcoming_v2' ? 'jobs_upcoming_v2' : 'jobs_critical_v3';
          fireLocalCriticalNotification(
            notification.request.content.title ?? 'Job Alert',
            notification.request.content.body ?? '',
            notification.request.content.data as Record<string, unknown>,
            channelId,
          );
          // In-app vibration (supplement to native channel vibration)
          fireJobAlert(eventType);
          // In-app popup (visible only while app is foregrounded)
          showJobAlert({
            ref,
            title: notification.request.content.title ?? '',
            body: notification.request.content.body ?? '',
            alertType: toAlertType(type),
          });
        }
      } else if (type === 'chat_message') {
        playSound('new_message');
      }
    });

    // Handle notification taps — navigate to the relevant job
    notifListenerRef.current = addNotificationResponseListener((response) => {
      const nid = response.notification.request.identifier;
      if (handledNotifIds.current.has(nid)) return;
      handledNotifIds.current.add(nid);
      const { ref, isJobAlert, type, conversationId } = normalizeNotificationPayload(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (isJobAlert && ref) {
        markAlerted(ref, toSoundEvent(type));
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
      const { ref, isJobAlert, type, conversationId } = normalizeNotificationPayload(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (isJobAlert && ref) {
        markAlerted(ref, toSoundEvent(type));
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
