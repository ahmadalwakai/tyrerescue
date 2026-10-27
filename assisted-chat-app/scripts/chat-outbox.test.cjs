const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

function createOutbox(initial = null) {
  const storage = { value: initial, failWrites: false };
  const AsyncStorage = {
    getItem: async () => storage.value,
    setItem: async (_key, value) => { if (storage.failWrites) throw new Error('disk full'); storage.value = value; },
  };
  const outbox = loadSource('lib/chat-outbox.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: AsyncStorage } });
  return { outbox, storage };
}
const ids = (items) => Array.from(items, (item) => item.id);

test('failed messages persist per conversation and survive a relaunch', async () => {
  const { outbox, storage } = createOutbox();
  await outbox.saveToOutbox('c1', { id: 'm1', body: 'one', createdAt: '2026-10-26T01:00:00Z' });
  await outbox.saveToOutbox('c1', { id: 'm2', body: 'two', createdAt: '2026-10-26T01:01:00Z' });
  await outbox.saveToOutbox('c2', { id: 'm3', body: 'other', createdAt: '2026-10-26T01:02:00Z' });
  const relaunched = createOutbox(storage.value).outbox;
  assert.deepEqual(ids(await relaunched.loadOutbox('c1')), ['m1', 'm2']);
  assert.deepEqual(ids(await relaunched.loadOutbox('c2')), ['m3']);
});

test('saving the same message again replaces it and removal deletes only that message', async () => {
  const { outbox } = createOutbox();
  await outbox.saveToOutbox('c1', { id: 'm1', body: 'one', createdAt: 'a' });
  await outbox.saveToOutbox('c1', { id: 'm1', body: 'one', createdAt: 'a' });
  await outbox.saveToOutbox('c1', { id: 'm2', body: 'two', createdAt: 'b' });
  await outbox.removeFromOutbox('c1', 'm1');
  assert.deepEqual(ids(await outbox.loadOutbox('c1')), ['m2']);
});

test('corrupt or unwritable storage never throws', async () => {
  const { outbox, storage } = createOutbox('{not json');
  assert.deepEqual(ids(await outbox.loadOutbox('c1')), []);
  storage.failWrites = true;
  await outbox.saveToOutbox('c1', { id: 'm1', body: 'one', createdAt: 'a' });
  // Malformed entries are dropped, valid ones kept.
  const mixed = createOutbox(JSON.stringify({ c1: [{ id: 'ok', body: 'b', createdAt: 'c' }, { id: 5 }] })).outbox;
  assert.deepEqual(ids(await mixed.loadOutbox('c1')), ['ok']);
});
