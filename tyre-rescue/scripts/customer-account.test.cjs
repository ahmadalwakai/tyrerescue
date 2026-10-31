const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const profile = (id = 'customer-a') => ({ id, name: `Customer ${id}`, email: `${id}@isolated.invalid`, phone: '07000000000', emailVerified: true });
const booking = (status = 'paid', refNumber = 'REF-A') => ({ bookingId: `booking-${refNumber}`, refNumber, status, bookingType: 'emergency', serviceType: 'fit', addressLine: 'Synthetic address', totalAmount: 100, tyreSizeDisplay: '205/55R16', vehicleReg: 'TEST', vehicleMake: 'Synthetic', vehicleModel: 'Vehicle', scheduledAt: null, createdAt: new Date().toISOString(), invoiceDownloadToken: 'never-cache-invoice-proof' });

test('verification recovery uses the current bearer and cannot choose another recipient', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
  h.read(); await settle(); h.state.handlers['/resend-verification'] = async () => ({ message: 'Verification sent.' });
  assert.equal(await h.read().resendVerification(), 'Verification sent.');
  const request = h.state.requests.find(item => item.path === '/resend-verification');
  assert.equal(request.init.headers.Authorization, 'Bearer token-a');
  assert.equal(request.init.body, '{}'); assert.equal(request.init.method, 'POST');
});

test('an already verified response refreshes account state while a late response after logout is ignored', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
  h.read(); await settle();
  const before = h.state.requests.filter(item => item.path === '/me').length;
  h.state.handlers['/resend-verification'] = async () => ({ alreadyVerified: true, message: 'Already verified.' });
  await h.read().resendVerification();
  assert.equal(h.state.requests.filter(item => item.path === '/me').length, before + 1);
  const pending = deferred(); h.state.handlers['/resend-verification'] = () => pending.promise;
  const sending = h.read().resendVerification(); await settle();
  await h.read().logout(); pending.resolve({ message: 'Late response' });
  await assert.rejects(sending, /session changed/); assert.equal(h.read().token, null);
  await assert.rejects(h.read().resendVerification(), /Sign in/);
});

test('verification rejection clears only a definitively expired session, preserving network and service failures', async () => {
  for (const status of [401, 403, 503, null]) {
    const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
    h.read(); await settle();
    h.state.handlers['/resend-verification'] = async () => { throw new h.CustomerApiError('Verification failed', status ? 'http' : 'network', status); };
    await assert.rejects(h.read().resendVerification(), /Verification failed/);
    const expired = status === 401 || status === 403;
    assert.equal(h.read().token, expired ? null : 'token-a');
    assert.equal(h.read().profile?.id ?? null, expired ? null : 'customer-a');
    assert.equal(h.state.storage.size === 0, expired);
  }
});

test('a late verification rejection cannot clear a replacement account session', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
  h.read(); await settle();
  const pending = deferred(); h.state.handlers['/resend-verification'] = () => pending.promise;
  const rejection = assert.rejects(h.read().resendVerification(), /Unauthorized/);
  h.state.handlers['/login'] = async () => ({ token: 'token-b', profile: profile('customer-b'), bookings: [booking('paid', 'REF-B')] });
  await h.read().login({ email: 'b', password: 'synthetic' });
  pending.reject(new h.CustomerApiError('Unauthorized', 'http', 401));
  await rejection;
  assert.equal(h.read().token, 'token-b'); assert.equal(h.read().profile.id, 'customer-b');
  assert.equal((await h.cache.loadCustomerAccountSnapshot('token-b')).profile.id, 'customer-b');
});

function harness() {
  const state = { storage: new Map(), requests: [], handlers: {}, holdWrite: null, clears: 0, forgotten: 0, detached: [] };
  const storage = {
    getSecureItem: async (key) => state.storage.get(key) ?? null,
    setSecureItem: async (key, value) => { if (state.holdWrite) await state.holdWrite(key); state.storage.set(key, value); },
    deleteSecureItem: async (key) => { state.storage.delete(key); },
  };
  const cache = loadSource('../../tyre-rescue/src/customer-account-cache.ts', { './secure-storage': storage });
  const renderer = { hooks: [], effects: [], cursor: 0 };
  const changed = (previous, next) => !previous || next.some((value, index) => value !== previous[index]);
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useContext: () => null,
    useState(initial) { const index = renderer.cursor++; if (!renderer.hooks[index]) renderer.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [renderer.hooks[index].value, (value) => { renderer.hooks[index].value = typeof value === 'function' ? value(renderer.hooks[index].value) : value; }]; },
    useRef(initial) { const index = renderer.cursor++; return renderer.hooks[index] ?? (renderer.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const index = renderer.cursor++; if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.hooks[index] = { value: create(), deps }; return renderer.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const index = renderer.cursor++; if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.effects.push(() => { renderer.hooks[index]?.cleanup?.(); renderer.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  class CustomerApiError extends Error { constructor(message, kind, status = null) { super(message); this.kind = kind; this.status = status; } }
  const API = { customerMe: '/me', customerLogin: '/login', customerClaimBooking: '/claim-booking', customerForgotPassword: '/forgot-password', customerProfile: '/profile', customerDeleteAccount: '/account', customerResendVerification: '/resend-verification' };
  const module = loadSource('../../tyre-rescue/src/customer-account.tsx', {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    './api': { API, CustomerApiError, isCustomerConnectionError: (error) => ['network', 'timeout'].includes(error?.kind), requestJson: async (path, init) => { state.requests.push({ path, init }); if (state.handlers[path]) return state.handlers[path](init); throw new Error(`No handler for ${path}`); } },
    './customer-account-cache': cache,
    './customer-booking-access': { clearBookingAccess: async () => { state.clears += 1; } },
    './customer-push-device': { detachCustomerPushDevice: async (token) => { state.detached.push(token); }, forgetCustomerPushDevice: async () => { state.forgotten += 1; } },
    './booking-draft-storage': { invalidateBookingDraftSession: () => {}, clearBookingDraft: async () => {} },
    './customer-assisted-help': { clearCustomerAssistedHelp: async () => {} },
  });
  function read() { renderer.cursor = 0; renderer.effects = []; const result = module.CustomerAccountProvider({ children: null }); renderer.effects.forEach((effect) => effect()); return result.props.value; }
  async function seed(token = 'token-a', id = 'customer-a') { await cache.storeCustomerAccountSnapshot(token, profile(id), [booking()], cache.customerAccountStorageScope(), true); }
  const offline = () => new CustomerApiError('Synthetic network interruption', 'network');
  return { state, cache, read, seed, offline, CustomerApiError };
}

test('offline warm start shows the saved account and active booking, without invoice credentials', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => { throw h.offline(); };
  h.read(); await settle(); const value = h.read();
  assert.equal(value.profile.id, 'customer-a'); assert.equal(value.token, 'token-a'); assert.equal(value.loading, false); assert.equal(value.offline, true);
  assert.equal(value.bookings[0].refNumber, 'REF-A'); assert.equal(value.bookings[0].invoiceDownloadToken, null); assert.ok(value.lastSyncedAt);
});

test('offline cold start with a saved token preserves the session and offers loading retry', async () => {
  const h = harness(); h.state.storage.set('customer_token', 'token-a'); h.state.handlers['/me'] = async () => { throw h.offline(); };
  h.read(); await settle(); assert.equal(h.read().token, 'token-a'); assert.equal(h.read().profile, null); assert.equal(h.read().offline, true);
});

test('refresh failure preserves data; an explicit unauthorized response clears it', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
  h.read(); await settle(); h.state.handlers['/me'] = async () => { throw new h.CustomerApiError('Synthetic timeout', 'timeout'); };
  await h.read().refresh(); assert.equal(h.read().profile.id, 'customer-a'); assert.equal(h.read().offline, true);
  h.state.handlers['/me'] = async () => { throw new h.CustomerApiError('Unauthorized', 'http', 401); };
  await h.read().refresh(); assert.equal(h.read().token, null); assert.equal(h.read().profile, null); assert.equal(h.state.storage.size, 0);
});

test('logout and account switch cannot be undone by an in-flight cache write', async () => {
  for (const action of ['logout', 'switch']) {
    const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => ({ profile: profile(), bookings: [booking()] });
    h.read(); await settle(); const pending = deferred(); let entered = false;
    h.state.holdWrite = async (key) => { if (key === 'customer_account_snapshot_v1' && !entered) { entered = true; await pending.promise; } };
    await h.read().refresh(); await settle(); assert.equal(entered, true);
    h.state.handlers['/login'] = async () => ({ token: 'token-b', profile: profile('customer-b'), bookings: [booking('paid', 'REF-B')] });
    const change = action === 'logout' ? h.read().logout() : h.read().login({ email: 'b', password: 'synthetic' });
    pending.resolve(); await change; await settle();
    if (action === 'logout') { assert.equal(h.read().token, null); assert.equal(h.state.storage.size, 0); }
    else { assert.equal(h.read().profile.id, 'customer-b'); assert.equal(await h.cache.loadCustomerAccountSnapshot('token-a'), null); assert.equal((await h.cache.loadCustomerAccountSnapshot('token-b')).profile.id, 'customer-b'); }
  }
});

test('successful deletion while a refresh is pending clears session and ignores its late response', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => { throw h.offline(); }; h.read(); await settle();
  const pending = deferred(); h.state.handlers['/me'] = () => pending.promise; const refreshing = h.read().refresh();
  h.state.handlers['/account'] = async () => ({ success: true }); await h.read().deleteAccount('Synthetic123');
  pending.resolve({ profile: profile(), bookings: [booking()] }); await refreshing; await settle();
  assert.equal(h.read().profile, null); assert.equal(h.read().token, null); assert.equal(h.state.storage.size, 0); assert.equal(h.state.forgotten, 1);
});

test('wrong deletion password keeps the account and does not retry the mutation', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => { throw h.offline(); }; h.read(); await settle();
  h.state.handlers['/account'] = async () => { throw new h.CustomerApiError('Password incorrect', 'http', 403); };
  await assert.rejects(h.read().deleteAccount('wrong'), /Password incorrect/);
  assert.equal(h.read().token, 'token-a'); assert.equal(h.state.requests.filter((request) => request.path === '/account').length, 1);
});

test('a late sign-in response cannot restore the account after logout', async () => {
  const h = harness(); h.read(); await settle(); const pending = deferred();
  h.state.handlers['/login'] = () => pending.promise;
  const login = h.read().login({ email: 'synthetic', password: 'synthetic' });
  const rejected = assert.rejects(login, /session changed/);
  await h.read().logout();
  pending.resolve({ token: 'token-a', profile: profile(), bookings: [booking()] });
  await rejected; assert.equal(h.read().token, null); assert.equal(h.state.storage.size, 0);
});

test('paid guest create and sign-in retain the booking session and its device access', async () => {
  for (const mode of ['create', 'signin']) {
    const h = harness(); h.read(); await settle();
    const revision = h.read().sessionRevision;
    const input = { mode, refNumber: 'REF-PAID', name: 'Customer A', email: 'customer-a@isolated.invalid', phone: '07000000000', password: 'Synthetic123', bookingAccessToken: 'paid-device-proof' };
    h.state.handlers['/claim-booking'] = async () => ({ token: 'token-a', profile: profile(), bookings: [booking('paid', 'REF-PAID')] });
    await h.read().createAccountFromBooking(input);
    assert.deepEqual(JSON.parse(h.state.requests.find(item => item.path === '/claim-booking').init.body), input);
    assert.equal(h.read().sessionRevision, revision); assert.equal(h.state.clears, 0);
    assert.equal(h.read().bookings[0].refNumber, 'REF-PAID'); assert.equal(h.read().profile.id, 'customer-a');
  }
});

test('a failed paid-booking sign-in and password reset keep device access available for retry', async () => {
  const h = harness(); h.read(); await settle(); const revision = h.read().sessionRevision;
  h.state.handlers['/claim-booking'] = async () => { throw new h.CustomerApiError('Wrong password', 'http', 401); };
  await assert.rejects(h.read().createAccountFromBooking({ mode: 'signin', refNumber: 'REF-PAID', name: 'Customer A', email: 'customer-a@isolated.invalid', phone: '07000000000', password: 'wrong', bookingAccessToken: 'paid-device-proof' }), /Wrong password/);
  h.state.handlers['/forgot-password'] = async () => ({ success: true, message: 'Reset link requested.' });
  assert.equal(await h.read().forgotPassword('customer-a@isolated.invalid'), 'Reset link requested.');
  assert.equal(h.read().sessionRevision, revision); assert.equal(h.state.clears, 0); assert.equal(h.read().token, null);
});

test('a late paid-booking claim response cannot restore the account after logout', async () => {
  const h = harness(); h.read(); await settle(); const pending = deferred();
  h.state.handlers['/claim-booking'] = () => pending.promise;
  const rejected = assert.rejects(h.read().createAccountFromBooking({ mode: 'signin', refNumber: 'REF-PAID', name: 'Customer A', email: 'customer-a@isolated.invalid', phone: '07000000000', password: 'Synthetic123', bookingAccessToken: 'paid-device-proof' }), /session changed/);
  await h.read().logout(); pending.resolve({ token: 'token-a', profile: profile(), bookings: [booking('paid', 'REF-PAID')] });
  await rejected; assert.equal(h.read().token, null); assert.equal(h.state.storage.size, 0);
});

test('a React Native press event cannot change logout into account-deletion cleanup', async () => {
  const h = harness(); await h.seed(); h.state.handlers['/me'] = async () => { throw h.offline(); }; h.read(); await settle();
  await h.read().logout({ nativeEvent: { timestamp: Date.now() } });
  assert.deepEqual(h.state.detached, ['token-a']); assert.equal(h.state.forgotten, 0); assert.equal(h.read().token, null);
});

test('snapshot is bounded, expires, binds exact sessions and skips finished bookings', async () => {
  const h = harness(); const many = Array.from({ length: 1000 }, (_, index) => booking(index < 5 ? 'cancelled_refund_pending' : 'paid', `REF-${index}`));
  const snapshot = h.cache.buildCustomerAccountSnapshot(profile(), many);
  assert.equal(snapshot.bookings.length, 1); assert.equal(snapshot.bookings[0].refNumber, 'REF-5'); assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 1800);
  assert.equal(JSON.stringify(snapshot).includes('never-cache-invoice-proof'), false);
  await h.seed(); assert.equal(await h.cache.loadCustomerAccountSnapshot('other-session'), null);
  const raw = JSON.parse(h.state.storage.get('customer_account_snapshot_v1')); raw.savedAt = Date.now() - 8 * 86400_000; h.state.storage.set('customer_account_snapshot_v1', JSON.stringify(raw));
  assert.equal(await h.cache.loadCustomerAccountSnapshot('token-a'), null);
  await h.seed();
  const corrupt = JSON.parse(h.state.storage.get('customer_account_snapshot_v1')); corrupt.bookings = [{}]; h.state.storage.set('customer_account_snapshot_v1', JSON.stringify(corrupt));
  assert.equal(await h.cache.loadCustomerAccountSnapshot('token-a'), null);
  await h.seed();
  const corruptProfile = JSON.parse(h.state.storage.get('customer_account_snapshot_v1')); corruptProfile.profile.phone = {}; h.state.storage.set('customer_account_snapshot_v1', JSON.stringify(corruptProfile));
  assert.equal(await h.cache.loadCustomerAccountSnapshot('token-a'), null);
});
