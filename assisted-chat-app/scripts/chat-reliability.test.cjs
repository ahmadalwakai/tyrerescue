const assert = require('node:assert/strict');
const test = require('node:test');
const { createChatHarness, deferred, message, settle } = require('./chat-modals.test.cjs');

async function open(kind, configure) {
  const h = createChatHarness(kind);
  const id = kind === 'hub' ? 'direct-one' : 'one';
  const latest = `/api/chat/conversations/${id}/messages?limit=${kind === 'hub' ? 60 : 50}`;
  configure?.(h, latest);
  h.read(); await settle();
  if (kind === 'hub') { h.press('Chat with Hassan'); await settle(); }
  h.read();
  return { h, id, latest, sends: () => h.state.posts.filter((call) => call.url.endsWith('/messages')) };
}

test('hub preserves the rich inbox and remembers its customer filter across the driver entry point', async () => {
  const h = createChatHarness(); h.state.entryMode = 'all'; h.read(); await settle();
  const tab = (name) => h.find((node) => node.props.accessibilityRole === 'tab' && JSON.stringify(node.props.children).includes(`"${name}"`));
  assert.ok(tab('All')); assert.ok(tab('Closed'));
  tab('Customers').props.onPress(); h.read(); await settle();
  assert.ok(tab('Customers').props.accessibilityState.selected);
  assert.ok(h.state.gets.some((url) => url.includes('box=customers')));
  h.state.visible = false; h.read(); h.state.visible = true; h.state.entryMode = 'drivers'; h.read(); await settle();
  h.state.visible = false; h.read(); h.state.visible = true; h.state.entryMode = 'all'; h.read(); await settle();
  assert.ok(tab('Customers').props.accessibilityState.selected);
  assert.ok(h.state.gets.at(-1).includes('box=customers'));
  h.unmount();
});

for (const kind of ['hub', 'driver']) {
  test(`${kind}: response loss and retry keep one text ID, while a later message gets a fresh ID`, async () => {
    const { h, id, sends } = await open(kind);
    const url = `/api/chat/conversations/${id}/messages`;
    h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('Hello');
    h.state.handlers[url] = async () => { throw new Error('Response lost after server saved message'); };
    h.press('Send'); await settle();
    const first = sends()[0].body;
    assert.match(first.clientMessageId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    h.state.handlers[url] = async (body) => message(body.clientMessageId, body.body, 'admin');
    h.press(kind === 'hub' ? 'Message not sent. Double tap to try again.' : 'Send'); await settle();
    assert.deepEqual(sends()[1].body, first);
    h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('Hello');
    h.press('Send'); await settle();
    assert.notEqual(sends()[2].body.clientMessageId, first.clientMessageId);
    h.unmount();
  });

  test(`${kind}: a changed failed draft has a new ID`, async () => {
    const { h, id, sends } = await open(kind);
    h.state.handlers[`/api/chat/conversations/${id}/messages`] = async () => { throw new Error('Offline'); };
    h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('First');
    h.press('Send'); await settle();
    h.find((node) => node.props.accessibilityLabel === 'Message text').props.onChangeText('Edited');
    h.press('Send'); await settle();
    assert.notEqual(sends()[0].body.clientMessageId, sends()[1].body.clientMessageId);
    h.unmount();
  });

  test(`${kind}: a voice retry reuses its uploaded attachment and full message payload`, async () => {
    const { h, id, sends } = await open(kind);
    const url = `/api/chat/conversations/${id}/messages`;
    h.press('Record voice message'); await settle();
    h.state.handlers[url] = async () => { throw new Error('Lost acknowledgment'); };
    h.press('Send voice'); await settle();
    assert.equal(h.state.recordingState.phase, 'ready');
    h.state.handlers[url] = async (body) => message(body.clientMessageId, null, 'admin');
    h.press('Send voice'); await settle();
    assert.equal(h.state.voiceUploads.length, 1);
    assert.deepEqual(sends()[1].body, sends()[0].body);
    assert.equal(h.state.recordingState.phase, 'idle');
    h.unmount();
  });

  test(`${kind}: photo retry is available without reopening the picker and reuses upload and ID`, async () => {
    const { h, id, sends } = await open(kind);
    const url = `/api/chat/conversations/${id}/messages`;
    h.state.picker = deferred();
    h.state.handlers[url] = async () => { throw new Error('Lost acknowledgment'); };
    h.press('Send image'); await settle();
    h.state.picker.resolve({ canceled: false, assets: [{ uri: 'file:///one-photo.jpg' }] }); await settle();
    assert.ok(h.find((node) => node.props.label === 'Retry photo'));
    h.state.handlers[url] = async (body) => message(body.clientMessageId, null, 'admin');
    h.press('Retry photo'); await settle();
    assert.equal(h.state.uploads.length, 1);
    assert.deepEqual(sends()[1].body, sends()[0].body);
    assert.equal(h.find((node) => node.props.label === 'Retry photo'), undefined);
    h.unmount();
  });

  test(`${kind}: older pages remain visible after polling, use the next older cursor, and never trigger a sound`, async () => {
    const { h, latest } = await open(kind, (h, latest) => {
      h.state.handlers[latest] = async () => ({ messages: [message('recent')], nextCursor: 'older-page-one' });
      h.state.handlers[`${latest}&cursor=older-page-one`] = async () => ({ messages: [message('older-one')], nextCursor: 'older-page-two' });
      h.state.handlers[`${latest}&cursor=older-page-two`] = async () => ({ messages: [message('oldest')], nextCursor: null });
    });
    h.press(kind === 'hub' ? 'Load earlier messages' : 'Load older messages'); await settle();
    assert.match(JSON.stringify(h.read()), /older-one/);
    h.state.handlers[latest] = async () => ({ messages: [message('recent'), message('fresh')], nextCursor: 'older-page-one' });
    h.state.timers.at(-1)(); await settle();
    assert.match(JSON.stringify(h.read()), /older-one/);
    h.press(kind === 'hub' ? 'Load earlier messages' : 'Load older messages'); await settle();
    assert.ok(h.state.gets.includes(`${latest}&cursor=older-page-two`));
    assert.match(JSON.stringify(h.read()), /oldest/);
    assert.equal(h.find((node) => node.props.label === 'Load older messages' || node.props.accessibilityLabel === 'Load earlier messages'), undefined);
    assert.ok(h.state.observed.every((entry) => entry.messages.every((item) => item.id !== 'older-one' && item.id !== 'oldest')));
    assert.equal(h.state.sounds, 0);
    h.unmount();
  });

  test(`${kind}: polling bridges more than one new page instead of leaving a history gap`, async () => {
    const { h, latest } = await open(kind, (h, latest) => {
      h.state.handlers[latest] = async () => ({ messages: [message('known')], nextCursor: null });
    });
    h.state.handlers[latest] = async () => ({ messages: [message('newest')], nextCursor: 'gap' });
    h.state.handlers[`${latest}&cursor=gap`] = async () => ({ messages: [message('known'), message('between-pages')], nextCursor: null });
    h.state.timers.at(-1)(); await settle();
    assert.match(JSON.stringify(h.read()), /between-pages/);
    assert.match(JSON.stringify(h.read()), /newest/);
    h.unmount();
  });

  test(`${kind}: late historical page cannot enter a different account or closed chat`, async () => {
    const pending = deferred();
    const { h } = await open(kind, (h, latest) => {
      h.state.handlers[latest] = async () => ({ messages: [message('recent')], nextCursor: 'older' });
      h.state.handlers[`${latest}&cursor=older`] = () => pending.promise;
    });
    h.press(kind === 'hub' ? 'Load earlier messages' : 'Load older messages'); await settle();
    h.state.visible = false; h.state.apiRevision += 1; h.read();
    pending.resolve({ messages: [message('private-old-page')], nextCursor: null }); await settle();
    assert.doesNotMatch(JSON.stringify(h.read()), /private-old-page/);
    h.unmount();
  });

  test(`${kind}: bridging a polling gap retains the newest peer read receipt`, async () => {
    const known = message('known');
    const newest = { ...message('newest', 'Latest reply', 'admin'), createdAt: '2026-10-22T12:03:00Z' };
    const { h, id, latest } = await open(kind, (h, latest) => {
      h.state.handlers[latest] = async () => ({ messages: [known], nextCursor: null });
    });
    h.state.handlers[latest] = async () => ({ messages: [newest], nextCursor: 'receipt-gap', peerReadUpTo: { id: newest.id, createdAt: newest.createdAt } });
    h.state.handlers[`${latest}&cursor=receipt-gap`] = async () => ({ messages: [known], nextCursor: null, peerReadUpTo: { id: known.id, createdAt: known.createdAt } });
    h.state.timers.at(-1)(); await settle();
    assert.match(JSON.stringify(h.read()), /· Read/);
    assert.equal(h.state.posts.filter((call) => call.url === `/api/chat/conversations/${id}/read`).at(-1).body.lastReadMessageId, newest.id);
    h.unmount();
  });
}
