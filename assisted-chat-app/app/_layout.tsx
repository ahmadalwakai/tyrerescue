import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ErrorBoundary as ExpoRouterErrorBoundary,
  Slot,
  useRootNavigationState,
  type ErrorBoundaryProps,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, fontSize, radius, space } from '@/components/theme';
import {
  clearStartupDiagnostic,
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
  readStartupDiagnostic,
  type StartupDiagnosticRecord,
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

export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    logStartupModuleFailed('root.error_boundary', props.error);
  }, [props.error]);

  return (
    <ExpoRouterErrorBoundary
      {...props}
      retry={async () => {
        logStartupCheckpoint('root.error_boundary.retry');
        await props.retry();
      }}
    />
  );
}

interface DiagnosticDisplay {
  stage: string;
  timestamp: string;
  buildNumber: string;
  errorName: string;
  errorMessage: string;
  stack: string;
}

function selectDiagnostic(record: StartupDiagnosticRecord | null): StartupDiagnosticRecord | null {
  if (!record) return null;
  const history = [...(record.history ?? []), record];
  return [...history].reverse().find((item) => item.phase === 'failed') ?? record;
}

function hasSessionValidationFailure(record: StartupDiagnosticRecord | null): boolean {
  if (!record) return false;
  const history = [...(record.history ?? []), record];
  return history.some((item) => {
    const source = item.details?.source;
    return (
      item.stage === 'session.hydration.failed' ||
      source === 'malformed-storage' ||
      source === 'malformed-session'
    );
  });
}

function buildDiagnosticDisplay(record: StartupDiagnosticRecord | null): DiagnosticDisplay | null {
  const selected = selectDiagnostic(record);
  if (!selected) return null;
  return {
    stage: selected.stage,
    timestamp: selected.timestampIso,
    buildNumber: selected.buildNumber,
    errorName: selected.error?.name ?? 'none',
    errorMessage: selected.error?.message ?? 'none',
    stack: selected.error?.stack ?? 'none',
  };
}

function StartupDiagnosticsPanel() {
  const mountedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [diagnostic, setDiagnostic] = useState<StartupDiagnosticRecord | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);

  const loadDiagnostic = useCallback(() => {
    void readStartupDiagnostic()
      .then((record) => {
        if (!mountedRef.current) return;
        setDiagnostic(record);
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('startup-diagnostics.read.failed', error);
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadDiagnostic();
    return () => {
      mountedRef.current = false;
    };
  }, [loadDiagnostic]);

  const display = useMemo(() => buildDiagnosticDisplay(diagnostic), [diagnostic]);
  const sessionActionVisible = useMemo(() => hasSessionValidationFailure(diagnostic), [diagnostic]);
  const copyPayload = useMemo(() => {
    if (!display) return 'No startup diagnostic available.';
    return JSON.stringify(display, null, 2);
  }, [display]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setStatusText(null);
    loadDiagnostic();
  }, [loadDiagnostic]);

  const copyDiagnostic = useCallback(() => {
    void (async () => {
      const { copyToClipboard } = await import('@/lib/clipboard');
      return copyToClipboard(copyPayload);
    })()
      .then((ok) => {
        if (!mountedRef.current) return;
        setStatusText(ok ? 'Copied' : 'Copy failed');
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('startup-diagnostics.copy.failed', error);
      });
  }, [copyPayload]);

  const clearDiagnostic = useCallback(() => {
    void clearStartupDiagnostic()
      .then(() => {
        if (!mountedRef.current) return;
        setDiagnostic(null);
        setStatusText('Diagnostics cleared');
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('startup-diagnostics.clear.failed', error);
      });
  }, []);

  const clearInvalidSession = useCallback(() => {
    void (async () => {
      const { clearInvalidAdminSessionStorage } = await import('@/lib/admin-session-storage');
      return clearInvalidAdminSessionStorage('diagnostics-recovery-action');
    })()
      .then((ok) => {
        if (!mountedRef.current) return;
        setStatusText(ok ? 'Invalid session cleared' : 'Session clear failed');
      })
      .catch((error: unknown) => {
        logStartupModuleFailed('startup-diagnostics.session-clear.failed', error);
      });
  }, []);

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Startup diagnostics"
        onPress={openPanel}
        style={({ pressed }) => [
          styles.diagnosticTab,
          pressed ? styles.diagnosticPressed : null,
        ]}
      >
        <Text style={styles.diagnosticTabText}>Diagnostics</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.diagnosticPanel} pointerEvents="auto">
      <View style={styles.diagnosticHeader}>
        <Text style={styles.diagnosticTitle}>Startup Diagnostics</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close startup diagnostics"
          onPress={() => setOpen(false)}
          style={({ pressed }) => [
            styles.diagnosticIconButton,
            pressed ? styles.diagnosticPressed : null,
          ]}
        >
          <Text style={styles.diagnosticIconButtonText}>X</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.diagnosticBody} contentContainerStyle={styles.diagnosticBodyContent}>
        {display ? (
          <>
            <DiagnosticRow label="Stage" value={display.stage} />
            <DiagnosticRow label="Timestamp" value={display.timestamp} />
            <DiagnosticRow label="Build" value={display.buildNumber} />
            <DiagnosticRow label="Error" value={display.errorName} />
            <DiagnosticRow label="Message" value={display.errorMessage} />
            <DiagnosticRow label="Stack" value={display.stack} monospace />
          </>
        ) : (
          <Text style={styles.diagnosticEmpty}>No startup diagnostic available.</Text>
        )}
      </ScrollView>
      <View style={styles.diagnosticActions}>
        <Pressable
          accessibilityRole="button"
          onPress={copyDiagnostic}
          style={({ pressed }) => [
            styles.diagnosticButton,
            pressed ? styles.diagnosticPressed : null,
          ]}
        >
          <Text style={styles.diagnosticButtonText}>Copy Diagnostics</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={clearDiagnostic}
          style={({ pressed }) => [
            styles.diagnosticButton,
            pressed ? styles.diagnosticPressed : null,
          ]}
        >
          <Text style={styles.diagnosticButtonText}>Clear Diagnostics</Text>
        </Pressable>
        {sessionActionVisible ? (
          <Pressable
            accessibilityRole="button"
            onPress={clearInvalidSession}
            style={({ pressed }) => [
              styles.diagnosticButton,
              styles.diagnosticDangerButton,
              pressed ? styles.diagnosticPressed : null,
            ]}
          >
            <Text style={styles.diagnosticDangerText}>Clear Invalid Session</Text>
          </Pressable>
        ) : null}
      </View>
      {statusText ? <Text style={styles.diagnosticStatus}>{statusText}</Text> : null}
    </View>
  );
}

function DiagnosticRow({
  label,
  value,
  monospace,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={[styles.diagnosticValue, monospace ? styles.diagnosticMonospace : null]}>
        {value}
      </Text>
    </View>
  );
}

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
        <StartupDiagnosticsPanel />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  diagnosticTab: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 50,
    elevation: 50,
    minHeight: 34,
    maxWidth: 128,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(8, 13, 27, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  diagnosticTabText: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0,
  },
  diagnosticPanel: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    zIndex: 50,
    elevation: 50,
    width: '92%',
    maxWidth: 430,
    maxHeight: '72%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(6, 10, 22, 0.98)',
    padding: space.md,
    gap: space.sm,
  },
  diagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  diagnosticTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '900',
    letterSpacing: 0,
  },
  diagnosticIconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
  },
  diagnosticIconButtonText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  diagnosticBody: {
    maxHeight: 300,
  },
  diagnosticBodyContent: {
    gap: space.xs,
  },
  diagnosticRow: {
    gap: 3,
  },
  diagnosticLabel: {
    color: colors.subtle,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  diagnosticValue: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  diagnosticMonospace: {
    fontFamily: 'monospace',
  },
  diagnosticEmpty: {
    color: colors.muted,
    fontSize: fontSize.xs,
    lineHeight: 17,
  },
  diagnosticActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  diagnosticButton: {
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.glassStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  diagnosticDangerButton: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  diagnosticButtonText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0,
  },
  diagnosticDangerText: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0,
  },
  diagnosticStatus: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  diagnosticPressed: {
    opacity: 0.78,
  },
});
