import { useEffect, useRef } from 'react';
import { Slot, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';

logStartupModuleStarted('Root layout module');
logStartupModuleStarted('Splash screen prevent auto hide');
SplashScreen.preventAutoHideAsync()
  .then(() => {
    logStartupModuleCompleted('Splash screen prevent auto hide');
  })
  .catch((error: unknown) => {
    logStartupModuleFailed('Splash screen prevent auto hide', error);
  });
logStartupModuleCompleted('Root layout module');

export default function RootLayout() {
  const rootNavigationState = useRootNavigationState();
  const navigationReadyLogged = useRef(false);

  useEffect(() => {
    logStartupModuleStarted('Root component');
    logStartupCheckpoint('Root component mounted');
    logStartupModuleCompleted('Root component');

    logStartupModuleStarted('Providers');
    logStartupCheckpoint('Providers initialized');
    logStartupModuleCompleted('Providers');

    logStartupModuleStarted('Splash screen hide');
    SplashScreen.hideAsync()
      .then(() => {
        logStartupModuleCompleted('Splash screen hide');
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('Splash screen hide', error);
      });
  }, []);

  useEffect(() => {
    if (navigationReadyLogged.current || !rootNavigationState?.key) return;
    navigationReadyLogged.current = true;
    logStartupModuleStarted('Navigation');
    logStartupCheckpoint('Navigation ready');
    logStartupModuleCompleted('Navigation', {
      routeCount: rootNavigationState.routes.length,
    });
  }, [rootNavigationState?.key, rootNavigationState?.routes.length]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#09090B' }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#09090B" />
        <Slot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
