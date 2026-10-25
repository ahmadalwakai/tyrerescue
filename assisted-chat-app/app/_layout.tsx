import { useCallback, useEffect, useRef, useState } from 'react';
import { Slot, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AdminAppLockProvider } from '@/components/security/AdminAppLockProvider';
import { colors, fontSize, radius, space } from '@/components/theme';
import {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';

logStartupModuleStarted('Root layout module');
preventSplashAutoHide();
logStartupModuleCompleted('Root layout module');

function preventSplashAutoHide(): void {
  logStartupModuleStarted('Splash screen prevent auto hide');
  const preventAutoHideAsync = SplashScreen.preventAutoHideAsync;

  if (typeof preventAutoHideAsync !== 'function') {
    logStartupCheckpoint('Splash screen prevent auto hide unavailable');
    logStartupModuleCompleted('Splash screen prevent auto hide', {
      available: false,
    });
    return;
  }

  preventAutoHideAsync()
    .then(() => {
      logStartupModuleCompleted('Splash screen prevent auto hide', {
        available: true,
      });
    })
    .catch((error: unknown) => {
      logStartupModuleFailed('Splash screen prevent auto hide', error);
    });
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const mountedRef = useRef(false);
  const retryingRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    logStartupModuleFailed('root.error_boundary', error);
    return () => { mountedRef.current = false; };
  }, [error]);

  const retryScreen = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    setRetryFailed(false);
    logStartupCheckpoint('root.error_boundary.retry');
    try {
      await retry();
    } catch (retryError: unknown) {
      logStartupModuleFailed('root.error_boundary.retry.failed', retryError);
      if (mountedRef.current) setRetryFailed(true);
    } finally {
      retryingRef.current = false;
      if (mountedRef.current) setRetrying(false);
    }
  }, [retry]);

  return (
    <View style={styles.errorBoundaryScreen}>
      <StatusBar style="light" backgroundColor="#09090B" />
      <Text style={styles.errorBoundaryTitle}>Something went wrong</Text>
      <Text style={styles.errorBoundaryMessage}>We could not open this screen. Please try again.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry opening screen"
        accessibilityState={{ disabled: retrying, busy: retrying }}
        disabled={retrying}
        onPress={retryScreen}
        style={({ pressed }) => [styles.errorBoundaryButton, (pressed || retrying) && styles.pressed]}
      >
        <Text style={styles.errorBoundaryButtonText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
      </Pressable>
      {retryFailed ? <Text style={styles.errorBoundaryMessage}>Please close and reopen Assisted Chat, then try again.</Text> : null}
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    logStartupModuleStarted('Root component');
    logStartupCheckpoint('Root component mounted');
    logStartupModuleCompleted('Root component');

    logStartupModuleStarted('Navigation');
    logStartupCheckpoint('Navigation mounted with root layout');
    logStartupModuleCompleted('Navigation');

    logStartupModuleStarted('Providers');
    logStartupCheckpoint('Providers initialized');
    logStartupModuleCompleted('Providers');

    logStartupModuleStarted('Splash screen hide');
    const hideSplashAsync = SplashScreen.hideAsync;

    if (typeof hideSplashAsync !== 'function') {
      logStartupCheckpoint('Splash screen hide unavailable');
      logStartupModuleCompleted('Splash screen hide', {
        available: false,
      });
      return;
    }

    hideSplashAsync()
      .then(() => {
        logStartupModuleCompleted('Splash screen hide', {
          available: true,
        });
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('Splash screen hide', error);
      });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#09090B' }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#09090B" />
        <AdminAppLockProvider>
          <Slot />
        </AdminAppLockProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorBoundaryScreen: {
    flex: 1,
    backgroundColor: '#09090B',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 64,
    paddingBottom: 36,
    gap: space.md,
  },
  errorBoundaryTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
  },
  errorBoundaryMessage: {
    color: colors.muted,
    fontSize: fontSize.md,
    lineHeight: 24,
  },
  errorBoundaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  errorBoundaryButtonText: { color: colors.accentText, fontSize: fontSize.md, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
