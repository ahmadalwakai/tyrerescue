 

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
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
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
assert.equal(normalizeExpoPushToken({ data: 'ExpoPushToken[valid-token]' }), 'ExpoPushToken[valid-token]');
for (const value of [
  null,
  {},
  { data: '' },
  { data: 'plain-native-token' },
  { data: 'ExpoPushToken[]' },
  { data: 'ExpoPushToken[missing-bracket' },
  { data: 'ExponentPushToken[space not valid]' },
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
  { type: 'android', data: 'ExpoPushToken[not-native]' },
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
assert.match(sessionHookSource, /readStoredAdminSession/);
assert.match(sessionHookSource, /writeStoredAdminSession/);
assert.match(sessionHookSource, /persistentSession: true/);
assert.match(sessionHookSource, /status: 'recovery'/);
assert.match(sessionHookSource, /retryRestore/);
assert.doesNotMatch(sessionHookSource, /from ['"]@react-native-async-storage\/async-storage['"]/);
assert.doesNotMatch(sessionHookSource, /AsyncStorage\.(getItem|setItem|removeItem)/);
assert.doesNotMatch(sessionHookSource, /setOnUnauthorized/);
assert.doesNotMatch(sessionHookSource, /Session expired/);
assert.match(sessionHookSource, /isSessionRestoreDisabled/);
assert.match(sessionHookSource, /Session restore skipped/);
assert.match(adminSessionStorageSource, /assistedChat\.adminToken\.v1/);
assert.match(adminSessionStorageSource, /clearInvalidAdminSessionStorage/);
assert.match(adminSessionStorageSource, /import\('expo-secure-store'\)/);
assert.match(adminSessionStorageSource, /clear-intent/);

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
assert.match(rootLayoutSource, /typeof preventAutoHideAsync !== 'function'/);
assert.match(rootLayoutSource, /typeof hideSplashAsync !== 'function'/);
assert.doesNotMatch(rootLayoutSource, /useRootNavigationState/);
assert.match(rootLayoutSource, /AdminAppLockProvider/);
assert.match(rootLayoutSource, /<Slot\s*\/>/);
assert.doesNotMatch(rootLayoutSource, /StartupDiagnosticsPanel|readStartupDiagnostic|clearStartupDiagnostic/);
assert.doesNotMatch(rootLayoutSource, /Copy Report|Clear Diagnostics|Copy Diagnostics|Clear Invalid Session/);
assert.doesNotMatch(rootLayoutSource, /error\.(message|stack)|JSON\.stringify/);

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

async function verifyPrivateErrorRecovery() {
  const noop = () => {};
  const failureCalls = [];
  const checkpoints = [];
  const state = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const react = {
    useCallback: (callback) => callback,
    useEffect: (effect) => { effect(); },
    useRef: (initial) => {
      const index = refIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = value; }];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { Slot: 'Slot' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-splash-screen': {
      preventAutoHideAsync: async () => {},
      hideAsync: async () => {},
    },
    'react-native': {
      Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles },
    },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureHandlerRootView' },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    '@/components/security/AdminAppLockProvider': { AdminAppLockProvider: 'AdminAppLockProvider' },
    '@/components/theme': { colors: {}, fontSize: {}, radius: {}, space: {} },
    '@/lib/startup-logging': {
      logStartupModuleStarted: noop,
      logStartupModuleCompleted: noop,
      logStartupModuleFailed: (...args) => failureCalls.push(args),
      logStartupCheckpoint: (...args) => checkpoints.push(args),
    },
  };
  const layout = loadTsModule(rootLayoutPath, {
    require: (id) => {
      assert.ok(Object.hasOwn(modules, id), `Unmocked error recovery dependency blocked: ${id}`);
      return modules[id];
    },
  });
  const error = new Error('isolated-private-error sk_test_DO_NOT_RENDER_SAMPLE');
  error.name = 'IsolatedPrivateError';
  error.stack = 'isolated-private-stack at sensitive-internal-file.ts:321';
  let retryCalls = 0;
  let rejectRetry = false;
  let finishRetry;
  let retryPending = null;
  const retry = async () => {
    retryCalls++;
    if (retryPending) await retryPending;
    if (rejectRetry) throw error;
  };
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    return layout.ErrorBoundary({ error, retry });
  };
  const descendants = (node) => {
    if (node == null || node === false) return [];
    if (Array.isArray(node)) return node.flatMap(descendants);
    return [node, ...descendants(node?.props?.children)];
  };
  const checkPrivateRecovery = (tree) => {
    const nodes = descendants(tree);
    const renderedText = nodes.filter((node) => typeof node === 'string').join(' ');
    for (const forbidden of [error.name, error.message, error.stack, 'sk_test_DO_NOT_RENDER_SAMPLE', 'Copy Report', 'Diagnostics']) {
      assert.equal(renderedText.includes(forbidden), false, 'technical error details must never render in recovery UI');
    }
    const buttons = nodes.filter((node) => node?.type === 'Pressable');
    assert.equal(buttons.length, 1, 'error recovery exposes only Retry, without report or session-clear actions');
    assert.ok(descendants(buttons[0]).some((node) => node === 'Retry' || node === 'Retrying…'));
    return buttons[0];
  };

  const firstButton = checkPrivateRecovery(render());
  assert.ok(failureCalls.some(([stage, recorded]) => stage === 'root.error_boundary' && recorded === error), 'internal startup error logging must survive UI removal');
  retryPending = new Promise((resolve) => { finishRetry = resolve; });
  firstButton.props.onPress();
  firstButton.props.onPress();
  assert.equal(retryCalls, 1, 'repeated taps must not start concurrent recovery');
  const pendingButton = checkPrivateRecovery(render());
  assert.equal(pendingButton.props.disabled, true);
  assert.equal(pendingButton.props.accessibilityState.busy, true);
  finishRetry();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  assert.ok(checkpoints.some(([stage]) => stage === 'root.error_boundary.retry'));

  retryPending = null;
  rejectRetry = true;
  const secondButton = checkPrivateRecovery(render());
  await assert.doesNotReject(async () => {
    secondButton.props.onPress();
    for (let index = 0; index < 8; index++) await Promise.resolve();
  }, 'failed retries must remain recoverable without exposing the raw error');
  const failedTree = render();
  checkPrivateRecovery(failedTree);
  assert.ok(descendants(failedTree).includes('Please close and reopen Assisted Chat, then try again.'));
  assert.equal(retryCalls, 2);
  assert.ok(failureCalls.some(([stage, recorded]) => stage !== 'root.error_boundary' && recorded === error), 'failed recovery remains available to internal error logging');
}

async function verifyConfirmedRegistrationAndIosReadiness() {
  const safety = loadTsModule(safetyPath);
  const noop = () => {};
  const startupLogging = new Proxy({}, { get: () => noop });
  const storage = new Map();
  const asyncStorage = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async (key) => { storage.delete(key); },
  };
  const platform = { OS: 'ios' };
  let adminToken = 'mock-admin-session';
  let baseUrl = 'https://isolated.invalid';
  let apiContextRevision = 0;
  let permission = 'granted';
  let backendResult = { ok: true };
  let backendFails = false;
  let duringPost = noop;
  let pendingPostGate = null;
  const posted = [];
  const deleted = [];
  const scheduled = [];
  const expo = {
    setNotificationHandler: noop,
    getPermissionsAsync: async () => ({ status: permission }),
    requestPermissionsAsync: async () => ({ status: permission }),
    getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[mock-ios-device]' }),
    scheduleNotificationAsync: async (value) => { scheduled.push(value); },
    AndroidNotificationPriority: { MAX: 'max' },
  };
  function requireMocks(mocks) {
    return (id) => {
      assert.ok(Object.hasOwn(mocks, id), `Unmocked module blocked: ${id}`);
      return mocks[id];
    };
  }
  const startupConfig = { isNotificationStartupDisabled: () => false };
  const api = {
    getAdminToken: () => adminToken,
    getApiBaseUrl: () => baseUrl,
    getApiContextRevision: () => apiContextRevision,
    api: {
      post: async (endpoint, body) => {
        posted.push({ endpoint, body });
        duringPost();
        if (pendingPostGate) await pendingPostGate;
        if (backendFails) throw new Error('Isolated backend sync failure');
        return backendResult;
      },
      del: async (endpoint, options) => { deleted.push({ endpoint, body: options?.body }); return { ok: true }; },
    },
  };
  const sandbox = {
    console: { log: noop, warn: noop, error: noop },
    __DEV__: false,
    require: requireMocks({
      'react-native': { Platform: platform },
      '@react-native-async-storage/async-storage': asyncStorage,
      'expo-device': { isDevice: true },
      'expo-notifications': expo,
      './api': api,
      './notification-startup-config': startupConfig,
      './notification-safety': safety,
      './startup-logging': startupLogging,
    }),
  };
  const notifications = loadTsModule(notificationsPath, sandbox);

  assert.ok(await notifications.registerAdminPushNotifications());
  assert.equal(posted[0].body.platform, 'ios');
  assert.equal(posted[0].body.token, 'ExpoPushToken[mock-ios-device]');
  backendFails = true;
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'backend failure must not report registration');
  backendFails = false;
  backendResult = { ok: false };
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'unconfirmed backend response must not report registration');
  backendResult = { ok: true };
  permission = 'denied';
  const beforeDenied = posted.length;
  assert.equal(await notifications.registerAdminPushNotifications(), null);
  assert.equal(posted.length, beforeDenied, 'permission denial must not register a token');
  permission = 'granted';
  duringPost = () => { adminToken = 'different-session'; };
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'stale login result must not report readiness');
  duringPost = () => { baseUrl = 'https://different-project.invalid'; };
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'stale project result must not report readiness');
  duringPost = () => { apiContextRevision += 2; };
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'switching away and back must not revive an old registration');
  duringPost = () => { permission = 'denied'; };
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'permission revoked during sync must not report readiness');
  permission = 'granted';
  duringPost = noop;

  backendResult = { ok: true, status: 'accepted' };
  await notifications.sendAdminNotificationTest();
  assert.equal(posted.at(-1).endpoint, '/api/mobile/admin/notifications/test');
  assert.equal(Object.keys(posted.at(-1).body).length, 0, 'the client must never choose a push recipient');
  backendResult = { ok: true };
  await assert.rejects(notifications.sendAdminNotificationTest(), /did not confirm acceptance/);
  backendResult = { ok: true, status: 'accepted' };
  duringPost = () => { apiContextRevision += 1; };
  await assert.rejects(notifications.sendAdminNotificationTest(), /account or project changed/);
  duringPost = noop;
  backendResult = { ok: true };

  let watcherStarts = 0;
  let fullScreenChecks = 0;
  const urgentAlerts = loadTsModule(path.join(projectRoot, 'src/lib/urgent-alerts.ts'), {
    console: sandbox.console,
    require: requireMocks({
      'react-native': { Platform: platform },
      '@react-native-async-storage/async-storage': asyncStorage,
      './api': api,
      './notification-startup-config': startupConfig,
      './notification-safety': safety,
      './startup-logging': startupLogging,
      './notifications': {
        ...notifications,
        getDeviceFcmToken: async () => 'mock-native-android-token',
        getUrgentAlertsPermissionStatus: async () => permission,
      },
      './urgent-watcher': {
        canUseFullScreenIntent: async () => { fullScreenChecks++; return true; },
        startUrgentWatcher: async () => { watcherStarts++; return true; },
        stopUrgentWatcher: async () => {}, setUrgentWatcherAuth: async () => true,
        clearUrgentWatcherAuth: async () => {}, openFullScreenIntentSettings: async () => false,
      },
    }),
  });
  const armed = await urgentAlerts.ensureUrgentAlertsArmed();
  assert.equal(armed.armed, true);
  assert.ok(armed.snapshot.registeredAt);
  assert.ok(armed.snapshot.tokenSuffix);
  assert.equal(watcherStarts, 0, 'iOS does not require the Android watcher');
  assert.equal(fullScreenChecks, 0, 'iOS does not require Android full-screen intent');
  baseUrl = 'https://next-project.invalid';
  assert.equal((await urgentAlerts.getUrgentAlertsReadinessSnapshot()).registeredAt, null);
  backendFails = true;
  assert.equal((await urgentAlerts.ensureUrgentAlertsArmed()).armed, false);
  assert.equal((await urgentAlerts.getUrgentAlertsReadinessSnapshot()).registeredAt, null);
  backendFails = false;
  permission = 'denied';
  assert.equal((await urgentAlerts.ensureUrgentAlertsArmed()).armed, false);
  assert.equal(await urgentAlerts.getUrgentAlertsStatus(), 'no_permission');
  permission = 'granted';

  // The existing Android path still requires a confirmed raw token and watcher.
  platform.OS = 'android';
  backendResult = { ok: true, registered: true };
  const androidNotifications = {
    ...notifications, registerAdminPushNotifications: async () => 'ExponentPushToken[mock-android]',
    getDeviceFcmToken: async () => 'mock-native-android-token',
    getUrgentAlertsPermissionStatus: async () => 'granted',
  };
  const androidRequire = requireMocks({
    'react-native': { Platform: platform },
    '@react-native-async-storage/async-storage': asyncStorage,
    './api': api, './notification-startup-config': startupConfig,
    './notification-safety': safety, './startup-logging': startupLogging,
    './notifications': androidNotifications,
    './urgent-watcher': {
      canUseFullScreenIntent: async () => true,
      startUrgentWatcher: async () => { watcherStarts++; return true; },
      stopUrgentWatcher: async () => {}, setUrgentWatcherAuth: async () => true,
      clearUrgentWatcherAuth: async () => {}, openFullScreenIntentSettings: async () => false,
    },
  });
  const androidAlerts = loadTsModule(path.join(projectRoot, 'src/lib/urgent-alerts.ts'), {
    console: sandbox.console, require: androidRequire,
  });
  assert.equal((await androidAlerts.ensureUrgentAlertsArmed()).armed, true);
  assert.equal(watcherStarts, 1);

  await notifications.presentLocalUrgentBookingNotification({ bookingId: 'scheduled', isUrgent: false });
  await notifications.presentLocalUrgentBookingNotification({ bookingId: 'emergency' });
  assert.equal(scheduled[0].content.sound, 'default');
  assert.equal(scheduled[0].content.channelId, 'admin_bookings');
  assert.equal(scheduled[0].content.vibrate, undefined);
  assert.equal(scheduled[0].content.priority, undefined);
  assert.equal(scheduled[0].content.data.isUrgent, false);
  assert.equal(scheduled[1].content.sound, 'urgent_booking.mp3');
  assert.equal(scheduled[1].content.channelId, 'urgent_bookings_v3');

  // Execute the real setup card handler with inert hooks; never render native UI.
  platform.OS = 'ios';
  backendFails = true;
  const states = [];
  const callbacks = [];
  let setupChanges = 0;
  const react = {
    useState(initial) { const i = states.length; states.push(initial); return [initial, (value) => { states[i] = value; }]; },
    useRef(current) { return { current }; },
    useCallback(fn) { callbacks.push(fn); return fn; },
    useMemo(fn) { return fn(); }, useEffect: noop,
  };
  const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const card = loadTsModule(path.join(projectRoot, 'src/components/alerts/NotificationReliabilityCard.tsx'), {
    require: requireMocks({
      react, 'react/jsx-runtime': jsxRuntime,
      'react-native': { Platform: platform, ActivityIndicator: 'ActivityIndicator', AppState: { addEventListener: () => ({ remove: noop }) },
        Linking: {}, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } },
      '@/lib/notifications': notifications, '@/lib/notification-startup-config': startupConfig,
      '@/lib/api': { ...api, ApiError: class ApiError extends Error {} },
      '../theme': { colors: {}, fontSize: {}, radius: {}, space: {} },
    }),
  });
  card.NotificationReliabilityCard({ onSetupChanged: () => { setupChanges++; } });
  await callbacks[1]();
  assert.equal(states[1], 'failed', 'setup card must not claim a failed sync is registered');
  assert.equal(states[2], 'not_tested', 'registration must not claim a delivered test');
  backendFails = false;
  await callbacks[0]();
  assert.equal(states[1], 'synced', 'settings refresh registers only after server confirmation');
  permission = 'denied';
  await callbacks[0]();
  assert.equal(states[1], 'idle');
  assert.equal(states[2], 'not_tested', 'permission checks must not claim test delivery');
  assert.ok(setupChanges >= 2);

  // Logout must remove only this physical device, even after a failed sync.
  permission = 'granted';
  backendFails = true;
  assert.equal(await notifications.registerAdminPushNotifications(), null);
  await notifications.unregisterAdminPushNotifications();
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].endpoint, '/api/mobile/admin/push-token');
  assert.equal(deleted[0].body.token, 'ExpoPushToken[mock-ios-device]');
  assert.equal(deleted.some((entry) => entry.endpoint.includes('native-alert-token')), false);

  // No remembered token and failed native retrieval must not broaden deletion.
  const getToken = expo.getExpoPushTokenAsync;
  expo.getExpoPushTokenAsync = async () => ({ data: '' });
  await notifications.unregisterAdminPushNotifications();
  assert.equal(deleted.length, 1);
  expo.getExpoPushTokenAsync = getToken;
  await notifications.registerAdminPushNotifications();
  adminToken = 'new-login-session';
  expo.getExpoPushTokenAsync = async () => ({ data: '' });
  await notifications.unregisterAdminPushNotifications();
  assert.equal(deleted.length, 1, 'another session must not reuse the former session device token');
  expo.getExpoPushTokenAsync = async () => {
    baseUrl = 'https://switched-during-logout.invalid';
    return { data: 'ExpoPushToken[mock-ios-device]' };
  };
  await notifications.unregisterAdminPushNotifications();
  assert.equal(deleted.length, 1, 'project switch during native token retrieval must suppress DELETE');
  expo.getExpoPushTokenAsync = getToken;

  // Wait for the same-session POST acknowledgement before deleting its row.
  backendFails = false;
  let releasePost;
  pendingPostGate = new Promise((resolve) => { releasePost = resolve; });
  let postStarted;
  const started = new Promise((resolve) => { postStarted = resolve; });
  duringPost = () => postStarted();
  const pendingRegistration = notifications.registerAdminPushNotifications();
  await started;
  const pendingLogout = notifications.unregisterAdminPushNotifications();
  const repeatedLogout = notifications.unregisterAdminPushNotifications();
  assert.equal(await notifications.registerAdminPushNotifications(), null, 'no new registration may race with logout cleanup');
  await Promise.resolve();
  assert.equal(deleted.length, 1, 'logout DELETE must not overtake its pending POST');
  releasePost();
  await Promise.all([pendingRegistration, pendingLogout, repeatedLogout]);
  assert.equal(deleted.length, 2);
  assert.equal(deleted[1].body.token, 'ExpoPushToken[mock-ios-device]');
  pendingPostGate = null;
  duringPost = noop;

  // Exercise the actual API facade's optional DELETE body without any network.
  const requests = [];
  const apiFacade = loadTsModule(path.join(projectRoot, 'src/lib/api.ts'), {
    __DEV__: false,
    process: { env: { NODE_ENV: 'production' } },
    require: requireMocks({
      'expo-constants': { expoConfig: {} }, 'react-native': { Platform: platform },
      './startup-logging': startupLogging,
    }),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
    },
  });
  await apiFacade.api.del('/isolated-delete', { body: { token: 'mock-current-device' } });
  await apiFacade.api.del('/isolated-legacy-caller');
  assert.equal(requests[0].options.method, 'DELETE');
  assert.equal(requests[0].options.body, JSON.stringify({ token: 'mock-current-device' }));
  assert.equal(requests[1].options.body, undefined, 'unrelated legacy API callers remain compatible');
}

Promise.all([verifyPrivateErrorRecovery(), verifyConfirmedRegistrationAndIosReadiness()]).then(() => {
  console.log('notification contract checks passed, including private error recovery, isolated iOS registration/readiness and setup-card regressions');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
