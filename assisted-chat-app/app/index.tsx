import { createElement, useEffect, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LoginScreen } from '@/components/LoginScreen';
import { SessionRecoveryScreen } from '@/components/SessionRecoveryScreen';
import { useAdminSession, type AdminSession } from '@/hooks/useAdminSession';
import { useAdminWorkspace } from '@/hooks/useAdminWorkspace';
import { AppButton } from '@/components/ui';
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Restore sign-in before loading the protected native tree.
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
  const workspace = useAdminWorkspace();
  const needsInitialWorkspace = session.status === 'logged-out' && !session.activeProject;
  const { selectProject } = session;

  useEffect(() => {
    // Fresh installs and the old login-screen picker start at the main app.
    // Workplace changes are made from the signed-in account settings.
    if (needsInitialWorkspace) void selectProject('tyrerescue');
  }, [needsInitialWorkspace, selectProject]);

  useEffect(() => {
    logStartupModuleStarted('Home screen');
    logStartupCheckpoint('Home screen mounted');
    logStartupModuleCompleted('Home screen');
  }, []);

  if (session.status === 'loading' || needsInitialWorkspace) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session.status === 'recovery') {
    return <SessionRecoveryScreen message={session.recoveryError} onRetry={session.retryRestore} onLogout={session.logout} />;
  }

  if (session.status === 'logged-out') {
    return (
      <LoginScreen
        onLogin={session.login}
        loggingIn={session.loggingIn}
        loginError={session.loginError}
        expiredMessage={session.expiredMessage}
        activeProject={session.activeProject!}
      />
    );
  }

  if (!workspace.hydrated) {
    return <View style={styles.loading}>
      {workspace.error ? <WorkspaceRecovery loading={workspace.loading} onRetry={workspace.refresh} onLogout={session.logout} /> :
        <ActivityIndicator color={colors.accent} />}
    </View>;
  }

  const workspaceSourceApp = workspace.selectedWorkspace?.sourceApp ?? null;
  const workspaceLabel = workspace.selectedWorkspace?.sourceLabel ?? 'All workspaces';
  return (
    <LoggedInAssistedChat
      key={`${session.activeProject?.id ?? 'tyrerescue'}:${workspaceSourceApp ?? 'all'}`}
      user={session.user}
      onLogout={session.logout}
      activeProjectId={session.activeProject?.id ?? null}
      workspaceSourceApp={workspaceSourceApp}
      workspaceLabel={workspaceLabel}
    />
  );
}

function WorkspaceRecovery({ loading, onRetry, onLogout }: {
  loading: boolean;
  onRetry: () => Promise<void>;
  onLogout: AdminSession['logout'];
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (action: () => Promise<void>) => {
    if (!mounted.current || inFlight.current || loading) return;
    inFlight.current = true; setBusy(true); setActionError(false);
    try { await action(); }
    catch { if (mounted.current) setActionError(true); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <View style={styles.workspaceRecovery}>
    <Text style={styles.workspaceRecoveryText}>Could not load your workspaces. Check your connection and retry.</Text>
    {actionError ? <Text style={styles.workspaceRecoveryText} accessibilityRole="alert">Could not complete this action. Please try again.</Text> : null}
    <AppButton label="Retry workspaces" onPress={() => { void run(onRetry); }} loading={loading || busy} disabled={loading || busy} fullWidth />
    <AppButton label="Sign out" variant="secondary" onPress={() => { void run(onLogout); }} disabled={loading || busy} fullWidth />
  </View>;
}

function LoggedInAssistedChat({
  user,
  onLogout,
  activeProjectId,
  workspaceSourceApp,
  workspaceLabel,
}: {
  user: AdminSession['user'];
  onLogout: AdminSession['logout'];
  activeProjectId: string | null;
  workspaceSourceApp: string | null;
  workspaceLabel: string;
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
      activeProjectId: string | null;
      workspaceSourceApp: string | null;
      workspaceLabel: string;
    }>,
    { user, onLogout, activeProjectId, workspaceSourceApp, workspaceLabel },
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceRecovery: { width: '100%', maxWidth: 420, padding: 24, gap: 18 },
  workspaceRecoveryText: { color: colors.text, fontSize: 16, lineHeight: 24, textAlign: 'center' },
});
