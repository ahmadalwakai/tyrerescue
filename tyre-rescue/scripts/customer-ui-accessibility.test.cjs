const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

function harness(reducedMotion = true) {
  const state = { reducedMotion, animations: [] };
  const theme = loadSource('../../tyre-rescue/src/theme.ts', {});
  const node = (type, props) => ({ type, props });
  const ui = loadSource('../../tyre-rescue/src/ui.tsx', {
    react: { useEffect: (callback) => callback(), useMemo: (create) => create() },
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value) => value, hairlineWidth: 1 } },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, useSharedValue: (value) => ({ value }), useAnimatedStyle: (create) => create(), withTiming: (value, options) => { state.animations.push({ value, options }); return value; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './theme': theme, './use-customer-reduced-motion': { useCustomerReducedMotion: () => state.reducedMotion },
    '@/assets/images/icon.png': 'brand-asset',
  });
  function find(value, type) {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) return value.map((item) => find(item, type)).find(Boolean);
    return value.type === type ? value : find(value.props?.children, type);
  }
  return { state, ui, find };
}

test('loading retains an action label, announces busy and disables payment actions', () => {
  const h = harness(); let presses = 0; const onLayout = () => {};
  const button = h.find(h.ui.PrimaryButton({ children: 'Pay securely', loading: true, onPress: () => { presses += 1; }, onLayout, accessibilityState: { selected: true, disabled: false, busy: false } }), 'Pressable');
  assert.equal(button.props.accessibilityLabel, 'Pay securely');
  assert.deepEqual({ ...button.props.accessibilityState }, { selected: true, disabled: true, busy: true });
  assert.equal(button.props.disabled, true); assert.equal(button.props.onLayout, onLayout);
  assert.equal(h.find(button, 'Text').props.children, 'Pay securely'); assert.equal(presses, 0);
});

test('screen-reader labels and errors remain attached to filled or read-only fields', () => {
  const h = harness(); const change = () => {};
  const tree = h.ui.TextField({ label: 'Email address', value: 'synthetic@isolated.invalid', error: 'Check the email address', accessibilityHint: 'Used for your receipt', editable: false, onChangeText: change });
  const input = h.find(tree, 'TextInput');
  assert.equal(input.props.accessibilityLabel, 'Email address');
  assert.equal(input.props.accessibilityHint, 'Used for your receipt. Check the email address');
  assert.equal(input.props.accessibilityState.disabled, true); assert.equal(input.props.onChangeText, change);
  const texts = tree.props.children.filter((item) => item?.type === 'Text');
  assert.equal(texts.at(-1).props.accessibilityRole, 'alert');
  assert.equal(texts.at(-1).props.accessibilityLabel, 'Email address: Check the email address');
});

test('options announce their selection and keep their original action', () => {
  const h = harness(); let presses = 0;
  const option = h.find(h.ui.OptionCard({ title: 'At your location', detail: 'Mobile fitting', meta: 'Travel fee shown in quote', selected: true, onPress: () => { presses += 1; } }), 'Pressable');
  assert.equal(option.props.accessibilityLabel, 'At your location. Travel fee shown in quote. Mobile fitting');
  assert.deepEqual({ ...option.props.accessibilityState }, { selected: true, disabled: false });
  option.props.onPress(); assert.equal(presses, 1);
});

test('reduced motion suppresses button and option transformations while preserving press callbacks', () => {
  for (const reducedMotion of [true, false]) {
    const h = harness(reducedMotion); let callbacks = 0;
    const button = h.find(h.ui.PrimaryButton({ children: 'Continue', shine: true, onPressIn: () => { callbacks += 1; }, onPressOut: () => { callbacks += 1; } }), 'Pressable');
    const option = h.find(h.ui.OptionCard({ title: 'Mobile fitting', iconShimmer: true }), 'Pressable');
    button.props.onPressIn({}); button.props.onPressOut({}); option.props.onPressIn(); option.props.onPressOut();
    assert.equal(callbacks, 2);
    assert.equal(h.state.animations.length, reducedMotion ? 0 : 4);
    assert.ok(h.state.animations.every((animation) => animation.options.duration <= 100));
  }
});

test('the brand remains still even when an existing screen passes animated', () => {
  const h = harness(false); const tree = h.ui.Logo({ animated: true });
  assert.equal(tree.props.accessibilityLabel, 'Tyre Rescue'); assert.ok(h.find(tree, 'Image')); assert.equal(h.state.animations.length, 0);
});
