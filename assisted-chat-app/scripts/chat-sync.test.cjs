const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

const sync = loadSource('lib/chat-sync.ts', {});
const at = (minute) => `2026-10-26T10:${String(minute).padStart(2, '0')}:00.000Z`;
const msg = (id, minute, extra = {}) => ({ id, createdAt: at(minute), ...extra });
// The module runs in its own VM realm: copy results into this realm before deepEqual.
const ids = (list) => Array.from(list, (item) => item.id);

test('client message IDs are RFC 4122 v4 and unique', () => {
  const ids = new Set(Array.from({ length: 500 }, () => sync.createClientMessageId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('server copies replace local sends and keep server order; pending sends stay last', () => {
  const shown = [msg('b', 2), msg('local-1', 9, { localState: 'sending' }), msg('a', 1)];
  const merged = sync.mergeMessages(shown, [msg('c', 3), msg('local-1', 4)]);
  assert.deepEqual(ids(merged), ['a', 'b', 'c', 'local-1']);
  assert.equal(merged[3].localState, undefined);
  const stillPending = sync.mergeMessages([msg('a', 1), msg('p', 9, { localState: 'failed' })], [msg('b', 2)]);
  assert.deepEqual(Array.from(stillPending, (m) => [m.id, m.localState]), [['a', undefined], ['b', undefined], ['p', 'failed']]);
});

test('a partial latest page never drops older loaded messages and ties sort by ID', () => {
  const older = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
  const merged = sync.mergeMessages(older, [msg('m3', 3, { body: 'edited' }), msg('m5', 5), msg('m4', 5)]);
  assert.deepEqual(ids(merged), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.equal(merged[2].body, 'edited');
});

test('the read marker only points at server-confirmed messages', () => {
  assert.equal(sync.newestServerMessageId([msg('a', 1), msg('b', 2), msg('x', 3, { localState: 'sending' })]), 'b');
  assert.equal(sync.newestServerMessageId([msg('x', 3, { localState: 'failed' })]), null);
});

test('refreshing the first inbox page keeps older loaded pages without duplicates', () => {
  const conv = (id, minute) => ({ id, lastActivityAt: at(minute), lastMessageAt: at(minute), createdAt: at(0) });
  const loaded = [conv('a', 9), conv('b', 8), conv('c', 7), conv('d', 6), conv('e', 5)];
  // 'd' got a new message and moved to the top; the first page is now d, a.
  const refreshed = sync.mergeConversationPages(loaded, [conv('d', 10), conv('a', 9)], false);
  assert.deepEqual(ids(refreshed), ['d', 'a', 'b', 'c', 'e']);
  assert.deepEqual(ids(sync.mergeConversationPages(loaded, [conv('a', 9)], true)), ['a']);
  assert.deepEqual(ids(sync.appendConversationPage([conv('a', 9)], [conv('a', 9), conv('z', 1)])), ['a', 'z']);
});
