const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const content = { status: 'en_route', driverName: 'Test', estimatedArrivalAt: 200, updatedAt: 100, staleAt: 190 };
function managerHarness() {
  const state = { supported: true, items: [], starts: [], ends: [], requests: [], storage: new Map(), listeners: new Set(), sequence: 0, post: null, remove: null, nativeStart: null, auth: { token: 'account-a', access: null } };
  const native = {
    isSupported: async () => state.supported,
    getActivities: async () => state.items.map(item => ({ ...item })),
    startOrUpdate: async (refNumber, next) => {
      state.starts.push({ refNumber, state: next });
      if (state.nativeStart) await state.nativeStart();
      if (!state.items.some(item => item.refNumber === refNumber)) state.items.push({ refNumber, activityId: `activity-${++state.sequence}`, pushToken: `token-${state.sequence}`, environment: 'production' });
    },
    end: async refNumber => { state.ends.push(refNumber); state.items = state.items.filter(item => item.refNumber !== refNumber); },
    endAll: async () => { state.ends.push('*'); state.items = []; },
    addPushTokenListener: listener => { state.listeners.add(listener); return { remove: () => state.listeners.delete(listener) }; },
  };
  const api = loadSource('../../tyre-rescue/src/customer-live-activity.ts', {
    '../modules/customer-live-activity': { default: native },
    './api': { requestJson: async (path, init) => {
      state.requests.push({ path, init });
      if (init?.method === 'POST') return state.post ? state.post(init) : { success: true };
      if (init?.method === 'DELETE') return state.remove ? state.remove(init) : { success: true };
      return { available: true };
    } },
    './secure-storage': { getSecureItem: async key => state.storage.get(key) ?? null, setSecureItem: async (key, value) => { state.storage.set(key, value); }, deleteSecureItem: async key => { state.storage.delete(key); } },
  }, { Error, Promise, Map, Set });
  api.setLiveActivityAuthResolver(async () => state.auth);
  const token = item => { for (const listener of state.listeners) listener({ ...item }); };
  return { state, api, token, posts: () => state.requests.filter(item => item.init?.method === 'POST'), deletes: () => state.requests.filter(item => item.init?.method === 'DELETE') };
}

test('logout during a pending native start cannot register or revive the activity', async () => {
  const h = managerHarness(); const nativeStart = deferred(); h.state.nativeStart = () => nativeStart.promise;
  const start = h.api.startCustomerLiveActivity('TR-ONE', content); await settle();
  const clear = h.api.clearCustomerLiveActivities(); h.state.auth = { token: null, access: null };
  nativeStart.resolve(); await Promise.all([start, clear]);
  assert.equal(h.state.items.length, 0); assert.equal(h.posts().length, 0);
  assert.equal(await h.api.customerLiveActivityStatus('TR-ONE'), 'inactive');
});

test('logout during server registration revokes the late token before a replacement session can start', async () => {
  const h = managerHarness(); const request = deferred(); h.state.post = () => request.promise;
  const first = h.api.startCustomerLiveActivity('TR-ONE', content); await settle();
  assert.equal(h.posts().length, 1);
  const clear = h.api.clearCustomerLiveActivities(); h.state.auth = { token: 'account-b', access: null };
  h.state.post = null;
  const next = h.api.startCustomerLiveActivity('TR-TWO', content);
  request.resolve({ success: true }); await Promise.all([first, clear, next]);
  assert.deepEqual(h.state.items.map(item => item.refNumber), ['TR-TWO']);
  assert.ok(h.deletes().some(item => JSON.parse(item.init.body).pushToken === 'token-1'));
  assert.equal(h.posts().at(-1).init.headers.Authorization, 'Bearer account-b');
});

test('a registration timeout revokes possibly committed tokens and preserves offline cleanup for the next resume', async () => {
  const h = managerHarness(); h.state.post = async () => { throw new Error('Request timed out'); };
  h.state.remove = async () => { throw new Error('Offline'); };
  await assert.rejects(h.api.startCustomerLiveActivity('TR-ONE', content), /timed out/);
  assert.equal(h.state.items.length, 0); assert.equal(h.deletes().length, 1);
  assert.match([...h.state.storage.values()].join(''), /token-1/);
  h.state.remove = null; await h.api.resumeCustomerLiveActivities();
  assert.equal(h.deletes().length, 2); assert.equal(h.state.storage.size, 0);
});

test('token rotations register once each and delayed events cannot register retired activities or older tokens', async () => {
  const h = managerHarness(); const listener = h.api.listenForCustomerLiveActivityTokens();
  await h.api.startCustomerLiveActivity('TR-ONE', content);
  const original = { ...h.state.items[0] };
  h.state.items[0].pushToken = 'rotated-token'; h.token(h.state.items[0]); h.token(h.state.items[0]); await settle();
  assert.equal(h.posts().length, 2); assert.equal(JSON.parse(h.posts()[1].init.body).pushToken, 'rotated-token');
  h.token(original); await settle(); assert.equal(h.posts().length, 2);
  const retired = { ...h.state.items[0] };
  await h.api.stopCustomerLiveActivity('TR-ONE'); await h.api.startCustomerLiveActivity('TR-ONE', content);
  h.token(retired); await settle();
  assert.equal(h.posts().length, 3); assert.equal(JSON.parse(h.posts().at(-1).init.body).activityId, 'activity-2');
  assert.ok(h.deletes().some(item => JSON.parse(item.init.body).pushToken === 'rotated-token')); listener.remove();
});

test('stopping wins over queued refresh and foreground resume; a fresh explicit start still works', async () => {
  const h = managerHarness(); await h.api.startCustomerLiveActivity('TR-ONE', content);
  const refresh = h.api.updateCustomerLiveActivity('TR-ONE', content);
  const resume = h.api.resumeCustomerLiveActivities();
  const stop = h.api.stopCustomerLiveActivity('TR-ONE');
  await Promise.all([refresh, resume, stop]);
  assert.equal(h.state.items.length, 0); assert.equal(h.posts().length, 1);
  await h.api.updateCustomerLiveActivity('TR-ONE', content); assert.equal(h.state.items.length, 0);
  await h.api.startCustomerLiveActivity('TR-ONE', content); assert.equal(h.posts().length, 2);
});

test('unavailable permission and non-journey states never start an activity', async () => {
  const h = managerHarness(); h.state.supported = false;
  assert.equal(await h.api.customerLiveActivityAvailable(), false); assert.equal(h.state.requests.length, 0);
  await assert.rejects(h.api.startCustomerLiveActivity('TR-ONE', content), /Settings/);
  for (const status of ['paid', 'driver_assigned', 'arrived', 'completed']) {
    await assert.rejects(h.api.startCustomerLiveActivity('TR-ONE', { ...content, status }), /on the way/);
  }
  assert.equal(h.state.starts.length, 0); assert.equal(h.posts().length, 0);
});

test('missing push token stays pending until a token is registered; terminal status ends and revokes it', async () => {
  const h = managerHarness(); const listener = h.api.listenForCustomerLiveActivityTokens();
  h.state.nativeStart = async () => { h.state.items = [{ refNumber: 'TR-ONE', activityId: 'pending-activity', pushToken: null, environment: 'production' }]; };
  await h.api.startCustomerLiveActivity('TR-ONE', content);
  assert.equal(await h.api.customerLiveActivityStatus('TR-ONE'), 'pending'); assert.equal(h.posts().length, 0);
  h.state.items[0].pushToken = 'available-token'; h.token(h.state.items[0]); await settle();
  assert.equal(await h.api.customerLiveActivityStatus('TR-ONE'), 'active'); assert.equal(h.posts().length, 1);
  await h.api.updateCustomerLiveActivity('TR-ONE', { ...content, status: 'completed' });
  assert.equal(h.state.items.length, 0); assert.equal(h.deletes().length, 1); listener.remove();
});

function controlHarness() {
  const state = { phase: 'inactive', supported: true, starts: 0, stops: 0, writes: 0, start: null, availability: null, listeners: new Set(), foreground: new Set() };
  const hooks = []; let cursor = 0; let effects = [];
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: initial }; return [hooks[index].value, value => { state.writes++; hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) { const index = cursor++; if (!hooks[index] || deps.some((value, i) => value !== hooks[index].deps[i])) effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const jsx = (type, props) => ({ type, props });
  const { CustomerLiveActivityControl } = loadSource('../../tyre-rescue/src/customer-live-activity-ui.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener: (_event, listener) => { state.foreground.add(listener); return { remove: () => state.foreground.delete(listener) }; } } },
    './customer-account': {}, './customer-booking-access': {}, './customer-live-activity-state': { liveRescueContent: () => content },
    './customer-live-activity': {
      customerLiveActivityAvailable: async () => { if (state.availability) return state.availability(); if (state.supported instanceof Error) throw state.supported; return state.supported; },
      customerLiveActivityStatus: async () => state.phase,
      listenForCustomerLiveActivityChanges: listener => { state.listeners.add(listener); return { remove: () => state.listeners.delete(listener) }; },
      updateCustomerLiveActivity: async () => {},
      startCustomerLiveActivity: async () => { state.starts++; if (state.start) await state.start(); state.phase = 'pending'; },
      stopCustomerLiveActivity: async () => { state.stops++; state.phase = 'inactive'; },
    }, './ui': { InlineNotice: 'InlineNotice', PrimaryButton: 'PrimaryButton' },
  }, { Error });
  const tracking = { ...content, etaMinutes: 2, driverLocationAt: new Date().toISOString(), canChat: true };
  function read() { cursor = 0; effects = []; const tree = CustomerLiveActivityControl({ refNumber: 'TR-ONE', tracking, receivedAt: 100 }); effects.forEach(effect => effect()); return tree; }
  const button = () => read()?.props.children.find(node => node?.type === 'PrimaryButton');
  return { state, read, button, tracking, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

test('control prevents repeated starts, shows pending token state and responds to registration changes', async () => {
  const h = controlHarness(); h.read(); await settle();
  const pending = deferred(); h.state.start = () => pending.promise;
  const action = h.button().props.onPress; action(); action(); assert.equal(h.state.starts, 1);
  assert.equal(h.button().props.loading, true); pending.resolve(); await settle();
  assert.match(JSON.stringify(h.read()), /Connecting Lock Screen updates/);
  h.state.phase = 'active'; h.state.listeners.forEach(listener => listener()); await settle();
  assert.doesNotMatch(JSON.stringify(h.read()), /Connecting Lock Screen updates/);
  assert.equal(h.button().props.children, 'Stop Lock Screen updates'); h.unmount();
});

test('control keeps stop available offline and ignores a late start result after unmount', async () => {
  const h = controlHarness(); h.state.phase = 'active'; h.state.supported = new Error('offline'); h.read(); await settle();
  assert.equal(h.button().props.children, 'Stop Lock Screen updates'); h.button().props.onPress(); await settle(); assert.equal(h.state.stops, 1); h.unmount();
  const next = controlHarness(); next.read(); await settle(); const pending = deferred(); next.state.start = () => pending.promise;
  next.button().props.onPress(); next.unmount(); const before = next.state.writes;
  pending.resolve(); await settle(); assert.equal(next.state.writes, before); assert.equal(next.state.listeners.size, 0);
});

test('an early native status update cannot discard a slower availability check', async () => {
  const h = controlHarness(); const available = deferred(); h.state.availability = () => available.promise;
  h.read(); await settle(); h.state.listeners.forEach(listener => listener()); await settle();
  assert.equal(h.button(), undefined); available.resolve(true); await settle();
  assert.equal(h.button().props.children, 'Follow on Lock Screen'); h.unmount();
});

test('content suppresses arrival estimates before/after travel and when driver location is stale', () => {
  const tracking = loadSource('../../tyre-rescue/src/tracking-state.ts', {});
  const { liveRescueContent } = loadSource('../../tyre-rescue/src/customer-live-activity-state.ts', { './tracking-state': tracking });
  const now = Date.parse('2026-10-31T12:00:00Z');
  const input = { status: 'en_route', driverName: ' Test Driver ', driverLocationAt: new Date(now - 1000).toISOString(), etaMinutes: 5 };
  assert.equal(liveRescueContent(input, now, now).driverName, 'Test');
  assert.equal(liveRescueContent(input, now, now).estimatedArrivalAt, (now + 5 * 60_000) / 1000);
  for (const status of ['paid', 'driver_assigned', 'arrived', 'in_progress', 'completed']) assert.equal(liveRescueContent({ ...input, status }, now, now).estimatedArrivalAt, null);
  assert.equal(liveRescueContent({ ...input, driverLocationAt: new Date(now - 181_000).toISOString() }, now, now).estimatedArrivalAt, null);
});
