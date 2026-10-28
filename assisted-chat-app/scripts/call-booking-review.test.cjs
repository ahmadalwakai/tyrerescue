const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function loadSource(relative, dependencies, globals = {}) {
  const filename = path.join(__dirname, '..', 'src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, globals, { filename })(
    (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }, loaded, loaded.exports,
  );
  return loaded.exports;
}

const geo = loadSource('lib/geo.ts', {});
const workflow = loadSource('lib/assisted-chat-workflow.ts', { './geo': geo, './booking-schedule': loadSource('lib/booking-schedule.ts', {}) });
const helper = loadSource('lib/call-booking-draft.ts', { './assisted-chat-workflow': workflow });
const theme = loadSource('components/theme.ts', {});
const transcript = "Customer: I'm at 12 High Street, Glasgow G1 1AA. My rear tyre is flat. Size: 205/55 R16.";
const capabilities = () => ({
  provider: 'bonline', incomingCallerId: true, manualTranscriptDraft: true,
  transfer: { available: false, reason: 'Transfer permission is not verified for this account.' },
  transcript: { available: false, reason: 'Transcripts are not connected for this account.' },
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const state = {
    apiRevision: 1, sessionRevision: 1, authenticated: true, project: 'tyrerescue', requests: [], applied: [],
    nextResponse: null, applyError: null,
    draft: { location: { address: 'Existing address' }, tyreLines: [{ size: '225/45/R17' }], serviceType: 'fit' },
  };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const changed = (old, next) => !old || next.some((value, index) => value !== old[index]);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, (value) => {
        hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value;
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) {
        effects.push(() => {
          hooks[index]?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const node = (type, props) => ({ type, props });
  const component = loadSource('components/CallBookingReviewCard.tsx', {
    react,
    'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (value) => value } },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    '@/lib/api': {
      getApiContextRevision: () => state.apiRevision,
      api: {
        get hasAdminToken() { return state.authenticated; },
        get(url, options) {
          state.requests.push({ url, options });
          return state.nextResponse?.promise ?? Promise.resolve(capabilities());
        },
      },
    },
    '@/lib/call-booking-draft': helper,
    '@/lib/assisted-chat-workflow': workflow,
    './ui': { AppButton: 'AppButton', FieldLabel: 'FieldLabel', InlineNotice: 'InlineNotice', SectionCard: 'SectionCard' },
    './theme': theme,
  }, { AbortController });
  const read = () => {
    cursor = 0;
    effects = [];
    const tree = component.CallBookingReviewCard({
      draft: state.draft,
      activeProjectId: state.project,
      onApply: (review) => { state.applied.push(review); return state.applyError; },
    });
    effects.forEach((effect) => effect());
    return tree;
  };
  const walk = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap((child) => walk(child, predicate));
    const matches = predicate(tree) ? [tree] : [];
    return matches.concat(walk(typeof tree.type === 'function' ? tree.type(tree.props) : tree.props?.children, predicate));
  };
  const find = (predicate) => walk(read(), predicate)[0];
  const byId = (id) => find((item) => item.props?.testID === id);
  const byLabel = (label) => find((item) => item.props?.accessibilityLabel === label || item.props?.label === label);
  const type = (value) => byId('call-transcript-input').props.onChangeText(value);
  const press = (id) => {
    const button = byId(id);
    assert.ok(button, `Missing ${id}`);
    if (!button.props.disabled) button.props.onPress?.();
    return button;
  };
  const unmount = () => hooks.forEach((hook) => hook?.cleanup?.());
  return { state, read, byId, byLabel, type, press, unmount };
}

test('typing and extracting creates a review without applying or writing a booking', async () => {
  const h = harness();
  h.type(transcript);
  assert.equal(h.state.applied.length, 0);
  h.press('call-review-extract');
  assert.equal(h.byLabel('Reviewed location').props.value, '12 High Street, Glasgow G1 1AA');
  assert.equal(h.byLabel('Reviewed tyre size').props.value, '205/55/R16');
  assert.equal(h.byLabel('Reviewed problem').props.value, 'My rear tyre is flat');
  assert.equal(h.state.applied.length, 0);
  assert.equal(h.byId('call-review-apply').props.disabled, false);
  await settle();
  assert.deepEqual(h.state.requests.map((request) => request.url), ['/api/mobile/admin/phone/capabilities']);
  h.unmount();
});

test('editing the source invalidates the extracted review and requires review again', () => {
  const h = harness();
  h.type(transcript);
  h.press('call-review-extract');
  h.type('Customer: The tyre is 225/45 R17 instead.');
  assert.equal(h.byId('call-draft-review'), undefined);
  assert.equal(h.byId('call-review-apply'), undefined);
  assert.equal(h.state.applied.length, 0);
  h.unmount();
});

test('only explicit apply submits edited selected fields, then clears private text and prevents repeat', () => {
  const h = harness();
  h.type(transcript);
  h.press('call-review-extract');
  h.byLabel('Reviewed location').props.onChangeText('14 High Street');
  h.byLabel('Use tyre size in draft').props.onPress();
  h.byLabel('Tyre repair').props.onPress();
  assert.equal(h.state.applied.length, 0);
  h.press('call-review-apply');
  assert.equal(h.state.applied.length, 1);
  assert.equal(h.state.applied[0].locationAddress, '14 High Street');
  assert.equal(h.state.applied[0].useTyreSize, false);
  assert.equal(h.state.applied[0].serviceType, 'repair');
  assert.equal(h.byId('call-transcript-input').props.value, '');
  assert.equal(h.byId('call-review-apply'), undefined);
  assert.match(JSON.stringify(h.read()), /Reviewed details added to the draft/);
  h.unmount();
});

test('a rejected apply preserves the source and editable review', () => {
  const h = harness();
  h.type(transcript);
  h.press('call-review-extract');
  h.state.applyError = 'A price calculation is running. Try again when it finishes.';
  h.press('call-review-apply');
  assert.equal(h.byId('call-transcript-input').props.value, transcript);
  assert.ok(h.byId('call-draft-review'));
  assert.match(JSON.stringify(h.read()), /A price calculation is running/);
  h.unmount();
});

test('saved booking identities block review and apply even after a review was opened', () => {
  const h = harness();
  h.type(transcript);
  h.press('call-review-extract');
  h.state.draft.quickBookingId = 'saved-quick-booking';
  assert.equal(h.byId('call-transcript-input').props.editable, false);
  assert.equal(h.byId('call-review-extract').props.disabled, true);
  assert.equal(h.byId('call-review-apply').props.disabled, true);
  h.press('call-review-apply');
  assert.equal(h.state.applied.length, 0);
  h.unmount();
});

test('all unticked fields disable apply, and checkboxes/radios expose their selection', () => {
  const h = harness();
  h.type(transcript);
  h.press('call-review-extract');
  for (const label of ['location', 'tyre size', 'problem']) {
    const checkbox = h.byLabel(`Use ${label} in draft`);
    assert.equal(checkbox.props.accessibilityRole, 'checkbox');
    assert.equal(checkbox.props.accessibilityState.checked, true);
    checkbox.props.onPress();
  }
  assert.equal(h.byId('call-review-apply').props.disabled, true);
  const service = h.byLabel('Unknown / inspection required');
  assert.equal(service.props.accessibilityRole, 'radio');
  assert.equal(service.props.accessibilityState.selected, true);
  h.unmount();
});

test('unverified and forged enabled capabilities never enable transfer', async () => {
  for (const response of [capabilities(), { ...capabilities(), transfer: { available: true, reason: 'Unexpected enabled response' } }]) {
    const h = harness();
    h.state.nextResponse = deferred();
    h.read();
    assert.equal(h.byId('call-transfer-unavailable').props.disabled, true);
    h.state.nextResponse.resolve(response);
    await settle();
    const transfer = h.byId('call-transfer-unavailable');
    assert.equal(transfer.props.disabled, true);
    assert.equal(transfer.props.onPress, undefined);
    assert.equal(h.state.applied.length, 0);
    if (response.transfer.available) assert.match(JSON.stringify(h.read()), /Call service status could not be checked/);
    h.unmount();
  }
});

test('capability failure leaves manual notes available with an honest status', async () => {
  const h = harness();
  h.state.nextResponse = deferred();
  h.read();
  h.state.nextResponse.reject(new Error('Network unavailable'));
  await settle();
  assert.match(JSON.stringify(h.read()), /Call service status could not be checked/);
  assert.equal(h.byId('call-transfer-unavailable').props.disabled, true);
  h.type(transcript);
  h.press('call-review-extract');
  assert.ok(h.byId('call-draft-review'));
  h.unmount();
});

test('late capability responses cannot cross account, project or unmount boundaries', async () => {
  for (const transition of ['account', 'project', 'unmount']) {
    const h = harness();
    const old = deferred();
    h.state.nextResponse = old;
    h.read();
    if (transition === 'account') {
      h.state.sessionRevision += 1;
      h.state.apiRevision += 1;
      h.state.nextResponse = deferred();
      h.read();
    } else if (transition === 'project') {
      h.state.project = 'other-project';
      h.read();
    } else h.unmount();
    assert.equal(h.state.requests[0].options.signal.aborted, true);
    old.resolve({ ...capabilities(), transfer: { available: false, reason: 'Private old account response' } });
    await settle();
    if (transition !== 'unmount') assert.doesNotMatch(JSON.stringify(h.read()), /Private old account response/);
    if (transition === 'project') assert.equal(h.state.requests.length, 1);
    h.unmount();
  }
});

test('signed-out and unrelated workspaces never fetch capabilities', () => {
  for (const mode of ['signed-out', 'other-project']) {
    const h = harness();
    if (mode === 'signed-out') h.state.authenticated = false;
    else h.state.project = 'other-project';
    h.read();
    assert.equal(h.state.requests.length, 0);
    assert.equal(h.byId('call-transfer-unavailable').props.disabled, true);
    h.unmount();
  }
});
