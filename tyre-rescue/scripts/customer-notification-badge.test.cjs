const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');
const moduleSource = loadSource('../../tyre-rescue/src/customer-notification-badge.ts', {});
const { createCustomerNotificationBadge, subscribeCustomerNotificationBadgeRefresh, requestCustomerNotificationBadgeRefresh } = moduleSource;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness() {
  const state = { requests: [], writes: [], proofs: [], request: async () => 3, write: async () => {} };
  const badge = createCustomerNotificationBadge({
    requestCount: async (headers, ref) => { state.requests.push({ headers: { ...headers }, ref }); return state.request(headers, ref); },
    listBookingAccess: async () => state.proofs,
    setBadgeCountAsync: async count => { await state.write(count); state.writes.push(count); },
  });
  return { state, badge };
}
test('authenticated refresh only requests the account total without local guest proofs', async () => {
  const { state, badge } = harness();
  state.proofs = [{ refNumber: 'TR-OTHER', bookingAccessToken: 'other-proof' }];
  await badge.setSession({ token: 'session-a', revision: 1 });
  assert.equal(await badge.refresh(), true);
  assert.deepEqual(state.requests, [{ headers: { Authorization: 'Bearer session-a' }, ref: undefined }]);
  assert.deepEqual(state.writes, [3]);
});
test('guest refresh deduplicates exact references and sums all authorised booking counts', async () => {
  const { state, badge } = harness();
  state.proofs = [{ refNumber: 'TR-A', bookingAccessToken: 'old' }, { refNumber: 'tr-a', bookingAccessToken: 'latest' }, { refNumber: 'TR-B', bookingAccessToken: 'proof-b' }];
  state.request = async (_headers, ref) => ref === 'TR-A' ? 2 : 5;
  await badge.setSession({ token: null, revision: 1 }); await badge.refresh();
  assert.equal(state.requests.length, 2);
  assert.deepEqual(state.requests[0], { headers: { 'X-Booking-Access': 'latest' }, ref: 'TR-A' });
  assert.deepEqual(state.writes, [7]);
});
test('offline and partially failed guest refreshes preserve the last known same-scope total', async () => {
  const { state, badge } = harness();
  await badge.setSession({ token: null, revision: 1 });
  state.proofs = [{ refNumber: 'TR-A', bookingAccessToken: 'a' }, { refNumber: 'TR-B', bookingAccessToken: 'b' }];
  await badge.refresh();
  state.request = async (_headers, ref) => { if (ref === 'TR-B') throw new Error('offline'); return 0; };
  assert.equal(await badge.refresh(), false);
  assert.deepEqual(state.writes, [6]);
});
test('a stale same-account response cannot overwrite a newer refresh', async () => {
  const { state, badge } = harness(); const pending = deferred(); let calls = 0;
  state.request = async () => ++calls === 1 ? pending.promise : 1;
  await badge.setSession({ token: 'a', revision: 1 });
  const first = badge.refresh(); await badge.refresh(); pending.resolve(8); await first;
  assert.deepEqual(state.writes, [1]);
});
test('session changes invalidate pending results and serialize clearing after an in-flight native write', async () => {
  const { state, badge } = harness(); const nativeWrite = deferred();
  state.write = async count => { if (count === 3) await nativeWrite.promise; };
  await badge.setSession({ token: 'a', revision: 1 }); const first = badge.refresh(); await settle();
  const changed = badge.setSession({ token: 'b', revision: 2 });
  state.request = async () => 2; const second = badge.refresh();
  nativeWrite.resolve(); await Promise.all([first, changed, second]);
  assert.deepEqual(state.writes, [3, 0, 2]);
});
test('clearing invalidates a pending network response and never reapplies its previous account count', async () => {
  const { state, badge } = harness(); const pending = deferred(); state.request = () => pending.promise;
  await badge.setSession({ token: 'a', revision: 1 }); const first = badge.refresh();
  await badge.clear(); pending.resolve(9); await first;
  assert.deepEqual(state.writes, [0]); assert.equal(await badge.refresh(), false);
});
test('a new session following immediate cleanup still clears even when its refresh is offline', async () => {
  const { state, badge } = harness();
  await badge.setSession({ token: 'a', revision: 1 }); await badge.refresh();
  const cleared = badge.clear(); const changed = badge.setSession({ token: 'b', revision: 2 });
  state.request = async () => { throw new Error('offline'); };
  await Promise.all([cleared, changed, badge.refresh()]);
  assert.deepEqual(state.writes, [3, 0]);
});
test('invalid server counts are not converted into an incorrect zero badge', async () => {
  const { state, badge } = harness(); await badge.setSession({ token: 'a', revision: 1 });
  for (const value of [NaN, -1, 1.5, '3']) { state.request = async () => value; assert.equal(await badge.refresh(), false); }
  assert.deepEqual(state.writes, []);
});
test('read acknowledgments notify active refresh listeners and unsubscribe on cleanup', () => {
  let calls = 0; const unsubscribe = subscribeCustomerNotificationBadgeRefresh(() => calls++);
  requestCustomerNotificationBadgeRefresh(); unsubscribe(); requestCustomerNotificationBadgeRefresh();
  assert.equal(calls, 1);
});
