import { createElement, useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LoginScreen } from '@/components/LoginScreen';
import { useAdminSession, type AdminSession } from '@/hooks/useAdminSession';
import { colors } from '@/components/theme';
import {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';

logStartupModuleStarted('Home route module');
logStartupModuleCompleted('Home route module');

let AssistedChatScreenComponent:
  | (typeof import('@/components/AssistedChatScreen'))['AssistedChatScreen']
  | null = null;

function getAssistedChatScreen() {
  if (AssistedChatScreenComponent) return AssistedChatScreenComponent;

  logStartupModuleStarted('Assisted Chat import');
  try {
    const mod = require('@/components/AssistedChatScreen') as typeof import('@/components/AssistedChatScreen');
    AssistedChatScreenComponent = mod.AssistedChatScreen;
    logStartupModuleCompleted('Assisted Chat import');
    return AssistedChatScreenComponent;
  } catch (error) {
    logStartupModuleFailed('protected.screen.import.failed', error);
    throw error;
  }
}

// Conditional render: LoginScreen when logged out, AssistedChatScreen when
// logged in. No route guard, no router-level protection.
export default function Index() {
  const session = useAdminSession();

  useEffect(() => {
    logStartupModuleStarted('Home screen');
    logStartupCheckpoint('Home screen mounted');
    logStartupModuleCompleted('Home screen');
  }, []);

  if (session.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session.status === 'logged-out') {
    return (
      <LoginScreen
        onLogin={session.login}
        loggingIn={session.loggingIn}
        loginError={session.loginError}
        expiredMessage={session.expiredMessage}
      />
    );
  }

  return <LoggedInAssistedChat user={session.user} onLogout={session.logout} />;
}

function LoggedInAssistedChat({
  user,
  onLogout,
}: {
  user: AdminSession['user'];
  onLogout: AdminSession['logout'];
}) {
  useState(() => {
    logStartupModuleStarted('Protected tree', { route: 'index' });
    logStartupCheckpoint('protected.tree.render.started', { route: 'index' });
    return true;
  });

  useEffect(() => {
    logStartupCheckpoint('protected.tree.mounted', { route: 'index' });
    logStartupModuleCompleted('Protected tree', { route: 'index' });
  }, []);

  return createElement(
    getAssistedChatScreen() as ComponentType<{
      user: AdminSession['user'];
      onLogout: AdminSession['logout'];
    }>,
    { user, onLogout },
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
