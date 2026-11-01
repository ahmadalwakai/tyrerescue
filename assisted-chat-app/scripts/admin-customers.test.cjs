const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real native hook/component with synthetic responses. No API,
// database, stored session, or customer record is accessed by these tests.
function load(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, AbortController, URL, URLSearchParams,
    Date, Intl, Error, setTimeout, clearTimeout, ...globals,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function runtime() {
  let current;
  const renderers = new Set();
  const changed = (before, next) => !before || !next || before.length !== next.length || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const renderer = current;
      const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [renderer.hooks[index].value, (value) => {
        renderer.hooks[index].value = typeof value === 'function' ? value(renderer.hooks[index].value) : value;
      }];
    },
    useRef(initial) {
      const renderer = current;
      const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { current: initial };
      return renderer.hooks[index];
    },
    useMemo(create, deps) {
      const renderer = current;
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.hooks[index] = { value: create(), deps };
      return renderer.hooks[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const renderer = current;
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.effects.push(() => {
        renderer.hooks[index]?.cleanup?.();
        renderer.hooks[index] = { deps, cleanup: effect() };
      });
    },
    useLayoutEffect(effect, deps) { return react.useEffect(effect, deps); },
  };
  const create = () => {
    const renderer = { cursor: 0, hooks: [], effects: [] };
    renderers.add(renderer);
    return renderer;
  };
  const render = (renderer, fn) => {
    renderer.cursor = 0; renderer.effects = []; current = renderer;
    const value = fn();
    renderer.effects.forEach((effect) => effect());
    return value;
  };
  const unmount = (renderer) => {
    renderer.hooks.forEach((hook) => hook.cleanup?.());
    renderers.delete(renderer);
  };
  return { react, create, render, unmount };
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const CUSTOMER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const customer = (id = CUSTOMER_ID, extra = {}) => ({
  id, name: 'Synthetic Customer', email: 'customer@example.invalid', phone: '+44 7000 000000',
  emailVerified: false, createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-20T12:00:00.123456Z',
  status: 'active', suspendedAt: null, suspensionReason: null, sessionVersion: 0,
  pendingEmail: null, pendingEmailExpiresAt: null,
  bookingCount: 0, lastBookingAt: null,
  ...extra,
});
const list = (customers = [customer()], extra = {}) => ({ customers, page: 1, perPage: 25, total: customers.length, totalPages: 1, ...extra });
const detail = (id = CUSTOMER_ID, extra = {}) => ({ customer: customer(id, extra), bookings: [], stats: { totalBookings: 0, paidTotal: '0' } });

function hookHarness() {
  const h = runtime();
  const renderer = h.create();
  const context = { authenticated: true, apiRevision: 1, sessionRevision: 1 };
  const input = { search: '', verification: 'all', status: 'all', page: 1, customerId: null };
  const requests = [];
  const request = (method, url, body, options) => new Promise((resolve, reject) => requests.push({ method, url, body, options, resolve, reject }));
  const apiModule = {
    getApiContextRevision: () => context.apiRevision,
    api: {
      get hasAdminToken() { return context.authenticated; },
      get: (url, options) => request('GET', url, undefined, options),
      patch: (url, body, options) => request('PATCH', url, body, options),
      post: (url, body, options) => request('POST', url, body, options),
    },
  };
  const module = load('hooks/useAdminCustomers.ts', {
    react: h.react,
    '@/lib/api': apiModule,
    './useAdminSession': { getAdminSessionRevision: () => context.sessionRevision },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => context.sessionRevision },
    '@/types/admin-customers': load('types/admin-customers.ts'),
  });
  const read = () => h.render(renderer, () => module.useAdminCustomers(input));
  return {
    context, input, requests, read,
    listRequests: () => requests.filter((item) => item.method === 'GET' && item.url.includes('?')),
    detailRequests: () => requests.filter((item) => item.method === 'GET' && !item.url.includes('?')),
    saves: () => requests.filter((item) => item.method === 'PATCH'),
    actions: () => requests.filter((item) => item.method === 'POST'),
    unmount: () => h.unmount(renderer),
  };
}

test('loads paginated customer results and safely encodes search and verification filters', async () => {
  const h = hookHarness();
  h.read();
  assert.equal(h.requests.length, 1);
  assert.equal(h.read().listLoading, true);
  h.listRequests()[0].resolve(list()); await flush();
  assert.equal(h.read().list.customers[0].id, CUSTOMER_ID);
  assert.equal(h.read().listLoading, false);

  h.input.search = 'A+B & Company'; h.input.verification = 'unverified'; h.input.status = 'suspended'; h.input.page = 2;
  assert.equal(h.read().list, null, 'a new query cannot display previous results');
  const request = h.listRequests().at(-1);
  const query = new URL(request.url, 'https://isolated.invalid').searchParams;
  assert.equal(query.get('search'), 'A+B & Company');
  assert.equal(query.get('verification'), 'unverified');
  assert.equal(query.get('status'), 'suspended');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('perPage'), '25');
  request.resolve(list([customer(OTHER_ID)], { page: 2, total: 26, totalPages: 2 })); await flush();
  assert.equal(h.read().list.customers[0].id, OTHER_ID);
  assert.equal(h.read().list.page, 2);
  h.unmount();
});

test('superseded search and detail requests cannot overwrite the selected account', async () => {
  const h = hookHarness(); h.read();
  const firstList = h.listRequests()[0];
  h.input.search = 'new'; h.input.customerId = CUSTOMER_ID; h.read();
  const firstDetail = h.detailRequests()[0];
  assert.equal(firstList.options.signal.aborted, true);
  h.input.customerId = OTHER_ID; h.read();
  assert.equal(firstDetail.options.signal.aborted, true);
  h.listRequests().at(-1).resolve(list([customer(OTHER_ID)]));
  h.detailRequests().at(-1).resolve(detail(OTHER_ID)); await flush();
  firstList.resolve(list()); firstDetail.resolve(detail()); await flush();
  assert.equal(h.read().list.customers[0].id, OTHER_ID);
  assert.equal(h.read().detail.customer.id, OTHER_ID);
  h.unmount();
});

test('logout prevents loading and hides all customer data immediately', async () => {
  const h = hookHarness(); h.context.authenticated = false; h.input.customerId = CUSTOMER_ID;
  assert.equal(h.read().list, null); assert.equal(h.requests.length, 0);
  h.context.authenticated = true; h.context.sessionRevision += 1; h.read();
  h.listRequests().at(-1).resolve(list()); h.detailRequests().at(-1).resolve(detail()); await flush();
  assert.equal(h.read().detail.customer.id, CUSTOMER_ID);
  h.context.authenticated = false;
  assert.equal(h.read().list, null); assert.equal(h.read().detail, null);
  const before = h.requests.length;
  await h.read().refreshList(); await h.read().refreshDetail();
  assert.equal(h.requests.length, before);
  h.unmount();
});

test('project or administrator changes abort reads and reject old responses', async () => {
  for (const field of ['apiRevision', 'sessionRevision']) {
    const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
    const oldList = h.listRequests()[0]; const oldDetail = h.detailRequests()[0];
    h.context[field] += 1;
    assert.equal(h.read().list, null); assert.equal(h.read().detail, null);
    assert.equal(oldList.options.signal.aborted, true); assert.equal(oldDetail.options.signal.aborted, true);
    oldList.resolve(list()); oldDetail.resolve(detail()); await flush();
    assert.equal(h.read().list, null); assert.equal(h.read().detail, null);
    h.listRequests().at(-1).resolve(list([customer(OTHER_ID)]));
    h.detailRequests().at(-1).resolve(detail(CUSTOMER_ID, { name: 'Current workspace' })); await flush();
    assert.equal(h.read().list.customers[0].id, OTHER_ID);
    assert.equal(h.read().detail.customer.name, 'Current workspace');
    h.unmount();
  }
});

test('manual refresh preserves retryable errors and invalid responses never masquerade as empty accounts', async () => {
  const h = hookHarness(); h.read();
  h.listRequests()[0].resolve({ customers: [] }); await flush();
  assert.equal(h.read().list, null); assert.match(h.read().listError, /could not be read/i);
  const refreshing = h.read().refreshList();
  h.listRequests().at(-1).resolve(list()); await refreshing;
  assert.equal(h.read().listError, null);
  const failed = h.read().refreshList();
  h.listRequests().at(-1).reject(new Error('Temporary connection failure')); await failed;
  assert.equal(h.read().list.customers[0].id, CUSTOMER_ID);
  assert.match(h.read().listError, /connection failure/);
  h.unmount();
});

test('a mismatched detail response is rejected instead of showing another customer', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  h.detailRequests()[0].resolve(detail(OTHER_ID)); await flush();
  assert.equal(h.read().detail, null); assert.match(h.read().detailError, /did not match/);
  h.unmount();
});

test('save uses the precise revision, blocks duplicate submissions, updates detail and refreshes the list', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  h.listRequests()[0].resolve(list()); h.detailRequests()[0].resolve(detail()); await flush();
  const input = { name: 'Updated Customer', phone: null, expectedUpdatedAt: h.read().detail.customer.updatedAt };
  const firstSave = h.read().save(input);
  assert.equal(h.read().saveBusy, true);
  assert.equal(await h.read().save(input), false);
  assert.equal(h.saves().length, 1);
  assert.equal(h.saves()[0].body.expectedUpdatedAt, '2026-10-20T12:00:00.123456Z');
  assert.deepEqual(Object.keys(h.saves()[0].body).sort(), ['expectedUpdatedAt', 'name', 'phone']);
  h.saves()[0].resolve({ customer: customer(CUSTOMER_ID, { name: input.name, phone: null, updatedAt: '2026-11-01T12:00:00.654321Z' }) });
  assert.equal(await firstSave, true); await flush();
  assert.equal(h.read().detail.customer.name, 'Updated Customer');
  assert.equal(h.read().detail.customer.phone, null);
  assert.equal(h.read().saveBusy, false);
  assert.equal(h.listRequests().length, 2, 'successful save requests fresh list data');
  h.unmount();
});

test('a conflict leaves the saved profile unchanged and gives a retryable error', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  h.detailRequests()[0].resolve(detail()); await flush();
  const pending = h.read().save({ name: 'Unsaved edit', phone: null, expectedUpdatedAt: customer().updatedAt });
  const error = new Error('This customer changed. Reload the account before saving again.'); error.status = 409;
  h.saves()[0].reject(error);
  assert.equal(await pending, false);
  assert.equal(h.read().detail.customer.name, 'Synthetic Customer');
  assert.equal(h.read().saveBusy, false);
  assert.match(h.read().saveError, /Reload the account/);
  h.read().clearSaveError(); assert.equal(h.read().saveError, null);
  h.unmount();
});

test('unmount aborts reads and writes and a late save never reports success', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  const pending = h.read().save({ name: 'Updated', phone: null, expectedUpdatedAt: customer().updatedAt });
  h.unmount();
  assert.ok(h.requests.every((request) => request.options.signal.aborted));
  h.saves()[0].resolve({ customer: customer() });
  assert.equal(await pending, false);
  assert.equal(h.listRequests().length, 1, 'late mutation does not refresh an unmounted screen');
});

test('an in-flight save cannot claim success after a workspace or administrator switch', async () => {
  for (const field of ['apiRevision', 'sessionRevision']) {
    const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
    h.detailRequests()[0].resolve(detail()); await flush();
    const pending = h.read().save({ name: 'Old workspace edit', phone: null, expectedUpdatedAt: customer().updatedAt });
    h.context[field] += 1;
    h.saves()[0].resolve({ customer: customer(CUSTOMER_ID, { name: 'Old workspace edit' }) });
    assert.equal(await pending, false);
    assert.equal(h.listRequests().length, 1, 'the old save cannot refresh using new credentials');
    h.unmount();
  }
});

function componentHarness() {
  const h = runtime();
  const renderers = new Map();
  const timers = new Map();
  let timerId = 0;
  const state = {
    visible: true, authenticated: true, projectId: 'tyrerescue', apiRevision: 1, sessionRevision: 1,
    query: null, closeCount: 0, dismissed: 0, updated: 0, alert: null, saves: [], saveResult: true, actions: [], actionResult: true,
    model: {
      list: list([customer()], { total: 51, totalPages: 3 }), listLoading: false, listError: null,
      detail: null, detailLoading: false, detailError: null, saveBusy: false, saveError: null,
      refreshList() {}, refreshDetail() {}, clearSaveError() { state.model.saveError = null; },
      async save(input) {
        state.saves.push(input);
        if (state.saveResult) state.model.detail = { ...state.model.detail, customer: { ...state.model.detail.customer, name: input.name, phone: input.phone } };
        return state.saveResult;
      },
      async performAction(input) {
        state.actions.push(input);
        if (!state.actionResult) return null;
        const deleted = input.action === 'delete';
        let updated = state.model.detail.customer;
        if (input.action === 'suspend') updated = { ...updated, status: 'suspended', suspensionReason: input.reason, suspendedAt: '2026-11-01T12:00:00Z' };
        if (input.action === 'reactivate') updated = { ...updated, status: 'active', suspensionReason: null, suspendedAt: null };
        if (input.action === 'email_change') updated = { ...updated, pendingEmail: input.email, pendingEmailExpiresAt: '2026-11-02T12:00:00Z' };
        if (!deleted) state.model.detail = { ...state.model.detail, customer: updated };
        return { success: true, action: input.action, customer: deleted ? null : updated, deleted, message: 'Account action completed.' };
      },
    },
  };
  const node = (type, props, key) => ({ type, props, key });
  const shared = {
    react: h.react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    '@/lib/api': { getApiContextRevision: () => state.apiRevision, api: { get hasAdminToken() { return state.authenticated; } } },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    './ui': { AppButton: 'AppButton', FieldLabel: 'FieldLabel', Input: 'Input' },
    './theme': load('components/theme.ts'),
  };
  const accountActions = load('components/CustomerAccountActions.tsx', {
    ...shared,
    'react-native': { Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } },
  });
  const component = load('components/AdminCustomersModal.tsx', {
    ...shared,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', Modal: 'Modal', Pressable: 'Pressable',
      RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: (value) => value },
      Alert: { alert: (title, message, buttons) => { state.alert = { title, message, buttons }; } },
    },
    './CustomerAccountActions': accountActions,
    '@/hooks/useAdminCustomers': { useAdminCustomers: (query) => { state.query = query; return state.model; } },
    './layout/AdminModalShell': { AdminModalHeader: 'AdminModalHeader', AdminModalShell: 'AdminModalShell' },
  }, {
    setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const read = () => {
    const visited = new Set();
    const expand = (tree, location = 'root') => {
      if (tree == null || typeof tree !== 'object') return tree;
      if (Array.isArray(tree)) return tree.map((child, index) => expand(child, `${location}.${index}`));
      if (typeof tree.type === 'function') {
        const key = `${location}:${tree.type.name}:${tree.key ?? ''}`;
        visited.add(key);
        if (!renderers.has(key)) renderers.set(key, h.create());
        return expand(h.render(renderers.get(key), () => tree.type(tree.props)), `${key}.render`);
      }
      const props = { ...tree.props };
      const children = [props.children];
      if (tree.type === 'FlatList') {
        children.push(props.ListHeaderComponent, ...props.data.map((item, index) => props.renderItem({ item, index })), props.data.length ? null : props.ListEmptyComponent, props.ListFooterComponent);
      }
      props.children = expand(children, `${location}.children`);
      return { ...tree, props };
    };
    const tree = expand(node(component.AdminCustomersModal, {
      visible: state.visible, projectId: state.projectId,
      onClose: () => { state.closeCount += 1; },
      onDismiss: () => { state.dismissed += 1; },
      onCustomerUpdated: () => { state.updated += 1; },
    }));
    for (const [key, renderer] of renderers) if (!visited.has(key)) { h.unmount(renderer); renderers.delete(key); }
    return tree;
  };
  const walk = (tree) => tree == null || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(walk) : [tree, ...walk(tree.props?.children)];
  const find = (id) => walk(read()).find((item) => item.props?.testID === id);
  const ofType = (type) => walk(read()).filter((item) => item.type === type);
  const tick = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); };
  const openDetail = () => { state.model.detail = detail(); find(`customer-row-${CUSTOMER_ID}`).props.onPress(); read(); };
  const unmount = () => { for (const renderer of renderers.values()) h.unmount(renderer); };
  return { state, read, find, ofType, tick, openDetail, unmount };
}

test('customer search and filters reset pagination, and opening a row selects its account', () => {
  const h = componentHarness(); h.read();
  assert.equal(h.state.query.page, 1);
  h.find('customer-next').props.onPress(); h.read();
  assert.equal(h.state.query.page, 2);
  h.find('customer-search').props.onChangeText('  sample customer  '); h.read();
  h.tick(); h.read();
  assert.equal(h.state.query.search, 'sample customer'); assert.equal(h.state.query.page, 1);
  h.find('customer-next').props.onPress(); h.read();
  h.find('customer-filter-unverified').props.onPress(); h.read();
  assert.equal(h.state.query.verification, 'unverified'); assert.equal(h.state.query.page, 1);
  h.find('customer-next').props.onPress(); h.read();
  h.find('customer-status-suspended').props.onPress(); h.read();
  assert.equal(h.state.query.status, 'suspended'); assert.equal(h.state.query.page, 1);
  h.find(`customer-row-${CUSTOMER_ID}`).props.onPress(); h.read();
  assert.equal(h.state.query.customerId, CUSTOMER_ID);
  h.unmount();
});

test('customer editor keeps email read-only and saves only validated name and phone', async () => {
  const h = componentHarness(); h.openDetail();
  assert.equal(h.find('customer-email-readonly').type, 'Text');
  h.find('customer-edit').props.onPress(); h.read();
  assert.equal(h.find('customer-email-readonly').type, 'Text');
  assert.equal(h.ofType('Input').length, 2);
  assert.equal(h.find('customer-save').props.disabled, true);
  h.find('customer-name-input').props.onChangeText('X');
  h.find('customer-save').props.onPress(); await flush();
  assert.equal(h.state.saves.length, 0); assert.match(JSON.stringify(h.read()), /between 2 and 255/);
  h.find('customer-name-input').props.onChangeText('  Updated Customer  ');
  h.find('customer-phone-input').props.onChangeText('not a phone');
  h.find('customer-save').props.onPress(); await flush();
  assert.equal(h.state.saves.length, 0); assert.match(JSON.stringify(h.read()), /valid phone number/);
  h.find('customer-phone-input').props.onChangeText('');
  h.find('customer-save').props.onPress(); await flush(); h.read();
  assert.equal(h.state.saves.length, 1);
  assert.equal(h.state.saves[0].name, 'Updated Customer');
  assert.equal(h.state.saves[0].phone, null);
  assert.equal(h.state.saves[0].expectedUpdatedAt, '2026-10-20T12:00:00.123456Z');
  assert.equal('email' in h.state.saves[0], false);
  assert.equal(h.state.updated, 1); assert.match(JSON.stringify(h.read()), /Customer details saved/);
  h.unmount();
});

test('failed save retains edits and busy state disables editing and navigation', async () => {
  const h = componentHarness(); h.openDetail(); h.find('customer-edit').props.onPress(); h.read();
  h.find('customer-name-input').props.onChangeText('Unsaved Customer');
  h.state.saveResult = false; h.state.model.saveError = 'Updated elsewhere. Reload details.';
  h.find('customer-save').props.onPress(); await flush();
  assert.equal(h.find('customer-name-input').props.value, 'Unsaved Customer');
  assert.equal(h.state.updated, 0); assert.ok(h.find('customer-reload'));
  h.state.model.saveBusy = true;
  assert.equal(h.find('customer-name-input').props.editable, false);
  assert.equal(h.find('customer-phone-input').props.editable, false);
  assert.equal(h.find('customer-save').props.loading, true);
  assert.equal(h.find('customer-back').props.disabled, true);
  h.find('customer-save').props.onPress(); await flush();
  assert.equal(h.state.saves.length, 1);
  h.unmount();
});

test('unsaved changes require discard before leaving the customer, while keep editing preserves inputs', () => {
  const h = componentHarness(); h.openDetail(); h.find('customer-edit').props.onPress(); h.read();
  h.find('customer-name-input').props.onChangeText('Unsaved Customer');
  h.find('customer-back').props.onPress();
  assert.equal(h.state.alert.title, 'Discard changes?');
  assert.equal(h.state.query.customerId, CUSTOMER_ID);
  assert.equal(h.state.alert.buttons[0].style, 'cancel');
  assert.equal(h.find('customer-name-input').props.value, 'Unsaved Customer');
  h.state.alert.buttons.find((button) => button.text === 'Discard').onPress(); h.read();
  assert.equal(h.state.query.customerId, null);
  h.unmount();
});

test('closing, logout and workspace changes discard the mounted manager and its search state', () => {
  for (const change of ['close', 'logout', 'project', 'api', 'session']) {
    const h = componentHarness();
    h.find('customer-search').props.onChangeText('Old scope query'); h.read(); h.tick(); h.read();
    assert.equal(h.state.query.search, 'Old scope query');
    if (change === 'close') h.state.visible = false;
    if (change === 'logout') h.state.authenticated = false;
    if (change === 'project') h.state.projectId = 'another-project';
    if (change === 'api') h.state.apiRevision += 1;
    if (change === 'session') h.state.sessionRevision += 1;
    h.read();
    if (change === 'close' || change === 'logout') {
      assert.equal(h.ofType('Modal')[0].props.visible, false);
      assert.equal(h.find('customer-search'), undefined);
      h.state.visible = true; h.state.authenticated = true; h.read();
    }
    assert.equal(h.state.query.search, '');
    assert.equal(h.state.query.page, 1);
    assert.equal(h.find('customer-search').props.value, '');
    h.ofType('Modal')[0].props.onDismiss(); assert.equal(h.state.dismissed, 1);
    h.unmount();
  }
});

test('account actions share the profile mutation lock and preserve the exact revision', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  h.detailRequests()[0].resolve(detail()); await flush();
  const input = { action: 'suspend', reason: 'Repeated abusive contact', expectedUpdatedAt: customer().updatedAt };
  const action = h.read().performAction(input);
  assert.equal(h.read().saveBusy, true);
  assert.equal(await h.read().performAction(input), null);
  assert.equal(await h.read().save({ name: 'Changed', phone: null, expectedUpdatedAt: customer().updatedAt }), false);
  assert.equal(h.actions().length, 1); assert.equal(h.saves().length, 0);
  assert.match(h.actions()[0].url, /\/customers\/.+\/actions$/);
  assert.equal(h.actions()[0].body.expectedUpdatedAt, '2026-10-20T12:00:00.123456Z');
  h.actions()[0].resolve({ success: true, action: 'suspend', deleted: false, message: 'Customer suspended.', customer: customer(CUSTOMER_ID, { status: 'suspended', suspendedAt: '2026-11-01T12:00:00Z', suspensionReason: input.reason, sessionVersion: 1 }) });
  assert.equal((await action).action, 'suspend');
  assert.equal(h.read().detail.customer.status, 'suspended'); assert.equal(h.read().saveBusy, false);
  assert.equal(h.listRequests().length, 2);
  h.unmount();
});

test('actions reject conflicts, mismatched accounts and ambiguous deletion responses', async () => {
  for (const response of [
    { success: true, action: 'reactivate', deleted: false, message: 'Done', customer: customer(OTHER_ID) },
    { success: true, action: 'delete', deleted: false, message: 'Done', customer: null },
  ]) {
    const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read(); h.detailRequests()[0].resolve(detail()); await flush();
    const input = response.action === 'delete' ? { action: 'delete', confirmation: 'DELETE', expectedUpdatedAt: customer().updatedAt } : { action: 'reactivate', expectedUpdatedAt: customer().updatedAt };
    const pending = h.read().performAction(input); h.actions()[0].resolve(response);
    assert.equal(await pending, null); assert.ok(h.read().saveError); assert.equal(h.read().detail.customer.id, CUSTOMER_ID);
    h.unmount();
  }
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read(); h.detailRequests()[0].resolve(detail()); await flush();
  const pending = h.read().performAction({ action: 'revoke_sessions', expectedUpdatedAt: customer().updatedAt });
  h.actions()[0].reject(new Error('Changed elsewhere. Reload this customer.'));
  assert.equal(await pending, null); assert.match(h.read().saveError, /Reload/); assert.equal(h.read().detail.customer.sessionVersion, 0);
  h.unmount();
});

test('email change and password reset use separate endpoints without sending an arbitrary reset recipient', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read(); h.detailRequests()[0].resolve(detail()); await flush();
  const pending = h.read().performAction({ action: 'email_change', email: 'new@example.invalid', expectedUpdatedAt: customer().updatedAt });
  assert.match(h.actions()[0].url, /\/email-change$/);
  assert.deepEqual(Object.keys(h.actions()[0].body).sort(), ['email', 'expectedUpdatedAt']);
  h.actions()[0].resolve({ success: true, message: 'Verification sent.', customer: customer(CUSTOMER_ID, { pendingEmail: 'new@example.invalid', pendingEmailExpiresAt: '2026-11-02T12:00:00Z' }) });
  assert.equal((await pending).action, 'email_change');
  assert.equal(h.read().detail.customer.email, 'customer@example.invalid');
  assert.equal(h.read().detail.customer.pendingEmail, 'new@example.invalid');
  const reset = h.read().performAction({ action: 'password_reset', expectedUpdatedAt: customer().updatedAt });
  assert.match(h.actions()[1].url, /\/password-reset$/);
  assert.deepEqual(Object.keys(h.actions()[1].body), ['expectedUpdatedAt']);
  h.actions()[1].resolve({ success: true, message: 'Reset link sent.' });
  assert.equal((await reset).action, 'password_reset'); assert.equal(h.read().detail.customer.email, 'customer@example.invalid');
  h.unmount();
});

test('deleted accounts are removed from detail and refresh the customer list', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read(); h.detailRequests()[0].resolve(detail()); await flush();
  const pending = h.read().performAction({ action: 'delete', confirmation: 'DELETE', expectedUpdatedAt: customer().updatedAt });
  h.actions()[0].resolve({ success: true, action: 'delete', deleted: true, customer: null, message: 'Account deleted.' });
  assert.equal((await pending).deleted, true); assert.equal(h.read().detail, null); assert.equal(h.listRequests().length, 2);
  h.unmount();
});

test('confirmed deletion removes the row and decrements totals before refresh, including when refresh fails', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.input.page = 2; h.read();
  h.listRequests()[0].resolve(list([customer()], { page: 2, total: 26, totalPages: 2 }));
  h.detailRequests()[0].resolve(detail()); await flush();
  const olderRefresh = h.read().refreshList();
  const oldRequest = h.listRequests().at(-1);
  const pending = h.read().performAction({ action: 'delete', confirmation: 'DELETE', expectedUpdatedAt: customer().updatedAt });
  h.actions()[0].resolve({ success: true, action: 'delete', deleted: true, customer: null, message: 'Account deleted.' });
  assert.equal((await pending).deleted, true);
  assert.equal(h.read().listLoading, true);
  assert.equal(h.read().list.customers.length, 0);
  assert.equal(h.read().list.total, 25);
  assert.equal(h.read().list.totalPages, 1);
  assert.equal(oldRequest.options.signal.aborted, true);
  oldRequest.resolve(list([customer()], { page: 2, total: 26, totalPages: 2 })); await olderRefresh;
  h.listRequests().at(-1).reject(new Error('Refresh unavailable')); await flush();
  assert.equal(h.read().list.customers.length, 0, 'late or failed reads cannot restore a confirmed deleted row');
  assert.equal(h.read().list.total, 25);
  assert.equal(h.read().list.totalPages, 1);
  assert.match(h.read().listError, /Refresh unavailable/);
  h.unmount();
});

test('a deleted final-page row still leaves a working Previous button', () => {
  const h = componentHarness(); h.read();
  h.find('customer-next').props.onPress(); h.read();
  h.state.model.list = list([], { page: 2, total: 25, totalPages: 1 });
  assert.match(JSON.stringify(h.read()), /page is now empty/);
  assert.equal(h.find('customer-previous').props.disabled, false);
  assert.equal(h.find('customer-next').props.disabled, true);
  h.find('customer-previous').props.onPress(); h.read();
  assert.equal(h.state.query.page, 1);
  h.unmount();
});

test('retained action callbacks cannot mutate a newly selected account or a reopened selection', async () => {
  const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
  const oldAction = h.read().performAction;
  h.input.customerId = OTHER_ID; h.read();
  assert.equal(await oldAction({ action: 'revoke_sessions', expectedUpdatedAt: customer().updatedAt }), null);
  h.input.customerId = CUSTOMER_ID; h.read();
  assert.equal(await oldAction({ action: 'revoke_sessions', expectedUpdatedAt: customer().updatedAt }), null);
  assert.equal(h.actions().length, 0);
  h.unmount();
});

test('action requests abort on account change or unmount and cannot report late success', async () => {
  for (const change of ['account', 'api', 'session', 'unmount']) {
    const h = hookHarness(); h.input.customerId = CUSTOMER_ID; h.read();
    const pending = h.read().performAction({ action: 'revoke_sessions', expectedUpdatedAt: customer().updatedAt });
    if (change === 'account') { h.input.customerId = OTHER_ID; h.read(); }
    if (change === 'api') { h.context.apiRevision += 1; h.read(); }
    if (change === 'session') { h.context.sessionRevision += 1; h.read(); }
    if (change === 'unmount') h.unmount();
    assert.equal(h.actions()[0].options.signal.aborted, true);
    h.actions()[0].resolve({ success: true, action: 'revoke_sessions', deleted: false, customer: customer(), message: 'Signed out.' });
    assert.equal(await pending, null);
    if (change !== 'unmount') h.unmount();
  }
});

test('suspension requires an explanation and shows the specific account before submitting', async () => {
  const h = componentHarness(); h.openDetail();
  h.find('customer-change-status').props.onPress(); h.read();
  assert.ok(h.find('customer-confirm-suspend')); assert.match(JSON.stringify(h.read()), /customer@example.invalid/);
  h.find('customer-action-submit').props.onPress(); await flush();
  assert.equal(h.state.actions.length, 0); assert.match(JSON.stringify(h.read()), /reason between 3 and 500/);
  h.find('customer-suspension-reason').props.onChangeText('  Abuse reported  ');
  h.find('customer-action-submit').props.onPress(); await flush(); h.read();
  assert.equal(h.state.actions[0].action, 'suspend'); assert.equal(h.state.actions[0].reason, 'Abuse reported');
  assert.equal(h.state.actions[0].expectedUpdatedAt, customer().updatedAt);
  assert.equal(h.state.model.detail.customer.status, 'suspended'); assert.ok(h.find('customer-action-success'));
  h.find('customer-action-done').props.onPress(); h.read();
  assert.equal(h.find('customer-reset-password').props.disabled, true);
  assert.equal(h.find('customer-change-email').props.disabled, true);
  h.find('customer-change-status').props.onPress(); h.read();
  assert.ok(h.find('customer-confirm-reactivate'));
  h.find('customer-action-submit').props.onPress(); await flush();
  assert.equal(h.state.actions[1].action, 'reactivate'); assert.equal(h.state.model.detail.customer.status, 'active');
  h.unmount();
});

test('deletion requires exact DELETE confirmation and returns to the list only after success', async () => {
  const h = componentHarness(); h.openDetail(); h.find('customer-delete').props.onPress(); h.read();
  assert.ok(h.find('customer-confirm-delete'));
  assert.equal(h.find('customer-action-submit').props.disabled, true);
  h.find('customer-delete-confirmation').props.onChangeText('delete');
  h.find('customer-action-submit').props.onPress(); await flush();
  assert.equal(h.state.actions.length, 0);
  h.find('customer-delete-confirmation').props.onChangeText('DELETE');
  assert.equal(h.find('customer-action-submit').props.disabled, false);
  h.state.actionResult = false; h.state.model.saveError = 'Cannot delete an account with active work.';
  h.find('customer-action-submit').props.onPress(); await flush();
  assert.equal(h.state.query.customerId, CUSTOMER_ID); assert.equal(h.find('customer-delete-confirmation').props.value, 'DELETE');
  h.state.actionResult = true; h.state.model.saveError = null;
  h.find('customer-action-submit').props.onPress(); await flush(); h.read();
  assert.equal(h.state.actions[1].action, 'delete'); assert.equal(h.state.actions[1].confirmation, 'DELETE');
  assert.equal(h.state.query.customerId, null); assert.equal(h.state.updated, 1);
  h.unmount();
});

test('email change verifies the new address without editing the current sign-in address', async () => {
  const h = componentHarness(); h.openDetail(); h.find('customer-change-email').props.onPress(); h.read();
  assert.match(JSON.stringify(h.read()), /current sign-in email stays unchanged until the customer confirms/);
  assert.match(JSON.stringify(h.read()), /Forgot password/);
  h.find('customer-new-email').props.onChangeText('customer@example.invalid');
  h.find('customer-action-submit').props.onPress(); await flush();
  assert.equal(h.state.actions.length, 0); assert.match(JSON.stringify(h.read()), /different email/);
  h.find('customer-new-email').props.onChangeText('  NEW@example.invalid  ');
  h.find('customer-action-submit').props.onPress(); await flush(); h.read();
  assert.equal(h.state.actions[0].email, 'new@example.invalid');
  assert.equal(h.find('customer-email-readonly').props.children.flat(Infinity)[0], 'customer@example.invalid');
  assert.match(JSON.stringify(h.read()), /Pending email/); assert.match(JSON.stringify(h.read()), /new@example.invalid/);
  h.unmount();
});

test('password reset and device sign-out require an account-specific confirmation and honor busy state', async () => {
  for (const [button, action] of [['customer-reset-password', 'password_reset'], ['customer-revoke-sessions', 'revoke_sessions']]) {
    const h = componentHarness(); h.openDetail(); h.find(button).props.onPress(); h.read();
    assert.ok(h.find(`customer-confirm-${action}`)); assert.equal(h.state.actions.length, 0);
    assert.match(JSON.stringify(h.read()), /customer@example.invalid/);
    h.state.model.saveBusy = true;
    assert.equal(h.find('customer-action-submit').props.loading, true); assert.equal(h.find('customer-action-cancel').props.disabled, true);
    h.find('customer-action-submit').props.onPress(); await flush(); assert.equal(h.state.actions.length, 0);
    h.state.model.saveBusy = false;
    const submit = h.find('customer-action-submit').props.onPress;
    submit(); submit(); await flush();
    assert.equal(h.state.actions.length, 1); assert.equal(h.state.actions[0].action, action);
    submit(); await flush(); assert.equal(h.state.actions.length, 1, 'a completed confirmation cannot be replayed');
    h.unmount();
  }
});

test('stale confirmations cannot run after cancel, close, logout, account, project or session change', async () => {
  for (const change of ['cancel', 'close', 'logout', 'account', 'project', 'api', 'session']) {
    const h = componentHarness(); h.openDetail(); h.find('customer-delete').props.onPress(); h.read();
    h.find('customer-delete-confirmation').props.onChangeText('DELETE');
    const submit = h.find('customer-action-submit').props.onPress;
    if (change === 'cancel') h.find('customer-action-cancel').props.onPress();
    if (change === 'close') h.state.visible = false;
    if (change === 'logout') h.state.authenticated = false;
    if (change === 'account') h.find('customer-back').props.onPress();
    if (change === 'project') h.state.projectId = 'other-project';
    if (change === 'api') h.state.apiRevision += 1;
    if (change === 'session') h.state.sessionRevision += 1;
    h.read(); submit(); await flush();
    assert.equal(h.state.actions.length, 0, `${change} must invalidate confirmation`);
    h.unmount();
  }
});
