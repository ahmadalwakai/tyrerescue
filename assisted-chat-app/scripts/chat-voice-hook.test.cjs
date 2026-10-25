const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');
function harness() {
  const state = { apiRevision: 1, sessionRevision: 1, token: 'isolated-session', foreground: 'active', controllers: [] };
  let cursor = 0;
  const slots = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => value === b[index]);
  const effect = (callback, dependencies) => {
    const index = cursor++; const previous = slots[index];
    if (same(previous?.dependencies, dependencies)) return;
    previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() };
  };
  const react = {
    useState: (initial) => { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value, (next) => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
    useRef: (initial) => { const index = cursor++; slots[index] ??= { value: { current: initial } }; return slots[index].value; },
    useCallback: (callback, dependencies) => { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { value: callback, dependencies }; return slots[index].value; },
    useEffect: effect, useLayoutEffect: effect,
  };
  let appStateListener;
  const { useChatVoiceRecorder } = loadSource('hooks/useChatVoiceRecorder.ts', {
    react,
    'react-native': { AppState: { get currentState() { return state.foreground; }, addEventListener: (_, listener) => { appStateListener = listener; return { remove: () => { appStateListener = null; } }; } } },
    './useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    '@/lib/api': { getApiContextRevision: () => state.apiRevision, getAdminToken: () => state.token },
    '@/lib/chat-voice': { createChatVoiceRecorder: (isCurrent, onState) => {
      const controller = { isCurrent, starts: 0, cancels: 0, disposed: false, state: { phase: 'idle', durationMillis: 0 } };
      controller.start = async () => { controller.starts += 1; controller.state = { phase: 'recording', durationMillis: 1000 }; onState(controller.state); };
      controller.finish = async () => 'file:///isolated.m4a';
      controller.cancel = async () => { controller.cancels += 1; controller.state = { phase: 'idle', durationMillis: 0 }; if (isCurrent()) onState(controller.state); };
      controller.getState = () => controller.state;
      controller.dispose = async () => { controller.disposed = true; await controller.cancel(); };
      state.controllers.push(controller); return controller;
    } },
  });
  return {
    state,
    render(options = { visible: true, conversationId: 'one', scopeKey: 'project-one' }) { cursor = 0; return useChatVoiceRecorder(options); },
    foreground(next) { state.foreground = next; appStateListener(next); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}
test('voice hook starts no native recording when mounted, creates no controller when hidden', async () => {
  const h = harness(); h.render({ visible: false, conversationId: null, scopeKey: 'one' }); assert.equal(h.state.controllers.length, 0);
  const voice = h.render(); assert.equal(h.state.controllers.length, 1); assert.equal(h.state.controllers[0].starts, 0);
  await voice.start(); assert.equal(h.state.controllers[0].starts, 1); h.unmount();
});
test('transient iOS inactive permission sheet does not cancel; real background cancels and resets the composer', async () => {
  const h = harness(); const voice = h.render(); await voice.start(); h.render(); const controller = h.state.controllers[0];
  h.foreground('inactive'); assert.equal(controller.cancels, 0); assert.equal(controller.isCurrent(), true);
  h.foreground('background'); assert.equal(controller.cancels, 1); assert.equal(controller.isCurrent(), false); assert.equal(h.render().state.phase, 'idle'); h.unmount();
});
test('changing conversation disposes the previous recorder and returns an idle composer', async () => {
  const h = harness(); const voice = h.render(); await voice.start(); h.render(); const previous = h.state.controllers[0];
  const next = h.render({ visible: true, conversationId: 'two', scopeKey: 'project-one' });
  assert.equal(previous.disposed, true); assert.equal(previous.isCurrent(), false); assert.equal(next.state.phase, 'idle'); assert.equal(h.state.controllers.length, 2); h.unmount();
});
test('logout/session and project context changes invalidate pending recorder work before React renders', async () => {
  for (const key of ['apiRevision', 'sessionRevision', 'token']) {
    const h = harness(); h.render(); const previous = h.state.controllers[0];
    h.state[key] = key === 'token' ? 'different-isolated-session' : 2; assert.equal(previous.isCurrent(), false); h.unmount();
  }
});
test('closing/unmounting releases the active recorder and stable handlers cannot target a disposed scope', async () => {
  const h = harness(); const voice = h.render(); await voice.start(); const controller = h.state.controllers[0];
  h.render({ visible: false, conversationId: 'one', scopeKey: 'project-one' }); assert.equal(controller.disposed, true); assert.equal(controller.isCurrent(), false);
  await voice.start(); assert.equal(controller.starts, 1); h.unmount();
});
test('closing and reopening the same conversation cannot resurrect its previous recording composer', async () => {
  const h = harness(); const voice = h.render(); await voice.start(); assert.equal(h.render().state.phase, 'recording');
  h.render({ visible: false, conversationId: 'one', scopeKey: 'project-one' });
  assert.equal(h.render().state.phase, 'idle'); assert.equal(h.render().state.phase, 'idle'); h.unmount();
});
