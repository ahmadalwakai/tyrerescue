const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const SOURCE = path.resolve(__dirname, '../src/hooks/useAdminSession.ts');
const TYRE = 'https://www.tyrerescue.uk';
const OTHER = 'https://other-project.invalid';
const USER = { id: 'admin-test', name: 'Test Admin', email: 'admin@example.invalid', role: 'admin' };
const OPAQUE = 'acs_v1.00000000-0000-4000-8000-000000000001.isolated_test_credential_not_real';
const LEGACY = 'expired.legacy.test';
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let index = 0; index < 8; index += 1) await tick(); }
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  };
}
function record(token = OPAQUE, apiBaseUrl = TYRE) { return { token, user: USER, apiBaseUrl }; }

// Execute the real hook with fake React, secure persistence and fetch. All
// credentials and endpoints are isolated fixtures; no real network is possible.
function harness(options = {}) {
  const disk = options.disk ?? { sessions: new Map(), tombstones: new Set(), project: 'tyrerescue' };
  if (options.session) disk.sessions.set(TYRE, options.session);
  const state = {
    apiBaseUrl: TYRE,
    token: options.envToken ?? null,
    readError: false,
    projectReadError: false,
    writeError: false,
    clearSucceeds: true,
    restoreDisabled: false,
    readHandler: null,
    writeGate: null,
    clearGate: null,
    projectWriteError: false,
    projectClearError: false,
    projectGate: null,
    device: { deviceName: 'Test iPhone', modelName: 'iPhone test', platform: 'ios', osVersion: '26.0', appVersion: '1.0.12' },
    heartbeatContext: null,
  };
  const calls = { reads: 0, writes: [], clears: [], requests: [], log: [], unauthorizedHandlers: 0 };
  const subscribers = new Set();
  const appStateListeners = new Set();
  const timers = new Map();
  let timerId = 0;
  let diskRevision = 0;
  let clearGeneration = 0;
  let storagePending = Promise.resolve();
  let requestHandler = async () => { throw new Error('Isolated network unavailable'); };
  const projects = {
    tyrerescue: { id: 'tyrerescue', apiBaseUrl: TYRE, name: 'Tyre Rescue' },
    other: { id: 'other', apiBaseUrl: OTHER, name: 'Other project' },
  };
  const storage = {
    readStoredAdminProjectId: async () => {
      if (state.projectReadError) throw new Error('Project storage unavailable');
      return disk.project;
    },
    readStoredAdminSession: async () => {
      calls.reads += 1;
      const backend = state.apiBaseUrl;
      if (state.readHandler) return state.readHandler(backend);
      await storagePending.catch(() => {});
      if (state.readError) throw new Error('Secure storage unavailable');
      return disk.tombstones.has(backend) ? null : disk.sessions.get(backend) ?? null;
    },
    writeStoredAdminSession: (session) => {
      calls.writes.push(session);
      const revision = ++diskRevision;
      const generation = clearGeneration;
      const operation = storagePending.catch(() => {}).then(async () => {
        if (generation !== clearGeneration) throw new Error('Cancelled by explicit clear');
        if (state.writeGate) await state.writeGate;
        if (state.writeError) throw new Error('Secure write unavailable');
        disk.sessions.set(session.apiBaseUrl, session);
        disk.tombstones.delete(session.apiBaseUrl);
        for (const listener of subscribers) listener({ kind: 'write', apiBaseUrl: session.apiBaseUrl, revision });
      });
      storagePending = operation;
      return operation;
    },
    clearInvalidAdminSessionStorage: (reason) => {
      calls.clears.push(reason);
      const backend = state.apiBaseUrl;
      const revision = ++diskRevision;
      clearGeneration += 1;
      for (const listener of subscribers) listener({ kind: 'clear-intent', apiBaseUrl: backend, revision });
      const operation = storagePending.catch(() => {}).then(async () => {
        if (state.clearGate) await state.clearGate;
        if (!state.clearSucceeds) return false;
        disk.tombstones.add(backend);
        // Intentionally retain credentials: the tombstone must block restore
        // even if native deletion fails or the process exits immediately.
        for (const listener of subscribers) listener({ kind: 'clear', apiBaseUrl: backend, revision });
        return true;
      });
      storagePending = operation;
      return operation;
    },
    subscribeAdminSessionStorage: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    getAdminSessionStorageRevision: () => diskRevision,
  };
  let rendering;
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState: (initial) => {
      const renderer = rendering;
      const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [renderer.hooks[index].value, (value) => {
        renderer.hooks[index].value = typeof value === 'function' ? value(renderer.hooks[index].value) : value;
      }];
    },
    useCallback: (callback, deps) => {
      const renderer = rendering;
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.hooks[index] = { callback, deps };
      return renderer.hooks[index].callback;
    },
    useEffect: (effect, deps) => {
      const renderer = rendering;
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.effects.push(() => {
        renderer.hooks[index]?.cleanup?.();
        renderer.hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const log = (label, details) => calls.log.push({ label, details });
  const modules = {
    react,
    'react-native': {
      AppState: {
        addEventListener: (_, callback) => {
          appStateListeners.add(callback);
          return { remove: () => appStateListeners.delete(callback) };
        },
      },
    },
    '@/lib/admin-session-storage': storage,
    '@/lib/api': {
      getAdminToken: () => state.token,
      setAdminToken: (value) => { state.token = value; },
      getApiBaseUrl: () => state.apiBaseUrl,
      setApiBaseUrl: (value) => { state.apiBaseUrl = value; },
      setOnUnauthorized: () => { calls.unauthorizedHandlers += 1; },
    },
    '@/lib/project-config': {
      getProjectById: (id) => { if (!projects[id]) throw new Error('Unknown project'); return projects[id]; },
      isStoredProjectPickerSelected: async () => {
        if (state.projectReadError) throw new Error('Project storage unavailable');
        return disk.picker === true;
      },
      setStoredProjectId: async (id) => {
        if (state.projectGate) await state.projectGate;
        if (state.projectWriteError) throw new Error('Project write unavailable');
        disk.project = id;
        disk.picker = false;
      },
      clearStoredProjectId: async () => {
        if (state.projectGate) await state.projectGate;
        if (state.projectClearError) throw new Error('Project clear unavailable');
        disk.project = null;
        disk.picker = true;
      },
    },
    '@/lib/startup-logging': {
      logStartupCheckpoint: log,
      logStartupModuleCompleted: log,
      logStartupModuleFailed: log,
      logStartupModuleStarted: log,
    },
    '@/lib/session-startup-config': { isSessionRestoreDisabled: () => state.restoreDisabled },
    '@/lib/admin-device-metadata': { readAdminDeviceMetadata: () => ({ ...state.device }) },
    '@/lib/admin-device-heartbeat': {
      retainAdminDeviceHeartbeat: () => () => {},
      setAdminDeviceHeartbeatContext: (next) => { state.heartbeatContext = next; },
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync(SOURCE, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const execute = vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, {
    console,
    AbortController,
    fetch: async (url, init) => {
      calls.requests.push({ url, init });
      return requestHandler(url, init);
    },
    setInterval: (callback, milliseconds) => {
      assert.equal(milliseconds, 5 * 60_000, 'Only best-effort legacy renewal may recur');
      timers.set(++timerId, { callback, milliseconds, kind: 'interval' });
      return timerId;
    },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (callback, milliseconds) => {
      assert.equal(milliseconds, 8_000, 'Only the optional legacy HTTP request may time out');
      timers.set(++timerId, { callback, milliseconds, kind: 'timeout' });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  }, { filename: SOURCE });
  execute((name) => {
    if (!modules[name]) throw new Error(`Unexpected dependency: ${name}`);
    return modules[name];
  }, module, module.exports);
  function mount() {
    const renderer = { hooks: [], effects: [], cursor: 0 };
    const read = () => {
      renderer.cursor = 0;
      renderer.effects = [];
      rendering = renderer;
      const session = module.exports.useAdminSession();
      for (const effect of renderer.effects) effect();
      return session;
    };
    read();
    return { read, unmount: () => { for (const hook of renderer.hooks) hook?.cleanup?.(); } };
  }
  return {
    mount, disk, state, calls, timers,
    appState: async (next) => {
      for (const listener of appStateListeners) listener(next);
      await settle();
    },
    runTimers: async (kind) => {
      for (const [id, timer] of [...timers]) {
        if (timer.kind !== kind) continue;
        if (kind === 'timeout') timers.delete(id);
        timer.callback();
      }
      await settle();
    },
    request: (handler) => { requestHandler = handler; },
    externalClear: () => storage.clearInvalidAdminSessionStorage('diagnostics-recovery-action'),
  };
}

test('opaque saved sign-in reopens locally while offline, without any validation request or timer', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, OPAQUE);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.calls.clears.length, 0);
  assert.equal(h.calls.unauthorizedHandlers, 0);
  assert.equal(h.timers.size, 0);
});

test('expired legacy credentials stay cached on401,404,503 and network failure', async () => {
  for (const status of [401, 404, 503, null]) {
    const h = harness({ session: record(LEGACY) });
    h.request(async () => {
      if (status == null) throw new Error('Network unavailable');
      return response(status, { error: 'Not accepted' });
    });
    const hook = h.mount();
    await settle();
    assert.equal(hook.read().status, 'logged-in');
    assert.equal(h.state.token, LEGACY);
    assert.equal(h.calls.clears.length, 0);
    assert.equal(h.calls.writes.length, 0);
  }
});

test('valid legacy sign-in publishes locally before silent upgrade and persists before replacing the token', async () => {
  const h = harness({ session: record(LEGACY) });
  const server = deferred();
  const persisting = deferred();
  h.state.writeGate = persisting.promise;
  h.request(() => server.promise);
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, LEGACY);
  server.resolve(response(200, { token: OPAQUE, user: USER }));
  await settle();
  assert.equal(h.state.token, LEGACY);
  persisting.resolve();
  await settle();
  assert.equal(h.state.token, OPAQUE);
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE);
});

test('transient secure storage failure offers recovery without deleting or automatically logging out the saved record', async () => {
  const h = harness({ session: record() });
  h.state.readError = true;
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'recovery');
  assert.match(hook.read().recoveryError, /not been deleted/);
  assert.equal(h.calls.clears.length, 0);
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE);
  h.state.readError = false;
  await hook.read().retryRestore();
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, OPAQUE);
});

test('project metadata I/O failure cannot masquerade as a new logged-out install', async () => {
  const h = harness({ session: record() });
  h.state.projectReadError = true;
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.calls.reads, 0);
  assert.equal(h.calls.clears.length, 0);
  h.state.projectReadError = false;
  await hook.read().retryRestore();
  assert.equal(hook.read().status, 'logged-in');
});

test('startup restore isolation preserves saved credentials and displays recovery', async () => {
  const h = harness({ session: record() });
  h.state.restoreDisabled = true;
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'recovery');
  assert.match(hook.read().recoveryError, /restore paused/);
  assert.equal(h.calls.clears.length, 0);
  assert.equal(h.calls.reads, 0);
});

test('new login requests a persistent session and cannot commit before its secure write succeeds', async () => {
  const h = harness();
  const gate = deferred();
  h.state.writeGate = gate.promise;
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  const hook = h.mount();
  await settle();
  const login = hook.read().login(' ADMIN@example.invalid ', 'isolated-password');
  await settle();
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
  const body = JSON.parse(h.calls.requests[0].init.body);
  assert.equal(body.email, 'admin@example.invalid');
  assert.equal(body.persistentSession, true);
  assert.equal(body.device.deviceName, 'Test iPhone');
  assert.equal(body.device.appVersion, '1.0.12');
  assert.equal(h.calls.writes[0].apiBaseUrl, TYRE);
  gate.resolve();
  await login;
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, OPAQUE);
});

test('failed secure persistence never commits protected login state', async () => {
  const h = harness();
  h.state.writeError = true;
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  const hook = h.mount();
  await settle();
  await assert.rejects(hook.read().login('admin@example.invalid', 'isolated-password'));
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
  assert.match(hook.read().loginError, /Login failed/);
});

test('manual logout immediately clears memory in every hook and captures only the current token for revocation', async () => {
  const h = harness({ session: record() });
  const first = h.mount();
  await settle();
  const second = h.mount();
  h.request(async () => response(200, { ok: true }));
  const loggingOut = first.read().logout();
  assert.equal(h.state.token, null);
  assert.equal(first.read().status, 'logged-out');
  assert.equal(second.read().status, 'logged-out');
  await loggingOut;
  assert.equal(h.calls.requests[0].url, `${TYRE}/api/mobile/admin/auth/logout`);
  assert.equal(h.calls.requests[0].init.headers.Authorization, `Bearer ${OPAQUE}`);
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('offline explicit logout survives app restart even if secure deletion failed and an env token exists', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  await hook.read().logout();
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE); // Native deletion failed.
  const reopened = harness({ disk: h.disk, envToken: 'legacy-public-env-fixture' });
  const next = reopened.mount();
  await settle();
  assert.equal(next.read().status, 'logged-out');
  assert.equal(reopened.state.token, null);
  assert.equal(reopened.calls.requests.length, 0);
});

test('a failed durable logout offers retry that finishes logout instead of restoring the cached credential', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  h.state.clearSucceeds = false;
  await hook.read().logout();
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.state.token, null);
  assert.match(hook.read().recoveryError, /finish signing out/);
  const reads = h.calls.reads;
  h.state.clearSucceeds = true;
  await hook.read().retryRestore();
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.calls.reads, reads);
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('logout from another hook fences a pending shared hydration response', async () => {
  const h = harness();
  const gate = deferred();
  h.state.readHandler = () => gate.promise;
  const first = h.mount();
  const second = h.mount();
  await settle();
  assert.equal(h.calls.reads, 1);
  await second.read().logout();
  gate.resolve(record());
  await settle();
  assert.equal(first.read().status, 'logged-out');
  assert.equal(second.read().status, 'logged-out');
  assert.equal(h.state.token, null);
});

test('late login response after logout cannot write or restore a credential', async () => {
  const h = harness();
  const hook = h.mount();
  await settle();
  const gate = deferred();
  h.request(() => gate.promise);
  const signingIn = hook.read().login('admin@example.invalid', 'isolated-password');
  await hook.read().logout();
  gate.resolve(response(200, { token: OPAQUE, user: USER }));
  await signingIn;
  assert.equal(h.calls.writes.length, 0);
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
});

test('logout queued during an in-flight secure login write wins durably and in memory', async () => {
  const h = harness();
  const hook = h.mount();
  await settle();
  const gate = deferred();
  h.state.writeGate = gate.promise;
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  const signingIn = hook.read().login('admin@example.invalid', 'isolated-password');
  await settle();
  const loggingOut = hook.read().logout();
  gate.resolve();
  await signingIn;
  await loggingOut;
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('late legacy upgrade after logout cannot replace the cached credential or resurrect a session', async () => {
  const h = harness({ session: record(LEGACY) });
  const gate = deferred();
  h.request(() => gate.promise);
  const hook = h.mount();
  await settle();
  await hook.read().logout();
  gate.resolve(response(200, { token: OPAQUE, user: USER }));
  await settle();
  assert.equal(h.calls.writes.length, 0);
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
});

test('project switching unsets the old token before changing backend, preserves its envelope and fences pending upgrade', async () => {
  const h = harness({ session: record(LEGACY) });
  const gate = deferred();
  h.request(() => gate.promise);
  const hook = h.mount();
  await settle();
  const switching = hook.read().selectProject('other');
  assert.equal(h.state.token, null);
  await switching;
  assert.equal(h.state.apiBaseUrl, OTHER);
  assert.equal(hook.read().status, 'logged-out');
  gate.resolve(response(200, { token: OPAQUE, user: USER }));
  await settle();
  assert.equal(h.state.token, null);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.requests.every(({ url }) => url.startsWith(TYRE)), true);
  assert.equal(h.calls.clears.length, 0);
  assert.equal(h.disk.sessions.get(TYRE).token, LEGACY);
});

test('late login responses from a previous backend never bind to the newly selected project', async () => {
  const h = harness();
  const hook = h.mount();
  await settle();
  const gate = deferred();
  h.request(() => gate.promise);
  const signingIn = hook.read().login('admin@example.invalid', 'isolated-password');
  await hook.read().selectProject('other');
  gate.resolve(response(200, { token: OPAQUE, user: USER }));
  await signingIn;
  assert.equal(h.state.apiBaseUrl, OTHER);
  assert.equal(h.state.token, null);
  assert.equal(h.calls.writes.length, 0);
});

test('explicit storage recovery signs out every mounted hook, without treating API failures as logout', async () => {
  const h = harness({ session: record() });
  const first = h.mount();
  await settle();
  const second = h.mount();
  assert.equal(second.read().status, 'logged-in');
  await h.externalClear();
  assert.equal(first.read().status, 'logged-out');
  assert.equal(second.read().status, 'logged-out');
  assert.equal(h.state.token, null);
});

test('cached sign-in from another backend is never forwarded, even if storage returns it unexpectedly', async () => {
  const h = harness();
  h.state.readHandler = async () => record(OPAQUE, OTHER);
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.state.token, null);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.calls.clears.length, 0);
});

test('diagnostics never include credentials or token values', async () => {
  const h = harness();
  h.state.writeError = true;
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  const hook = h.mount();
  await settle();
  await assert.rejects(hook.read().login('admin@example.invalid', 'isolated-password'));
  const diagnostics = JSON.stringify(h.calls.log);
  assert.equal(diagnostics.includes(OPAQUE), false);
  assert.equal(diagnostics.includes('isolated-password'), false);
  assert.equal(diagnostics.includes(USER.email), false);
});

test('a legacy startup outage retries on foreground and becomes opaque without another password prompt', async () => {
  const h = harness({ session: record(LEGACY) });
  const first = h.mount();
  await settle();
  const second = h.mount();
  assert.equal(first.read().status, 'logged-in');
  assert.equal(second.read().status, 'logged-in');
  assert.equal([...h.timers.values()].filter((timer) => timer.kind === 'interval').length, 1);
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  await h.appState('active');
  assert.equal(h.state.token, OPAQUE);
  assert.equal(first.read().status, 'logged-in');
  assert.equal(second.read().status, 'logged-in');
  assert.equal(h.calls.requests.every(({ url }) => url.endsWith('/auth/session')), true);
  assert.equal(h.calls.clears.length, 0);
  assert.equal(h.timers.size, 0);
});

test('legacy five-minute retry is single-flight across hooks and stops after the last hook unmounts', async () => {
  const h = harness({ session: record(LEGACY) });
  const first = h.mount();
  await settle();
  const second = h.mount();
  const gate = deferred();
  h.request(() => gate.promise);
  const before = h.calls.requests.length;
  await h.runTimers('interval');
  await h.appState('active');
  assert.equal(h.calls.requests.length, before + 1);
  first.unmount();
  assert.equal([...h.timers.values()].filter((timer) => timer.kind === 'interval').length, 1);
  second.unmount();
  assert.equal([...h.timers.values()].filter((timer) => timer.kind === 'interval').length, 0);
  gate.resolve(response(404, {}));
  await settle();
});

test('an eight-second renewal timeout aborts its request but preserves cached legacy login for retry', async () => {
  const h = harness({ session: record(LEGACY) });
  h.request(() => new Promise(() => {}));
  const hook = h.mount();
  await settle();
  const signal = h.calls.requests[0].init.signal;
  assert.equal(signal.aborted, false);
  await h.runTimers('timeout');
  assert.equal(signal.aborted, true);
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, LEGACY);
  assert.equal(h.calls.clears.length, 0);
  h.request(async () => response(200, { token: OPAQUE, user: USER }));
  await h.runTimers('interval');
  assert.equal(h.state.token, OPAQUE);
  assert.equal(h.timers.size, 0);
});

test('failed project persistence never switches backend or deletes the current saved sign-in, including restart', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  h.state.projectWriteError = true;
  await hook.read().selectProject('other');
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.state.apiBaseUrl, TYRE);
  assert.equal(h.disk.project, 'tyrerescue');
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE);
  assert.equal(h.calls.clears.length, 0);
  const reopened = harness({ disk: h.disk });
  const next = reopened.mount();
  await settle();
  assert.equal(next.read().status, 'logged-in');
  assert.equal(reopened.state.token, OPAQUE);
  h.state.projectWriteError = false;
  await hook.read().retryRestore();
  assert.equal(h.state.apiBaseUrl, OTHER);
  assert.equal(h.disk.project, 'other');
  assert.equal(hook.read().activeProject.id, 'other');
});

test('failed picker persistence keeps the selected project and credentials; successful retry persists picker intent', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  h.state.projectClearError = true;
  await hook.read().clearProject();
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.disk.project, 'tyrerescue');
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE);
  const reopenedBeforeRetry = harness({ disk: h.disk });
  const beforeRetry = reopenedBeforeRetry.mount();
  await settle();
  assert.equal(beforeRetry.read().status, 'logged-in');
  h.state.projectClearError = false;
  await hook.read().retryRestore();
  assert.equal(hook.read().activeProject, null);
  assert.equal(h.disk.picker, true);
  assert.equal(h.disk.sessions.get(TYRE).token, OPAQUE);
  const reopened = harness({ disk: h.disk });
  const next = reopened.mount();
  await settle();
  assert.equal(next.read().status, 'logged-out');
  assert.equal(reopened.state.token, null);
  assert.equal(reopened.calls.reads, 0);
  await next.read().selectProject('tyrerescue');
  assert.equal(next.read().status, 'logged-in');
  assert.equal(reopened.state.token, OPAQUE);
});

test('a project write finishing after explicit logout cannot leave a new backend selection on disk', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  const gate = deferred();
  h.state.projectGate = gate.promise;
  const switching = hook.read().selectProject('other');
  await settle();
  await hook.read().logout();
  gate.resolve();
  await switching;
  assert.equal(h.disk.project, 'tyrerescue');
  assert.equal(h.state.apiBaseUrl, TYRE);
  assert.equal(hook.read().status, 'logged-out');
  const reopened = harness({ disk: h.disk });
  const next = reopened.mount();
  await settle();
  assert.equal(next.read().status, 'logged-out');
});

test('external diagnostic clear fences a pending login before the tombstone write can finish', async () => {
  const h = harness();
  const hook = h.mount();
  await settle();
  const server = deferred();
  const persistence = deferred();
  h.request(() => server.promise);
  const login = hook.read().login('admin@example.invalid', 'isolated-password');
  h.state.clearGate = persistence.promise;
  const clearing = h.externalClear();
  assert.equal(h.state.token, null);
  server.resolve(response(200, { token: OPAQUE, user: USER }));
  await login;
  assert.equal(h.calls.writes.length, 0);
  persistence.resolve();
  await clearing;
  assert.equal(h.disk.tombstones.has(TYRE), true);
  const reopened = harness({ disk: h.disk });
  const next = reopened.mount();
  await settle();
  assert.equal(next.read().status, 'logged-out');
});

test('external diagnostic clear fences a pending upgrade before the tombstone write can finish', async () => {
  const h = harness({ session: record(LEGACY) });
  const server = deferred();
  h.request(() => server.promise);
  const hook = h.mount();
  await settle();
  const persistence = deferred();
  h.state.clearGate = persistence.promise;
  const clearing = h.externalClear();
  assert.equal(h.state.token, null);
  server.resolve(response(200, { token: OPAQUE, user: USER }));
  await settle();
  assert.equal(h.calls.writes.length, 0);
  assert.equal(hook.read().status, 'logged-out');
  persistence.resolve();
  await clearing;
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('an external clear-intent is not suppressed while an earlier manual clear awaits storage and a new login starts', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  const persistence = deferred();
  h.state.clearGate = persistence.promise;
  const loggingOut = hook.read().logout();
  const server = deferred();
  h.request(() => server.promise);
  const loggingIn = hook.read().login('admin@example.invalid', 'isolated-password');
  const diagnosticClear = h.externalClear();
  server.resolve(response(200, { token: OPAQUE + '_new', user: USER }));
  await loggingIn;
  assert.equal(h.calls.writes.length, 0);
  persistence.resolve();
  await loggingOut;
  await diagnosticClear;
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(h.state.token, null);
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('strict project helpers propagate I/O errors and persist an explicit picker marker', async () => {
  const filename = path.resolve(__dirname, '../src/lib/project-config.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let unavailable = true;
  const values = new Map();
  const module = { exports: {} };
  const storage = {
    setItem: async (key, value) => { if (unavailable) throw new Error('Unavailable'); values.set(key, value); },
    getItem: async (key) => { if (unavailable) throw new Error('Unavailable'); return values.get(key) ?? null; },
  };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(
    () => ({ default: storage }), module, module.exports,
  );
  await assert.rejects(module.exports.setStoredProjectId('tyrerescue'));
  await assert.rejects(module.exports.clearStoredProjectId());
  unavailable = false;
  await module.exports.setStoredProjectId('tyrerescue');
  assert.equal(await module.exports.isStoredProjectPickerSelected(), false);
  await module.exports.clearStoredProjectId();
  assert.equal(await module.exports.isStoredProjectPickerSelected(), true);
});

test('legacy upgrade includes current display metadata without issuing a password login', async () => {
  const h = harness({ session: record(LEGACY) });
  h.state.device.appVersion = '1.0.13';
  const hook = h.mount();
  await settle();
  assert.equal(hook.read().status, 'logged-in');
  const request = h.calls.requests[0];
  assert.equal(request.url, `${TYRE}/api/mobile/admin/auth/session`);
  assert.equal(JSON.parse(request.init.body).device.appVersion, '1.0.13');
  assert.equal(h.state.heartbeatContext, null);
});

test('trusted matching remote removal signs out all hooks durably without calling revoked authenticated cleanup', async () => {
  const h = harness({ session: record() });
  const first = h.mount();
  await settle();
  const second = h.mount();
  h.state.heartbeatContext.onRevoked();
  assert.equal(h.state.token, null);
  assert.equal(first.read().status, 'logged-out');
  assert.equal(second.read().status, 'logged-out');
  assert.equal(first.read().expiredMessage, 'This device was signed out by an administrator.');
  await settle();
  assert.equal(h.calls.clears.at(-1), 'admin-remote-revoke');
  assert.equal(h.disk.tombstones.has(TYRE), true);
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.state.heartbeatContext, null);
});

test('remote removal persistence failure remains signed out and retry finishes its tombstone, never restores', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  h.state.clearSucceeds = false;
  h.state.heartbeatContext.onRevoked();
  await settle();
  assert.equal(hook.read().status, 'recovery');
  assert.equal(h.state.token, null);
  const reads = h.calls.reads;
  h.state.clearSucceeds = true;
  await hook.read().retryRestore();
  assert.equal(hook.read().status, 'logged-out');
  assert.equal(hook.read().expiredMessage, 'This device was signed out by an administrator.');
  assert.equal(h.calls.reads, reads);
  assert.equal(h.disk.tombstones.has(TYRE), true);
});

test('a delayed remote removal callback from an old token cannot sign out a later explicit login', async () => {
  const h = harness({ session: record() });
  const hook = h.mount();
  await settle();
  const oldContext = h.state.heartbeatContext;
  await hook.read().logout();
  const replacementToken = OPAQUE.replace('000000000001', '000000000002');
  h.request(async () => response(200, { token: replacementToken, user: USER }));
  await hook.read().login('admin@example.invalid', 'isolated-password');
  const clearCount = h.calls.clears.length;
  oldContext.onRevoked();
  await settle();
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.state.token, replacementToken);
  assert.equal(h.calls.clears.length, clearCount);
});

test('an old backend remote removal cannot clear the newly selected backend session', async () => {
  const h = harness({ session: record() });
  const otherToken = OPAQUE.replace('000000000001', '000000000003');
  h.disk.sessions.set(OTHER, record(otherToken, OTHER));
  const hook = h.mount();
  await settle();
  const oldContext = h.state.heartbeatContext;
  await hook.read().selectProject('other');
  oldContext.onRevoked();
  await settle();
  assert.equal(h.state.apiBaseUrl, OTHER);
  assert.equal(h.state.token, otherToken);
  assert.equal(hook.read().status, 'logged-in');
  assert.equal(h.calls.clears.length, 0);
});
