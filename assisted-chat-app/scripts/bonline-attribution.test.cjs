const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/hooks/useBonlineCallAttribution.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness() {
  const state = { token: 'one', apiRevision: 1, sessionRevision: 1, calls: [], timers: [], error: null, effect: null, post: async () => ({ linked: true }) };
  const ref = { current: new Set() };
  class ApiError extends Error { constructor(status) { super('request failed'); this.status = status; } }
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports,
    setTimeout(callback) { state.timers.push(callback); return state.timers.length; }, clearTimeout() {},
    require(name) {
      if (name === 'react') return { useState: () => [null, (value) => { state.error = value; }], useRef: () => ref, useEffect: (effect) => { state.effect = effect; } };
      if (name === '@/lib/api') return { ApiError, getAdminToken: () => state.token, getApiContextRevision: () => state.apiRevision,
        api: { get hasAdminToken() { return Boolean(state.token); }, post: (url, body) => { state.calls.push({ url, body }); return state.post(); } } };
      if (name === '@/hooks/useAdminSession') return { getAdminSessionRevision: () => state.sessionRevision };
      if (name === '@/lib/money') return { normalizePhoneForWhatsApp: (phone) => phone.replace(/\D/g, '').replace(/^0/, '44') };
      throw new Error(name);
    },
  }, { filename });
  const draft = { customer: { phone: '+447700900123' }, savedQuoteId: 'quote-1', dispatchedBookingId: null,
    incomingCallSource: { ledgerId: 'a'.repeat(64), phone: '+447700900123', scope: 'tyrerescue:1:1' } };
  function render(value = draft, scope = 'tyrerescue:1:1', enabled = true) {
    module.exports.useBonlineCallAttribution(value, scope, enabled);
    return state.effect();
  }
  return { state, draft, render, ApiError };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('links only the call that supplied the number and enriches it with the final booking', async () => {
  const h = harness(); h.render(); await flush();
  assert.equal(h.state.calls.length, 1);
  assert.equal(h.state.calls[0].url, `/api/mobile/admin/phone/calls/${'a'.repeat(64)}/link`);
  assert.equal(h.state.calls[0].body.quoteId, 'quote-1');
  h.render(); await flush(); assert.equal(h.state.calls.length, 1);
  h.render({ ...h.draft, dispatchedBookingId: 'booking-1' }); await flush();
  assert.equal(h.state.calls[1].body.bookingId, 'booking-1');
});
test('refuses another phone, workspace, missing provenance or unsaved draft', async () => {
  const h = harness();
  h.render({ ...h.draft, customer: { phone: '+447700900999' } });
  h.render(h.draft, 'another-workspace:2:1');
  h.render({ ...h.draft, incomingCallSource: null });
  h.render({ ...h.draft, savedQuoteId: null });
  h.render(h.draft, 'tyrerescue:1:1', false);
  await flush(); assert.equal(h.state.calls.length, 0);
});
test('retries transient failures with the same link, then exposes failure for manual recovery', async () => {
  const h = harness(); h.state.post = async () => { throw new h.ApiError(503); };
  h.render(); await flush();
  h.state.timers.shift()(); await flush(); h.state.timers.shift()(); await flush();
  assert.equal(h.state.calls.length, 3); assert.match(h.state.error, /link it from bOnline Calls/);
  assert.equal(new Set(h.state.calls.map((call) => call.url)).size, 1);
});
test('never retries a conflict, and cancels stale-session retries', async () => {
  const conflict = harness(); conflict.state.post = async () => { throw new conflict.ApiError(409); };
  conflict.render(); await flush(); assert.equal(conflict.state.timers.length, 0);
  const stale = harness(); stale.state.post = async () => { throw new stale.ApiError(503); };
  stale.render(); await flush(); stale.state.sessionRevision += 1;
  stale.state.timers.shift()(); await flush(); assert.equal(stale.state.calls.length, 1);
});
test('ignores a late failure after unmount or account change', async () => {
  const h = harness(); let reject;
  h.state.post = () => new Promise((_, fail) => { reject = fail; });
  const cleanup = h.render(); cleanup(); reject(new h.ApiError(503)); await flush();
  assert.equal(h.state.error, null); assert.equal(h.state.timers.length, 0);
});
