const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

const safety = loadSource('lib/notification-safety.ts', {});
const id = '2b9f1c3e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const plain = (value) => (value ? { ...value } : value);

test('each chat notification type opens only its own kind of thread', () => {
  assert.deepEqual(plain(safety.parseChatNotificationOpenRequest({ type: 'chat_message', conversationId: id })), { conversationId: id, channel: 'customer_admin' });
  assert.deepEqual(plain(safety.parseChatNotificationOpenRequest({ type: 'driver_chat_message', conversationId: id })), { conversationId: id, channel: 'admin_driver' });
});

test('unknown types and malformed IDs open nothing', () => {
  assert.equal(safety.parseChatNotificationOpenRequest({ type: 'customer_chat_message', conversationId: id }), null);
  assert.equal(safety.parseChatNotificationOpenRequest({ type: 'driver_chat_message', conversationId: '../admin' }), null);
  assert.equal(safety.parseChatNotificationOpenRequest(null), null);
  // The older customer-only parser keeps its contract.
  assert.equal(safety.parseCustomerChatNotificationOpenRequest({ type: 'driver_chat_message', conversationId: id }), null);
});
