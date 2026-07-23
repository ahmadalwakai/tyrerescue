import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const assistedChatScreenPath = path.join(root, 'assisted-chat-app/src/components/AssistedChatScreen.tsx');
const assistedChatIndexPath = path.join(root, 'assisted-chat-app/app/index.tsx');
const assistedChatAppJsonPath = path.join(root, 'assisted-chat-app/app.json');
const assistedChatPackageJsonPath = path.join(root, 'assisted-chat-app/package.json');
const assistedChatSessionHookPath = path.join(root, 'assisted-chat-app/src/hooks/useAdminSession.ts');
const assistedChatNotificationsPath = path.join(root, 'assisted-chat-app/src/lib/notifications.ts');
const assistedChatUrgentAlertsPath = path.join(root, 'assisted-chat-app/src/lib/urgent-alerts.ts');

const assistedChatScreenSource = () => fs.readFileSync(assistedChatScreenPath, 'utf8');
const assistedChatIndexSource = () => fs.readFileSync(assistedChatIndexPath, 'utf8');

describe('Assisted Chat native launch safety', () => {
  it('does not import the heavy assisted chat screen at route module load time', () => {
    const source = assistedChatIndexSource();
    const importBlock = source.slice(0, source.indexOf('export default function Index'));

    expect(importBlock).not.toContain("AssistedChatScreen } from '@/components/AssistedChatScreen'");
    expect(source).toContain("require('@/components/AssistedChatScreen')");
  });

  it('does not load media or document native modules on initial screen import', () => {
    const source = assistedChatScreenSource();
    const importBlock = source.slice(0, source.indexOf('const GBP'));

    expect(importBlock).not.toContain("from 'expo-audio'");
    expect(importBlock).not.toContain("from './LocationSection'");
    expect(importBlock).not.toContain("from './alerts/UrgentBookingPopup'");
    expect(importBlock).not.toContain("from './AdminStockModal'");
    expect(importBlock).not.toContain("from './ActiveJobsModal'");
    expect(importBlock).not.toContain("from './TrackingModal'");
    expect(importBlock).not.toContain("from './ChatHubModal'");
    expect(importBlock).not.toContain("from './DriverChatModal'");
    expect(importBlock).not.toMatch(/import\s+\{\s*VirtualLandlineModal[\s\S]*from '\.\/VirtualLandlineModal'/);
    expect(importBlock).toContain("import type { VirtualLandlineDraftPrefill } from './VirtualLandlineModal'");
  });

  it('defers native-heavy modules until the admin opens or reaches them', () => {
    const source = assistedChatScreenSource();

    expect(source).toContain('function DeferredLocationSection');
    expect(source).toContain("require('./LocationSection')");
    expect(source).toContain('function DeferredUrgentBookingPopup');
    expect(source).toContain("require('./alerts/UrgentBookingPopup')");
    expect(source).toContain('function DeferredAdminStockModal');
    expect(source).toContain("require('./AdminStockModal')");
    expect(source).toContain('function DeferredActiveJobsModal');
    expect(source).toContain("require('./ActiveJobsModal')");
    expect(source).toContain('function DeferredTrackingModal');
    expect(source).toContain("require('./TrackingModal')");
    expect(source).toContain('function DeferredChatHubModal');
    expect(source).toContain("require('./ChatHubModal')");
    expect(source).toContain('function DeferredDriverChatModal');
    expect(source).toContain("require('./DriverChatModal')");
    expect(source).toContain('function DeferredVirtualLandlineModal');
    expect(source).toContain("require('./VirtualLandlineModal')");
  });

  it('does not link expo-audio into the assisted chat binary', () => {
    const appJson = fs.readFileSync(assistedChatAppJsonPath, 'utf8');
    const packageJson = fs.readFileSync(assistedChatPackageJsonPath, 'utf8');
    const screen = assistedChatScreenSource();

    expect(appJson).not.toContain('expo-audio');
    expect(packageJson).not.toContain('expo-audio');
    expect(screen).not.toContain('expo-audio');
  });

  it('persists a validated login session before committing protected auth state', () => {
    const source = fs.readFileSync(assistedChatSessionHookPath, 'utf8');
    const loginFlow = source.slice(
      source.indexOf('const login = useCallback'),
      source.indexOf('// Wire 401'),
    );

    const validationIndex = loginFlow.indexOf('const data = validateLoginResponse(payload)');
    const persistIndex = loginFlow.indexOf('await AsyncStorage.setItem(STORAGE_KEY, serializedSession)');
    const tokenCommitIndex = loginFlow.indexOf('setAdminToken(data.token)');
    const userCommitIndex = loginFlow.indexOf('setUser(data.user)');
    const statusCommitIndex = loginFlow.indexOf("setStatus('logged-in')");

    expect(validationIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(validationIndex);
    expect(tokenCommitIndex).toBeGreaterThan(persistIndex);
    expect(userCommitIndex).toBeGreaterThan(persistIndex);
    expect(statusCommitIndex).toBeGreaterThan(persistIndex);
  });

  it('mounts the protected tree without navigation after auth state commit', () => {
    const source = assistedChatIndexSource();
    const loggedInBranch = source.slice(
      source.indexOf("if (session.status === 'logged-out')"),
      source.indexOf('const styles = StyleSheet.create'),
    );

    expect(loggedInBranch).toContain('return <LoggedInAssistedChat user={session.user} onLogout={session.logout} />');
    expect(loggedInBranch).toContain("logStartupCheckpoint('protected.tree.mounted'");
    expect(loggedInBranch).toContain('return createElement(');
    expect(loggedInBranch).toContain('getAssistedChatScreen()');
    expect(loggedInBranch).not.toMatch(/\brouter\.(push|replace|navigate)\b/);
  });

  it('guards protected notification startup before native notification entry points', () => {
    const source = assistedChatScreenSource();
    const notificationBlock = source.slice(
      source.indexOf('// Register and confirm urgent alert readiness'),
      source.indexOf('const {', source.indexOf('// Register and confirm urgent alert readiness')),
    );

    const startupGuardIndex = notificationBlock.indexOf('if (isNotificationStartupDisabled())');
    expect(startupGuardIndex).toBeGreaterThan(-1);
    expect(notificationBlock.indexOf('ensureUrgentAlertsArmed()')).toBeGreaterThan(startupGuardIndex);
    expect(notificationBlock.indexOf('scheduleRetry(attempt)')).toBeGreaterThan(startupGuardIndex);

    const responseEffect = source.slice(
      source.indexOf('// Open the bookings modal when the admin taps a notification.'),
      source.indexOf('// Cold-start path'),
    );
    const responseGuardIndex = responseEffect.indexOf('if (isNotificationStartupDisabled()) return;');
    expect(responseGuardIndex).toBeGreaterThan(-1);
    expect(responseEffect.indexOf('addAdminNotificationResponseListener')).toBeGreaterThan(responseGuardIndex);
    expect(responseEffect.indexOf('getLastAdminNotificationResponseData()')).toBeGreaterThan(responseGuardIndex);

    const pendingEffect = source.slice(
      source.indexOf('// Cold-start path'),
      source.indexOf('const {', source.indexOf('// Cold-start path')),
    );
    const pendingGuardIndex = pendingEffect.indexOf('if (isNotificationStartupDisabled()) return;');
    expect(pendingGuardIndex).toBeGreaterThan(-1);
    expect(pendingEffect.indexOf('consumePendingOpenBookings()')).toBeGreaterThan(pendingGuardIndex);
  });

  it('checks the startup flag before the expo-notifications dynamic import', () => {
    const notificationsSource = fs.readFileSync(assistedChatNotificationsPath, 'utf8');
    const getConfiguredBody = notificationsSource.slice(
      notificationsSource.indexOf('async function getConfiguredNotifications'),
      notificationsSource.indexOf('function logNotificationFailure'),
    );
    const loadBody = notificationsSource.slice(
      notificationsSource.indexOf('async function loadNotificationsModule'),
      notificationsSource.indexOf('async function getConfiguredNotifications'),
    );
    const urgentAlertsSource = fs.readFileSync(assistedChatUrgentAlertsPath, 'utf8');
    const ensureBody = urgentAlertsSource.slice(
      urgentAlertsSource.indexOf('export async function ensureUrgentAlertsArmed'),
      urgentAlertsSource.indexOf('/**', urgentAlertsSource.indexOf('export async function ensureUrgentAlertsArmed')),
    );

    expect(loadBody).toContain("import('expo-notifications')");
    expect(getConfiguredBody.indexOf('isNotificationStartupDisabled()')).toBeGreaterThan(-1);
    expect(getConfiguredBody.indexOf('loadNotificationsModule(context)')).toBeGreaterThan(
      getConfiguredBody.indexOf('isNotificationStartupDisabled()'),
    );
    expect(ensureBody.indexOf('isNotificationStartupDisabled()')).toBeGreaterThan(-1);
    expect(ensureBody.indexOf('registerAdminPushNotifications()')).toBeGreaterThan(
      ensureBody.indexOf('isNotificationStartupDisabled()'),
    );
    expect(ensureBody.indexOf('startUrgentWatcher()')).toBeGreaterThan(
      ensureBody.indexOf('isNotificationStartupDisabled()'),
    );
  });
});
