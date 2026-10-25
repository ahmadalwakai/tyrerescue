const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, theme } = require('./chat-modals.test.cjs');

function createLayoutHarness() {
  const insets = { top: 44, right: 0, bottom: 34, left: 0 };
  const keyboardListeners = new Map();
  const state = { value: false, cleanup: null };
  const node = (type, props) => ({ type, props: props ?? {} });
  const dependencies = {
    react: {
      useState: () => [state.value, (next) => { state.value = next; }],
      useEffect: (effect) => { state.cleanup = effect(); },
    },
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': {
      Animated: { View: 'AnimatedView' }, KeyboardAvoidingView: 'KeyboardAvoidingView',
      Keyboard: { addListener: (name, callback) => {
        keyboardListeners.set(name, callback);
        return { remove: () => keyboardListeners.delete(name) };
      } },
      Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
      Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: (value) => value, absoluteFillObject: {} },
    },
    'react-native-safe-area-context': {
      SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => insets,
    },
    '../theme': theme,
    '../motion': { useFadeSlideIn: () => ({}), usePressScale: () => ({ pressScaleStyle: {} }) },
  };
  const modalSafeArea = loadSource('components/layout/ModalSafeAreaView.tsx', dependencies);
  dependencies['./ModalSafeAreaView'] = modalSafeArea;
  dependencies['../layout/ModalSafeAreaView'] = modalSafeArea;
  const admin = loadSource('components/layout/AdminModalShell.tsx', dependencies);
  const chat = loadSource('components/chat/ChatScreenLayout.tsx', dependencies);
  return { insets, keyboardListeners, state, modalSafeArea, admin, chat };
}

const flatten = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('each native modal gets a local provider without pinning window metrics across presentations', () => {
  const h = createLayoutHarness();
  const provider = h.modalSafeArea.ModalSafeAreaView({
    style: { backgroundColor: '#000000' }, edges: ['top', 'left', 'right'], children: 'Fixture',
  });
  assert.equal(provider.type, 'SafeAreaProvider');
  assert.equal(provider.props.initialMetrics, undefined);
  assert.equal(provider.props.children.type, 'SafeAreaView');
  assert.deepEqual(flatten(provider.props.children.props.style), { flex: 1, backgroundColor: '#000000' });
  assert.deepEqual(Array.from(provider.props.children.props.edges), ['top', 'left', 'right']);
  assert.equal(provider.props.children.props.children, 'Fixture');
});

test('admin modals reserve the status bar once and leave home-indicator padding to the safe area', () => {
  const h = createLayoutHarness();
  const shell = h.admin.AdminModalShell({ children: 'Fixture', keyboardAvoidingEnabled: false });
  const provider = shell.type(shell.props);
  const safe = provider.props.children;
  assert.equal(provider.type, 'SafeAreaProvider');
  assert.deepEqual(Array.from(safe.props.edges), ['left', 'right', 'bottom']);
  assert.equal(flatten(safe.props.style).paddingTop, undefined);
  assert.equal(flatten(safe.props.style).paddingBottom, undefined);
  const header = h.admin.AdminModalHeader({ title: 'Account' });
  assert.equal(flatten(header.props.style).paddingTop, 44);
  h.insets.top = 0;
  assert.equal(flatten(h.admin.AdminModalHeader({ title: 'Account' }).props.style).paddingTop, theme.space.md);
});

test('chat keeps its safe header outside keyboard resizing and gives bottom spacing to its composer', () => {
  const h = createLayoutHarness();
  const shell = h.chat.ChatScreenLayout({ title: 'Messages', onClose: () => {}, children: 'Composer' });
  const provider = shell.type(shell.props);
  const safe = provider.props.children;
  assert.equal(provider.type, 'SafeAreaProvider');
  assert.deepEqual(Array.from(safe.props.edges), ['top', 'left', 'right']);
  const [header, keyboard] = safe.props.children;
  assert.equal(header.type, 'View');
  assert.equal(keyboard.type, 'KeyboardAvoidingView');
  assert.equal(keyboard.props.behavior, 'padding');
  assert.equal(keyboard.props.children, 'Composer');
  assert.equal(flatten(safe.props.style).paddingBottom, undefined);
});

test('chat bottom spacing follows keyboard visibility and removes its native subscriptions', () => {
  const h = createLayoutHarness();
  assert.equal(h.chat.useChatBottomPadding(), 34);
  h.keyboardListeners.get('keyboardDidShow')();
  assert.equal(h.chat.useChatBottomPadding(), theme.space.sm);
  h.keyboardListeners.get('keyboardDidHide')();
  assert.equal(h.chat.useChatBottomPadding(), 34);
  h.insets.bottom = 0;
  assert.equal(h.chat.useChatBottomPadding(), theme.space.sm);
  h.state.cleanup();
  assert.equal(h.keyboardListeners.size, 0);
});
