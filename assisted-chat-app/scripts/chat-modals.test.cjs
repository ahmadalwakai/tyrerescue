const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const src = path.join(__dirname, '../src');
function loadSource(relative, dependencies, globals = {}) {
  const filename = path.join(src, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URLSearchParams, Date, ...globals }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 6; i += 1) await tick(); }
const theme = loadSource('components/theme.ts', {});
const display = loadSource('lib/chat-message-display.ts', {});
const conversation = (id, ref = 'TYR-2026-66285') => ({ id, bookingId: `booking-${id}`, bookingRef: ref, channel: 'admin_driver', status: 'open', locked: false, muted: false, customerName: 'Fixture customer', driverName: 'Hassan', driverId: 'driver-no-job', unreadCount: 0, createdAt: '2026-10-22T12:00:00Z' });
const message = (id, body = id, role = 'driver') => ({ id, body, senderId: role, senderName: role, senderRole: role, messageType: 'text', deliveryStatus: 'sent', attachments: [], createdAt: '2026-10-22T12:01:00Z' });
function createChatHarness(kind = 'hub') {
  const state = { visible: true, revision: 1, apiRevision: 1, token: 'fake-session-for-isolated-test', entryMode: 'drivers', bookingId: 'booking-one', bookingRef: 'TYR-2026-66285', gets: [], posts: [], uploads: [], observed: [], sounds: 0, closes: 0, timers: [], conversations: [conversation('one'), conversation('two')], handlers: {}, picker: null, upload: null };
  let rendering;
  const changed = (before, next) => !before || next.some((item, index) => item !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (value) => { r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { current: initial }; return r.hooks[index]; },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
    useLayoutEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.layoutEffects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const node = (type, props) => ({ type, props });
  const sounds = { observeMessages: (messages, id) => { state.observed.push({ messages, id }); }, playSent: () => { state.sounds += 1; } };
  state.recordingState = { phase: 'idle', durationMillis: 0 };
  state.voiceUploads = [];
  state.voiceCancels = 0;
  const voice = {
    get state() { return state.recordingState; },
    start: async () => { state.recordingState = { phase: 'recording', durationMillis: 1500 }; },
    finish: async () => { state.recordingState = { phase: 'ready', durationMillis: 1500 }; return 'file:///isolated-voice.m4a'; },
    cancel: async () => { state.voiceCancels += 1; state.recordingState = { phase: 'idle', durationMillis: 0 }; },
    getState: () => state.recordingState,
  };
  const api = {
    get: async (url) => { state.gets.push(url); if (state.handlers[url]) return state.handlers[url](); if (url.includes('/messages?')) return { messages: [message(`initial-${url.split('/')[4]}`)], nextCursor: null }; if (url.includes('/conversations?')) return { conversations: state.conversations }; return { status: 'open', locked: false }; },
    post: async (url, body) => { state.posts.push({ url, body }); if (state.handlers[url]) return state.handlers[url](body); if (url.endsWith('/direct-driver')) return { conversationId: 'direct-one', driverName: 'Hassan', scope: 'direct_driver' }; if (url === '/api/chat/conversations') return { conversationId: 'one' }; if (url.endsWith('/messages')) return message('confirmed-send', body?.body ?? 'photo', 'admin'); return {}; },
    patch: async (url, body) => { if (state.handlers[url]) return state.handlers[url](body); return message('updated'); },
  };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value) => value }, Platform: { OS: 'ios' }, AppState: { currentState: 'active' } },
    'expo-image-picker': { requestMediaLibraryPermissionsAsync: async () => ({ granted: true }), launchImageLibraryAsync: async () => state.picker ? state.picker.promise : ({ canceled: true }), requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: async () => ({ canceled: true }), CameraType: { back: 'back' } },
    '@/hooks/useChatVoiceRecorder': { useChatVoiceRecorder: () => voice },
    '@/lib/api': { api, ApiError: class ApiError extends Error { constructor(message, status, details) { super(message); this.status = status; this.details = details; } }, getAdminToken: () => state.token, getApiContextRevision: () => state.apiRevision },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => state.revision },
    '@/hooks/useChatSounds': { useChatSounds: () => sounds },
    '@/lib/chat-message-display': display,
    '@/hooks/useDriverList': { useDriverList: () => ({ drivers: [{ id: 'driver-no-job', name: 'Hassan', phone: '+44 7700 900123', isOnline: false }], loading: false, error: null, reload: () => {} }) },
    '@/lib/chat-attachments': { uploadChatImageAttachment: async (asset) => { state.uploads.push(asset); return state.upload ? state.upload.promise : ({ url: 'https://example.invalid/photo.jpg', mimeType: 'image/jpeg' }); }, uploadChatVoiceAttachment: async (uri) => { state.voiceUploads.push(uri); return state.voiceUpload ? state.voiceUpload.promise : { url: 'https://example.invalid/voice.m4a', mimeType: 'audio/mp4', fileSize: 1234 }; } },
    '@/lib/chat-download': { saveChatAttachmentToDevice: async () => {} },
    './ui': { AppButton: 'AppButton', StatusBanner: 'StatusBanner' }, './theme': theme,
    './chat/ChatScreenLayout': { ChatScreenLayout: 'ChatScreenLayout', useChatBottomPadding: () => 34 },
    './chat/ChatBookingContext': { ChatBookingContext: 'ChatBookingContext' },
    // Each enabled poll registers a manual tick, like the setInterval stub above.
    '@/hooks/usePolling': { usePolling: (task, options) => { react.useEffect(() => { if (!options.enabled) return undefined; if (options.immediate !== false) void task(); state.timers.push(() => task()); return undefined; }, [task, options.enabled, options.key]); return async () => task(); } },
    '@/lib/chat-sync': loadSource('lib/chat-sync.ts', {}),
    './ChatComposerIconButton': { ChatComposerIconButton: 'ChatComposerIconButton' }, './ChatImageBubble': { ChatImageBubble: 'ChatImageBubble', ChatPhotoPreview: 'ChatPhotoPreview' }, './VoiceMessageBubble': { VoiceMessageBubble: 'VoiceMessageBubble' },
  };
  const component = loadSource(`components/${kind === 'hub' ? 'ChatHubModal' : 'DriverChatModal'}.tsx`, dependencies, { setInterval: (fn) => { state.timers.push(fn); return fn; }, clearInterval: () => {}, setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {} });
  const renderer = { hooks: [], effects: [], layoutEffects: [], cursor: 0 };
  function read() { renderer.cursor = 0; renderer.effects = []; renderer.layoutEffects = []; rendering = renderer; const tree = kind === 'hub' ? component.ChatHubModal({ visible: state.visible, initialConversationId: state.initialConversationId, entryMode: state.entryMode, onClose: () => { state.closes += 1; } }) : component.DriverChatModal({ visible: state.visible, bookingId: state.bookingId, bookingRef: state.bookingRef, onClose: () => { state.closes += 1; } }); for (const effect of renderer.layoutEffects) effect(); for (const effect of renderer.effects) effect(); return tree; }
  function findNodes(predicate, tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap((child) => findNodes(predicate, child)); const matches = predicate(tree) ? [tree] : []; if (typeof tree.type === 'function') return matches.concat(findNodes(predicate, tree.type(tree.props))); return matches.concat(findNodes(predicate, tree.props?.children)); }
  const find = (predicate) => findNodes(predicate, read())[0];
  function press(label) { const target = find((value) => value.props?.accessibilityLabel === label || value.props?.label === label); assert.ok(target, `Missing ${label}`); target.props.onPress(); return target; }
  const select = (id) => { const card = find((value) => value.type === 'Pressable' && value.props?.children?.some?.((row) => JSON.stringify(row)?.includes(state.conversations.find((item) => item.id === id).bookingRef))); if (card) card.props.onPress(); else throw new Error(`Missing conversation ${id}`); };
  return { state, read, find, findNodes, press, select, unmount: () => { for (const hook of renderer.hooks) hook?.cleanup?.(); }, api, renderer, dependencies };
}
if (require.main === module) {
 test('retained hub clears the previous workspace room without closing its native host', async () => {
  const h = createChatHarness(); h.read(); await settle(); h.press('Chat with Hassan'); await settle();
  assert.match(JSON.stringify(h.read()), /initial-direct-one/);
  h.state.apiRevision += 1; h.state.conversations = []; h.read(); await settle();
  assert.doesNotMatch(JSON.stringify(h.read()), /initial-direct-one/);
  assert.equal(h.find((node) => node.type === 'ChatScreenLayout').props.onBack, undefined);
  assert.equal(h.find((node) => node.type === 'Modal').props.visible, true);
  h.unmount();
 });
 test('RTL display isolates references and phone numbers without changing stored message text', () => { const original = '\u0627\u0644\u0633\u0627\u0626\u0642 #TYR-2026-66285 +44 7700 900123'; const shown = display.chatMessageDisplayText(original); assert.ok(shown.includes('\u2066#TYR-2026-66285\u2069')); assert.ok(shown.includes('\u2066+44 7700 900123\u2069')); assert.equal(shown.replace(/[\u2066\u2069]/g, ''), original); assert.equal(display.chatMessageDisplayText('Booking #TYR-2026-66285'), 'Booking #TYR-2026-66285'); });
 test('driver picker searches names and formatted phone numbers locally without leaking them into booking-ref queries', async () => { const h = createChatHarness(); h.read(); await settle(); const search = h.find((node) => node.type === 'TextInput' && node.props.placeholder === 'Search driver name or phone...'); search.props.onChangeText('7700900'); h.read(); await settle(); assert.ok(h.find((node) => node.props.accessibilityLabel === 'Chat with Hassan')); assert.ok(h.state.gets.every((url) => !url.includes('bookingRef='))); h.find((node) => node.type === 'TextInput' && node.props.placeholder === 'Search driver name or phone...').props.onChangeText('no-match'); assert.equal(h.find((node) => node.props.accessibilityLabel === 'Chat with Hassan'), undefined); h.unmount(); });
 test('old server direct-chat errors explain required update and never fall back to booking-bound chat', async () => { const h = createChatHarness(); h.read(); await settle(); h.state.handlers['/api/chat/conversations/direct-driver'] = async () => { throw new h.dependencies['@/lib/api'].ApiError('Missing route', 404); }; h.press('Chat with Hassan'); await settle(); const banner = h.find((node) => node.type === 'StatusBanner'); assert.match(banner.props.message, /needs a server update/); assert.equal(h.state.posts.filter((call) => call.url === '/api/chat/conversations').length, 0); h.unmount(); });
 test('one driver tap opens a direct conversation even without a booking, and double taps create once', async () => { const h = createChatHarness(); h.read(); await settle(); const button = h.press('Chat with Hassan'); button.props.onPress(); await settle(); const calls = h.state.posts.filter((call) => call.url.endsWith('/direct-driver')); assert.equal(calls.length, 1); assert.equal(calls[0].body.driverId, 'driver-no-job'); assert.equal(calls[0].body.bookingId, undefined); const shell = h.find((node) => node.type === 'ChatScreenLayout'); assert.equal(shell.props.title, 'Hassan'); assert.equal(shell.props.reference, null); h.unmount(); });
 test('chat keeps the entire booking reference in a separate selectable header row and uses full width input', async () => { const h = createChatHarness('driver'); h.read(); await settle(); const shell = h.find((node) => node.type === 'ChatScreenLayout'); assert.equal(shell.props.reference, '#TYR-2026-66285'); const input = h.find((node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Message text'); assert.equal(input.props.style.width, '100%'); assert.equal(input.props.style.writingDirection, 'auto'); assert.equal(input.props.maxLength, 5000); const mic = h.find((node) => node.props.label === 'Record voice message'); assert.equal(mic.props.disabled, false); h.unmount(); });
 for (const kind of ['hub', 'driver']) {
  test(`${kind}: record, cancel and send use the current conversation and wait for confirmation before sound`, async () => {
    const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); }
    h.press('Record voice message'); await settle(); assert.equal(h.state.recordingState.phase, 'recording');
    h.press('Cancel'); await settle(); assert.equal(h.state.voiceUploads.length, 0); assert.equal(h.state.recordingState.phase, 'idle');
    h.press('Record voice message'); await settle(); const id = kind === 'hub' ? 'direct-one' : 'one'; const pending = deferred();
    h.state.handlers[`/api/chat/conversations/${id}/messages`] = () => pending.promise;
    const send = h.press('Send voice'); send.props.onPress(); await settle();
    assert.equal(h.state.voiceUploads.length, 1); assert.equal(h.state.posts.filter((call) => call.body?.messageType === 'audio').length, 1); assert.equal(h.state.sounds, 0);
    pending.resolve(message('confirmed-voice', null, 'admin')); await settle(); assert.equal(h.state.sounds, 1); assert.equal(h.state.recordingState.phase, 'idle'); h.unmount();
  });
  test(`${kind}: failed voice upload keeps recording ready for retry without starting another recording`, async () => {
    const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); }
    h.press('Record voice message'); await settle(); h.state.voiceUpload = deferred(); h.press('Send voice'); h.state.voiceUpload.reject(new Error('Isolated offline upload')); await settle();
    assert.equal(h.state.recordingState.phase, 'ready'); assert.equal(h.state.sounds, 0); assert.equal(h.state.posts.filter((call) => call.body?.messageType === 'audio').length, 0);
    h.state.voiceUpload = null; h.press('Send voice'); await settle(); assert.equal(h.state.posts.filter((call) => call.body?.messageType === 'audio').length, 1); assert.equal(h.state.sounds, 1); h.unmount();
  });
  test(`${kind}: late voice upload cannot send after closing, changing project or cancelling for background`, async () => {
    for (const cause of ['close', 'project', 'background']) {
      const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); }
      h.press('Record voice message'); await settle(); h.state.voiceUpload = deferred(); h.press('Send voice'); await settle();
      if (cause === 'close') h.find((node) => node.type === 'ChatScreenLayout').props.onClose();
      if (cause === 'project') h.state.apiRevision += 1;
      if (cause === 'background') h.state.recordingState = { phase: 'idle', durationMillis: 0 };
      h.state.voiceUpload.resolve({ url: 'https://example.invalid/voice.m4a', mimeType: 'audio/mp4', fileSize: 1234 }); await settle();
      assert.equal(h.state.posts.filter((call) => call.body?.messageType === 'audio').length, 0); assert.equal(h.state.sounds, 0); h.unmount();
    }
  });
  test(`${kind}: send mutex prevents duplicate requests and plays sound only after server confirmation`, async () => { const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); } h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('Hello'); const id = kind === 'hub' ? 'direct-one' : 'one'; const pending = deferred(); h.state.handlers[`/api/chat/conversations/${id}/messages`] = () => pending.promise; const send = h.press('Send'); send.props.onPress(); assert.equal(h.state.posts.filter((call) => call.url === `/api/chat/conversations/${id}/messages`).length, 1); assert.equal(h.state.sounds, 0); pending.resolve(message('new-confirmed', 'Hello', 'admin')); await settle(); assert.equal(h.state.sounds, 1); assert.match(JSON.stringify(h.read()), /Hello/); h.unmount(); });
  test(`${kind}: pending send cannot modify another booking or closed conversation`, async () => { const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); } h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('Old room'); const id = kind === 'hub' ? 'direct-one' : 'one'; const pending = deferred(); h.state.handlers[`/api/chat/conversations/${id}/messages`] = () => pending.promise; h.press('Send'); if (kind === 'hub') h.find((node) => node.type === 'ChatScreenLayout').props.onBack(); else { h.state.bookingId = 'another-booking'; h.read(); } pending.resolve(message('stale-send-leak', 'Old room', 'admin')); await settle(); assert.doesNotMatch(JSON.stringify(h.read()), /stale-send-leak/); assert.equal(h.state.sounds, 0); h.unmount(); });
  test(`${kind}: photo picker returning after closure cannot upload or send to a different conversation`, async () => { const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); } h.state.picker = deferred(); h.press('Send image'); await settle(); h.state.visible = false; h.read(); h.state.picker.resolve({ canceled: false, assets: [{ uri: 'file:///test-only.jpg' }] }); await settle(); assert.equal(h.state.uploads.length, 0); assert.equal(h.state.posts.filter((call) => call.body?.messageType === 'image').length, 0); h.unmount(); });
  test(`${kind}: late polling result after closure or project switch neither renders nor marks messages read`, async () => { const h = createChatHarness(kind); h.read(); await settle(); if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); } const id = kind === 'hub' ? 'direct-one' : 'one'; const pending = deferred(); h.state.handlers[`/api/chat/conversations/${id}/messages?limit=${kind === 'hub' ? 60 : 50}`] = () => pending.promise; h.read(); h.state.timers.at(-1)(); await settle(); const before = h.state.posts.filter((call) => call.url.endsWith('/read')).length; h.state.apiRevision += 1; h.state.visible = false; h.read(); pending.resolve({ messages: [message('private-late-poll')], nextCursor: null }); await settle(); assert.doesNotMatch(JSON.stringify(h.read()), /private-late-poll/); assert.equal(h.state.posts.filter((call) => call.url.endsWith('/read')).length, before); h.unmount(); });
 }
 test('direct conversation creation from a previous account cannot open in a later account', async () => { const h = createChatHarness(); h.read(); await settle(); const pending = deferred(); h.state.handlers['/api/chat/conversations/direct-driver'] = () => pending.promise; h.press('Chat with Hassan'); h.state.revision += 1; h.state.token = 'another-test-only-session'; pending.resolve({ conversationId: 'private-old-account' }); await settle(); assert.doesNotMatch(JSON.stringify(h.read()), /private-old-account/); assert.equal(h.find((node) => node.type === 'ChatScreenLayout').props.onBack, undefined); h.unmount(); });
 test('hub: a failed text send stays visible and its retry reuses the client ID, so it is stored once', async () => {
  const h = createChatHarness('hub'); h.read(); await settle();
  h.press('Chat with Hassan'); await settle();
  const url = '/api/chat/conversations/direct-one/messages';
  let attempts = 0;
  h.state.handlers[url] = (body) => { attempts += 1; if (attempts === 1) throw new Error('Request timed out.'); return { ...message(body.clientMessageId, body.body, 'admin') }; };
  h.find((node) => node.props?.accessibilityLabel === 'Message text').props.onChangeText('Where are you?');
  h.press('Send'); await settle();
  const first = h.state.posts.filter((call) => call.url === url);
  assert.equal(first.length, 1);
  const clientMessageId = first[0].body.clientMessageId;
  assert.match(clientMessageId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(JSON.stringify(h.read()), /Not sent/);
  h.press('Message not sent. Double tap to try again.'); await settle();
  const all = h.state.posts.filter((call) => call.url === url);
  assert.equal(all.length, 2);
  assert.equal(all[1].body.clientMessageId, clientMessageId);
  const tree = JSON.stringify(h.read());
  assert.doesNotMatch(tree, /Not sent/);
  assert.equal((tree.match(/Where are you?/g) ?? []).length, 1);
  const marker = h.state.posts.filter((call) => call.url.endsWith('/read')).at(-1);
  assert.equal(marker.body.lastReadMessageId, clientMessageId);
  h.unmount();
 });
 test('hub: staff close and reopen a thread; a closed thread accepts no new messages until reopened', async () => {
  const h = createChatHarness('hub'); h.read(); await settle();
  h.press('Chat with Hassan'); await settle();
  const detailUrl = '/api/chat/conversations/direct-one';
  let status = 'open';
  h.state.handlers[detailUrl] = () => ({ id: 'direct-one', bookingId: null, channel: 'admin_driver', status, locked: false });
  const patches = [];
  h.api.patch = async (url, body) => { patches.push({ url, body }); status = body.close ? 'closed' : 'open'; return { success: true }; };
  h.press('Close conversation'); await settle();
  assert.equal(JSON.stringify(patches.at(-1)), JSON.stringify({ url: detailUrl, body: { close: true } }));
  assert.match(JSON.stringify(h.read()), /This conversation cannot accept new messages/);
  h.press('Reopen'); await settle();
  assert.equal(JSON.stringify(patches.at(-1)), JSON.stringify({ url: detailUrl, body: { reopen: true } }));
  assert.doesNotMatch(JSON.stringify(h.read()), /This conversation cannot accept new messages/);
  h.unmount();
 });
 test('hub: a booking thread loads its booking context; a late response for a previous thread is ignored', async () => {
  const h = createChatHarness('hub');
  h.state.conversations = [conversation('one', 'TYR-2026-00001'), conversation('two', 'TYR-2026-00002')];
  h.read(); await settle();
  const first = deferred();
  h.state.handlers['/api/mobile/admin/bookings/TYR-2026-00001'] = () => first.promise;
  h.state.handlers['/api/mobile/admin/bookings/TYR-2026-00002'] = () => ({ booking: { refNumber: 'TYR-2026-00002', status: 'paid' }, statusHistory: [], assignedDriver: null, invoice: null });
  h.select('one'); await settle();
  assert.ok(h.state.gets.includes('/api/mobile/admin/bookings/TYR-2026-00001'));
  h.find((node) => node.type === 'ChatScreenLayout').props.onBack(); await settle();
  h.select('two'); await settle();
  first.resolve({ booking: { refNumber: 'TYR-2026-00001', status: 'cancelled' }, statusHistory: [], assignedDriver: null, invoice: null });
  await settle();
  const panel = h.find((node) => node.type === 'ChatBookingContext');
  assert.equal(panel.props.bookingRef, 'TYR-2026-00002');
  assert.equal(panel.props.data.booking.status, 'paid');
  h.unmount();
 });
}
module.exports = { createChatHarness, loadSource, theme, message, conversation, deferred, settle };
