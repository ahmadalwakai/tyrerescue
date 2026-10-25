const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL, AbortController, ...globals }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

function harness() {
  let rendering;
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const state = { animationStarts: 0, animationStops: 0, reducedMotion: false, revision: 1, gets: [], requests: [] };
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (next) => { r.hooks[index].value = typeof next === 'function' ? next(r.hooks[index].value) : next; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { current: initial }; return r.hooks[index]; },
    useCallback(fn, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: fn, deps }; return r.hooks[index].value; },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const timerGlobals = {
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay, delay }); return id; },
    clearInterval(id) { timers.delete(id); },
  };
  const animation = () => ({ start: () => { state.animationStarts += 1; }, stop: () => { state.animationStops += 1; } });
  const native = {
    Animated: { Value: class { setValue() {} stopAnimation() {} interpolate(config) { return config; } }, View: 'Animated.View', timing: animation, sequence: animation, loop: animation },
    View: 'View', Text: 'Text', StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
    Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  };
  const notice = loadSource('lib/live-visitor-notice.ts');
  const component = loadSource('components/HeaderLiveVisitorCounter.tsx', {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': native, '@/lib/live-visitor-notice': notice,
    './motion': { USE_NATIVE_DRIVER: true, useReducedMotion: () => state.reducedMotion },
    './theme': loadSource('components/theme.ts'),
  }, timerGlobals);
  const hook = loadSource('hooks/useLiveVisitorCount.ts', {
    react, 'react-native': native,
    '@/lib/api': { getApiContextRevision: () => state.revision, api: { get: (url, options) => { state.gets.push(url); return new Promise((resolve, reject) => state.requests.push({ resolve, reject, signal: options.signal })); } } },
  }, timerGlobals);
  function renderer(render) {
    const r = { hooks: [], effects: [], cursor: 0 };
    return {
      read(input) { r.cursor = 0; r.effects = []; rendering = r; const result = render(input); for (const effect of r.effects) effect(); return result; },
      unmount() { for (const hook of r.hooks) hook?.cleanup?.(); },
    };
  }
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.delay) timer.at += timer.delay; else timers.delete(id);
      timer.fn();
    }
    now = until;
  }
  return { state, notice, advance, timers, counter: () => renderer((value) => component.HeaderLiveVisitorCounter({ state: value })), hook: () => renderer((enabled) => hook.useLiveVisitorCount(enabled)) };
}

const project = (id, liveCount) => ({ sourceApp: id, sourceLabel: id, origin: `https://${id}.example`, liveCount });
const snapshot = (projects, extra = {}) => ({ contextKey: '1', projects, activeProject: projects[0] ?? null, liveCount: projects.reduce((total, item) => total + item.liveCount, 0), activeWindowSeconds: 60, updatedAt: '2026-10-22T10:00:00Z', loading: false, error: null, refresh: async () => {}, ...extra });
function find(tree, testID) { if (!tree || typeof tree !== 'object') return undefined; if (Array.isArray(tree)) return tree.map((item) => find(item, testID)).find(Boolean); return tree.props?.testID === testID ? tree : find(tree.props?.children, testID); }
function text(tree) { if (tree == null) return ''; if (typeof tree !== 'object') return String(tree); return Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children); }
function readAfterEffects(renderer, value) { renderer.read(value); return renderer.read(value); }
const settle = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };

test('initial counts and rotating sites do not announce fake arrivals', () => {
  const h = harness(); const counter = h.counter();
  const projects = [project('first', 2), project('second', 9)];
  let tree = readAfterEffects(counter, snapshot(projects));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')).trim(), '');
  tree = readAfterEffects(counter, snapshot(projects, { activeProject: projects[1] }));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-count')), '9');
  assert.equal(h.state.animationStarts, 0);
  counter.unmount();
});

test('a hidden site count change pulses, pins its exact count and shows a persistent delta', () => {
  const h = harness(); const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 1), project('second', 5)]));
  const projects = [project('first', 1), project('second', 7)];
  let tree = readAfterEffects(counter, snapshot(projects));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-count')), '7');
  assert.match(text(tree), /second.example/);
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')), '↑ +2 visitors');
  assert.equal(h.state.animationStarts, 1);
  h.advance(3_000);
  tree = readAfterEffects(counter, snapshot(projects, { activeProject: projects[0] }));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-count')), '7');
  h.advance(3_000);
  tree = readAfterEffects(counter, snapshot(projects));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')).trim(), '');
  counter.unmount();
});

test('simultaneous increases and decreases preserve the actual total even when the net delta is zero', () => {
  const h = harness(); const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 1), project('second', 5)]));
  const tree = readAfterEffects(counter, snapshot([project('first', 3), project('second', 3)]));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-count')), '6');
  assert.match(text(tree), /All sites/);
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')), '↑ +2 · ↓ −2');
  assert.match(tree.props.accessibilityLabel, /first.example increased from 1 to 3.*second.example decreased from 5 to 3/);
  assert.equal(tree.props.accessibilityLiveRegion, 'polite');
  counter.unmount();
});

test('decreases have a distinct down label and blue highlight, including a change to zero', () => {
  const h = harness(); const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 1)]));
  const tree = readAfterEffects(counter, snapshot([project('first', 0)]));
  const label = find(tree, 'assisted-chat-header-live-visitors-change');
  assert.equal(text(label), '↓ −1 visitor');
  assert.equal(label.props.style[1].color, '#4F8CFF');
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-count')), '0');
  counter.unmount();
});

test('Reduce Motion keeps the visible change label without running a pulse', () => {
  const h = harness(); h.state.reducedMotion = true; const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 0)]));
  const tree = readAfterEffects(counter, snapshot([project('first', 1)]));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')), '↑ +1 visitor');
  assert.equal(h.state.animationStarts, 0);
  counter.unmount();
  assert.equal(h.timers.size, 0);
});

test('failed refreshes do not create an alert or discard the last successful baseline', () => {
  const h = harness(); const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 2)]));
  let tree = readAfterEffects(counter, snapshot([project('first', 2)], { error: 'Offline' }));
  assert.match(tree.props.accessibilityLabel, /unavailable/);
  assert.equal(h.state.animationStarts, 0);
  tree = readAfterEffects(counter, snapshot([project('first', 3)]));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')), '↑ +1 visitor');
  counter.unmount();
});

test('session context changes and disable/re-enable reset the notification baseline', () => {
  const h = harness(); const counter = h.counter();
  readAfterEffects(counter, snapshot([project('first', 1)]));
  readAfterEffects(counter, snapshot([project('first', 2)]));
  let tree = readAfterEffects(counter, snapshot([project('first', 8)], { contextKey: '2' }));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')).trim(), '');
  readAfterEffects(counter, snapshot([], { contextKey: 'disabled', liveCount: null }));
  tree = readAfterEffects(counter, snapshot([project('first', 9)], { contextKey: '2' }));
  assert.equal(text(find(tree, 'assisted-chat-header-live-visitors-change')).trim(), '');
  counter.unmount();
});

test('visitor hook rejects responses from an old project and clears counts when disabled', async () => {
  const h = harness(); const hook = h.hook();
  hook.read(true); h.advance(0);
  assert.equal(h.state.requests.length, 1);
  h.state.revision = 2;
  let value = hook.read(true);
  assert.equal(value.liveCount, null);
  h.advance(0);
  assert.equal(h.state.requests[0].signal.aborted, true);
  h.state.requests[0].resolve({ liveCount: 99, activeWindowSeconds: 60, updatedAt: 'old' });
  await settle();
  assert.equal(hook.read(true).liveCount, null);
  h.state.requests[1].resolve({ liveCount: 3, activeWindowSeconds: 60, updatedAt: 'new' });
  await settle();
  assert.equal(hook.read(true).liveCount, 3);
  hook.read(false);
  value = hook.read(true);
  assert.equal(value.liveCount, null);
  assert.equal(value.error, null);
  hook.unmount();
  assert.equal(h.timers.size, 0);
});
