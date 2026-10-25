const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

function harness() {
  const state = { writes: 0, calls: [], saved: new Map(), prepared: 0, status: 'pending',
    account: { loading: false, token: null, profile: null, sessionRevision: 0 },
    send: async (requestId) => ({ requestId, status: 'pending' }) };
  let rendering;
  const changed = (before, after) => !before || after.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, value => { state.writes++; r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const helpers = loadSource('../../tyre-rescue/src/customer-assisted-help.ts', {
    './api': { API: { customerAssistedHelp: '/isolated/help' }, requestJson: async (path, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null; state.calls.push({ path, init, body });
      if (body?.action === 'prepare') { state.prepared++; return { requestId: `10000000-0000-4000-8000-${String(state.prepared).padStart(12, '0')}`, accessToken: 'isolated-capability' }; }
      if (body) return state.send(body.requestId);
      return { requestId: new URL(`https://isolated.invalid${path}`).searchParams.get('requestId'), status: state.status };
    } },
    './secure-storage': { getSecureItem: async key => state.saved.get(key) ?? null, setSecureItem: async (key, value) => { state.saved.set(key, value); }, deleteSecureItem: async key => { state.saved.delete(key); } },
  }, { AbortController, setTimeout, clearTimeout });
  const node = (type, props) => ({ type, props });
  const { CustomerAssistedHelpRequest } = loadSource('../../tyre-rescue/src/customer-assisted-help-request.tsx', {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', Linking: { openURL: async () => {} } },
    './customer-account': { useCustomerAccount: () => state.account }, './customer-assisted-help': helpers,
    './config': { PHONE_TEL: '000' }, './theme': { colors: {} },
    './ui': { Card: 'Card', InlineNotice: 'InlineNotice', PrimaryButton: 'PrimaryButton', Row: 'Row', ScreenHeader: 'ScreenHeader', TextField: 'TextField' },
  });
  const props = { details: { address: 'Synthetic vehicle location', lat: 55.86, lng: -4.25, vehicleReg: 'AB12 CDE', vehicleMake: 'Synthetic', vehicleModel: 'Fixture', photoUrl: 'https://isolated.invalid/tyre-photos/fixture.jpg' } };
  const renderer = { hooks: [], effects: [], cursor: 0 };
  const read = () => { renderer.cursor = 0; renderer.effects = []; rendering = renderer; const tree = CustomerAssistedHelpRequest(props); renderer.effects.forEach(effect => effect()); return tree; };
  function nodes(value, predicate) { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(item => nodes(item, predicate)); return [...(predicate(value) ? [value] : []), ...nodes(value.props?.children, predicate)]; }
  const find = predicate => nodes(read(), predicate)[0];
  const button = text => find(value => value.type === 'PrimaryButton' && value.props.children === text);
  const field = label => find(value => value.type === 'TextField' && value.props.label === label);
  const consent = () => find(value => value.type === 'PrimaryButton' && value.props.accessibilityRole === 'checkbox');
  return { state, helpers, props, read, button, field, consent, unmount: () => { renderer.hooks.forEach(hook => hook?.cleanup?.()); } };
}

test('tyre size assistance captures contact and explicit consent before sending the confirmed location and photo', async () => {
  const h = harness(); h.read(); await settle();
  assert.equal(h.button('Send tyre size help request').props.disabled, true);
  h.button('Send tyre size help request').props.onPress(); await settle();
  assert.equal(h.state.calls.length, 0);
  h.field('Your name').props.onChangeText('Synthetic Customer');
  h.field('Phone number').props.onChangeText('07700 900123');
  h.consent().props.onPress();
  assert.equal(h.button('Send tyre size help request').props.disabled, false);
  const sending = deferred(); h.state.send = () => sending.promise;
  const button = h.button('Send tyre size help request'); button.props.onPress(); button.props.onPress(); await settle();
  const submissions = h.state.calls.filter(call => call.body?.contactConsent);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].body.phone, '07700900123');
  assert.equal(submissions[0].body.address, h.props.details.address);
  assert.equal(submissions[0].body.vehicleReg, h.props.details.vehicleReg);
  assert.equal(submissions[0].body.photoUrl, h.props.details.photoUrl);
  assert.equal(submissions[0].body.contactConsent, true);
  sending.resolve({ requestId: submissions[0].body.requestId, status: 'pending' }); await settle();
  assert.match(JSON.stringify(h.read()), /HELP-10000000/);
  assert.match(JSON.stringify(h.read()), /separate booking and payment/);
  assert.equal(h.button('Send tyre size help request'), undefined);
  h.unmount();
});

test('a reviewed assistance reference can be removed locally and a fresh request can be sent', async () => {
  const h = harness(); h.read(); await settle();
  h.field('Your name').props.onChangeText('Synthetic Customer'); h.field('Phone number').props.onChangeText('07700900123'); h.consent().props.onPress();
  h.button('Send tyre size help request').props.onPress(); await settle();
  h.state.status = 'reviewed'; h.button('Refresh help status').props.onPress(); await settle();
  assert.match(JSON.stringify(h.read()), /does not cancel/);
  h.button('Remove saved reference and start again').props.onPress(); await settle(); h.read(); await settle();
  assert.equal(h.state.saved.size, 0);
  assert.equal(h.consent().props.accessibilityState.checked, false);
  h.consent().props.onPress(); h.button('Send tyre size help request').props.onPress(); await settle();
  assert.equal(h.state.prepared, 2);
  assert.match(JSON.stringify(h.read()), /HELP-10000000-0000-4000-8000-000000000002/);
  h.unmount();
});

test('a stored guest reference is hidden during account loading and is never exposed to a different customer', async () => {
  const h = harness(); h.read(); await settle();
  h.field('Your name').props.onChangeText('Synthetic Customer'); h.field('Phone number').props.onChangeText('07700900123'); h.consent().props.onPress();
  h.button('Send tyre size help request').props.onPress(); await settle();
  assert.match(JSON.stringify(h.read()), /HELP-/);
  h.state.account = { loading: true, token: 'new-account-token', profile: null, sessionRevision: 1 };
  assert.equal(h.read(), null); await settle(); assert.equal(h.read(), null);
  h.state.account = { loading: false, token: 'new-account-token', profile: null, sessionRevision: 1 };
  assert.equal(h.read(), null); await settle(); assert.equal(h.read(), null);
  h.state.account = { loading: false, token: 'new-account-token', profile: { id: 'different-customer', name: 'Different customer' }, sessionRevision: 2 };
  assert.equal(h.read(), null); await settle();
  assert.doesNotMatch(JSON.stringify(h.read()), /HELP-/);
  h.unmount();
});
