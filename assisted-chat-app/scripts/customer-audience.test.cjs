const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function load(relative, dependencies, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, AbortController, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const customerSummary = (customers = 12) => ({ checkedAt: '2026-10-28T12:00:00Z', stats: {
  customers, verifiedCustomers: customers - 2, unverifiedCustomers: 2,
  customersToday: 1, customersLast7Days: 3, customersLast30Days: 5,
} });
const downloadSummary = (extra = {}) => ({ appId: '6782555222', metric: 'first_time_downloads', status: 'ready', firstTimeDownloads: 37,
  periodStart: '2026-10-01', periodEnd: '2026-10-27', checkedAt: '2026-10-28T12:00:00Z', lastReportDate: '2026-10-27',
  message: '', stale: false, coverage: 'available_period', ...extra });

function runtime() {
  const state = { appState: 'active', listeners: [], intervals: [], hooks: [], effects: [], cursor: 0 };
  const changed = (a, b) => !a || !b || b.some((value, index) => value !== a[index]);
  const react = {
    useState(initial) {
      const index = state.cursor++;
      if (!state.hooks[index]) state.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [state.hooks[index].value, (value) => { state.hooks[index].value = typeof value === 'function' ? value(state.hooks[index].value) : value; }];
    },
    useRef(initial) { const index = state.cursor++; if (!state.hooks[index]) state.hooks[index] = { current: initial }; return state.hooks[index]; },
    useCallback(fn, deps) {
      const index = state.cursor++;
      if (!state.hooks[index] || changed(state.hooks[index].deps, deps)) state.hooks[index] = { value: fn, deps };
      return state.hooks[index].value;
    },
    useEffect(effect, deps) {
      const index = state.cursor++;
      if (!state.hooks[index] || changed(state.hooks[index].deps, deps)) {
        state.effects.push(() => { state.hooks[index]?.cleanup?.(); state.hooks[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const native = { Platform: { OS: 'ios' }, AppState: {
    get currentState() { return state.appState; },
    addEventListener(_, callback) { state.listeners.push(callback); return { remove() { state.listeners = state.listeners.filter((value) => value !== callback); } }; },
  } };
  const clock = {
    setInterval(fn, intervalMs) { state.intervals.push({ fn, intervalMs }); return state.intervals.length; },
    clearInterval(id) { state.intervals[id - 1] = null; },
  };
  return { state, react, native, clock,
    render(fn) { state.cursor = 0; state.effects = []; const output = fn(); state.effects.forEach((effect) => effect()); return output; },
    tick() { state.intervals.filter(Boolean).forEach(({ fn }) => fn()); },
    background() { state.appState = 'background'; state.listeners.forEach((callback) => callback('background')); },
    foreground() { state.appState = 'active'; state.listeners.forEach((callback) => callback('active')); },
    unmount() { state.hooks.forEach((hook) => hook.cleanup?.()); },
  };
}

function hookHarness() {
  const h = runtime();
  const state = { authenticated: true, enabled: true, projectId: 'tyrerescue', apiRevision: 1, sessionRevision: 1, requests: [] };
  const polling = load('hooks/usePolling.ts', { react: h.react, 'react-native': h.native }, h.clock);
  const audience = load('hooks/useCustomerAudience.ts', {
    react: h.react,
    '@/lib/api': {
      getApiContextRevision: () => state.apiRevision,
      api: {
        get hasAdminToken() { return state.authenticated; },
        get(url, options) { return new Promise((resolve, reject) => state.requests.push({ url, options, resolve, reject })); },
      },
    },
    './useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    './usePolling': polling,
  });
  const read = () => h.render(() => audience.useCustomerAudience(state.enabled, state.projectId));
  const customers = () => state.requests.filter((request) => request.url.includes('/customers/'));
  const downloads = () => state.requests.filter((request) => request.url.includes('/app-downloads'));
  return { ...h, state: { ...h.state, ...state }, context: state, requests: state.requests, customers, downloads, read, parse: audience.parseCustomerSummary, parseDownloads: audience.parseAppDownloadSummary };
}

test('registered customer totals use customer fields only and reject missing or inconsistent counts', () => {
  const h = hookHarness();
  const parsed = h.parse({ ...customerSummary(), admins: 1000, drivers: 2000, totalUsers: 3012 });
  assert.equal(parsed.stats.customers, 12);
  assert.equal(parsed.stats.verifiedCustomers, 10);
  for (const value of [{}, { stats: customerSummary().stats }, { ...customerSummary(), stats: { ...customerSummary().stats, customers: -1 } }, { ...customerSummary(), stats: { ...customerSummary().stats, verifiedCustomers: 12 } }]) {
    assert.throws(() => h.parse(value));
  }
});

test('customer count loads independently and automatically refreshes every minute only in foreground', async () => {
  const h = hookHarness();
  assert.equal(h.read().customers.data, null);
  assert.equal(h.read().customers.loading, true);
  assert.equal(h.customers().length, 1);
  h.customers()[0].resolve(customerSummary()); await flush();
  assert.equal(h.read().customers.data.stats.customers, 12);
  assert.ok(h.state.intervals.filter(Boolean).every(({ intervalMs }) => intervalMs === 60_000));
  h.tick();
  assert.equal(h.customers().length, 2);
  h.tick();
  assert.equal(h.customers().length, 2, 'no overlapping poll');
  h.customers()[1].resolve(customerSummary(13)); await flush();
  assert.equal(h.read().customers.data.stats.customers, 13);
  h.background(); h.tick();
  assert.equal(h.customers().length, 2);
  h.foreground();
  assert.equal(h.customers().length, 3);
  h.unmount();
});

test('failures display unavailable instead of zero and preserve the last successful snapshot as stale', async () => {
  const h = hookHarness(); h.read();
  h.customers()[0].reject(new Error('offline')); await flush();
  assert.equal(h.read().customers.data, null);
  assert.match(h.read().customers.error, /unavailable/);
  void h.read().customers.refresh();
  h.customers()[1].resolve(customerSummary()); await flush();
  assert.equal(h.read().customers.error, null);
  void h.read().customers.refresh();
  h.customers()[2].reject(new Error('offline')); await flush();
  assert.equal(h.read().customers.data.stats.customers, 12);
  assert.equal(h.read().customers.data.checkedAt, customerSummary().checkedAt);
  assert.match(h.read().customers.error, /unavailable/);
  h.unmount();
});

test('switching project or credentials removes old counts immediately and ignores late responses', async () => {
  for (const field of ['projectId', 'apiRevision', 'sessionRevision']) {
    const h = hookHarness(); h.read();
    h.context[field] = field === 'projectId' ? 'fitmytyre' : 2;
    assert.equal(h.read().customers.data, null);
    assert.equal(h.customers()[0].options.signal.aborted, true);
    h.customers()[0].resolve(customerSummary(99)); await flush();
    assert.equal(h.read().customers.data, null);
    h.customers()[1].resolve(customerSummary(15)); await flush();
    assert.equal(h.read().customers.data.stats.customers, 15);
    h.unmount();
  }
});

test('logout, disable and unmount stop requests and late results cannot expose a previous count', async () => {
  const h = hookHarness(); h.context.authenticated = false;
  assert.equal(h.read().customers.data, null);
  assert.equal(h.requests.length, 0);
  h.context.authenticated = true; h.read();
  h.context.enabled = false; h.read();
  assert.equal(h.customers()[0].options.signal.aborted, true);
  h.customers()[0].resolve(customerSummary()); await flush();
  assert.equal(h.read().customers.data, null);
  h.context.enabled = true; h.read(); h.unmount();
  assert.equal(h.customers()[1].options.signal.aborted, true);
  const count = h.requests.length; h.tick(); assert.equal(h.requests.length, count);
});

test('manual refresh replaces the outstanding request so its late response cannot overwrite new totals', async () => {
  const h = hookHarness(); h.read();
  void h.read().customers.refresh();
  assert.equal(h.customers()[0].options.signal.aborted, true);
  h.customers()[1].resolve(customerSummary(14)); await flush();
  h.customers()[0].resolve(customerSummary(12)); await flush();
  assert.equal(h.read().customers.data.stats.customers, 14);
  h.unmount();
});

function cardHarness() {
  const h = runtime();
  const state = { enabled: true, refreshes: 0, audience: {
    customers: { data: null, loading: false, error: 'Customer count unavailable. Tap Refresh to try again.' },
    downloads: { visible: false, data: null, loading: false, error: null },
    refresh: async () => { state.refreshes += 1; },
  } };
  const node = (type, props) => ({ type, props });
  const theme = load('components/theme.ts', {});
  const module = load('components/CustomerAudienceCard.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } },
    '@/hooks/useCustomerAudience': { useCustomerAudience: () => state.audience },
    './ui': { AppButton: 'AppButton' }, './theme': theme,
  });
  const read = () => h.render(() => module.CustomerAudienceCard({ enabled: state.enabled, projectId: 'tyrerescue' }));
  const walk = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(walk) : [tree, ...walk(tree.props?.children)];
  const find = (id) => walk(read()).find((item) => item.props?.testID === id);
  return { state, read, find };
}

test('the visible card never labels unavailable data as zero and makes manual retry available', () => {
  const h = cardHarness();
  assert.equal(h.find('registered-customers-count').props.children, '—');
  assert.match(JSON.stringify(h.read()), /Customer count unavailable/);
  h.find('customer-audience-refresh').props.onPress();
  assert.equal(h.state.refreshes, 1);
  h.state.audience.customers = { ...h.state.audience.customers, data: customerSummary(), error: null };
  assert.equal(h.find('registered-customers-count').props.children, '12');
  h.find('customer-audience-details').props.onPress();
  assert.match(JSON.stringify(h.read()), /exclude staff and anonymous visitors/);
  assert.match(JSON.stringify(h.read()), /Registered in last 30 days/);
  h.state.enabled = false;
  assert.equal(h.read(), null);
});

test('Apple reports validate the customer app, first-time metric, real reporting period and nullable pending count', () => {
  const h = hookHarness();
  assert.equal(h.parseDownloads(downloadSummary({ firstTimeDownloads: 0 })).firstTimeDownloads, 0, 'a confirmed zero is valid');
  assert.equal(h.parseDownloads(downloadSummary({ status: 'pending', firstTimeDownloads: null, periodStart: null, periodEnd: null, lastReportDate: null })).firstTimeDownloads, null);
  for (const extra of [{ appId: 'other-app' }, { metric: 'total_downloads' }, { firstTimeDownloads: -1 }, { periodStart: null }, { periodEnd: '2026-02-30' }, { periodStart: '2026-11-01' }, { status: 'pending', firstTimeDownloads: 0 }]) {
    assert.throws(() => h.parseDownloads(downloadSummary(extra)));
  }
});

test('Apple requests are independent from customer counts and hidden outside the Tyre Rescue project', async () => {
  const h = hookHarness(); h.read();
  assert.equal(h.downloads().length, 1);
  h.customers()[0].resolve(customerSummary()); await flush();
  assert.equal(h.read().customers.data.stats.customers, 12, 'slow Apple response does not block customers');
  assert.equal(h.read().downloads.loading, true);
  h.downloads()[0].reject(new Error('Apple unavailable')); await flush();
  assert.equal(h.read().downloads.data, null);
  assert.match(h.read().downloads.error, /unavailable/);
  assert.equal(h.read().customers.error, null);
  h.context.projectId = 'fitmytyre'; h.read();
  assert.equal(h.read().downloads.visible, false);
  assert.equal(h.read().downloads.data, null);
  assert.equal(h.downloads().length, 1);
  h.unmount();
});

test('Apple pending becomes a report automatically and refresh failures keep its dated snapshot', async () => {
  const h = hookHarness(); h.read();
  h.downloads()[0].resolve(downloadSummary({ status: 'pending', firstTimeDownloads: null, periodStart: null, periodEnd: null, lastReportDate: null, message: 'Apple is preparing the first report.' })); await flush();
  assert.equal(h.read().downloads.data.status, 'pending');
  h.tick();
  h.downloads()[1].resolve(downloadSummary()); await flush();
  assert.equal(h.read().downloads.data.firstTimeDownloads, 37);
  void h.read().downloads.refresh();
  h.downloads()[2].reject(new Error('temporary outage')); await flush();
  assert.equal(h.read().downloads.data.lastReportDate, '2026-10-27');
  assert.equal(h.read().downloads.data.firstTimeDownloads, 37);
  assert.match(h.read().downloads.error, /unavailable/);
  h.unmount();
});

test('a late Apple response from a different project or administrator is never displayed', async () => {
  for (const field of ['projectId', 'apiRevision', 'sessionRevision']) {
    const h = hookHarness(); h.read();
    h.context[field] = field === 'projectId' ? 'fitmytyre' : 2;
    h.read();
    assert.equal(h.downloads()[0].options.signal.aborted, true);
    h.downloads()[0].resolve(downloadSummary()); await flush();
    assert.equal(h.read().downloads.data, null);
    h.unmount();
  }
});

test('download card labels pending without zero, available coverage without claiming all time, and stale data with date', () => {
  const h = cardHarness();
  h.state.audience.downloads.visible = true;
  h.state.audience.downloads.data = downloadSummary({ status: 'pending', firstTimeDownloads: null, periodStart: null, periodEnd: null, lastReportDate: null, message: 'Apple is preparing the first report.' });
  assert.equal(h.find('app-store-downloads-count').props.children, '—');
  assert.match(JSON.stringify(h.read()), /Preparing Apple reports/);
  h.state.audience.downloads.data = downloadSummary({ lastReportDate: '2026-10-28' });
  assert.equal(h.find('app-store-downloads-count').props.children, '37');
  assert.match(h.find('app-store-downloads-period').props.children, /1 Oct 2026.*27 Oct 2026/);
  assert.match(JSON.stringify(h.read()), /Report processed/);
  assert.doesNotMatch(JSON.stringify(h.read()), /Apple report through/);
  assert.doesNotMatch(JSON.stringify(h.read()), /All time/);
  h.state.audience.downloads.data = downloadSummary({ stale: true, message: 'Apple reporting is temporarily unavailable.' });
  assert.match(JSON.stringify(h.read()), /Last available report/);
  h.find('customer-audience-details').props.onPress();
  assert.match(JSON.stringify(h.read()), /Apple ID, not unique people/);
  assert.match(JSON.stringify(h.read()), /Updates and redownloads are excluded/);
});
