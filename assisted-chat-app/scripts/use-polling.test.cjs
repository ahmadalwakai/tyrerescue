const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const state = { appState: 'active', listeners: [], intervals: [], hooks: [], effects: [], cursor: 0 };
  const changed = (a, b) => !a || b.some((v, i) => v !== a[i]);
  const react = {
    useRef(initial) { const i = state.cursor++; if (!state.hooks[i]) state.hooks[i] = { current: initial }; return state.hooks[i]; },
    useCallback(fn, deps) { const i = state.cursor++; if (!state.hooks[i] || changed(state.hooks[i].deps, deps)) state.hooks[i] = { value: fn, deps }; return state.hooks[i].value; },
    useEffect(effect, deps) {
      const i = state.cursor++;
      if (!state.hooks[i] || changed(state.hooks[i].deps, deps)) {
        state.effects.push(() => { state.hooks[i]?.cleanup?.(); state.hooks[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const native = {
    Platform: { OS: 'ios' },
    AppState: {
      get currentState() { return state.appState; },
      addEventListener(_, cb) { state.listeners.push(cb); return { remove() { state.listeners = state.listeners.filter((l) => l !== cb); } }; },
    },
  };
  const filename = path.join(__dirname, '..', 'src', 'hooks', 'usePolling.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    AbortController,
    setInterval: (fn) => { state.intervals.push(fn); return state.intervals.length; },
    clearInterval: (id) => { state.intervals[id - 1] = null; },
  }, { filename })((name) => ({ react, 'react-native': native })[name], module, module.exports);

  const render = (task, options) => {
    state.cursor = 0;
    const refresh = module.exports.usePolling(task, options);
    const pending = state.effects.splice(0);
    pending.forEach((run) => run());
    return refresh;
  };
  const unmount = () => state.hooks.forEach((h) => h?.cleanup?.());
  const tick = () => state.intervals.filter(Boolean).forEach((fn) => fn());
  return { state, render, unmount, tick };
}

function controllableTask() {
  const calls = [];
  const task = (signal) => new Promise((resolve) => calls.push({ signal, resolve }));
  return { calls, task };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('runs immediately, then never overlaps a run still in flight', async () => {
  const h = harness(); const t = controllableTask();
  h.render(t.task, { enabled: true, intervalMs: 1000 });
  assert.equal(t.calls.length, 1);
  h.tick(); h.tick();
  assert.equal(t.calls.length, 1, 'ticks while in flight are skipped');
  t.calls[0].resolve(); await flush();
  h.tick();
  assert.equal(t.calls.length, 2);
});

test('changing the key aborts the old run and starts a new one', () => {
  const h = harness(); const t = controllableTask();
  h.render(t.task, { enabled: true, intervalMs: 1000, key: 'project-a' });
  h.render(t.task, { enabled: true, intervalMs: 1000, key: 'project-b' });
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[0].signal.aborted, true, 'late project-a response is discarded');
  assert.equal(t.calls[1].signal.aborted, false);
});

test('disabling or unmounting aborts the run in flight and stops ticking', () => {
  const h = harness(); const t = controllableTask();
  h.render(t.task, { enabled: true, intervalMs: 1000 });
  h.unmount();
  assert.equal(t.calls[0].signal.aborted, true);
  h.tick();
  assert.equal(t.calls.length, 1);
});

test('pauses in the background and runs again on return to foreground', async () => {
  const h = harness(); const t = controllableTask();
  h.render(t.task, { enabled: true, intervalMs: 1000 });
  t.calls[0].resolve(); await flush();
  h.state.appState = 'background';
  h.tick();
  assert.equal(t.calls.length, 1, 'no background polling');
  h.state.appState = 'active';
  h.state.listeners.forEach((l) => l('active'));
  assert.equal(t.calls.length, 2);
});

test('refresh() replaces a run in flight', () => {
  const h = harness(); const t = controllableTask();
  const refresh = h.render(t.task, { enabled: true, intervalMs: 1000 });
  void refresh();
  assert.equal(t.calls.length, 2);
  assert.equal(t.calls[0].signal.aborted, true);
});
