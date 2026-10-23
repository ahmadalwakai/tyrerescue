const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const message = (id, body = id) => ({ id, body, senderId: null, senderRole: 'customer', messageType: 'text', attachments: [], createdAt: `2026-10-22T12:0${id.length}:00Z` });
const detail = { id: 'conversation-a', bookingId: 'booking-a', bookingRef: 'REF-A', channel: 'customer_admin', status: 'open', locked: false };

function harness() {
  const state = { calls: [], timers: [], writes: 0, handlers: {}, detail: { ...detail }, initialPage: { messages: [message('initial')], nextCursor: null } };
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
    'expo-router': { useLocalSearchParams: () => ({ bookingId: 'booking-a', bookingAccessToken: 'proof-a' }), useRouter: () => ({ push: () => {}, setParams: () => {} }) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', Platform: { OS: 'ios' }, Linking: { openURL: async () => {} }, StyleSheet: { create: (value) => value } },
    '@/src/config': { PHONE_TEL: '000' },
    '@/src/customer-account': { useCustomerAccount: () => ({ token: 'account-a', loading: false, sessionRevision: 1 }) },
    '@/src/use-booking-param-access': routeAccess,
    '@/src/customer-booking-access': { loadBookingAccess: async () => null },
    '@/src/customer-chat': { ...chat, customerChatRequest: async (path, headers, init = {}) => {
      const call = { path, headers, init }; state.calls.push(call);
      if (state.handlers[path]) return state.handlers[path](call);
      if (path.endsWith('/read')) return {};
      if (path === '/api/chat/conversations') return { conversationId: detail.id };
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
