const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, deferred, settle } = require('./chat-modals.test.cjs');

function harness(enabled = true) {
  const state = { enabled, token: 'isolated-session', revision: 1, apiRevision: 1, requests: [] };
  const slots = [];
  let cursor = 0;
  let effects = [];
  const changed = (before, next) => !before || next.some((item, index) => item !== before[index]);
  const react = {
    useState(initial) {
      const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (next) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(create, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) slots[index] = { value: create(), deps };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const hook = loadSource('hooks/useDriverList.ts', {
    react,
    '@/lib/api': {
      api: { get: () => { const request = deferred(); state.requests.push(request); return request.promise; } },
      ApiError: Error, getAdminToken: () => state.token, getApiContextRevision: () => state.apiRevision,
    },
    './useAdminSession': { getAdminSessionRevision: () => state.revision },
  });
  return {
    state,
    read() { cursor = 0; effects = []; const value = hook.useDriverList(state.enabled); effects.forEach((effect) => effect()); return value; },
    unmount() { slots.forEach((slot) => slot.cleanup?.()); },
  };
}

test('retained driver directory loads only while enabled and reloads after reopening', async () => {
  const h = harness(false); h.read(); assert.equal(h.state.requests.length, 0);
  h.state.enabled = true; h.read(); assert.equal(h.state.requests.length, 1);
  h.state.requests[0].resolve([{ id: 'driver-1', name: 'First driver' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'driver-1');
  h.state.enabled = false; assert.equal(h.read().drivers.length, 0);
  h.state.enabled = true; h.read(); assert.equal(h.state.requests.length, 2);
  h.state.requests[1].resolve([{ id: 'driver-2', name: 'Updated driver' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'driver-2'); h.unmount();
});

test('project switch hides the old roster immediately and rejects its late response without closing chat', async () => {
  const h = harness(); h.read(); const old = h.state.requests[0];
  h.state.apiRevision += 1; assert.equal(h.read().drivers.length, 0);
  h.state.requests[1].resolve([{ id: 'new-project-driver' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'new-project-driver');
  old.resolve([{ id: 'private-old-project-driver' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'new-project-driver'); h.unmount();
});

test('closing invalidates the in-flight directory request before reopening', async () => {
  const h = harness(); h.read();
  h.state.enabled = false; h.read(); h.state.requests[0].resolve([{ id: 'closed-request' }]); await settle();
  assert.equal(h.read().drivers.length, 0);
  h.state.enabled = true; h.read(); h.state.requests[1].resolve([{ id: 'reopened-request' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'reopened-request'); h.unmount();
});

test('the latest manual reload wins when directory responses arrive out of order', async () => {
  const h = harness(); h.read(); h.read().reload();
  h.state.requests[1].resolve([{ id: 'fresh-driver' }]); await settle();
  h.state.requests[0].resolve([{ id: 'outdated-driver' }]); await settle();
  assert.equal(h.read().drivers[0].id, 'fresh-driver'); h.unmount();
});
