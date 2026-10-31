const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const source = name => `../../tyre-rescue/src/${name}`;
const contract = loadSource(source('customer-notification-contract.ts'), {});
const permissions = loadSource(source('customer-notification-permissions.ts'), {});
const badge = loadSource(source('customer-notification-badge.ts'), {});
const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';
const permission = (status = 2, overrides = {}) => ({ status: status === 0 ? 'undetermined' : status === 1 ? 'denied' : 'granted', granted: status === 2, canAskAgain: status === 0, expires: 'never',
  ios: { status, allowsSound: true, allowsAlert: true, alertStyle: 1, allowsBadge: true, ...overrides } });
const response = (action = DEFAULT, data = {}, categoryIdentifier = 'customer_booking_updates', id = 'notification-one') => ({ actionIdentifier: action,
  notification: { request: { identifier: id, content: { categoryIdentifier, data: { notificationVersion: 1, ref: 'TYR-2026-12345', bookingId: 'booking-one', ...data } } } } });

test('native actions map only registered categories and validated payloads; notification URLs are never trusted', () => {
  assert.equal(contract.customerNotificationTarget(response('customer_track'), DEFAULT).destination, 'track');
  assert.equal(contract.customerNotificationTarget(response('customer_chat'), DEFAULT).destination, 'chat');
  assert.equal(contract.customerNotificationTarget(response('customer_report', {}, 'customer_service_complete'), DEFAULT).destination, 'service-report');
  assert.equal(contract.customerNotificationTarget(response(DEFAULT, { type: 'customer_chat_message', conversationId: 'room-one' }, 'customer_chat_messages'), DEFAULT).conversationId, 'room-one');
  assert.equal(contract.customerNotificationTarget(response('customer_report'), DEFAULT), null);
  assert.equal(contract.customerNotificationTarget(response('reply', { userText: 'Never send this' }), DEFAULT), null);
  assert.equal(contract.customerNotificationTarget(response(DEFAULT, { notificationVersion: 99 }), DEFAULT), null);
  assert.equal(contract.customerNotificationTarget(response(DEFAULT, { ref: '../admin', url: 'https://untrusted.invalid' }), DEFAULT), null);
  const safe = contract.customerNotificationTarget(response(DEFAULT, { ref: ' tr-one ', conversationId: '../../admin', url: 'https://untrusted.invalid', bookingAccessToken: 'do-not-copy' }), DEFAULT);
  assert.equal(safe.ref, 'TR-ONE'); assert.equal(safe.conversationId, undefined); assert.equal(safe.url, undefined); assert.equal(safe.bookingAccessToken, undefined);
});

test('response inbox waits for readiness, deduplicates cold/live taps and drops queued old sessions', () => {
  const inbox = contract.createCustomerNotificationInbox(); const target = contract.customerNotificationTarget(response(), DEFAULT);
  assert.equal(inbox.offer(target, 0), true); assert.equal(inbox.take(false, 0), null);
  assert.equal(inbox.offer(target, 0), false); assert.equal(inbox.take(true, 0).ref, target.ref);
  assert.equal(inbox.take(true, 0), null);
  inbox.offer({ ...target, key: 'another' }, 0); assert.equal(inbox.take(true, 1), null);
});

test('notification recipient cannot cross accounts and new owner bookings need not already be in cached history', () => {
  const target = contract.customerNotificationTarget(response(DEFAULT, { recipientCustomerId: 'owner-a' }), DEFAULT);
  assert.equal(contract.customerNotificationHasAccess(target, { customerId: 'owner-a', bookingRefs: [], guestRefs: [] }), true);
  assert.equal(contract.customerNotificationHasAccess(target, { customerId: 'owner-b', bookingRefs: [target.ref], guestRefs: [target.ref] }), false);
  assert.equal(contract.customerNotificationHasAccess({ ...target, recipientCustomerId: undefined }, { customerId: null, bookingRefs: [], guestRefs: [target.ref] }), true);
});

test('permission status distinguishes iOS denied, provisional, quiet, undetermined and web without treating permission as delivery', () => {
  assert.equal(permissions.customerNotificationPermission(permission(2), 'ios').state, 'allowed');
  assert.equal(permissions.customerNotificationPermission(permission(2, { allowsSound: false }), 'ios').state, 'quiet');
  assert.equal(permissions.customerNotificationPermission(permission(2, { alertStyle: 0 }), 'ios').banners, 'Off');
  assert.equal(permissions.customerNotificationPermission(permission(3), 'ios').state, 'provisional');
  assert.equal(permissions.customerNotificationPermission(permission(3), 'ios').canReceive, true);
  assert.equal(permissions.customerNotificationPermission({ ...permission(1), granted: true }, 'ios').canReceive, false);
  assert.equal(permissions.customerNotificationPermission(permission(0), 'ios').canRequest, true);
  assert.equal(permissions.customerNotificationPermission(permission(1), 'ios').canRequest, false);
  assert.equal(permissions.customerNotificationPermission(null, 'web').state, 'unsupported');
});

function hooks() {
  const items = []; let cursor = 0; let effects = [];
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useRef(initial) { return items[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; items[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [items[index].value, value => { items[index].value = typeof value === 'function' ? value(items[index].value) : value; }]; },
    useEffect(effect, deps) { const index = cursor++; if (!items[index] || changed(items[index].deps, deps)) effects.push(() => { items[index]?.cleanup?.(); items[index] = { deps, cleanup: effect() }; }); },
    useCallback(callback, deps) { const index = cursor++; if (!items[index] || changed(items[index].deps, deps)) items[index] = { deps, value: callback }; return items[index].value; },
  };
  return { react, render(component) { cursor = 0; effects = []; const result = component(); effects.forEach(effect => effect()); return result; },
    unmount() { items.forEach(item => item?.cleanup?.()); } };
}

function harness(platform = 'ios') {
  const renderer = hooks();
  const state = { platform, permission: permission(), permissionReads: 0, permissionRequests: 0, categories: [], channels: [], registrations: [], routes: [], last: null,
    responseListeners: new Set(), receivedListeners: new Set(), badgeWrites: [], tokenListeners: new Set(), appListeners: new Set(), timers: new Set(), scope: 0, nav: { key: 'root' }, receipts: [], receiptsRead: null,
    tokenCalls: 0, tokenOptions: [], tokenValue: 'ExpoPushToken[one]', tokenResult: null, clearCount: 0, handler: null,
    account: { loading: false, token: 'auth-a', sessionRevision: 0, profile: { id: 'owner-a' }, bookings: [{ refNumber: 'TYR-2026-12345' }], refresh: async () => {} } };
  const listener = (set, callback) => { set.add(callback); return { remove: () => set.delete(callback) }; };
  const native = {
    DEFAULT_ACTION_IDENTIFIER: DEFAULT, AndroidImportance: { HIGH: 4 },
    setNotificationHandler: value => { state.handler = value; },
    setNotificationCategoryAsync: async (...args) => { state.categories.push(args); },
    setNotificationChannelAsync: async (...args) => { state.channels.push(args); },
    getPermissionsAsync: async () => { state.permissionReads++; return state.permission; },
    requestPermissionsAsync: async () => { state.permissionRequests++; state.permission = permission(1); return state.permission; },
    getExpoPushTokenAsync: async options => { state.tokenCalls++; state.tokenOptions.push(options); return state.tokenResult ? state.tokenResult() : { data: state.tokenValue }; },
    getLastNotificationResponse: () => state.last,
    clearLastNotificationResponse: () => { state.clearCount++; state.last = null; },
    addNotificationResponseReceivedListener: callback => listener(state.responseListeners, callback),
    addNotificationReceivedListener: callback => listener(state.receivedListeners, callback),
    setBadgeCountAsync: async count => { state.badgeWrites.push(count); },
    addPushTokenListener: callback => listener(state.tokenListeners, callback),
  };
  const module = loadSource(source('customer-notifications.tsx'), {
    react: renderer.react, 'expo-constants': { default: { easConfig: { projectId: 'fixture-project' } } },
    'expo-notifications': native, 'expo-router': { router: { push: route => state.routes.push(route) }, useRootNavigationState: () => state.nav },
    'react-native': { Platform: { OS: platform }, AppState: { currentState: 'active', addEventListener: (_event, callback) => listener(state.appListeners, callback) } },
    './customer-account': { useCustomerAccount: () => state.account }, './customer-booking-access': { listBookingAccess: async () => state.receiptsRead ? state.receiptsRead() : state.receipts },
    './api': { requestJson: async () => ({ unreadCount: 3 }) }, './customer-notification-badge': badge,
    './customer-push-device': { customerPushScope: () => state.scope, registerCustomerPushDevice: async input => { state.registrations.push(input); return input.scope === state.scope; } },
    './customer-notification-contract': contract, './customer-notification-permissions': permissions,
  }, { setInterval: callback => { state.timers.add(callback); return callback; }, clearInterval: callback => state.timers.delete(callback), console: { warn: () => {} } });
  return { state, module, native, read: () => renderer.render(module.CustomerNotificationBootstrap), unmount: renderer.unmount,
    tap: value => state.responseListeners.forEach(callback => callback(value)), rotate: () => state.tokenListeners.forEach(callback => callback({ type: 'ios', data: 'native-rotated' })),
    foreground: () => state.appListeners.forEach(callback => callback('active')) };
}

test('cold-start tap waits for account and root navigator, then opens once across duplicate listener delivery', async () => {
  const h = harness(); const tap = response('customer_chat'); h.state.last = tap; h.state.account.loading = true; h.state.nav = undefined;
  h.read(); await settle(); h.read(); assert.equal(h.state.routes.length, 0);
  h.state.account = { ...h.state.account, loading: false }; h.read(); await settle(); assert.equal(h.state.routes.length, 0);
  h.state.nav = { key: 'ready' }; h.read(); await settle(); assert.equal(h.state.routes[0].pathname, '/chat');
  h.tap(tap); h.read(); await settle(); assert.equal(h.state.routes.length, 1); h.unmount();
});

test('already-ready cold start still routes after the initial response state update', async () => {
  const h = harness(); h.state.last = response(); h.read(); h.read(); await settle();
  assert.equal(h.state.routes.length, 1); assert.equal(h.state.routes[0].pathname, '/track'); h.unmount();
});

test('cold saved-token hydration may advance revision before loading finishes without losing its verified-owner tap', async () => {
  const h = harness(); h.state.account = { ...h.state.account, loading: true, token: null, profile: null, bookings: [] };
  h.state.last = response(DEFAULT, { recipientCustomerId: 'owner-a' }); h.read(); h.read(); await settle();
  h.state.account = { ...h.state.account, token: 'saved-auth-a' }; h.read(); await settle(); assert.equal(h.state.routes.length, 0);
  h.state.scope++; h.state.account = { ...h.state.account, sessionRevision: 1, loading: false, profile: { id: 'owner-a' } }; h.read(); await settle();
  assert.equal(h.state.routes[0].pathname, '/track'); h.unmount();
});

test('session changes discard pending routing, including a capability read that settles after sign-out', async () => {
  const h = harness(); const wait = deferred(); h.state.receiptsRead = () => wait.promise; h.read();
  h.tap(response()); h.read();
  h.state.scope++; h.state.account = { ...h.state.account, token: null, profile: null, bookings: [], sessionRevision: 1 }; h.read();
  wait.resolve([{ refNumber: 'TYR-2026-12345' }]); await settle();
  assert.equal(h.state.routes.length, 0); h.unmount();
});

test('cross-account notifications open account without old booking parameters and suppress foreground contents', async () => {
  const h = harness(); h.read(); const tap = response(DEFAULT, { recipientCustomerId: 'other-owner' });
  h.tap(tap); h.read(); await settle(); assert.equal(h.state.routes[0], '/account');
  const behavior = await h.state.handler.handleNotification(tap.notification); assert.equal(behavior.shouldShowBanner, false); assert.equal(behavior.shouldPlaySound, false); h.unmount();
});

test('foreground guest notifications require a current booking capability and cannot surface after a session transition', async () => {
  const h = harness(); h.state.account = { ...h.state.account, token: null, profile: null, bookings: [] }; h.read();
  const notification = response().notification;
  assert.equal((await h.state.handler.handleNotification(notification)).shouldShowBanner, false);
  h.state.receipts = [{ refNumber: 'TYR-2026-12345', bookingAccessToken: 'proof' }];
  assert.equal((await h.state.handler.handleNotification(notification)).shouldShowBanner, true);
  const hold = deferred(); h.state.receiptsRead = () => hold.promise;
  const displaying = h.state.handler.handleNotification(notification); h.state.scope++;
  hold.resolve(h.state.receipts); assert.equal((await displaying).shouldPlaySound, false); h.unmount();
});

test('bootstrap never prompts; explicit permission request happens only while undetermined', async () => {
  const h = harness(); h.state.permission = permission(0); h.read(); await settle();
  assert.equal(h.state.permissionRequests, 0); assert.equal(h.state.registrations.length, 0);
  await h.module.requestCustomerNotificationPermissionAsync(); await h.module.requestCustomerNotificationPermissionAsync();
  assert.equal(h.state.permissionRequests, 1); assert.equal(h.state.categories.length, 3); h.unmount();
});

test('cached token is not registered after permissions are revoked', async () => {
  const h = harness(); await h.module.registerForCustomerPushNotificationsAsync({ authToken: 'auth-a' });
  assert.equal(h.state.registrations.length, 1); h.state.permission = permission(1);
  assert.equal(await h.module.registerForCustomerPushNotificationsAsync({ authToken: 'auth-a' }), null);
  assert.equal(h.state.registrations.length, 1); assert.equal(h.state.tokenCalls, 1); assert.equal(h.state.permissionRequests, 0);
});

test('native token rotation invalidates a pending old token result and registers only the new token', async () => {
  const h = harness(); const old = deferred(); h.state.tokenResult = () => old.promise; h.read(); await settle();
  h.state.tokenResult = null; h.state.tokenValue = 'ExpoPushToken[rotated]'; h.rotate(); await settle();
  old.resolve({ data: 'ExpoPushToken[old]' }); await settle();
  assert.deepEqual(h.state.registrations.map(item => item.token), ['ExpoPushToken[rotated]']);
  assert.equal(h.state.tokenOptions.at(-1).devicePushToken.data, 'native-rotated');
  const calls = h.state.tokenCalls; h.rotate(); await settle(); assert.equal(h.state.tokenCalls, calls, 'same native token does not create a registration loop'); h.unmount();
});

test('foreground refresh and cleanup are bounded; web never calls native notification APIs', async () => {
  const h = harness(); h.read(); await settle(); const before = h.state.permissionReads; h.foreground(); await settle(); assert.ok(h.state.permissionReads > before);
  h.unmount(); assert.equal(h.state.responseListeners.size, 0); assert.equal(h.state.tokenListeners.size, 0); assert.equal(h.state.appListeners.size, 0); assert.equal(h.state.timers.size, 0);
  const web = harness('web'); web.read(); await web.module.registerForCustomerPushNotificationsAsync({ authToken: 'auth-a' }); await settle();
  assert.equal(web.state.permissionReads, 0); assert.equal(web.state.categories.length, 0); assert.equal(web.state.registrations.length, 0); web.unmount();
});

test('Android retains the existing backend channel and its sound behavior', async () => {
  const h = harness('android'); await h.module.prepareCustomerNotificationsAsync();
  assert.equal(h.state.channels[0][0], 'booking_updates'); assert.equal(h.state.channels[0][1].sound, undefined);
});

function deviceHarness() {
  const state = { storage: new Map(), requests: [], post: null, receipts: [] };
  const module = loadSource(source('customer-push-device.ts'), {
    './api': { API: { customerPushToken: '/push' }, requestJson: async (_path, init) => { state.requests.push(init); if (init.method === 'POST' && state.post) return state.post(); return {}; } },
    './secure-storage': { getSecureItem: async key => state.storage.get(key) ?? null, setSecureItem: async (key, value) => { state.storage.set(key, value); }, deleteSecureItem: async key => { state.storage.delete(key); } },
    './customer-notification-contract': contract,
    './customer-booking-access': { listBookingAccess: async () => state.receipts },
  }, { AbortController, setTimeout, clearTimeout, Error });
  return { state, module };
}

test('registration advertises v1; failed rotation retains previous token for safe retry', async () => {
  const h = deviceHarness(); h.state.storage.set('customer_push_device_v1', 'ExpoPushToken[previous]');
  h.state.post = async () => { throw new Error('offline'); };
  const input = { token: 'ExpoPushToken[new]', platform: 'ios', authToken: 'auth-a', scope: 0 };
  await assert.rejects(h.module.registerCustomerPushDevice(input), /offline/);
  assert.equal(h.state.storage.get('customer_push_device_v1'), 'ExpoPushToken[previous]');
  h.state.post = null; assert.equal(await h.module.registerCustomerPushDevice(input), true);
  const body = JSON.parse(h.state.requests.at(-1).body); assert.equal(body.previousToken, 'ExpoPushToken[previous]'); assert.equal(body.notificationVersion, 1);
  assert.equal(h.state.storage.get('customer_push_device_v1'), input.token);
  await h.module.registerCustomerPushDevice(input); assert.equal(h.state.requests.length, 2);
});

test('logout revokes a registration that succeeds late and stale scope never registers again', async () => {
  const h = deviceHarness(); const post = deferred(); h.state.post = () => post.promise;
  const input = { token: 'ExpoPushToken[new]', platform: 'ios', authToken: 'auth-a', scope: 0 };
  const pending = h.module.registerCustomerPushDevice(input); await settle(); const logout = h.module.detachCustomerPushDevice('auth-a');
  post.resolve({}); assert.equal(await pending, false); await logout;
  assert.equal(h.state.requests.at(-1).method, 'DELETE'); assert.equal(JSON.parse(h.state.requests.at(-1).body).token, input.token);
  assert.equal(await h.module.registerCustomerPushDevice(input), false);
});

test('guest rotation preserves previous token for every booking, including retry after an intervening transfer', async () => {
  const h = deviceHarness(); h.state.storage.set('customer_push_device_v1', 'ExpoPushToken[previous]');
  h.state.receipts = [{ refNumber: 'TYR-ONE', bookingAccessToken: 'proof-one' }, { refNumber: 'TYR-TWO', bookingAccessToken: 'proof-two' }];
  const input = { token: 'ExpoPushToken[new]', platform: 'ios', scope: 0 };
  await h.module.registerCustomerPushDevice({ ...input, ...h.state.receipts[0] });
  assert.equal(h.state.storage.get('customer_push_device_v1'), input.token);
  h.state.post = async () => { throw new Error('offline'); };
  await assert.rejects(h.module.registerCustomerPushDevice({ ...input, ...h.state.receipts[1] }), /offline/);
  h.state.post = null; await h.module.registerCustomerPushDevice({ ...input, ...h.state.receipts[1] });
  const attempts = h.state.requests.map(item => JSON.parse(item.body));
  assert.ok(attempts.every(item => item.previousToken === 'ExpoPushToken[previous]'));
  assert.equal(h.state.storage.has('customer_push_guest_rotation_v1'), false);
});

test('settings page reports device state, refreshes after Settings, and does not claim successful delivery', async () => {
  const renderer = hooks(); const listeners = new Set(); const state = { status: permission(2), requests: 0, opened: 0, enabled: 0, registered: 0, enabling: null,
    account: { token: 'auth-a', sessionRevision: 0, loading: false } };
  const node = (type, props) => ({ type, props });
  const settings = loadSource(source('customer-notification-settings.tsx'), {
    react: renderer.react, 'react/jsx-runtime': { jsx: node, jsxs: node },
    'expo-router': { useRouter: () => ({ canGoBack: () => false, replace: () => {}, back: () => {} }) },
    'react-native': { Platform: { OS: 'ios' }, ScrollView: 'ScrollView', Text: 'Text', StyleSheet: { create: value => value }, Linking: { openSettings: async () => { state.opened++; } }, AppState: { addEventListener: (_event, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } } },
    './customer-account': { useCustomerAccount: () => state.account }, './customer-notification-permissions': permissions,
    './customer-notifications': { readCustomerNotificationPermissionAsync: async () => { state.requests++; return permissions.customerNotificationPermission(state.status, 'ios'); }, requestCustomerNotificationPermissionAsync: async () => { state.enabled++; return state.enabling ? state.enabling.promise : permissions.customerNotificationPermission(permission(2), 'ios'); }, refreshCustomerPushRegistrationAsync: async () => { state.registered++; } },
    './theme': { colors: {}, spacing: {}, typography: {} }, './ui': { AppHeader: 'AppHeader', Card: 'Card', InlineNotice: 'InlineNotice', PrimaryButton: 'PrimaryButton', Row: 'Row', ScreenHeader: 'ScreenHeader', useScreenContentInsets: () => ({}) },
  });
  const read = () => renderer.render(settings.CustomerNotificationSettings);
  const all = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(all) : [tree, ...all(tree.props?.children)];
  read(); await settle(); let tree = read(); assert.match(JSON.stringify(tree), /Notifications allowed/); assert.match(JSON.stringify(tree), /latest updates in Track and Chat/);
  await all(tree).find(item => item.props?.children === 'Open phone settings').props.onPress(); assert.equal(state.opened, 1);
  state.status = permission(3); listeners.forEach(callback => callback('active')); await settle(); tree = read(); assert.match(JSON.stringify(tree), /provisional/);
  assert.equal(state.enabled, 0);
  state.status = permission(0); listeners.forEach(callback => callback('active')); await settle(); tree = read(); state.enabling = deferred();
  all(tree).find(item => item.props?.children === 'Enable notifications').props.onPress();
  state.account = { token: 'auth-b', sessionRevision: 1, loading: false }; read();
  state.enabling.resolve(permissions.customerNotificationPermission(permission(2), 'ios')); await settle();
  assert.equal(state.registered, 0, 'a permission dialog cannot register the previous account after switching');
  renderer.unmount(); assert.equal(listeners.size, 0);
});

test('approved chime is bundled unchanged as short PCM audio and the iOS entitlement is configured', () => {
  const appRoot = path.join(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo;
  const plugin = config.plugins.find(item => Array.isArray(item) && item[0] === 'expo-notifications');
  assert.ok(plugin[1].sounds.includes('./assets/sounds/tyre_rescue_chime.wav'));
  assert.equal(config.ios.entitlements['com.apple.developer.usernotifications.time-sensitive'], true);
  const wav = fs.readFileSync(path.join(appRoot, 'assets/sounds/tyre_rescue_chime.wav'));
  assert.equal(crypto.createHash('sha256').update(wav).digest('hex'), 'f131db5a38fd54a1311587754193fd55707b8566e2e99831fe0644025db55173');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  let format = null; let dataBytes = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4); const size = wav.readUInt32LE(offset + 4); const start = offset + 8;
    assert.ok(start + size <= wav.length, 'WAV chunk bounds');
    if (id === 'fmt ') format = { encoding: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2), sampleRate: wav.readUInt32LE(start + 4), byteRate: wav.readUInt32LE(start + 8), bits: wav.readUInt16LE(start + 14) };
    if (id === 'data') dataBytes += size;
    offset = start + size + (size % 2);
  }
  assert.ok(format); assert.equal(format.encoding, 1); assert.equal(format.bits, 16); assert.equal(format.channels, 1);
  assert.ok(dataBytes / format.byteRate > 0 && dataBytes / format.byteRate < 30);
});

test('badge integration waits for auth, uses authoritative counts and refreshes when a notification arrives', async () => {
  const h = harness(); h.state.account.loading = true; h.read(); await settle(); assert.equal(h.state.badgeWrites.length, 0);
  h.state.account = { ...h.state.account, loading: false }; h.read(); await settle(); assert.equal(h.state.badgeWrites.at(-1), 3);
  const before = h.state.badgeWrites.length; h.state.receivedListeners.forEach(callback => callback()); await settle(); assert.equal(h.state.badgeWrites.length, before + 1);
  h.state.scope++; h.state.account = { ...h.state.account, token: null, profile: null, bookings: [], sessionRevision: 1 }; h.read(); await settle();
  assert.equal(h.state.badgeWrites.at(-1), 0); h.unmount(); assert.equal(h.state.receivedListeners.size, 0);
});
