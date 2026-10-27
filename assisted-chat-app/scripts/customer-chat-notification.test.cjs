const assert = require('node:assert/strict');
const test = require('node:test');
const { createChatHarness, deferred, settle } = require('./chat-modals.test.cjs');

const id = '10000000-0000-4000-8000-000000000001';
const detail = { id, bookingId: 'booking-guest', bookingRef: 'TYR-GUEST', channel: 'customer_admin', status: 'open', locked: false, muted: false };

test('admin notification fetches the authorized customer thread and opens its message history', async () => {
  const h = createChatHarness();
  h.state.initialConversationId = id;
  h.state.handlers[`/api/chat/conversations/${id}`] = async () => detail;
  h.read(); await settle(); h.read(); await settle();
  assert.ok(h.state.gets.includes(`/api/chat/conversations/${id}`));
  assert.match(JSON.stringify(h.read()), /initial-10000000-0000-4000-8000-000000000001/);
  assert.ok(h.find((node) => node.type === 'ChatScreenLayout').props.onBack);
  h.unmount();
});

test('an old customer notification response cannot open after account, project or visibility changes', async () => {
  for (const change of ['account', 'project', 'close']) {
    const h = createChatHarness();
    const pending = deferred();
    h.state.initialConversationId = id;
    h.state.handlers[`/api/chat/conversations/${id}`] = () => pending.promise;
    h.read(); await settle();
    if (change === 'account') { h.state.token = 'different-isolated-session'; h.state.revision += 1; }
    if (change === 'project') h.state.apiRevision += 1;
    if (change === 'close') h.state.visible = false;
    h.read();
    pending.resolve(detail); await settle();
    assert.doesNotMatch(JSON.stringify(h.read()), /initial-10000000-0000-4000-8000-000000000001/);
    assert.equal(h.find((node) => node.type === 'ChatScreenLayout').props.onBack, undefined);
    h.unmount();
  }
});

test('customer notification cannot redirect into a private driver channel', async () => {
  const h = createChatHarness();
  h.state.initialConversationId = id;
  h.state.handlers[`/api/chat/conversations/${id}`] = async () => ({ ...detail, channel: 'admin_driver' });
  h.read(); await settle();
  assert.equal(h.find((node) => node.type === 'ChatScreenLayout').props.onBack, undefined);
  assert.ok(!h.state.gets.some((url) => url.includes(`${id}/messages`)));
  h.unmount();
});
