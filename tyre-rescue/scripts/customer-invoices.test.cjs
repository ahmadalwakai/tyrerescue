/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(name, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', name);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const source = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Error, Date, Intl, AbortController, setTimeout, clearTimeout, ...globals }, { filename })(
    dependency => { if (Object.hasOwn(mocks, dependency)) return mocks[dependency]; throw new Error(`Unexpected dependency ${dependency}`); }, source, source.exports);
  return source.exports;
}
const normalize = value => JSON.parse(JSON.stringify(value));
const data = load('customer-invoices-data.ts');
const booking = (extra = {}) => ({ bookingId: 'b1', refNumber: 'TR-ONE', status: 'completed', bookingType: 'scheduled', serviceType: 'tyre_replacement',
  addressLine: 'Synthetic address', totalAmount: 120, tyreSizeDisplay: '205/55 R16', vehicleReg: 'AB12 CDE', vehicleMake: 'Ford', vehicleModel: 'Focus',
  scheduledAt: '2026-11-02T11:00:00Z', createdAt: '2026-10-31T13:00:00Z', invoiceDownloadToken: 'isolated-proof', ...extra });
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('invoice eligibility uses server proof and never guesses from paid/completed status', () => {
  const records = [booking(), booking({ bookingId: 'unpaid', invoiceDownloadToken: null, status: 'completed' }), booking({ refNumber: '../escape' })];
  assert.deepEqual(normalize(data.customerInvoices(records)).map(item => item.bookingId), ['b1']);
  assert.equal(data.customerInvoices([booking({ invoiceDownloadToken: null })]).length, 0, 'offline snapshots carry no invoice capability');
});
test('invoice search finds reference, invoice number, vehicle, service and booking date', () => {
  for (const query of [' tr-one ', 'inv-tr-one', 'AB12CDE', 'Ford', 'focus', 'Synthetic address', '31 Oct 2026', '31/10/2026', '2026-10', 'tyre replacement']) {
    assert.equal(data.customerInvoices([booking()], query).length, 1, query);
  }
  assert.equal(data.customerInvoices([booking()], 'not present').length, 0);
});
test('invoice sorting keeps newest first without mutating the source list and handles bad dates', () => {
  const records = [booking({ bookingId: 'old', createdAt: '2025-01-01' }), booking({ bookingId: 'bad', createdAt: 'bad' }), booking({ bookingId: 'new' })];
  assert.deepEqual(normalize(data.customerInvoices(records)).map(item => item.bookingId), ['new', 'old', 'bad']);
  assert.equal(records[0].bookingId, 'old'); assert.equal(data.invoiceDate('bad'), 'Date unavailable');
});
test('unsafe references and non-PDF responses cannot produce shareable invoices', () => {
  assert.throws(() => data.invoiceFilename('../../private'), /invalid/);
  assert.throws(() => data.validateInvoiceResponse(401, { 'Content-Type': 'application/pdf' }), /unavailable/);
  assert.throws(() => data.validateInvoiceResponse(200, { 'Content-Type': 'text/html' }), /PDF/);
  assert.throws(() => data.validateInvoiceResponse(200, { 'Content-Type': 'application/pdf', 'Content-Length': '99999999' }), /large/);
  assert.doesNotThrow(() => data.validateInvoiceResponse(200, { 'Content-Type': 'application/pdf; charset=binary' }));
});

function nativeHarness() {
  const state = { requests: [], shares: [], deletes: [], entries: [], info: {}, expiries: {}, writes: [], available: true, signature: 'JVBERi0=', downloads: null, share: null, cancels: 0,
    response: { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Length': '500' } } };
  const timers = new Map(); let timerId = 0;
  const files = {
    cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
    makeDirectoryAsync: async () => {}, deleteAsync: async uri => { state.deletes.push(uri); },
    readDirectoryAsync: async () => state.entries,
    getInfoAsync: async uri => state.info[uri] ?? { exists: true, isDirectory: true },
    readAsStringAsync: async uri => uri.endsWith('share-expires-at.txt') ? state.expiries[uri] ?? '' : state.signature,
    writeAsStringAsync: async (uri, text) => { state.writes.push({ uri, text }); state.expiries[uri] = text; },
    createDownloadResumable(url, fileUri, options, progress) {
      state.requests.push({ url, fileUri, options, progress });
      return { downloadAsync: async () => state.downloads ? state.downloads() : { ...state.response, uri: fileUri }, cancelAsync: async () => { state.cancels++; } };
    },
  };
  const api = load('customer-invoice-file.native.ts', {
    'expo-file-system/legacy': files, 'expo-sharing': { isAvailableAsync: async () => state.available,
      shareAsync: async (uri, options) => { state.shares.push({ uri, options }); if (state.share) await state.share(); } },
    './api': { API: { customerInvoices: '/invoices' }, endpoint: path => `https://example.invalid${path}` }, './customer-invoices-data': data,
  }, { setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  return { state, timers, run: (signal = new AbortController().signal) => api.shareCustomerInvoice({ refNumber: 'TR-ONE', token: 'private-bearer', signal }) };
}
test('native sharing authenticates the PDF download and shares only a verified temporary file', async () => {
  const h = nativeHarness(); assert.equal(await h.run(), 'shared');
  assert.equal(h.state.requests[0].url, 'https://example.invalid/invoices/TR-ONE');
  assert.equal(h.state.requests[0].options.headers.Authorization, 'Bearer private-bearer');
  assert.match(h.state.shares[0].uri, /^file:\/\/\/cache\/customer-invoice-\d+-\d+\/INV-TR-ONE\.pdf$/);
  assert.doesNotMatch(JSON.stringify(h.state.shares), /private-bearer|isolated-proof|https:/);
  assert.equal(h.state.deletes.length, 0, 'the receiving app can read the PDF after the chooser resolves');
  const retention = [...h.timers.values()].find(timer => timer.ms === 15 * 60_000); assert.ok(retention);
  retention.fn(); await settle(); assert.equal(h.state.deletes.length, 1);
  assert.ok(h.state.writes.every(write => write.uri.endsWith('/share-expires-at.txt')));
});
test('native sharing rejects HTTP, content-type and signature failures and cleans its file', async () => {
  for (const configure of [h => { h.state.response.status = 401; }, h => { h.state.response.headers['Content-Type'] = 'application/json'; }, h => { h.state.signature = 'not-a-pdf'; }]) {
    const h = nativeHarness(); configure(h); await assert.rejects(h.run()); assert.equal(h.state.shares.length, 0); assert.ok(h.state.deletes.length);
  }
});
test('account cancellation aborts a pending download and never opens sharing after a late response', async () => {
  const h = nativeHarness(); const pending = deferred(); h.state.downloads = () => pending.promise;
  const controller = new AbortController(); const run = h.run(controller.signal); await settle(); controller.abort();
  await assert.rejects(run, /cancelled/); pending.resolve(h.state.response); await settle();
  assert.equal(h.state.shares.length, 0); assert.equal(h.state.cancels, 1); assert.ok(h.state.deletes.length);
});
test('a timed-out or oversized download is cancelled instead of sharing partial content', async () => {
  for (const oversized of [false, true]) {
    const h = nativeHarness(); const pending = deferred(); h.state.downloads = () => pending.promise;
    const run = h.run(); await settle();
    if (oversized) h.state.requests[0].progress({ totalBytesWritten: data.MAX_INVOICE_BYTES + 1, totalBytesExpectedToWrite: -1 });
    else [...h.timers.values()][0].fn();
    await assert.rejects(run, oversized ? /large/ : /timed out/); pending.resolve(h.state.response); await settle();
    assert.equal(h.state.cancels, 1); assert.equal(h.state.shares.length, 0);
  }
});
test('sharing unavailable and pre-aborted requests never fetch a file', async () => {
  const h = nativeHarness(); h.state.available = false; await assert.rejects(h.run(), /unavailable/); assert.equal(h.state.requests.length, 0);
  const controller = new AbortController(); controller.abort(); await assert.rejects(h.run(controller.signal), /cancelled/); assert.equal(h.state.requests.length, 0);
});
test('an already opened native sheet retains its file until dismissed, including after account change', async () => {
  const h = nativeHarness(); const sheet = deferred(); h.state.share = () => sheet.promise;
  const controller = new AbortController(); const run = h.run(controller.signal); await settle();
  assert.equal(h.state.shares.length, 1); controller.abort(); await assert.rejects(run, /cancelled/);
  assert.equal(h.state.deletes.length, 0);
  await assert.rejects(h.run(), /previous sharing window/);
  sheet.resolve(); await settle(); assert.equal(h.state.deletes.length, 0);
  const retention = [...h.timers.values()].find(timer => timer.ms === 15 * 60_000); assert.ok(retention);
  retention.fn(); await settle(); assert.equal(h.state.deletes.length, 1);
});

test('lazy cache cleanup removes only expired invoice directories and honours persisted recipient grace', async () => {
  const h = nativeHarness(); const old = Date.now() - 30 * 60_000; const recent = Date.now() - 60_000;
  h.state.entries = [
    `customer-invoice-${old}-1`, `customer-invoice-${old}-2`, `customer-invoice-${recent}-3`,
    `customer-invoice-${old}-4`, `customer-invoice-${old}-0`, `customer-invoice-${old}-5/../../private`,
    `other-cache-${old}-1`, 'customer-invoice-not-a-timestamp-1',
  ];
  const expired = `file:///cache/customer-invoice-${old}-1/`;
  const retained = `file:///cache/customer-invoice-${old}-2/`;
  h.state.expiries[`${retained}share-expires-at.txt`] = String(Date.now() + 10 * 60_000);
  h.state.info[`file:///cache/customer-invoice-${old}-4/`] = { exists: true, isDirectory: false };
  await h.run();
  assert.deepEqual(h.state.deletes, [expired]);
  assert.equal(h.state.shares.length, 1);
});

test('a later share cannot sweep a PDF still inside its recipient grace period', async () => {
  const h = nativeHarness(); await h.run();
  const firstDirectory = h.state.requests[0].fileUri.replace(/INV-TR-ONE\.pdf$/, '');
  const name = firstDirectory.replace('file:///cache/', '').replace(/\/$/, '');
  h.state.entries = [name];
  // Even if on-disk metadata cannot be read, the running app retains the URI.
  h.state.expiries = {};
  await h.run();
  assert.equal(h.state.deletes.length, 0);
  assert.equal(h.state.shares.length, 2);
});

function webHarness() {
  const state = { requests: [], files: [], shares: [], downloads: [], revoked: [], canShare: true, share: null,
    response: () => new Response('%PDF-synthetic', { headers: { 'Content-Type': 'application/pdf' } }) };
  const timers = new Map(); let timerId = 0;
  const api = load('customer-invoice-file.web.ts', {
    './api': { API: { customerInvoices: '/invoices' }, fetchApi: async (url, options) => { state.requests.push({ url, options }); return state.response(); } },
    './customer-invoices-data': data,
  }, {
    File, Blob,
    navigator: { canShare: () => state.canShare, share: async payload => { state.shares.push(payload); if (state.share) return state.share(); } },
    URL: { createObjectURL: file => { state.files.push(file); return 'blob:isolated-pdf'; }, revokeObjectURL: url => state.revoked.push(url) },
    document: { body: { appendChild() {} }, createElement: () => ({ href: '', download: '', click() { state.downloads.push({ href: this.href, download: this.download }); }, remove() {} }) },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
  });
  return { state, timers, run: (signal = new AbortController().signal) => api.shareCustomerInvoice({ refNumber: 'TR-ONE', token: 'private-bearer', signal }) };
}
test('web sharing sends a PDF File without private credentials or capability links', async () => {
  const h = webHarness(); assert.equal(await h.run(), 'shared');
  assert.equal(h.state.shares[0].files[0].name, 'INV-TR-ONE.pdf');
  assert.equal(await h.state.shares[0].files[0].text(), '%PDF-synthetic');
  assert.equal(h.state.requests[0].options.credentials, 'omit');
  assert.equal(h.state.requests[0].options.headers.Authorization, 'Bearer private-bearer');
  assert.equal(h.state.downloads.length, 0);
  assert.doesNotMatch(JSON.stringify(h.state.shares), /private-bearer|token=|https:/);
});
test('unsupported web sharing downloads a named PDF and revokes its temporary URL', async () => {
  const h = webHarness(); h.state.canShare = false; assert.equal(await h.run(), 'downloaded');
  assert.deepEqual(h.state.downloads, [{ href: 'blob:isolated-pdf', download: 'INV-TR-ONE.pdf' }]);
  assert.equal(h.state.shares.length, 0); [...h.timers.values()].find(timer => timer.ms === 60_000).fn();
  assert.deepEqual(h.state.revoked, ['blob:isolated-pdf']);
});
test('cancelling the browser share sheet does not trigger an unwanted PDF download', async () => {
  const h = webHarness(); h.state.share = () => { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; };
  assert.equal(await h.run(), 'cancelled'); assert.equal(h.state.downloads.length, 0);
});
test('web validates actual PDF bytes before either sharing or downloading', async () => {
  const h = webHarness(); h.state.response = () => new Response('<html>error</html>', { headers: { 'Content-Type': 'application/pdf' } });
  await assert.rejects(h.run(), /verified/); assert.equal(h.state.downloads.length, 0); assert.equal(h.state.shares.length, 0);
});
test('a late web response after an account change never becomes a shared or downloaded file', async () => {
  const h = webHarness(); const pending = deferred(); h.state.response = () => pending.promise;
  const controller = new AbortController(); const run = h.run(controller.signal); await settle(); controller.abort();
  pending.resolve(new Response('%PDF-synthetic', { headers: { 'Content-Type': 'application/pdf' } }));
  await assert.rejects(run, /cancelled/); assert.equal(h.state.shares.length, 0); assert.equal(h.state.downloads.length, 0);
});

function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)]; }
function label(tree) { if (tree == null || typeof tree === 'boolean') return ''; if (Array.isArray(tree)) return tree.map(label).join(''); return typeof tree === 'object' ? label(tree.props?.children) : String(tree); }
function uiHarness() {
  const state = { refreshes: 0, opens: [], shares: [], share: null, writes: 0 };
  const account = { bookings: [booking()], token: 'account-one', profile: { id: 'owner-one' }, loading: false, refreshing: false,
    offline: false, connectionError: null, refresh: async () => { state.refreshes++; } };
  const hooks = []; let cursor = 0; let effects = []; let dirty = false;
  const react = {
    useRef(value) { return hooks[cursor++] ??= { current: value }; },
    useState(initial) { const at = cursor++; if (!hooks[at]) hooks[at] = { value: initial, set(value) { state.writes++; const next = typeof value === 'function' ? value(hooks[at].value) : value; if (next !== hooks[at].value) { hooks[at].value = next; dirty = true; } } }; return [hooks[at].value, hooks[at].set]; },
    useCallback(fn, deps) { const at = cursor++; if (!hooks[at] || deps.some((value, i) => value !== hooks[at].deps[i])) hooks[at] = { fn, deps }; return hooks[at].fn; },
  };
  const jsx = (type, props) => ({ type, props });
  const ui = Object.fromEntries(['AppHeader', 'Card', 'InlineNotice', 'LoadingState', 'PrimaryButton', 'Row', 'ScreenHeader', 'TextField'].map(name => [name, name]));
  const { CustomerInvoices } = load('customer-invoices.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { router: { canGoBack: () => false, replace() {}, push() {} }, useFocusEffect(fn) { const at = cursor++; if (!hooks[at] || hooks[at].fn !== fn) effects.push(() => { hooks[at]?.cleanup?.(); hooks[at] = { fn, cleanup: fn() }; }); } },
    'react-native': { Linking: { openURL: async url => { state.opens.push(url); } }, ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value } },
    './api': { customerInvoiceUrl: (ref, proof) => `https://example.invalid/invoices/${ref}?token=${proof}` },
    './customer-invoices-data': data, './customer-invoice-file': { shareCustomerInvoice: async input => { state.shares.push(input); return state.share ? state.share(input) : 'shared'; } },
    './theme': { colors: {}, spacing: {}, typography: {} }, './types': { formatPrice: amount => `£${amount}` }, './ui': { ...ui, useScreenContentInsets: () => ({}) },
  });
  function read() { for (let i = 0; i < 8; i++) { cursor = 0; effects = []; dirty = false; const tree = CustomerInvoices({ account }); effects.forEach(fn => fn()); if (!dirty) return tree; } throw new Error('Render did not settle'); }
  const button = text => nodes(read()).find(node => node.type === 'PrimaryButton' && label(node) === text);
  return { state, account, read, button, text: () => label(read()), unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}
test('the invoice hub asks guests to sign in and does not render account data or refresh it', () => {
  const h = uiHarness(); h.account.profile = null; h.account.token = null;
  assert.match(h.text(), /Sign in/); assert.doesNotMatch(h.text(), /INV-TR-ONE/); assert.equal(h.state.refreshes, 0);
});
test('the hub refreshes current invoices, filters them and downloads only a current eligible row', async () => {
  const h = uiHarness(); h.read(); assert.equal(h.state.refreshes, 1);
  const search = nodes(h.read()).find(node => node.type === 'TextField'); search.props.onChangeText('missing');
  assert.match(h.text(), /No invoices match/); h.button('Clear search').props.onPress();
  h.button('Download PDF').props.onPress(); await settle();
  assert.equal(h.state.opens[0], 'https://example.invalid/invoices/TR-ONE?token=isolated-proof');
});
test('offline, failed refresh and removed invoice proofs block stale download handlers', async () => {
  for (const mode of ['offline', 'connectionError', 'proof']) {
    const h = uiHarness(); const stale = h.button('Download PDF').props.onPress;
    if (mode === 'proof') h.account.bookings = [booking({ invoiceDownloadToken: null })];
    else h.account[mode] = mode === 'connectionError' ? 'Could not refresh' : true;
    h.read(); stale(); await settle(); assert.equal(h.state.opens.length, 0);
  }
});
test('rapid sharing taps share one PDF and an unmounted screen aborts pending work', async () => {
  const h = uiHarness(); const pending = deferred(); h.state.share = () => pending.promise;
  const share = h.button('Share PDF').props.onPress; share(); share(); await settle();
  assert.equal(h.state.shares.length, 1); h.unmount(); assert.equal(h.state.shares[0].signal.aborted, true);
  const writes = h.state.writes; pending.resolve('downloaded'); await settle(); assert.equal(h.state.writes, writes);
});
test('web sharing fallback is disclosed as a download, not a successful share', async () => {
  const h = uiHarness(); h.state.share = async () => 'downloaded'; h.button('Share PDF').props.onPress(); await settle();
  assert.match(h.text(), /PDF download started/);
});
