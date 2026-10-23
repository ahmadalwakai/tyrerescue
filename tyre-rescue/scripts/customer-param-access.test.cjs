const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

test('booking route proofs expire with logout scope and require a newly received link', () => {
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useState(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, (value) => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useEffect(effect, deps) { const index = cursor++; const previous = hooks[index];
      if (!previous || deps.some((value, offset) => value !== previous.deps[offset])) effects.push(() => { hooks[index] = { deps }; effect(); }); },
  };
  const { useBookingParamAccess } = loadSource('../../tyre-rescue/src/use-booking-param-access.ts', { react });
  function render(value, revision) { cursor = 0; effects = []; const result = useBookingParamAccess(value, revision); for (const effect of effects) effect(); return { value: result.value, invalidated: result.invalidated }; }
  assert.deepEqual(render('old-private-proof', 0), { value: 'old-private-proof', invalidated: false });
  assert.deepEqual(render('old-private-proof', 1), { value: '', invalidated: true });
  assert.deepEqual(render('old-private-proof', 1), { value: '', invalidated: true });
  assert.deepEqual(render('new-private-proof', 1), { value: '', invalidated: false });
  assert.deepEqual(render('new-private-proof', 1), { value: 'new-private-proof', invalidated: false });
});
