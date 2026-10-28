const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, theme, deferred, settle } = require('./chat-modals.test.cjs');

const item = (id) => ({ id, name: id, phone: '000000000', notes: null, status: 'pending', resolvedAt: null, createdAt: '2026-10-22T12:00:00Z' });
function harness() {
  const state = { visible: true, token: 'isolated-admin-a', apiRevision: 1, sessionRevision: 1, items: [item('current-callback')], gets: [], patches: [], alert: null, handler: null, writes: 0, dismissed: 0 };
  let rendering;
  const changed = (before, after) => !before || after.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (value) => { state.writes += 1; r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useLayoutEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const node = (type, props) => ({ type, props });
  const component = loadSource('components/AdminCallbacksModal.tsx', {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => { state.alert = args; } }, Linking: { openURL: async () => {} }, Modal: 'Modal', Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } },
    './theme': theme, './layout/AdminModalShell': { AdminModalHeader: 'AdminModalHeader', AdminModalShell: 'AdminModalShell' },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    '@/lib/api': { getAdminToken: () => state.token, getApiContextRevision: () => state.apiRevision,
      api: { get: async (path) => { state.gets.push(path); return state.handler ? state.handler(path) : { items: state.items, totalCount: state.items.length, pendingCount: state.items.length }; },
        patch: async (path, body) => { state.patches.push({ path, body }); return {}; } } },
  });
  const renderer = { hooks: [], effects: [], cursor: 0 };
  const read = () => { renderer.cursor = 0; renderer.effects = []; rendering = renderer; const tree = component.AdminCallbacksModal({ visible: state.visible,
    onClose: () => { state.visible = false; }, onDismiss: () => { state.dismissed += 1; } }); for (const effect of renderer.effects) effect(); return tree; };
  const nodes = (value, predicate) => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap((entry) => nodes(entry, predicate)) : [...(predicate(value) ? [value] : []), ...nodes(value.props?.children, predicate)];
  const find = (predicate) => nodes(read(), predicate)[0];
  const resolveButton = () => find((value) => value.type === 'Pressable' && JSON.stringify(value.props.children).includes('✓ Resolved'));
  return { state, read, find, resolveButton, unmount: () => { for (const hook of renderer.hooks) hook?.cleanup?.(); } };
}

test('callback modal drops old workspace data and rejects a late previous-scope fetch', async () => {
  const h = harness();
  const pending = deferred();
  h.state.handler = () => pending.promise;
  h.read(); await settle();
  h.state.apiRevision += 1;
  h.state.handler = null;
  h.state.items = [item('new-workspace-callback')];
  h.read(); await settle();
  pending.resolve({ items: [item('private-old-workspace')], totalCount: 1, pendingCount: 1 }); await settle();
  assert.match(JSON.stringify(h.read()), /new-workspace-callback/);
  assert.doesNotMatch(JSON.stringify(h.read()), /private-old-workspace/);
  h.unmount();
});

test('a callback confirmation cannot patch a closed modal or a later admin/workspace', async () => {
  for (const cause of ['close', 'workspace', 'account', 'unmount']) {
    const h = harness(); h.read(); await settle();
    h.resolveButton().props.onPress();
    const confirm = h.state.alert[2].find((button) => button.text === 'Resolved');
    if (cause === 'close') { h.state.visible = false; h.read(); }
    if (cause === 'workspace') h.state.apiRevision += 1;
    if (cause === 'account') { h.state.token = 'another-isolated-admin'; h.state.sessionRevision += 1; }
    if (cause === 'unmount') h.unmount();
    await confirm.onPress();
    assert.equal(h.state.patches.length, 0);
    if (cause !== 'unmount') h.unmount();
  }
});

test('current authorized callback confirmation resolves once and native dismissal is forwarded', async () => {
  const h = harness(); h.read(); await settle();
  h.resolveButton().props.onPress();
  await h.state.alert[2].find((button) => button.text === 'Resolved').onPress();
  assert.equal(h.state.patches.length, 1);
  assert.equal(h.state.patches[0].path, '/api/mobile/admin/callbacks/current-callback');
  const modal = h.find((value) => value.type === 'Modal');
  modal.props.onRequestClose();
  assert.equal(h.state.visible, false);
  modal.props.onDismiss();
  assert.equal(h.state.dismissed, 1);
  h.unmount();
});
