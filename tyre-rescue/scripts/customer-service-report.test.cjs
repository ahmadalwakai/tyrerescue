const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const sampleReport = () => ({
  bookingId: 'completed-booking', refNumber: 'TR-COMPLETE', status: 'completed', serviceType: 'puncture_repair',
  completedAt: '2026-10-31T12:30:00Z', vehicle: { registration: 'TEST123', make: 'Test', model: 'Car' },
  tyres: [{ description: '205/55 R16 Example tyre x2', quantity: 2 }],
  photos: [{ id: 'photo-1', url: 'https://example.invalid/service-photo.jpg' }], invoiceDownloadToken: 'isolated-invoice-proof', feedback: null,
});

function harness({ token = 'account-a', savedAccess = null, refNumber = 'TR-COMPLETE' } = {}) {
  const state = { report: sampleReport(), calls: [], routes: [], urls: [], writes: 0, get: null, post: null, accessLoads: [] };
  const hooks = []; let cursor = 0; let effects = [];
  const changed = (previous, next) => !previous || next.some((value, index) => value !== previous[index]);
  const react = {
    useState(initial) {
      const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => { state.writes++; hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { value: fn, deps }; return hooks[index].value; },
    useEffect(effect, deps) { const index = cursor++; if (!hooks[index] || changed(hooks[index].deps, deps)) effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const jsx = (type, props) => ({ type, props });
  const ui = Object.fromEntries(['AppHeader', 'Card', 'InlineNotice', 'LoadingState', 'PrimaryButton', 'Row', 'ScreenHeader', 'TextField'].map(name => [name, name]));
  const { CustomerServiceReport } = loadSource('../../tyre-rescue/src/customer-service-report.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, '@expo/vector-icons': { Feather: 'Feather' },
    'expo-router': { router: { push: route => state.routes.push(route), canGoBack: () => false, replace: route => state.routes.push(route) } },
    'react-native': { Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value }, Linking: { openURL: async url => { state.urls.push(url); } } },
    './api': {
      customerInvoiceUrl: (ref, proof) => `https://example.invalid/invoices/${ref}?token=${proof}`,
      requestJson: async (path, init) => {
        state.calls.push({ path, init });
        if (init.method === 'POST') return state.post ? state.post(init) : { success: true, feedback: { ...JSON.parse(init.body), updatedAt: '2026-10-31T13:00:00Z' } };
        return state.get ? state.get(init) : state.report;
      },
    },
    './config': { PHONE_TEL: '000' },
    './customer-booking-access': { loadBookingAccess: async ref => { state.accessLoads.push(ref); return savedAccess; } },
    './theme': { colors: {}, spacing: {}, typography: {} }, './ui': { ...ui, useScreenContentInsets: () => ({}) },
  }, { Error, AbortController, encodeURIComponent });
  function read() { cursor = 0; effects = []; const tree = CustomerServiceReport({ refNumber, token }); effects.forEach(effect => effect()); return tree; }
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const find = predicate => nodes(read()).find(predicate);
  const button = label => { const target = find(node => node.type === 'PrimaryButton' && node.props.children === label); assert.ok(target, `Missing button: ${label}`); return target; };
  const rate = value => { const target = find(node => node.props?.accessibilityRole === 'radio' && node.props.accessibilityLabel.startsWith(`${value} `)); assert.ok(target); target.props.onPress(); };
  const comment = value => find(node => node.type === 'TextField').props.onChangeText(value);
  return { state, read, find, button, rate, comment, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

test('completed report shows service, recorded tyres and photos with invoice and booking-scoped support actions', async () => {
  const h = harness(); h.read(); await settle();
  assert.equal(h.state.calls[0].init.headers.Authorization, 'Bearer account-a');
  assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Service').props.value, 'Puncture Repair');
  assert.ok(h.find(node => node.type === 'Text' && node.props.children === '205/55 R16 Example tyre x2'));
  assert.equal(h.find(node => node.type === 'Image').props.source.uri, 'https://example.invalid/service-photo.jpg');
  h.button('Download invoice').props.onPress(); await settle();
  assert.deepEqual(h.state.urls, ['https://example.invalid/invoices/TR-COMPLETE?token=isolated-invoice-proof']);
  h.button('Message support about this service').props.onPress();
  assert.equal(h.state.routes[0].pathname, '/chat');
  assert.equal(h.state.routes[0].params.bookingId, 'completed-booking');
  assert.equal(h.state.routes[0].params.channel, 'customer_admin');
  assert.equal(JSON.stringify(h.state.routes).includes('invoice-proof'), false); h.unmount();
});

test('paid guests load and save with stored booking access and repeated taps send one feedback request', async () => {
  const h = harness({ token: null, savedAccess: 'device-booking-proof' }); h.read(); await settle();
  assert.equal(h.state.calls[0].init.headers['X-Booking-Access'], 'device-booking-proof');
  assert.equal(h.state.calls[0].init.headers.Authorization, undefined);
  assert.equal(h.button('Save feedback').props.disabled, true);
  h.rate(5); h.comment('  Friendly service  ');
  const pending = deferred(); h.state.post = () => pending.promise;
  const action = h.button('Save feedback').props.onPress; action(); action();
  const posts = h.state.calls.filter(call => call.init.method === 'POST');
  assert.equal(posts.length, 1); assert.equal(posts[0].init.headers['X-Booking-Access'], 'device-booking-proof');
  assert.deepEqual(JSON.parse(posts[0].init.body), { rating: 5, comment: 'Friendly service' });
  assert.equal(h.find(node => node.props?.accessibilityRole === 'radio').props.disabled, true);
  pending.resolve({ success: true, feedback: { rating: 5, comment: 'Friendly service', updatedAt: '2026-10-31T13:00:00Z' } }); await settle();
  assert.equal(h.button('Update feedback').props.disabled, true);
  assert.match(JSON.stringify(h.read()), /Your feedback has been saved/); h.unmount();
});

test('failed feedback preserves rating and comment for a deliberate retry; saved feedback can be updated', async () => {
  const h = harness(); h.state.report.feedback = { rating: 3, comment: 'Previous feedback', updatedAt: '2026-10-31T13:00:00Z' };
  h.read(); await settle(); assert.equal(h.button('Update feedback').props.disabled, true);
  h.rate(4); h.comment('Updated after speaking with support');
  h.state.post = async () => { throw new Error('Connection unavailable'); };
  h.button('Update feedback').props.onPress(); await settle();
  assert.match(JSON.stringify(h.read()), /Connection unavailable/);
  assert.equal(h.find(node => node.type === 'TextField').props.value, 'Updated after speaking with support');
  assert.equal(h.find(node => node.props?.accessibilityLabel === '4 stars: Very good').props.accessibilityState.checked, true);
  assert.equal(h.state.calls.filter(call => call.init.method === 'POST').length, 1);
  h.state.post = null; h.button('Update feedback').props.onPress(); await settle();
  assert.equal(h.state.calls.filter(call => call.init.method === 'POST').length, 2);
  assert.match(JSON.stringify(h.read()), /Your feedback has been saved/); h.unmount();
});

test('access rejection and mismatched or unfinished reports never expose report controls', async () => {
  for (const failure of ['forbidden', 'wrong-booking', 'unfinished']) {
    const h = harness({ token: null });
    if (failure === 'forbidden') h.state.get = async () => { throw new Error('Access denied'); };
    if (failure === 'wrong-booking') h.state.report.refNumber = 'TR-OTHER';
    if (failure === 'unfinished') h.state.report.status = 'en_route';
    h.read(); await settle();
    assert.equal(h.find(node => node.type === 'Image'), undefined);
    assert.equal(h.find(node => node.type === 'TextField'), undefined);
    assert.ok(h.button('Try again')); assert.ok(h.button('Open my account'));
    assert.equal(h.state.calls[0].init.headers['X-Tracking-Token'], undefined); h.unmount();
  }
});

test('empty report sections do not invent fitted tyres or photos and unsafe photo URLs are omitted', async () => {
  const h = harness(); h.state.report.tyres = []; h.state.report.photos = [{ id: 'unsafe', url: 'file:///private/photo.jpg' }]; h.state.report.invoiceDownloadToken = null;
  h.read(); await settle();
  assert.match(JSON.stringify(h.read()), /No replacement tyre details were recorded/);
  assert.match(JSON.stringify(h.read()), /No photos have been shared/);
  assert.equal(h.find(node => node.type === 'Image'), undefined);
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Download invoice'), undefined); h.unmount();
});

test('leaving the report aborts loading and late load/save responses cannot update a replacement account screen', async () => {
  const h = harness(); const loading = deferred(); h.state.get = () => loading.promise;
  h.read(); await settle(); h.unmount(); const before = h.state.writes;
  assert.equal(h.state.calls[0].init.signal.aborted, true);
  loading.resolve(sampleReport()); await settle(); assert.equal(h.state.writes, before);
  const saving = harness(); saving.read(); await settle(); saving.rate(5);
  const pending = deferred(); saving.state.post = () => pending.promise;
  saving.button('Save feedback').props.onPress(); saving.unmount(); const writes = saving.state.writes;
  pending.resolve({ success: true, feedback: { rating: 5, comment: '', updatedAt: '2026-10-31T13:00:00Z' } }); await settle();
  assert.equal(saving.state.writes, writes);
});

test('route remounts private report state on booking changes, sign-out and account replacement', () => {
  const account = { token: 'account-a', loading: false, sessionRevision: 1 }; const params = { ref: 'tr-complete' };
  const jsx = (type, props, key) => ({ type, props, key });
  const { default: Screen } = loadSource('../../tyre-rescue/app/service-report.tsx', {
    'expo-router': { Stack: { Screen: 'StackScreen' }, useLocalSearchParams: () => params },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    '@/src/customer-account': { useCustomerAccount: () => account }, '@/src/customer-service-report': { CustomerServiceReport: 'Report' }, '@/src/ui': { LoadingState: 'LoadingState' },
  });
  const current = () => Screen().props.children[1];
  const initial = current(); assert.equal(initial.props.refNumber, 'TR-COMPLETE');
  account.token = null; account.sessionRevision++; assert.notEqual(current().key, initial.key);
  const guest = current(); account.token = 'account-b'; assert.notEqual(current().key, guest.key);
  const replacement = current(); params.ref = 'TR-OTHER'; assert.notEqual(current().key, replacement.key);
  account.loading = true; assert.equal(current().type, 'LoadingState');
});
