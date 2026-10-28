const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const message = (id, body = id) => ({ id, body, senderId: null, senderRole: 'customer', messageType: 'text', attachments: [], createdAt: `2026-10-22T12:0${id.length}:00Z` });
const detail = { id: 'conversation-a', bookingId: 'booking-a', bookingRef: 'REF-A', channel: 'customer_admin', status: 'open', locked: false };

function harness(options = {}) {
  const state = { calls: [], routes: [], timers: [], writes: 0, handlers: {}, detail: { ...detail }, initialPage: { messages: [message('initial')], nextCursor: null },
    params: { bookingId: 'booking-a', bookingAccessToken: 'proof-a', ...options.params }, account: { token: 'account-a', loading: false, sessionRevision: 1, ...options.account } };
  let rendering;
  const changed = (before, after) => !before || after.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (value) => { state.writes += 1; r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const chat = loadSource('../../tyre-rescue/src/customer-chat.ts', { './api': { fetchApi: () => { throw new Error('Unexpected real chat request'); } } }, { AbortController, setTimeout, clearTimeout });
  const routeAccess = loadSource('../../tyre-rescue/src/use-booking-param-access.ts', { react });
  const node = (type, props) => ({ type, props });
  const component = loadSource('../../tyre-rescue/app/(tabs)/chat.tsx', {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    '@react-navigation/native': { useIsFocused: () => true },
    'expo-router': { useLocalSearchParams: () => state.params, useRouter: () => ({ push: (route) => state.routes.push(route), setParams: (params) => state.routes.push({ params }) }) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Platform: { OS: 'ios' }, Linking: { openURL: async () => {} }, StyleSheet: { create: (value) => value } },
    '@/src/config': { PHONE_TEL: '000' },
    '@/src/customer-account': { useCustomerAccount: () => state.account },
    '@/src/use-booking-param-access': routeAccess,
    '@/src/customer-booking-access': { loadBookingAccess: async () => null },
    '@/src/customer-chat': { ...chat, customerChatRequest: async (path, headers, init = {}) => {
      const call = { path, headers, init }; state.calls.push(call);
      if (state.handlers[path]) return state.handlers[path](call);
      if (path.endsWith('/read')) return {};
      if (path === '/api/chat/conversations') return init.method === 'POST' ? { conversationId: detail.id } : { conversations: [state.detail] };
      if (path.includes('/messages?')) return state.initialPage;
      if (path.endsWith('/messages')) return message('sent', JSON.parse(init.body).body);
      return state.detail;
    } },
    '@/src/theme': { colors: {}, spacing: { page: 18 }, typography: {} },
    '@/src/ui': { Card: 'Card', Logo: 'Logo', PrimaryButton: 'PrimaryButton', ScreenHeader: 'ScreenHeader', useScreenContentInsets: () => ({}) },
  }, { AbortController, setInterval: (callback) => { state.timers.push(callback); return callback; }, clearInterval: () => {} });
  const outer = { hooks: [], effects: [], cursor: 0 }; rendering = outer;
  const session = component.default();
  const renderer = { hooks: [], effects: [], cursor: 0 };
  const read = () => { renderer.cursor = 0; renderer.effects = []; rendering = renderer; const tree = session.type(session.props); for (const effect of renderer.effects) effect(); return tree; };
  function nodes(value, predicate) { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap((item) => nodes(item, predicate)); return [...(predicate(value) ? [value] : []), ...nodes(value.props?.children, predicate)]; }
  const find = (predicate) => nodes(read(), predicate)[0];
  const button = (text) => find((value) => value.type === 'PrimaryButton' && value.props.children === text);
  const input = () => find((value) => value.type === 'TextInput');
  const unmount = () => { for (const hook of renderer.hooks) hook?.cleanup?.(); };
  return { state, read, find, button, input, unmount };
}

test('customer send mutex keeps draft and the same retry ID until server confirmation', async () => {
  const h = harness(); h.read(); await settle();
  h.input().props.onChangeText('Please help');
  const pending = deferred();
  h.state.handlers['/api/chat/conversations/conversation-a/messages'] = () => pending.promise;
  const send = h.button('Send'); send.props.onPress(); send.props.onPress();
  const sends = () => h.state.calls.filter((call) => call.path.endsWith('/messages'));
  assert.equal(sends().length, 1);
  const firstBody = JSON.parse(sends()[0].init.body);
  assert.equal(sends()[0].headers.Authorization, 'Bearer account-a');
  assert.equal(sends()[0].headers['X-Booking-Access'], 'proof-a');
  pending.reject(new Error('Isolated offline')); await settle();
  assert.equal(h.input().props.value, 'Please help');
  h.state.handlers['/api/chat/conversations/conversation-a/messages'] = async () => message(firstBody.clientMessageId, firstBody.body);
  h.button('Send').props.onPress(); await settle();
  assert.equal(JSON.parse(sends()[1].init.body).clientMessageId, firstBody.clientMessageId);
  assert.equal(h.input().props.value, '');
  assert.match(JSON.stringify(h.read()), /Please help/);
  h.unmount();
});

test('late history and send results cannot update a session after account or booking remount', async () => {
  for (const stage of ['history', 'send']) {
    const h = harness();
    const pending = deferred();
    if (stage === 'history') h.state.handlers['/api/chat/conversations/conversation-a/messages?limit=50'] = () => pending.promise;
    h.read(); await settle();
    if (stage === 'send') {
      h.input().props.onChangeText('Private old booking');
      h.state.handlers['/api/chat/conversations/conversation-a/messages'] = () => pending.promise;
      h.button('Send').props.onPress();
    }
    const active = h.state.calls.at(-1).init.signal;
    h.unmount();
    const writes = h.state.writes;
    assert.equal(active.aborted, true);
    pending.resolve(stage === 'history' ? { messages: [message('late-private')], nextCursor: null } : message('late-private'));
    await settle();
    assert.equal(h.state.writes, writes);
  }
});

test('a locked conversation remains readable and has no editable composer', async () => {
  const h = harness(); h.state.detail.locked = true;
  h.read(); await settle();
  assert.equal(h.input(), undefined);
  assert.equal(h.button('Send'), undefined);
  assert.match(JSON.stringify(h.read()), /initial/);
  assert.match(JSON.stringify(h.read()), /locked/);
  h.unmount();
});

test('background polling preserves the oldest pagination cursor already reached', async () => {
  const h = harness(); h.state.initialPage.nextCursor = 'older-1';
  h.state.handlers['/api/chat/conversations/conversation-a/messages?limit=50&cursor=older-1'] = async () => ({ messages: [message('older')], nextCursor: 'older-0' });
  h.read(); await settle(); h.read();
  h.button('Load older messages').props.onPress(); await settle(); h.read();
  h.state.timers.at(-1)(); await settle(); h.read();
  h.button('Load older messages').props.onPress(); await settle();
  assert.ok(h.state.calls.some((call) => call.path.endsWith('cursor=older-0')));
  assert.equal(h.state.calls.filter((call) => call.path.endsWith('cursor=older-1')).length, 1);
  h.unmount();
});

test('a driver notification opens readable driver messages and replies in that same conversation', async () => {
  const h = harness({ params: { conversationId: detail.id } });
  h.state.detail.channel = 'customer_driver';
  h.state.initialPage.messages = [{ ...message('driver-arriving', 'I am outside'), senderRole: 'driver' }];
  h.read(); await settle();
  assert.equal(h.input().props.accessibilityLabel, 'Message to your driver');
  assert.match(JSON.stringify(h.read()), /I am outside/);
  assert.equal(h.find((node) => node.type === 'ScreenHeader').props.title, 'Chat with your driver');
  h.input().props.onChangeText('Coming now'); h.button('Send').props.onPress(); await settle();
  assert.equal(JSON.parse(h.state.calls.find((call) => call.path.endsWith('/messages')).init.body).body, 'Coming now');
  assert.equal(h.state.calls.some((call) => call.path === '/api/chat/conversations'), false);
  h.unmount();
});

test('customer list includes both support and driver chats with distinct labels, excluding staff threads', async () => {
  const h = harness({ params: { bookingId: undefined, bookingAccessToken: undefined } });
  h.state.handlers['/api/chat/conversations'] = async () => ({ conversations: [
    { ...detail, id: 'support' }, { ...detail, id: 'driver', channel: 'customer_driver', unreadCount: 2 },
    { ...detail, id: 'staff', channel: 'admin_driver', lastMessageBody: 'Hidden staff content' },
  ] });
  h.read(); await settle();
  assert.ok(h.find((node) => node.props?.accessibilityLabel === 'Open support chat for REF-A'));
  const driver = h.find((node) => node.props?.accessibilityLabel === 'Open driver chat for REF-A, 2 unread');
  assert.ok(driver); driver.props.onPress();
  assert.deepEqual({ ...h.state.routes.at(-1).params }, { conversationId: 'driver', channel: 'customer_driver', refNumber: 'REF-A' });
  assert.doesNotMatch(JSON.stringify(h.read()), /Hidden staff content/);
  assert.equal(h.state.calls.some((call) => call.path.includes('channel=customer_admin')), false);
  h.unmount();
});

test('guest booking can select its driver channel while support remains a separate session', async () => {
  const h = harness({ params: { channel: 'customer_driver' }, account: { token: null } });
  h.state.detail.channel = 'customer_driver';
  h.read(); await settle();
  const create = h.state.calls.find((call) => call.path === '/api/chat/conversations');
  assert.deepEqual(JSON.parse(create.init.body), { bookingId: 'booking-a', channel: 'customer_driver' });
  assert.equal(create.headers['X-Booking-Access'], 'proof-a');
  h.find((node) => node.props?.accessibilityLabel === 'Support chat').props.onPress();
  assert.deepEqual({ ...h.state.routes.at(-1).params }, { bookingId: 'booking-a', conversationId: undefined, channel: 'customer_admin', refNumber: 'REF-A' });
  h.unmount();
});

test('customer UI refuses a staff-only conversation even if a malformed response contains it', async () => {
  const h = harness({ params: { conversationId: detail.id } });
  h.state.detail.channel = 'admin_driver';
  h.state.initialPage.messages = [message('staff-secret')];
  h.read(); await settle();
  assert.equal(h.input(), undefined);
  assert.match(JSON.stringify(h.read()), /not available to customers/);
  assert.doesNotMatch(JSON.stringify(h.read()), /staff-secret/);
  h.unmount();
});
