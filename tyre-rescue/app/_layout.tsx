import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import 'react-native-reanimated';
import {
  BebasNeue_400Regular,
  useFonts as useBebasFonts,
} from '@expo-google-fonts/bebas-neue';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter';

import { colors } from '@/src/theme';
import { CustomerStripeProvider } from '../src/stripe-provider';
import { CustomerAccountProvider } from '@/src/customer-account';
import { CustomerNotificationBootstrap } from '@/src/customer-notifications';
import { prepareCustomerLocation } from '@/src/customer-location';

let locationPreparedAtEntry = false;

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [bebasLoaded] = useBebasFonts({ BebasNeue_400Regular });
  const [interLoaded] = useInterFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  const fontsLoaded = bebasLoaded && interLoaded;

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    if (!fontsLoaded || Platform.OS === 'web') return;
    let mounted = true;
    const prepare = () => {
      if (AppState.currentState !== 'active') return;
      const requestPermission = !locationPreparedAtEntry;
      locationPreparedAtEntry = true;
      void prepareCustomerLocation({ requestPermission }).then(result => {
        // The iOS permission sheet may close before AppState reports active.
        // An active event can join that same idle request; resume GPS once it settles.
        if (mounted && result.status === 'idle' && AppState.currentState === 'active') {
          void prepareCustomerLocation();
        }
      });
    };
    prepare();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') prepare(); });
    return () => { mounted = false; subscription.remove(); };
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <CustomerStripeProvider>
      <CustomerAccountProvider>
        <CustomerNotificationBootstrap />
        <ThemeProvider
          value={{
            dark: true,
            colors: {
              primary: colors.accent,
              background: colors.bg,
              card: colors.surface,
              text: colors.text,
              border: colors.border,
              notification: colors.accent,
            },
            fonts: {
              regular: { fontFamily: 'Inter_400Regular', fontWeight: '400' },
              medium: { fontFamily: 'Inter_500Medium', fontWeight: '500' },
              bold: { fontFamily: 'Inter_700Bold', fontWeight: '700' },
              heavy: { fontFamily: 'Inter_700Bold', fontWeight: '700' },
            },
          }}
        >
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </CustomerAccountProvider>
    </CustomerStripeProvider>
  );
}
