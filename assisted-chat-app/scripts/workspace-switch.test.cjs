const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const PROJECTS = [
  { id: 'tyrerescue', name: 'Tyre Rescue', apiBaseUrl: 'https://source.example.invalid', brandLine1: 'TYRE', brandLine2: 'RESCUE', tagline: 'Source workspace', loginSubtitle: 'Sign in to your account.' },
  { id: 'other', name: 'Other workspace', apiBaseUrl: 'https://target.example.invalid' },
];
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 6; i += 1) await tick(); }
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function loadSource(relative, dependencies) {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })((name) => {
    assert.ok(name in dependencies, `Unexpected isolated dependency: ${name}`); return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function findAll(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((value) => findAll(value, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findAll(tree.props?.children, predicate)];
}
function runtime() {
  let rendering;
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index]) host.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [host.hooks[index].value, (value) => { host.hooks[index].value = typeof value === 'function' ? value(host.hooks[index].value) : value; }];
    },
    useRef(initial) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index]) host.hooks[index] = { current: initial };
      return host.hooks[index];
    },
    useMemo(create, deps) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index] || changed(host.hooks[index].deps, deps)) host.hooks[index] = { value: create(), deps };
      return host.hooks[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index] || changed(host.hooks[index].deps, deps)) host.effects.push(() => {
        host.hooks[index]?.cleanup?.(); host.hooks[index] = { deps, cleanup: effect() };
      });
    },
    useLayoutEffect(effect, deps) { react.useEffect(effect, deps); },
  };
  function renderer() {
    const host = { cursor: 0, hooks: [], effects: [] };
    return {
      read(component, props) {
        host.cursor = 0; host.effects = []; rendering = host;
        const tree = component(props); for (const effect of host.effects) effect(); return tree;
      },
      unmount: () => { for (const hook of host.hooks) hook?.cleanup?.(); },
    };
  }
  const element = (type, props, key) => ({ type, props, key });
  return { react, renderer, jsx: { jsx: element, jsxs: element, Fragment: 'Fragment' } };
}

const WORKSPACES = [
  { sourceApp: 'source_a', sourceLabel: 'Workspace A', description: 'First booking workspace', origin: 'https://a.example.invalid' },
  { sourceApp: 'source_b', sourceLabel: 'Workspace B', description: 'Second booking workspace', origin: 'https://b.example.invalid' },
];
function panelHarness(options = {}) {
  const r = runtime();
  const state = {
    enabled: true, language: options.language ?? 'en', token: 'fixture-central-token', revision: 1, apiRevision: 1,
    baseUrl: PROJECTS[0].apiBaseUrl, calls: [], busyChanges: [], refreshes: 0,
    workspace: { items: WORKSPACES, selectedWorkspace: options.selected ?? null, loading: false, hydrated: true, error: null },
    handler: options.handler ?? (async () => true),
  };
  state.workspace.selectWorkspace = async (sourceApp, isCurrent) => {
    state.calls.push({ sourceApp, isCurrent }); return state.handler(sourceApp, isCurrent);
  };
  state.workspace.refresh = async () => { state.refreshes += 1; };
  const component = loadSource('components/WorkspaceSwitchPanel.tsx', {
    react: r.react, 'react/jsx-runtime': r.jsx,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: (value) => value },
    },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => state.revision },
    '@/hooks/useAdminWorkspace': { useAdminWorkspace: () => state.workspace },
    '@/hooks/useLatestRef': { useLatestRef: (value) => { const ref = r.react.useRef(value); ref.current = value; return ref; } },
    '@/lib/api': { getAdminToken: () => state.token, getApiBaseUrl: () => state.baseUrl, getApiContextRevision: () => state.apiRevision },
    './ui': { AppButton: 'AppButton', StatusBanner: 'StatusBanner' }, './theme': { colors: {}, radius: {}, space: {} },
  });
  const renderer = r.renderer();
  const onBusyChange = (busy) => { state.busyChanges.push(busy); };
  const read = () => renderer.read(component.WorkspaceSwitchPanel, { enabled: state.enabled, language: state.language, onBusyChange });
  const find = (testID) => findAll(read(), (value) => value.props?.testID === testID)[0];
  return { state, read, find, press: (id) => { const item = find(id); assert.ok(item, `Missing ${id}`); item.props.onPress(); }, unmount: renderer.unmount };
}

test('workspace settings show all central registry workspaces with no credential fields', () => {
  const h = panelHarness(); const current = h.find('workspace-all');
  assert.equal(current.props.disabled, true); assert.equal(current.props.accessibilityState.selected, true);
  assert.match(current.props.accessibilityLabel, /Current workspace/);
  current.props.onPress(); assert.equal(h.state.calls.length, 0);
  assert.equal(h.find('workspace-source_a').props.disabled, false);
  assert.equal(h.find('workspace-source_b').props.disabled, false);
  assert.equal(findAll(h.read(), (item) => item.type === 'TextInput').length, 0);
  assert.doesNotMatch(JSON.stringify(h.read()), /Password|Sign in and switch|workspace-password/);
  assert.match(JSON.stringify(h.read()), /current administrator account/); h.unmount();
});

test('selecting a workspace uses the existing account and does not open a login form', async () => {
  const h = panelHarness(); h.press('workspace-source_b'); await settle();
  assert.equal(h.state.calls.length, 1); assert.equal(h.state.calls[0].sourceApp, 'source_b');
  assert.equal(h.state.token, 'fixture-central-token'); assert.equal(h.state.baseUrl, PROJECTS[0].apiBaseUrl);
  assert.equal(findAll(h.read(), (item) => item.type === 'TextInput').length, 0);
  assert.equal(h.state.busyChanges.at(-1), false); h.unmount();
});

test('All workspaces clears only the selected booking scope', async () => {
  const h = panelHarness({ selected: WORKSPACES[0] });
  assert.equal(h.find('workspace-source_a').props.disabled, true);
  assert.equal(h.find('workspace-all').props.disabled, false);
  h.press('workspace-all'); await settle(); assert.equal(h.state.calls[0].sourceApp, null);
  assert.equal(h.state.token, 'fixture-central-token'); h.unmount();
});

test('workspace selection double taps are ignored while the first change persists', async () => {
  const pending = deferred(); const h = panelHarness({ handler: () => pending.promise });
  const target = h.find('workspace-source_a'); target.props.onPress(); target.props.onPress();
  assert.equal(h.state.calls.length, 1); assert.equal(h.find('workspace-source_b').props.disabled, true);
  assert.equal(h.state.busyChanges.at(-1), true);
  pending.resolve(true); await settle(); assert.equal(h.state.busyChanges.at(-1), false); h.unmount();
});

test('selection failures are safe to display and keep the existing workspace selected', async () => {
  const h = panelHarness({ selected: WORKSPACES[0], handler: async () => { throw new Error('PRIVATE_PROVIDER_RESPONSE'); } });
  h.press('workspace-source_b'); await settle();
  assert.match(JSON.stringify(h.read()), /Could not change workspace/);
  assert.doesNotMatch(JSON.stringify(h.read()), /PRIVATE_PROVIDER_RESPONSE/);
  assert.equal(h.find('workspace-source_a').props.accessibilityState.selected, true);
  assert.equal(h.state.token, 'fixture-central-token'); h.unmount();
});

test('registry loading blocks selection and registry errors retry without any login flow', async () => {
  const h = panelHarness(); h.state.workspace.loading = true;
  const target = h.find('workspace-source_a'); assert.equal(target.props.disabled, true); target.props.onPress();
  assert.equal(h.state.calls.length, 0);
  h.state.workspace.loading = false; h.state.workspace.error = 'PRIVATE_REGISTRY_RESPONSE';
  h.press('workspace-retry'); await settle(); assert.equal(h.state.refreshes, 1);
  assert.doesNotMatch(JSON.stringify(h.read()), /PRIVATE_REGISTRY_RESPONSE/); h.unmount();
});

test('hidden, unmounted and replaced-session workspace controls reject stale callbacks', async () => {
  for (const change of [
    (h) => { h.state.enabled = false; h.read(); }, (h) => { h.state.revision += 1; h.read(); },
    (h) => { h.state.apiRevision += 1; h.read(); }, (h) => { h.state.token = null; h.read(); }, (h) => h.unmount(),
  ]) {
    const h = panelHarness(); const select = h.find('workspace-source_a'); change(h); select.props.onPress(); await settle();
    assert.equal(h.state.calls.length, 0); h.unmount();
  }
});

test('a pending selection receives a scope guard that becomes false immediately after hide', async () => {
  const pending = deferred(); const h = panelHarness({ handler: () => pending.promise }); h.press('workspace-source_a');
  assert.equal(typeof h.state.calls[0].isCurrent, 'function');
  assert.equal(h.state.calls[0].isCurrent(), true);
  h.state.enabled = false; h.read(); assert.equal(h.state.calls[0].isCurrent(), false);
  pending.resolve(false); await settle(); assert.equal(h.read(), null); h.unmount();
});

test('workspace controls support the selected account language', () => {
  const h = panelHarness({ language: 'ar' });
  assert.match(h.find('workspace-all').props.accessibilityLabel, /جميع أماكن العمل/);
  assert.match(JSON.stringify(h.read()), /حساب الأدمن الحالي/);
  assert.equal(findAll(h.read(), (item) => item.type === 'TextInput').length, 0); h.unmount();
});

test('initial login renders one credential form with no workspace selector or switch action', () => {
  const r = runtime(); const renderer = r.renderer();
  const component = loadSource('components/LoginScreen.tsx', {
    react: r.react, 'react/jsx-runtime': r.jsx,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: (value) => value }, Platform: { OS: 'web', select: (value) => value.web ?? value.default },
      useWindowDimensions: () => ({ width: 390 }), Animated: { View: 'AnimatedView', Value: class { constructor(value) { this.value = value; } } },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './ui': { InlineNotice: 'InlineNotice', StatusBanner: 'StatusBanner' },
    './theme': { colors: {}, fontSize: {}, radius: {} }, '../../assets/icon.png': 'fixture-image',
  });
  const tree = renderer.read(component.LoginScreen, { onLogin: async () => {}, loggingIn: false, loginError: null, expiredMessage: null, activeProject: PROJECTS[0] });
  assert.equal(findAll(tree, (item) => item.type === 'TextInput').length, 2);
  assert.equal(findAll(tree, (item) => item.type === 'Pressable').length, 1);
  assert.doesNotMatch(JSON.stringify(tree), /Switch workspace|Choose your workspace|Select workspace|Other workspace/);
  assert.match(JSON.stringify(tree), /Sign in/); renderer.unmount();
});

function indexHarness(session, workspace = { hydrated: true, selectedWorkspace: null }) {
  const r = runtime(); const renderer = r.renderer();
  const component = loadSource('../app/index.tsx', {
    react: r.react, 'react/jsx-runtime': r.jsx,
    'react-native': { ActivityIndicator: 'ActivityIndicator', View: 'View', Text: 'Text', StyleSheet: { create: (value) => value } },
    '@/components/LoginScreen': { LoginScreen: 'LoginScreen' },
    '@/components/SessionRecoveryScreen': { SessionRecoveryScreen: 'SessionRecoveryScreen' },
    '@/hooks/useAdminSession': { useAdminSession: () => session }, '@/hooks/useAdminWorkspace': { useAdminWorkspace: () => workspace },
    '@/components/theme': { colors: {} }, '@/components/ui': { AppButton: 'AppButton' },
    '@/lib/startup-logging': { logStartupCheckpoint() {}, logStartupModuleCompleted() {}, logStartupModuleFailed() {}, logStartupModuleStarted() {} },
  });
  let recovery = null;
  function read() {
    let hasRecovery = false;
    const expand = (tree) => {
      if (!tree || typeof tree !== 'object') return tree;
      if (Array.isArray(tree)) return tree.map(expand);
      if (typeof tree.type === 'function' && tree.type.name === 'WorkspaceRecovery') {
        hasRecovery = true; recovery ??= r.renderer(); return recovery.read(tree.type, tree.props);
      }
      return tree.props?.children ? { ...tree, props: { ...tree.props, children: expand(tree.props.children) } } : tree;
    };
    const tree = expand(renderer.read(component.default, {}));
    if (!hasRecovery && recovery) { recovery.unmount(); recovery = null; }
    return tree;
  }
  return { read, unmount: () => { recovery?.unmount(); renderer.unmount(); } };
}

test('the initial route selects the default only for a logged-out session without a workspace', () => {
  for (const [status, project, expectedSelection] of [
    ['logged-out', null, true], ['logged-out', PROJECTS[1], false], ['loading', null, false], ['recovery', null, false],
  ]) {
    const selections = [];
    const session = { status, activeProject: project, selectProject: async (id) => { selections.push(id); } };
    const h = indexHarness(session); const tree = h.read();
    assert.deepEqual(selections, expectedSelection ? ['tyrerescue'] : []);
    if (expectedSelection) assert.equal(tree.type, 'View', 'show a loader until the default workspace is persisted');
    if (status === 'logged-out' && project) {
      assert.equal(tree.type, 'LoginScreen'); assert.equal(tree.props.activeProject.id, 'other');
      assert.equal(tree.props.onSelectProject, undefined); assert.equal(tree.props.onClearProject, undefined);
    }
    h.unmount();
  }
});

test('the protected route waits for validated workspace hydration and remounts by selected source without another login', async () => {
  const session = { status: 'logged-in', activeProject: PROJECTS[0], user: { id: 'central-admin' } };
  let refreshes = 0;
  const workspace = { hydrated: false, loading: true, error: null, selectedWorkspace: null, refresh: async () => { refreshes += 1; } };
  const h = indexHarness(session, workspace);
  assert.equal(h.read().type, 'View');
  workspace.loading = false; workspace.error = 'PRIVATE_REGISTRY_ERROR';
  const retryTree = h.read(); assert.doesNotMatch(JSON.stringify(retryTree), /PRIVATE_REGISTRY_ERROR/);
  const retry = findAll(retryTree, (item) => item.type === 'AppButton' && item.props.label === 'Retry workspaces')[0];
  assert.ok(retry); retry.props.onPress(); await settle(); assert.equal(refreshes, 1);
  workspace.hydrated = true; workspace.error = null; workspace.selectedWorkspace = WORKSPACES[0];
  const selected = h.read(); assert.equal(selected.key, 'tyrerescue:source_a');
  assert.equal(selected.props.user, session.user); assert.equal(selected.props.workspaceSourceApp, 'source_a');
  assert.equal(selected.props.workspaceLabel, 'Workspace A');
  workspace.selectedWorkspace = null; const all = h.read(); assert.equal(all.key, 'tyrerescue:all');
  assert.equal(all.props.user, session.user); assert.equal(all.props.workspaceSourceApp, null); h.unmount();
});

test('workspace recovery offers explicit sign-out with duplicate and unmounted-action guards', async () => {
  let logouts = 0; const pending = deferred();
  const session = { status: 'logged-in', activeProject: PROJECTS[0], user: { id: 'central-admin' }, logout: async () => { logouts += 1; await pending.promise; } };
  const workspace = { hydrated: false, loading: false, error: 'Fixture offline', selectedWorkspace: null, refresh: async () => {} };
  const h = indexHarness(session, workspace);
  const signOut = findAll(h.read(), (item) => item.type === 'AppButton' && item.props.label === 'Sign out')[0];
  assert.ok(signOut); signOut.props.onPress(); signOut.props.onPress(); assert.equal(logouts, 1);
  assert.equal(findAll(h.read(), (item) => item.type === 'AppButton' && item.props.label === 'Sign out')[0].props.disabled, true);
  h.unmount(); pending.resolve(); await settle(); signOut.props.onPress(); assert.equal(logouts, 1);
});
