/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const contractPath = path.join(projectRoot, 'src', 'lib', 'notification-contract.ts');
const safetyPath = path.join(projectRoot, 'src', 'lib', 'notification-safety.ts');
const startupLoggingPath = path.join(projectRoot, 'src', 'lib', 'startup-logging.ts');
const startupConfigPath = path.join(projectRoot, 'src', 'lib', 'notification-startup-config.ts');
const sessionStartupConfigPath = path.join(projectRoot, 'src', 'lib', 'session-startup-config.ts');
const notificationsPath = path.join(projectRoot, 'src', 'lib', 'notifications.ts');
const assistedChatScreenPath = path.join(projectRoot, 'src', 'components', 'AssistedChatScreen.tsx');
const bookingAlertHookPath = path.join(projectRoot, 'src', 'hooks', 'useNewCustomerBookingAlert.ts');
const sessionHookPath = path.join(projectRoot, 'src', 'hooks', 'useAdminSession.ts');
const adminSessionStoragePath = path.join(projectRoot, 'src', 'lib', 'admin-session-storage.ts');
const startupEntryPath = path.join(projectRoot, 'src', 'startup-entry.js');
const rootLayoutPath = path.join(projectRoot, 'app', '_layout.tsx');
const patchPath = path.join(projectRoot, 'patches', 'expo-notifications+55.0.25.patch');
const appConfigPath = path.join(projectRoot, 'app.json');
const easConfigPath = path.join(projectRoot, 'eas.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const rootEasIgnorePath = path.join(projectRoot, '..', '.easignore');

function loadTsModule(filePath, extraSandbox = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    process,
    ...extraSandbox,
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output, sandbox, { filename: filePath });
  return sandbox.module.exports;
}

const {
  isServerRegistrationEnabled,
  parsePersistedRegistrationInfo,
} = loadTsModule(contractPath);

const {
  extractNotificationResponseData,
  isOkResponse,
  normalizeDevicePushToken,
  normalizeExpoPushToken,
  normalizePermissionResponse,
  parseUrgentBookingNotificationOpenRequest,
} = loadTsModule(safetyPath);

const {
  NOTIFICATION_STARTUP_DISABLE_ENV,
  isNotificationStartupDisabled,
} = loadTsModule(startupConfigPath);

const {
  SESSION_RESTORE_DISABLE_ENV,
  isSessionRestoreDisabled,
} = loadTsModule(sessionStartupConfigPath);

assert.equal(parsePersistedRegistrationInfo('{"isEnabled":true}').isEnabled, true);
assert.equal(isServerRegistrationEnabled('{"isEnabled":true}'), true);

for (const value of [null, undefined, '', 'null', '[]', '{}', '{"isEnabled":false}']) {
  assert.equal(isServerRegistrationEnabled(value), false);
}

for (const value of [
  '{',
  '{"isEnabled":',
  123,
  true,
  { isEnabled: true },
  '{"lastRegisteredDeviceToken":{"deviceToken":"stale"}}',
]) {
  assert.equal(parsePersistedRegistrationInfo(value)?.isEnabled === true, false);
}

assert.equal(isServerRegistrationEnabled('{'), false);
assert.equal(isServerRegistrationEnabled('{"isEnabled":true}'), true);

for (const status of ['granted', 'denied', 'undetermined']) {
  assert.equal(normalizePermissionResponse({ status }), status);
}
for (const value of [null, undefined, {}, { status: 'maybe' }, { status: 1 }]) {
  assert.equal(normalizePermissionResponse(value), null);
}

assert.equal(
  normalizeExpoPushToken({ data: 'ExponentPushToken[valid-token]' }),
  'ExponentPushToken[valid-token]',
);
for (const value of [
  null,
  {},
  { data: '' },
  { data: 'plain-native-token' },
  { data: 'ExpoPushToken[wrong-prefix-for-backend]' },
]) {
  assert.equal(normalizeExpoPushToken(value), null);
}

assert.equal(
  normalizeDevicePushToken({ type: 'android', data: 'native-fcm-token' }, 'android'),
  'native-fcm-token',
);
for (const value of [
  null,
  {},
  { type: 'ios', data: 'native-fcm-token' },
  { type: 'android' },
  { type: 'android', data: 'ExponentPushToken[not-native]' },
]) {
  assert.equal(normalizeDevicePushToken(value, 'android'), null);
}

const validResponse = {
  notification: {
    request: {
      content: {
        data: { type: 'urgent_booking', bookingId: 'booking-123' },
      },
    },
  },
};
assert.deepEqual(extractNotificationResponseData(validResponse), {
  type: 'urgent_booking',
  bookingId: 'booking-123',
});
for (const value of [null, {}, { notification: {} }, { notification: { request: { content: {} } } }]) {
  assert.equal(extractNotificationResponseData(value), null);
}

assert.equal(
  JSON.stringify(parseUrgentBookingNotificationOpenRequest({
    type: 'urgent_booking',
    bookingId: 'booking-123',
    refNumber: 'TR-123',
  })),
  JSON.stringify({ bookingId: 'booking-123', refNumber: 'TR-123' }),
);
assert.equal(
  JSON.stringify(parseUrgentBookingNotificationOpenRequest({
    type: 'urgent_booking',
    bookingId: 'booking-123',
    jobRef: 'TR-456',
  })),
  JSON.stringify({ bookingId: 'booking-123', refNumber: 'TR-456' }),
);
for (const value of [
  null,
  {},
  { type: 'urgent_booking' },
  { type: 'urgent_booking', bookingId: '' },
  { type: 'other', bookingId: 'booking-123' },
]) {
  assert.equal(parseUrgentBookingNotificationOpenRequest(value), null);
}

assert.equal(isOkResponse({ ok: true }), true);
for (const value of [null, {}, { ok: false }, { ok: 'true' }]) {
  assert.equal(isOkResponse(value), false);
}

delete process.env[NOTIFICATION_STARTUP_DISABLE_ENV];
assert.equal(isNotificationStartupDisabled(), false);
process.env[NOTIFICATION_STARTUP_DISABLE_ENV] = 'true';
assert.equal(isNotificationStartupDisabled(), true);
for (const value of ['1', 'yes', 'false', '0', '', 'TRUE', 'true ']) {
  process.env[NOTIFICATION_STARTUP_DISABLE_ENV] = value;
  assert.equal(isNotificationStartupDisabled(), false);
}
delete process.env[NOTIFICATION_STARTUP_DISABLE_ENV];

delete process.env[SESSION_RESTORE_DISABLE_ENV];
assert.equal(isSessionRestoreDisabled(), false);
process.env[SESSION_RESTORE_DISABLE_ENV] = 'true';
assert.equal(isSessionRestoreDisabled(), true);
for (const value of ['1', 'yes', 'false', '0', '', 'TRUE', 'true ']) {
  process.env[SESSION_RESTORE_DISABLE_ENV] = value;
  assert.equal(isSessionRestoreDisabled(), false);
}
delete process.env[SESSION_RESTORE_DISABLE_ENV];

const startupConfigSource = fs.readFileSync(startupConfigPath, 'utf8');
assert.match(
  startupConfigSource,
  /process\.env\.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP === 'true'/,
);

const sessionStartupConfigSource = fs.readFileSync(sessionStartupConfigPath, 'utf8');
assert.match(
  sessionStartupConfigSource,
  /process\.env\.EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_SESSION_RESTORE === 'true'/,
);

const notificationsSource = fs.readFileSync(notificationsPath, 'utf8');
assert.match(
  notificationsSource,
  /import type \* as ExpoNotifications from 'expo-notifications'/,
);
assert.doesNotMatch(
  notificationsSource,
  /import \* as Notifications from 'expo-notifications'/,
);
assert.match(notificationsSource, /import\('expo-notifications'\)/);
assert.doesNotMatch(notificationsSource, /DISABLE_SERVER_REGISTRATION_STARTUP/);
assert.match(notificationsSource, /NOTIFICATIONS_IMPORT_READY/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_READ_START/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_READ_SUCCESS/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_READ_FAILED/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_REQUEST_START/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_REQUEST_SUCCESS/);
assert.match(notificationsSource, /NOTIFICATIONS_PERMISSION_REQUEST_FAILED/);
assert.match(notificationsSource, /NOTIFICATIONS_TOKEN_START/);
assert.match(notificationsSource, /NOTIFICATIONS_TOKEN_SUCCESS/);
assert.match(notificationsSource, /NOTIFICATIONS_TOKEN_FAILED/);
assert.match(notificationsSource, /NOTIFICATIONS_API_SYNC_START/);
assert.match(notificationsSource, /NOTIFICATIONS_API_SYNC_SUCCESS/);
assert.match(notificationsSource, /NOTIFICATIONS_API_SYNC_FAILED/);
assert.match(notificationsSource, /NOTIFICATIONS_LISTENERS_ATTACH_START/);
assert.match(notificationsSource, /NOTIFICATIONS_LISTENERS_ATTACHED/);
assert.match(notificationsSource, /notifications\.permission-read\.skipped/);
assert.match(notificationsSource, /notifications\.permission-request\.unavailable/);
assert.match(notificationsSource, /getLastNotificationResponseAsync/);
assert.match(notificationsSource, /extractNotificationResponseData/);
assert.match(notificationsSource, /normalizePermissionResponse/);
assert.match(notificationsSource, /normalizeExpoPushToken/);
assert.match(notificationsSource, /normalizeDevicePushToken/);
assert.match(notificationsSource, /registrationInFlight = null/);

const registerBody = notificationsSource.slice(
  notificationsSource.indexOf('export async function registerAdminPushNotifications'),
  notificationsSource.indexOf('/**\r\n * Clear the app icon badge count'),
);
assert.doesNotMatch(registerBody, /requestPermissionsAsync/);
assert.match(registerBody, /readAdminNotificationPermissionStatus/);
assert.match(registerBody, /getAdminExpoPushToken/);
assert.match(registerBody, /syncAdminExpoPushToken/);

const assistedChatScreenSource = fs.readFileSync(assistedChatScreenPath, 'utf8');
assert.match(assistedChatScreenSource, /NOTIFICATIONS_INIT_START/);
assert.match(assistedChatScreenSource, /NOTIFICATIONS_INIT_COMPLETE/);
assert.match(assistedChatScreenSource, /isNotificationStartupDisabled\(\)/);
assert.match(assistedChatScreenSource, /getUrgentBookingNotificationOpenRequest/);
assert.match(assistedChatScreenSource, /missing-route-or-booking-id/);
assert.match(assistedChatScreenSource, /getLastAdminNotificationResponseData\(\)\s*\r?\n\s*\.then/);
assert.doesNotMatch(assistedChatScreenSource, /void \(async \(\) => \{\r?\n\s*const pending = await consumePendingOpenBookings/);

const bookingAlertHookSource = fs.readFileSync(bookingAlertHookPath, 'utf8');
assert.match(bookingAlertHookSource, /isNotificationStartupDisabled\(\)/);
assert.match(bookingAlertHookSource, /addAdminNotificationReceivedListener/);
assert.match(bookingAlertHookSource, /notifications\.booking-alert\.push-fetch\.failed/);

const sessionHookSource = fs.readFileSync(sessionHookPath, 'utf8');
const adminSessionStorageSource = fs.readFileSync(adminSessionStoragePath, 'utf8');
assert.match(sessionHookSource, /validateStoredSession/);
assert.match(sessionHookSource, /malformed-session/);
assert.match(sessionHookSource, /setAdminToken\(storedSession\.token\)/);
assert.match(sessionHookSource, /setStatus\('logged-out'\)/);
assert.match(sessionHookSource, /ADMIN_SESSION_STORAGE_KEY/);
assert.match(sessionHookSource, /isSessionRestoreDisabled/);
assert.match(sessionHookSource, /Session restore skipped/);
assert.match(adminSessionStorageSource, /assistedChat\.adminToken\.v1/);
assert.match(adminSessionStorageSource, /clearInvalidAdminSessionStorage/);

const startupLoggingSource = fs.readFileSync(startupLoggingPath, 'utf8');
assert.match(startupLoggingSource, /STARTUP_DIAGNOSTIC_STORAGE_KEY = 'assistedChat\.startupDiagnostic\.v1'/);
assert.match(startupLoggingSource, /MAX_TIMELINE_EVENTS = 80/);
assert.match(startupLoggingSource, /MAX_STORED_HISTORY_EVENTS = 20/);
assert.match(startupLoggingSource, /MAX_STACK_LENGTH = 2_500/);
assert.match(startupLoggingSource, /readStartupDiagnostic/);
assert.match(startupLoggingSource, /clearStartupDiagnostic/);
assert.match(startupLoggingSource, /WeakSet/);
assert.match(startupLoggingSource, /SENSITIVE_KEY_PATTERN/);
assert.match(startupLoggingSource, /redactSensitiveText/);

const startupEntrySource = fs.readFileSync(startupEntryPath, 'utf8');
assert.match(startupEntrySource, /global\.javascript\.error/);
assert.match(startupEntrySource, /global\.unhandled_promise_rejection/);
assert.match(startupEntrySource, /STARTUP_ERROR_HANDLER_STATE_KEY/);
assert.match(startupEntrySource, /globalHandlerInstalled/);
assert.match(startupEntrySource, /handlingGlobalError/);
assert.match(startupEntrySource, /previousGlobalHandler/);
assert.match(startupEntrySource, /delegateToOriginalGlobalHandler/);
assert.match(startupEntrySource, /promiseRejectionTrackingOptions/);
assert.match(startupEntrySource, /enablePromiseRejectionTracker/);
assert.match(startupEntrySource, /handlingPromiseRejection/);

const rootLayoutSource = fs.readFileSync(rootLayoutPath, 'utf8');
assert.match(rootLayoutSource, /export function ErrorBoundary/);
assert.match(rootLayoutSource, /root\.error_boundary/);
assert.match(rootLayoutSource, /Copy Report/);
assert.match(rootLayoutSource, /typeof preventAutoHideAsync !== 'function'/);
assert.match(rootLayoutSource, /typeof hideSplashAsync !== 'function'/);
assert.doesNotMatch(rootLayoutSource, /useRootNavigationState/);
assert.match(rootLayoutSource, /StartupDiagnosticsPanel/);
assert.match(rootLayoutSource, /readStartupDiagnostic/);
assert.match(rootLayoutSource, /Clear Diagnostics/);
assert.match(rootLayoutSource, /Copy Diagnostics/);
assert.match(rootLayoutSource, /Clear Invalid Session/);

const nativePatch = fs.readFileSync(patchPath, 'utf8');
assert.doesNotMatch(nativePatch, /setRegistrationInfoAsync/);
assert.match(nativePatch, /shouldThrowOnKeychainFailure: false/);
assert.match(nativePatch, /if !shouldThrowOnKeychainFailure/);

const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
assert.equal(
  JSON.stringify(appConfig.expo.plugins).includes('expo-notifications'),
  true,
  'app.json must configure expo-notifications for iOS urgent booking alerts',
);

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
assert.notDeepEqual(packageJson.expo?.autolinking?.ios?.exclude, ['expo-notifications']);

const easConfigSource = fs.readFileSync(easConfigPath, 'utf8');
assert.doesNotMatch(easConfigSource, /EXPO_PUBLIC_DISABLE_SERVER_REGISTRATION_STARTUP/);
assert.doesNotMatch(
  easConfigSource,
  /EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP/,
  'production builds must not disable notification startup while iOS urgent alerts are enabled',
);

const easConfig = JSON.parse(easConfigSource);
const productionEnv = easConfig.build?.production?.env ?? {};
assert.equal(
  productionEnv[NOTIFICATION_STARTUP_DISABLE_ENV],
  undefined,
  'production builds must leave notification startup enabled for iOS urgent alerts',
);

const rootEasIgnore = fs.readFileSync(rootEasIgnorePath, 'utf8');
assert.match(rootEasIgnore, /!assisted-chat-app\/patches\/\*\*/);

console.log('notification contract checks passed');
