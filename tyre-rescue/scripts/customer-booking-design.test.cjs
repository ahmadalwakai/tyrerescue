const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}, exported = []) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\nObject.assign(exports, {${exported.join(',')}});})`, { Error, Date, Intl, setTimeout, clearTimeout, setInterval, clearInterval, AbortController }, { filename })(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const node = (type, props) => ({ type, props });
const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
function hooks() {
  let rendering; let nextId = 0;
  const changed = (before, after) => !before || !after || after.some((value, index) => value !== before[index]);
  const react = {
    createContext(value) { const context = { value }; context.Provider = context; return context; },
    useContext: context => context.value,
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, value => { r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useId() { return react.useRef(`isolated-${++nextId}`).current; },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useLayoutEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
    useEffect(effect, deps) { react.useLayoutEffect(effect, deps); },
  };
  const renderer = component => {
    const r = { cursor: 0, hooks: [], effects: [] };
    return { render(props, commit = true) { r.cursor = 0; r.effects = []; rendering = r; const tree = component(props); if (commit) r.effects.forEach(effect => effect()); return tree; },
      commit() { r.effects.forEach(effect => effect()); }, unmount() { r.hooks.forEach(hook => hook?.cleanup?.()); } };
  };
  return { react, renderer };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

test('one fixed continue action is published after commit and retains disabled/loading checks and the latest handler', () => {
  const h = hooks();
  const footer = load('booking-footer.tsx', { react: h.react, 'react/jsx-runtime': jsx,
    'react-native': { View: 'View', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    './theme': { colors: {}, spacing: { page: 18, gap: 12 } }, './ui': { PrimaryButton: 'PrimaryButton' } });
  const provider = h.renderer(footer.BookingFooterProvider);
  const button = h.renderer(footer.BookingContinueButton);
  const renderProvider = step => { const tree = provider.render({ step }); tree.type.value = tree.props.value; const inner = tree.props.children; inner.type.value = inner.props.value; };
  let calls = 0; const props = { children: 'Continue', disabled: true, onPress: () => { calls++; } };
  renderProvider('details');
  assert.equal(button.render(props, false), null);
  renderProvider('details'); assert.equal(footer.BookingFooter({ step: 'details' }), null);
  button.commit(); renderProvider('details');
  let visible = footer.BookingFooter({ step: 'details' });
  assert.equal(visible.props.children.type, 'PrimaryButton'); assert.equal(visible.props.children.props.disabled, true);
  visible.props.children.props.onPress({}); assert.equal(calls, 0);
  button.render({ ...props, disabled: false }); renderProvider('details');
  visible = footer.BookingFooter({ step: 'details' }); visible.props.children.props.onPress({}); assert.equal(calls, 1);
  button.render({ ...props, disabled: false, onPress: () => { calls += 10; } }); renderProvider('details');
  visible = footer.BookingFooter({ step: 'details' }); visible.props.children.props.onPress({}); assert.equal(calls, 11);
  button.render({ ...props, disabled: false, loading: true }); renderProvider('details');
  visible = footer.BookingFooter({ step: 'details' }); visible.props.children.props.onPress({}); assert.equal(calls, 11);
  button.unmount(); renderProvider('details'); assert.equal(footer.BookingFooter({ step: 'details' }), null);
});

test('changing steps immediately hides the old action and late cleanup cannot remove the new action or move payment controls', () => {
  const h = hooks();
  const footer = load('booking-footer.tsx', { react: h.react, 'react/jsx-runtime': jsx,
    'react-native': { View: 'View', StyleSheet: { create: value => value, hairlineWidth: 1 } },
    './theme': { colors: {}, spacing: {} }, './ui': { PrimaryButton: 'PrimaryButton' } });
  const provider = h.renderer(footer.BookingFooterProvider); const first = h.renderer(footer.BookingContinueButton); const second = h.renderer(footer.BookingContinueButton);
  const renderProvider = step => { const tree = provider.render({ step }); tree.type.value = tree.props.value; tree.props.children.type.value = tree.props.children.props.value; };
  let oldCalls = 0;
  renderProvider('details'); first.render({ children: 'Old action', onPress: () => { oldCalls++; } }); renderProvider('details');
  const oldAction = footer.BookingFooter({ step: 'details' }).props.children.props.onPress;
  renderProvider('tyres'); assert.equal(footer.BookingFooter({ step: 'tyres' }), null);
  second.render({ children: 'New action' }); renderProvider('tyres'); first.unmount(); renderProvider('tyres');
  assert.equal(footer.BookingFooter({ step: 'tyres' }).props.children.props.children, 'New action');
  oldAction({}); assert.equal(oldCalls, 0);
  for (const step of ['payment', 'done']) {
    renderProvider(step); assert.equal(footer.BookingFooter({ step }), null);
    const local = h.renderer(footer.BookingContinueButton).render({ children: 'Component-owned action' });
    assert.equal(local.type, 'PrimaryButton'); assert.equal(footer.BookingFooter({ step }), null);
  }
});

function screenHarness() {
  const h = hooks(); const types = load('types.ts');
  const components = load('booking-screen.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-clipboard': {}, 'expo-haptics': { selectionAsync: async () => {} },
    'expo-router': {}, 'expo-image-picker': {},
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' }, StyleSheet: { create: value => value, hairlineWidth: 1 }, Linking: {} },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, FadeIn: { duration: value => value } },
    './api': { API: { driverAvailable: '/isolated/availability' }, requestJson: async () => ({ available: true, count: 1 }) },
    './booking-helpers': {}, './booking-safety': { resetBookingQuote: { quoteId: null, stripeClientSecret: null } },
    './booking-draft-storage': {}, './secure-storage': {}, './customer-location-step': {}, './customer-callback': {},
    './customer-assisted-help-request': {}, './customer-fitting-choice': { CustomerFittingChoice: 'CustomerFittingChoice' },
    './booking-footer': { BookingContinueButton: 'BookingContinueButton' }, './use-customer-reduced-motion': {},
    './customer-booking-access': {}, './config': {}, './customer-account': {}, './customer-active-booking': { CustomerActiveBookingCard: 'CustomerActiveBookingCard' }, './customer-notifications': {}, './customer-payment-control': {},
    './mapbox': {}, './pulsing-map': {}, './theme': { colors: {}, radii: {}, spacing: {}, typography: {} },
    './ui': { PrimaryButton: 'PrimaryButton' }, './types': types,
  }, ['ServiceStep', 'ServiceChoice', 'ProblemCard', 'StepProgress']);
  return { ...h, types, components };
}

test('home prioritises emergency help and preserves the existing scheduled fitting requirements', async () => {
  const h = screenHarness(); const home = h.renderer(h.components.ServiceStep);
  const props = { state: { ...h.types.initialBookingState }, updateState: value => { props.state = { ...props.state, ...value }; }, advances: 0, goNext: () => { props.advances++; } };
  let tree = home.render(props); await settle(); tree = home.render(props);
  assert.equal(find(tree, item => item.type === 'BookingContinueButton').props.disabled, true);
  const emergency = find(tree, item => item.props?.title === 'Emergency tyre help'); assert.equal(emergency.props.emergency, true);
  const accessibleChoice = h.components.ServiceChoice(emergency.props);
  assert.equal(accessibleChoice.props.accessibilityLabel, 'Emergency tyre help. Flat tyre or a breakdown? Start a callout at your location. Drivers available now');
  const problem = h.components.ProblemCard({ option: { title: 'Flat tyre', detail: 'Tyre is flat now.', meta: 'Fast rescue', icon: 'alert-triangle' }, selected: true, onPress: () => {} });
  assert.equal(problem.props.accessibilityLabel, 'Flat tyre. Tyre is flat now. Fast rescue');
  assert.equal(problem.props.accessibilityState.selected, true);
  emergency.props.onPress(); tree = home.render(props);
  assert.equal(props.state.bookingType, 'emergency'); assert.equal(props.advances, 0);
  let action = find(tree, item => item.type === 'BookingContinueButton'); assert.equal(action.props.disabled, false); action.props.onPress(); assert.equal(props.advances, 1);
  find(tree, item => item.props?.title === 'Book a fitting').props.onPress(); tree = home.render(props);
  action = find(tree, item => item.type === 'BookingContinueButton'); assert.equal(action.props.disabled, true);
  assert.ok(find(tree, item => item.type === 'CustomerFittingChoice'));
  props.state.fittingLocation = 'mobile'; tree = home.render(props);
  assert.equal(find(tree, item => item.type === 'BookingContinueButton').props.disabled, false);
  home.unmount();
});

test('three visual stages describe the real current step while repair and workshop flows keep their existing order', () => {
  const h = screenHarness();
  const cases = [['location', 'Request details'], ['details', 'Choose service'], ['tyres', 'Choose service'], ['schedule', 'Choose service'], ['quote', 'Confirm & pay'], ['payment', 'Confirm & pay']];
  for (const [step, title] of cases) {
    const tree = h.components.StepProgress({ state: { ...h.types.initialBookingState, bookingType: 'emergency' }, step });
    assert.ok(find(tree, item => item.props?.accessibilityLabel?.includes(`${title}, current`)), `${step} should display ${title}`);
  }
  assert.deepEqual(Array.from(h.types.getSteps('emergency', 'repair')), ['service', 'location', 'eligibility', 'details', 'quote', 'payment']);
  assert.deepEqual(Array.from(h.types.getSteps('scheduled', 'fit', 'shop')), ['service', 'details', 'tyres', 'schedule', 'quote', 'payment']);
});
