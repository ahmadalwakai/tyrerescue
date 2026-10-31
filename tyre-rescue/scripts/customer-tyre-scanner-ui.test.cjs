/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(file, mocks = {}, globals = {}) {
  const filename = path.resolve(__dirname, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const sourceModule = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { ...globals }, { filename })(
    name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency in isolated scanner test: ${name}`);
    }, sourceModule, sourceModule.exports,
  );
  return sourceModule.exports;
}

const parser = loadSource('../src/customer-tyre-size-scan.ts');
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function nodes(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  return typeof tree === 'object' ? textOf(tree.props?.children) : String(tree);
}

function harness() {
  const state = {
    supported: true, permission: { granted: true, canAskAgain: true },
    picked: { canceled: false, assets: [{ uri: 'file:///selected-tyre.jpg', fileSize: 1200 }] },
    recognized: '205/55 R16 91V', permissionCalls: 0, cameraCalls: 0, libraryCalls: 0,
    nativeCalls: [], pickerOptions: [], confirmations: [], busy: [], writes: 0, settingsCalls: 0,
    picker: null, recognition: null,
  };
  const hooks = []; let cursor = 0; let effects = []; let dirty = false;
  const timers = new Map(); let timerId = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) {
        hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
        hooks[index].set = value => {
          state.writes++;
          const next = typeof value === 'function' ? value(hooks[index].value) : value;
          if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
        };
      }
      return [hooks[index].value, hooks[index].set];
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!hooks[index] || dependencies.some((value, i) => !Object.is(value, hooks[index].dependencies[i]))) {
        effects.push(() => {
          hooks[index]?.cleanup?.();
          hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  const timerGlobals = {
    setTimeout: (callback, milliseconds) => { const id = ++timerId; timers.set(id, { callback, milliseconds }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const safety = loadSource('../src/booking-safety.ts', { './types': { initialBookingState: {} } }, timerGlobals);
  const jsx = (type, props) => ({ type, props });
  const { CustomerTyreScanner } = loadSource('../src/customer-tyre-scanner.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value },
      Linking: { openSettings: async () => { state.settingsCalls++; } },
    },
    'expo-image-picker': {
      UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
      requestCameraPermissionsAsync: async () => { state.permissionCalls++; return state.permission; },
      launchCameraAsync: async options => { state.cameraCalls++; state.pickerOptions.push(options); return state.picker ? state.picker() : state.picked; },
      launchImageLibraryAsync: async options => { state.libraryCalls++; state.pickerOptions.push(options); return state.picker ? state.picker() : state.picked; },
    },
    '../modules/customer-tyre-scanner': {
      isSupported: () => state.supported,
      recognizeText: async uri => { state.nativeCalls.push(uri); return state.recognition ? state.recognition(uri) : state.recognized; },
    },
    './booking-safety': safety, './customer-tyre-size-scan': parser,
    './theme': { colors: {}, radii: {}, typography: {} },
    './ui': { InlineNotice: 'InlineNotice', PrimaryButton: 'PrimaryButton' },
  });
  const props = {
    sizeKey: '/R', disabled: false,
    onConfirm: size => state.confirmations.push(JSON.parse(JSON.stringify(size))),
    onBusyChange: busy => state.busy.push(busy),
  };
  function read() {
    let tree;
    for (let pass = 0; pass < 5; pass++) {
      cursor = 0; effects = []; dirty = false;
      tree = CustomerTyreScanner(props);
      effects.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw new Error('Scanner hook harness did not settle');
  }
  const find = label => nodes(read()).find(node => node.type === 'PrimaryButton' && textOf(node) === label);
  const press = label => {
    const button = find(label);
    assert.ok(button, `Missing button: ${label}`);
    button.props.onPress();
  };
  const radio = label => nodes(read()).find(node => node.props?.accessibilityRole === 'radio' && node.props.accessibilityLabel === label);
  read();
  return {
    state, props, timers, read, find, press, radio,
    text: () => textOf(read()),
    scan: async (camera = false) => { press(camera ? 'Scan tyre size' : 'Choose a photo to scan'); await settle(); },
    unmount: () => hooks.forEach(hook => hook.cleanup?.()),
  };
}

test('a recognized size stays a suggestion until the customer explicitly confirms it', async () => {
  const h = harness(); await h.scan();
  assert.deepEqual(h.state.nativeCalls, ['file:///selected-tyre.jpg']);
  assert.equal(h.state.permissionCalls, 0);
  assert.equal(h.state.confirmations.length, 0);
  assert.equal(h.find('Confirm and use this size').props.disabled, false);
  assert.match(h.text(), /Check the suggested size/);
  h.press('Confirm and use this size');
  assert.deepEqual(h.state.confirmations, [{ width: '205', aspect: '55', rim: '16' }]);
  assert.equal(h.find('Confirm and use this size'), undefined);
  assert.equal(h.state.busy.at(-1), false);
});

test('multiple sizes require a selection before the confirmation can change booking fields', async () => {
  const h = harness(); h.state.recognized = 'FRONT 205/55R16\nREAR 225/45R17'; await h.scan();
  assert.equal(h.find('Confirm and use this size').props.disabled, true);
  h.press('Confirm and use this size');
  assert.equal(h.state.confirmations.length, 0);
  h.radio('225/45 R17').props.onPress();
  assert.equal(h.radio('225/45 R17').props.accessibilityState.checked, true);
  h.press('Confirm and use this size');
  assert.deepEqual(h.state.confirmations, [{ width: '225', aspect: '45', rim: '17' }]);
});

test('a discarded result cannot be confirmed by a stale button callback', async () => {
  const h = harness(); await h.scan();
  const oldConfirmation = h.find('Confirm and use this size').props.onPress;
  h.press('Enter size by hand'); oldConfirmation();
  assert.equal(h.state.confirmations.length, 0);
  await h.scan(); h.press('Confirm and use this size');
  oldConfirmation(); assert.equal(h.state.confirmations.length, 1);
});

test('manual edits invalidate an already displayed confirmation, including its old handler', async () => {
  const h = harness(); await h.scan();
  const oldConfirmation = h.find('Confirm and use this size').props.onPress;
  h.props.sizeKey = '225/45R17'; h.read(); oldConfirmation();
  assert.equal(h.state.confirmations.length, 0);
  assert.equal(h.find('Confirm and use this size'), undefined);
});

test('camera denial preserves manual entry and offers settings only for permanent denial', async () => {
  for (const canAskAgain of [true, false]) {
    const h = harness(); h.state.permission = { granted: false, canAskAgain }; await h.scan(true);
    assert.equal(h.state.cameraCalls, 0); assert.equal(h.state.nativeCalls.length, 0);
    assert.equal(h.state.confirmations.length, 0); assert.equal(h.state.busy.at(-1), false);
    assert.match(h.text(), /Camera access is off/);
    assert.equal(Boolean(h.find('Open camera settings')), !canAskAgain);
    if (!canAskAgain) { h.press('Open camera settings'); await settle(); assert.equal(h.state.settingsCalls, 1); }
  }
});

test('system picker cancellation exits cleanly without requesting recognition or changing the size', async () => {
  const h = harness(); h.state.picked = { canceled: true, assets: null }; await h.scan(true);
  assert.equal(h.state.permissionCalls, 1); assert.equal(h.state.cameraCalls, 1);
  assert.equal(h.state.nativeCalls.length, 0); assert.equal(h.state.confirmations.length, 0);
  assert.equal(h.state.busy.at(-1), false); assert.equal(h.find('Scan tyre size').props.disabled, false);
});

test('native failure gives a usable fallback and never exposes native paths or changes fields', async () => {
  const h = harness(); h.state.recognition = async () => { throw new Error('private file:///internal/details'); }; await h.scan();
  assert.match(h.text(), /We could not read this photo/);
  assert.doesNotMatch(h.text(), /private|internal/);
  assert.equal(h.state.confirmations.length, 0); assert.equal(h.state.busy.at(-1), false);
});

test('unreadable text keeps the original photo available and offers manual entry without a confirmation', async () => {
  const h = harness(); h.state.recognized = 'DOT 2425\nMAX PRESSURE 44 PSI'; await h.scan();
  assert.match(h.text(), /No complete tyre size was found/);
  assert.equal(nodes(h.read()).find(node => node.type === 'Image').props.source.uri, 'file:///selected-tyre.jpg');
  assert.equal(h.find('Confirm and use this size'), undefined);
  h.press('Enter size by hand');
  assert.equal(h.state.confirmations.length, 0); assert.doesNotMatch(h.text(), /No complete tyre size was found/);
});

test('manual size edits discard a pending recognition and do not overwrite the new values', async () => {
  const h = harness(); const pending = deferred(); h.state.recognition = () => pending.promise; await h.scan();
  h.props.sizeKey = '225/45R17'; h.read();
  pending.resolve('205/55R16'); await settle();
  assert.equal(h.find('Confirm and use this size'), undefined);
  assert.equal(h.state.confirmations.length, 0); assert.equal(h.state.busy.at(-1), false);
  assert.equal(h.find('Scan tyre size').props.disabled, false);
});

test('unmounting while recognition is pending prevents late state writes and confirmation', async () => {
  const h = harness(); const pending = deferred(); h.state.recognition = () => pending.promise; await h.scan();
  h.unmount(); const writes = h.state.writes;
  pending.resolve('205/55R16'); await settle();
  assert.equal(h.state.writes, writes); assert.equal(h.state.confirmations.length, 0);
});

test('cancelled recognition cannot replace the result of a later scan', async () => {
  const h = harness(); const first = deferred(); let calls = 0;
  h.state.recognition = () => ++calls === 1 ? first.promise : '225/45R17'; await h.scan();
  h.press('Cancel scan'); await h.scan();
  first.resolve('205/55R16'); await settle();
  assert.equal(h.radio('205/55 R16'), undefined); assert.ok(h.radio('225/45 R17'));
  h.press('Confirm and use this size');
  assert.deepEqual(h.state.confirmations, [{ width: '225', aspect: '45', rim: '17' }]);
});

test('cancellation before the picker resolves prevents recognition from starting', async () => {
  const h = harness(); const pending = deferred(); h.state.picker = () => pending.promise; await h.scan();
  h.press('Cancel scan'); pending.resolve(h.state.picked); await settle();
  assert.equal(h.state.nativeCalls.length, 0); assert.equal(h.state.confirmations.length, 0);
  assert.equal(h.state.busy.at(-1), false);
});

test('rapid repeated taps start only one image picker even before React renders busy state', async () => {
  const h = harness(); const pending = deferred(); h.state.picker = () => pending.promise;
  const button = h.find('Choose a photo to scan'); button.props.onPress(); button.props.onPress(); await settle();
  assert.equal(h.state.libraryCalls, 1);
  pending.resolve(h.state.picked); await settle(); assert.equal(h.state.nativeCalls.length, 1);
});

test('missing native support hides the feature and external busy state prevents capture and confirmation', async () => {
  const unsupported = harness(); unsupported.state.supported = false; assert.equal(unsupported.read(), null);
  const h = harness(); h.props.disabled = true; h.press('Choose a photo to scan'); await settle();
  assert.equal(h.state.libraryCalls, 0);
  h.props.disabled = false; await h.scan(); h.props.disabled = true;
  assert.equal(h.find('Confirm and use this size').props.disabled, true); h.press('Confirm and use this size');
  assert.equal(h.state.confirmations.length, 0);
});

test('a native recognition timeout releases the UI and ignores the eventual late answer', async () => {
  const h = harness(); const pending = deferred(); h.state.recognition = () => pending.promise; await h.scan();
  const deadline = [...h.timers.values()].find(timer => timer.milliseconds === 15_000); assert.ok(deadline);
  deadline.callback(); await settle();
  assert.match(h.text(), /We could not read this photo/); assert.equal(h.state.busy.at(-1), false);
  pending.resolve('205/55R16'); await settle();
  assert.equal(h.find('Confirm and use this size'), undefined); assert.equal(h.state.confirmations.length, 0);
  assert.equal(h.timers.size, 0);
});

test('oversized photos are rejected before native decoding', async () => {
  const h = harness(); h.state.picked.assets[0].fileSize = 21 * 1024 * 1024; await h.scan();
  assert.match(h.text(), /smaller than 20 MB/); assert.equal(h.state.nativeCalls.length, 0);
  assert.equal(h.state.confirmations.length, 0); assert.equal(h.state.busy.at(-1), false);
});
